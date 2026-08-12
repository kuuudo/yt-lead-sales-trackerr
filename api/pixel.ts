import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const config = {
  api: { bodyParser: true },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

    const {
    token,
    video_id,
    campaign_id,
    event_type,
    amount,
    session_id,
    first_touch_redirect_link_id,
    redirect_link_id,
    conversion_id,
  } = req.body;
console.log('PIXEL BODY', {
  session_id,
  video_id,
  campaign_id,
  token,
  first_touch_redirect_link_id,
  redirect_link_id,
});
  if (!token && !video_id && !campaign_id && !first_touch_redirect_link_id) {
    return res.status(400).json({
      error: 'Missing token or video_id',
    });
  }

    let resolvedVideoId = video_id;
  if (resolvedVideoId === 'unknown') {
  resolvedVideoId = null;
  }
  let resolvedCampaignId = campaign_id;
  let resolvedUserId: string | null = null;
  let resolvedOrganizationId: string | null = null;
  let resolvedPromotionId: string | null = null;
  let resolvedAssetId: string | null = null;
  let resolvedTrackingHostname: string | null = null;

  let campaign: any = null;

    // ── First-touch: analytics / org context ONLY ───────────────────────────
  // first_touch_redirect_link_id is a carrier. It must NEVER override
  // resolvedCampaignId / resolvedVideoId used for pricing_version lookup.
  // It may still supply organization_id / promotion_id / asset_id /
  // tracking_hostname when the body did not already carry them.
  if (first_touch_redirect_link_id) {
    const { data: ftLink } = await supabase
      .from('redirect_links')
      .select('video_id, campaign_id, organization_id, promotion_id, asset_id, tracking_hostname')
      .eq('id', first_touch_redirect_link_id)
      .maybeSingle();

    if (ftLink) {
      // Do NOT assign resolvedVideoId / resolvedCampaignId from ftLink.
      if (!resolvedOrganizationId) resolvedOrganizationId = ftLink.organization_id;
      if (!resolvedPromotionId) resolvedPromotionId = ftLink.promotion_id;
      if (!resolvedAssetId) resolvedAssetId = ftLink.asset_id;
      if (!resolvedTrackingHostname) resolvedTrackingHostname = ftLink.tracking_hostname;
    } else {
      console.warn(
        '[pixel] first_touch_redirect_link_id provided but no matching redirect_links row:',
        first_touch_redirect_link_id
      );
    }
  }

  // Token path: fill current campaign/video only when body did not supply them
  // (backward-compatible cold / partial payloads).
  if (token && (!resolvedCampaignId || !resolvedVideoId)) {
    const { data: link } = await supabase
      .from('redirect_links')
      .select('video_id, campaign_id')
      .eq('token', token)
      .single();

    if (link) {
      if (!resolvedVideoId) resolvedVideoId = link.video_id;
      if (!resolvedCampaignId) resolvedCampaignId = link.campaign_id;
    }
  }
  console.log("PIXEL STATE:", {
  session_id,
  video_id,
  campaign_id,
  resolvedCampaignId,
  resolvedVideoId,
  resolvedUserId
});
console.log('AFTER TOKEN RESOLUTION', {
  resolvedVideoId,
  resolvedCampaignId,
});
    // Load campaign (user/org) + active pricing version (source of truth for amount)
  let pricingVersion: any = null;

  if (resolvedCampaignId) {
    const { data } = await supabase
      .from('campaigns')
      .select(`user_id, organization_id`)
      .eq('id', resolvedCampaignId)
      .single();

    campaign = data;

    if (campaign) {
      resolvedUserId = campaign.user_id;
    }

    // Active pricing version at event time (server now).
    const eventTimeIso = new Date().toISOString();
    const { data: versionRow } = await supabase
      .from('campaign_pricing_versions')
      .select(`
        id,
        offer_price,
        consultation_fee,
        estimated_close_rate,
        base_offer_value,
        upsell_probability,
        average_upsell_value
      `)
      .eq('campaign_id', resolvedCampaignId)
      .lte('effective_from', eventTimeIso)
      .or(`effective_to.is.null,effective_to.gt.${eventTimeIso}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    pricingVersion = versionRow;

    // Fallback: current version if range query returns nothing
    if (!pricingVersion) {
      const { data: currentVer } = await supabase
        .from('campaign_pricing_versions')
        .select(`
          id,
          offer_price,
          consultation_fee,
          estimated_close_rate,
          base_offer_value,
          upsell_probability,
          average_upsell_value
        `)
        .eq('campaign_id', resolvedCampaignId)
        .is('effective_to', null)
        .maybeSingle();
      pricingVersion = currentVer;
    }
  }

    const finalEventType = event_type ?? 'unknown';

  // Amount is ALWAYS resolved server-side from the active pricing version.
  // Client-supplied amount is ignored so installed pixels never need reinstall.
  let finalAmount: number | null = 0;
  let resolvedPricingVersionId: string | null = pricingVersion?.id ?? null;

  if (pricingVersion) {
    if (finalEventType === 'purchase') {
      finalAmount = Number(pricingVersion.offer_price ?? 0);
    } else if (
      finalEventType === 'consultation' ||
      finalEventType === 'consultation_confirmed'
    ) {
      finalAmount = Number(pricingVersion.consultation_fee ?? 0);
    } else if (finalEventType === 'sales_call') {
      // Existing EV formula — do not change the math
      const closeRate =
        (Number(pricingVersion.estimated_close_rate ?? 0)) / 100;
      const upsellProbability =
        (Number(pricingVersion.upsell_probability ?? 0)) / 100;
      const baseOffer = Number(pricingVersion.base_offer_value ?? 0);
      const upsellValue = Number(pricingVersion.average_upsell_value ?? 0);
      finalAmount = Number(
        (
          closeRate * baseOffer +
          closeRate * upsellProbability * upsellValue
        ).toFixed(2)
      );
    } else {
      // newsletter, checkout_intent, etc.
      finalAmount = 0;
    }
  } else {
    finalAmount = 0;
  }
console.log('INSERTING PURCHASE', {
  campaign_id: resolvedCampaignId,
  video_id: resolvedVideoId,
  organization_id: campaign?.organization_id,
});

console.log("FINAL CHECK BEFORE INSERT:", {
  user: resolvedUserId,
  org: campaign?.organization_id
});
console.log('INSERT VALUES', {
  token: token ?? null,
  video_id: resolvedVideoId ?? null,
  campaign_id: resolvedCampaignId ?? null,
  user_id: resolvedUserId,
  organization_id: resolvedOrganizationId ?? campaign?.organization_id ?? null,
  promotion_id: resolvedPromotionId ?? null,
  amount: finalAmount,
  event_type: finalEventType,
  session_id: session_id ?? null,
});

// Insert into pixel_purchases (conversion_id = idempotency key for thank-you pixels)
const { error: purchaseError } =
  await supabase
    .from('pixel_purchases')
    .insert({
      token: token ?? null,
      video_id: resolvedVideoId ?? null,
      campaign_id: resolvedCampaignId ?? null,
      user_id: resolvedUserId,
      organization_id: resolvedOrganizationId ?? campaign?.organization_id ?? null,
      promotion_id: resolvedPromotionId ?? null,
      amount: finalAmount,
      pricing_version_id: resolvedPricingVersionId,
      event_type: finalEventType,
      session_id: session_id ?? null,
      conversion_id: conversion_id ?? null,
    });

  if (purchaseError) {
    // Duplicate conversion_id (thank-you refresh) → success, no second row
    const isDuplicateConversion =
      purchaseError.code === '23505' &&
      typeof conversion_id === 'string' &&
      conversion_id.length > 0;

    if (isDuplicateConversion) {
      console.log(
        `♻️ Pixel duplicate conversion_id ignored — event: ${finalEventType}, conversion_id: ${conversion_id}`
      );
      return res.status(200).json({
        received: true,
        duplicate: true,
      });
    }

    console.error(
      'Failed to insert pixel_purchase:',
      purchaseError
    );

    return res.status(500).json({
      error: 'Database insert failed',
    });
  }

  // Also log event
  if (
    resolvedVideoId &&
    resolvedCampaignId
  ) {
    const oneHourAgo = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();

    const { data: session } =
      await supabase
        .from('sessions')
        .select('id')
        .eq('video_id', resolvedVideoId)
        .gte('created_at', oneHourAgo)
        .order('created_at', {
          ascending: false,
        })
        .limit(1)
        .single();

    if (session) {
      await supabase
        .from('events')
        .insert({
          session_id: session.id,
          video_id: resolvedVideoId,
          campaign_id:
            resolvedCampaignId,
          organization_id:
            resolvedOrganizationId ?? campaign?.organization_id ?? null,
          promotion_id: resolvedPromotionId ?? null,
          asset_id: resolvedAssetId ?? null,
          tracking_hostname: resolvedTrackingHostname ?? null,
          redirect_link_id: redirect_link_id ?? null,
          event_type: finalEventType,
          value: finalAmount,
        });
    }
  }

  console.log(
    `✅ Pixel recorded — event: ${finalEventType}, amount: ${finalAmount}`
  );

  return res.status(200).json({
    received: true,
  });
}