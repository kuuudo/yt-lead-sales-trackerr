// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS PROCESSOR
// Single source of truth for ALL metric calculations.
//
// DATA LAYER RULES — strictly enforced per activeSource:
//
//   activeSource = 'stripe'
//     • ONLY  stripe_purchases rows
//     • ZERO  pixel_purchases rows passed in
//     • ZERO  events rows used — clicks/opt-ins ALL zeroed in stripe mode
//     • purchase_thankyou  = count of stripe rows with revenue_type = 'offer'
//     • consultation_thankyou = count of stripe rows with revenue_type = 'consultation'
//     • Classification: campaign_id → StripeClassificationMap → offer|consultation
//
//   activeSource = 'pixel'
//     • ONLY  pixel_purchases rows
//     • ZERO  stripe_purchases rows passed in
//     • event_type column on pixel_purchases used directly
//
//   activeSource = 'total'
//     • stripe_purchases + pixel_purchases (deduped by session_id)
//     • No double-counting
//
// Click metrics (events table) are ALWAYS from events — independent of activeSource.
// EV (estimated_call_revenue) IS included in total_revenue in all modes.
//
// REVENUE FORMULA (all modes):
//   total_revenue = direct_offer_revenue + consultation_revenue + estimated_call_revenue
//
// RPC FORMULA (all modes):
//   total_clicks = landing_page_view + lead_magnet_click + newsletter_click
//                  + call_booking_click + consultation_click
//   rpc = total_revenue / total_clicks
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
  type StripeClassificationMap,
  type StripeRevenueType,
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
  stripe_revenue_type?:   StripeRevenueType | null; // 'offer' | 'consultation'
}

export interface ProcessVideoInput {
  videoId:           string;
  campaignId:        string | null;
  campaign?:         CampaignMeta;
  activeSource:      'stripe' | 'pixel' | 'total'; // REQUIRED — controls data isolation
  events:            RawEvent[];
  stripePurchases:   StripePurchaseRow[];           // pre-filtered by caller per activeSource
  pixelPurchases:    PixelPurchaseRow[];            // pre-filtered by caller per activeSource
  includeEV?:        boolean;
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
//
// stripe_purchases has NO payment_type column.
// Schema: id, stripe_session_id, token, video_id, campaign_id,
//         amount, currency, created_at, user_id
//
// revenue_type is derived from StripeClassificationMap:
//   1. Look up campaign_id → map[campaign_id]
//   2. Fallback: look up video_id  → map[video_id]
//   3. Fallback: 'offer' (most common, conservative default)
//
// Rows with amount <= 0 are dropped.

export function enrichStripePurchases(
  raw: Array<{
    video_id:    string | null;
    campaign_id: string | null;
    amount:      number | null;
    session_id?: string | null;
  }>,
  sessionLookup:       Record<string, { video_id: string; campaign_id: string }>,
  classificationMap:   StripeClassificationMap,
): StripePurchaseRow[] {
  return raw
    .map(p => {
      // Resolve missing video_id / campaign_id via session
      const resolved =
        !p.video_id && p.session_id && sessionLookup[p.session_id]
          ? { ...p, ...sessionLookup[p.session_id] }
          : p;

      // Drop zero / negative amount rows
      if ((resolved.amount ?? 0) <= 0) return null;

      const campaignId = resolved.campaign_id ?? '';
      const videoId    = resolved.video_id    ?? '';

      // Classify: campaign_id first, video_id fallback, then 'offer'
      const revenue_type: StripeRevenueType =
        classificationMap[campaignId] ??
        classificationMap[videoId]    ??
        'offer';

      return {
        video_id:     videoId,
        campaign_id:  campaignId,
        amount:       resolved.amount ?? 0,
        revenue_type,
        session_id:   resolved.session_id ?? null,
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
  activeSource,
  events,
  stripePurchases,
  pixelPurchases,
  includeEV = true,
}: ProcessVideoInput): VideoMetricsResult {
  const mode    = getRevenueMode(campaign ?? {});
  const metrics = emptyVideoMetrics(mode) as VideoMetricsResult;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1 — CLICK METRICS (events table, always — independent of activeSource)
  //
  // Uses CLICK_EVENT_MAP: raw event_type strings matched directly.
  // No normalization. No transformation.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const videoEvents = events.filter(e => e.video_id === videoId);

  for (const [metricKey, rawTypes] of Object.entries(CLICK_EVENT_MAP)) {
    const typeSet = new Set(rawTypes);
    (metrics as any)[metricKey] = videoEvents.filter(e => typeSet.has(e.event_type)).length;
  }

  console.log(`[processVideoMetrics] ${videoId} | activeSource=${activeSource}`, {
    events_total:  events.length,
    events_video:  videoEvents.length,
    stripe_rows:   stripePurchases.filter(p => p.video_id === videoId).length,
    pixel_rows:    pixelPurchases.filter(p => p.video_id === videoId).length,
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2 — STRIPE MODE (hard isolation)
  //
  // When activeSource === 'stripe':
  //   • ONLY stripe_purchases rows
  //   • pixel_purchases = IGNORED (caller passes [] but guard here too)
  //   • No event_type logic — uses revenue_type from StripeClassificationMap
  //   • Direct Offer Sales  = SUM(amount WHERE revenue_type = 'offer')
  //   • Consultation Revenue = SUM(amount WHERE revenue_type = 'consultation')
  //   • Total Revenue = offer + consultation ONLY
  //   • EV = 0 (no pixel data)
  //   • pixel_revenue = 0
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (activeSource === 'stripe') {
    // ── STRIPE MODE: zero ALL click/opt-in metrics ──────────────────────────
    // Only stripe_purchases data is valid here. Events table is NOT used for
    // any metric in stripe mode — clicks, opt-ins, and EV are all zeroed.
    metrics.landing_page_view     = 0;
    metrics.lead_magnet_click     = 0;
    metrics.newsletter_click      = 0;
    metrics.call_booking_click    = 0;
    metrics.consultation_click    = 0;
    metrics.newsletter_thankyou   = 0;
    metrics.call_booking_thankyou = 0;

    const vidStripe = stripePurchases.filter(
      p => p.video_id === videoId && p.amount > 0,
    );

    for (const p of vidStripe) {
      metrics.stripe_revenue += p.amount;
      if (p.revenue_type === 'offer') {
        metrics.direct_offer_revenue += p.amount;
        metrics.purchase_thankyou++;            // count from stripe rows
      }
      if (p.revenue_type === 'consultation') {
        metrics.consultation_revenue += p.amount;
        metrics.consultation_thankyou++;        // count from stripe rows
      }
    }

    // Stripe mode: no pixel, no EV
    metrics.pixel_revenue          = 0;
    metrics.estimated_call_revenue = 0;

    // total_revenue = direct_offer_revenue + consultation_revenue + estimated_call_revenue
    // (EV is 0 in stripe mode, kept for formula consistency)
    metrics.total_revenue =
      metrics.direct_offer_revenue +
      metrics.consultation_revenue +
      metrics.estimated_call_revenue;

    // RPC = total_revenue / total_clicks (blended funnel)
    // total_clicks = all five click-metric columns summed
    const stripeClicks =
      metrics.landing_page_view +
      metrics.lead_magnet_click +
      metrics.newsletter_click +
      metrics.call_booking_click +
      metrics.consultation_click;
    metrics.rpc = stripeClicks > 0
      ? Number((metrics.total_revenue / stripeClicks).toFixed(2))
      : 0;

    console.log(`[processVideoMetrics] STRIPE MODE ${videoId}`, {
      stripe_rows_video:    vidStripe.length,
      stripe_revenue:       metrics.stripe_revenue,
      direct_offer_revenue: metrics.direct_offer_revenue,
      consultation_revenue: metrics.consultation_revenue,
      total_revenue:        metrics.total_revenue,
      total_clicks:         stripeClicks,
      rpc:                  metrics.rpc,
    });

    return metrics;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3 — PIXEL MODE (hard isolation)
  //
  // When activeSource === 'pixel':
  //   • ONLY pixel_purchases rows
  //   • stripe_purchases = IGNORED (caller passes [] but guard here too)
  //   • event_type column on pixel_purchases used directly:
  //       'purchase'     → purchase_thankyou count + direct_offer_revenue
  //       'sales_call'   → call_booking_thankyou count + EV source
  //       'consultation' → consultation_thankyou count + consultation_revenue
  //   • stripe_revenue = 0
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (activeSource === 'pixel') {
    const vidPixel = pixelPurchases.filter(p => p.video_id === videoId);

    // pixel_purchases rows are authoritative purchase records written by the
    // pixel at insertion time — one row per conversion event. No row-level
    // transaction identifier is available in the fetched columns (session_id is
    // a long-lived browsing cookie, not a payment transaction ID), so there is
    // no safe dedup key at this aggregation layer. Dedup against accidental
    // double-fires belongs at write time (DB unique constraint or webhook
    // idempotency key). Every row reaching this point is counted as-is.
    for (const p of vidPixel) {
      // Conversion counts
      switch (p.event_type) {
        case 'purchase':     metrics.purchase_thankyou++;     break;
        case 'sales_call':   metrics.call_booking_thankyou++; break;
        case 'consultation': metrics.consultation_thankyou++; break;
        // newsletter opt-ins sourced from pixel_purchases, not the events table
        case 'newsletter':   metrics.newsletter_thankyou++;   break;
      }

      // Revenue — no intra-pixel dedup; each row is a distinct purchase record
      if ((p.amount ?? 0) > 0 &&
          (p.event_type === 'purchase' || p.event_type === 'consultation')) {
        const amt = p.amount ?? 0;
        metrics.pixel_revenue += amt;
        if (p.event_type === 'purchase')     metrics.direct_offer_revenue += amt;
        if (p.event_type === 'consultation') metrics.consultation_revenue += amt;
      }
    }

    metrics.stripe_revenue = 0;

    // EV — pixel sales_call rows, amount > 0, projection only
    if (includeEV) {
      metrics.estimated_call_revenue = vidPixel
        .filter(p => p.event_type === 'sales_call' && (p.amount ?? 0) > 0)
        .reduce((sum, p) => sum + (p.amount ?? 0), 0);
    }

    // total_revenue = direct_offer_revenue + consultation_revenue + estimated_call_revenue
    metrics.total_revenue =
      metrics.direct_offer_revenue +
      metrics.consultation_revenue +
      metrics.estimated_call_revenue;

    // RPC = total_revenue / total_clicks (blended funnel)
    const pixelClicks =
      metrics.landing_page_view +
      metrics.lead_magnet_click +
      metrics.newsletter_click +
      metrics.call_booking_click +
      metrics.consultation_click;
    metrics.rpc = pixelClicks > 0
      ? Number((metrics.total_revenue / pixelClicks).toFixed(2))
      : 0;

    console.log(`[processVideoMetrics] PIXEL MODE ${videoId}`, {
      pixel_rows_video:     vidPixel.length,
      pixel_revenue:        metrics.pixel_revenue,
      direct_offer_revenue: metrics.direct_offer_revenue,
      consultation_revenue: metrics.consultation_revenue,
      ev:                   metrics.estimated_call_revenue,
      total_revenue:        metrics.total_revenue,
      total_clicks:         pixelClicks,
      rpc:                  metrics.rpc,
    });

    return metrics;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4 — TOTAL MODE (stripe + pixel, deduped, no double-counting)
  //
  // activeSource === 'total':
  //   • stripe_purchases → stripe_revenue, classified by revenue_type
  //                      → purchase_thankyou++ (offer), consultation_thankyou++ (consultation)
  //   • pixel_purchases  → pixel_revenue, deduped against Stripe session_ids
  //                      → purchase_thankyou / consultation_thankyou also counted from pixel
  //   • Both contribute to direct_offer_revenue / consultation_revenue
  //   • total_revenue = stripe_revenue + pixel_revenue (no overlap)
  //   • EV from pixel sales_call rows, never in total
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Pixel conversion counts (no dedup — intentional)
  const vidPixelAll = pixelPurchases.filter(p => p.video_id === videoId);
  for (const p of vidPixelAll) {
    switch (p.event_type) {
      case 'purchase':     metrics.purchase_thankyou++;     break;
      case 'sales_call':   metrics.call_booking_thankyou++; break;
      case 'consultation': metrics.consultation_thankyou++; break;
      // newsletter opt-ins are sourced from pixel_purchases, not the events table
      case 'newsletter':   metrics.newsletter_thankyou++;   break;
    }
  }

  // Stripe revenue + stripe conversion counts
  // purchase_thankyou / consultation_thankyou from stripe are additive with pixel counts.
  // Stripe rows represent verified purchases that pixel may not have captured.
  const vidStripe = stripePurchases.filter(
    p => p.video_id === videoId && p.amount > 0,
  );
  for (const p of vidStripe) {
    metrics.stripe_revenue += p.amount;
    if (p.revenue_type === 'offer') {
      metrics.direct_offer_revenue += p.amount;
      metrics.purchase_thankyou++;       // stripe-verified offer purchase
    }
    if (p.revenue_type === 'consultation') {
      metrics.consultation_revenue += p.amount;
      metrics.consultation_thankyou++;   // stripe-verified consultation purchase
    }
  }

  // Pixel revenue — cross-source dedup against Stripe only.
  //
  // The only dedup that belongs at this aggregation layer is cross-source:
  // skip any pixel row whose session_id already appears in a Stripe row, so a
  // payment captured by both sources isn't double-counted in total_revenue.
  //
  // Intra-pixel dedup (suppressing rows within pixel_purchases itself) is NOT
  // performed here. pixel_purchases rows are authoritative purchase records;
  // no row-level transaction identifier is available in the fetched columns to
  // safely distinguish a genuine duplicate fire from a real second purchase.
  // That responsibility belongs at write time (DB unique constraint / webhook
  // idempotency key on the insertion path).
  const stripeSessionIds = new Set(vidStripe.map(p => p.session_id).filter(Boolean) as string[]);

  const vidPixelRevenue = vidPixelAll.filter(
    p => (p.amount ?? 0) > 0 &&
         (p.event_type === 'purchase' || p.event_type === 'consultation'),
  );

  for (const p of vidPixelRevenue) {
    // Skip if this session was already captured by Stripe (cross-source dedup only)
    if (p.session_id && stripeSessionIds.has(p.session_id)) continue;
    const amt = p.amount ?? 0;
    metrics.pixel_revenue += amt;
    if (p.event_type === 'purchase')     metrics.direct_offer_revenue += amt;
    if (p.event_type === 'consultation') metrics.consultation_revenue += amt;
  }

  // EV — pixel only, never double-counted in total
  if (includeEV) {
    metrics.estimated_call_revenue = vidPixelAll
      .filter(p => p.event_type === 'sales_call' && (p.amount ?? 0) > 0)
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);
  }

  // total_revenue = direct_offer_revenue + consultation_revenue + estimated_call_revenue
  // This is always the sum of the three visible revenue columns, regardless of mode.
  metrics.total_revenue =
    metrics.direct_offer_revenue +
    metrics.consultation_revenue +
    metrics.estimated_call_revenue;

  // RPC = total_revenue / total_clicks (blended funnel across all five click columns)
  const totalClicks =
    metrics.landing_page_view +
    metrics.lead_magnet_click +
    metrics.newsletter_click +
    metrics.call_booking_click +
    metrics.consultation_click;
  metrics.rpc = totalClicks > 0
    ? Number((metrics.total_revenue / totalClicks).toFixed(2))
    : 0;

  console.log(`[processVideoMetrics] TOTAL MODE ${videoId}`, {
    stripe_rows_video:    vidStripe.length,
    pixel_rows_video:     vidPixelAll.length,
    stripe_revenue:       metrics.stripe_revenue,
    pixel_revenue:        metrics.pixel_revenue,
    direct_offer_revenue: metrics.direct_offer_revenue,
    consultation_revenue: metrics.consultation_revenue,
    ev:                   metrics.estimated_call_revenue,
    total_revenue:        metrics.total_revenue,
    total_clicks:         totalClicks,
    rpc:                  metrics.rpc,
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

  // RPC at campaign level — same blended formula
  const aggTotalClicks =
    totals.landing_page_view +
    totals.lead_magnet_click +
    totals.newsletter_click +
    totals.call_booking_click +
    totals.consultation_click;
  totals.rpc = aggTotalClicks > 0
    ? Number((totals.total_revenue / aggTotalClicks).toFixed(2))
    : 0;

  totals.revenue_mode       = 'hybrid';
  totals.revenue_mode_label = REVENUE_MODE_LABELS['hybrid'];

  return totals;
}

// ── Revenue view selector (kept for any external usage) ───────────────────────

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
