import { supabase, Campaign, LeadMagnet } from '../../lib/supabase';
import { syncCampaignRedirectLinks } from '../../lib/campaignRedirectEngine';

interface SaveCampaignOptions {
  campaignId: string;
  formData: Partial<Campaign>;
  leadMagnets: Partial<LeadMagnet>[];
}

export async function saveCampaign({
  campaignId,
  formData,
  leadMagnets,
}: SaveCampaignOptions) {
   
        const { error: updateErr } = await supabase
          .from('campaigns')
          .update({
            campaign_name: formData.campaign_name,
            landing_page_url: formData.landing_page_url,
            newsletter_url: formData.newsletter_url,
            newsletter_thankyou_url: formData.newsletter_thankyou_url,
            checkout_url: formData.checkout_url,
            purchase_thankyou_url: formData.purchase_thankyou_url,
            offer_price: formData.offer_price,
            uses_stripe: formData.uses_stripe ?? false,
            has_sales_call: formData.has_sales_call,
            sales_call_booking_url: formData.sales_call_booking_url,
            sales_call_thankyou_url: formData.sales_call_thankyou_url,
            estimated_close_rate: formData.estimated_close_rate,
            has_paid_consultation: formData.has_paid_consultation,
            consultation_booking_url: formData.consultation_booking_url,
            paid_consultation_checkout_url: formData.paid_consultation_checkout_url,
            consultation_thankyou_url: formData.consultation_thankyou_url,
            consultation_fee: formData.consultation_fee,
            uses_stripe_consultation: formData.uses_stripe_consultation ?? false,
            has_lead_magnet: formData.has_lead_magnet,
            purchase_method: (formData as any).purchase_method ?? 'stripe_checkout',
            sales_call_delivery: (formData as any).sales_call_delivery ?? 'external_platform',
            average_upsell_value: (formData as any).average_upsell_value ?? 0,
            base_offer_value: (formData as any).base_offer_value ?? 0,
            upsell_probability: (formData as any).upsell_probability ?? 0,
            consultation_delivery: (formData as any).consultation_delivery ?? 'external_platform',
            consultation_payment_method: (formData as any).consultation_payment_method ?? 'stripe_checkout',
          })
          .eq('id', campaignId);
  
        if (updateErr) throw updateErr;

        // Sync campaign-level checkout redirect link (destination_url only — token never changes)
if (formData.checkout_url) {
  await syncCampaignRedirectLinks(campaignId, [
    { linkType: 'checkout', destinationUrl: formData.checkout_url },
  ]);
}
// Handle lead magnets
try {
  await supabase.from('lead_magnets').delete().eq('campaign_id', campaignId);

  if (formData.has_lead_magnet && leadMagnets.length > 0) {
    const magnetsToSave = leadMagnets.map(m => ({
      campaign_id: campaignId,
      lead_magnet_name: m.lead_magnet_name,
      lead_magnet_url: m.lead_magnet_url,
      lead_magnet_thankyou_url: m.lead_magnet_thankyou_url,
    }));

    const { error: insertErr } =
      await supabase.from('lead_magnets').insert(magnetsToSave);

    if (insertErr) throw insertErr;
  }
} catch (err) {
  console.error('Lead Magnet Sync Error:', err);
}  
}

