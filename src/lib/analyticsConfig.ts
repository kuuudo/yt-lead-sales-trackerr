// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS INTERPRETATION LAYER
// Rules: no schema changes, no new tables, frontend reads only.
// Revenue source of truth = stripe_purchases.
// pixel_purchases = conversion signals + optional unverified amounts.
// events = behavioral only (clicks + opt-ins), never revenue.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Canonical event_type normalization ─────────────────────────────────────
// tracker.ts fires: 'purchase', 'newsletter', 'sales_call', 'consultation',
// 'checkout_intent', 'newsletter_optin', 'lead', 'page_view'.
// These must be normalized to the canonical taxonomy before any metric counts.

export type CanonicalEventType =
  | 'landing_page_view'
  | 'lead_magnet_click'
  | 'newsletter_click'
  | 'call_booking_click'
  | 'consultation_click'
  | 'checkout_intent'       // mid-funnel signal only, never revenue
  | 'lead_magnet_thankyou'
  | 'newsletter_thankyou'
  | 'call_booking_thankyou'
  | 'consultation_thankyou'
  | 'purchase_thankyou';

// Map every raw event_type value (from tracker.ts pixel fires or events table)
// to the canonical type. Return null for unknown/unsupported values.
export function normalizeEventType(raw: string): CanonicalEventType | null {
  const MAP: Record<string, CanonicalEventType> = {
    // tracker.ts pixel event_type values
    purchase:                'purchase_thankyou',
    newsletter:              'newsletter_thankyou',
    sales_call:              'call_booking_thankyou',
    consultation:            'consultation_thankyou',
    checkout_intent:         'checkout_intent',
    // tracker.ts trackEvent() values
    lead:                    'lead_magnet_thankyou',
    newsletter_optin:        'newsletter_thankyou',
    page_view:               'landing_page_view',
    // canonical pass-through
    landing_page_view:       'landing_page_view',
    lead_magnet_click:       'lead_magnet_click',
    newsletter_click:        'newsletter_click',
    call_booking_click:      'call_booking_click',
    consultation_click:      'consultation_click',
    lead_magnet_thankyou:    'lead_magnet_thankyou',
    newsletter_thankyou:     'newsletter_thankyou',
    call_booking_thankyou:   'call_booking_thankyou',
    consultation_thankyou:   'consultation_thankyou',
    purchase_thankyou:       'purchase_thankyou',
  };
  return MAP[raw] ?? null;
}

// Revenue metrics — these keys must NEVER be incremented from events table
export const REVENUE_METRIC_KEYS = new Set([
  'stripe_revenue', 'pixel_revenue', 'total_revenue',
  'direct_offer_revenue', 'consultation_revenue',
  'rpc', 'estimated_call_revenue',
]);

// ── 2. Revenue mode ───────────────────────────────────────────────────────────
// Determined per campaign from campaigns.revenue_mode column.
// Controls how total_revenue is computed at read time — NOT how data is stored.

export type RevenueMode = 'stripe' | 'pixel' | 'hybrid';

export function getRevenueMode(campaign: { revenue_mode?: string | null }): RevenueMode {
  if (campaign.revenue_mode === 'stripe') return 'stripe';
  if (campaign.revenue_mode === 'pixel') return 'pixel';
  // Default to 'hybrid' — campaigns table has no revenue_mode column yet,
  // so we must aggregate both Stripe and Pixel revenue by default.
  return 'hybrid';
}

export const REVENUE_MODE_LABELS: Record<RevenueMode, string> = {
  stripe: 'Verified (Stripe)',
  pixel:  'Estimated (Pixel)',
  hybrid: 'Total (Hybrid)',
};

// ── 3. Metric types and labels ────────────────────────────────────────────────

export type MetricType =
  | 'landing_page_view'
  | 'lead_magnet_click'
  | 'newsletter_click'
  | 'call_booking_click'
  | 'consultation_click'
  | 'lead_magnet_thankyou'
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
  landing_page_view:       'Landing Page Clicks',
  lead_magnet_click:       'Lead Magnet Clicks',
  newsletter_click:        'Newsletter Clicks',
  call_booking_click:      'Call Booking Clicks',
  consultation_click:      'Consultation Page Clicks',
  lead_magnet_thankyou:    'Lead Magnet Opt-ins',
  newsletter_thankyou:     'Newsletter Opt-ins',
  call_booking_thankyou:   'Call Bookings Confirmed',
  consultation_thankyou:   'Consultation Purchases',
  purchase_thankyou:       'Direct Purchases',
  stripe_revenue:          'Stripe Revenue',
  pixel_revenue:           'Pixel Revenue',
  direct_offer_revenue:    'Direct Offer Revenue',
  consultation_revenue:    'Consultation Revenue',
  total_revenue:           'Total Revenue',
  rpc:                     'Revenue Per Click',
  estimated_call_revenue:  'Est. Sales Call Revenue',
};

export const METRIC_COLORS: Record<MetricType, string> = {
  landing_page_view:       '#3b82f6',
  lead_magnet_click:       '#6366f1',
  newsletter_click:        '#ec4899',
  call_booking_click:      '#8b5cf6',
  consultation_click:      '#ef4444',
  lead_magnet_thankyou:    '#f59e0b',
  newsletter_thankyou:     '#f97316',
  call_booking_thankyou:   '#a855f7',
  consultation_thankyou:   '#dc2626',
  purchase_thankyou:       '#22c55e',
  stripe_revenue:          '#16a34a',
  pixel_revenue:           '#2563eb',
  direct_offer_revenue:    '#16a34a',
  consultation_revenue:    '#9333ea',
  total_revenue:           '#dc2626',
  rpc:                     '#0ea5e9',
  estimated_call_revenue:  '#71717a',
};

// ── 4. Video metrics shape ────────────────────────────────────────────────────

export interface VideoMetrics {
  // clicks
  landing_page_view:      number;
  lead_magnet_click:      number;
  newsletter_click:       number;
  call_booking_click:     number;
  consultation_click:     number;
  // conversions
  lead_magnet_thankyou:   number;
  newsletter_thankyou:    number;
  call_booking_thankyou:  number;
  consultation_thankyou:  number;
  purchase_thankyou:      number;
  // revenue (Stripe)
  stripe_revenue:         number;
  direct_offer_revenue:   number;
  consultation_revenue:   number;
  // revenue (Pixel — unverified)
  pixel_revenue:          number;
  // computed
  total_revenue:          number;
  rpc:                    number;
  estimated_call_revenue: number;
  // mode
  revenue_mode:           RevenueMode;
  revenue_mode_label:     string;
}

export function emptyVideoMetrics(mode: RevenueMode = 'stripe'): VideoMetrics {
  return {
    landing_page_view: 0, lead_magnet_click: 0, newsletter_click: 0,
    call_booking_click: 0, consultation_click: 0,
    lead_magnet_thankyou: 0, newsletter_thankyou: 0, call_booking_thankyou: 0,
    consultation_thankyou: 0, purchase_thankyou: 0,
    stripe_revenue: 0, direct_offer_revenue: 0, consultation_revenue: 0,
    pixel_revenue: 0, total_revenue: 0, rpc: 0, estimated_call_revenue: 0,
    revenue_mode: mode,
    revenue_mode_label: REVENUE_MODE_LABELS[mode],
  };
}

// ── 5. Revenue application (call once after all rows are fetched) ─────────────

export interface StripePurchaseRow {
  video_id: string;
  campaign_id: string;
  amount: number;
  type: 'direct' | 'consultation';
  session_id?: string | null;
}

export interface PixelPurchaseRow {
  video_id: string;
  campaign_id: string;
  amount: number | null;
  type?: string | null;
  session_id?: string | null;
}

export function applyRevenue(
  metrics: VideoMetrics,
  stripePurchases: StripePurchaseRow[],
  pixelPurchases: PixelPurchaseRow[],
): void {
  const mode = metrics.revenue_mode;

  // ── Stripe revenue (always computed, shown when mode = stripe | hybrid) ──
  for (const p of stripePurchases) {
    const amt = p.amount ?? 0;
    metrics.stripe_revenue += amt;
    if (p.type === 'direct')        metrics.direct_offer_revenue  += amt;
    if (p.type === 'consultation')  metrics.consultation_revenue  += amt;
  }

  // ── Pixel revenue (mode = pixel | hybrid) ────────────────────────────────
  if (mode === 'pixel' || mode === 'hybrid') {
    // Deduplication: exclude pixel rows whose session_id already has a Stripe record
    const stripeSessionIds = new Set(
      stripePurchases.map(p => p.session_id).filter(Boolean)
    );

    // Also deduplicate pixel rows by session_id (first occurrence wins)
    const seenPixelSessions = new Set<string>();

    for (const p of pixelPurchases) {
      if (p.amount === null || p.amount === undefined) continue;

      // Skip if Stripe already claimed this session
      if (p.session_id && stripeSessionIds.has(p.session_id)) continue;

      // Skip duplicate pixel fires for same session
      if (p.session_id) {
        if (seenPixelSessions.has(p.session_id)) continue;
        seenPixelSessions.add(p.session_id);
      }

      metrics.pixel_revenue += p.amount;
    }
  }

  // ── total_revenue by mode ─────────────────────────────────────────────────
  if (mode === 'stripe')  metrics.total_revenue = metrics.stripe_revenue;
  if (mode === 'pixel')   metrics.total_revenue = metrics.pixel_revenue;
  if (mode === 'hybrid')  metrics.total_revenue = metrics.stripe_revenue + metrics.pixel_revenue;

  // ── Debug logging ─────────────────────────────────────────────────────────
  console.log('[applyRevenue]', {
    mode,
    stripeRows: stripePurchases.length,
    pixelRows: pixelPurchases.length,
    stripe_revenue: metrics.stripe_revenue,
    pixel_revenue: metrics.pixel_revenue,
    total_revenue: metrics.total_revenue,
  });
}

// ── 6. Finalize derived metrics ───────────────────────────────────────────────

export function finalizeMetrics(
  metrics: VideoMetrics,
  campaign?: { estimated_close_rate?: number | null; offer_price?: number | null },
): void {
  metrics.rpc = metrics.landing_page_view > 0
    ? Number((metrics.total_revenue / metrics.landing_page_view).toFixed(2))
    : 0;

  // Estimated call revenue — projection only, NEVER added to total_revenue
  if (campaign) {
    const rate  = (campaign.estimated_close_rate ?? 0) / 100;
    const price = campaign.offer_price ?? 0;
    metrics.estimated_call_revenue = Number(
      (metrics.call_booking_thankyou * rate * price).toFixed(2)
    );
  }

  // ── Debug logging ─────────────────────────────────────────────────────────
  console.log('[finalizeMetrics]', {
    revenue_mode: metrics.revenue_mode,
    revenue_mode_label: metrics.revenue_mode_label,
    stripe_revenue: metrics.stripe_revenue,
    pixel_revenue: metrics.pixel_revenue,
    total_revenue: metrics.total_revenue,
    rpc: metrics.rpc,
  });
}