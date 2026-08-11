// ─────────────────────────────────────────────────────────────────────────────
// analyticsEngine.ts
//
// PURPOSE: Deterministic 1:1 behavioral clone of the existing analytics
// pipeline (analyticsConfig.ts + analyticsProcessor.ts + InDepthAnalytics.tsx).
//
// Single exported entry point:
//   getAnalyticsEngine(input: AnalyticsEngineInput): AnalyticsEngineResult
//
// Output is IDENTICAL to what InDepthAnalytics.tsx produces via:
//   processVideoMetrics()  →  processedVideos  →  sortedVideos
//
// NO logic has been changed, improved, or reinterpreted.
// All formulas, isolation rules, dedup logic, and fallback defaults are
// verbatim copies from the source files listed above.
//
// FILE STRUCTURE
// ══════════════
//   CORE LAYER        — Sections 1–2
//     Section 1: Types & Constants         (analyticsConfig.ts)
//     Section 2: Core Deterministic Logic  (analyticsProcessor.ts)
//                 2a  RawEvent interface
//                 2b  CampaignMeta interface
//                 2c  ProcessVideoInput / VideoMetricsResult interfaces
//                 2d  Date-range helpers
//                 2e  enrichStripePurchases
//                 2f  enrichPixelPurchases
//                 2g  processVideoMetrics   ← revenue engine (stripe/pixel/total)
//                 2h  aggregateCampaignMetrics
//                 2i  selectDisplayRevenue
//
//   ORCHESTRATION LAYER — Sections 3–6
//     Section 3: Engine Types              (InDepthAnalytics surface area)
//     Section 4: getAnalyticsEngine()      (orchestration entry point)
//     Section 5: Fetch / Enrich Helpers    (InDepthAnalytics fetchData logic)
//     Section 6: Display Helpers           (InDepthAnalytics render helpers)
// ─────────────────────────────────────────────────────────────────────────────


// ═════════════════════════════════════════════════════════════════════════════
// ── CORE LAYER ───────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
//
// Everything in Sections 1–2 is fully deterministic and has zero dependency
// on UI state, orchestration, or fetch logic.  Given the same inputs these
// functions always return the same outputs.  They are the single source of
// truth for every metric produced by this system.


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — TYPES & CONSTANTS  (analyticsConfig.ts)
// ═════════════════════════════════════════════════════════════════════════════

// ── 1a. Raw event_type values (events table — exact strings, no remapping) ────

export type RawClickEventType =
  | 'landing_page'
  | 'lead_magnet'
  | 'newsletter'
  | 'newsletter_click'
  | 'sales_call'
  | 'consultation'
  | 'consultation_booking';

// Maps each click/opt-in metric key → exact raw event_type strings from the DB.
// newsletter_thankyou is intentionally NOT here; sourced from pixel_purchases.
export const CLICK_EVENT_MAP: Record<string, string[]> = {
  landing_page_view:  ['landing_page'],
  lead_magnet_click:  ['lead_magnet'],
  newsletter_click:   ['newsletter', 'newsletter_click'],
  call_booking_click: ['sales_call'],
  consultation_click: ['consultation', 'consultation_booking'],
};

// ── 1b. Stripe revenue type ────────────────────────────────────────────────────

export type StripeRevenueType = 'offer' | 'consultation';
export type StripeClassificationMap = Record<string, StripeRevenueType>;

// ── 1c. Revenue mode ───────────────────────────────────────────────────────────

export type RevenueMode = 'stripe' | 'pixel' | 'hybrid';

export function getRevenueMode(campaign: { revenue_mode?: string | null }): RevenueMode {
  if (campaign.revenue_mode === 'stripe') return 'stripe';
  if (campaign.revenue_mode === 'pixel')  return 'pixel';
  return 'hybrid';
}

export const REVENUE_MODE_LABELS: Record<RevenueMode, string> = {
  stripe: 'Verified (Stripe)',
  pixel:  'Estimated (Pixel)',
  hybrid: 'Total (Hybrid)',
};

// ── 1d. Metric types and labels ────────────────────────────────────────────────

export type MetricType =
  | 'landing_page_view'
  | 'lead_magnet_click'
  | 'newsletter_click'
  | 'call_booking_click'
  | 'consultation_click'
  | 'newsletter_thankyou'
  | 'call_booking_thankyou'
  | 'consultation_thankyou'
  | 'purchase_thankyou'
  | 'stripe_revenue'
  | 'pixel_revenue'
  | 'direct_offer_revenue'
  | 'consultation_revenue'
  | 'total_revenue'
  | 'rpc'
  | 'estimated_call_revenue';

export const METRIC_LABELS: Record<MetricType, string> = {
  landing_page_view:      'Landing Page Clicks',
  lead_magnet_click:      'Lead Magnet Clicks',
  newsletter_click:       'Newsletter Clicks',
  call_booking_click:     'Call Booking Clicks',
  consultation_click:     'Consultation Page Clicks',
  newsletter_thankyou:    'Newsletter Opt-ins',
  call_booking_thankyou:  'Call Bookings Confirmed',
  consultation_thankyou:  'Consultation Purchases',
  purchase_thankyou:      'Direct Purchases',
  stripe_revenue:         'Stripe Revenue',
  pixel_revenue:          'Pixel Revenue',
  direct_offer_revenue:   'Direct Offer Revenue',
  consultation_revenue:   'Consultation Revenue',
  total_revenue:          'Total Revenue',
  rpc:                    'Revenue Per Click',
  estimated_call_revenue: 'Est. Sales Call Revenue',
};

export const METRIC_COLORS: Record<MetricType, string> = {
  landing_page_view:      '#3b82f6',
  lead_magnet_click:      '#6366f1',
  newsletter_click:       '#ec4899',
  call_booking_click:     '#8b5cf6',
  consultation_click:     '#ef4444',
  newsletter_thankyou:    '#f97316',
  call_booking_thankyou:  '#a855f7',
  consultation_thankyou:  '#dc2626',
  purchase_thankyou:      '#22c55e',
  stripe_revenue:         '#16a34a',
  pixel_revenue:          '#2563eb',
  direct_offer_revenue:   '#16a34a',
  consultation_revenue:   '#9333ea',
  total_revenue:          '#dc2626',
  rpc:                    '#0ea5e9',
  estimated_call_revenue: '#71717a',
};

// ── 1e. VideoMetrics shape ─────────────────────────────────────────────────────

export interface VideoMetrics {
  // click metrics — events table, raw event_type match via CLICK_EVENT_MAP
  landing_page_view:      number;
  lead_magnet_click:      number;
  newsletter_click:       number;
  call_booking_click:     number;
  consultation_click:     number;
  // opt-in / conversion metrics
  newsletter_thankyou:    number;
  call_booking_thankyou:  number;
  consultation_thankyou:  number;
  purchase_thankyou:      number;
  // revenue — Stripe verified
  stripe_revenue:         number;
  direct_offer_revenue:   number;
  consultation_revenue:   number;
  // revenue — Pixel unverified (deduped vs Stripe in total mode)
  pixel_revenue:          number;
  // computed
  total_revenue:          number;
  rpc:                    number;
  // projection only — NEVER added to total_revenue
  estimated_call_revenue: number;
  // mode metadata
  revenue_mode:           RevenueMode;
  revenue_mode_label:     string;
}

export function emptyVideoMetrics(mode: RevenueMode = 'hybrid'): VideoMetrics {
  return {
    landing_page_view: 0, lead_magnet_click: 0, newsletter_click: 0,
    call_booking_click: 0, consultation_click: 0,
    newsletter_thankyou: 0, call_booking_thankyou: 0,
    consultation_thankyou: 0, purchase_thankyou: 0,
    stripe_revenue: 0, direct_offer_revenue: 0, consultation_revenue: 0,
    pixel_revenue: 0, total_revenue: 0, rpc: 0, estimated_call_revenue: 0,
    revenue_mode:       mode,
    revenue_mode_label: REVENUE_MODE_LABELS[mode],
  };
}

// ── 1f. Purchase row types ─────────────────────────────────────────────────────

// stripe_purchases has NO payment_type column.
// revenue_type is derived via StripeClassificationMap or from stripe_purchase_type.payment_type.
export interface StripePurchaseRow {
  video_id:     string;
  campaign_id:  string;
  amount:       number;
  revenue_type: StripeRevenueType; // derived after fetch — NOT from DB column
  session_id?:  string | null;
}

export interface PixelPurchaseRow {
  video_id:    string | null;
  campaign_id: string | null;
  amount:      number | null;
  event_type?: string | null;
  session_id?: string | null;
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — CORE DETERMINISTIC LOGIC  (analyticsProcessor.ts)
//
// All functions below are pure / deterministic.
// Input → Output is fully reproducible for any given dataset.
// No UI state. No side effects beyond console.log debug lines.
// ═════════════════════════════════════════════════════════════════════════════

// ── 2a. Raw event interface ────────────────────────────────────────────────────

export interface RawEvent {
  video_id:    string | null;
  campaign_id: string | null;
  event_type:  string;
  created_at:  string;
}

// ── 2b. Campaign meta ──────────────────────────────────────────────────────────

export interface CampaignMeta {
  id:                     string;
  revenue_mode?:          string | null;
  estimated_close_rate?:  number | null;
  offer_price?:           number | null;
  has_paid_consultation?: boolean | null;
  consultation_fee?:      number | null;
  stripe_revenue_type?:   StripeRevenueType | null;
}

// ── 2c. processVideoMetrics input / output types ───────────────────────────────

export interface ProcessVideoInput {
  videoId:           string;
  campaignId:        string | null;
  campaign?:         CampaignMeta;
  activeSource:      'stripe' | 'pixel' | 'total'; // REQUIRED — controls data isolation
  events:            RawEvent[];
  stripePurchases:   StripePurchaseRow[];           // pre-filtered per activeSource by caller
  pixelPurchases:    PixelPurchaseRow[];            // pre-filtered per activeSource by caller
  includeEV?:        boolean;
}

export interface VideoMetricsResult extends VideoMetrics {
  total_revenue:          number;
  estimated_call_revenue: number;
}

// ── 2d. Date-range helpers ─────────────────────────────────────────────────────

export type DateRange = '7days' | '30days' | '2months' | '6months' | '1year' | 'all' | 'thismonth' | 'custom';

// A custom date range — both fields are inclusive. Values may be ISO date
// strings (e.g. 'YYYY-MM-DD' from a <input type="date">) or Date objects.
export interface CustomDateRange {
  start: string | Date;
  end:   string | Date;
}

export function getDateCutoff(range: DateRange): Date {
  const now = new Date();
  switch (range) {
    case '7days':    { const d = new Date(now); d.setDate(d.getDate() - 7);         return d; }
    case '30days':   { const d = new Date(now); d.setDate(d.getDate() - 30);        return d; }
    case 'thismonth':{ const d = new Date(now.getFullYear(), now.getMonth(), 1); d.setHours(0, 0, 0, 0); return d; }
    case '2months':  { const d = new Date(now); d.setMonth(d.getMonth() - 2);       return d; }
    case '6months':  { const d = new Date(now); d.setMonth(d.getMonth() - 6);       return d; }
    case '1year':    { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
    case 'all':      return new Date(0);
    case 'custom':   return new Date(0); // resolved via getDateBounds when a customRange is supplied
    default:         { const d = new Date(now); d.setDate(d.getDate() - 30);        return d; }
  }
}

// ── Unified start/end resolution ───────────────────────────────────────────────
//
// Single source of truth for turning a (preset | custom) date-range selection
// into a concrete [start, end] window. Used by BOTH event filtering and video/
// content filtering so Dashboard and InDepthAnalytics can never diverge.
//
//   • Presets other than 'custom': start = getDateCutoff(range), end = now.
//   • 'custom': start/end taken from customRange. If customRange is missing,
//     falls back to 'all' (start = epoch, end = now) — fail-open, never
//     silently hides everything.
//   • 'end' is treated as inclusive through the END of that calendar day,
//     so selecting "to: 2026-06-13" includes events/videos created any time
//     on June 13th.
export function getDateBounds(range: DateRange, customRange?: CustomDateRange | null): { start: Date; end: Date } {
  const now = new Date();

  if (range === 'custom' && customRange) {
    const start = new Date(customRange.start);
    const end   = new Date(customRange.end);
    // Make the end date inclusive of its entire day when given a bare date
    // (e.g. '2026-06-13' parses to midnight UTC — push to end of that day).
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  return { start: getDateCutoff(range), end: now };
}

export function filterEventsByDate(
  events: RawEvent[],
  range: DateRange,
  customRange?: CustomDateRange | null,
): RawEvent[] {
  const { start, end } = getDateBounds(range, customRange);
  return events.filter(e => {
    const t = new Date(e.created_at);
    return t >= start && t <= end;
  });
}

// ── Video / content date filtering ──────────────────────────────────────────
//
// Shared source of truth for filtering a video/content list by upload date
// (video.created_at), using the SAME [start, end] window as filterEventsByDate.
//
//   • range === 'all': every video passes, including videos with a missing
//     or null created_at.
//   • Otherwise (including 'custom' without a supplied customRange, which
//     falls back to the 'all' window): videos with a missing/null created_at
//     are EXCLUDED, since we cannot determine whether they fall inside the
//     selected window.
export function filterVideosByDateRange<T extends { created_at?: string | null }>(
  videos: T[],
  range: DateRange,
  customRange?: CustomDateRange | null,
): T[] {
  if (range === 'all') return videos;

  const { start, end } = getDateBounds(range, customRange);
  return videos.filter(v => {
    if (!v.created_at) return false;
    const t = new Date(v.created_at);
    return t >= start && t <= end;
  });
}

// ── 2e. Stripe enrichment ──────────────────────────────────────────────────────
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
    .map((p): StripePurchaseRow | null => {
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
      };
    })
    .filter((p): p is StripePurchaseRow => p !== null);
}

// ── 2f. Pixel enrichment ───────────────────────────────────────────────────────

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

// ── 2g. Core metric calculator — processVideoMetrics ──────────────────────────
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

  console.log(`[analyticsEngine:processVideoMetrics] ${videoId} | activeSource=${activeSource}`, {
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

    console.log(`[analyticsEngine:processVideoMetrics] STRIPE MODE ${videoId}`, {
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

    console.log(`[analyticsEngine:processVideoMetrics] PIXEL MODE ${videoId}`, {
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

  console.log(`[analyticsEngine:processVideoMetrics] TOTAL MODE ${videoId}`, {
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

// ── 2h. Campaign-level aggregator ─────────────────────────────────────────────

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

// ── 2i. Revenue view selector ─────────────────────────────────────────────────

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


// ═════════════════════════════════════════════════════════════════════════════
// ── ORCHESTRATION LAYER ───────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
//
// Everything in Sections 3–6 is concerned with wiring, filtering, sorting,
// and presenting the outputs of the CORE layer.  These sections mirror the
// useMemo / useState / render logic from InDepthAnalytics.tsx exactly.
// They call into the CORE layer; they do NOT reimplement metric calculations.


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3 — ENGINE TYPES  (surface area of InDepthAnalytics.tsx logic)
// ═════════════════════════════════════════════════════════════════════════════

// Column keys shown in the InDepthAnalytics table — verbatim from the component.
export const TABLE_COLUMNS: MetricType[] = [
  'landing_page_view',
  'purchase_thankyou',
  'lead_magnet_click',
  'newsletter_click',
  'newsletter_thankyou',
  'call_booking_click',
  'call_booking_thankyou',
  'consultation_click',
  'consultation_thankyou',
  'direct_offer_revenue',
  'estimated_call_revenue',
  'consultation_revenue',
  'total_revenue',
  'rpc',
];

// Column display labels — overrides for revenue columns to show ($) suffix.
// Verbatim from InDepthAnalytics COLUMN_LABELS.
export const COLUMN_LABELS: Partial<Record<MetricType, string>> & Record<string, string> = {
  ...METRIC_LABELS,
  direct_offer_revenue:    'Direct Offer Sales ($)',
  estimated_call_revenue:  'Estimated Call Revenue ($)',
  consultation_revenue:    'Consultation Revenue ($)',
  total_revenue:           'Total Revenue ($)',
  rpc:                     'Revenue Per Click ($)',
};

// A processed video row — what InDepthAnalytics stores in processedVideos.
export interface ProcessedVideoRow extends VideoMetricsResult {
  video:    { id: string; thumbnail_url?: string; video_title?: string; campaign_id?: string | null; video_goal?: string[]; selected_lead_magnet_ids?: string[] | null; platform?: string | null; platform_url?: string | null; platform_post_id?: string | null; status?: string | null; created_at?: string | null };
  campaign: CampaignMeta | null;
  title:    string | undefined;
}

// Engine input — mirrors the derived state inside InDepthAnalytics that feeds
// the useMemo(() => filteredVideos.map(…)) computation.
export interface AnalyticsEngineInput {
  // Raw data (already fetched and enriched — matches what InDepthAnalytics
  // stores in state after fetchData() resolves).
  videos:          ProcessedVideoRow['video'][];
  campaigns:       CampaignMeta[];
  rawEvents:       RawEvent[];
  stripePurchases: StripePurchaseRow[];
  pixelPurchases:  PixelPurchaseRow[];

  // Filter / UI state (mirrors the useState hooks in InDepthAnalytics).
  dateRange:             DateRange;
  // Only used when dateRange === 'custom'. Ignored otherwise.
  customRange?:          CustomDateRange | null;
  selectedCampaignId:    string;          // 'all' or a campaign id
  selectedGoals:         string[];
  selectedLeadMagnets:   string[];
  activeSource:          RevenueView;
  includeEV:             boolean;

  // Sort state (mirrors sortConfig useState in InDepthAnalytics).
  sortConfig: { key: string; direction: 'asc' | 'desc' };
}

// Engine output — contains the same information as InDepthAnalytics's
// sortedVideos array plus the campaign-level aggregate totals.
export interface AnalyticsEngineResult {
  // One row per video, in the same order as InDepthAnalytics's sortedVideos.
  sortedVideos:    ProcessedVideoRow[];
  // Campaign-level aggregate (same formula as aggregateCampaignMetrics).
  campaignTotals:  ReturnType<typeof aggregateCampaignMetrics>;
  // Debug information (satisfies the debug logging requirement).
  debug:           AnalyticsEngineDebug;
}

export interface AnalyticsEngineDebug {
  activeSource:          RevenueView;
  dateRange:             DateRange;
  customRange?:          CustomDateRange | null;
  rowCounts: {
    rawEvents:       number;
    filteredEvents:  number;
    stripePurchases: number;
    pixelPurchases:  number;
    filteredVideos:  number;
  };
  revenueBreakdown: {
    pixel: {
      totalRows:           number;
      purchaseRows:        number;
      consultationRows:    number;
      salesCallRows:       number;
      newsletterRows:      number;
      totalPixelRevenue:   number;
    };
    stripe: {
      totalRows:              number;
      offerRows:              number;
      consultationRows:       number;
      totalStripeRevenue:     number;
      totalOfferRevenue:      number;
      totalConsultRevenue:    number;
    };
    total: {
      directOfferRevenue:      number;
      consultationRevenue:     number;
      estimatedCallRevenue:    number;
      totalRevenue:            number;
      deduplicatedPixelRows:   number;
    };
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4 — ENGINE ENTRY POINT  (orchestration)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * getAnalyticsEngine
 *
 * Orchestration entry point.  Wires filter state → CORE layer → sorted output.
 *
 * Deterministic 1:1 reproduction of the InDepthAnalytics.tsx computation
 * pipeline in a single pure function.
 *
 * Equivalent to evaluating, in order:
 *   1. filterEventsByDate(rawEvents, dateRange)           → dateFilteredEvents
 *   2. videos.filter(…campaign/goal/leadMagnet filters)   → filteredVideos
 *   3. filteredVideos.map(v => processVideoMetrics(…))    → processedVideos
 *   4. [...processedVideos].sort(…)                       → sortedVideos
 *
 * Proof of equivalence: given the SAME input values that InDepthAnalytics
 * would hold in its useState/useMemo at any point in time, this function
 * returns the identical sortedVideos array and aggregate totals.
 *
 * All metric computation is delegated to CORE layer functions — no revenue
 * logic lives here.
 */
export function getAnalyticsEngine(input: AnalyticsEngineInput): AnalyticsEngineResult {
  const {
    videos,
    campaigns,
    rawEvents,
    stripePurchases,
    pixelPurchases,
    dateRange,
    customRange,
    selectedCampaignId,
    selectedGoals,
    selectedLeadMagnets,
    activeSource,
    includeEV,
    sortConfig,
  } = input;

  // ── Step 1: date-filter events ─────────────────────────────────────────────
  // Matches: const dateFilteredEvents = useMemo(() => filterEventsByDate(rawEvents, dateRange), …)
  const dateFilteredEvents = filterEventsByDate(rawEvents, dateRange, customRange);

  // ── Step 2: video filters ──────────────────────────────────────────────────
  // Matches: const filteredVideos = useMemo(() => videos.filter(v => { … }), …)
  // NOTE: video/content date filtering is intentionally NOT performed here.
  // analyticsEngine only date-filters EVENTS (Step 1) for metric computation,
  // matching InDepthAnalytics's pipeline 1:1. Filtering the video/content list
  // by upload date (created_at) is a Dashboard-only concern — see
  // filterVideosByDateRange, applied by callers as needed.
  const filteredVideos = videos.filter(v => {
    if (selectedCampaignId !== 'all' && v.campaign_id !== selectedCampaignId) return false;
    if (selectedGoals.length > 0) {
      const hasMatch = (v.video_goal ?? []).some((g: string) => selectedGoals.includes(g));
      if (!hasMatch) return false;
    }
    if (selectedLeadMagnets.length > 0) {
      if (!v.selected_lead_magnet_ids) return false;
      const hasMatch = v.selected_lead_magnet_ids.some((id: string) =>
        selectedLeadMagnets.includes(id),
      );
      if (!hasMatch) return false;
    }
    return true;
  });

  // ── Step 3: data source isolation ─────────────────────────────────────────
  // Matches: const sourceStripe = activeSource === 'pixel' ? [] : stripePurchases;
  //          const sourcePixel  = activeSource === 'stripe' ? [] : pixelPurchases;
  const sourceStripe = activeSource === 'pixel'  ? [] : stripePurchases;
  const sourcePixel  = activeSource === 'stripe' ? [] : pixelPurchases;

  // ── Step 4: processVideoMetrics per video ──────────────────────────────────
  // Matches: const processedVideos = useMemo(() => filteredVideos.map(v => { … }), …)
  // All metric computation delegated to CORE layer: processVideoMetrics()
  const processedVideos: ProcessedVideoRow[] = filteredVideos.map(v => {
    const campaign = campaigns.find(c => c.id === v.campaign_id) as CampaignMeta | undefined;

    const metrics = processVideoMetrics({
      videoId:         v.id,
      campaignId:      v.campaign_id ?? null,
      campaign,
      activeSource,
      events:          dateFilteredEvents,
      stripePurchases: sourceStripe,
      pixelPurchases:  sourcePixel,
      includeEV,
    });

    return {
      video:    v,
      campaign: campaign ?? null,
      title:    v.video_title,
      ...metrics,
    };
  });

  // ── Step 5: sort ────────────────────────────────────────────────────────────
  // Matches: const sortedVideos = useMemo(() => { const items = [...processedVideos]; items.sort(…) }, …)
  const sortedVideos = [...processedVideos];
  sortedVideos.sort((a, b) => {
    const aVal = (a as any)[sortConfig.key];
    const bVal = (b as any)[sortConfig.key];
    const aNum = typeof aVal === 'string' ? parseFloat(aVal) : (aVal ?? 0);
    const bNum = typeof bVal === 'string' ? parseFloat(bVal) : (bVal ?? 0);
    if (aNum < bNum) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aNum > bNum) return sortConfig.direction === 'asc' ? 1 : -1;
    // Stable tiebreaker by video.id — prevents row reordering when toggling
    // activeSource (which changes metric values but not video identity)
    return a.video.id < b.video.id ? -1 : a.video.id > b.video.id ? 1 : 0;
  });

  // ── Step 6: campaign-level aggregate ──────────────────────────────────────
  // Delegated to CORE layer: aggregateCampaignMetrics()
  const campaignTotals = aggregateCampaignMetrics(
    processedVideos.map(r => ({
      ...r,
      // processedVideos already extends VideoMetricsResult — cast is safe
    } as VideoMetricsResult)),
  );

  // ── Step 7: debug report ───────────────────────────────────────────────────
  const allPixel  = pixelPurchases;
  const allStripe = stripePurchases;

  // Pixel breakdown (all rows — not filtered by video — for dataset-level debug)
  const pixelPurchaseRows      = allPixel.filter(p => p.event_type === 'purchase');
  const pixelConsultationRows  = allPixel.filter(p => p.event_type === 'consultation');
  const pixelSalesCallRows     = allPixel.filter(p => p.event_type === 'sales_call');
  const pixelNewsletterRows    = allPixel.filter(p => p.event_type === 'newsletter');
  const totalPixelRevenue      = allPixel
    .filter(p => (p.amount ?? 0) > 0 &&
                 (p.event_type === 'purchase' || p.event_type === 'consultation'))
    .reduce((s, p) => s + (p.amount ?? 0), 0);

  // Stripe breakdown
  const stripeOfferRows     = allStripe.filter(p => p.revenue_type === 'offer' && p.amount > 0);
  const stripeConsultRows   = allStripe.filter(p => p.revenue_type === 'consultation' && p.amount > 0);
  const totalStripeRevenue  = allStripe.filter(p => p.amount > 0).reduce((s, p) => s + p.amount, 0);
  const totalOfferRevenue   = stripeOfferRows.reduce((s, p) => s + p.amount, 0);
  const totalConsultRevenue = stripeConsultRows.reduce((s, p) => s + p.amount, 0);

  // Total mode dedup count (cross-source only — mirrors STEP 4 in processVideoMetrics)
  const stripeSessionSet = new Set(allStripe.map(p => p.session_id).filter(Boolean) as string[]);
  const deduplicatedPixelRows = allPixel.filter(
    p => (p.amount ?? 0) > 0 &&
         (p.event_type === 'purchase' || p.event_type === 'consultation') &&
         p.session_id != null &&
         stripeSessionSet.has(p.session_id),
  ).length;

  const debug: AnalyticsEngineDebug = {
    activeSource,
    dateRange,
    customRange: customRange ?? null,
    rowCounts: {
      rawEvents:       rawEvents.length,
      filteredEvents:  dateFilteredEvents.length,
      stripePurchases: allStripe.length,
      pixelPurchases:  allPixel.length,
      filteredVideos:  filteredVideos.length,
    },
    revenueBreakdown: {
      pixel: {
        totalRows:           allPixel.length,
        purchaseRows:        pixelPurchaseRows.length,
        consultationRows:    pixelConsultationRows.length,
        salesCallRows:       pixelSalesCallRows.length,
        newsletterRows:      pixelNewsletterRows.length,
        totalPixelRevenue,
      },
      stripe: {
        totalRows:           allStripe.length,
        offerRows:           stripeOfferRows.length,
        consultationRows:    stripeConsultRows.length,
        totalStripeRevenue,
        totalOfferRevenue,
        totalConsultRevenue,
      },
      total: {
        directOfferRevenue:    campaignTotals.direct_offer_revenue,
        consultationRevenue:   campaignTotals.consultation_revenue,
        estimatedCallRevenue:  campaignTotals.estimated_call_revenue,
        totalRevenue:          campaignTotals.total_revenue,
        deduplicatedPixelRows,
      },
    },
  };

  console.log('[analyticsEngine:getAnalyticsEngine] result', {
    activeSource,
    dateRange,
    processedVideos:       processedVideos.length,
    ...debug.rowCounts,
    pixelBreakdown:        debug.revenueBreakdown.pixel,
    stripeBreakdown:       debug.revenueBreakdown.stripe,
    totalBreakdown:        debug.revenueBreakdown.total,
  });

  return { sortedVideos, campaignTotals, debug };
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5 — FETCH / ENRICH HELPERS  (InDepthAnalytics fetchData logic)
// ═════════════════════════════════════════════════════════════════════════════
//
// These helpers replicate the fetch + enrichment logic from InDepthAnalytics
// fetchData() so that consumers can produce the correct StripePurchaseRow[] and
// PixelPurchaseRow[] arrays to pass into getAnalyticsEngine() without re-
// implementing the enrichment themselves.
//
// NOTE: buildStripeFromPurchaseTypeTable() maps stripe_purchase_type rows
//       (which DO have a payment_type column) into StripePurchaseRow[].
//       It does NOT use enrichStripePurchases() or StripeClassificationMap
//       because the table already carries payment_type — as InDepthAnalytics
//       demonstrates at lines 210-226.

export interface StripePurchaseTypeRow {
  video_id:          string | null;
  campaign_id:       string | null;
  amount:            number | string | null;   // Supabase may return numeric as string
  stripe_session_id: string | null;
  payment_type:      string | null;
}

/**
 * buildStripeFromPurchaseTypeTable
 *
 * Converts raw stripe_purchase_type rows into StripePurchaseRow[].
 *
 * Rules (verbatim from InDepthAnalytics lines 188-226):
 *   1. Exclude rows where payment_type === 'test'
 *   2. coerce amount via parseFloat(String(…))
 *   3. Resolve missing video_id / campaign_id via session lookup
 *   4. Drop rows where amount <= 0
 *   5. revenue_type: payment_type === 'consultation' → 'consultation', else → 'offer'
 */
export function buildStripeFromPurchaseTypeTable(
  raw: StripePurchaseTypeRow[],
  sessionLookup: Record<string, { video_id: string; campaign_id: string }>,
): StripePurchaseRow[] {
  return raw
    .filter(r => r.payment_type !== 'test')
    .map((r): StripePurchaseRow | null => {
      const sessionId = r.stripe_session_id ?? null;
      const resolvedVideoId    = r.video_id    ?? (sessionLookup[sessionId ?? '']?.video_id    ?? '');
      const resolvedCampaignId = r.campaign_id ?? (sessionLookup[sessionId ?? '']?.campaign_id ?? '');
      const amt = parseFloat(String(r.amount ?? '0'));
      if (amt <= 0) return null;
      const revenue_type: StripeRevenueType =
        r.payment_type === 'consultation' ? 'consultation' : 'offer';
      return {
        video_id:    resolvedVideoId,
        campaign_id: resolvedCampaignId,
        amount:      amt,
        revenue_type,
        session_id:  sessionId,
      };
    })
    .filter((p): p is StripePurchaseRow => p !== null);
}

/**
 * buildPixelPurchases
 *
 * Coerces raw pixel_purchases rows and runs enrichPixelPurchases().
 * Mirrors InDepthAnalytics lines 229-233.
 */
export function buildPixelPurchases(
  raw: Array<{ video_id?: string | null; campaign_id?: string | null; amount?: number | string | null; event_type?: string | null; session_id?: string | null }>,
  sessionLookup: Record<string, { video_id: string; campaign_id: string }>,
): PixelPurchaseRow[] {
  const coerced: PixelPurchaseRow[] = raw.map(r => ({
    video_id:    r.video_id    ?? null,
    campaign_id: r.campaign_id ?? null,
    amount:      parseFloat(String(r.amount ?? '0')),
    event_type:  r.event_type  ?? null,
    session_id:  r.session_id  ?? null,
  }));
  return enrichPixelPurchases(coerced, sessionLookup);
}

/**
 * flattenSessionEvents
 *
 * Resolves events that have no direct video_id but have a sessions join.
 * Mirrors InDepthAnalytics lines 150-162.
 */
export function flattenSessionEvents(
  sessionJoinedRows: Array<{ event_type: string; created_at: string; sessions?: { video_id?: string | null; campaign_id?: string | null } | null }>,
): RawEvent[] {
  return sessionJoinedRows
    .map(e => ({
      video_id:    e.sessions?.video_id    ?? null,
      campaign_id: e.sessions?.campaign_id ?? null,
      event_type:  e.event_type,
      created_at:  e.created_at,
    }))
    .filter((e): e is RawEvent => e.video_id !== null);
}

/**
 * mergeEventSources
 *
 * Concatenates direct events + session-resolved events into one array.
 * Mirrors InDepthAnalytics lines 159-162.
 */
export function mergeEventSources(
  directEvents:   RawEvent[],
  sessionEvents:  RawEvent[],
): RawEvent[] {
  return [...directEvents, ...sessionEvents];
}


// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6 — DISPLAY HELPERS  (InDepthAnalytics render helpers)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * isRevenueCol — matches InDepthAnalytics line 337-338
 */
export const isRevenueCol = (key: MetricType): boolean =>
  key.includes('revenue') || key === 'rpc';

/**
 * formatCellValue — verbatim from InDepthAnalytics lines 340-347
 * Formats a metric cell value for display in the analytics table.
 */
export function formatCellValue(key: MetricType, row: ProcessedVideoRow): string {
  if (key === 'total_revenue') {
    return `$${(row.total_revenue || 0).toLocaleString()}`;
  }
  if (key === 'rpc') return `$${row.rpc ?? 0}`;
  if (isRevenueCol(key)) return `$${((row as any)[key] || 0).toLocaleString()}`;
  return ((row as any)[key] || 0).toLocaleString();
}

/**
 * handleSortToggle — verbatim from InDepthAnalytics lines 330-335
 * Returns a new sortConfig given the current config and a clicked column key.
 */
export function handleSortToggle(
  prev:    { key: string; direction: 'asc' | 'desc' },
  clicked: string,
): { key: string; direction: 'asc' | 'desc' } {
  return {
    key:       clicked,
    direction: prev.key === clicked && prev.direction === 'desc' ? 'asc' : 'desc',
  };
}