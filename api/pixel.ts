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
    asset_id,
    promotion_id,
    first_touch_redirect_link_id,
    redirect_link_id,
    conversion_id,
    journey,
  } = req.body;
console.log('PIXEL BODY', {
  session_id,
  video_id,
  campaign_id,
  token,
  first_touch_redirect_link_id,
  redirect_link_id,
});

// ── Forward-validated journey (see FORWARD_VALIDATED_ATTRIBUTION_JOURNEY.md) ─
// journey is JSON-stringified JourneyNode[] ({ redirect_link_id, video_id,
// asset_id }) from installationHelpers.ts / Track.tsx. journey[0]'s
// redirect_link_id supersedes first_touch_redirect_link_id below when
// present; first_touch_redirect_link_id remains the fallback for
// pre-upgrade cached scripts or direct API callers that send no journey.
let parsedJourney: { redirect_link_id: string; video_id: string; asset_id: string | null }[] | null = null;
if (typeof journey === 'string' && journey.length > 0) {
  try {
    const attempt = JSON.parse(journey);
    if (Array.isArray(attempt)) parsedJourney = attempt;
  } catch (e) {
    console.warn('[pixel] journey field present but failed to parse:', e);
  }
} else if (Array.isArray(journey)) {
  // Tolerate an already-parsed array too, in case a future caller sends
  // journey natively rather than JSON-stringified.
  parsedJourney = journey;
}

const journeyFirstTouchRedirectLinkId =
  parsedJourney && parsedJourney.length > 0 ? parsedJourney[0].redirect_link_id : null;

const effectiveFirstTouchRedirectLinkId =
  journeyFirstTouchRedirectLinkId ?? first_touch_redirect_link_id ?? null;

  if (!token && !video_id && !campaign_id && !effectiveFirstTouchRedirectLinkId) {
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
  if (effectiveFirstTouchRedirectLinkId) {
    const { data: ftLink } = await supabase
      .from('redirect_links')
      .select('video_id, campaign_id, organization_id, promotion_id, asset_id, tracking_hostname')
      .eq('id', effectiveFirstTouchRedirectLinkId)
      .maybeSingle();

    if (ftLink) {
      // Do NOT assign resolvedVideoId / resolvedCampaignId from ftLink.
      if (!resolvedOrganizationId) resolvedOrganizationId = ftLink.organization_id;
      if (!resolvedPromotionId) resolvedPromotionId = ftLink.promotion_id;
      if (!resolvedAssetId) resolvedAssetId = ftLink.asset_id;
      if (!resolvedTrackingHostname) resolvedTrackingHostname = ftLink.tracking_hostname;
    } else {
      console.warn(
        '[pixel] effectiveFirstTouchRedirectLinkId provided but no matching redirect_links row:',
        effectiveFirstTouchRedirectLinkId
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

  // ── purchaseAssetId / purchasePromotionId: CURRENT-touchpoint identity ──
  // for pixel_purchases ONLY. Kept separate from resolvedAssetId /
  // resolvedPromotionId (which are first-touch-derived and stay scoped to
  // the events-table logging block below, unchanged).
  //
  // redirect_links is the source of truth for a touchpoint's identity —
  // this is identity propagation, not attribution inference. Priority:
  //   1. redirect_link_id (the CURRENT click, e.g. this session's sales_call
  //      or newsletter link) — the touchpoint this conversion actually
  //      belongs to, looked up fresh against redirect_links.
  //   2. client-sent asset_id / promotion_id — CURRENT values as of the
  //      Track.tsx fix (vt_pid/vt_aid now carry the just-clicked link's own
  //      promotion_id/asset_id, not first-touch). Covers pixels firing
  //      without vt_rlid in scope (e.g. no localStorage yet).
  //   3. resolvedAssetId / resolvedPromotionId — first-touch, from the
  //      first_touch_redirect_link_id lookup above. Last-resort fallback
  //      only, for legacy/cold payloads with no current-touchpoint signal
  //      at all. Never used to override a real current-touchpoint value.
  let purchaseAssetId: string | null = null;
  let purchasePromotionId: string | null = null;
  let currentLinkResolved = false;

  if (redirect_link_id) {
    const { data: currentLink } = await supabase
      .from('redirect_links')
      .select('asset_id, promotion_id')
      .eq('id', redirect_link_id)
      .maybeSingle();

    if (currentLink) {
      currentLinkResolved = true;
      purchaseAssetId = currentLink.asset_id;
      purchasePromotionId = currentLink.promotion_id;
    } else {
      console.warn(
        '[pixel] redirect_link_id provided but no matching redirect_links row:',
        redirect_link_id
      );
    }
  }

    if (!currentLinkResolved) {
    if (!purchaseAssetId) purchaseAssetId = asset_id ?? null;
    if (!purchaseAssetId) purchaseAssetId = resolvedAssetId;

    if (!purchasePromotionId) purchasePromotionId = promotion_id ?? null;
    if (!purchasePromotionId) purchasePromotionId = resolvedPromotionId;
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
  promotion_id: purchasePromotionId ?? null,
  asset_id: purchaseAssetId ?? null,
  amount: finalAmount,
  event_type: finalEventType,
  session_id: session_id ?? null,
});

// Insert into pixel_purchases (conversion_id = idempotency key for thank-you pixels)
const { data: insertedPurchase, error: purchaseError } =
  await supabase
    .from('pixel_purchases')
    .insert({
      token: token ?? null,
      video_id: resolvedVideoId ?? null,
      campaign_id: resolvedCampaignId ?? null,
      user_id: resolvedUserId,
      organization_id: resolvedOrganizationId ?? campaign?.organization_id ?? null,
      promotion_id: purchasePromotionId ?? null,
      asset_id: purchaseAssetId ?? null,
      amount: finalAmount,
      pricing_version_id: resolvedPricingVersionId,
      event_type: finalEventType,
      session_id: session_id ?? null,
      conversion_id: conversion_id ?? null,
    })
    .select('id')
    .maybeSingle();

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

  // ── Forward-validated journey attribution snapshot ───────────────────────
  // Persistent snapshot/fallback layer (pixel_purchase_attributions), NOT
  // the live reconstruction mechanism — the journey itself was already
  // reconstructed and validated client-side in tracker.ts before this
  // payload was ever sent. This block only records the outcome.
  //
  // Lightweight fallback only (approved, Option A). When there is no valid
  // forward journey, this deliberately does NOT call
  // resolveBridgeAttribution.ts / resolvePixelConversionProvenance.ts —
  // both stay exactly as they are, untouched, reserved for a future
  // offline/admin reconciliation pass. Those tools are explicitly
  // evidence-gathering, not decision-making (see their own file headers:
  // resolvePixelConversionProvenance.ts "NEVER picks a winner"), and need
  // inputs (full session event/redirect-link arrays, caller-supplied
  // candidate bridge event ids) that don't exist in this request. Calling
  // them here would mean inventing the attribution decision they
  // deliberately declined to make. This block only records what's already
  // resolvable from data already present on this request.
  if (insertedPurchase?.id) {
    let attributionFirstTouchRedirectLinkId: string | null = null;
    let attributionJourneySnapshot: typeof parsedJourney = null;
    let attributionMatchMethod: string;
    let attributionResolutionStatus: string;
    let attributionJourneyDisplay: string | null = null;
    if (parsedJourney && parsedJourney.length > 0) {
      // Primary path: validated forward journey present.
      attributionFirstTouchRedirectLinkId = journeyFirstTouchRedirectLinkId;
      attributionJourneySnapshot = parsedJourney;
      attributionMatchMethod = 'forward_journey';
      attributionResolutionStatus = 'resolved';

      // journey_display: human-readable only — journey_snapshot above stays
      // the source of truth. Built here (purchase time), not at redirect
      // time, since it needs a token lookup and isn't latency-sensitive
      // the way the redirect click is. e.g. "Y4iw → Ebid". Left null on
      // any lookup problem — never blocks the purchase/attribution write.
      const journeyRedirectLinkIds = parsedJourney.map((node) => node.redirect_link_id);
      const { data: journeyLinkRows, error: journeyLinkErr } = await supabase
        .from('redirect_links')
        .select('id, token')
        .in('id', journeyRedirectLinkIds);

      if (journeyLinkErr) {
        console.error('[pixel] Failed to look up tokens for journey_display:', journeyLinkErr);
      } else if (journeyLinkRows) {
        const tokenByRedirectLinkId = new Map(journeyLinkRows.map((row) => [row.id, row.token]));
        const tokens = journeyRedirectLinkIds.map((id) => tokenByRedirectLinkId.get(id) ?? null);
        if (tokens.every((t) => t !== null)) {
          attributionJourneyDisplay = tokens.join(' → ');
        }
      }
    } else if (first_touch_redirect_link_id) {
      // Fallback: legacy raw field present, no journey to snapshot.
      attributionFirstTouchRedirectLinkId = first_touch_redirect_link_id;
      attributionMatchMethod = 'redirect_link_id';
      attributionResolutionStatus = 'resolved';
    } else {
      // Nothing resolvable from this request. Recorded explicitly (not
      // skipped) so a future offline pass can find and reconcile it.
      attributionMatchMethod = 'unresolved';
      attributionResolutionStatus = 'unresolved';
    }

    const { error: attributionError } = await supabase
      .from('pixel_purchase_attributions')
      .upsert(
        {
          pixel_purchase_id: insertedPurchase.id,
          first_touch_redirect_link_id: attributionFirstTouchRedirectLinkId,
          journey_snapshot: attributionJourneySnapshot,
          journey_display: attributionJourneyDisplay,
          match_method: attributionMatchMethod,
          resolution_status: attributionResolutionStatus,
        },
        { onConflict: 'pixel_purchase_id' }
      );

    if (attributionError) {
      // Must never block or roll back the purchase itself — pixel_purchases
      // is already committed by this point.
      console.error('[pixel] Failed to write pixel_purchase_attributions:', attributionError);
    }
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