/**
 * src/services/asset/getAssetDetail.ts
 *
 * Page-level loader for AssetDetail.tsx. Composes the low-level
 * getAsset.ts identity fetch with a resolved "resource" representation —
 * the generic, display-ready shape produced by whichever underlying
 * source table backs this asset today.
 *
 * DOMAIN NOTE: "Asset -> Resource" is a domain-layer abstraction, not a
 * database relationship. There is no single `resources` table. Today:
 *   asset_type: 'video'            -> metadata lives in `videos`           (legacy)
 *   asset_type: 'resource'         -> metadata lives in `asset_resources`  (native, Import Asset)
 *   asset_type: 'campaign_element' -> no resolved source yet (deliberately out of scope,
 *                                      same as listAssetsByOrganization.ts's exclusion)
 * This loader hides that branching behind one normalized shape so
 * AssetDetail.tsx never needs to know which table backed the data, and
 * never has to assume every Asset is a Video.
 *
 * NOT responsible for: analytics, attribution, promotion tracking,
 * assignment relationships, comments, timeline. Those are separate, later
 * concerns and must not be pulled into this loader.
 *
 * DUPLICATION NOTE: resource resolution here intentionally overlaps in
 * behavior with listAssetsByOrganization.ts (same video/resource
 * precedence, same field mapping) but not in query shape — that one is
 * list-scoped (many rows, LEFT-join style), this one is single-asset-
 * scoped (`maybeSingle`). If the merge/precedence rules change in one,
 * check the other — this was a deliberate smallest-change tradeoff, not
 * an oversight to leave unrevisited forever.
 *
 * Does NOT migrate existing video-assets into asset_resources. `videos`
 * remains a first-class, permanent source table for asset_type: 'video'
 * — this loader is an adapter over it, not a step toward deprecating it.
 *
 * Callers:
 *   - pages/AssetDetail.tsx
 */

import { supabase } from '../../lib/supabase';
import { getAsset } from './getAsset';
import type { Asset } from '../../lib/supabase';

/**
 * Generic, display-ready resource representation. Deliberately
 * source-agnostic — the Source section should render this shape without
 * knowing or caring whether it came from `videos` or `asset_resources`.
 *
 * Named distinctly from createAssetResource.ts's `AssetResource` (a raw
 * `asset_resources` DB row) to avoid confusion between the two — this is
 * a resolved *view*, not a table row.
 */
export interface AssetResourceView {
  /**
   * Which table this was resolved from. Used only to decide whether a
   * reciprocal "Open Video Detail" link applies — not for branching
   * display logic, which should stay generic.
   */
  origin: 'video' | 'asset_resource';
  originId: string;
  title: string | null;
  thumbnailUrl: string | null;
  platform: string | null;
  resourceType: string | null;
  url: string | null;
  description: string | null;
  deletedAt: string | null;
}

export interface AssetDetail {
  asset: Asset;
  /** null when no source has been resolved yet (e.g. campaign_element assets today). */
  resource: AssetResourceView | null;
}

export async function getAssetDetail(assetId: string): Promise<AssetDetail | null> {
  const asset = await getAsset(assetId);
  if (!asset) return null;

  const resource = await resolveAssetResource(asset);
  return { asset, resource };
}

// ── Resource resolution ─────────────────────────────────────────────────
// Branches on asset_type, same precedence as listAssetsByOrganization.ts.
// Only 'video' and 'resource' are handled; 'campaign_element' (and any
// future unhandled type) resolves to null — no metadata source exists for
// it yet, matching listAssetsByOrganization.ts's deliberate exclusion.
async function resolveAssetResource(asset: Asset): Promise<AssetResourceView | null> {
  if (asset.asset_type === 'resource') {
    const { data, error } = await supabase
      .from('asset_resources')
      .select('id, title, thumbnail_url, platform, resource_type, url, description')
      .eq('asset_id', asset.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      origin: 'asset_resource',
      originId: data.id,
      title: data.title ?? null,
      thumbnailUrl: data.thumbnail_url ?? null,
      platform: data.platform ?? null,
      resourceType: data.resource_type ?? null,
      url: data.url ?? null,
      description: data.description ?? null,
      // asset_resources rows have no soft-delete concept today.
      deletedAt: null,
    };
  }

  if (asset.asset_type === 'video') {
    const { data, error } = await supabase
      .from('videos')
      .select('id, video_title, thumbnail_url, platform, deleted_at')
      .eq('asset_id', asset.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      origin: 'video',
      originId: data.id,
      title: data.video_title ?? null,
      thumbnailUrl: data.thumbnail_url ?? null,
      platform: data.platform ?? null,
      resourceType: 'video',
      // videos has no url/description columns — not guessed, left null.
      url: null,
      description: null,
      deletedAt: data.deleted_at ?? null,
    };
  }

  return null;
}
