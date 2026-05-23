// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS CONFIG
// Contains ONLY: types, labels, normalization maps, constants.
// NO calculations. All metric computation lives in analyticsProcessor.ts.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Canonical event_type normalization ─────────────────────────────────────

export type CanonicalEventType =
  | 'landing_page_view'
  | 'lead_magnet_click'
  | 'newsletter_click'
  | 'call_booking_click'
  | 'consultation_click'
  | 'checkout_intent'
  | 'lead_magnet_thankyou'
  | 'newsletter_thankyou'
  | 'call_booking_thankyou'
  | 'consultation_thankyou'
  | 'purchase_thankyou';

export function normalizeEventType(raw: string): CanonicalEventType | null {
  const MAP: Record<string, CanonicalEventType> = {
    // tracker.ts pixel event_type values
    purchase:               'purchase_thankyou',
    newsletter:             'newsletter_thankyou',
    sales_call:             'call_booking_thankyou',
    consultation:           'consultation_thankyou',
    checkout_intent:        'checkout_intent',
    // tracker.ts trackEvent() values
    lead:                   'lead_magnet_thankyou',
    newsletter_optin:       'newsletter_thankyou',
    page_view:              'landing_page_view',
    // canonical pass-through
    landing_page_view:      'landing_page_view',
    lead_magnet_click:      'lead_magnet_click',
    newsletter_click:       'newsletter_click',
    call_booking_click:     'call_booking_click',
    consultation_click:     'consultation_click',
    lead_magnet_thankyou:   'lead_magnet_thankyou',
    newsletter_thankyou:    'newsletter_thankyou',
    call_booking_thankyou:  'call_booking_thankyou',
    consultation_thankyou:  'consultation_thankyou',
    purchase_thankyou:      'purchase_thankyou',
  };
  return MAP[raw] ?? null;
}

// Revenue metric keys — must NEVER be incremented from the events table.
export const REVENUE_METRIC_KEYS = new Set([
  'stripe_revenue', 'pixel_revenue', 'total_revenue',
  'direct_offer_revenue', 'consultation_revenue',
  'rpc', 'estimated_call_revenue',
]);

// ── 2. Revenue mode ───────────────────────────────────────────────────────────

export type RevenueMode = 'stripe' | 'pixel' | 'hybrid';

export function getRevenueMode(campaign: { revenue_mode?: string | null }): RevenueMode {
  if (campaign.revenue_mode === 'stripe') return 'stripe';
  if (campaign.revenue_mode === 'pixel')  return 'pixel';
  return 'hybrid'; // default — total (stripe + pixel deduped)
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

// ── 4. VideoMetrics shape ─────────────────────────────────────────────────────

export interface VideoMetrics {
  // behavioral clicks
  landing_page_view:      number;
  lead_magnet_click:      number;
  newsletter_click:       number;
  call_booking_click:     number;
  consultation_click:     number;
  // behavioral conversions
  lead_magnet_thankyou:   number;
  newsletter_thankyou:    number;
  call_booking_thankyou:  number;
  consultation_thankyou:  number;
  purchase_thankyou:      number;
  // revenue — Stripe (verified)
  stripe_revenue:         number;
  direct_offer_revenue:   number;
  consultation_revenue:   number;
  // revenue — Pixel (unverified, deduped vs Stripe)
  pixel_revenue:          number;
  // computed totals
  total_revenue:          number;
  rpc:                    number;
  // projection — never added to totals
  estimated_call_revenue: number;
  // mode metadata
  revenue_mode:           RevenueMode;
  revenue_mode_label:     string;
}

export function emptyVideoMetrics(mode: RevenueMode = 'hybrid'): VideoMetrics {
  return {
    landing_page_view: 0, lead_magnet_click: 0, newsletter_click: 0,
    call_booking_click: 0, consultation_click: 0,
    lead_magnet_thankyou: 0, newsletter_thankyou: 0,
    call_booking_thankyou: 0, consultation_thankyou: 0, purchase_thankyou: 0,
    stripe_revenue: 0, direct_offer_revenue: 0, consultation_revenue: 0,
    pixel_revenue: 0, total_revenue: 0, rpc: 0, estimated_call_revenue: 0,
    revenue_mode:       mode,
    revenue_mode_label: REVENUE_MODE_LABELS[mode],
  };
}

// ── 5. Purchase row types ─────────────────────────────────────────────────────

export interface StripePurchaseRow {
  video_id:    string;
  campaign_id: string;
  amount:      number;
  type:        'direct' | 'consultation';
  session_id?: string | null;
}

export interface PixelPurchaseRow {
  video_id:    string | null;
  campaign_id: string | null;
  amount:      number | null;
  type?:       string | null;
  session_id?: string | null;
}
