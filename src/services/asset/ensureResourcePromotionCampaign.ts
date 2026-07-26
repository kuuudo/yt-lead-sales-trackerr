/**
 * src/services/asset/ensureResourcePromotionCampaign.ts
 *
 * WRITE ONLY (the sole write path introduced by the START PROMOTING door
 * broadening). Only accepts assets whose type is 'resource'.
 *
 * Flow:
 *   resource asset
 *     -> find organization_id (via resolveAssetType)
 *     -> find that organization's 'ONLY PROMOTE ASSET' system campaign
 *     -> insert campaign_assets row if one doesn't already exist
 *     -> return campaign_id
 *
 * Idempotent: safe to call multiple times for the same asset — the
 * existing row is detected first and no duplicate insert occurs.
 *
 * Does NOT touch asset creation, asset schema, or any other asset type.
 */

import { supabase } from '../../lib/supabase';
import { resolveAssetType } from './resolveAssetType';

const SYSTEM_CAMPAIGN_NAME = 'ONLY PROMOTE ASSET';

export async function ensureResourcePromotionCampaign(assetId: string): Promise<string> {
  const { assetType, organizationId } = await resolveAssetType(assetId);
  if (assetType !== 'resource') {
    throw new Error(
      `ensureResourcePromotionCampaign called on non-resource asset ${assetId} (type: ${assetType})`
    );
  }

  const { data: systemCampaign, error: systemErr } = await supabase
    .from('campaigns')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('campaign_name', SYSTEM_CAMPAIGN_NAME)
    .maybeSingle();
  if (systemErr) throw new Error(`System campaign lookup failed: ${systemErr.message}`);
  if (!systemCampaign) {
    throw new Error(`Organization ${organizationId} has no '${SYSTEM_CAMPAIGN_NAME}' campaign`);
  }

  const { data: existing, error: existingErr } = await supabase
    .from('campaign_assets')
    .select('campaign_id')
    .eq('campaign_id', systemCampaign.id)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (existingErr) throw new Error(`campaign_assets check failed: ${existingErr.message}`);

  if (!existing) {
    const { error: insertErr } = await supabase
      .from('campaign_assets')
      .insert({ campaign_id: systemCampaign.id, asset_id: assetId });
    if (insertErr) {
      throw new Error(`Failed to link resource asset to system campaign: ${insertErr.message}`);
    }
  }

  return systemCampaign.id;
}
