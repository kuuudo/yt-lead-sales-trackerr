// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS CONFIG
// Contains ONLY: types, labels, constants.
// NO calculations. All metric computation lives in analyticsProcessor.ts.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Raw event_type values (events table — click stream, no normalization) ──
//
// These are the EXACT strings stored in the events table.
// They must NEVER be transformed or remapped.
//
//   'landing_page'         → Landing Page Clicks
//   'lead_magnet'          → Lead Magnet Clicks
//   'newsletter'           → Newsletter Clicks  (also: 'newsletter_click')
//   'newsletter_click'     → Newsletter Clicks
//   'sales_call'           → Call Booking Clicks
//   'consultation'         → Consultation Page Clicks (also: 'consultation_booking')
//   'consultation_booking' → Consultation Page Clicks
//
// All other event_type values exist in the table but are NOT click metrics.

export type RawClickEventType =
  | 'landing_page'
  | 'lead_magnet'
  | 'newsletter'
  | 'newsletter_click'
  | 'sales_call'
  | 'consultation'
  | 'consultation_booking';

// Maps each click/opt-in metric key → exact raw event_type strings from the DB.
// Multi-value arrays handle variant spellings that exist in production.
//
// newsletter_thankyou is intentionally NOT in this map.
// It is sourced from pixel_purchases (event_type = 'newsletter'), not from the
// events table. Counting happens inside processVideoMetrics, not in Step 1.
export const CLICK_EVENT_MAP: Record<string, string[]> = {
  landing_page_view:  ['landing_page'],
  lead_magnet_click:  ['lead_magnet'],
  newsletter_click:   ['newsletter', 'newsletter_click'],
  call_booking_click: ['sales_call'],
  consultation_click: ['consultation', 'consultation_booking'],
};

// ── 2. pixel_purchases event_type values ─────────────────────────────────────
//
//   'purchase'     → Direct Purchase conversion + direct_offer_revenue
//   'sales_call'   → Call Booking Confirmed count + EV source
//   'consultation' → Consultation conversion + consultation_revenue

// ── 3. stripe_purchases schema (REAL TABLE — NO payment_type COLUMN) ─────────
//
// Columns: id, stripe_session_id, token, video_id, campaign_id,
//          amount, currency, created_at, user_id
//
// Classification into offer / consultation is done via StripeClassificationMap,
// keyed by campaign_id (preferred) or video_id (fallback).

export type StripeRevenueType = 'offer' | 'consultation';

// Central classification map — populated from campaign metadata in the UI.
// Key = campaign_id or video_id. Value = revenue type for that campaign/video.
export type StripeClassificationMap = Record<string, StripeRevenueType>;

// ── 4. Revenue mode ───────────────────────────────────────────────────────────

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

// ── 5. Metric types and labels ────────────────────────────────────────────────

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

// ── 6. VideoMetrics shape ─────────────────────────────────────────────────────

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
  // revenue — Stripe verified (stripe_purchases, classified by campaign/video map)
  stripe_revenue:         number;
  direct_offer_revenue:   number;
  consultation_revenue:   number;
  // revenue — Pixel unverified (pixel_purchases, deduped vs Stripe)
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

// ── 7. Purchase row types ─────────────────────────────────────────────────────

// stripe_purchases row — NO payment_type column in this table.
// revenue_type is derived after fetch via StripeClassificationMap.
export interface StripePurchaseRow {
  video_id:     string;
  campaign_id:  string;
  amount:       number;
  revenue_type: StripeRevenueType; // derived via classification map, NOT from DB
  session_id?:  string | null;
}

export interface PixelPurchaseRow {
  video_id:    string | null;
  campaign_id: string | null;
  amount:      number | null;
  event_type?: string | null;
  session_id?: string | null;
}
