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
 * Promotion is the long-term operating object). isSponsor is an
 * organization-membership check against promotion.organization_id — same
 * boundary create_promotion's RPC and remove_assignment_collaborator's RPC
 * both already use, not assignment.created_by_user_id and not
 * promotion.owner_user_id (a narrower owner-only check would hide the
 * button from an org member the RPC would still authorize). The Remove
 * button calls the existing removeCollaborator.ts wrapper unchanged and,
 * on success, only updates local component state
 * (collaborator.status = 'removed') — no promotion/asset/assignment
 * mutation happens here.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ArchiveRestore, UserX } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
  getPromotionDetail,
  type PromotionDetailData,
} from '../services/promotion/getPromotionDetail';
import {
  getPromotionArchiveState,
  restorePromotionForUser,
} from '../services/promotion/promotionArchive';
import { removeCollaborator } from '../services/assignment/removeCollaborator';
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

  // Phase 2A — Sponsor-only Remove Collaborator. isSponsor is
  // organization-membership based (same boundary create_promotion and
  // remove_assignment_collaborator's RPC both already use), resolved
  // against promotion.organization_id once detail has loaded.
  const [isSponsor, setIsSponsor] = useState(false);
  const [removingCollaborator, setRemovingCollaborator] = useState(false);
  const [collaboratorActionError, setCollaboratorActionError] = useState<string | null>(null);

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

          // Sponsor check — independent of the main load, never blocks
          // it. Same organization_members boundary create_promotion's
          // and remove_assignment_collaborator's RPCs already use.
          if (user) {
            try {
              const { data: membership } = await supabase
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', user.id)
                .eq('organization_id', data.promotion.organization_id)
                .maybeSingle();
              setIsSponsor(!!membership);
            } catch (err) {
              console.error('[PromotionDetail] organization_members check failed:', err);
            }
          }
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

  const { promotion, assignment, sponsor, collaborator, assets } = detail;

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
                    <div className="mt-2">
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
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                          {collaborator.status}
                        </span>
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
    </div>
  );
}
