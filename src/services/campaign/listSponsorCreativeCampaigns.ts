/**
 * Sponsor-org campaign helpers for Create Assignment Creative Content.
 * Scope is always the Sponsor organization_id (assignments.organization_id).
 * Does not use Marketer org.
 */

import { supabase } from '../../lib/supabase';

export interface SponsorCampaignOption {
  id: string;
  campaign_name: string;
  is_system: boolean;
}

/**
 * Resolve the Sponsor organization's system "ONLY PROMOTE ASSET" campaign.
 * Requires is_system = true AND exact name — not name-only or is_system-only.
 */
export async function getOnlyPromoteAssetCampaign(
  sponsorOrganizationId: string
): Promise<SponsorCampaignOption | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, campaign_name, is_system')
    .eq('organization_id', sponsorOrganizationId)
    .eq('is_system', true)
    .eq('campaign_name', 'ONLY PROMOTE ASSET')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve ONLY PROMOTE ASSET: ${error.message}`);
  }
  if (!data) return null;
  return {
    id: data.id as string,
    campaign_name: data.campaign_name as string,
    is_system: true,
  };
}

/**
 * Normal (non-system) active campaigns for the Sponsor organization.
 * ONLY PROMOTE ASSET is never included.
 */
export async function listNormalSponsorCampaigns(
  sponsorOrganizationId: string
): Promise<SponsorCampaignOption[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, campaign_name, is_system, archived_at')
    .eq('organization_id', sponsorOrganizationId)
    .eq('is_system', false)
    .is('archived_at', null)
    .order('campaign_name', { ascending: true });

  if (error) {
    throw new Error(`Failed to list Sponsor campaigns: ${error.message}`);
  }

  return (data ?? []).map(c => ({
    id: c.id as string,
    campaign_name: (c.campaign_name as string) ?? 'Campaign',
    is_system: false,
  }));
}
