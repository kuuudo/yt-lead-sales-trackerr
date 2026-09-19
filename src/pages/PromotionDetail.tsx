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
import {
  listAssignmentAssetDomainPolicies,
  updateAssignmentAssetDomainPolicy,
} from '../services/assignment/updateAssignmentAssetDomainPolicy';
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
  const [pathBActionKey, setPathBActionKey] = useState<string | null>(null);
  const [pathBError, setPathBError] = useState<string | null>(null);
  const [promoAssetRevokeId, setPromoAssetRevokeId] = useState<string | null>(null);
  const [promoAssetRevokeError, setPromoAssetRevokeError] = useState<string | null>(null);

  const [isAddAssetPickerOpen, setIsAddAssetPickerOpen] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);
  const [addAssetError, setAddAssetError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPromotionDetail(id);
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

  // Phase 1 — load assignment_assets Path B flags + Sponsor verified domains for selectors.
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
    })();
    return () => {
      cancelled = true;
    };
  }, [detail?.assignment?.id, detail?.assets?.length]);

  useEffect(() => {
    if (!isSponsor || !detail?.promotion?.organization_id) return;
    listVerifiedBrandedDomains(detail.promotion.organization_id)
      .then(setSponsorVerifiedDomains)
      .catch(err => console.error('[PromotionDetail] verified domains:', err));
  }, [isSponsor, detail?.promotion?.organization_id]);


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

  // Phase 1 — update assignment_assets Path B capability for one asset.
  const handlePathBChange = async (
    assetId: string,
    patch: {
      allow_marketer_domain?: boolean;
      allow_sponsor_domain?: boolean;
      allow_vstrk_domain?: boolean;
      selected_sponsor_domain_id?: string | null;
    }
  ) => {
    if (!detail?.assignment?.id || !isSponsor) return;
    const key = `${assetId}:${Object.keys(patch).join(',')}`;
    setPathBError(null);
    setPathBActionKey(key);
    try {
      await updateAssignmentAssetDomainPolicy(detail.assignment.id, assetId, patch);
      setPathBByAssetId(prev => {
        const cur = prev[assetId] || {
          allow_marketer_domain: false,
          allow_sponsor_domain: false,
          allow_vstrk_domain: false,
          selected_sponsor_domain_id: null,
        };
        const next = { ...cur, ...patch };
        if (next.allow_sponsor_domain === false) {
          next.selected_sponsor_domain_id = null;
          next.hostname = null;
        } else if (patch.selected_sponsor_domain_id) {
          const opt = sponsorVerifiedDomains.find(d => d.id === patch.selected_sponsor_domain_id);
          next.hostname = opt?.hostname ?? next.hostname;
        }
        return { ...prev, [assetId]: next };
      });
    } catch (err: any) {
      setPathBError(err.message || 'Could not update tracking domain access.');
    } finally {
      setPathBActionKey(null);
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

  const handleAddAsset = async (selected: PromotedAssetRow[]) => {
    if (!detail || !detail.assignment || selected.length === 0) return;
    setAddAssetError(null);
    setAddingAsset(true);
    try {
      for (const asset of selected) {
        await addPromotionAsset(detail.promotion.id, asset.asset_id, detail.assignment.id);
      }
      const data = await getPromotionDetail(detail.promotion.id);
      if (data) setDetail(data);
      setIsAddAssetPickerOpen(false);
    } catch (err: any) {
      setAddAssetError(err.message || 'Could not add this asset to the promotion.');
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

                      {/* Phase 1 — per-asset Path B domain access (assignment_assets) */}
                      <div className="border-t border-zinc-800 pt-3 space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                          Tracking domain access
                        </p>
                        {isSponsor && assignment ? (
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="accent-orange-500"
                                checked={!!pathB.allow_marketer_domain}
                                disabled={pathBBusy}
                                onChange={() =>
                                  handlePathBChange(a.assetId, {
                                    allow_marketer_domain: !pathB.allow_marketer_domain,
                                  })
                                }
                              />
                              Marketer&apos;s tracking domain
                            </label>
                            <div className="space-y-1.5">
                              <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  className="accent-orange-500"
                                  checked={!!pathB.allow_sponsor_domain}
                                  disabled={pathBBusy}
                                  onChange={() =>
                                    handlePathBChange(a.assetId, {
                                      allow_sponsor_domain: !pathB.allow_sponsor_domain,
                                      selected_sponsor_domain_id: !pathB.allow_sponsor_domain
                                        ? pathB.selected_sponsor_domain_id
                                        : null,
                                    })
                                  }
                                />
                                Sponsor&apos;s tracking domain
                              </label>
                              {pathB.allow_sponsor_domain && (
                                <select
                                  className="w-full max-w-sm bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
                                  value={pathB.selected_sponsor_domain_id || ''}
                                  disabled={pathBBusy}
                                  onChange={e =>
                                    handlePathBChange(a.assetId, {
                                      allow_sponsor_domain: true,
                                      selected_sponsor_domain_id: e.target.value || null,
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
                            <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="accent-orange-500"
                                checked={!!pathB.allow_vstrk_domain}
                                disabled={pathBBusy}
                                onChange={() =>
                                  handlePathBChange(a.assetId, {
                                    allow_vstrk_domain: !pathB.allow_vstrk_domain,
                                  })
                                }
                              />
                              VSTRK tracking domain
                            </label>
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
                          </div>
                        ) : (
                          <div className="text-[11px] text-zinc-500 space-y-0.5">
                            <p>
                              Marketer: {pathB.allow_marketer_domain ? 'Allowed' : 'Off'}
                            </p>
                            <p>
                              Sponsor:{' '}
                              {pathB.allow_sponsor_domain
                                ? pathB.hostname || pathB.selected_sponsor_domain_id || 'Allowed'
                                : 'Off'}
                            </p>
                            <p>VSTRK: {pathB.allow_vstrk_domain ? 'Allowed' : 'Off'}</p>
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
                    excludeAssetIds={assets.map(a => a.assetId)}
                    onClose={() => setIsAddAssetPickerOpen(false)}
                    onSelect={handleAddAsset}
                  />
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
