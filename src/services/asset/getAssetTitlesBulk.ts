/**
 * src/services/asset/getAssetTitlesBulk.ts
 *
 * Bulk, read-only Asset title lookup. Companion to getAssetDetail.ts —
 * same origin/table precedence (asset_resources / videos /
 * campaign_element_assets) and same "title = the human-readable name,
 * never the type/category" rule — but list-scoped (many asset ids at
 * once) rather than single-asset-scoped. Deliberately duplicated rather
 * than generalized, per this codebase's existing convention (see
 * getAssetDetail.ts's own DUPLICATION NOTE re: listAssetsByOrganization.ts,
 * and getAssetArchiveContext.ts's single-entry vs bulk-entry split).
 *
 * Returns ONLY id -> title. Does not return thumbnails, urls,
 * descriptions, deletedAt, or archive state — all of that stays owned by
 * getAssetDetail.ts / getAssetArchiveContext.ts respectively. This is a
 * narrow addition for list/summary views (e.g. Marketplace's Promotion
 * Archive Impact tab) that need a display name for a batch of assets
 * without loading a full AssetDetail per asset.
 *
 * If a title can't be resolved (asset deleted, unhandled asset_type,
 * source row missing, or title itself is null), the returned Map simply
 * has no entry (or a null value) for that id — callers should fall back
 * to something else themselves (e.g. a shortened asset id), same as
 * AssetDetail.tsx's own `resource?.title || 'Untitled Asset'` fallback.
 *
 * Callers:
 *   - services/promotion/getPromotionArchiveImpactForViewer.ts's
 *     consumer, pages/Marketplace.tsx (Archive Impact tab)
 */

import { supabase } from '../../lib/supabase';

export async function getAssetTitlesBulk(assetIds: string[]): Promise<Map<string, string | null>> {
  if (assetIds.length === 0) return new Map();

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, asset_type')
    .in('id', assetIds);

  if (error) {
    throw new Error(`Failed to bulk-load assets for title resolution: ${error.message}`);
  }

  const resourceIds: string[] = [];
  const videoAssetIds: string[] = [];
  const campaignElementAssetIds: string[] = [];

  for (const row of (assets ?? []) as { id: string; asset_type: string }[]) {
    if (row.asset_type === 'resource') resourceIds.push(row.id);
    else if (row.asset_type === 'video') videoAssetIds.push(row.id);
    else if (row.asset_type === 'campaign_element') campaignElementAssetIds.push(row.id);
    // Any other/unhandled asset_type: no branch, resolves to no title —
    // same "silently resolves to null" behavior as getAssetDetail.ts's
    // resolveAssetResource().
  }

  const [resourceTitles, videoTitles, elementTitles] = await Promise.all([
    getResourceTitlesBulk(resourceIds),
    getVideoTitlesBulk(videoAssetIds),
    getCampaignElementTitlesBulk(campaignElementAssetIds),
  ]);

  const result = new Map<string, string | null>();
  for (const [id, title] of resourceTitles) result.set(id, title);
  for (const [id, title] of videoTitles) result.set(id, title);
  for (const [id, title] of elementTitles) result.set(id, title);

  return result;
}

// ── Per-source-table bulk queries — same tables/columns as ─────────────
// getAssetDetail.ts's resolveAssetResource(), confirmed against that
// file plus getAssetArchiveContext.ts's own asset_id-based queries into
// the same two of these three tables.

async function getResourceTitlesBulk(assetIds: string[]): Promise<Map<string, string | null>> {
  if (assetIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('asset_resources')
    .select('asset_id, title')
    .in('asset_id', assetIds);

  if (error) throw new Error(`Failed to bulk-load asset_resources titles: ${error.message}`);
  return new Map(
    (data ?? []).map((row: any) => [row.asset_id as string, (row.title as string | null) ?? null])
  );
}

async function getVideoTitlesBulk(assetIds: string[]): Promise<Map<string, string | null>> {
  if (assetIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('videos')
    .select('asset_id, video_title')
    .in('asset_id', assetIds);

  if (error) throw new Error(`Failed to bulk-load video titles: ${error.message}`);
  return new Map(
    (data ?? []).map((row: any) => [row.asset_id as string, (row.video_title as string | null) ?? null])
  );
}

async function getCampaignElementTitlesBulk(assetIds: string[]): Promise<Map<string, string | null>> {
  if (assetIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('campaign_element_assets')
    .select('asset_id, display_name')
    .in('asset_id', assetIds);

  if (error) throw new Error(`Failed to bulk-load campaign_element display names: ${error.message}`);
  return new Map(
    (data ?? []).map((row: any) => [row.asset_id as string, (row.display_name as string | null) ?? null])
  );
}
