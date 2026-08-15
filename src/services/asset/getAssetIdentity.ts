/**
 * src/services/asset/getAssetIdentity.ts
 *
 * Tiny, display-only lookup for the Asset Analytics diagnostic page.
 *
 * WHY THIS EXISTS: AssetAnalyticsResult (assetAnalyticsEngine.ts) does not
 * surface organization_id anywhere in its output — only assetId,
 * activeSource, dateRange, and rowCounts live in `debug`. organization_id
 * IS the scope boundary for the engine (decision #4 in
 * assetAnalyticsEngine.ts's header) but is never returned, so a diagnostic
 * page that wants to show "which org this asset actually resolved against"
 * has nowhere to get it from getAssetAnalytics() alone.
 *
 * This fetches exactly the same columns getAssetAnalytics.ts already pulls
 * internally from `assets` (id, organization_id, asset_type, created_at,
 * added_to_library_at) — see ASSETS_COLUMNS there — for side-by-side
 * display next to the engine's numbers. It does NOT duplicate any
 * business/scoping logic, does not touch redirect_links/events/purchases,
 * and has no bearing on the engine's own correctness. It exists purely so
 * this validation page can show "Asset ID / Org ID / Type / Created" next
 * to the metrics without guessing at getAssetDetail.ts's return shape
 * (which was not available to author this page).
 *
 * Not imported by assetAnalyticsEngine.ts or getAssetAnalytics.ts, and does
 * not import them either — a standalone, additive read for the UI layer.
 */

import { supabase } from '../../lib/supabase';

export interface AssetIdentity {
  id: string;
  organizationId: string | null;
  assetType: string;
  createdAt: string;
  addedToLibraryAt: string | null;
}

const ASSET_IDENTITY_COLUMNS = 'id, organization_id, asset_type, created_at, added_to_library_at';

export async function getAssetIdentity(assetId: string): Promise<AssetIdentity> {
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_IDENTITY_COLUMNS)
    .eq('id', assetId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch asset identity: ${error?.message ?? 'not found'}`);
  }

  return {
    id: data.id as string,
    organizationId: (data.organization_id as string | null) ?? null,
    assetType: data.asset_type as string,
    createdAt: data.created_at as string,
    addedToLibraryAt: (data.added_to_library_at as string | null) ?? null,
  };
}
