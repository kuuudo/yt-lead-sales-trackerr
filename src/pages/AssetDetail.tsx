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
 * No edit, no delete, no analytics, no attribution, no timeline, no
 * comments, no assignment/promotion relationships — explicitly out of
 * scope for this pass.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ExternalLink, Video as VideoIcon } from 'lucide-react';
import { getAssetDetail } from '../services/asset/getAssetDetail';
import type { AssetDetail as AssetDetailData } from '../services/asset/getAssetDetail';
import { resolveAssetThumbnail, resolveElementThumbnail, getElementTypeLabel, RESOURCE_TYPE_LABELS, type ResourceType, type CampaignElementType } from '../lib/videoFormatters';

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<AssetDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAssetDetail(id);
        if (!data) {
          setError('Asset not found.');
          return;
        }
        setDetail(data);
      } catch (err: any) {
        setError(err.message || 'Could not load this asset.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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
            Library by definition. */}
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
    </div>
  );
}
