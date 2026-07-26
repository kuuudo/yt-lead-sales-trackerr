/**
 * src/services/asset/resolvePromotionCampaign.ts
 *
 * READ ONLY. Answers: "Does this asset already have a promotion campaign?"
 *
 * Priority:
 *   1. campaign_assets — the strongest, already-formalized relationship,
 *      checked regardless of asset type.
 *   2. Type-specific source of truth (asked via resolveAssetType — the
 *      "badge" — rather than blindly probing every table):
 *        - video            -> videos.campaign_id
 *        - campaign_element -> campaign_element_assets.campaign_id
 *        - resource         -> null (resource assets have no native
 *                              campaign provenance; this is expected,
 *                              not an error — see
 *                              ensureResourcePromotionCampaign.ts)
 *
 * No writes. No inserts. No side effects.
 */

import { supabase } from '../../lib/supabase';
import { resolveAssetType, type AssetType } from './resolveAssetType';

export type ResolvedPromotionCampaign = { campaignId: string } | null;

export async function resolvePromotionCampaign(assetId: string): Promise<ResolvedPromotionCampaign> {
  const { data: caRow, error: caErr } = await supabase
    .from('campaign_assets')
    .select('campaign_id')
    .eq('asset_id', assetId)
    .maybeSingle();
  if (caErr) throw new Error(`campaign_assets lookup failed: ${caErr.message}`);
  if (caRow?.campaign_id) return { campaignId: caRow.campaign_id };

  const { assetType } = await resolveAssetType(assetId);
  return resolveByAssetType(assetId, assetType);
}

async function resolveByAssetType(
  assetId: string,
  assetType: AssetType
): Promise<ResolvedPromotionCampaign> {
  switch (assetType) {
    case 'video': {
      const { data, error } = await supabase
        .from('videos')
        .select('campaign_id')
        .eq('asset_id', assetId)
        .maybeSingle();
      if (error) throw new Error(`videos lookup failed: ${error.message}`);
      return data?.campaign_id ? { campaignId: data.campaign_id } : null;
    }

    case 'campaign_element': {
      const { data, error } = await supabase
        .from('campaign_element_assets')
        .select('campaign_id')
        .eq('asset_id', assetId)
        .maybeSingle();
      if (error) throw new Error(`campaign_element_assets lookup failed: ${error.message}`);
      return data?.campaign_id ? { campaignId: data.campaign_id } : null;
    }

    case 'resource':
      return null;

    default:
      return null;
  }
}
