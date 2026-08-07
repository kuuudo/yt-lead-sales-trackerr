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

  // ── PR C: First Touch Attribution — Database is the Authority ──────────
  // first_touch_redirect_link_id is a carrier only. Browser-supplied.
  // video_id/campaign_id/organization_id/promotion_id/asset_id/
  // tracking_hostname are NEVER trusted when this is present — only the
  // redirect_links row itself is. redirect_link_id (below, separately) is
  // NOT used here — it describes the current event only, it carries no
  // attribution authority and must never be used to resolve attribution.
  if (first_touch_redirect_link_id) {
    const { data: ftLink } = await supabase
      .from('redirect_links')
      .select('video_id, campaign_id, organization_id, promotion_id, asset_id, tracking_hostname')
      .eq('id', first_touch_redirect_link_id)
      .maybeSingle();

    if (ftLink) {
      resolvedVideoId = ftLink.video_id;
      resolvedCampaignId = ftLink.campaign_id;
      resolvedOrganizationId = ftLink.organization_id;
      resolvedPromotionId = ftLink.promotion_id;
      resolvedAssetId = ftLink.asset_id;
      resolvedTrackingHostname = ftLink.tracking_hostname;
    } else {
      console.warn('[pixel] first_touch_redirect_link_id provided but no matching redirect_links row:', first_touch_redirect_link_id);
    }
  } else if (token) {
    // Existing backward-compatible path — unchanged.
    const { data: link } = await supabase
      .from('redirect_links')
      .select('video_id, campaign_id')
      .eq('token', token)
      .single();

    if (link) {
      resolvedVideoId = link.video_id;
      resolvedCampaignId = link.campaign_id;
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
  // Load campaign config
  if (resolvedCampaignId) {
    const { data } = await supabase
      .from('campaigns')
      .select(`
        user_id,
        organization_id,
        offer_price,
        estimated_close_rate,
        base_offer_value,
        upsell_probability,
        average_upsell_value
      `)
      .eq('id', resolvedCampaignId)
      .single();

    campaign = data;

    if (campaign) {
      resolvedUserId = campaign.user_id;
        console.log("USER:", resolvedUserId);
        console.log("ORG ID:", campaign.organization_id);
        console.log("FULL CAMPAIGN:", campaign);

      // fallback purchase value
      if (!amount && campaign.offer_price) {
        req.body.amount = campaign.offer_price;
      }
    }
    console.log('CAMPAIGN FOUND', {
  campaignId: resolvedCampaignId,
  organizationId: campaign?.organization_id,
  userId: campaign?.user_id,
});
  }

  const finalEventType = event_type ?? 'unknown';

  let finalAmount =
    amount ??
    req.body.amount ??
    null;

  // EV calculation for sales calls
  if (
  finalEventType === 'sales_call' &&
  campaign
) {

  const closeRate =
    (campaign.estimated_close_rate ?? 0) / 100;

  const upsellProbability =
    (campaign.upsell_probability ?? 0) / 100;

  const baseOffer =
    campaign.base_offer_value ?? 0;

  const upsellValue =
    campaign.average_upsell_value ?? 0;

  finalAmount = Number(
  (
    (closeRate * baseOffer)
    +
    (
      closeRate *
      upsellProbability *
      upsellValue
    )
  ).toFixed(2)
);
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

// Insert into pixel_purchases
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
      event_type: finalEventType,
      session_id: session_id ?? null,
    });

  if (purchaseError) {
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