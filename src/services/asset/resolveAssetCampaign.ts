/**
 * D:\Youtube automation\未來山姆\yt-lead-sales-trackerr\src\services\asset\resolveAssetCampaign.ts
 *
 * Single source of truth:
 *
 * Given an asset_id, determine its campaign provenance.
 *
 * Supported:
 *
 * 1. Video Asset
 *    assets
 *      -> videos.asset_id
 *      -> videos.campaign_id
 *
 * 2. Campaign Element Asset
 *    assets
 *      -> campaign_element_assets.asset_id
 *      -> campaign_id
 *
 * Resource Asset intentionally returns null.
 *
 * Resource imports are library content, not campaign-owned assets.
 */


import { supabase } from '../../lib/supabase';


export type AssetCampaignSource =
  | 'video'
  | 'campaign_element'
  | null;


export interface ResolvedAssetCampaign {
  assetId: string;
  campaignId: string | null;
  source: AssetCampaignSource;
}



export async function resolveAssetCampaign(
  assetId: string
): Promise<ResolvedAssetCampaign> {


  // --------------------------------------------------
  // 1. Check asset exists
  // --------------------------------------------------

  const { data: asset, error: assetError } =
    await supabase
      .from('assets')
      .select('id, asset_type')
      .eq('id', assetId)
      .maybeSingle();


  if (assetError) {
    throw new Error(
      `Failed loading asset: ${assetError.message}`
    );
  }


  if (!asset) {
    throw new Error(
      `Asset ${assetId} not found`
    );
  }



  // --------------------------------------------------
  // 2. Video Asset
  // --------------------------------------------------

  if (asset.asset_type === 'video') {


    const { data: video, error } =
      await supabase
        .from('videos')
        .select(`
          campaign_id
        `)
        .eq('asset_id', assetId)
        .maybeSingle();


    if (error) {
      throw new Error(
        `Failed resolving video asset: ${error.message}`
      );
    }


    return {
      assetId,
      campaignId: video?.campaign_id ?? null,
      source: video?.campaign_id
        ? 'video'
        : null
    };

  }



  // --------------------------------------------------
  // 3. Campaign Element Asset
  // --------------------------------------------------

  if (asset.asset_type === 'campaign_element') {


    const { data: element, error } =
      await supabase
        .from('campaign_element_assets')
        .select(`
          campaign_id
        `)
        .eq('asset_id', assetId)
        .maybeSingle();


    if (error) {
      throw new Error(
        `Failed resolving campaign element asset: ${error.message}`
      );
    }


    return {
      assetId,
      campaignId: element?.campaign_id ?? null,
      source: element?.campaign_id
        ? 'campaign_element'
        : null
    };

  }



  // --------------------------------------------------
  // 4. Resource Asset
  // --------------------------------------------------

  return {
    assetId,
    campaignId: null,
    source: null
  };

}