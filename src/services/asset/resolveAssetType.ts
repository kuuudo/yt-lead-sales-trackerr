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

  console.log(
    'resolveAssetType auth',
    await supabase.auth.getUser()
  );

  console.log(
    'resolveAssetType assetId',
    assetId
  );


  // TEMP DEBUG: check current logged-in user
  const user = await supabase.auth.getUser();

  console.log(
    'CURRENT USER',
    user.data.user?.id
  );


  // TEMP DEBUG: can this user see assignment_assets?
  const { data: aa, error: aaError } = await supabase
    .from('assignment_assets')
    .select('*')
    .eq('asset_id', assetId);

  console.log(
    'assignment_assets visible',
    aa,
    aaError
  );


  // TEMP DEBUG: can this user see assignment_collaborators?
  const { data: ac, error: acError } = await supabase
    .from('assignment_collaborators')
    .select('*');

  console.log(
    'assignment_collaborators visible',
    ac,
    acError
  );


  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, asset_type, organization_id')
    .eq('id', assetId)
    .maybeSingle();


  console.log(
    'resolveAssetType result',
    asset,
    error
  );


  if (error) {
    throw new Error(
      `resolveAssetType lookup failed for ${assetId}: ${error.message}`
    );
  }

  if (!asset) {
    throw new Error(`Asset ${assetId} not found`);
  }

  return {
    assetId: asset.id,
    assetType: asset.asset_type as AssetType,
    organizationId: asset.organization_id,
  };
}