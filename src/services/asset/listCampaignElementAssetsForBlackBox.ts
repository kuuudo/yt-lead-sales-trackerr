/**
 * Black Box loader for Create Assignment.
 * Lists Sponsor-org Campaign Element Assets that were published via
 * "Turn into Asset" (campaign_element_assets rows).
 *
 * Not available / not published → simply absent from the list (UI shows
 * "Not available" for that element type). Does not block Assignment.
 */

import { supabase } from '../../lib/supabase';

export type BlackBoxElementType =
  | 'landing_page'
  | 'newsletter'
  | 'sales_call'
  | 'consultation';

export const BLACK_BOX_ELEMENT_TYPES: BlackBoxElementType[] = [
  'landing_page',
  'newsletter',
  'sales_call',
  'consultation',
];

export const BLACK_BOX_ELEMENT_LABELS: Record<BlackBoxElementType, string> = {
  landing_page: 'Sales Page / Direct Purchase',
  newsletter: 'Newsletter',
  sales_call: 'Sales Call',
  consultation: 'Consultation',
};

export interface BlackBoxElementAsset {
  assetId: string;
  title: string;
  elementType: BlackBoxElementType;
  campaignId: string | null;
  campaignName: string | null;
  thumbnail: string | null;
}

/**
 * All published campaign-element assets for a Sponsor organization,
 * limited to the four Black Box element types.
 */
export async function listCampaignElementAssetsForBlackBox(
  sponsorOrganizationId: string
): Promise<BlackBoxElementAsset[]> {
  const { data, error } = await supabase
    .from('assets')
    .select(
      `
      id,
      organization_id,
      asset_type,
      campaign_element_assets (
        display_name,
        element_type,
        campaign_id,
        campaigns ( campaign_name )
      )
    `
    )
    .eq('organization_id', sponsorOrganizationId)
    .eq('asset_type', 'campaign_element');

  if (error) {
    throw new Error(`Failed to list campaign element assets: ${error.message}`);
  }

  const out: BlackBoxElementAsset[] = [];
  for (const row of data ?? []) {
    const elRaw = (row as any).campaign_element_assets;
    const el = Array.isArray(elRaw) ? elRaw[0] : elRaw;
    if (!el) continue;
    const et = el.element_type as string;
    if (!BLACK_BOX_ELEMENT_TYPES.includes(et as BlackBoxElementType)) continue;
    const campRaw = el.campaigns;
    const camp = Array.isArray(campRaw) ? campRaw[0] : campRaw;
    out.push({
      assetId: row.id as string,
      title: (el.display_name as string) || BLACK_BOX_ELEMENT_LABELS[et as BlackBoxElementType],
      elementType: et as BlackBoxElementType,
      campaignId: (el.campaign_id as string) ?? null,
      campaignName: (camp?.campaign_name as string) ?? null,
      thumbnail: null,
    });
  }

  return out;
}
