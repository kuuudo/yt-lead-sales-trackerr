/**
 * src/pages/AssetDetail.tsx
 *
 * Asset Detail — Title / Thumbnail / Type / Created / Source, two-column
 * MVP layout. General Info (Asset ID, Library status) removed — no display
 * value once an asset is viewable here at all.
 *
 * Loads via getAssetDetail.ts, which resolves display metadata from
 * whichever table backs this Asset today (`videos` legacy, `asset_resources`
 * native, or `campaign_element_assets` native) and normalizes it into a
 * single AssetResourceView shape. This page renders that shape generically
 * — it does not assume every Asset is a Video, even though Video is the
 * only source with its own detail page today.
 *
 * UPDATE (post Import Asset): previously this page ran an inline
 * `asset_resources`-only query, which silently showed "Untitled Asset"
 * for every asset_type: 'video' row (the majority of pre-Import-Asset
 * assets), since those never have an asset_resources row. Replaced with
 * getAssetDetail.ts, which resolves from the correct table per asset_type.
 *
 * UPDATE (MVP polish pass): added campaign_element support (title =
 * display_name, not element_type; thumbnail/type resolved via
 * resolveElementThumbnail/getElementTypeLabel, not the resource_type
 * dictionary). Removed General Info (Asset ID, Library status — no
 * display value). Moved Open Video Detail out of Source into its own
 * primary-action slot below the thumbnail. Switched to a two-column
 * layout (thumbnail + primary action left, Type/Created/Source right) so
 * future additions (Promotion, Analytics, Redirect Links) can extend the
 * right column without a layout rewrite. Thumbnail now object-contain in
 * a fixed aspect-video box instead of object-cover, so non-16:9 images
 * (e.g. portrait Instagram, PDF covers) don't get cropped or stretched.
 *
 * UPDATE (Sharing Info pass, Phase 1 — DATA ONLY, verified working):
 * added a second, independent fetch — getAssetSharingInfo.ts — composed
 * via Promise.all alongside getAssetDetail(), mirroring the My/Shared/
 * Assigned pattern from Assets.tsx (Promise.all of independently-scoped
 * queries, not one merged query). Sharing fetch failure does NOT fail
 * the page — Title/Thumbnail/Type/Created/Source still render even if
 * sharing info errors out, since assignment_collaborators/assignments
 * RLS is currently OFF and undecided; this independent-failure behavior
 * was called out explicitly as a reason to keep this a separate service
 * in the Architecture Review. Phase 1 verification (console.log) has
 * been confirmed working for both a sponsor viewer and a collaborator
 * viewer and is removed in Phase 2 below.
 *
 * UPDATE (Sharing Info pass, Phase 2 — UI):
 * added a "Sharing Information" section below the Type/Created/Source
 * card. Renders `sharingInfo.assignments` as-is — this page does NOT
 * branch on viewerRole to decide what to show. getAssetSharingInfo.ts
 * already returns a pre-filtered `collaborators` array (sponsor viewer:
 * everyone on that assignment; collaborator viewer: only themselves) —
 * this component trusts that filtering completely and just renders the
 * array it's given. No Status, no Avatar, no actions (Accept / Remove
 * Collaborator / Edit / Delete) — this pass is display-only, per the
 * locked scope. Empty state ("This asset has not been shared.") shown
 * when `sharingInfo.assignments.length === 0`, including while sharing
 * info is still loading or failed to load, so the page never shows a
 * bare gap where this section would be.
 *
 * UPDATE (Archive Resolver pass, Phase 1 — ARCHIVE_SYSTEM_DESIGN.md):
 * replaced the old single-source `getAssetArchiveState` (asset_user_states
 * only) with `getAssetArchiveContext` — the central resolver. This page
 * no longer independently knows what "archived" means; it renders
 * whatever reasons + level the resolver returns. A single Asset can now
 * show more than one reason at once (e.g. "Archived by You" AND "Source
 * Video Archived") — each with its own action, per LOCKED design:
 *   - personal reason  -> Restore (clears asset_user_states directly)
 *   - video reason     -> navigate to /videos/:id, no direct restore here
 *   - campaign reason   -> navigate to /campaigns/:id, no direct restore here
 * Level 2 (viewer has Hidden this from the Level 1 Archive Tab) shows an
 * "Unhide" action instead of any of the above — Unhide never touches
 * asset_user_states / videos.archived_at / campaigns.archived_at.
 * ASSUMPTION FLAGGED: the Campaign navigate target below is
 * `/campaigns/:id`, inferred from this file's existing `/videos/:id`
 * pattern — I have not confirmed CampaignDetail's actual route path.
 * Please correct if it differs before shipping.
 *
 * No edit, no delete, no analytics, no attribution, no timeline, no
 * comments, no assignment/promotion relationships beyond the read-only
 * Sharing Information display above — explicitly out of scope for this
 * pass.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ExternalLink, Video as VideoIcon, ArchiveRestore, EyeOff, BarChart3 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { getAssetDetail } from '../services/asset/getAssetDetail';
import type { AssetDetail as AssetDetailData } from '../services/asset/getAssetDetail';
import { getAssetSharingInfo } from '../services/asset/getAssetSharingInfo';
import type { AssetSharingInfo } from '../services/asset/getAssetSharingInfo';
import { restoreAssetForUser } from '../services/asset/assetArchive';
import { getAssetArchiveContext } from '../services/asset/getAssetArchiveContext';
import type { AssetArchiveContext } from '../services/asset/getAssetArchiveContext';
import { unhideAssetForUser } from '../services/asset/archiveUiVisibility';
import { resolveAssetThumbnail, resolveElementThumbnail, getElementTypeLabel, RESOURCE_TYPE_LABELS, type ResourceType, type CampaignElementType } from '../lib/videoFormatters';

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<AssetDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Sharing Info state — separate from `detail`/`loading`/`error`
  // above on purpose (see file header: independent fetch, independent
  // failure mode). Not rendered anywhere yet in this pass.
  const [sharingInfo, setSharingInfo] = useState<AssetSharingInfo | null>(null);
  const [sharingError, setSharingError] = useState<string | null>(null);

  // ---- Archive context — resolved entirely through the central
  // resolver (getAssetArchiveContext). This page never independently
  // queries asset_user_states / videos / campaigns to determine archive
  // reasons — see file header and getAssetArchiveContext.ts.
  const [archiveContext, setArchiveContext] = useState<AssetArchiveContext | null>(null);
  const [restoringPersonal, setRestoringPersonal] = useState(false);
  const [unhiding, setUnhiding] = useState(false);
  const [archiveActionError, setArchiveActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      setError(null);
      setSharingError(null);

      // Independent, differently-scoped queries composed at the page
      // level — same pattern as Assets.tsx's Promise.all([My, Shared,
      // Assigned]). Archive context needs the viewer's id, same as
      // sharing info; skip it (not fail) when there's no authenticated
      // user yet.
      const [assetResult, sharingResult, archiveResult] = await Promise.all([
        getAssetDetail(id).then(
          data => ({ ok: true as const, data }),
          err => ({ ok: false as const, err })
        ),
        user
          ? getAssetSharingInfo(id, user.id).then(
              data => ({ ok: true as const, data }),
              err => ({ ok: false as const, err })
            )
          : Promise.resolve({ ok: true as const, data: null }),
        user
          ? getAssetArchiveContext(id, user.id).then(
              data => ({ ok: true as const, data }),
              err => ({ ok: false as const, err })
            )
          : Promise.resolve({ ok: true as const, data: null }),
      ]);

      if (!assetResult.ok) {
        setError(assetResult.err?.message || 'Could not load this asset.');
        setLoading(false);
        return;
      }

      if (!assetResult.data) {
        setError('Asset not found.');
        setLoading(false);
        return;
      }

      setDetail(assetResult.data);
      setLoading(false);

      // Sharing info failure is logged but does NOT set the page-level
      // `error` state — Title/Thumbnail/Type/Created/Source must still
      // render. See file header.
      if (!sharingResult.ok) {
        setSharingError(sharingResult.err?.message || 'Could not load sharing info.');
        console.error('[AssetDetail] getAssetSharingInfo failed:', sharingResult.err);
      } else if (sharingResult.data) {
        setSharingInfo(sharingResult.data);
      }

      // Archive context failure is logged but never blocks the page
      // either — same treatment as sharing info above.
      if (!archiveResult.ok) {
        console.error('[AssetDetail] getAssetArchiveContext failed:', archiveResult.err);
      } else if (archiveResult.data) {
        setArchiveContext(archiveResult.data);
      }
    })();
  }, [id, user]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading...
      </div>
    );
  }

  if (error || !detail) {
    return <div className="text-red-500 text-sm">{error || 'Asset not found.'}</div>;
  }

  const { asset, resource } = detail;

  // Refetch the archive context after any action below, rather than
  // hand-rolling optimistic reason-list surgery here — the resolver is
  // the single source of truth for what reasons remain, and re-deriving
  // that logic in this component is exactly what the architecture rule
  // (file header) forbids.
  const refetchArchiveContext = async () => {
    if (!user || !id) return;
    try {
      const next = await getAssetArchiveContext(id, user.id);
      setArchiveContext(next);
    } catch (err: any) {
      console.error('[AssetDetail] refetch getAssetArchiveContext failed:', err);
    }
  };

  // Personal-reason restore only ever acts on (asset.id, the CURRENT
  // user's id) — it can never affect another user's view of this same
  // asset, and never touches sharing, assignments, or ownership.
  const handleRestorePersonal = async () => {
    if (!user) return;
    setArchiveActionError(null);
    setRestoringPersonal(true);
    try {
      await restoreAssetForUser(asset.id, user.id);
      await refetchArchiveContext();
    } catch (err: any) {
      setArchiveActionError(err.message || 'Could not restore this asset.');
    } finally {
      setRestoringPersonal(false);
    }
  };

  // Level 2 Unhide — ONLY clears this viewer's archive_ui_visibility row.
  // Never touches asset_user_states / videos.archived_at /
  // campaigns.archived_at. See archiveUiVisibility.ts.
  const handleUnhide = async () => {
    if (!user) return;
    setArchiveActionError(null);
    setUnhiding(true);
    try {
      await unhideAssetForUser(asset.id, user.id);
      await refetchArchiveContext();
    } catch (err: any) {
      setArchiveActionError(err.message || 'Could not unhide this asset.');
    } finally {
      setUnhiding(false);
    }
  };

  // Thumbnail source, branched by origin — campaign_element has no
  // thumbnail_url column at all, it's purely element_type -> static image
  // (same resolver Assignment Picker / Assignment Detail already use).
  // video/asset_resource keep the existing resolveAssetThumbnail path,
  // unchanged from before this pass.
  const thumbnailSrc =
    resource?.origin === 'campaign_element'
      ? resolveElementThumbnail((resource.resourceType ?? 'landing_page') as CampaignElementType)
      : resource?.thumbnailUrl || resource?.resourceType
      ? resolveAssetThumbnail({
          thumbnail_url: resource?.thumbnailUrl ?? null,
          resource_type: resource?.resourceType ?? 'other',
          platform: resource?.platform ?? null,
        })
      : null;

  // Type label, branched by origin — campaign_element's resourceType field
  // carries element_type, which lives in a separate dictionary
  // (getElementTypeLabel), not RESOURCE_TYPE_LABELS. Deliberately not
  // merged into one dictionary — see prior Domain Model discussion.
  const typeLabel =
    resource?.origin === 'campaign_element'
      ? getElementTypeLabel((resource.resourceType ?? 'landing_page') as CampaignElementType)
      : resource?.resourceType
      ? RESOURCE_TYPE_LABELS[resource.resourceType as ResourceType] ?? resource.resourceType
      : asset.asset_type;

  const isArchived = !!archiveContext?.isArchived;
  const isLevel2 = archiveContext?.level === 'level2';

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/assets" className="flex items-center gap-2 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest">
        <ArrowLeft size={14} /> Back to Library
      </Link>

      {/* Title — always the human-readable name (video_title / resource
          title / campaign_element display_name), never a type/category
          value. Type is a separate field below, not folded into this. */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          {resource?.title || 'Untitled Asset'}
          {isArchived && !isLevel2 && (
            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-full">
              <ArchiveRestore size={10} /> Archived
            </span>
          )}
          {isLevel2 && (
            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-500/10 border border-zinc-500/20 px-2 py-1 rounded-full">
              <EyeOff size={10} /> Archived · Hidden
            </span>
          )}
        </h1>
        {resource?.deletedAt && (
          <span className="inline-block mt-2 text-[9px] font-black uppercase text-red-600 tracking-widest">
            Original content deleted
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left column (~40%) — Thumbnail + primary action */}
        <div className="md:w-2/5 space-y-3">
          {thumbnailSrc && (
            <div className="w-full aspect-video bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex items-center justify-center">
              <img src={thumbnailSrc} className="max-w-full max-h-full object-contain" />
            </div>
          )}

          {/* Only Video has its own detail page today — shown only when
              the resolved resource's origin is the `videos` table. Adding
              a second source detail page later means adding one more
              origin check here, not restructuring this section. */}
          {resource?.origin === 'video' && (
            <Link
              to={`/videos/${resource.originId}`}
              className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl px-4 py-3 transition-all"
            >
              <VideoIcon size={12} /> Open Video Detail
            </Link>
          )}

          {/* Individual Asset Analytics — diagnostic/validation surface
              (see pages/AssetAnalytics.tsx). Works for all three asset
              types since it's driven by the shared getAssetAnalytics()
              service, not by resource.origin like the Video Detail link
              above. Deliberately plain — this is a validation entry
              point, not a polished CTA. */}
          <Link
            to={`/assets/${asset.id}/analytics`}
            className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl px-4 py-3 transition-all"
          >
            <BarChart3 size={12} /> Asset Analytics 
          </Link>

          {/* ---- Archive reasons + actions — driven entirely by the
              central resolver. Level 2 (Hidden) collapses to a single
              Unhide action, per LOCKED design ("Level 2 Restore = Unhide
              only", never a true-state restore). Level 1 lists every
              applicable reason with its own action. */}
          {isArchived && isLevel2 && (
            <button
              onClick={handleUnhide}
              disabled={unhiding}
              className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl px-4 py-3 transition-all disabled:opacity-50"
            >
              {unhiding ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />}
              {unhiding ? 'Unhiding...' : 'Unhide'}
            </button>
          )}

          {isArchived && !isLevel2 && archiveContext && (
            <div className="space-y-2">
              {archiveContext.reasons.map(reason => (
                <div
                  key={`${reason.sourceType}-${reason.sourceId}`}
                  className="flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-300">
                    {reason.sourceType === 'personal' && 'Archived by You'}
                    {reason.sourceType === 'video' && `Source Video Archived${reason.sourceName ? `: ${reason.sourceName}` : ''}`}
                    {reason.sourceType === 'campaign' && `Campaign Archived${reason.sourceName ? `: ${reason.sourceName}` : ''}`}
                  </span>

                  {reason.sourceType === 'personal' && (
                    <button
                      onClick={handleRestorePersonal}
                      disabled={restoringPersonal}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-white bg-zinc-950 hover:bg-black border border-zinc-700 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50 shrink-0"
                    >
                      {restoringPersonal ? <Loader2 size={10} className="animate-spin" /> : <ArchiveRestore size={10} />}
                      Restore
                    </button>
                  )}

                  {reason.sourceType === 'video' && (
                    <Link
                      to={`/videos/${reason.sourceId}`}
                      className="text-[10px] font-black uppercase tracking-widest text-white bg-zinc-950 hover:bg-black border border-zinc-700 rounded-lg px-3 py-1.5 transition-all shrink-0"
                    >
                      Go to Video
                    </Link>
                  )}

                  {reason.sourceType === 'campaign' && (
                    /* ASSUMPTION FLAGGED — see file header UPDATE note:
                       route path not confirmed. */
                    <Link
                      to={`/campaigns/${reason.sourceId}`}
                      className="text-[10px] font-black uppercase tracking-widest text-white bg-zinc-950 hover:bg-black border border-zinc-700 rounded-lg px-3 py-1.5 transition-all shrink-0"
                    >
                      Go to Campaign
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          {archiveActionError && (
            <p className="text-[10px] text-red-500">{archiveActionError}</p>
          )}
        </div>

        {/* Right column (~60%) — Type / Created / Source. General Info
            (Asset ID, Library status) removed entirely — no display value
            once an asset can even be viewed here, it's already in the
            Library by definition.

            Sharing Information UI intentionally NOT added here yet —
            Phase 1 of this pass only verifies getAssetSharingInfo's data
            shape via console.log (see useEffect above). Phase 2 will add
            a "Sharing Information" section here once the data is
            confirmed correct. */}
        <div className="md:w-3/5">
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            {/* Type */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Type</p>
              <p className="text-sm text-white">{typeLabel}</p>
            </div>

            {/* Created */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Created</p>
              <p className="text-sm text-white">
                {new Date(asset.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>

            {/* Source — generic: renders whatever resolved, regardless of origin table */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Source</p>
              {resource?.url ? (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 truncate"
                >
                  <ExternalLink size={12} className="shrink-0" />
                  <span className="truncate">{resource.url}</span>
                </a>
              ) : (
                <p className="text-sm text-zinc-500">No linked source URL.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    
    {/* Sharing Information */}
<div>
  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
    Sharing Information
  </p>

  {sharingError ? (
    <p className="text-sm text-zinc-500">
      Could not load sharing information.
    </p>
  ) : !sharingInfo || sharingInfo.assignments.length === 0 ? (
    <p className="text-sm text-zinc-500">
      This asset has not been shared.
    </p>
  ) : (
    <div className="space-y-4">
      {sharingInfo.assignments.map((assignment) => (
        <div
          key={assignment.assignmentId}
          className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
        >
          <p className="text-sm font-semibold text-white">
            {assignment.assignmentTitle}
          </p>

          <div className="mt-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Shared by
            </p>

            <p className="text-sm text-white">
              {assignment.sharedBy.name}
            </p>

            {assignment.sharedBy.email && (
              <p className="text-xs text-zinc-500">
                {assignment.sharedBy.email}
              </p>
            )}
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              {assignment.collaboratorCount}{' '}
              {assignment.collaboratorCount === 1
                ? 'Collaborator'
                : 'Collaborators'}
            </p>

            <div className="mt-2 space-y-2">
              {assignment.collaborators.map((person) => (
                <div key={person.id}>
                  <p className="text-sm text-white">
                    {person.name}
                  </p>

                  {person.email && (
                    <p className="text-xs text-zinc-500">
                      {person.email}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
</div> 
);
}
