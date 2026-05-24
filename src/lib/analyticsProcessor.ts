// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS PROCESSOR
// Single source of truth for ALL metric calculations.
//
// Layer rules:
//   events table          = click / intent stream ONLY
//   pixel_purchases       = conversions + EV + partial revenue
//   stripe_purchase_type  = verified revenue
//
// Click metrics use CLICK_EVENT_MAP — raw event_type string match, no mapping.
// Revenue metrics use payment_type (stripe) / event_type (pixel) directly.
// EV is projection only — never added to total_revenue.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CLICK_EVENT_MAP,
  getRevenueMode,
  emptyVideoMetrics,
  REVENUE_MODE_LABELS,
  type VideoMetrics,
  type RevenueMode,
  type StripePurchaseRow,
  type PixelPurchaseRow,
} from './analyticsConfig';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawEvent {
  video_id:    string | null;
  campaign_id: string | null;
  event_type:  string;
  created_at:  string;
}

export interface CampaignMeta {
  id:                     string;
  revenue_mode?:          string | null;
  estimated_close_rate?:  number | null;
  offer_price?:           number | null;
  has_paid_consultation?: boolean | null;
  consultation_fee?:      number | null;
}

export interface ProcessVideoInput {
  videoId:         string;
  campaignId:      string | null;
  campaign?:       CampaignMeta;
  events:          RawEvent[];
  stripePurchases: StripePurchaseRow[];
  pixelPurchases:  PixelPurchaseRow[];
  includeEV?:      boolean;
}

export interface VideoMetricsResult extends VideoMetrics {
  total_revenue:          number;
  estimated_call_revenue: number;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export type DateRange = '7days' | '30days' | '2months' | '6months' | '1year' | 'all';

export function getDateCutoff(range: DateRange): Date {
  const now = new Date();
  switch (range) {
    case '7days':   { const d = new Date(now); d.setDate(d.getDate() - 7);         return d; }
    case '30days':  { const d = new Date(now); d.setDate(d.getDate() - 30);        return d; }
    case '2months': { const d = new Date(now); d.setMonth(d.getMonth() - 2);       return d; }
    case '6months': { const d = new Date(now); d.setMonth(d.getMonth() - 6);       return d; }
    case '1year':   { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
    case 'all':     return new Date(0);
    default:        { const d = new Date(now); d.setDate(d.getDate() - 30);        return d; }
  }
}

export function filterEventsByDate(events: RawEvent[], range: DateRange): RawEvent[] {
  const cutoff = getDateCutoff(range);
  return events.filter(e => new Date(e.created_at) >= cutoff);
}

// ── Stripe enrich ─────────────────────────────────────────────────────────────
// Resolves missing video_id/campaign_id via session lookup.
// payment_type is stored directly in stripe_purchase_type — no derivation needed.

export function enrichStripePurchases(
  raw: Array<{
    video_id:     string | null;
    campaign_id:  string | null;
    amount:       number | null;
    payment_type: string | null;
    session_id?:  string | null;
  }>,
  sessionLookup: Record<string, { video_id: string; campaign_id: string }>,
): StripePurchaseRow[] {
  return raw
    .map(p => {
      const resolved =
        !p.video_id && p.session_id && sessionLookup[p.session_id]
          ? { ...p, ...sessionLookup[p.session_id] }
          : p;

      // Normalise payment_type — accept known variants, skip rows with no amount
      const rawPt = (resolved.payment_type ?? '').toLowerCase().trim();
      const pt: 'offer' | 'consultation' =
        rawPt === 'consultation' ? 'consultation' : 'offer';
      // Drop zero-amount rows
      if ((resolved.amount ?? 0) <= 0) return null;

      return {
        video_id:     resolved.video_id    ?? '',
        campaign_id:  resolved.campaign_id ?? '',
        amount:       resolved.amount      ?? 0,
        payment_type: pt,
        session_id:   resolved.session_id  ?? null,
      } satisfies StripePurchaseRow;
    })
    .filter((p): p is StripePurchaseRow => p !== null);
}

// ── Pixel enrich ──────────────────────────────────────────────────────────────

export function enrichPixelPurchases(
  raw: PixelPurchaseRow[],
  sessionLookup: Record<string, { video_id: string; campaign_id: string }>,
): PixelPurchaseRow[] {
  return raw.map(p =>
    !p.video_id && p.session_id && sessionLookup[p.session_id]
      ? { ...p, ...sessionLookup[p.session_id] }
      : p,
  );
}

// ── Core metric calculator ────────────────────────────────────────────────────

export function processVideoMetrics({
  videoId,
  campaignId,
  campaign,
  events,
  stripePurchases,
  pixelPurchases,
  includeEV = true,
}: ProcessVideoInput): VideoMetricsResult {
  const mode    = getRevenueMode(campaign ?? {});
  const metrics = emptyVideoMetrics(mode) as VideoMetricsResult;

  // ── 1. Click metrics — raw event_type match via CLICK_EVENT_MAP ──────────
  //
  // No normalization. Each metric key maps to one or more exact event_type
  // strings. If the event_type is in the set, increment that counter.
  // Any event_type not in any set is simply ignored for clicks.

  const videoEvents = events.filter(e => e.video_id === videoId);

  for (const [metricKey, rawTypes] of Object.entries(CLICK_EVENT_MAP)) {
    const typeSet = new Set(rawTypes);
    (metrics as any)[metricKey] = videoEvents.filter(
      e => typeSet.has(e.event_type),
    ).length;
  }

  // ── 2. Pixel conversions (video-scoped) ───────────────────────────────────
  //
  // pixel_purchases.event_type values:
  //   'purchase'     → purchase_thankyou (Direct Purchase count)
  //   'sales_call'   → call_booking_thankyou (Confirmed + EV source)
  //   'consultation' → consultation_thankyou (Consultation conversion)

  const vidPixelAll = pixelPurchases.filter(p => p.video_id === videoId);

  for (const p of vidPixelAll) {
    switch (p.event_type) {
      case 'purchase':     metrics.purchase_thankyou++;     break;
      case 'sales_call':   metrics.call_booking_thankyou++; break;
      case 'consultation': metrics.consultation_thankyou++; break;
    }
  }

  // ── 3. Stripe revenue (video-scoped) ──────────────────────────────────────
  //
  // stripe_purchase_type.payment_type values:
  //   'offer'        → direct_offer_revenue
  //   'consultation' → consultation_revenue

  const vidStripe = stripePurchases.filter(
    p => p.video_id === videoId && (p.amount ?? 0) > 0,
  );

  for (const p of vidStripe) {
    const amt = p.amount ?? 0;
    metrics.stripe_revenue += amt;
    if (p.payment_type === 'offer')        metrics.direct_offer_revenue += amt;
    if (p.payment_type === 'consultation') metrics.consultation_revenue += amt;
  }

  // ── 4. Pixel revenue (video-scoped, deduped against Stripe) ───────────────
  //
  // Only purchase + consultation event_types carry real revenue.
  // sales_call rows carry EV amounts — handled separately in step 6.
  // Deduped: skip any session already claimed by Stripe.

  if (mode === 'pixel' || mode === 'hybrid') {
    const stripeSessionIds = new Set(
      vidStripe.map(p => p.session_id).filter(Boolean) as string[],
    );
    const seenPixelSessions = new Set<string>();

    const vidPixelRevenue = vidPixelAll.filter(
      p => (p.amount ?? 0) > 0 &&
           (p.event_type === 'purchase' || p.event_type === 'consultation'),
    );

    for (const p of vidPixelRevenue) {
      if (p.session_id && stripeSessionIds.has(p.session_id)) continue;
      if (p.session_id) {
        if (seenPixelSessions.has(p.session_id)) continue;
        seenPixelSessions.add(p.session_id);
      }
      const amt = p.amount ?? 0;
      metrics.pixel_revenue += amt;
      // Also attribute to the correct revenue breakdown so these columns
      // are non-zero in pixel and total modes
      if (p.event_type === 'purchase')     metrics.direct_offer_revenue += amt;
      if (p.event_type === 'consultation') metrics.consultation_revenue += amt;
    }
  }

  // ── 5. Total real revenue (EV excluded always) ────────────────────────────

  if (mode === 'stripe') metrics.total_revenue = metrics.stripe_revenue;
  if (mode === 'pixel')  metrics.total_revenue = metrics.pixel_revenue;
  if (mode === 'hybrid') metrics.total_revenue = metrics.stripe_revenue + metrics.pixel_revenue;

  // ── 6. RPC ────────────────────────────────────────────────────────────────

  metrics.rpc = metrics.landing_page_view > 0
    ? Number((metrics.total_revenue / metrics.landing_page_view).toFixed(2))
    : 0;

  // ── 7. Estimated Call Revenue — projection only, never in total_revenue ───
  //
  // Source: pixel_purchases where event_type = 'sales_call' AND amount > 0.
  // Uses sum of those amounts directly (not a modeled rate × price).
  // Only included when includeEV = true.

  if (includeEV) {
    metrics.estimated_call_revenue = vidPixelAll
      .filter(p => p.event_type === 'sales_call' && (p.amount ?? 0) > 0)
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);
  } else {
    metrics.estimated_call_revenue = 0;
  }

  console.log('[processVideoMetrics]', {
    videoId, campaignId, mode,
    landing_page_view:     metrics.landing_page_view,
    lead_magnet_click:     metrics.lead_magnet_click,
    newsletter_click:      metrics.newsletter_click,
    call_booking_click:    metrics.call_booking_click,
    consultation_click:    metrics.consultation_click,
    purchase_thankyou:     metrics.purchase_thankyou,
    call_booking_thankyou: metrics.call_booking_thankyou,
    consultation_thankyou: metrics.consultation_thankyou,
    stripe_revenue:        metrics.stripe_revenue,
    pixel_revenue:         metrics.pixel_revenue,
    total_revenue:         metrics.total_revenue,
    estimated_call_revenue: metrics.estimated_call_revenue,
    rpc:                   metrics.rpc,
  });

  return metrics;
}

// ── Campaign-level aggregator ─────────────────────────────────────────────────

export function aggregateCampaignMetrics(
  videoResults: VideoMetricsResult[],
): Omit<VideoMetricsResult, 'revenue_mode' | 'revenue_mode_label'> & {
  revenue_mode:       RevenueMode;
  revenue_mode_label: string;
} {
  const totals = emptyVideoMetrics('hybrid') as VideoMetricsResult;

  for (const v of videoResults) {
    totals.landing_page_view      += v.landing_page_view;
    totals.lead_magnet_click      += v.lead_magnet_click;
    totals.newsletter_click       += v.newsletter_click;
    totals.call_booking_click     += v.call_booking_click;
    totals.consultation_click     += v.consultation_click;
    totals.newsletter_thankyou    += v.newsletter_thankyou;
    totals.call_booking_thankyou  += v.call_booking_thankyou;
    totals.consultation_thankyou  += v.consultation_thankyou;
    totals.purchase_thankyou      += v.purchase_thankyou;
    totals.stripe_revenue         += v.stripe_revenue;
    totals.pixel_revenue          += v.pixel_revenue;
    totals.direct_offer_revenue   += v.direct_offer_revenue;
    totals.consultation_revenue   += v.consultation_revenue;
    totals.total_revenue          += v.total_revenue;
    totals.estimated_call_revenue += v.estimated_call_revenue;
  }

  totals.rpc = totals.landing_page_view > 0
    ? Number((totals.total_revenue / totals.landing_page_view).toFixed(2))
    : 0;

  totals.revenue_mode       = 'hybrid';
  totals.revenue_mode_label = REVENUE_MODE_LABELS['hybrid'];

  return totals;
}

// ── Revenue view selector ─────────────────────────────────────────────────────

export type RevenueView = 'stripe' | 'pixel' | 'total';

export function selectDisplayRevenue(
  metrics: VideoMetricsResult,
  view: RevenueView,
): number {
  switch (view) {
    case 'stripe': return metrics.stripe_revenue;
    case 'pixel':  return metrics.pixel_revenue;
    case 'total':  return metrics.total_revenue;
  }
}
