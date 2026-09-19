/**
 * src/pages/PromotionDetail.tsx
 *
 * Promotion Detail — v1, read-only. Represents the EXECUTION layer (what
 * got promoted, by whom, to whom, via which Assignment), distinct from
 * the Assignment (collaboration relationship) layer. No edit, no delete,
 * no status change, no archive — display-only, same restraint as
 * AssetDetail.tsx's original MVP pass.
 *
 * Data comes from getPromotionDetail.ts, which only reads existing
 * relationships (promotions / promotion_assets / assignments /
 * assignment_collaborators / profiles) and reuses getAssetDetail.ts for
 * asset resolution rather than introducing a third asset display
 * resolver alongside getAssetDetail.ts and getAssignmentDetail.ts.
 *
 * ACCESS: this page does not check "is this user the Sponsor or the
 * Collaborator" itself — it simply calls getPromotionDetail(id) and
 * renders whatever comes back. Existing Supabase RLS on
 * promotions/promotion_assets/assignments/assignment_collaborators
 * already determines whether the calling user can see this data; if RLS
 * currently only allows owner_user_id and not the assignment
 * collaborator, that's a policy gap to fix separately (out of scope
 * here — no new permission logic was added).
 *
 * Thumbnail/type resolution per promoted asset is lifted verbatim from
 * AssetDetail.tsx's own thumbnailSrc/typeLabel logic, applied to each
 * asset's `resource` (an AssetResourceView, same shape AssetDetail.tsx
 * already renders) — so this page can never drift into a different
 * display format for the same asset kind.
 *
 * PHASE 2A — Remove Collaborator (relocated here from AssignmentDetail.tsx
 * per product lock: Assignment is the onboarding/permission container,
 * Promotion is the long-term operating object). isSponsor (LOCKED) is a
 * direct comparison against assignment.created_by_user_id — the
 * Assignment's creator is the sole party who may remove a collaborator.
 * This is not organization membership and not promotion.owner_user_id
 * (which always resolves to the organization's single owner account,
 * never "whoever created this promotion" — confirmed against
 * create_promotion's implementation, so it carries no signal about who
 * manages this Assignment's collaborators). An earlier version of this
 * check used organization_members; that was a deliberate MVP shortcut,
 * not the locked rule, and has been replaced outright. The Remove
 * button calls the existing removeCollaborator.ts wrapper unchanged and,
 * on success, only updates local component state
 * (collaborator.status = 'removed') — no promotion/asset/assignment
 * mutation happens here.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ArchiveRestore, UserX, UserCheck, ShieldOff, ShieldCheck, Globe, BarChart3 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useTutorial } from '../lib/tutorial-overlay';
import { promotionTutorial } from '../lib/tutorials/promotionTutorial';
import {
  getPromotionDetail,
  type PromotionDetailData,
} from '../services/promotion/getPromotionDetail';
import {
  restorePromotionForUser,
} from '../services/promotion/promotionArchive';
import {
  getPromotionArchiveContext,
  type PromotionArchiveLevel,
} from '../services/promotion/getPromotionArchiveContext';
import {
  hidePromotionForUser,
  unhidePromotionForUser,
} from '../services/promotion/archiveUiVisibility';
import {
  getPromotionAssetArchiveImpact,
  type PromotionArchiveImpact,
} from '../services/promotion/getPromotionAssetArchiveImpact';
import { removeCollaborator } from '../services/assignment/removeCollaborator';
import { restoreCollaborator } from '../services/assignment/restoreCollaborator';
import { revokeAssetAccess, restoreAssetAccess } from '../services/assignment/assignmentAssetAccess';
import { listVerifiedBrandedDomains, type VerifiedDomainOption } from '../services/domain/brandedDomains';
import { listAssignmentAssetDomainPolicies } from '../services/assignment/updateAssignmentAssetDomainPolicy';
import {
  updateAssignmentCreativeSettings,
  type CreativeCreationMode,
  type AssetScope,
} from '../services/assignment/updateAssignmentCreativeSettings';
import { setAllowCollaboratorDomains } from '../services/promotion/promotionAssetDomainPolicy';
import { addPromotionAsset } from '../services/promotion/addPromotionAsset';
import { removePromotionAsset } from '../services/promotion/removePromotionAsset';
import { PromotedAssetPicker, type PromotedAssetRow } from '../components/PromotedAssetPicker';
import {
  resolveAssetThumbnail,
  resolveElementThumbnail,
  getElementTypeLabel,
  RESOURCE_TYPE_LABELS,
  type ResourceType,
  type CampaignElementType,
} from '../lib/videoFormatters';
import type { AssetResourceView } from '../services/asset/getAssetDetail';

// Verbatim port of AssetDetail.tsx's thumbnailSrc logic, applied to one
// promoted asset's resource. Kept as a standalone function (not imported)
// since AssetDetail.tsx doesn't export it — duplicated intentionally per
// the "small deliberate duplication over premature abstraction"
// convention already used elsewhere in this codebase (see
// getAssetDetail.ts's own DUPLICATION NOTE), not a new resolver.
function resolveThumbnailSrc(resource: AssetResourceView | null): string | null {
  return resource?.origin === 'campaign_element'
    ? resolveElementThumbnail((resource.resourceType ?? 'landing_page') as CampaignElementType)
    : resource?.thumbnailUrl || resource?.resourceType
    ? resolveAssetThumbnail({
        thumbnail_url: resource?.thumbnailUrl ?? null,
        resource_type: resource?.resourceType ?? 'other',
        platform: resource?.platform ?? null,
      })
    : null;
}

// Verbatim port of AssetDetail.tsx's typeLabel logic.
function resolveTypeLabel(resource: AssetResourceView | null): string {
  if (!resource) return 'Asset';
  return resource.origin === 'campaign_element'
    ? getElementTypeLabel((resource.resourceType ?? 'landing_page') as CampaignElementType)
    : resource.resourceType
    ? RESOURCE_TYPE_LABELS[resource.resourceType as ResourceType] ?? resource.resourceType
    : 'Asset';
}

export default function PromotionDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { start: startTutorial } = useTutorial();
  const [detail, setDetail] = useState<PromotionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Archive state — personal to the CURRENT user only (see
  // services/promotion/promotionArchive.ts). Never affects promotion
  // status, promotion_assets, or the other party's view of this same
  // promotion. Archiving itself is a list-page action (Marketplace.tsx);
  // this page only shows the badge and lets the user undo it.
  const [archivedAt, setArchivedAt] = useState<boolean>(false);
  const [archiveLevel, setArchiveLevel] = useState<PromotionArchiveLevel>('normal');
  const [restoring, setRestoring] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [unhiding, setUnhiding] = useState(false);
  const [archiveActionError, setArchiveActionError] = useState<string | null>(null);

  // Surface B — Archive Impact (diagnostic only). Computed by re-using
  // the existing central Asset archive resolver per promoted asset — no
  // second Asset archive calculation is introduced here. Never writes
  // anything, never triggers automatic Remove/Revoke, and is completely
  // independent of archivedAt/archiveLevel above (Surface A).
  const [archiveImpact, setArchiveImpact] = useState<PromotionArchiveImpact | null>(null);

  // Phase 2A — Sponsor-only Remove Collaborator. isSponsor (LOCKED) is
  // a direct comparison against assignment.created_by_user_id, resolved
  // client-side once detail has loaded — no extra network call needed.
  const [isSponsor, setIsSponsor] = useState(false);
  const [removingCollaborator, setRemovingCollaborator] = useState(false);
  const [restoringCollaborator, setRestoringCollaborator] = useState(false);
  const [collaboratorActionError, setCollaboratorActionError] = useState<string | null>(null);

  // Phase 2C — per-asset revoke/restore. Tracked by assetId (not a
  // single boolean) since multiple rows in the Assigned Assets list can
  // each be independently in-flight.
  const [assetActionId, setAssetActionId] = useState<string | null>(null);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);

  // MVP — Promotion-level "Allow collaborator domains" policy (legacy UI, unchanged this phase).
  const [domainPolicyActionId, setDomainPolicyActionId] = useState<string | null>(null);
  const [domainPolicyError, setDomainPolicyError] = useState<string | null>(null);

  // Phase 1 — per-asset Path B capability (assignment_assets) + Promotion×Asset revoke.
  const [sponsorVerifiedDomains, setSponsorVerifiedDomains] = useState<VerifiedDomainOption[]>([]);
  const [pathBByAssetId, setPathBByAssetId] = useState<
    Record<
      string,
      {
        allow_marketer_domain: boolean;
        allow_sponsor_domain: boolean;
        allow_vstrk_domain: boolean;
        selected_sponsor_domain_id: string | null;
        hostname?: string | null;
      }
    >
  >({});
  // Actual Promotion×Asset usage (promotion_assets) — display source of truth
  const [promoUsageByAssetId, setPromoUsageByAssetId] = useState<
    Record<
      string,
      {
        use_marketer_domain: boolean;
        selected_marketer_domain_id: string | null;
        marketer_hostname: string | null;
        selected_sponsor_domain_id: string | null;
        sponsor_hostname: string | null;
        use_vstrk_domain: boolean;
      }
    >
  >({});
  const [pathBActionKey, setPathBActionKey] = useState<string | null>(null);
  const [pathBError, setPathBError] = useState<string | null>(null);
  const [promoAssetRevokeId, setPromoAssetRevokeId] = useState<string | null>(null);
  // Phase 2 — Creative Mode + Asset Scope (draft locally; Save commits)
  const [creativeSettingsBusy, setCreativeSettingsBusy] = useState(false);
  const [creativeSettingsError, setCreativeSettingsError] = useState<string | null>(null);
  const [draftCreativeMode, setDraftCreativeMode] = useState<CreativeCreationMode>(null);
  const [draftAssetScope, setDraftAssetScope] = useState<AssetScope>(null);
  const [creativeDraftReady, setCreativeDraftReady] = useState(false);

  const [promoAssetRevokeError, setPromoAssetRevokeError] = useState<string | null>(null);

  const [isAddAssetPickerOpen, setIsAddAssetPickerOpen] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);
  const [addAssetError, setAddAssetError] = useState<string | null>(null);
  /** Pending Add Asset draft — not saved until Confirm. Existing promotion assets stay untouched. */
  type PendingAddPerm = {
    allowMarketerDomain: boolean;
    allowSponsorDomain: boolean;
    allowVstrkDomain: boolean;
    selectedSponsorDomainId: string | null;
  };
  type PendingAddAsset = {
    assetId: string;
    title: string;
    thumbnail: string | null;
  };
  const DEFAULT_PENDING_PERM: PendingAddPerm = {
    allowMarketerDomain: false,
    allowSponsorDomain: false,
    allowVstrkDomain: false,
    selectedSponsorDomainId: null,
  };
  const [pendingAddAssets, setPendingAddAssets] = useState<PendingAddAsset[]>([]);
  const [pendingAddPerms, setPendingAddPerms] = useState<Map<string, PendingAddPerm>>(new Map());

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPromotionDetail(id);
        // Phase 2 — ensure Assignment creative fields are present (loader may omit them)
        if (data.assignment?.id) {
          const a: any = data.assignment;
          if (
            a.creative_creation_mode === undefined ||
            a.asset_scope === undefined ||
            a.creative_campaign_id === undefined
          ) {
            const { data: asg } = await supabase
              .from('assignments')
              .select('creative_creation_mode, asset_scope, creative_campaign_id')
              .eq('id', data.assignment.id)
              .maybeSingle();
            if (asg) {
              data.assignment = {
                ...data.assignment,
                creative_creation_mode: asg.creative_creation_mode ?? null,
                asset_scope: asg.asset_scope ?? null,
                creative_campaign_id: asg.creative_campaign_id ?? null,
              } as typeof data.assignment;
            }
          }
        }
        if (!data) {
          setError('Promotion not found.');
        } else {
          setDetail(data);

          // Sponsor check (LOCKED): the Assignment's creator only, not
          // organization membership. No network call needed — the
          // comparison runs against data already fetched by
          // getPromotionDetail(). Superseded: an earlier version of this
          // check queried organization_members; that boundary is not the
          // locked product rule and has been replaced, not extended.
          setIsSponsor(!!user && !!data.assignment && user.id === data.assignment.created_by_user_id);
        }
      } catch (err: any) {
        setError(err.message || 'Could not load this promotion.');
      } finally {
        setLoading(false);
      }

  // Independent, non-blocking fetch — same treatment as
      // AssetDetail.tsx's/AssignmentDetail.tsx's archive state: failure
      // here never blocks the rest of the page from rendering. Uses the
      // central Surface A resolver (isArchived + Level 1/Level 2).
      if (user) {
        try {
          const context = await getPromotionArchiveContext(id, user.id);
          setArchivedAt(context.isArchived);
          setArchiveLevel(context.level);
        } catch (err) {
          console.error('[PromotionDetail] getPromotionArchiveContext failed:', err);
        }
      }
    })();
  }, [id, user]);

  // Surface B — Archive Impact. Independent, non-blocking effect; never
  // gates rendering of the rest of the page. Diagnostic-only: does not
  // touch promotion_user_states or archive_ui_visibility, and never
  // triggers automatic Remove/Revoke of anything.
  useEffect(() => {
    if (!user || !detail) return;
    const assetIds = detail.assets.map(a => a.assetId);
    if (assetIds.length === 0) {
      setArchiveImpact({ archivedAssetCount: 0, impacts: [] });
      return;
    }
    getPromotionAssetArchiveImpact(assetIds, user.id)
      .then(setArchiveImpact)
      .catch(err => {
        console.error('[PromotionDetail] getPromotionAssetArchiveImpact failed:', err);
      });
  }, [user, detail]);

  // Phase 1 — assignment_assets allow_* (capability) + promotion_assets usage (actual)
  useEffect(() => {
    if (!detail?.assignment?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const map = await listAssignmentAssetDomainPolicies(detail.assignment!.id);
        if (cancelled) return;
        const obj: typeof pathBByAssetId = {};
        map.forEach((v, assetId) => {
          obj[assetId] = v;
        });
        setPathBByAssetId(obj);
      } catch (err) {
        console.error('[PromotionDetail] Path B load failed:', err);
      }

      // Actual usage: promotion_assets wins for domain display
      if (!detail.promotion?.id) return;
      try {
        const { data: rows, error } = await supabase
          .from('promotion_assets')
          .select(
            'asset_id, use_marketer_domain, selected_marketer_domain_id, selected_sponsor_domain_id, use_vstrk_domain'
          )
          .eq('promotion_id', detail.promotion.id);
        if (error) throw error;
        if (cancelled) return;
        const domainIds = new Set<string>();
        for (const r of rows ?? []) {
          if (r.selected_marketer_domain_id) domainIds.add(r.selected_marketer_domain_id as string);
          if (r.selected_sponsor_domain_id) domainIds.add(r.selected_sponsor_domain_id as string);
        }
        // Fallback hostnames from assignment_assets when promo sponsor id null
        for (const v of Object.values(pathBByAssetId)) {
          /* filled after pathB set — use map from list above */
        }
        map.forEach((v) => {
          if (v.selected_sponsor_domain_id) domainIds.add(v.selected_sponsor_domain_id);
        });
        const hostnameById = new Map<string, string>();
        if (domainIds.size > 0) {
          const { data: domains } = await supabase
            .from('branded_tracking_domains')
            .select('id, hostname')
            .in('id', Array.from(domainIds));
          for (const d of domains ?? []) {
            hostnameById.set(d.id as string, (d.hostname as string) || (d.id as string));
          }
        }
        const usage: typeof promoUsageByAssetId = {};
        for (const r of rows ?? []) {
          const aid = r.asset_id as string;
          const mid = (r.selected_marketer_domain_id as string | null) ?? null;
          let sid = (r.selected_sponsor_domain_id as string | null) ?? null;
          // Priority: promotion_assets → assignment_assets
          if (!sid) {
            sid = map.get(aid)?.selected_sponsor_domain_id ?? null;
          }
          usage[aid] = {
            use_marketer_domain: !!r.use_marketer_domain,
            selected_marketer_domain_id: mid,
            marketer_hostname: mid ? hostnameById.get(mid) ?? null : null,
            selected_sponsor_domain_id: sid,
            sponsor_hostname: sid ? hostnameById.get(sid) ?? null : null,
            use_vstrk_domain: !!r.use_vstrk_domain,
          };
        }
        if (!cancelled) setPromoUsageByAssetId(usage);
      } catch (err) {
        console.error('[PromotionDetail] promotion_assets usage load failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail?.assignment?.id, detail?.promotion?.id, detail?.assets?.length]);

  useEffect(() => {
    if (!isSponsor || !detail?.promotion?.organization_id) return;
    listVerifiedBrandedDomains(detail.promotion.organization_id)
      .then(setSponsorVerifiedDomains)
      .catch(err => console.error('[PromotionDetail] verified domains:', err));
  }, [isSponsor, detail?.promotion?.organization_id]);

  // Phase 2 — seed Content Creation draft from Assignment
  useEffect(() => {
    if (!detail?.assignment) {
      setCreativeDraftReady(false);
      return;
    }
    const a: any = detail.assignment;
    const mode =
      a.creative_creation_mode === 'campaign_asset_only' ||
      a.creative_creation_mode === 'campaign_links_and_assets'
        ? a.creative_creation_mode
        : null;
    const scope =
      a.asset_scope === 'promotion_only' || a.asset_scope === 'allow_additional'
        ? a.asset_scope
        : mode
          ? 'promotion_only'
          : null;
    setDraftCreativeMode(mode);
    setDraftAssetScope(scope);
    setCreativeDraftReady(true);
    setCreativeSettingsError(null);
  }, [
    detail?.assignment?.id,
    (detail?.assignment as any)?.creative_creation_mode,
    (detail?.assignment as any)?.asset_scope,
    (detail?.assignment as any)?.creative_campaign_id,
  ]);


 const handleRestore = async () => {
    if (!id || !user) return;
    setArchiveActionError(null);
    setRestoring(true);
    try {
      await restorePromotionForUser(id, user.id);
      setArchivedAt(false);
      setArchiveLevel('normal');
    } catch (err: any) {
      setArchiveActionError(err.message || 'Could not restore this promotion.');
    } finally {
      setRestoring(false);
    }
  };

  // Level 1 -> Level 2. Never touches promotion_user_states.archived_at —
  // Hide is a UI-visibility action only (Surface A), not a Restore/Archive
  // action, and has nothing to do with Surface B (Archive Impact).
  const handleHide = async () => {
    if (!id || !user) return;
    setArchiveActionError(null);
    setHiding(true);
    try {
      await hidePromotionForUser(id, user.id);
      setArchiveLevel('level2');
    } catch (err: any) {
      setArchiveActionError(err.message || 'Could not hide this promotion.');
    } finally {
      setHiding(false);
    }
  };

  // Level 2 -> Level 1 ONLY — per locked IA, Unhide never returns the
  // Promotion to My Promotions. promotion_user_states.archived_at is
  // untouched; only the archive_ui_visibility row is deleted.
  const handleUnhide = async () => {
    if (!id || !user) return;
    setArchiveActionError(null);
    setUnhiding(true);
    try {
      await unhidePromotionForUser(id, user.id);
      setArchiveLevel('level1');
    } catch (err: any) {
      setArchiveActionError(err.message || 'Could not unhide this promotion.');
    } finally {
      setUnhiding(false);
    }
  };

  // Remove is only ever triggered by an explicit Sponsor click below —
  // this is a PERMISSION action (assignment_collaborators.status:
  // 'active' -> 'removed'), not an Archive action. It does not delete
  // the promotion, assets, or assignment, and does not change
  // promotion.status. Calls the existing removeCollaborator.ts wrapper
  // unchanged; on success, only local component state is updated so the
  // button disables without a full reload.
  const handleRemoveCollaborator = async () => {
    if (!detail?.collaborator) return;
    if (!window.confirm(`Remove ${detail.collaborator.name} from this Assignment? They will immediately lose access to its Assets.`)) {
      return;
    }
    setCollaboratorActionError(null);
    setRemovingCollaborator(true);
    try {
      await removeCollaborator(detail.collaborator.id);
      setDetail((prev: PromotionDetailData | null) =>
        prev && prev.collaborator
          ? { ...prev, collaborator: { ...prev.collaborator, status: 'removed' } }
          : prev
      );
    } catch (err: any) {
      setCollaboratorActionError(err.message || 'Could not remove this collaborator.');
    } finally {
      setRemovingCollaborator(false);
    }
  };

  // Mirror-image of handleRemoveCollaborator above — same authorization
  // boundary server-side (assignments.created_by_user_id), same local
  // state update on success so the badge/button flip back without a
  // full reload. Does not touch promotions/promotion_assets/assignment_assets.
  const handleRestoreCollaborator = async () => {
    if (!detail?.collaborator) return;
    setCollaboratorActionError(null);
    setRestoringCollaborator(true);
    try {
      await restoreCollaborator(detail.collaborator.id);
      setDetail((prev: PromotionDetailData | null) =>
        prev && prev.collaborator
          ? { ...prev, collaborator: { ...prev.collaborator, status: 'active' } }
          : prev
      );
    } catch (err: any) {
      setCollaboratorActionError(err.message || 'Could not restore this collaborator.');
    } finally {
      setRestoringCollaborator(false);
    }
  };

  // Phase 2C — Revoke/Restore Access for one asset. Terminology locked
  // as "Revoke Access" / "Restore Access", never "remove asset" — the
  // asset itself, assignment_assets, promotion_assets, and the
  // `assets` (promoted) list above are never touched by either handler,
  // only `assignedAssets[].isRevoked` in local state.
  const handleRevokeAssetAccess = async (assetId: string) => {
    if (!detail?.collaborator) return;
    setAssetActionError(null);
    setAssetActionId(assetId);
    try {
      await revokeAssetAccess(detail.collaborator.id, assetId);
      setDetail((prev: PromotionDetailData | null) =>
        prev
          ? {
              ...prev,
              assignedAssets: prev.assignedAssets.map(a =>
                a.assetId === assetId ? { ...a, isRevoked: true } : a
              ),
            }
          : prev
      );
    } catch (err: any) {
      setAssetActionError(err.message || 'Could not revoke access to this asset.');
    } finally {
      setAssetActionId(null);
    }
  };

  const handleRestoreAssetAccess = async (assetId: string) => {
    if (!detail?.collaborator) return;
    setAssetActionError(null);
    setAssetActionId(assetId);
    try {
      await restoreAssetAccess(detail.collaborator.id, assetId);
      setDetail((prev: PromotionDetailData | null) =>
        prev
          ? {
              ...prev,
              assignedAssets: prev.assignedAssets.map(a =>
                a.assetId === assetId ? { ...a, isRevoked: false } : a
              ),
            }
          : prev
      );
    } catch (err: any) {
      setAssetActionError(err.message || 'Could not restore access to this asset.');
    } finally {
      setAssetActionId(null);
    }
  };

  // Domain phase — only fill promotion_assets.selected_sponsor_domain_id when still null.
  // Does NOT rewrite assignment_assets allow_* or change domains that were already set.
  const handleSetPromotionSponsorDomain = async (
    promotionAssetId: string,
    assetId: string,
    domainId: string
  ) => {
    if (!isSponsor || !domainId) return;
    const existing = promoUsageByAssetId[assetId];
    if (existing?.selected_sponsor_domain_id) {
      setPathBError('Sponsor tracking domain is already set and cannot be changed here.');
      return;
    }
    if (!pathBByAssetId[assetId]?.allow_sponsor_domain) {
      setPathBError('Sponsor tracking domain is not allowed for this asset on the Assignment.');
      return;
    }
    const key = `${assetId}:sponsor`;
    setPathBError(null);
    setPathBActionKey(key);
    try {
      const { error } = await supabase
        .from('promotion_assets')
        .update({ selected_sponsor_domain_id: domainId })
        .eq('id', promotionAssetId);
      if (error) throw error;
      const opt = sponsorVerifiedDomains.find(d => d.id === domainId);
      setPromoUsageByAssetId(prev => ({
        ...prev,
        [assetId]: {
          use_marketer_domain: prev[assetId]?.use_marketer_domain ?? false,
          selected_marketer_domain_id: prev[assetId]?.selected_marketer_domain_id ?? null,
          marketer_hostname: prev[assetId]?.marketer_hostname ?? null,
          selected_sponsor_domain_id: domainId,
          sponsor_hostname: opt?.hostname ?? domainId,
          use_vstrk_domain: prev[assetId]?.use_vstrk_domain ?? false,
        },
      }));
    } catch (err: any) {
      setPathBError(err.message || 'Could not set Sponsor tracking domain.');
    } finally {
      setPathBActionKey(null);
    }
  };


  // Phase 2 — draft changes only; Save button commits via service guards
  const savedCreativeMode: CreativeCreationMode = (() => {
    const m = (detail?.assignment as any)?.creative_creation_mode;
    return m === 'campaign_asset_only' || m === 'campaign_links_and_assets' ? m : null;
  })();
  const savedAssetScope: AssetScope = (() => {
    const sc = (detail?.assignment as any)?.asset_scope;
    return sc === 'promotion_only' || sc === 'allow_additional' ? sc : null;
  })();
  const savedCampaignId = ((detail?.assignment as any)?.creative_campaign_id as string | null) || null;
  const creativeDirty =
    creativeDraftReady &&
    isSponsor &&
    !!savedCreativeMode &&
    (draftCreativeMode !== savedCreativeMode ||
      (draftAssetScope || 'promotion_only') !== (savedAssetScope || 'promotion_only'));

  const saveCreativeSettings = async () => {
    if (!detail?.assignment?.id || !isSponsor || !creativeDirty) return;
    setCreativeSettingsBusy(true);
    setCreativeSettingsError(null);
    try {
      const result = await updateAssignmentCreativeSettings({
        assignmentId: detail.assignment.id,
        creative_creation_mode: draftCreativeMode,
        asset_scope: draftCreativeMode ? (draftAssetScope || 'promotion_only') : null,
      });
      setDetail((prev: PromotionDetailData | null) => {
        if (!prev?.assignment) return prev;
        return {
          ...prev,
          assignment: {
            ...prev.assignment,
            creative_creation_mode: result.creative_creation_mode,
            asset_scope: result.asset_scope,
            creative_campaign_id: result.creative_campaign_id,
          } as typeof prev.assignment,
        };
      });
      setDraftCreativeMode(result.creative_creation_mode);
      setDraftAssetScope(result.asset_scope);
    } catch (err: any) {
      setCreativeSettingsError(err?.message ?? 'Could not update Content Creation settings');
    } finally {
      setCreativeSettingsBusy(false);
    }
  };

  // Phase 1 — Revoke Access = remove promotion_assets row (Promotion × Asset only).
  const handleRevokePromotionAsset = async (promotionAssetId: string, assetId: string) => {
    if (!isSponsor) return;
    if (!window.confirm('Revoke this asset from this Promotion? Assignment permission is unchanged.')) {
      return;
    }
    setPromoAssetRevokeError(null);
    setPromoAssetRevokeId(promotionAssetId);
    try {
      await removePromotionAsset(promotionAssetId);
      setDetail(prev =>
        prev
          ? { ...prev, assets: prev.assets.filter(a => a.promotionAssetId !== promotionAssetId) }
          : prev
      );
    } catch (err: any) {
      setPromoAssetRevokeError(err.message || 'Could not revoke this asset from the promotion.');
    } finally {
      setPromoAssetRevokeId(null);
    }
  };

  // MVP — Promotion-level "Allow collaborator domains" policy toggle.
  // No RPC — direct RLS-guarded update via promotionAssetDomainPolicy.ts,
  // same optimistic local-state pattern as every handler above.
  // Independent of assignment_tracking_domain_access_states and both
  // revoke/restore handlers — this only ever writes
  // promotion_assets.allow_collaborator_domains for one row.
  const handleToggleAllowCollaboratorDomains = async (promotionAssetId: string, next: boolean) => {
    setDomainPolicyError(null);
    setDomainPolicyActionId(promotionAssetId);
    try {
      await setAllowCollaboratorDomains(promotionAssetId, next);
      setDetail((prev: PromotionDetailData | null) =>
        prev
          ? {
              ...prev,
              assets: prev.assets.map(a =>
                a.promotionAssetId === promotionAssetId ? { ...a, allowCollaboratorDomains: next } : a
              ),
            }
          : prev
      );
    } catch (err: any) {
      setDomainPolicyError(err.message || 'Could not update this setting.');
    } finally {
      setDomainPolicyActionId(null);
    }
  };

  /** Picker only stages assets — does not write DB. */
  const handleStageAddAssets = (selected: PromotedAssetRow[]) => {
    if (!selected.length) {
      setIsAddAssetPickerOpen(false);
      return;
    }
    setAddAssetError(null);
    setPendingAddAssets(prev => {
      const seen = new Set(prev.map(a => a.assetId));
      // Also exclude already-promoted
      const promoted = new Set((detail?.assets ?? []).map(a => a.assetId));
      const next = [...prev];
      for (const row of selected) {
        const id = row.asset_id;
        if (seen.has(id) || promoted.has(id)) continue;
        seen.add(id);
        next.push({
          assetId: id,
          title: row.title || 'Untitled',
          thumbnail: row.thumbnail ?? null,
        });
      }
      return next;
    });
    setPendingAddPerms(prev => {
      const next = new Map(prev);
      for (const row of selected) {
        if (!next.has(row.asset_id)) next.set(row.asset_id, { ...DEFAULT_PENDING_PERM });
      }
      return next;
    });
    setIsAddAssetPickerOpen(false);
  };

  const cancelPendingAddAssets = () => {
    setPendingAddAssets([]);
    setPendingAddPerms(new Map());
    setAddAssetError(null);
  };

  const removePendingAddAsset = (assetId: string) => {
    setPendingAddAssets(prev => prev.filter(a => a.assetId !== assetId));
    setPendingAddPerms(prev => {
      const next = new Map(prev);
      next.delete(assetId);
      return next;
    });
  };

  const patchPendingPerm = (
    assetId: string,
    patch: Partial<PendingAddPerm>
  ) => {
    setPendingAddPerms(prev => {
      const cur = prev.get(assetId) ?? { ...DEFAULT_PENDING_PERM };
      const nextPerm = { ...cur, ...patch };
      if (patch.allowSponsorDomain === false) {
        nextPerm.selectedSponsorDomainId = null;
      }
      const next = new Map(prev);
      next.set(assetId, nextPerm);
      return next;
    });
  };

  /** Confirm: upsert assignment_assets Path B flags, then add promotion_assets. */
  const confirmPendingAddAssets = async () => {
    if (!detail?.assignment?.id || !detail.promotion?.id || pendingAddAssets.length === 0) return;
    setAddAssetError(null);
    for (const a of pendingAddAssets) {
      const p = pendingAddPerms.get(a.assetId) ?? DEFAULT_PENDING_PERM;
      if (p.allowSponsorDomain && !p.selectedSponsorDomainId) {
        setAddAssetError(
          `Select a Sponsor tracking domain for "${a.title}" or uncheck Sponsor's tracking domain.`
        );
        return;
      }
    }
    setAddingAsset(true);
    try {
      const assignmentId = detail.assignment.id;
      const promotionId = detail.promotion.id;
      for (const a of pendingAddAssets) {
        const p = pendingAddPerms.get(a.assetId) ?? DEFAULT_PENDING_PERM;
        const payload = {
          allow_marketer_domain: p.allowMarketerDomain,
          allow_sponsor_domain: p.allowSponsorDomain,
          allow_vstrk_domain: p.allowVstrkDomain,
          selected_sponsor_domain_id: p.allowSponsorDomain ? p.selectedSponsorDomainId : null,
        };
        const { data: existingAa } = await supabase
          .from('assignment_assets')
          .select('id')
          .eq('assignment_id', assignmentId)
          .eq('asset_id', a.assetId)
          .maybeSingle();
        if (existingAa?.id) {
          const { error: upErr } = await supabase
            .from('assignment_assets')
            .update(payload)
            .eq('id', existingAa.id);
          if (upErr) throw upErr;
        } else {
          const { error: insErr } = await supabase.from('assignment_assets').insert({
            assignment_id: assignmentId,
            asset_id: a.assetId,
            ...payload,
          });
          if (insErr) throw insErr;
        }
        await addPromotionAsset(promotionId, a.assetId, assignmentId);
      }
      const data = await getPromotionDetail(promotionId);
      if (data) setDetail(data);
      cancelPendingAddAssets();
    } catch (err: any) {
      setAddAssetError(err.message || 'Could not add assets to the promotion.');
    } finally {
      setAddingAsset(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading...
      </div>
    );
  }

  if (error || !detail) {
    return <div className="text-red-500 text-sm">{error || 'Promotion not found.'}</div>;
  }

  const { promotion, assignment, sponsor, collaborator, assets, assignedAssets } = detail;

  // Historical-view gate. This is a UI/read-layer distinction only — it
  // does not grant or revoke any actual access. If the viewer IS the
  // collaborator on this promotion and their status is no longer
  // 'active', show a minimal historical record (Assignment link,
  // Sponsor, collaboration status, date) instead of the full
  // active-collaboration layout — no Promoted Assets list, no action
  // buttons. Assets remain inaccessible regardless of this flag: that's
  // still enforced by the existing per-asset RLS (getAssetDetail already
  // fails gracefully per-asset today), this only changes what this page
  // chooses to render on top of that.
  const isRemovedSelf =
    !!user && !!collaborator && collaborator.user_id === user.id && collaborator.status !== 'active';

  // Read-only counterpart to Sponsor's Access Management. True when the
  // viewer IS the collaborator on this promotion (not the Sponsor) and
  // still active — same identity check as isRemovedSelf above, opposite
  // status. Gates a display-only "Assigned Assets" list further down:
  // status only, no Revoke/Restore buttons, no write access of any kind.
  const isCollaboratorViewer =
    !!user && !!collaborator && collaborator.user_id === user.id && collaborator.status === 'active';

  return (
    <div className="space-y-6 max-w-4xl">
      <Link
        to="/marketplace"
        className="flex items-center gap-2 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest"
      >
        <ArrowLeft size={14} /> Back to Marketplace
      </Link>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">
          Promotion Detail
        </p>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          {assignment?.title ?? 'Promotion'}
          {archivedAt && (
            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
              <ArchiveRestore size={10} /> {archiveLevel === 'level2' ? 'Hidden' : 'Archived'}
            </span>
          )}
        </h1>
        {promotion.status !== 'draft' && (
          <span className="inline-block mt-2 text-[9px] font-black uppercase text-zinc-500 tracking-widest">
            {promotion.status}
          </span>
        )}

      {archivedAt && archiveLevel === 'level1' && (
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleRestore}
              disabled={restoring || hiding}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {restoring ? <Loader2 className="animate-spin" size={14} /> : <ArchiveRestore size={14} />}
              {restoring ? 'Restoring...' : 'Restore Promotion'}
            </button>
            <button
              onClick={handleHide}
              disabled={restoring || hiding}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {hiding ? <Loader2 className="animate-spin" size={14} /> : <ArchiveRestore size={14} />}
              {hiding ? 'Hiding...' : 'Hide'}
            </button>
            {archiveActionError && (
              <p className="text-[10px] text-red-500 mt-2">{archiveActionError}</p>
            )}
          </div>
        )}

        {archivedAt && archiveLevel === 'level2' && (
          <div className="mt-4">
            <button
              onClick={handleUnhide}
              disabled={unhiding}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {unhiding ? <Loader2 className="animate-spin" size={14} /> : <ArchiveRestore size={14} />}
              {unhiding ? 'Unhiding...' : 'Unhide'}
            </button>
            {archiveActionError && (
              <p className="text-[10px] text-red-500 mt-2">{archiveActionError}</p>
            )}
          </div>
        )}

        {!isRemovedSelf && (
          <div className="mt-4 flex items-center gap-2">
            <Link
              to={`/marketplace/promotions/${id}/analytics`}
              className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors"
            >
              <BarChart3 size={14} />
              View Analytics
            </Link>
            <Link
              to={`/marketplace/promotions/${id}/journey`}
              className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors"
            >
              <BarChart3 size={14} />
              View Journey
            </Link>
            {isSponsor && savedCreativeMode && (
              <button
                type="button"
                onClick={saveCreativeSettings}
                disabled={!creativeDirty || creativeSettingsBusy}
                className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:hover:bg-orange-600 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors"
                title={
                  creativeDirty
                    ? 'Save Content Creation changes'
                    : 'No Content Creation changes to save'
                }
              >
                {creativeSettingsBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                Save
              </button>
            )}
            <button
              onClick={() => startTutorial(promotionTutorial)}
              title="Take a tour of Promotion Detail"
              className="inline-flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-lg w-9 h-9 rounded-lg transition-colors"
            >
              🦊
            </button>
          </div>
        )}

        
      </div>

      {isRemovedSelf ? (
        // Minimal historical record — no Promoted Assets list, no
        // action buttons. Assets stay inaccessible via the existing
        // per-asset RLS regardless; this branch just stops the page from
        // attempting to render them at all for a removed collaborator's
        // own view.
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5 max-w-md">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Assignment</p>
            {assignment ? (
              <p className="text-sm text-white">{assignment.title}</p>
            ) : (
              <p className="text-sm text-zinc-500">No linked assignment.</p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Sponsor</p>
            {sponsor ? (
              <p className="text-sm text-white">{sponsor.name}</p>
            ) : (
              <p className="text-sm text-zinc-500">Unknown.</p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Collaboration status</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
              {collaborator!.status}
            </span>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Created Date</p>
            <p className="text-sm text-white">
              {new Date(promotion.created_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </section>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left column — Assignment / Sponsor / Collaborator / Created Date */}
          <div className="md:w-2/5">
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Assignment</p>
                {assignment ? (
                  <Link
                    to={`/marketplace/assignments/${assignment.id}`}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    {assignment.title}
                  </Link>
                ) : (
                  <p className="text-sm text-zinc-500">No linked assignment.</p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Sponsor</p>
                {sponsor ? (
                  <div>
                    <p className="text-sm text-white">{sponsor.name}</p>
                    {sponsor.email && <p className="text-xs text-zinc-500">{sponsor.email}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">Unknown.</p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Collaborator</p>
                {collaborator ? (
                  <div>
                    <p className="text-sm text-white">{collaborator.name}</p>
                    {collaborator.email && <p className="text-xs text-zinc-500">{collaborator.email}</p>}
                    {isSponsor && promotion.assignment_collaborator_id && (
                      <div className="mt-2 space-y-2">
                        {collaborator.status !== 'active' && (
                          <span className="block text-[10px] font-bold uppercase tracking-widest text-red-500">
                            {collaborator.status}
                          </span>
                        )}
                        <div data-tutorial-id="promotion-collaborator-actions">
                        {collaborator.status === 'active' ? (
                          <button
                            onClick={handleRemoveCollaborator}
                            disabled={removingCollaborator}
                            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-red-600 disabled:opacity-50 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {removingCollaborator ? <Loader2 size={12} className="animate-spin" /> : <UserX size={12} />}
                            Remove Collaborator
                          </button>
                        ) : (
                          <button
                            onClick={handleRestoreCollaborator}
                            disabled={restoringCollaborator}
                            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-green-600 disabled:opacity-50 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {restoringCollaborator ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
                            Restore Collaborator
                          </button>
                        )}
                        {collaboratorActionError && (
                          <p className="text-[10px] text-red-500 mt-2">{collaboratorActionError}</p>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">Unknown.</p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Created Date</p>
                <p className="text-sm text-white">
                  {new Date(promotion.created_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* Phase 2 — Content Creation (Assignment-level; no NULL ↔ Creative) */}
              {assignment && (
                <div className="pt-2 border-t border-zinc-800 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Content Creation
                  </p>
                  {(() => {
                    const mode = isSponsor && creativeDraftReady
                      ? draftCreativeMode
                      : (((assignment as any).creative_creation_mode as string | null) || null);
                    const scope = isSponsor && creativeDraftReady
                      ? draftAssetScope
                      : (((assignment as any).asset_scope as string | null) || null);
                    const campaignId = ((assignment as any).creative_campaign_id as string | null) || null;
                    const isCreative =
                      mode === 'campaign_asset_only' || mode === 'campaign_links_and_assets';

                    if (!isCreative) {
                      return (
                        <p className="text-sm text-zinc-400">No content creation</p>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Creative Mode
                          </p>
                          {isSponsor ? (
                            <div className="space-y-2">
                              <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  className="mt-0.5 accent-orange-500"
                                  name="promo-creative-mode"
                                  checked={mode === 'campaign_asset_only'}
                                  disabled={creativeSettingsBusy}
                                  onChange={() => {
                                    setDraftCreativeMode('campaign_asset_only');
                                    setCreativeSettingsError(null);
                                  }}
                                />
                                <span className="text-xs text-zinc-200">
                                  Campaign + asset only
                                  <span className="block text-[10px] text-zinc-500 font-normal mt-0.5">
                                    ONLY PROMOTE ASSET — no extra Sponsor campaign links campaign.
                                  </span>
                                </span>
                              </label>
                              <label
                                className={`flex items-start gap-2 ${
                                  !campaignId && mode === 'campaign_asset_only'
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'cursor-pointer'
                                }`}
                              >
                                <input
                                  type="radio"
                                  className="mt-0.5 accent-orange-500"
                                  name="promo-creative-mode"
                                  checked={mode === 'campaign_links_and_assets'}
                                  disabled={
                                    creativeSettingsBusy ||
                                    (!campaignId && mode === 'campaign_asset_only')
                                  }
                                  onChange={() => {
                                    setDraftCreativeMode('campaign_links_and_assets');
                                    setCreativeSettingsError(null);
                                  }}
                                />
                                <span className="text-xs text-zinc-200">
                                  Campaign + links + assets
                                  <span className="block text-[10px] text-zinc-500 font-normal mt-0.5">
                                    ONLY PROMOTE ASSET plus one Sponsor campaign.
                                    {!campaignId && mode === 'campaign_asset_only'
                                      ? ' Requires a creative campaign already set on this Assignment (no auto-select).'
                                      : ''}
                                  </span>
                                </span>
                              </label>
                            </div>
                          ) : (
                            <p className="text-sm text-zinc-300">
                              {mode === 'campaign_asset_only'
                                ? 'Campaign + asset only'
                                : 'Campaign + links + assets'}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Asset Usage
                          </p>
                          {isSponsor ? (
                            <div className="space-y-2">
                              <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  className="mt-0.5 accent-orange-500"
                                  name="promo-asset-scope"
                                  checked={scope === 'promotion_only' || !scope}
                                  disabled={creativeSettingsBusy}
                                  onChange={() => {
                                    setDraftAssetScope('promotion_only');
                                    setCreativeSettingsError(null);
                                  }}
                                />
                                <span className="text-xs text-zinc-200">
                                  Promotion assets only
                                  <span className="block text-[10px] text-zinc-500 font-normal mt-0.5">
                                    Marketer can only use assets in this Promotion.
                                  </span>
                                </span>
                              </label>
                              <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  className="mt-0.5 accent-orange-500"
                                  name="promo-asset-scope"
                                  checked={scope === 'allow_additional'}
                                  disabled={creativeSettingsBusy}
                                  onChange={() => {
                                    setDraftAssetScope('allow_additional');
                                    setCreativeSettingsError(null);
                                  }}
                                />
                                <span className="text-xs text-zinc-200">
                                  Allow additional assets
                                  <span className="block text-[10px] text-zinc-500 font-normal mt-0.5">
                                    Marketer can use assets in this Promotion plus other assets they are already permitted to promote.
                                  </span>
                                </span>
                              </label>
                            </div>
                          ) : (
                            <p className="text-sm text-zinc-300">
                              {scope === 'allow_additional'
                                ? 'Allow additional assets'
                                : 'Promotion assets only'}
                            </p>
                          )}
                        </div>

                        {creativeSettingsError && (
                          <p className="text-[11px] text-red-400">{creativeSettingsError}</p>
                        )}
                        {isSponsor && creativeDirty && !creativeSettingsBusy && (
                          <p className="text-[10px] text-zinc-500">
                            Unsaved changes — use Save (top right).
                          </p>
                        )}
                        {creativeSettingsBusy && (
                          <p className="text-[10px] text-zinc-500">Saving…</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

            </section>
          </div>

          {/* Right column — Promoted Assets */}
          <div className="md:w-3/5">
       <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
              Promoted Assets
            </p>
            {/* Surface B — Archive Impact. Diagnostic only: no
                Hide/Unhide here, no automatic Remove/Revoke of any
                collaborator, asset access, or tracking domain. This
                Promotion remains fully in My Promotions regardless of
                what's shown below. */}
            {archiveImpact && archiveImpact.archivedAssetCount > 0 && (
              <div className="mb-3 border border-amber-500/20 bg-amber-500/10 rounded-lg p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2">
                  Archive Impact — {archiveImpact.archivedAssetCount} promoted asset{archiveImpact.archivedAssetCount > 1 ? 's are' : ' is'} archived
                </p>
                <ul className="space-y-1">
                  {archiveImpact.impacts.map(({ assetId, context }) => (
                    <li key={assetId} className="text-[11px] text-zinc-400">
                      {context.reasons.map(r => r.sourceName ?? r.sourceType).join(', ') || 'Archived'}
                    </li>
                  ))}
                </ul>
                <p className="text-[9px] text-zinc-500 mt-2">
                  This is informational only. Nothing was automatically removed or revoked.
                </p>
              </div>
            )}
            {assets.length === 0 ? (
              <p className="text-sm text-zinc-500">No assets in this promotion.</p>
            ) : (
              <div className="space-y-2">
                {assets.map(a => {
                  const thumbnailSrc = resolveThumbnailSrc(a.resource);
                  const title = a.resource?.title || 'Untitled Asset';
                  const isPolicyBusy = domainPolicyActionId === a.promotionAssetId;
                  const pathB = pathBByAssetId[a.assetId] || {
                    allow_marketer_domain: false,
                    allow_sponsor_domain: false,
                    allow_vstrk_domain: false,
                    selected_sponsor_domain_id: null as string | null,
                  };
                  const pathBBusy = pathBActionKey?.startsWith(a.assetId + ':') ?? false;
                  const revoking = promoAssetRevokeId === a.promotionAssetId;
                  return (
                    <div
                      key={a.promotionAssetId}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-3"
                    >
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/assets/${a.assetId}`}
                          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-14 h-9 overflow-hidden rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
                            {thumbnailSrc && (
                              <img src={thumbnailSrc} className="max-w-full max-h-full object-contain" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-zinc-200 truncate">{title}</p>
                            <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest mt-0.5">
                              {resolveTypeLabel(a.resource)}
                            </p>
                          </div>
                        </Link>
                      </div>

                      {/* Domain display: promotion_assets usage preferred; assignment allow_* is ceiling only */}
                      <div className="border-t border-zinc-800 pt-3 space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                          Tracking domains
                        </p>
                        {(() => {
                          const usage = promoUsageByAssetId[a.assetId];
                          const showMarketer = pathB.allow_marketer_domain || usage?.use_marketer_domain;
                          const showSponsor = pathB.allow_sponsor_domain || !!usage?.selected_sponsor_domain_id;
                          const showVstrk = pathB.allow_vstrk_domain || usage?.use_vstrk_domain;
                          if (!showMarketer && !showSponsor && !showVstrk) {
                            return (
                              <p className="text-[11px] text-zinc-500">No tracking methods configured for this asset.</p>
                            );
                          }
                          return (
                            <div className="space-y-2 text-[11px]">
                              {showMarketer && (
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">
                                    Marketer&apos;s tracking domain
                                  </p>
                                  <p className="text-zinc-200 font-mono">
                                    {usage?.use_marketer_domain
                                      ? (usage.marketer_hostname || usage.selected_marketer_domain_id || 'On')
                                      : pathB.allow_marketer_domain
                                        ? 'Allowed — not selected at Start Promoting'
                                        : 'Off'}
                                  </p>
                                </div>
                              )}
                              {showSponsor && (
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">
                                    Sponsor&apos;s tracking domain
                                  </p>
                                  {(() => {
                                    const resolvedHostname =
                                      usage?.sponsor_hostname
                                      || usage?.selected_sponsor_domain_id
                                      || pathB.hostname
                                      || pathB.selected_sponsor_domain_id
                                      || null;
                                    const canFill =
                                      isSponsor
                                      && pathB.allow_sponsor_domain
                                      && !usage?.selected_sponsor_domain_id
                                      && !pathB.selected_sponsor_domain_id;
                                    if (canFill) {
                                      return (
                                        <div className="space-y-1">
                                          <select
                                            className="w-full max-w-sm bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
                                            defaultValue=""
                                            disabled={pathBBusy}
                                            onChange={e => {
                                              const v = e.target.value;
                                              if (v) {
                                                handleSetPromotionSponsorDomain(
                                                  a.promotionAssetId,
                                                  a.assetId,
                                                  v
                                                );
                                              }
                                            }}
                                          >
                                            <option value="">Select Sponsor tracking domain</option>
                                            {sponsorVerifiedDomains.map(d => (
                                              <option key={d.id} value={d.id}>
                                                {d.hostname}
                                              </option>
                                            ))}
                                          </select>
                                          <p className="text-[9px] text-zinc-600">
                                            Not set yet — choose once; locked after save.
                                          </p>
                                        </div>
                                      );
                                    }
                                    return (
                                      <>
                                        <p className="text-zinc-200 font-mono">
                                          {resolvedHostname
                                            || (pathB.allow_sponsor_domain
                                              ? 'Allowed — not set yet'
                                              : 'Off')}
                                        </p>
                                        <p className="text-[9px] text-zinc-600 mt-0.5">
                                          Read only — decided at Assignment / Start Promoting
                                        </p>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                              {showVstrk && (
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">
                                    VSTRK tracking domain
                                  </p>
                                  <p className="text-zinc-200">
                                    {usage?.use_vstrk_domain
                                      ? 'On · vstrk.com'
                                      : pathB.allow_vstrk_domain
                                        ? 'Allowed — not selected at Start Promoting'
                                        : 'Off'}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {isSponsor && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleRevokePromotionAsset(a.promotionAssetId, a.assetId)
                              }
                              disabled={revoking}
                              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-red-600 disabled:opacity-50 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {revoking ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <ShieldOff size={12} />
                              )}
                              Revoke Access
                            </button>
                          </div>
                        )}
                      </div>

                      {!isRemovedSelf && isSponsor && collaborator && collaborator.status === 'active' && (
                        <label
                          data-tutorial-id="promotion-allow-collaborator-domains"
                          className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500 shrink-0 cursor-pointer select-none border-t border-zinc-800 pt-2"
                        >
                          <input
                            type="checkbox"
                            checked={a.allowCollaboratorDomains}
                            disabled={isPolicyBusy}
                            onChange={() =>
                              handleToggleAllowCollaboratorDomains(
                                a.promotionAssetId,
                                !a.allowCollaboratorDomains
                              )
                            }
                            className="accent-red-600"
                          />
                          {isPolicyBusy ? <Loader2 size={10} className="animate-spin" /> : null}
                          Allow collaborator domains
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {domainPolicyError && (
              <p className="text-[10px] text-red-500 mt-2">{domainPolicyError}</p>
            )}
            {pathBError && (
              <p className="text-[10px] text-red-500 mt-2">{pathBError}</p>
            )}
            {promoAssetRevokeError && (
              <p className="text-[10px] text-red-500 mt-2">{promoAssetRevokeError}</p>
            )}

            {!isRemovedSelf && isSponsor && collaborator && collaborator.status === 'active' && (
              <div className="mt-4 pt-4 border-t border-zinc-800" data-tutorial-id="promotion-add-asset">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">
                  Add Asset
                </p>
                <button
                  onClick={() => setIsAddAssetPickerOpen(true)}
                  disabled={addingAsset}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-red-600 disabled:opacity-50 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg transition-colors"
                >
                  {addingAsset ? <Loader2 size={12} className="animate-spin" /> : null}
                  Select Assets to Add
                </button>
                {addAssetError && (
                  <p className="text-[10px] text-red-500 mt-2">{addAssetError}</p>
                )}
                {isAddAssetPickerOpen && (
                  <PromotedAssetPicker
                    organizationId={detail.promotion.organization_id}
                    includeShared={false}
                    assignedAssetIdsOverride={assignedAssets.map(a => a.assetId)}
                    excludeAssetIds={[
                      ...assets.map(a => a.assetId),
                      ...pendingAddAssets.map(a => a.assetId),
                    ]}
                    onClose={() => setIsAddAssetPickerOpen(false)}
                    onSelect={handleStageAddAssets}
                  />
                )}

                {pendingAddAssets.length > 0 && (
                  <div className="mt-4 space-y-3 border border-zinc-700 rounded-xl p-4 bg-zinc-950/80">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">
                      Pending assets — not saved yet
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Configure promotion methods, then Confirm. Cancel discards only these pending rows; existing promoted assets are not removed.
                    </p>
                    {pendingAddAssets.map(asset => {
                      const p = pendingAddPerms.get(asset.assetId) ?? DEFAULT_PENDING_PERM;
                      return (
                        <div
                          key={asset.assetId}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-16 h-9 rounded bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                              {asset.thumbnail ? (
                                <img src={asset.thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[10px] text-zinc-600">—</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white truncate">
                                {asset.title}
                              </p>
                              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mt-0.5">
                                Asset
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePendingAddAsset(asset.assetId)}
                              disabled={addingAsset}
                              className="text-zinc-500 hover:text-red-400 text-xs font-bold px-2"
                              title="Remove from pending (not saved)"
                            >
                              ×
                            </button>
                          </div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Promotion Methods
                          </p>
                          <div className="space-y-2">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                className="accent-orange-500"
                                checked={p.allowMarketerDomain}
                                disabled={addingAsset}
                                onChange={e =>
                                  patchPendingPerm(asset.assetId, {
                                    allowMarketerDomain: e.target.checked,
                                  })
                                }
                              />
                              <span className="text-sm text-zinc-200">Marketer&apos;s tracking domain</span>
                            </label>
                            <div className="space-y-1.5">
                              <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="accent-orange-500"
                                  checked={p.allowSponsorDomain}
                                  disabled={addingAsset}
                                  onChange={e =>
                                    patchPendingPerm(asset.assetId, {
                                      allowSponsorDomain: e.target.checked,
                                      selectedSponsorDomainId: e.target.checked
                                        ? p.selectedSponsorDomainId
                                        : null,
                                    })
                                  }
                                />
                                <span className="text-sm text-zinc-200">Sponsor&apos;s tracking domain</span>
                              </label>
                              {p.allowSponsorDomain && (
                                <select
                                  className="w-full max-w-sm bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 ml-7"
                                  value={p.selectedSponsorDomainId ?? ''}
                                  disabled={addingAsset}
                                  onChange={e =>
                                    patchPendingPerm(asset.assetId, {
                                      selectedSponsorDomainId: e.target.value || null,
                                    })
                                  }
                                >
                                  <option value="">Select Sponsor tracking domain</option>
                                  {sponsorVerifiedDomains.map(d => (
                                    <option key={d.id} value={d.id}>
                                      {d.hostname}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                className="accent-orange-500"
                                checked={p.allowVstrkDomain}
                                disabled={addingAsset}
                                onChange={e =>
                                  patchPendingPerm(asset.assetId, {
                                    allowVstrkDomain: e.target.checked,
                                  })
                                }
                              />
                              <span className="text-sm text-zinc-200">VSTRK tracking domain</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={confirmPendingAddAssets}
                        disabled={addingAsset || pendingAddAssets.length === 0}
                        className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
                      >
                        {addingAsset ? <Loader2 size={12} className="animate-spin" /> : null}
                        Confirm add
                      </button>
                      <button
                        type="button"
                        onClick={cancelPendingAddAssets}
                        disabled={addingAsset}
                        className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-[10px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phase 2C — Access Management. Deliberately a SEPARATE section
          from "Promoted Assets" above, not merged into it — see file
          header PHASE 2C EXTENSION note. This is the full assigned-asset
          list (assignment_assets), not the promoted subset
          (promotion_assets). Sponsor-only, same isSponsor gate as
          Remove/Restore Collaborator.
          UI FIX: also requires collaborator.status === 'active'. Layer 1
          removal already blocks the collaborator completely — showing
          per-asset Revoke/Restore controls for an already-removed
          collaborator is misleading (Layer 2 state becomes irrelevant
          once Layer 1 access is gone). This is a display condition only;
          assignment_asset_access_states rows themselves are untouched
          either way — restoring the collaborator later reveals whatever
          access state was already there. */}
      {!isRemovedSelf && isSponsor && collaborator && collaborator.status === 'active' && assignedAssets.length > 0 && (
        <div data-tutorial-id="promotion-asset-access-management">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
            Access Management — Assigned Assets
          </p>
          <div className="space-y-2 max-w-2xl">
            {assignedAssets.map(a => {
              const thumbnailSrc = resolveThumbnailSrc(a.resource);
              const title = a.resource?.title || 'Untitled Asset';
              const isBusy = assetActionId === a.assetId;
              return (
                <div
                  key={a.assetId}
                  className={`flex items-center gap-3 border rounded-lg p-3 transition-all ${
                    a.isRevoked ? 'bg-zinc-950 border-red-900/40' : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className="w-14 h-9 overflow-hidden rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
                    {thumbnailSrc && (
                      <img src={thumbnailSrc} className="max-w-full max-h-full object-contain" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate">{title}</p>
                    <p className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${a.isRevoked ? 'text-red-500' : 'text-zinc-600'}`}>
                      {a.isRevoked ? 'Revoked' : 'Active'}
                    </p>
                  </div>
                  {a.isRevoked ? (
                    <button
                      onClick={() => handleRestoreAssetAccess(a.assetId)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 bg-zinc-800 hover:bg-green-600 disabled:opacity-50 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                      {isBusy ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                      Restore Access
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRevokeAssetAccess(a.assetId)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 bg-zinc-800 hover:bg-red-600 disabled:opacity-50 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                      {isBusy ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
                      Revoke Access
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {assetActionError && (
            <p className="text-[10px] text-red-500 mt-2">{assetActionError}</p>
          )}
        </div>
      )}

      {/* Phase 2C follow-up — read-only counterpart to Access Management
          above, for the collaborator themselves. Reuses the exact same
          assignedAssets data the Sponsor's section reads — no new query,
          no new data model. Status only: no Revoke Access / Restore
          Access buttons, no click handlers, no way to write anything.
          Mutually exclusive with the Sponsor block above in practice
          (isCollaboratorViewer and isSponsor can't both be true for the
          same person), but each has its own independent gate rather than
          being an else-branch of the other, since a third viewer type
          (neither Sponsor nor this collaborator) should see neither. */}
      {!isRemovedSelf && isCollaboratorViewer && assignedAssets.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
            Assigned Assets
          </p>
          <div className="space-y-2 max-w-2xl">
            {assignedAssets.map(a => {
              const thumbnailSrc = resolveThumbnailSrc(a.resource);
              const title = a.resource?.title || 'Untitled Asset';
              return (
                <div
                  key={a.assetId}
                  className={`flex items-center gap-3 border rounded-lg p-3 ${
                    a.isRevoked ? 'bg-zinc-950 border-red-900/40' : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className="w-14 h-9 overflow-hidden rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
                    {thumbnailSrc && (
                      <img src={thumbnailSrc} className="max-w-full max-h-full object-contain" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate">{title}</p>
                    <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest mt-0.5">
                      {resolveTypeLabel(a.resource)}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${a.isRevoked ? 'text-red-500' : 'text-zinc-500'}`}>
                    {a.isRevoked ? 'Revoked' : 'Active'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
