/**
 * Black Box loader for Create Assignment.
 *
 * Model (locked):
 *   Assignment permissions for campaign elements =
 *   concrete campaign_element assets in assignment_assets.
 *   No assignments.allow_*_asset columns.
 *
 * An Assignment may select assets across multiple Campaigns.
 * Creative Mode's creative_campaign_id is independent (where Marketer
 * creates content) and does NOT limit which element assets can be picked.
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

/** Campaign URL field → element type for Publish as Asset */
export const BLACK_BOX_SOURCE_FIELDS: {
  elementType: BlackBoxElementType;
  sourceField: string;
  urlKey: string;
}[] = [
  { elementType: 'landing_page', sourceField: 'landing_page_url', urlKey: 'landing_page_url' },
  { elementType: 'newsletter', sourceField: 'newsletter_url', urlKey: 'newsletter_url' },
  { elementType: 'sales_call', sourceField: 'sales_call_booking_url', urlKey: 'sales_call_booking_url' },
  { elementType: 'consultation', sourceField: 'consultation_booking_url', urlKey: 'consultation_booking_url' },
];

export interface BlackBoxCampaignOption {
  id: string;
  campaignName: string;
}

/** Published asset row (selectable) */
export interface BlackBoxPublishedAsset {
  kind: 'published';
  assetId: string;
  title: string;
  elementType: BlackBoxElementType;
  campaignId: string;
  campaignName: string;
  thumbnail: string | null;
}

/** Campaign link not yet turned into an Asset */
export interface BlackBoxUnpublishedLink {
  kind: 'unpublished';
  campaignId: string;
  campaignName: string;
  elementType: BlackBoxElementType;
  sourceField: string;
  currentUrl: string;
  defaultDisplayName: string;
}

export type BlackBoxRow = BlackBoxPublishedAsset | BlackBoxUnpublishedLink;

export interface BlackBoxCatalog {
  campaigns: BlackBoxCampaignOption[];
  rows: BlackBoxRow[];
}

/**
 * Load Sponsor org normal campaigns + published campaign-element assets
 * + unpublished campaign links (URL present, no published asset yet).
 */
export async function listCampaignElementBlackBoxCatalog(
  sponsorOrganizationId: string
): Promise<BlackBoxCatalog> {
  const { data: campaigns, error: campErr } = await supabase
    .from('campaigns')
    .select(
      `
      id,
      campaign_name,
      is_system,
      archived_at,
      landing_page_url,
      newsletter_url,
      sales_call_booking_url,
      consultation_booking_url
    `
    )
    .eq('organization_id', sponsorOrganizationId)
    .eq('is_system', false)
    .is('archived_at', null)
    .order('campaign_name', { ascending: true });

  if (campErr) {
    throw new Error(`Failed to list campaigns for Black Box: ${campErr.message}`);
  }

  const campaignList = campaigns ?? [];
  const campaignOptions: BlackBoxCampaignOption[] = campaignList.map(c => ({
    id: c.id as string,
    campaignName: (c.campaign_name as string) || 'Campaign',
  }));

  // Published campaign_element assets for this org
  const { data: assetRows, error: assetErr } = await supabase
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
        source_field
      )
    `
    )
    .eq('organization_id', sponsorOrganizationId)
    .eq('asset_type', 'campaign_element');

  if (assetErr) {
    throw new Error(`Failed to list campaign element assets: ${assetErr.message}`);
  }

  const rows: BlackBoxRow[] = [];
  /** campaignId|elementType → published */
  const publishedKey = new Set<string>();

  for (const row of assetRows ?? []) {
    const elRaw = (row as any).campaign_element_assets;
    const el = Array.isArray(elRaw) ? elRaw[0] : elRaw;
    if (!el) continue;
    const et = el.element_type as string;
    if (!BLACK_BOX_ELEMENT_TYPES.includes(et as BlackBoxElementType)) continue;
    const campaignId = (el.campaign_id as string) || '';
    if (!campaignId) continue;
    const camp = campaignList.find(c => c.id === campaignId);
    const campaignName =
      (camp?.campaign_name as string) ||
      campaignOptions.find(c => c.id === campaignId)?.campaignName ||
      'Campaign';
    publishedKey.add(`${campaignId}|${et}`);
    rows.push({
      kind: 'published',
      assetId: row.id as string,
      title: (el.display_name as string) || BLACK_BOX_ELEMENT_LABELS[et as BlackBoxElementType],
      elementType: et as BlackBoxElementType,
      campaignId,
      campaignName,
      thumbnail: null,
    });
  }

  // Unpublished: campaign has URL but no published asset for that element type
  for (const c of campaignList) {
    const campaignId = c.id as string;
    const campaignName = (c.campaign_name as string) || 'Campaign';
    for (const spec of BLACK_BOX_SOURCE_FIELDS) {
      const url = ((c as any)[spec.urlKey] as string | null | undefined)?.trim();
      if (!url) continue;
      const key = `${campaignId}|${spec.elementType}`;
      if (publishedKey.has(key)) continue;
      rows.push({
        kind: 'unpublished',
        campaignId,
        campaignName,
        elementType: spec.elementType,
        sourceField: spec.sourceField,
        currentUrl: url,
        defaultDisplayName: `${campaignName} - ${BLACK_BOX_ELEMENT_LABELS[spec.elementType]}`,
      });
    }
  }

  return { campaigns: campaignOptions, rows };
}

/** @deprecated use listCampaignElementBlackBoxCatalog */
export async function listCampaignElementAssetsForBlackBox(
  sponsorOrganizationId: string
): Promise<
  {
    assetId: string;
    title: string;
    elementType: BlackBoxElementType;
    campaignId: string | null;
    campaignName: string | null;
    thumbnail: string | null;
  }[]
> {
  const catalog = await listCampaignElementBlackBoxCatalog(sponsorOrganizationId);
  return catalog.rows
    .filter((r): r is BlackBoxPublishedAsset => r.kind === 'published')
    .map(r => ({
      assetId: r.assetId,
      title: r.title,
      elementType: r.elementType,
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      thumbnail: r.thumbnail,
    }));
}
