/**
 * src/services/asset/listAssetsByOrganization.ts
 *
 * Returns Library-visible assets (added_to_library_at IS NOT NULL), joined
 * with `videos` OR `asset_resources` depending on asset_type, for display
 * metadata.
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
 * asset_type is explicitly filtered to ['video', 'resource'] — campaign_element
 * assets are deliberately excluded here. There's no display-metadata join
 * for them yet (that would read from campaign_element_assets + a live
 * campaigns lookup, a different shape entirely) and no consumer asking for
 * them in this view. Scoped out on purpose, not an oversight.
 *
 * NAMING NOTE: `video_title`/`thumbnail_url`/`platform` are reused as the
 * generic display fields for BOTH videos and asset_resources rows, to avoid
 * a wider rename across Assets.tsx in this pass. `video_title` is a bit of
 * a misnomer for a PDF/Notion row now — flagging as a deliberate smallest-
 * change tradeoff, not a decision to leave unrevisited forever.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../../lib/supabase';
import type { Asset } from '../../lib/supabase';
import type { ListAssetsByOrganizationInput } from './types';

export interface AssetLibraryRow extends Asset {
  video_id: string | null;
  video_title: string | null;
  thumbnail_url: string | null;
  platform: string | null;
  deleted_at: string | null;
  // New — only populated for asset_type: 'resource' rows.
  asset_resource_id: string | null;
  resource_type: string | null;
  url: string | null;
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

export async function listAssetsByOrganization({
  organizationId,
  filters,
}: ListAssetsByOrganizationInput): Promise<AssetLibraryRow[]> {
  let query = supabase
    .from('assets')
    .select('*, videos(id, video_title, thumbnail_url, platform, deleted_at), asset_resources(id, title, thumbnail_url, platform, resource_type, url)')
    .eq('organization_id', organizationId)
    .not('added_to_library_at', 'is', null)
    .in('asset_type', ['video', 'resource']);

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

    const { videos: _omitVideos, asset_resources: _omitResource, ...asset } = row;

    return {
      ...asset,
      video_id: video?.id ?? null,
      video_title: video?.video_title ?? resource?.title ?? null,
      thumbnail_url: video?.thumbnail_url ?? resource?.thumbnail_url ?? null,
      platform: video?.platform ?? resource?.platform ?? null,
      deleted_at: video?.deleted_at ?? null,
      asset_resource_id: resource?.id ?? null,
      resource_type: resource?.resource_type ?? null,
      url: resource?.url ?? null,
    } as AssetLibraryRow;
  });
}