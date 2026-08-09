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
//
// 'multiple_contribution' added by the Phase 5B InDepthAnalytics integration
// pass — the ONLY edit made to this legacy section. Purely additive to the
// union; zero behavior change to existing 'offer'/'consultation' handling.
// processVideoMetrics()'s two `if` blocks below are independent guards, not
// an exhaustive switch — a row carrying this new literal simply matches
// neither, exactly as any other unhandled value already would have. See
// Phase 5B Section H for what sets this value and why.

export type StripeRevenueType = 'offer' | 'consultation' | 'multiple_contribution';
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


// ═════════════════════════════════════════════════════════════════════════════
// ── PHASE 5B — CANONICAL DIMENSION-AWARE ANALYTICS CORE ─────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
//
// Everything below this line is NEW (Phase 5B) and fully additive.
//
// SCOPE, EXPLICITLY:
//   • Sections 1–6 above are UNCHANGED. getAnalyticsEngine(), processVideoMetrics(),
//     buildStripeFromPurchaseTypeTable(), TABLE_COLUMNS, COLUMN_LABELS,
//     formatCellValue, handleSortToggle all remain exactly as they were, so
//     InDepthAnalytics.tsx / InDepthAnalyticsWidget.tsx keep compiling and
//     rendering identically. This rebuild does NOT touch their fetch layer.
//   • The canonical core below is the correct, evidence-based replacement
//     model for future callers (Promotion / Member / Operator / Asset /
//     Organization Analytics) that fetch the richer data it needs.
//   • A deliberate, separate integration pass — not this one — will migrate
//     InDepthAnalytics's fetchData() off `stripe_purchase_type` and onto this
//     core. Until then, Section 5's `buildStripeFromPurchaseTypeTable` stays
//     load-bearing for the existing UI, but nothing below this line
//     references it, its input type, or its output shape.
//
// HARD RULE: nothing below this line imports, calls, or reasons about
// `stripe_purchase_type`, `StripePurchaseTypeRow`, `buildStripeFromPurchaseTypeTable`,
// `sessionLookup`, `resolvedVideoId`, or `resolvedCampaignId`. Financial source
// of truth here is exclusively `stripe_purchases.amount` / `pixel_purchases.amount`,
// supplied by the caller on `CanonicalConversionRow.amount`.


// ═════════════════════════════════════════════════════════════════════════════
// PHASE 5B · SECTION A — CANONICAL TYPES
// ═════════════════════════════════════════════════════════════════════════════

// ── A1. Dimension ───────────────────────────────────────────────────────────
//
// The seven groupings the canonical core can aggregate by. Aggregation logic
// itself is dimension-agnostic (Section D) — this type only identifies which
// resolver (Section C) to use.

export type Dimension =
  | 'video'
  | 'campaign'
  | 'asset'
  | 'promotion'
  | 'member'
  | 'organization'
  | 'platform';

// ── A2. Asset provenance ──────────────────────────────────────────────────────
//
// Three distinct, non-interchangeable asset source types (locked architecture
// §1). A Resource Asset legitimately has no campaign anywhere in its chain —
// that is a valid state, never a gap to infer around.

export type AssetType = 'campaign_element_asset' | 'video_asset' | 'resource_asset';

export interface CampaignElementAssetRow {
  asset_id:      string;
  campaign_id:   string;
  // 'landing_page' | 'sales_call' | 'consultation' | 'newsletter' | ... —
  // kept as `string` rather than a closed union since the DB is the source
  // of truth for which element types exist; the engine must not hardcode
  // an exhaustive list it can silently fall out of sync with.
  element_type:  string;
}

export interface VideoAssetRow {
  asset_id:     string;
  video_id:     string;
  campaign_id:  string | null;
}

export interface ResourceAssetRow {
  asset_id: string;
  // Intentionally NO campaign_id field — Resource Assets have no campaign
  // provenance anywhere in their chain (locked architecture §1).
}

export interface AssetProvenance {
  assetType:  AssetType;
  campaignId: string | null; // always null for resource_asset — not a gap
}

/**
 * resolveAssetProvenance
 *
 * Determines which of the three asset source types a given asset_id belongs
 * to, and its campaign (if any). Checks Campaign Element Asset and Video
 * Asset first (both have real campaign provenance); Resource Asset last,
 * where campaignId is legitimately null.
 */
export function resolveAssetProvenance(
  assetId:               string,
  campaignElementAssets: CampaignElementAssetRow[],
  videoAssets:           VideoAssetRow[],
  resourceAssets:        ResourceAssetRow[],
): AssetProvenance | null {
  const cea = campaignElementAssets.find(a => a.asset_id === assetId);
  if (cea) return { assetType: 'campaign_element_asset', campaignId: cea.campaign_id };

  const va = videoAssets.find(a => a.asset_id === assetId);
  if (va) return { assetType: 'video_asset', campaignId: va.campaign_id };

  const ra = resourceAssets.find(a => a.asset_id === assetId);
  if (ra) return { assetType: 'resource_asset', campaignId: null };

  return null;
}

// ── A3. Journey / event shape ─────────────────────────────────────────────────
//
// Full events row — a superset of the legacy `RawEvent` (Section 2a), which
// only carried video_id/campaign_id/event_type/created_at. This is what
// resolveJourneyElementTypes() and attributed-mode dimension resolution need.

export interface JourneyEvent {
  id:                string;
  session_id:        string | null;
  event_type:        string;
  created_at:        string;
  video_id:          string | null;
  campaign_id:       string | null;
  promotion_id:      string | null;
  asset_id:          string | null;
  redirect_link_id:  string | null;
  organization_id:   string | null;
}

// ── A4. Redirect link ─────────────────────────────────────────────────────────

export interface RedirectLinkRow {
  id:               string;
  campaign_id:      string | null;
  asset_id:         string | null;
  promotion_id:     string | null;
  video_id:         string | null;
  // Populated directly on many rows independent of asset_id (Path B evidence).
  link_type:        string | null;
  destination_url:  string | null;
}

// ── A5. Campaign URL fields ───────────────────────────────────────────────────
//
// Used only for Path B corroboration when `link_type` is absent. Indexed by
// string key so new *_url fields don't require an engine change to match
// against — see CAMPAIGN_URL_FIELD_TO_ELEMENT_TYPE below for the known set.

export interface CampaignUrlFields {
  id:                        string;
  landing_page_url?:         string | null;
  newsletter_url?:           string | null;
  sales_call_booking_url?:   string | null;
  consultation_booking_url?: string | null;
  checkout_url?:             string | null;
  [key: string]:             unknown;
}

// ── A6. Promotion / Member attribution shapes ─────────────────────────────────
//
// Member attribution has exactly one valid path (locked architecture §2.5):
//   promotion_id → promotions.assignment_collaborator_id
//                → assignment_collaborators.user_id
// `owner_user_id` is a DIFFERENT concept (the promotion's creator/owner, who
// may be operating directly with no collaborator at all) and must never be
// used as a Member fallback.

export interface PromotionRow {
  id:                          string;
  assignment_collaborator_id:  string | null;
  owner_user_id:               string | null; // present on the type for completeness — never read by resolveMember()
}

export interface AssignmentCollaboratorRow {
  id:       string;
  user_id:  string;
}

// ── A7. Canonical conversion row (unified Stripe/Pixel) ──────────────────────
//
// `amount` is always the caller-supplied `stripe_purchases.amount` (for
// source: 'stripe') or `pixel_purchases.amount` (for source: 'pixel') — never
// derived, never matched against price fields.

export type ConversionSource = 'stripe' | 'pixel';

export interface CanonicalConversionRow {
  id:               string;
  source:           ConversionSource;
  amount:           number;
  session_id:       string | null;
  promotion_id:     string | null;
  asset_id:         string | null;
  video_id:         string | null;
  campaign_id:      string | null;
  organization_id:  string | null;
  created_at:        string;
  // Only meaningful for source === 'pixel' — pixel_purchases.event_type
  // ('purchase' | 'sales_call' | 'consultation' | 'newsletter' | ...).
  // Stripe purchases are always realized transactions and carry no
  // equivalent field; left undefined for source === 'stripe'.
  pixelEventType?:  string | null;
}


// ═════════════════════════════════════════════════════════════════════════════
// PHASE 5B · SECTION B — JOURNEY EVIDENCE RESOLVERS
// ═════════════════════════════════════════════════════════════════════════════

// ── B1. Campaign URL field → element type map ─────────────────────────────────
//
// Used only as Path B's last-resort corroboration step, when a redirect_link
// has neither an asset_id (Path A) nor a populated link_type (Path B primary).

const CAMPAIGN_URL_FIELD_TO_ELEMENT_TYPE: Record<string, string> = {
  landing_page_url:          'landing_page',
  newsletter_url:            'newsletter',
  sales_call_booking_url:    'sales_call',
  consultation_booking_url:  'consultation',
  checkout_url:              'checkout',
};

/**
 * Normalizes a URL for comparison: strips protocol, trailing slash, and
 * query string. Deliberately conservative — this is a corroboration match,
 * not a business rule, so it stays close to literal string equality rather
 * than inferring anything about intent.
 */
function normalizeUrlForMatch(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').split('?')[0];
}

function matchDestinationUrlToCampaignField(
  destinationUrl: string,
  campaign:       CampaignUrlFields,
): string | null {
  const normalizedDestination = normalizeUrlForMatch(destinationUrl);
  for (const [field, elementType] of Object.entries(CAMPAIGN_URL_FIELD_TO_ELEMENT_TYPE)) {
    const campaignUrl = campaign[field];
    if (typeof campaignUrl === 'string' && campaignUrl.length > 0 &&
        normalizeUrlForMatch(campaignUrl) === normalizedDestination) {
      return elementType;
    }
  }
  return null;
}

// ── B2. resolveJourneyElementTypeEvidence (internal core) ────────────────────
//
// Shared implementation behind resolveJourneyElementTypes() (below) and
// buildPurchaseEvidenceGraph() (Section G). Identical traversal logic either
// way; this version additionally records WHICH path resolved each item and
// which specific redirect_link/session produced it, so the evidence graph
// can show its work. resolveJourneyElementTypes() is a thin wrapper that
// discards that provenance and returns the deduplicated value set — its
// behavior is unchanged by this refactor.
function resolveJourneyElementTypeEvidence(
  sessionId:              string | null,
  events:                 JourneyEvent[],
  redirectLinks:          RedirectLinkRow[],
  campaignElementAssets:  CampaignElementAssetRow[],
  campaigns:              CampaignUrlFields[],
): EvidenceItem<string>[] {
  if (!sessionId) return [];

  const sessionEvents = events.filter(e => e.session_id === sessionId && e.redirect_link_id);
  if (sessionEvents.length === 0) return [];

  const redirectLinkById             = new Map(redirectLinks.map(r => [r.id, r]));
  const campaignElementAssetByAsset  = new Map(campaignElementAssets.map(a => [a.asset_id, a]));
  const campaignById                 = new Map(campaigns.map(c => [c.id, c]));

  const items: EvidenceItem<string>[] = [];

  for (const evt of sessionEvents) {
    const link = evt.redirect_link_id ? redirectLinkById.get(evt.redirect_link_id) : undefined;
    if (!link) continue;

    // Path A — Campaign Element Asset
    if (link.asset_id) {
      const cea = campaignElementAssetByAsset.get(link.asset_id);
      if (cea?.element_type) {
        items.push({
          value:       cea.element_type,
          confidence:  'session_linked',
          source:      `events[session=${sessionId}].redirect_link_id=${link.id} → campaign_element_assets.element_type (Path A)`,
        });
        continue; // this link is resolved; Path B is a fallback, not additive evidence for the same link
      }
    }

    // Path B — campaign-native redirect: link_type first
    if (link.link_type) {
      items.push({
        value:       link.link_type,
        confidence:  'session_linked',
        source:      `events[session=${sessionId}].redirect_link_id=${link.id} → redirect_links.link_type (Path B)`,
      });
      continue;
    }

    // Path B — fallback: destination_url corroborated against campaign URL fields
    if (link.destination_url && link.campaign_id) {
      const campaign = campaignById.get(link.campaign_id);
      if (campaign) {
        const matched = matchDestinationUrlToCampaignField(link.destination_url, campaign);
        if (matched) {
          items.push({
            value:       matched,
            confidence:  'session_linked',
            source:      `events[session=${sessionId}].redirect_link_id=${link.id} → destination_url matched campaigns.${matched}_url (Path B fallback)`,
          });
        }
      }
    }
    // If neither path resolves for this specific link, it contributes no
    // evidence — NOT treated as an error, since not every redirect link is
    // guaranteed to be classifiable, and inventing a placeholder here would
    // be exactly the kind of guess this function must not make.
  }

  return items;
}

// ── B3. resolveJourneyElementTypes ────────────────────────────────────────────
//
// Evidence-based, multi-value journey classification (locked architecture §4,
// design spec §8). Given a session, collects every element type the journey's
// redirect-link-sourced events touched via Path A / Path B (see
// resolveJourneyElementTypeEvidence above for the exact traversal).
//
// Returns a DEDUPLICATED SET, never collapsed to one value. No first-match,
// last-match, or priority rule — a journey that touched both 'landing_page'
// and 'consultation' returns both. Business rules that need a single value
// for a specific downstream view are a metric-layer concern, not this
// function's — see deriveLegacyRevenueBuckets() (Section F) for the one
// approved exception, which is explicitly isolated from this function.
//
// NOTE ON SCOPE (confirmed, not a defect): this only sees evidence reachable
// via exact session_id equality. Real multi-domain journeys can span more
// than one session_id (confirmed against real test data — see the evidence
// graph's per-purchase `meta.joinedSessionIds` and `unresolvedDimensions` in
// Section G for how that boundary is made explicit rather than papered over).
export function resolveJourneyElementTypes(
  sessionId:              string | null,
  events:                 JourneyEvent[],
  redirectLinks:          RedirectLinkRow[],
  campaignElementAssets:  CampaignElementAssetRow[],
  campaigns:              CampaignUrlFields[],
): string[] {
  const items = resolveJourneyElementTypeEvidence(
    sessionId, events, redirectLinks, campaignElementAssets, campaigns,
  );
  return Array.from(new Set(items.map(i => i.value)));
}

export interface ResolvedConversion {
  conversion:           CanonicalConversionRow;
  journeyElementTypes:  string[];
}

/**
 * resolveConversionJourneys
 *
 * Pure convenience wrapper: runs resolveJourneyElementTypes() for every
 * conversion row's session_id. This is the "purchase row exposes Revenue,
 * Journey Element Types, and Attribution independently" contract from design
 * spec §8.4 — Revenue lives on `conversion.amount`, Journey Element Types on
 * `journeyElementTypes`, Attribution is resolved separately (Section C/D).
 */
export function resolveConversionJourneys(
  conversions:            CanonicalConversionRow[],
  events:                 JourneyEvent[],
  redirectLinks:          RedirectLinkRow[],
  campaignElementAssets:  CampaignElementAssetRow[],
  campaigns:              CampaignUrlFields[],
): ResolvedConversion[] {
  return conversions.map(conversion => ({
    conversion,
    journeyElementTypes: resolveJourneyElementTypes(
      conversion.session_id, events, redirectLinks, campaignElementAssets, campaigns,
    ),
  }));
}

// ── B3. resolveMember ──────────────────────────────────────────────────────────
//
// The ONLY valid path to Member attribution (locked architecture §2.5).
// When assignment_collaborator_id is null, that promotion has no Member —
// it is Operator-direct, and this returns null rather than falling back to
// owner_user_id.
export function resolveMember(
  promotionId:              string | null,
  promotions:               PromotionRow[],
  assignmentCollaborators:  AssignmentCollaboratorRow[],
): string | null {
  if (!promotionId) return null;

  const promotion = promotions.find(p => p.id === promotionId);
  if (!promotion || !promotion.assignment_collaborator_id) return null;

  const collaborator = assignmentCollaborators.find(
    c => c.id === promotion.assignment_collaborator_id,
  );
  return collaborator?.user_id ?? null;
}


// ═════════════════════════════════════════════════════════════════════════════
// PHASE 5B · SECTION C — DIMENSION RESOLVER MAP
// ═════════════════════════════════════════════════════════════════════════════
//
// Resolver-map pattern (design spec §4): each dimension is just "a function
// that extracts a grouping key from a row." Aggregation (Section D) stays
// dimension-agnostic and only branches on WHICH resolver to use — never on
// metric-calculation logic itself. This is what lets one calculation
// codepath serve InDepth / Promotion / Member / Operator / Asset Analytics.

export interface DimensionResolverContext {
  promotions:               PromotionRow[];
  assignmentCollaborators:  AssignmentCollaboratorRow[];
}

// A row shape wide enough to cover both JourneyEvent and CanonicalConversionRow
// — the only fields any dimension resolver actually reads.
export interface DimensionSourceRow {
  video_id?:         string | null;
  campaign_id?:      string | null;
  asset_id?:         string | null;
  promotion_id?:     string | null;
  organization_id?:  string | null;
  platform?:         string | null;
}

export const DIMENSION_KEY_RESOLVERS: Record<
  Dimension,
  (row: DimensionSourceRow, ctx: DimensionResolverContext) => string | null
> = {
  video:        (row) => row.video_id ?? null,
  campaign:     (row) => row.campaign_id ?? null,
  asset:        (row) => row.asset_id ?? null,
  promotion:    (row) => row.promotion_id ?? null,
  organization: (row) => row.organization_id ?? null,
  // Resolved via video/campaign platform data upstream by the caller — the
  // caller is expected to have already denormalized `platform` onto the row
  // it hands the engine (the engine does not fetch/join for it — see the
  // pure-engine boundary rule).
  platform:     (row) => row.platform ?? null,
  member:       (row, ctx) => resolveMember(row.promotion_id ?? null, ctx.promotions, ctx.assignmentCollaborators),
};


// ═════════════════════════════════════════════════════════════════════════════
// PHASE 5B · SECTION D — DIMENSION-AGNOSTIC AGGREGATION CORE
// ═════════════════════════════════════════════════════════════════════════════

export type AttributionMode = 'direct' | 'attributed';

export interface CanonicalMetricSet {
  clicks:           number;
  uniqueVisitors:   number;
  leads:            number;
  calls:            number;
  purchaseCount:    number;
  revenue:          number;
  rpc:              number;
  revenuePerLead:   number;
}

export function emptyCanonicalMetricSet(): CanonicalMetricSet {
  return {
    clicks: 0, uniqueVisitors: 0, leads: 0, calls: 0,
    purchaseCount: 0, revenue: 0, rpc: 0, revenuePerLead: 0,
  };
}

export interface AnalyticsEngineInputV2 {
  dimension:                Dimension;
  dateRange:                DateRange;
  customRange?:             CustomDateRange | null;
  attributionMode:          AttributionMode;   // §2.3 Direct vs §2.4 Attributed (Journey)
  revenueView:              RevenueView;       // reuses existing 'stripe' | 'pixel' | 'total'

  events:                   JourneyEvent[];
  conversions:              CanonicalConversionRow[]; // stripe + pixel, unified
  redirectLinks:            RedirectLinkRow[];
  campaignElementAssets:    CampaignElementAssetRow[];
  videoAssets:              VideoAssetRow[];
  resourceAssets:           ResourceAssetRow[];
  campaigns:                CampaignUrlFields[];
  promotions:               PromotionRow[];
  assignmentCollaborators:  AssignmentCollaboratorRow[];
}

// AnalyticsResult is an OBSERVED-METRICS ROLLUP, not a credit-assignment
// report. "byDimension.video['x']" means "revenue/clicks/etc. observed
// through video x," never "video x caused/owns this revenue." For the
// underlying per-purchase evidence this rollup is built from, see
// buildPurchaseEvidenceGraph() (Section G).
export interface AnalyticsResult {
  totals:       CanonicalMetricSet;
  byDimension:  Record<string, CanonicalMetricSet>;
  meta: {
    dimension:        Dimension;
    dateRange:        DateRange;
    customRange?:      CustomDateRange | null;
    attributionMode:  AttributionMode;
    revenueView:      RevenueView;
  };
}

// Reuses the SAME click-type matching logic as the legacy engine
// (CLICK_EVENT_MAP, Section 1a) — event-type mapping is orthogonal to
// attribution and was explicitly retained, not reinvented.
function isClickTypeEvent(eventType: string): boolean {
  return Object.values(CLICK_EVENT_MAP).some(types => types.includes(eventType));
}

/**
 * filterJourneyEventsByDate
 *
 * Same date-window logic as filterEventsByDate (Section 2d), reused via
 * getDateBounds rather than re-derived, but operating on the wider
 * JourneyEvent shape so callers don't lose session_id/promotion_id/asset_id/
 * redirect_link_id fields through the narrower legacy RawEvent type.
 */
export function filterJourneyEventsByDate(
  events:        JourneyEvent[],
  range:         DateRange,
  customRange?:  CustomDateRange | null,
): JourneyEvent[] {
  const { start, end } = getDateBounds(range, customRange);
  return events.filter(e => {
    const t = new Date(e.created_at);
    return t >= start && t <= end;
  });
}

// Pixel event_types that count toward revenue/purchaseCount — mirrors the
// existing engine's pixel-mode definition (Section 2g: 'purchase' and
// 'consultation' both contribute to revenue; 'sales_call' and 'newsletter'
// do not). Kept identical rather than reinvented for the canonical core.
const PIXEL_REVENUE_EVENT_TYPES = new Set(['purchase', 'consultation']);

/**
 * resolveDimensionKeysForConversion
 *
 * IMPORTANT FRAMING: this is a ROLLUP-GROUPING function, not an attribution/
 * credit-assignment function. It answers "which dimension buckets should this
 * revenue be reported alongside," never "who caused this purchase" or "who
 * owns this revenue." Locked direction: VSTRK's canonical layer does not
 * force a single-owner credit answer for any purchase — see
 * buildPurchaseEvidenceGraph() (Section G) for the actual per-purchase
 * evidence model this rollup is built on top of.
 *
 *   Direct mode (§2.3):     group under whatever identity field sits directly
 *                           on the conversion row itself (its own promotion_id
 *                           / asset_id / video_id / etc.) — exactly one key.
 *   Attributed mode (§2.4): reconstruct the journey via session_id and group
 *                           under EVERY distinct dimension key actually
 *                           observed — may be zero, one, or several keys. If
 *                           the journey can't be reconstructed (no session_id,
 *                           or no matching events), falls back to the
 *                           conversion's own direct identity rather than
 *                           silently dropping the revenue from the rollup.
 *
 * NOTE: in attributed mode with multiple grouped keys, the same revenue is
 * summed into more than one dimension bucket by design — `totals` is still
 * incremented exactly once per conversion regardless, so `totals.revenue`
 * never double-counts even though the per-dimension breakdown can sum to more
 * than `totals.revenue`. This reflects "revenue observed through multiple
 * touchpoints," not multi-touch credit splitting, and callers comparing
 * byDimension sums against totals should be aware of it.
 */
function resolveDimensionKeysForConversion(
  conversion:  CanonicalConversionRow,
  dimension:   Dimension,
  mode:        AttributionMode,
  events:      JourneyEvent[],
  ctx:         DimensionResolverContext,
): string[] {
  const resolver = DIMENSION_KEY_RESOLVERS[dimension];

  if (mode === 'direct') {
    const key = resolver(conversion, ctx);
    return key ? [key] : [];
  }

  if (!conversion.session_id) {
    const key = resolver(conversion, ctx);
    return key ? [key] : [];
  }

  const sessionEvents = events.filter(e => e.session_id === conversion.session_id);
  const keys = new Set<string>();
  for (const evt of sessionEvents) {
    const key = resolver(evt, ctx);
    if (key) keys.add(key);
  }

  if (keys.size === 0) {
    const fallback = resolver(conversion, ctx);
    if (fallback) keys.add(fallback);
  }

  return Array.from(keys);
}

/**
 * runCanonicalAnalyticsEngine
 *
 * The dimension-agnostic aggregation core (design spec §5, §7). Pure — no
 * Supabase access. Caller supplies already-fetched, bounded arrays.
 *
 * Metric sourcing mirrors design spec §3:
 *   clicks / uniqueVisitors  → events, matched via CLICK_EVENT_MAP, Per-Event attribution
 *   purchaseCount / revenue  → conversions, Direct or Attributed per caller's attributionMode
 *   leads / calls            → pixel conversions' pixelEventType ('newsletter' / 'sales_call')
 *   rpc / revenuePerLead     → derived
 */
export function runCanonicalAnalyticsEngine(input: AnalyticsEngineInputV2): AnalyticsResult {
  const {
    dimension, dateRange, customRange, attributionMode, revenueView,
    events, conversions, promotions, assignmentCollaborators,
  } = input;

  const ctx: DimensionResolverContext = { promotions, assignmentCollaborators };
  const resolver = DIMENSION_KEY_RESOLVERS[dimension];

  // Step 1 — date-filter events
  const dateFilteredEvents = filterJourneyEventsByDate(events, dateRange, customRange);

  // Step 2 — date-filter conversions (same window)
  const { start, end } = getDateBounds(dateRange, customRange);
  const dateFilteredConversions = conversions.filter(c => {
    const t = new Date(c.created_at);
    return t >= start && t <= end;
  });

  // Step 3 — source isolation, mirrors existing RevenueView semantics
  const sourceFilteredConversions = dateFilteredConversions.filter(c => {
    if (revenueView === 'stripe') return c.source === 'stripe';
    if (revenueView === 'pixel')  return c.source === 'pixel';
    return true; // 'total'
  });

  const byDimension: Record<string, CanonicalMetricSet> = {};
  const totals = emptyCanonicalMetricSet();

  const ensureBucket = (key: string): CanonicalMetricSet => {
    if (!byDimension[key]) byDimension[key] = emptyCanonicalMetricSet();
    return byDimension[key];
  };

  // Step 4 — click metrics, Per-Event attribution (§2.2)
  for (const evt of dateFilteredEvents) {
    if (!isClickTypeEvent(evt.event_type)) continue; // page_view and non-click types excluded
    totals.clicks += 1;
    const key = resolver(evt, ctx);
    if (key) ensureBucket(key).clicks += 1;
  }

  // Step 5 — unique visitors: distinct session_id among click-type events
  const sessionsByKey = new Map<string, Set<string>>();
  const sessionsTotal  = new Set<string>();
  for (const evt of dateFilteredEvents) {
    if (!isClickTypeEvent(evt.event_type) || !evt.session_id) continue;
    sessionsTotal.add(evt.session_id);
    const key = resolver(evt, ctx);
    if (key) {
      if (!sessionsByKey.has(key)) sessionsByKey.set(key, new Set());
      sessionsByKey.get(key)!.add(evt.session_id);
    }
  }
  totals.uniqueVisitors = sessionsTotal.size;
  for (const [key, sessions] of sessionsByKey) ensureBucket(key).uniqueVisitors = sessions.size;

  // Step 6 — conversions: purchases, revenue, leads, calls
  for (const conv of sourceFilteredConversions) {
    const isRevenueEligible =
      conv.source === 'stripe' ||
      (conv.source === 'pixel' && conv.pixelEventType != null && PIXEL_REVENUE_EVENT_TYPES.has(conv.pixelEventType));

    if (isRevenueEligible) {
      totals.purchaseCount += 1;
      totals.revenue       += conv.amount;

      const keys = resolveDimensionKeysForConversion(conv, dimension, attributionMode, dateFilteredEvents, ctx);
      for (const key of keys) {
        const bucket = ensureBucket(key);
        bucket.purchaseCount += 1;
        bucket.revenue       += conv.amount;
      }
    }

    if (conv.source === 'pixel' && conv.pixelEventType === 'newsletter') {
      totals.leads += 1;
      const keys = resolveDimensionKeysForConversion(conv, dimension, attributionMode, dateFilteredEvents, ctx);
      for (const key of keys) ensureBucket(key).leads += 1;
    }

    if (conv.source === 'pixel' && conv.pixelEventType === 'sales_call') {
      totals.calls += 1;
      const keys = resolveDimensionKeysForConversion(conv, dimension, attributionMode, dateFilteredEvents, ctx);
      for (const key of keys) ensureBucket(key).calls += 1;
    }
  }

  // Step 7 — derived metrics
  const deriveRates = (m: CanonicalMetricSet) => {
    m.rpc            = m.clicks > 0 ? Number((m.revenue / m.clicks).toFixed(2)) : 0;
    m.revenuePerLead  = m.leads  > 0 ? Number((m.revenue / m.leads).toFixed(2))  : 0;
  };
  deriveRates(totals);
  for (const key of Object.keys(byDimension)) deriveRates(byDimension[key]);

  return {
    totals,
    byDimension,
    meta: { dimension, dateRange, customRange: customRange ?? null, attributionMode, revenueView },
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// PHASE 5B · SECTION F — LEGACY REVENUE BUCKET COMPATIBILITY ADAPTER
// ═════════════════════════════════════════════════════════════════════════════
//
// ISOLATED ON PURPOSE. This is NOT part of the canonical model, is never read
// by resolveJourneyElementTypes() or runCanonicalAnalyticsEngine(), and must
// never feed back into them. It exists solely so a future integration pass
// can project canonical journeyElementTypes evidence onto the two legacy
// binary fields (direct_offer_revenue / consultation_revenue) that
// InDepthAnalytics.tsx currently renders — without reintroducing
// amount-matching or inventing a priority hierarchy.
//
// Canonical `journeyElementTypes` remains the source of truth regardless of
// what this function returns. This function only ever produces an
// ADDITIONAL, separate projection — it does not, and structurally cannot,
// mutate or collapse the canonical set.
//
// APPROVED BUCKETING RULE (explicit, not invented):
//   • journeyElementTypes contains 'consultation'
//       → consultation_revenue += amount
//   • journeyElementTypes contains 'landing_page' AND NOT 'consultation'
//       → direct_offer_revenue += amount
//     ('landing_page' is Offer evidence; VSTRK's campaign taxonomy treats
//     landing_page → Offer directly. But when the same journey also shows
//     explicit 'consultation' evidence, consultation is the more specific
//     path and wins for THIS legacy field only — this is not a general
//     canonical priority rule, it applies exclusively to this compatibility
//     projection.)
//   • 'sales_call' and 'newsletter' are their own conversion types and NEVER
//     fall through to direct_offer_revenue, even when 'landing_page' also
//     appears in the same journey.
//   • 'checkout' is never itself evidence of anything — it's a payment step,
//     not a business conversion type, and is ignored entirely by this
//     predicate.
//   • Any journey that matches none of the above (e.g. sales_call-only,
//     newsletter-only, or no resolvable evidence at all) leaves BOTH legacy
//     fields at 0 for that purchase. The purchase is still fully counted in
//     canonical revenue/purchaseCount — only this legacy binary projection
//     abstains, deliberately, rather than guess.

export interface LegacyRevenueBuckets {
  direct_offer_revenue:  number;
  consultation_revenue:  number;
}

export function deriveLegacyRevenueBuckets(
  journeyElementTypes:  string[],
  amount:               number,
): LegacyRevenueBuckets {
  const buckets: LegacyRevenueBuckets = { direct_offer_revenue: 0, consultation_revenue: 0 };

  const hasConsultation = journeyElementTypes.includes('consultation');
  const hasLandingPage  = journeyElementTypes.includes('landing_page');

  if (hasConsultation) {
    buckets.consultation_revenue = amount;
  } else if (hasLandingPage) {
    buckets.direct_offer_revenue = amount;
  }
  // sales_call-only / newsletter-only / no-evidence journeys: both remain 0,
  // intentionally not guessed.

  return buckets;
}

/**
 * aggregateLegacyRevenueBuckets
 *
 * Convenience summation across a set of ResolvedConversion rows (the output
 * of resolveConversionJourneys()). Provided so a future integration pass has
 * a single call to reach for, without re-deriving the reduction each time.
 */
export function aggregateLegacyRevenueBuckets(
  resolved: ResolvedConversion[],
): LegacyRevenueBuckets {
  return resolved.reduce(
    (acc, { conversion, journeyElementTypes }) => {
      const b = deriveLegacyRevenueBuckets(journeyElementTypes, conversion.amount);
      acc.direct_offer_revenue += b.direct_offer_revenue;
      acc.consultation_revenue += b.consultation_revenue;
      return acc;
    },
    { direct_offer_revenue: 0, consultation_revenue: 0 } as LegacyRevenueBuckets,
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// PHASE 5B · SECTION G — PURCHASE EVIDENCE GRAPH
// ═════════════════════════════════════════════════════════════════════════════
//
// LOCKED DIRECTION (do not relitigate without an explicit decision):
//
//   VSTRK's canonical analytics layer does not answer "who gets 100% credit
//   for this purchase." It answers "what do we actually know about the
//   journey behind this purchase." Revenue attribution and journey evidence
//   are different questions — this section only answers the second one.
//
// RULES THIS SECTION FOLLOWS, WITHOUT EXCEPTION:
//   • Every dimension is a SET of observed values, never a single "winner."
//   • If multiple events in the same reachable session show different
//     values for the same dimension (e.g. two different campaign_ids),
//     BOTH are kept as separate evidence items. No inference about which
//     one is "correct."
//   • `confidence` describes HOW a value was obtained — 'confirmed' (sits
//     directly on the purchase row) vs 'session_linked' (reached by joining
//     the purchase's session_id to a matching event) — it is NOT a ranking
//     and does not imply one is more "real" or more attributable than the
//     other.
//   • A connection is only made if it is reachable through a real,
//     persisted key already in this data model (session_id joins, or
//     values sitting directly on the row). Nothing is connected because two
//     things merely "look like" the same journey. If it can't be reached
//     through a real join, it is UNKNOWN — reported explicitly via
//     `meta.unresolvedDimensions`, never silently omitted, never guessed.
//   • This is a lower-level, additional view alongside
//     runCanonicalAnalyticsEngine() — not a replacement for it. The rollup
//     answers "how much revenue was observed through dimension X across many
//     purchases"; this answers "what do we know about ONE purchase."
//
// CONFIRMED SCOPE LIMITATION (real, not hypothetical — verified against
// actual production rows during this audit): session_id is not always
// stable across a full journey. A real test purchase showed THREE different
// session_id values across landing_page → checkout, with the value that
// ultimately lands on stripe_purchases.session_id only reaching the LAST of
// them. This means `session_linked` evidence is honestly bounded by however
// far that one session_id reaches — it will not surface earlier-session
// evidence (e.g. an earlier landing_page visit under a different session_id)
// even when a human reading the raw logs could tell it was the same visitor.
// This graph does NOT attempt to stitch across session_id boundaries — doing
// so would require either a schema/write-path change (e.g. persisting
// vt_first_touch_redirect_link_id somewhere) or inventing a heuristic no one
// has approved. Both are out of scope for this pass. The boundary is made
// visible via `meta.joinedSessionIds` (exactly one value, always, under the
// current schema) and `meta.unresolvedDimensions`, rather than hidden.

export type EvidenceDimension =
  | 'video'
  | 'campaign'
  | 'organization'
  | 'promotion'
  | 'asset'
  | 'member'
  | 'redirectLink'
  | 'session'
  | 'elementType'
  | 'platform';

export interface EvidenceItem<T> {
  value:       T;
  // How this value was obtained — NOT a credit/priority ranking.
  confidence:  'confirmed' | 'session_linked';
  // Exact, human-traceable path to where this value came from, e.g.
  // "stripe_purchases.campaign_id" or
  // "events[session=213613ee].redirect_link_id=551b73f5 → redirect_links.link_type (Path B)".
  source:      string;
}

export interface PurchaseEvidenceGraph {
  purchase: {
    id:          string;
    source:      ConversionSource;
    amount:      number;
    created_at:  string;
  };
  evidence: Record<EvidenceDimension, EvidenceItem<string>[]>;
  meta: {
    // Every session_id actually reachable from this purchase. Under the
    // current schema this is always exactly [conversion.session_id] (or []
    // if the purchase has no session_id) — never more, because nothing in
    // this data model lets us reliably discover OTHER session_ids belonging
    // to the same visitor. Kept as an array (not a single value) so that if
    // a future schema change enables real cross-session stitching, this
    // shape doesn't need to change — only how it's populated would.
    joinedSessionIds:      string[];
    // Dimensions with zero evidence items — i.e. genuinely unknown, not
    // just "empty by coincidence." A consuming UI should treat this list as
    // the authoritative "we don't know" set, distinct from a dimension that
    // happens to have evidence: [] for some other reason (there currently
    // is no other reason, but this keeps the contract explicit).
    unresolvedDimensions:  EvidenceDimension[];
  };
}

function dedupeEvidenceItems(items: EvidenceItem<string>[]): EvidenceItem<string>[] {
  const seen = new Map<string, EvidenceItem<string>>();
  for (const item of items) {
    const key = `${item.confidence}::${item.value}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return Array.from(seen.values());
}

/**
 * buildPurchaseEvidenceGraph
 *
 * The general-purpose, per-purchase evidence builder. For ONE conversion,
 * collects every dimension value we can actually observe — confirmed
 * (directly on the purchase row) and session-linked (via matching events on
 * the SAME session_id) — as explicit sets, never collapsed to a single
 * "answer." Dimensions with nothing reachable are left as empty arrays and
 * listed in `meta.unresolvedDimensions`.
 *
 * This does not compute revenue attribution, does not pick an owning
 * promotion/asset/member, and does not attempt to reconstruct a journey
 * beyond what the purchase's own session_id can reach. See the Section G
 * header comment above for the full set of rules this follows.
 */
export function buildPurchaseEvidenceGraph(
  conversion:               CanonicalConversionRow,
  events:                   JourneyEvent[],
  redirectLinks:            RedirectLinkRow[],
  campaignElementAssets:    CampaignElementAssetRow[],
  campaigns:                CampaignUrlFields[],
  promotions:               PromotionRow[],
  assignmentCollaborators:  AssignmentCollaboratorRow[],
): PurchaseEvidenceGraph {
  const video:        EvidenceItem<string>[] = [];
  const campaign:      EvidenceItem<string>[] = [];
  const organization:  EvidenceItem<string>[] = [];
  const promotion:     EvidenceItem<string>[] = [];
  const asset:         EvidenceItem<string>[] = [];
  const redirectLink:  EvidenceItem<string>[] = [];
  const session:       EvidenceItem<string>[] = [];
  // platform: no field carrying platform exists anywhere in this function's
  // inputs (not on JourneyEvent, CanonicalConversionRow, or RedirectLinkRow)
  // — left permanently empty until a caller supplies platform-bearing data.
  // Not invented, not inferred.
  const platform:      EvidenceItem<string>[] = [];

  const purchaseSourceLabel = `${conversion.source}_purchases`;

  // ── Confirmed evidence: directly on the purchase row ──────────────────────
  if (conversion.video_id) {
    video.push({ value: conversion.video_id, confidence: 'confirmed', source: `${purchaseSourceLabel}.video_id` });
  }
  if (conversion.campaign_id) {
    campaign.push({ value: conversion.campaign_id, confidence: 'confirmed', source: `${purchaseSourceLabel}.campaign_id` });
  }
  if (conversion.organization_id) {
    organization.push({ value: conversion.organization_id, confidence: 'confirmed', source: `${purchaseSourceLabel}.organization_id` });
  }
  if (conversion.promotion_id) {
    promotion.push({ value: conversion.promotion_id, confidence: 'confirmed', source: `${purchaseSourceLabel}.promotion_id` });
  }
  if (conversion.asset_id) {
    // Note: as of this audit, neither stripe_purchases nor pixel_purchases
    // actually has an asset_id column in the real schema — this branch only
    // fires if a caller has independently populated it. Left in place
    // rather than removed, since CanonicalConversionRow's contract allows
    // callers to supply it if/when the schema changes; it's simply expected
    // to be empty under the current write path.
    asset.push({ value: conversion.asset_id, confidence: 'confirmed', source: `${purchaseSourceLabel}.asset_id` });
  }
  if (conversion.session_id) {
    session.push({ value: conversion.session_id, confidence: 'confirmed', source: `${purchaseSourceLabel}.session_id` });
  }

  // ── Session-linked evidence: events sharing the purchase's session_id ────
  const joinedSessionIds: string[] = conversion.session_id ? [conversion.session_id] : [];
  const sessionEvents = conversion.session_id
    ? events.filter(e => e.session_id === conversion.session_id)
    : [];

  for (const evt of sessionEvents) {
    const evtSource = (field: string) => `events[session=${conversion.session_id}].${field}`;

    if (evt.video_id) {
      video.push({ value: evt.video_id, confidence: 'session_linked', source: evtSource('video_id') });
    }
    if (evt.campaign_id) {
      campaign.push({ value: evt.campaign_id, confidence: 'session_linked', source: evtSource('campaign_id') });
    }
    if (evt.organization_id) {
      organization.push({ value: evt.organization_id, confidence: 'session_linked', source: evtSource('organization_id') });
    }
    if (evt.promotion_id) {
      promotion.push({ value: evt.promotion_id, confidence: 'session_linked', source: evtSource('promotion_id') });
    }
    if (evt.asset_id) {
      asset.push({ value: evt.asset_id, confidence: 'session_linked', source: evtSource('asset_id') });
    }
    if (evt.redirect_link_id) {
      redirectLink.push({ value: evt.redirect_link_id, confidence: 'session_linked', source: evtSource('redirect_link_id') });
    }
  }

  // ── Journey element types: reuses the exact same Path A/B evidence core
  //    as resolveJourneyElementTypes() (Section B) — not reimplemented.
  const elementType = resolveJourneyElementTypeEvidence(
    conversion.session_id, events, redirectLinks, campaignElementAssets, campaigns,
  );

  // ── Member evidence: derived from EVERY observed promotion value (both
  //    confirmed and session-linked), not just one. resolveMember() is a
  //    real, deterministic join (never a guess), so a member resolved from
  //    a 'confirmed' promotion is itself 'confirmed'; from a
  //    'session_linked' promotion, 'session_linked'.
  const member: EvidenceItem<string>[] = [];
  for (const promoItem of promotion) {
    const memberUserId = resolveMember(promoItem.value, promotions, assignmentCollaborators);
    if (memberUserId) {
      member.push({
        value:       memberUserId,
        confidence:  promoItem.confidence,
        source:      `promotions[${promoItem.value}].assignment_collaborator_id → assignment_collaborators.user_id (from ${promoItem.source})`,
      });
    }
    // If resolveMember() returns null (no assignment_collaborator_id, or no
    // matching collaborator row), NOTHING is pushed — per locked architecture
    // §2.5, that promotion has no Member, and it must not silently become
    // an owner_user_id fallback or any other guess.
  }

  const evidence: Record<EvidenceDimension, EvidenceItem<string>[]> = {
    video:         dedupeEvidenceItems(video),
    campaign:      dedupeEvidenceItems(campaign),
    organization:  dedupeEvidenceItems(organization),
    promotion:     dedupeEvidenceItems(promotion),
    asset:         dedupeEvidenceItems(asset),
    member:        dedupeEvidenceItems(member),
    redirectLink:  dedupeEvidenceItems(redirectLink),
    session:       dedupeEvidenceItems(session),
    elementType:   dedupeEvidenceItems(elementType),
    platform:      dedupeEvidenceItems(platform), // always [] under current inputs
  };

  const unresolvedDimensions = (Object.keys(evidence) as EvidenceDimension[])
    .filter(dim => evidence[dim].length === 0);

  return {
    purchase: {
      id:          conversion.id,
      source:      conversion.source,
      amount:      conversion.amount,
      created_at:  conversion.created_at,
    },
    evidence,
    meta: { joinedSessionIds, unresolvedDimensions },
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// PHASE 5B · SECTION H — INDEPTHANALYTICS INTEGRATION HELPERS
// ═════════════════════════════════════════════════════════════════════════════
//
// Bridges the canonical evidence layer (Sections B/G) to the legacy
// InDepthAnalytics contract (StripePurchaseRow, PixelPurchaseRow) WITHOUT
// reviving stripe_purchase_type and WITHOUT forcing a single-owner
// attribution answer. Two separate concerns, kept separate:
//
//   1. deriveLegacyRevenueType() — decides which of the legacy UI's two
//      dollar buckets (direct_offer_revenue / consultation_revenue) a
//      purchase's amount lands in, reusing deriveLegacyRevenueBuckets()
//      (Section F) unchanged. When neither bucket applies, the purchase is
//      labeled 'multiple_contribution' — NOT 'unknown' — per locked product
//      direction: VSTRK doesn't tell the entrepreneur "we don't know what
//      happened," it tells them "this purchase's evidence didn't collapse
//      into one of the two legacy categories; see the full journey."
//
//   2. describeContributionPattern() — a SEPARATE, purely informational
//      signal answering "how many distinct touchpoints does this purchase's
//      evidence graph actually show," independent of whether the legacy
//      bucket resolved cleanly. A purchase can be 'single_contribution' in
//      the legacy bucket sense (elementType resolved fine) while still being
//      'multi_touchpoint' in this sense (many videos/assets preceded it) —
//      these are different questions and this code never conflates them.
//
// KNOWN, DELIBERATE LIMITATION (not a bug, reported here so it's never a
// silent surprise): TABLE_COLUMNS does not render the unconditional
// `stripe_revenue` field — only direct_offer_revenue, consultation_revenue,
// and total_revenue (their sum + EV). A 'multiple_contribution' purchase's
// amount is NOT currently visible in the rendered Total Revenue column,
// because there is no existing UI cell to route it to, and adding one is a
// UI change explicitly out of scope for this pass. The amount is fully
// present in the data (stripe_revenue, and in PurchaseEvidenceGraph) — it
// simply isn't wired to a visible cell yet.

/**
 * deriveLegacyRevenueType
 *
 * Thin wrapper around deriveLegacyRevenueBuckets() (Section F, UNCHANGED —
 * not reimplemented here) that additionally produces the legacy
 * StripePurchaseRow.revenue_type label expected by processVideoMetrics().
 */
export function deriveLegacyRevenueType(
  journeyElementTypes:  string[],
  amount:               number,
): { revenue_type: StripeRevenueType; buckets: LegacyRevenueBuckets } {
  const buckets = deriveLegacyRevenueBuckets(journeyElementTypes, amount);

  let revenue_type: StripeRevenueType;
  if (buckets.consultation_revenue > 0) {
    revenue_type = 'consultation';
  } else if (buckets.direct_offer_revenue > 0) {
    revenue_type = 'offer';
  } else {
    // Neither legacy bucket applies — no landing_page evidence, no
    // consultation evidence (or both, non-collapsibly). Labeled per locked
    // product direction, not treated as an error state.
    revenue_type = 'multiple_contribution';
  }

  return { revenue_type, buckets };
}

// ── Contribution pattern (separate concern from revenue_type above) ──────────

export type ContributionPattern = 'single_touchpoint' | 'multi_touchpoint';

/**
 * describeContributionPattern
 *
 * Counts distinct observed values across video/asset/campaign/redirectLink
 * evidence (both confirmed and session_linked — this is deliberately NOT a
 * confidence-weighted decision, just "how many distinct things did we see").
 * More than one distinct value in ANY of those dimensions marks the journey
 * as multi-touchpoint. This says nothing about causal credit and nothing
 * about which legacy revenue bucket the purchase falls into — it's purely
 * "how rich is the observable journey," for a future drill-down UI to key
 * off of (e.g. the "$500 · Multiple Contribution · click for full journey"
 * pattern).
 */
export function describeContributionPattern(graph: PurchaseEvidenceGraph): ContributionPattern {
  const distinctCount = (items: EvidenceItem<string>[]): number =>
    new Set(items.map(i => i.value)).size;

  const touchpointDimensions: EvidenceDimension[] = ['video', 'asset', 'campaign', 'redirectLink'];
  const isMultiTouchpoint = touchpointDimensions.some(
    dim => distinctCount(graph.evidence[dim]) > 1,
  );

  return isMultiTouchpoint ? 'multi_touchpoint' : 'single_touchpoint';
}

/**
 * buildLegacyStripePurchaseRow
 *
 * The single entry point a caller (InDepthAnalytics.tsx / Widget.tsx) needs
 * for turning ONE real stripe_purchases row into everything the legacy
 * engine requires, without touching stripe_purchase_type anywhere:
 *
 *   stripe_purchases row → CanonicalConversionRow → PurchaseEvidenceGraph
 *     → elementType evidence → deriveLegacyRevenueType() → StripePurchaseRow
 *
 * Returns both the legacy row (for getAnalyticsEngine()) and the full
 * evidence graph + contribution pattern (for the caller to hold onto for a
 * future per-purchase drill-down — not rendered by this function, not
 * required by the legacy engine, purely available).
 */
export function buildLegacyStripePurchaseRow(
  conversion:               CanonicalConversionRow, // conversion.source must be 'stripe'
  events:                   JourneyEvent[],
  redirectLinks:            RedirectLinkRow[],
  campaignElementAssets:    CampaignElementAssetRow[],
  campaigns:                CampaignUrlFields[],
  promotions:               PromotionRow[],
  assignmentCollaborators:  AssignmentCollaboratorRow[],
): {
  row:                  StripePurchaseRow;
  evidenceGraph:        PurchaseEvidenceGraph;
  journeyElementTypes:  string[];
  contributionPattern:  ContributionPattern;
} {
  const evidenceGraph = buildPurchaseEvidenceGraph(
    conversion, events, redirectLinks, campaignElementAssets, campaigns,
    promotions, assignmentCollaborators,
  );

  const journeyElementTypes = evidenceGraph.evidence.elementType.map(i => i.value);
  const { revenue_type }    = deriveLegacyRevenueType(journeyElementTypes, conversion.amount);
  const contributionPattern = describeContributionPattern(evidenceGraph);

  const row: StripePurchaseRow = {
    video_id:     conversion.video_id ?? '',
    campaign_id:  conversion.campaign_id ?? '',
    amount:       conversion.amount,
    revenue_type,
    session_id:   conversion.session_id ?? null,
  };

  return { row, evidenceGraph, journeyElementTypes, contributionPattern };
}
