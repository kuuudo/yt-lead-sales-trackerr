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
 * No edit, no delete, no analytics, no attribution, no timeline, no
 * comments, no assignment/promotion relationships beyond the read-only
 * Sharing Information display above — explicitly out of scope for this
 * pass.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ExternalLink, Video as VideoIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { getAssetDetail } from '../services/asset/getAssetDetail';
import type { AssetDetail as AssetDetailData } from '../services/asset/getAssetDetail';
import { getAssetSharingInfo } from '../services/asset/getAssetSharingInfo';
import type { AssetSharingInfo } from '../services/asset/getAssetSharingInfo';
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

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      setError(null);
      setSharingError(null);

      // Two independent, differently-scoped queries composed at the page
      // level — same pattern as Assets.tsx's Promise.all([My, Shared,
      // Assigned]). getAssetSharingInfo needs the viewer's id; if there's
      // no authenticated user yet, skip that fetch rather than calling it
      // with a bad id — the asset detail itself doesn't require a viewer.
      const [assetResult, sharingResult] = await Promise.all([
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
        // Phase 1 verification log — remove once Sharing Information UI
        // is built on top of this in Phase 2. Confirms shape: viewer-
        // filtered assignments[], each with sharedBy/viewerRole/
        // collaboratorCount/collaborators, no status field anywhere.
        
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

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/assets" className="flex items-center gap-2 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest">
        <ArrowLeft size={14} /> Back to Library
      </Link>

      {/* Title — always the human-readable name (video_title / resource
          title / campaign_element display_name), never a type/category
          value. Type is a separate field below, not folded into this. */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          {resource?.title || 'Untitled Asset'}
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