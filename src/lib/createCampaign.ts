// src/lib/createCampaign.ts
//
// Shared campaign creation. This is the logic that used to live inline in
// pages/Campaigns.tsx (submitCampaign), moved here unchanged so the Campaigns
// page and the post-signup onboarding create campaigns in exactly the same way:
//   1. insert the `campaigns` row
//   2. insert `campaign_pricing_versions` version 1 (history starts now)
// Nothing else happens here (no redirect-link sync on create, same as before).

import { supabase, type Campaign } from './supabase';

/**
 * Starting values for every field the Campaigns page form begins with.
 * Used by the onboarding so a campaign created there has the same defaults
 * as one created from the Campaigns page. (Campaigns.tsx keeps its own
 * `emptyForm`; keep the two in sync if you add campaign fields.)
 */
export const NEW_CAMPAIGN_DEFAULTS = {
  campaign_name: '',
  landing_page_url: '',
  newsletter_url: '',
  newsletter_thankyou_url: '',
  checkout_url: '',
  purchase_thankyou_url: '',
  offer_price: 0,
  uses_stripe: false,
  has_sales_call: false,
  sales_call_booking_url: '',
  sales_call_thankyou_url: '',
  estimated_close_rate: 0,
  has_paid_consultation: false,
  consultation_booking_url: '',
  paid_consultation_checkout_url: '',
  consultation_thankyou_url: '',
  consultation_fee: 0,
  uses_stripe_consultation: false,
  has_lead_magnet: false,
  purchase_method: 'stripe_checkout' as string,
  sales_call_delivery: 'external_platform' as string,
  average_upsell_value: 0,
  base_offer_value: 0,
  upsell_probability: 0,
  consultation_delivery: 'external_platform' as string,
  consultation_payment_method: 'stripe_checkout' as string,
};

export type CreateCampaignFormData = {
  offer_price?: number | null;
  consultation_fee?: number | null;
  estimated_close_rate?: number | null;
  base_offer_value?: number | null;
  upsell_probability?: number | null;
  average_upsell_value?: number | null;
  [key: string]: unknown;
};

interface CreateCampaignOptions {
  formData: CreateCampaignFormData;
  userId: string;
  organizationId: string | null;
}

/** Creates a campaign + its pricing version 1. Throws on any failure. */
export async function createCampaign({
  formData,
  userId,
  organizationId,
}: CreateCampaignOptions): Promise<Campaign> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert([{ ...formData, user_id: userId, organization_id: organizationId }])
    .select();
  if (error) throw new Error(`${error.message} \u2014 ${error.details}`);

  const created = data?.[0];
  if (!created) throw new Error('Campaign was not returned after saving.');

  // Pricing version 1 for the new campaign (history starts now)
  const nowIso = new Date().toISOString();
  const { error: versionErr } = await supabase
    .from('campaign_pricing_versions')
    .insert([
      {
        campaign_id: created.id,
        version: 1,
        effective_from: nowIso,
        effective_to: null,
        offer_price: formData.offer_price ?? 0,
        consultation_fee: formData.consultation_fee ?? 0,
        estimated_close_rate: formData.estimated_close_rate ?? 0,
        base_offer_value: formData.base_offer_value ?? 0,
        upsell_probability: formData.upsell_probability ?? 0,
        average_upsell_value: formData.average_upsell_value ?? 0,
      },
    ]);
  if (versionErr) {
    // Campaign row exists; surface version failure so it can be fixed
    throw new Error(`Campaign created but pricing version failed: ${versionErr.message}`);
  }

  return created as Campaign;
}
