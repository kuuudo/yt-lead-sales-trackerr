import type { Campaign } from '../../lib/supabase';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type FunnelState = 'inactive' | 'partial' | 'active';
export type TrackingState = 'inactive' | 'pending' | 'active';

export interface StripeConfig {
  stripe_webhook_secret: string | null;
}

export type CampaignExtended = Campaign & {
  checkout_type?: string | null;
  consultation_checkout_type?: string | null;
  purchase_method?: string | null;
  sales_call_delivery?: string | null;
  average_upsell_value?: number | null;
  consultation_delivery?: string | null;
  consultation_payment_method?: string | null;
};

export interface CampaignWithState extends CampaignExtended {
  funnelStates: {
    purchase: FunnelState;
    newsletter: FunnelState;
    salesCall: FunnelState;
    consultation: FunnelState;
  };
  trackingStates: {
    purchase: TrackingState;
    newsletter: TrackingState;
    salesCall: TrackingState;
    consultation: TrackingState;
  };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

export const getFunnelState = (
  campaign: CampaignExtended,
  funnelType: 'purchase' | 'newsletter' | 'salesCall' | 'consultation'
): FunnelState => {
  switch (funnelType) {
    case 'purchase':
      if (!campaign.landing_page_url) return 'inactive';
      if (!campaign.checkout_url) return 'partial';
      return 'active';
    case 'newsletter':
      if (!campaign.newsletter_url) return 'inactive';
      return 'active';
    case 'salesCall':
      if (!campaign.has_sales_call) return 'inactive';
      if (!campaign.sales_call_booking_url) return 'inactive';
      return 'active';
    case 'consultation':
      if (!campaign.has_paid_consultation) return 'inactive';
      if (!campaign.consultation_booking_url) return 'inactive';
      return 'active';
    default:
      return 'inactive';
  }
};

export const getTrackingState = (
  campaign: CampaignExtended,
  funnelType: 'purchase' | 'newsletter' | 'salesCall' | 'consultation',
  stripeConfig: StripeConfig | null
): TrackingState => {
  const funnelActive = getFunnelState(campaign, funnelType);
  if (funnelActive === 'inactive') return 'inactive';

  const hasStripeWebhook = !!(stripeConfig?.stripe_webhook_secret);

  switch (funnelType) {
    case 'purchase':
      if (campaign.checkout_type === 'stripe_direct' || campaign.uses_stripe) {
        return hasStripeWebhook ? 'active' : 'pending';
      }
      return campaign.purchase_thankyou_url ? 'active' : 'pending';
    case 'newsletter':
      return campaign.newsletter_thankyou_url ? 'active' : 'pending';
    case 'salesCall':
      return campaign.sales_call_thankyou_url ? 'active' : 'pending';
    case 'consultation':
      if (
        campaign.consultation_checkout_type === 'stripe_direct' ||
        campaign.uses_stripe_consultation
      ) {
        return hasStripeWebhook ? 'active' : 'pending';
      }
      return campaign.consultation_thankyou_url ? 'active' : 'pending';
    default:
      return 'inactive';
  }
};

export const computeExpectedCallValue = (campaign: CampaignExtended): number => {
  const price = campaign.offer_price ?? 0;
  const rate = campaign.estimated_close_rate ?? 0;
  return Math.round(price * (rate / 100) * 100) / 100;
};

// ─────────────────────────────────────────────
// ATTRIBUTION PIXEL GENERATOR (single source of truth)
// ─────────────────────────────────────────────

export const generateAttributionPixel = (
  campaignId: string,
  eventType: string,
  _amount?: number | null
): string => {
  return `<!-- VS-Track Pixel: ${eventType} -->
<script>
(function () {
  const CONFIG = {
    event_type: '${eventType}',
    default_video_id: 'unknown'
  };
  const params = new URLSearchParams(window.location.search);

  const STORAGE_KEY = 'vstrk_conversion_id:' + CONFIG.event_type;
  function resolveConversionId() {
    const external =
      params.get('booking_id') ||
      params.get('transaction_id') ||
      params.get('payment_id') ||
      params.get('checkout_session_id') ||
      params.get('session_id') ||
      null;
    const fromUrl = params.get('vt_conversion_id') || external;
    if (fromUrl) {
      try { sessionStorage.setItem(STORAGE_KEY, fromUrl); } catch (e) {}
      return fromUrl;
    }
    try {
      const existing = sessionStorage.getItem(STORAGE_KEY);
      if (existing) return existing;
    } catch (e) {}
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('cid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11));
    try { sessionStorage.setItem(STORAGE_KEY, id); } catch (e) {}
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('vt_conversion_id', id);
      window.history.replaceState({}, '', u.toString());
    } catch (e) {}
    return id;
  }
  const conversionId = resolveConversionId();

  const sessionId =
    params.get('vt_sid') || localStorage.getItem('yt_tracker_session_id');
  const videoId =
    params.get('vt_vid') ||
    localStorage.getItem('yt_tracker_video_id') ||
    CONFIG.default_video_id;
  const campaignId =
    params.get('vt_cid') ||
    localStorage.getItem('yt_tracker_campaign_id') ||
    null;
  const organizationId =
    params.get('vt_oid') ||
    localStorage.getItem('yt_tracker_organization_id') ||
    null;
  const promotionId =
    params.get('vt_pid') ||
    localStorage.getItem('yt_tracker_promotion_id') ||
    null;
  const assetId =
    params.get('vt_aid') ||
    localStorage.getItem('yt_tracker_asset_id') ||
    null;
  const trackingHostname =
    params.get('vt_th') ||
    localStorage.getItem('yt_tracker_tracking_hostname') ||
    null;
  const firstTouchRedirectLinkId =
    params.get('vt_first_touch_redirect_link_id') ||
    localStorage.getItem('yt_tracker_ft_redirect_link_id') ||
    null;
  const redirectLinkId =
    params.get('vt_rlid') ||
    localStorage.getItem('yt_tracker_redirect_link_id') ||
    null;

  // V3 (events_journey) — exact primary key of the events_journey row for
  // the last VSTRK click this browser passed through. Pure passthrough,
  // same URL-first/localStorage-fallback pattern as every field above.
  // No validation or re-derivation happens here — see
  // FORWARD_VALIDATED_ATTRIBUTION_JOURNEY.md §19F.
  const eventsJourneyId =
    params.get('vt_ej_id') ||
    localStorage.getItem('yt_tracker_events_journey_id') ||
    null;

  // Forward-validated journey (see FORWARD_VALIDATED_ATTRIBUTION_JOURNEY.md).
  // Carried through untouched from Track.tsx — this destination-side script
  // has no Supabase access and must NOT attempt to re-validate or re-derive
  // continuation itself. vt_journey (when present) is the freshest
  // source-validated state; falls back to whatever this domain already has
  // stored, exactly like every other field in this script.
  let journey = null;
  const journeyParam = params.get('vt_journey');
  if (journeyParam) {
    try {
      const parsedJourney = JSON.parse(journeyParam);
      if (Array.isArray(parsedJourney)) journey = parsedJourney;
    } catch (e) {}
  }
  if (!journey) {
    try {
      const storedJourney = localStorage.getItem('yt_tracker_journey');
      if (storedJourney) journey = JSON.parse(storedJourney);
    } catch (e) {}
  }
  if (sessionId) localStorage.setItem('yt_tracker_session_id', sessionId);
  if (videoId) localStorage.setItem('yt_tracker_video_id', videoId);
  if (campaignId) localStorage.setItem('yt_tracker_campaign_id', campaignId);
  if (organizationId) localStorage.setItem('yt_tracker_organization_id', organizationId);
  if (promotionId) localStorage.setItem('yt_tracker_promotion_id', promotionId);
  if (assetId) localStorage.setItem('yt_tracker_asset_id', assetId);
  if (trackingHostname) localStorage.setItem('yt_tracker_tracking_hostname', trackingHostname);
  if (firstTouchRedirectLinkId) localStorage.setItem('yt_tracker_ft_redirect_link_id', firstTouchRedirectLinkId);
  if (redirectLinkId) localStorage.setItem('yt_tracker_redirect_link_id', redirectLinkId);
  if (eventsJourneyId) localStorage.setItem('yt_tracker_events_journey_id', eventsJourneyId);
  if (journey) localStorage.setItem('yt_tracker_journey', JSON.stringify(journey));
  const payload = {
    session_id: sessionId,
    video_id: videoId,
    campaign_id: campaignId,
    organization_id: organizationId,
    promotion_id: promotionId,
    asset_id: assetId,
    tracking_hostname: trackingHostname,
    first_touch_redirect_link_id: firstTouchRedirectLinkId,
    redirect_link_id: redirectLinkId,
    events_journey_id: eventsJourneyId,
    journey: journey ? JSON.stringify(journey) : null,
    event_type: CONFIG.event_type,
    conversion_id: conversionId
  };
  console.debug('[VS-Track] firing pixel:', payload);
  fetch('https://www.vstrk.com/api/pixel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
})();
<\/script>`;
};