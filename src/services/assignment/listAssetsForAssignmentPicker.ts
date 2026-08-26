/**
 * src/services/assignment/listAssetsForAssignmentPicker.ts
 *
 * Purely a UI-picker helper. "Select Campaign" here is a filter only —
 * nothing here writes campaign_id anywhere, and nothing here is called
 * by createAssignment.ts itself.
 */

import { supabase } from '../../lib/supabase';
import { resolveElementThumbnail, getElementTypeLabel, type CampaignElementType } from '../../lib/videoFormatters';
import { getAssetArchiveContextsForViewer } from '../asset/getAssetArchiveContext';
export interface CampaignOption {
  id: string;
  campaign_name: string | null;
}

/** Video assets — unchanged, same shape as before. Rendered via videoFormatters.tsx exactly as already locked. */
export interface VideoAssetOption {
  kind: 'video';
  asset_id: string;
  video_title: string | null;
  thumbnail_url: string | null;
  platform?: string | null;
}

/** Campaign-element assets — the new kind. Rendered via resolveElementThumbnail/getElementTypeLabel, not videoFormatters' platform logic. */
export interface CampaignElementAssetOption {
  kind: 'campaign_element';
  asset_id: string;
  display_name: string;
  element_type: CampaignElementType;
  thumbnail_url: string; // always resolved — resolveElementThumbnail never returns null
}

export type AssetOption = VideoAssetOption | CampaignElementAssetOption;

export async function listCampaignsForOrg(organizationId: string): Promise<CampaignOption[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, campaign_name')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
  return data ?? [];
}

/**
 * Assets belonging to one Campaign, split by asset_type and rendered
 * through the appropriate formatter for each kind. Video assets keep the
 * exact same query/shape as before this change — nothing about that path
 * was altered, only extended alongside.
 */
export async function listAssetsForCampaign(campaignId: string, viewerId: string): Promise<AssetOption[]> {
  const { data: campaignAssetRows, error: caErr } = await supabase
    .from('campaign_assets')
    .select('asset_id')
    .eq('campaign_id', campaignId);

  if (caErr) throw new Error(`Failed to load campaign assets: ${caErr.message}`);

  const assetIds = (campaignAssetRows ?? []).map(r => r.asset_id);
  if (assetIds.length === 0) return [];

  const { data: assetRows, error: assetErr } = await supabase
    .from('assets')
    .select('id, asset_type')
    .in('id', assetIds);

  if (assetErr) throw new Error(`Failed to load asset types: ${assetErr.message}`);

  const videoAssetIds = (assetRows ?? []).filter(a => a.asset_type === 'video').map(a => a.id);
  const elementAssetIds = (assetRows ?? []).filter(a => a.asset_type === 'campaign_element').map(a => a.id);

  const results: AssetOption[] = [];

  if (videoAssetIds.length > 0) {
    const { data: videoRows, error: videoErr } = await supabase
      .from('videos')
      .select('asset_id, video_title, thumbnail_url, platform')
      .in('asset_id', videoAssetIds);

    if (videoErr) throw new Error(`Failed to load video asset display info: ${videoErr.message}`);

    for (const v of videoRows ?? []) {
      results.push({
        kind: 'video',
        asset_id: v.asset_id,
        video_title: v.video_title,
        thumbnail_url: v.thumbnail_url,
        platform: (v as any).platform ?? null,
      });
    }
  }

  if (elementAssetIds.length > 0) {
    const { data: elementRows, error: elementErr } = await supabase
      .from('campaign_element_assets')
      .select('asset_id, display_name, element_type')
      .in('asset_id', elementAssetIds);

    if (elementErr) throw new Error(`Failed to load campaign element asset display info: ${elementErr.message}`);

    for (const e of elementRows ?? []) {
      results.push({
        kind: 'campaign_element',
        asset_id: e.asset_id,
        display_name: e.display_name,
        element_type: e.element_type,
        thumbnail_url: resolveElementThumbnail(e.element_type),
      });
    }
  }

  return results;
  if (results.length === 0) return results;

  const archiveContextMap = await getAssetArchiveContextsForViewer(
    results.map(r => ({
      id: r.asset_id,
      assetType: r.kind === 'video' ? 'video' : 'campaign_element',
    })),
    viewerId
  );

  return results.filter(r => !archiveContextMap.get(r.asset_id)?.isArchived);
}
