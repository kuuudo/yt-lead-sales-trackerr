/**
 * src/services/asset/resolveAssetType.ts
 *
 * The "badge" — tells callers what an asset is and which organization it
 * belongs to, without them needing to probe multiple tables to find out.
 * Shared by resolvePromotionCampaign.ts and ensureResourcePromotionCampaign.ts.
 *
 * READ ONLY.
 */

import { supabase } from '../../lib/supabase';

export type AssetType = 'video' | 'campaign_element' | 'resource';

export interface ResolvedAssetType {
  assetId: string;
  assetType: AssetType;
  organizationId: string;
}

export async function resolveAssetType(assetId: string): Promise<ResolvedAssetType> {
  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, asset_type, organization_id')
    .eq('id', assetId)
    .maybeSingle();

  if (error) throw new Error(`resolveAssetType lookup failed for ${assetId}: ${error.message}`);
  if (!asset) throw new Error(`Asset ${assetId} not found`);

  return {
    assetId: asset.id,
    assetType: asset.asset_type as AssetType,
    organizationId: asset.organization_id,
  };
}
