/**
 * src/services/asset/listAssetsByOrganization.ts
 *
 * Returns Library-visible assets (added_to_library_at IS NOT NULL), joined
 * with `videos`, `asset_resources`, or `campaign_element_assets` depending
 * on asset_type, for display metadata.
 *
 * Consumer: Assets.tsx.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UPDATE (Import Asset pass): now handles two sibling metadata sources
 * instead of one.
 *
 * `videos` embed: still returned as an ARRAY by PostgREST (no UNIQUE on
 * videos.asset_id — unchanged, still an app-level invariant only), so it's
 * still normalized here exactly as before. `!inner` was dropped because
 * not every asset_type has a videos row anymore.
 *
 * `asset_resources` embed: returned as a single OBJECT, not an array —
 * because asset_resources.asset_id DOES have a UNIQUE constraint (locked
 * in the Import Asset schema pass), so PostgREST can correctly infer the
 * 1:1 relationship on its own. No normalization needed for this one; flagging
 * the asymmetry explicitly so a future reader doesn't assume both embeds
 * behave the same way.
 *
 * asset_type was filtered to ['video', 'resource'] as of the Import Asset
 * pass — campaign_element was deliberately excluded then (no display-
 * metadata join existed for it yet, no consumer asked for it). SUPERSEDED
 * by the Campaign Element pass below: that join now exists, and asset_type
 * is filtered to all three.
 *
 * NAMING NOTE: `video_title`/`thumbnail_url`/`platform` are reused as the
 * generic display fields for BOTH videos and asset_resources rows, to avoid
 * a wider rename across Assets.tsx in this pass. `video_title` is a bit of
 * a misnomer for a PDF/Notion row now — flagging as a deliberate smallest-
 * change tradeoff, not a decision to leave unrevisited forever.
 *
 * UPDATE (Campaign Element pass): `campaign_element_assets` is now a third
 * embed, same treatment as `asset_resources` — object-shaped (asset_id is
 * unique on that table too), no array normalization needed. `video_title`
 * now also carries `campaign_element_assets.display_name` verbatim (that
 * column already contains a full human-readable name, e.g. "Campaign X -
 * Landing Page" — not reconstructed here).
 *
 * TEMPORARY FIELD NAME: `video_title` is now a generic display-name field
 * for THREE asset kinds (video / resource / campaign_element), not just
 * video. Kept as-is here to avoid a wider rename across Assets.tsx in this
 * pass — a future pass should rename this to something like `display_name`
 * across AssetLibraryRow and its consumers, but that's a naming cleanup,
 * not part of this integration.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../../lib/supabase';
import type { Asset } from '../../lib/supabase';
import type { ListAssetsByOrganizationInput } from './types';

export interface AssetLibraryRow extends Omit<Asset, 'asset_type'> {
  asset_type: 'video' | 'resource' | 'campaign_element';

  video_id: string | null;
  video_title: string | null;
  thumbnail_url: string | null;
  platform: string | null;
  deleted_at: string | null;
  // New — only populated for asset_type: 'resource' rows.
  asset_resource_id: string | null;
  resource_type: string | null;
  url: string | null;
  // New (Campaign Element pass) — only populated for asset_type:
  // 'campaign_element' rows. No thumbnail_url column on that table — the
  // actual image comes from resolveElementThumbnail(element_type) at
  // render time, same pattern as resource_type driving resolveAssetThumbnail.
  campaign_element_asset_id: string | null;
  element_type: string | null;
}

interface EmbeddedVideo {
  id: string;
  video_title: string | null;
  thumbnail_url: string | null;
  platform: string | null;
  deleted_at: string | null;
}

interface EmbeddedAssetResource {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  platform: string | null;
  resource_type: string | null;
  url: string;
}

interface EmbeddedCampaignElement {
  id: string;
  display_name: string;
  element_type: string;
}

export async function listAssetsByOrganization({
  organizationId,
  filters,
}: ListAssetsByOrganizationInput): Promise<AssetLibraryRow[]> {
  let query = supabase
    .from('assets')
    .select('*, videos(id, video_title, thumbnail_url, platform, deleted_at), asset_resources(id, title, thumbnail_url, platform, resource_type, url), campaign_element_assets(id, display_name, element_type)')
    .eq('organization_id', organizationId)
    .not('added_to_library_at', 'is', null)
    .in('asset_type', ['video', 'resource', 'campaign_element']);

  if (filters?.assetType) {
    query = query.eq('asset_type', filters.assetType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => {
    // videos: still array-shaped (no UNIQUE constraint) — normalize as before.
    const rawVideo = row.videos;
    const video: EmbeddedVideo | undefined = Array.isArray(rawVideo) ? rawVideo[0] : rawVideo;

    // asset_resources: object-shaped (UNIQUE constraint present) — no normalization needed.
    const resource: EmbeddedAssetResource | undefined = row.asset_resources ?? undefined;

    // campaign_element_assets: same as asset_resources — asset_id is unique
    // on this table too, so this is also object-shaped, no array handling needed.
    const rawElement = row.campaign_element_assets;

    

    const element: EmbeddedCampaignElement | undefined =
      Array.isArray(rawElement)
        ? rawElement[0]
        : rawElement;

    const { videos: _omitVideos, asset_resources: _omitResource, campaign_element_assets: _omitElement, ...asset } = row;

    return {
      ...asset,
      video_id: video?.id ?? null,
      video_title: video?.video_title ?? resource?.title ?? element?.display_name ?? null,
      thumbnail_url: video?.thumbnail_url ?? resource?.thumbnail_url ?? null,
      platform: video?.platform ?? resource?.platform ?? null,
      deleted_at: video?.deleted_at ?? null,
      asset_resource_id: resource?.id ?? null,
      resource_type: resource?.resource_type ?? null,
      url: resource?.url ?? null,
      campaign_element_asset_id: element?.id ?? null,
      element_type: element?.element_type ?? null,
    } as AssetLibraryRow;
  });
}