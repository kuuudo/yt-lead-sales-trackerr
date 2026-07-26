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
 * UPDATE (graceful failure): resolveAssetType() now returns null instead
 * of throwing when the assets row is unavailable (not found, or not
 * RLS-visible to the current viewer). This function propagates that as
 * null too — "cannot resolve a promotion campaign" is the correct answer
 * either way, and this function must never throw for that reason. Only
 * genuine query errors from campaign_assets/videos/campaign_element_assets
 * still throw, same as before.
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

  const resolvedType = await resolveAssetType(assetId);
  if (!resolvedType) {
    // Could not determine asset type (missing, or not RLS-visible).
    // Not this function's job to escalate — just report "no campaign found".
    return null;
  }

  return resolveByAssetType(assetId, resolvedType.assetType);
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
