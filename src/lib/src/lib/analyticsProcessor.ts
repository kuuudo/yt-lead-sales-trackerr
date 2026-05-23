// analyticsProcessor.ts

type EventType =
  | 'landing_page'
  | 'sales_call'
  | 'consultation'
  | 'purchase'
  | 'newsletter'
  | 'lead_magnet';

type StripeType = 'offer' | 'consultation' | 'test';

type PixelEventType = 'purchase' | 'consultation' | 'sales_call';

interface Event {
  id: string;
  event_type: EventType;
  video_id: string | null;
  campaign_id: string | null;
  created_at: string;
}

interface StripePurchase {
  id: string;
  amount: number;
  payment_type: StripeType;
  video_id: string | null;
  campaign_id: string | null;
  created_at: string;
}

interface PixelPurchase {
  id: string;
  amount: number | null;
  event_type: PixelEventType;
  session_id: string;
  video_id: string | null;
  campaign_id: string | null;
  created_at: string;
}

interface AnalyticsInput {
  events: Event[];
  stripe: StripePurchase[];
  pixel: PixelPurchase[];
}

interface RevenueToggle {
  includeEV: boolean;
}

/* ---------------------------
   NORMALIZATION
----------------------------*/

function normalizeEvents(events: Event[]) {
  return events;
}

/* ---------------------------
   STRIPE REVENUE
----------------------------*/

function calculateStripeRevenue(stripe: StripePurchase[]) {
  return stripe.reduce((sum, r) => {
    return sum + (r.amount || 0);
  }, 0);
}

/* ---------------------------
   PIXEL REVENUE (REAL ONLY)
----------------------------*/

function calculatePixelRevenue(pixel: PixelPurchase[]) {
  return pixel
    .filter(p => p.event_type === 'purchase' || p.event_type === 'consultation')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
}

/* ---------------------------
   EV REVENUE
----------------------------*/

function calculateEVRevenue(pixel: PixelPurchase[]) {
  return pixel
    .filter(p => p.event_type === 'sales_call')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
}

/* ---------------------------
   FUNNEL METRICS
----------------------------*/

function calculateFunnel(events: Event[]) {
  return {
    landing_page: events.filter(e => e.event_type === 'landing_page').length,
    sales_call: events.filter(e => e.event_type === 'sales_call').length,
    consultation: events.filter(e => e.event_type === 'consultation').length,
    newsletter: events.filter(e => e.event_type === 'newsletter').length,
    lead_magnet: events.filter(e => e.event_type === 'lead_magnet').length,
  };
}

/* ---------------------------
   RPC
----------------------------*/

function calculateRPC(totalRevenue: number, landingPage: number) {
  if (!landingPage) return 0;
  return totalRevenue / landingPage;
}

/* ---------------------------
   MAIN PROCESSOR
----------------------------*/

export function analyticsProcessor(
  input: AnalyticsInput,
  toggle: RevenueToggle = { includeEV: true }
) {
  const events = normalizeEvents(input.events);

  const stripeRevenue = calculateStripeRevenue(input.stripe);
  const pixelRevenue = calculatePixelRevenue(input.pixel);
  const evRevenue = calculateEVRevenue(input.pixel);

  const totalRevenue =
    stripeRevenue +
    pixelRevenue +
    (toggle.includeEV ? evRevenue : 0);

  const funnel = calculateFunnel(events);

  const rpc = calculateRPC(totalRevenue, funnel.landing_page);

  /* ---------------------------
     ATTRIBUTION OUTPUT
  ----------------------------*/

  const byCampaign = new Map<string, number>();
  const byVideo = new Map<string, number>();

  const add = (map: Map<string, number>, key: string | null, value: number) => {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + value);
  };

  // Stripe attribution
  input.stripe.forEach(r => {
    add(byCampaign, r.campaign_id, r.amount);
    add(byVideo, r.video_id, r.amount);
  });

  // Pixel attribution
  input.pixel.forEach(p => {
    if (p.event_type === 'purchase' || p.event_type === 'consultation') {
      add(byCampaign, p.campaign_id, p.amount || 0);
      add(byVideo, p.video_id, p.amount || 0);
    }

    if (p.event_type === 'sales_call' && toggle.includeEV) {
      add(byCampaign, p.campaign_id, p.amount || 0);
      add(byVideo, p.video_id, p.amount || 0);
    }
  });

  return {
    revenue: {
      stripe: stripeRevenue,
      pixel: pixelRevenue,
      ev: evRevenue,
      total: totalRevenue,
    },

    funnel,

    rpc,

    attribution: {
      byCampaign: Object.fromEntries(byCampaign),
      byVideo: Object.fromEntries(byVideo),
    },
  };
}