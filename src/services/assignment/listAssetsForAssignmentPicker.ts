/**
 * src/services/assignment/listAssetsForAssignmentPicker.ts
 *
 * Purely a UI-picker helper. "Select Campaign" here is a filter only —
 * nothing here writes campaign_id anywhere, and nothing here is called
 * by createAssignment.ts itself.
 */

import { supabase } from '../../lib/supabase';

export interface CampaignOption {
  id: string;
  campaign_name: string | null;
}

export interface AssetOption {
  asset_id: string;
  video_title: string | null;
  thumbnail_url: string | null;
}

export async function listCampaignsForOrg(organizationId: string): Promise<CampaignOption[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, campaign_name')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
  return data ?? [];
}

/** Assets belonging to one Campaign, with display info joined from videos — same shape as getAssignmentDetail.ts uses. */
export async function listAssetsForCampaign(campaignId: string): Promise<AssetOption[]> {
  const { data: campaignAssetRows, error: caErr } = await supabase
    .from('campaign_assets')
    .select('asset_id')
    .eq('campaign_id', campaignId);

  if (caErr) throw new Error(`Failed to load campaign assets: ${caErr.message}`);

  const assetIds = (campaignAssetRows ?? []).map(r => r.asset_id);
  if (assetIds.length === 0) return [];

  const { data: videoRows, error: videoErr } = await supabase
    .from('videos')
    .select('asset_id, video_title, thumbnail_url')
    .in('asset_id', assetIds);

  if (videoErr) throw new Error(`Failed to load asset display info: ${videoErr.message}`);

  return (videoRows ?? []).map(v => ({
    asset_id: v.asset_id,
    video_title: v.video_title,
    thumbnail_url: v.thumbnail_url,
  }));
}
