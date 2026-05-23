// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS PROCESSOR
// Single source of truth for ALL metric calculations.
// Rules:
//   • events table  = behavioral signals only (clicks + opt-ins)
//   • stripe_purchases = real revenue rail (verified)
//   • pixel_purchases  = real revenue rail (unverified, deduped vs Stripe)
//   • Total real revenue = Stripe + Pixel (deduped)
//   • estimated_call_revenue / EV = projection only, never added to totals
//   • EV is opt-in via includeEV flag
//   • Attribution keyed by BOTH campaign_id and video_id
// ─────────────────────────────────────────────────────────────────────────────

import {
  normalizeEventType,
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
  events:          RawEvent[];          // already date-filtered
  stripePurchases: StripePurchaseRow[];
  pixelPurchases:  PixelPurchaseRow[];
  includeEV?:      boolean;             // include estimated_call_revenue (default: true)
}

export interface VideoMetricsResult extends VideoMetrics {
  /** True total = stripe + pixel (deduped). Never inflated by EV. */
  total_revenue:          number;
  /** Projection only. Zero when includeEV=false. */
  estimated_call_revenue: number;
}

// ── Date cutoff helper ────────────────────────────────────────────────────────

export type DateRange = '7days' | '30days' | '2months' | '6months' | '1year' | 'all';

export function getDateCutoff(range: DateRange): Date {
  const now = new Date();
  switch (range) {
    case '7days':   { const d = new Date(now); d.setDate(d.getDate() - 7);          return d; }
    case '30days':  { const d = new Date(now); d.setDate(d.getDate() - 30);         return d; }
    case '2months': { const d = new Date(now); d.setMonth(d.getMonth() - 2);        return d; }
    case '6months': { const d = new Date(now); d.setMonth(d.getMonth() - 6);        return d; }
    case '1year':   { const d = new Date(now); d.setFullYear(d.getFullYear() - 1);  return d; }
    case 'all':     return new Date(0);
    default:        { const d = new Date(now); d.setDate(d.getDate() - 30);         return d; }
  }
}

export function filterEventsByDate(events: RawEvent[], range: DateRange): RawEvent[] {
  const cutoff = getDateCutoff(range);
  return events.filter(e => new Date(e.created_at) >= cutoff);
}

// ── Stripe purchase type derivation ──────────────────────────────────────────
// stripe_purchases has no type column — derive from campaign metadata.

export function deriveStripePurchaseType(
  amount: number,
  campaign?: CampaignMeta,
): 'direct' | 'consultation' {
  if (
    campaign?.has_paid_consultation &&
    campaign?.consultation_fee != null &&
    Number(amount) === Number(campaign.consultation_fee)
  ) {
    return 'consultation';
  }
  return 'direct';
}

export function enrichStripePurchases(
  raw: Array<Omit<StripePurchaseRow, 'type'> & { type?: string | null }>,
  sessionLookup: Record<string, { video_id: string; campaign_id: string }>,
  campaigns: CampaignMeta[],
): StripePurchaseRow[] {
  return raw.map(p => {
    // Resolve missing video_id/campaign_id via session
    const resolved: typeof p =
      !p.video_id && p.session_id && sessionLookup[p.session_id]
        ? { ...p, ...sessionLookup[p.session_id] }
        : p;

    const campaign = campaigns.find(c => c.id === resolved.campaign_id);
    return {
      ...resolved,
      video_id:    resolved.video_id    ?? '',
      campaign_id: resolved.campaign_id ?? '',
      amount:      resolved.amount      ?? 0,
      type:        deriveStripePurchaseType(resolved.amount ?? 0, campaign),
    } satisfies StripePurchaseRow;
  });
}

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
  const mode = getRevenueMode(campaign ?? {});
  const metrics = emptyVideoMetrics(mode) as VideoMetricsResult;

  // ── 1. Behavioral event counts (events table only) ────────────────────────
  for (const e of events) {
    if (e.video_id !== videoId) continue;

    const canonical = normalizeEventType(e.event_type);
    if (!canonical) continue;

    // Guard: revenue metrics must never be incremented from events
    if (canonical === 'purchase_thankyou') {
      metrics.purchase_thankyou++;
    } else if (canonical in metrics) {
      (metrics as any)[canonical]++;
    }
  }

  // ── 2. Stripe revenue (video-scoped) ──────────────────────────────────────
  const vidStripe = stripePurchases.filter(
    p => p.video_id === videoId && (p.amount ?? 0) > 0,
  );
  for (const p of vidStripe) {
    const amt = p.amount ?? 0;
    metrics.stripe_revenue += amt;
    if (p.type === 'direct')       metrics.direct_offer_revenue += amt;
    if (p.type === 'consultation') metrics.consultation_revenue += amt;
  }

  // ── 3. Pixel revenue (video-scoped, deduped against Stripe) ───────────────
  if (mode === 'pixel' || mode === 'hybrid') {
    const stripeSessionIds = new Set(
      vidStripe.map(p => p.session_id).filter(Boolean) as string[],
    );
    const seenPixelSessions = new Set<string>();

    const vidPixel = pixelPurchases.filter(
      p => p.video_id === videoId && (p.amount ?? 0) > 0,
    );

    for (const p of vidPixel) {
      // Skip if Stripe already claimed this session
      if (p.session_id && stripeSessionIds.has(p.session_id)) continue;
      // Skip duplicate pixel fires for same session
      if (p.session_id) {
        if (seenPixelSessions.has(p.session_id)) continue;
        seenPixelSessions.add(p.session_id);
      }
      metrics.pixel_revenue += p.amount ?? 0;
    }
  }

  // ── 4. Total real revenue by mode ─────────────────────────────────────────
  if (mode === 'stripe')  metrics.total_revenue = metrics.stripe_revenue;
  if (mode === 'pixel')   metrics.total_revenue = metrics.pixel_revenue;
  if (mode === 'hybrid')  metrics.total_revenue = metrics.stripe_revenue + metrics.pixel_revenue;

  // ── 5. RPC (revenue per landing page click) ───────────────────────────────
  metrics.rpc = metrics.landing_page_view > 0
    ? Number((metrics.total_revenue / metrics.landing_page_view).toFixed(2))
    : 0;

  // ── 6. Estimated call revenue — projection only, never added to totals ────
  if (includeEV && campaign) {
    const rate  = (campaign.estimated_close_rate ?? 0) / 100;
    const price = campaign.offer_price ?? 0;
    metrics.estimated_call_revenue = Number(
      (metrics.call_booking_thankyou * rate * price).toFixed(2),
    );
  } else {
    metrics.estimated_call_revenue = 0;
  }

  // ── Debug ─────────────────────────────────────────────────────────────────
  console.log('[processVideoMetrics]', {
    videoId,
    campaignId,
    mode,
    stripe_revenue:          metrics.stripe_revenue,
    pixel_revenue:           metrics.pixel_revenue,
    total_revenue:           metrics.total_revenue,
    rpc:                     metrics.rpc,
    estimated_call_revenue:  metrics.estimated_call_revenue,
  });

  return metrics;
}

// ── Campaign-level aggregator ─────────────────────────────────────────────────
// Sums processed video metrics for a given campaign.
// total_revenue is always stripe + pixel (deduped per video already).
// EV is summed only when the individual video computed it (i.e. includeEV=true).

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
    totals.lead_magnet_thankyou   += v.lead_magnet_thankyou;
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
// Used by UI to pick which revenue column to display without re-computing.

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
