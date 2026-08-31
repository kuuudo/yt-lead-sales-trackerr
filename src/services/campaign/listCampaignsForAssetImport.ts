/**
 * src/services/campaign/listCampaignsForAssetImport.ts
 *
 * Campaign options for the Import Asset picker. Excludes the auto-created
 * "ONLY PROMOTE ASSET" system campaign (is_system = true — same invariant
 * every other campaign picker in the app already follows) and excludes
 * archived campaigns (archived_at IS NOT NULL).
 */

import { supabase } from '../../lib/supabase';

export interface CampaignPickerOption {
  id: string;
  campaign_name: string;
}

export async function listCampaignsForAssetImport(
  organizationId: string
): Promise<CampaignPickerOption[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, campaign_name')
    .eq('organization_id', organizationId)
    .eq('is_system', false)
    .is('archived_at', null)
    .order('campaign_name');

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}