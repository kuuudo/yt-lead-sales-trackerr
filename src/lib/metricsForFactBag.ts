// ─────────────────────────────────────────────────────────────────────────────
// metricsForFactBag.ts
//
// PURPOSE: Run the EXISTING canonical metric pipeline on an already-
// partitioned, already-deduped fact bag. No fetch. No grouping. No UI.
//
// Same vocabulary as All Assets / InDepthAnalytics:
//   buildStripeFromPurchases → buildPixelPurchases → processVideoMetrics
//
// processVideoMetrics filters by video_id === videoId. Callers must stamp
// every row's video_id to bagId before (or via) this helper — matching the
// rewrite trick used in assetAnalyticsEngine.computeRelationships.
//
// Stripe data here is Supabase stripe_purchases facts (already ingested),
// NOT the Stripe API / SDK.
// ─────────────────────────────────────────────────────────────────────────────

import {
  processVideoMetrics,
  buildStripeFromPurchases,
  buildPixelPurchases,
  type ProcessVideoInput,
  type VideoMetricsResult,
  type RawEvent,
  type StripePurchasesRawRow,
  type PixelPurchaseRow,
} from './analyticsEngine';

export type FactBagActiveSource = ProcessVideoInput['activeSource'];

export interface MetricsForFactBagInput {
  /** Sentinel key stamped onto every row as video_id (promotion id, marketer id, or __unattributed__). */
  bagId: string;
  events: RawEvent[];
  /** Raw stripe_purchases-shaped rows (pre-source-isolation). */
  stripeRaw: StripePurchasesRawRow[];
  /** Raw pixel_purchases-shaped rows (pre-source-isolation). */
  pixelRaw: Array<{
    video_id?: string | null;
    campaign_id?: string | null;
    amount?: number | string | null;
    event_type?: string | null;
    session_id?: string | null;
  }>;
  activeSource: FactBagActiveSource;
  /** token → link_type from buildRedirectLinkLookup (caller builds once per org fetch). */
  redirectLinkLookup: Record<string, string | null>;
  includeEV?: boolean;
}

/**
 * Stamp bagId as video_id on events / purchase raw rows, map through existing
 * builders, isolate by activeSource, then processVideoMetrics.
 * Does not modify processVideoMetrics internals.
 */
export function metricsForFactBag(input: MetricsForFactBagInput): VideoMetricsResult {
  const {
    bagId,
    events,
    stripeRaw,
    pixelRaw,
    activeSource,
    redirectLinkLookup,
    includeEV = true,
  } = input;

  const stampedEvents: RawEvent[] = events.map(e => ({
    ...e,
    video_id: bagId,
  }));

  const stampedStripeRaw: StripePurchasesRawRow[] = stripeRaw.map(r => ({
    ...r,
    video_id: bagId,
  }));

  const stampedPixelRaw = pixelRaw.map(r => ({
    ...r,
    video_id: bagId,
  }));

  // Empty session lookup — same posture as All Assets relationships path
  // (identity already resolved; we only need classification via redirect token).
  const sessionLookup: Record<string, { video_id: string; campaign_id: string }> = {};

  let stripePurchases = buildStripeFromPurchases(
    stampedStripeRaw,
    redirectLinkLookup,
    sessionLookup,
  );
  let pixelPurchases: PixelPurchaseRow[] = buildPixelPurchases(
    stampedPixelRaw,
    sessionLookup,
  );

  // Source isolation — mirrors getAnalyticsEngine / All Assets
  if (activeSource === 'pixel') stripePurchases = [];
  if (activeSource === 'stripe') pixelPurchases = [];

  return processVideoMetrics({
    videoId: bagId,
    campaignId: null,
    activeSource,
    includeEV,
    events: stampedEvents,
    stripePurchases,
    pixelPurchases,
  });
}
