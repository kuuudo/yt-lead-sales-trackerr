/**
 * src/services/asset/publishCampaignElementAsAsset.ts
 *
 * Publish Campaign Element as Asset
 * 實際建立 Asset 的工作交給
 * publish_campaign_element_as_asset() RPC
 */

import { supabase } from '../../lib/supabase';
import type { CampaignElementType } from '../../lib/videoFormatters';

export interface PublishCampaignElementInput {
  campaignId: string;
  elementType: CampaignElementType;
  sourceField: string;
  displayName: string;
}

export interface PublishCampaignElementResult {
  assetId: string;
}

export async function publishCampaignElementAsAsset({
  campaignId,
  elementType,
  sourceField,
  displayName,
}: PublishCampaignElementInput): Promise<PublishCampaignElementResult> {
  if (!displayName.trim()) {
    throw new Error('Display name is required');
  }

  const { data, error } = await supabase.rpc(
    'publish_campaign_element_as_asset',
    {
      p_campaign_id: campaignId,
      p_element_type: elementType,
      p_source_field: sourceField,
      p_display_name: displayName.trim(),
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    assetId: data as string,
  };
}

export interface PublishedElement {
  asset_id: string;
  source_field: string;
  display_name: string;
  element_type: CampaignElementType;
}

/**
 * 已經 Publish 過哪些 Element
 */
export async function getPublishedElements(
  campaignId: string
): Promise<Record<string, PublishedElement>> {
  const { data, error } = await supabase
    .from('campaign_element_assets')
    .select(
      `
      asset_id,
      source_field,
      display_name,
      element_type
      `
    )
    .eq('campaign_id', campaignId);

  if (error) {
    throw new Error(
      `Failed to load published elements: ${error.message}`
    );
  }

  const result: Record<string, PublishedElement> = {};

  for (const row of data ?? []) {
    result[row.source_field] = row as PublishedElement;
  }

  return result;
}