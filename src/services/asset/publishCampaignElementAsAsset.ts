/**
 * src/services/asset/publishCampaignElementAsAsset.ts
 *
 * Publishes ONE Campaign element (e.g. its Landing Page URL) as a
 * standalone Asset. The Campaign itself never becomes an Asset — only
 * individual elements do, per Design Lock.
 *
 * Mirrors the existing assets -> videos pattern: assets stays minimal
 * (id, organization_id, asset_type, created_at), and campaign_element_assets
 * carries the type-specific fields — same shape createVideo.ts/createAsset.ts
 * already established for asset_type = 'video'.
 *
 * Deliberately does NOT store destination_url. campaigns[source_field]
 * remains the single source of truth for the URL — resolving it is a
 * later concern (Redirect Builder), not this service's job. Storing it
 * here would create exactly the two-sources-of-truth drift problem this
 * was designed to avoid.
 *
 * One published Asset per (campaign_id, source_field) — enforced by a
 * unique constraint (Migration 012), which is also what makes the
 * "Already Published" UI check possible.
 */

import { supabase } from '../../lib/supabase';
import type { CampaignElementType } from '../../lib/videoFormatters';

export interface PublishCampaignElementInput {
  organizationId: string;
  campaignId: string;
  elementType: CampaignElementType;
  /** The campaigns column this was published from, e.g. 'landing_page_url'. */
  sourceField: string;
  displayName: string;
}

export interface PublishCampaignElementResult {
  assetId: string;
}

export async function publishCampaignElementAsAsset({
  organizationId,
  campaignId,
  elementType,
  sourceField,
  displayName,
}: PublishCampaignElementInput): Promise<PublishCampaignElementResult> {
  if (!displayName.trim()) {
    throw new Error('Display name is required');
  }

  const { data: asset, error: assetErr } = await supabase
    .from('assets')
    .insert({ organization_id: organizationId, asset_type: 'campaign_element' })
    .select('id')
    .single();

  if (assetErr || !asset) {
    throw new Error(assetErr?.message ?? 'Asset insert returned no data');
  }

  const { error: elementErr } = await supabase
    .from('campaign_element_assets')
    .insert({
      asset_id: asset.id,
      campaign_id: campaignId,
      element_type: elementType,
      source_field: sourceField,
      display_name: displayName.trim(),
    });

  if (elementErr) {
    // Compensate: the Asset has no other references yet, safe to delete —
    // same pattern as createVideo.ts / createPromotion.ts.
    await supabase.from('assets').delete().eq('id', asset.id);
    // The unique (campaign_id, source_field) constraint is what surfaces
    // "already published" as a DB error if the UI's own check is somehow
    // stale (e.g. two tabs open) — surface that distinctly.
    if (elementErr.code === '23505') {
      throw new Error(`This element has already been published as an Asset.`);
    }
    throw new Error(`Failed to publish element: ${elementErr.message}`);
  }

  const { error: campaignAssetErr } = await supabase
    .from('campaign_assets')
    .insert({ campaign_id: campaignId, asset_id: asset.id });

  if (campaignAssetErr) {
    await supabase.from('campaign_element_assets').delete().eq('asset_id', asset.id);
    await supabase.from('assets').delete().eq('id', asset.id);
    throw new Error(`Failed to link Asset to Campaign: ${campaignAssetErr.message}`);
  }

  return { assetId: asset.id };
}

export interface PublishedElement {
  asset_id: string;
  source_field: string;
  display_name: string;
  element_type: CampaignElementType;
}

/**
 * Returns every element already published for this Campaign, keyed by
 * source_field, so the UI can show "Already Published / View Asset"
 * instead of the Publish button.
 */
export async function getPublishedElements(
  campaignId: string
): Promise<Record<string, PublishedElement>> {
  const { data, error } = await supabase
    .from('campaign_element_assets')
    .select('asset_id, source_field, display_name, element_type')
    .eq('campaign_id', campaignId);

  if (error) {
    throw new Error(`Failed to load published elements: ${error.message}`);
  }

  const byField: Record<string, PublishedElement> = {};
  for (const row of data ?? []) {
    byField[row.source_field] = row as PublishedElement;
  }
  return byField;
}
