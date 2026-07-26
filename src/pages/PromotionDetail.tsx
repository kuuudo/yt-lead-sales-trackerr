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
import { ArrowLeft, Loader2, ArchiveRestore, UserX, UserCheck, ShieldOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  getPromotionDetail,
  type PromotionDetailData,
} from '../services/promotion/getPromotionDetail';
import {
  getPromotionArchiveState,
  restorePromotionForUser,
} from '../services/promotion/promotionArchive';
import { removeCollaborator } from '../services/assignment/removeCollaborator';
import { restoreCollaborator } from '../services/assignment/restoreCollaborator';
import { revokeAssetAccess, restoreAssetAccess } from '../services/assignment/assignmentAssetAccess';
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
  const [detail, setDetail] = useState<PromotionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Archive state — personal to the CURRENT user only (see
  // services/promotion/promotionArchive.ts). Never affects promotion
  // status, promotion_assets, or the other party's view of this same
  // promotion. Archiving itself is a list-page action (Marketplace.tsx);
  // this page only shows the badge and lets the user undo it.
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [archiveActionError, setArchiveActionError] = useState<string | null>(null);

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
      // here never blocks the rest of the page from rendering.
      if (user) {
        try {
          const state = await getPromotionArchiveState(id, user.id);
          setArchivedAt(state);
        } catch (err) {
          console.error('[PromotionDetail] getPromotionArchiveState failed:', err);
        }
      }
    })();
  }, [id, user]);

  const handleRestore = async () => {
    if (!id || !user) return;
    setArchiveActionError(null);
    setRestoring(true);
    try {
      await restorePromotionForUser(id, user.id);
      setArchivedAt(null);
    } catch (err: any) {
      setArchiveActionError(err.message || 'Could not restore this promotion.');
    } finally {
      setRestoring(false);
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
              <ArchiveRestore size={10} /> Archived
            </span>
          )}
        </h1>
        {promotion.status !== 'draft' && (
          <span className="inline-block mt-2 text-[9px] font-black uppercase text-zinc-500 tracking-widest">
            {promotion.status}
          </span>
        )}

        {archivedAt && (
          <div className="mt-4">
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {restoring ? <Loader2 className="animate-spin" size={14} /> : <ArchiveRestore size={14} />}
              {restoring ? 'Restoring...' : 'Restore Promotion'}
            </button>
            {archiveActionError && (
              <p className="text-[10px] text-red-500 mt-2">{archiveActionError}</p>
            )}
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
            {assets.length === 0 ? (
              <p className="text-sm text-zinc-500">No assets in this promotion.</p>
            ) : (
              <div className="space-y-2">
                {assets.map(a => {
                  const thumbnailSrc = resolveThumbnailSrc(a.resource);
                  const title = a.resource?.title || 'Untitled Asset';
                  return (
                    <Link
                      key={a.promotionAssetId}
                      to={`/assets/${a.assetId}`}
                      className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-600 transition-all"
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
                  );
                })}
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
        <div>
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
    </div>
  );
}
