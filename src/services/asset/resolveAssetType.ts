/**
 * src/services/asset/resolveAssetType.ts
 *
 * The "badge" — tells callers what an asset is and which organization it
 * belongs to, without them needing to probe multiple tables to find out.
 * Shared by resolvePromotionCampaign.ts and ensureResourcePromotionCampaign.ts.
 *
 * READ ONLY.
 *
 * UPDATE (graceful failure): Previously threw `Asset ${assetId} not
 * found` whenever the assets row was unavailable — whether because the
 * asset genuinely doesn't exist, or because the current viewer's RLS
 * policies don't grant visibility into it. That distinction doesn't
 * matter to this function's callers, but the *hard failure* mattered a
 * lot: getAssignmentDetail.ts is a display page, and a promotion-eligibility
 * lookup failing should never crash the whole page. It now returns null
 * instead of throwing. Callers are responsible for deciding what "unknown
 * asset type" means in their context — reject (createAssignment.ts) or
 * degrade gracefully and keep rendering (getAssignmentDetail.ts).
 */

import { supabase } from '../../lib/supabase';

export type AssetType = 'video' | 'campaign_element' | 'resource';

export interface ResolvedAssetType {
  assetId: string;
  assetType: AssetType;
  organizationId: string;
}

export async function resolveAssetType(assetId: string): Promise<ResolvedAssetType | null> {
  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, asset_type, organization_id')
    .eq('id', assetId)
    .maybeSingle();

  if (error) {
    console.warn(`[resolveAssetType] lookup failed for ${assetId}: ${error.message}`);
    return null;
  }
  if (!asset) {
    // Either the asset doesn't exist, or the current viewer's RLS
    // policies don't grant visibility into it. Either way, this is not
    // this function's job to distinguish or escalate.
    return null;
  }

  return {
    assetId: asset.id,
    assetType: asset.asset_type as AssetType,
    organizationId: asset.organization_id,
  };
}
