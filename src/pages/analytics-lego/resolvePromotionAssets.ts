// ─────────────────────────────────────────────────────────────────────────────
// resolvePromotionAssets.ts
//
// Presentation/fetch helper: promotion_id → assets via promotion_assets.
// Includes zero-activity assets (membership table, not facts).
// No metrics, no attribution, no engines.
// Reusable by AllPromotionsAnalytics and later MarketerAnalytics.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase';
import {
  resolveElementThumbnail,
  type CampaignElementType,
} from '../../lib/videoFormatters';

export interface PromotionAssetIdentity {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  assetType: string | null;
}

function pickTitle(asset: any): string {
  if (!asset) return 'Asset';
  if (asset.asset_type === 'campaign_element') {
    const el = Array.isArray(asset.campaign_element_assets)
      ? asset.campaign_element_assets[0]
      : asset.campaign_element_assets;
    return (el?.display_name as string) || 'Campaign element';
  }
  if (asset.asset_type === 'resource') {
    const res = Array.isArray(asset.asset_resources)
      ? asset.asset_resources[0]
      : asset.asset_resources;
    return (res?.title as string) || 'Resource';
  }
  // video / promotional video style
  const vid = Array.isArray(asset.videos) ? asset.videos[0] : asset.videos;
  return (vid?.video_title as string) || (asset.title as string) || 'Asset';
}

function pickThumb(asset: any): string | null {
  if (!asset) return null;
  // Campaign Element — same as AllAssets: public/element-thumbnails via helper
  if (asset.asset_type === 'campaign_element') {
    const el = Array.isArray(asset.campaign_element_assets)
      ? asset.campaign_element_assets[0]
      : asset.campaign_element_assets;
    return resolveElementThumbnail(
      (el?.element_type ?? 'landing_page') as CampaignElementType,
    );
  }
  if (asset.asset_type === 'resource') {
    const res = Array.isArray(asset.asset_resources)
      ? asset.asset_resources[0]
      : asset.asset_resources;
    return (res?.thumbnail_url as string) || null;
  }
  const vid = Array.isArray(asset.videos) ? asset.videos[0] : asset.videos;
  return (vid?.thumbnail_url as string) || null;
}

/**
 * Batch-load assets for many promotions. Returns Map<promotionId, assets[]>.
 * Zero-activity assets included (from promotion_assets membership).
 */
export async function resolvePromotionAssetsByPromotionIds(
  promotionIds: string[],
): Promise<Map<string, PromotionAssetIdentity[]>> {
  const out = new Map<string, PromotionAssetIdentity[]>();
  const ids = promotionIds.filter(id => !!id && !id.startsWith('__'));
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from('promotion_assets')
    .select(
      `
      promotion_id,
      asset_id,
      assets (
        id,
        asset_type,
        videos ( video_title, thumbnail_url ),
        asset_resources ( title, thumbnail_url ),
        campaign_element_assets ( display_name, element_type )
      )
    `,
    )
    .in('promotion_id', ids);

  if (error) {
    console.warn('[resolvePromotionAssets]', error.message);
    return out;
  }

  for (const row of data ?? []) {
    const pid = row.promotion_id as string;
    const asset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
    const identity: PromotionAssetIdentity = {
      id: (asset?.id as string) || (row.asset_id as string),
      title: pickTitle(asset),
      thumbnailUrl: pickThumb(asset),
      assetType: (asset?.asset_type as string) || null,
    };
    const list = out.get(pid) ?? [];
    list.push(identity);
    out.set(pid, list);
  }
  return out;
}
