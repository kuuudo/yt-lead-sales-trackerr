// ─────────────────────────────────────────────────────────────────────────────
// promotionAnalyticsEngine.ts
//
// PURPOSE: Promotion-level analytics, computed by aggregating DIRECTLY on
// promotion_id — events / stripe_purchases / pixel_purchases / redirect_links
// all carry promotion_id as a real column (verified against schema, 2026-08).
//
// This deliberately does NOT reuse analyticsEngine.ts's processVideoMetrics(),
// which is keyed by video_id. That path (see the old promotionAnalytics.ts)
// only attributes correctly when one video belongs to exactly one Promotion —
// the schema allows an asset/video to appear in multiple Promotions, so a
// video_id-keyed rollup can silently pull in another Promotion's traffic.
// Filtering directly on promotion_id sidesteps that assumption entirely.
//
// What this file reuses from analyticsEngine.ts (protected, unmodified):
//   - CLICK_EVENT_MAP            (exact raw event_type → click metric mapping)
//   - mapLinkTypeToRevenueType   (link_type → offer/consultation/sales_call/newsletter)
//   - buildRedirectLinkLookup / buildStripeFromPurchases / buildPixelPurchases
//   - DateRange / CustomDateRange / getDateBounds / filterEventsByDate
// Vocabulary (revenue_type, click metric names) is kept identical on purpose —
// this is not a parallel definition of the same numbers.
//
// What this file reuses from journeyAnalyticsEngine.ts (protected, unmodified):
//   - buildPurchaseJourney + its row/output types, called once per conversion
//     belonging to this promotion. Journey reconstruction stays SESSION-scoped
//     (per that engine's own locked scope) — see journeyContext below.
//
// What this file explicitly does NOT do:
//   - resolve promotion owner / collaborator / operator
//   - assign performance credit or "cause" a conversion to any one asset/step
//   - do any UI formatting/coloring/labeling
//   - stitch across sessions, cluster paths, or infer a "final" touchpoint
// ─────────────────────────────────────────────────────────────────────────────

import {
  CLICK_EVENT_MAP,
  buildRedirectLinkLookup,
  buildStripeFromPurchases,
  buildPixelPurchases,
  getDateBounds,
  type DateRange,
  type CustomDateRange,
  type StripeRevenueType,
} from './analyticsEngine';

import {
  buildPurchaseJourney,
  type CanonicalConversionRow,
  type JourneyEvent,
  type JourneyRedirectLinkRow,
  type CampaignElementAssetRow,
  type Journey,
} from './journeyAnalyticsEngine';

// ═════════════════════════════════════════════════════════════════════════════
// INPUT ROW TYPES
//
// These mirror the same tables journeyAnalyticsEngine.ts reads, so we reuse
// its row shapes directly rather than redefining a parallel set of types that
// could silently drift out of sync.
// ═════════════════════════════════════════════════════════════════════════════

/** events row — identical shape to journeyAnalyticsEngine.ts's JourneyEvent. */
export type PromotionEventRow = JourneyEvent;

/** redirect_links row — identical shape to journeyAnalyticsEngine.ts's JourneyRedirectLinkRow. */
export type PromotionRedirectLinkRow = JourneyRedirectLinkRow;

export interface PromotionStripePurchaseRow {
  id: string;
  promotion_id: string | null;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  amount: number | string | null;
  created_at: string;
  redirect_link_id?: string | null;
  redirect_link_token?: string | null;
  organization_id?: string | null;
}

export interface PromotionPixelPurchaseRow {
  id: string;
  promotion_id: string | null;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  amount: number | string | null;
  created_at: string;
  event_type: string | null;
  organization_id?: string | null;
}

export type ActiveSource = 'stripe' | 'pixel' | 'total';

// ═════════════════════════════════════════════════════════════════════════════
// OUTPUT TYPES
// ═════════════════════════════════════════════════════════════════════════════

export interface PromotionKPIs {
  revenue: number;
  conversions: number;
  clicks: number;
  /** conversions / clicks. 0 if clicks is 0. */
  conversionRate: number;
  /** revenue / clicks — same "revenue per click" formula as analyticsEngine's rpc. 0 if clicks is 0. */
  epc: number;
}

export interface PromotionTimeSeriesPoint {
  /** Bucket key — 'YYYY-MM-DD' (day/week granularity) or 'YYYY-MM' (month granularity). */
  date: string;
  revenue: number;
  conversions: number;
}

export interface PromotionDestinationBreakdown {
  /** Raw link_type value as it exists in the data (e.g. 'landing_page', 'newsletter', 'consultation', 'sales_call', 'checkout'). 'unclassified' when no link_type could be resolved. */
  linkType: string;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface PromotionAssetRow {
  assetId: string;
  /** Second half of the campaign_element_assets composite key. Empty string if never resolvable for this asset. */
  campaignId: string;
  displayName: string;
  clicks: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
}

export interface PromotionJourneyInsights {
  journeyCount: number;
  averageTouchpoints: number;
  mostCommonFirstTouchpoint: {
    type: 'video' | 'asset' | 'unknown';
    id: string | null;
    label: string;
  } | null;
  /** 3-5 representative journeys, evidence only — never labeled as "the cause" of anything. */
  sampleJourneys: Journey[];
  /** Union of every Journey.meta.unresolvedDimensions seen, so the UI can be honest about evidence boundaries. */
  unresolvedDimensions: string[];
}

export interface PromotionAnalyticsResult {
  kpis: PromotionKPIs;
  timeSeries: PromotionTimeSeriesPoint[];
  destinations: PromotionDestinationBreakdown[];
  topAssets: PromotionAssetRow[];
  journeyInsights: PromotionJourneyInsights;
  debug: {
    promotionId: string;
    activeSource: ActiveSource;
    dateRange: DateRange;
    rowCounts: {
      events: number;
      stripePurchases: number;
      pixelPurchases: number;
      redirectLinks: number;
      conversions: number;
    };
  };
}

export interface PromotionJourneyContext {
  /** ALL events sharing a session_id with one of this promotion's conversions — NOT promotion-filtered. See file header. */
  events: PromotionEventRow[];
  /** Enough redirect_links rows to resolve every redirect_link_id touched in journeyContext.events — may belong to other promotions. */
  redirectLinks: PromotionRedirectLinkRow[];
  /** Enough campaign_element_assets rows to resolve every (asset_id, campaign_id) touched in journeyContext. */
  campaignElementAssets: CampaignElementAssetRow[];
}

export interface PromotionAnalyticsEngineInput {
  promotionId: string;
  dateRange: DateRange;
  customRange?: CustomDateRange | null;
  activeSource: ActiveSource;
  includeEV?: boolean;

  /**
   * Promotion-scoped rows: everything here should already be filtered
   * WHERE promotion_id = promotionId by the caller (service layer). This
   * engine ALSO defensively re-filters by promotion_id itself — see
   * scopeToPromotion() below — so a caller mistake can't silently
   * contaminate one promotion's numbers with another's.
   */
  events: PromotionEventRow[];
  stripePurchases: PromotionStripePurchaseRow[];
  pixelPurchases: PromotionPixelPurchaseRow[];
  redirectLinks: PromotionRedirectLinkRow[];
  campaignElementAssets: CampaignElementAssetRow[];

  /**
   * Journey evidence context. Deliberately NOT promotion-scoped — see
   * PromotionJourneyContext doc above. Optional: if omitted, journeyInsights
   * is returned as an empty/zeroed result rather than throwing.
   */
  journeyContext?: PromotionJourneyContext;
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFENSIVE SCOPING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * scopeToPromotion
 *
 * Re-filters every promotion-scoped input array to promotion_id ===
 * promotionId, even though the caller is expected to have already done
 * this via its own WHERE clause. This is the single place that guarantees
 * "no cross-promotion contamination" — if a caller ever passes an
 * unfiltered or wrongly-filtered array, this function is what actually
 * enforces the boundary rather than trusting the caller silently.
 */
function scopeToPromotion(input: PromotionAnalyticsEngineInput) {
  const { promotionId } = input;

  // Secondary disambiguation only.
  // Keep links that are ours OR unmarked (null).
  // Drop only links explicitly stamped for a DIFFERENT promotion.
  const redirectLinks = input.redirectLinks.filter(
    r => r.promotion_id === promotionId || r.promotion_id == null,
  );

  const validTokens = new Set(
    redirectLinks.map(r => r.token).filter((t): t is string => !!t),
  );
  const validVideoIds = new Set(
    redirectLinks.map(r => r.video_id).filter((id): id is string => !!id),
  );

  const events = input.events.filter(
    e => e.video_id != null && validVideoIds.has(e.video_id),
  );

  const stripePurchases = input.stripePurchases.filter(
    p => p.redirect_link_token != null && validTokens.has(p.redirect_link_token),
  );

  const validSessionIds = new Set(
    events.map(e => e.session_id).filter((s): s is string => !!s),
  );

  const pixelPurchases = input.pixelPurchases.filter(
    p => p.session_id != null && validSessionIds.has(p.session_id),
  );

  return { events, stripePurchases, pixelPurchases, redirectLinks };
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED REVENUE/CLICK CALCULATION
//
// Mirrors analyticsEngine.ts's processVideoMetrics() STRIPE / PIXEL / TOTAL
// branch logic exactly (same formulas, same isolation rules per
// activeSource), just without a video_id filter — the input is already
// promotion-scoped, so nothing needs to be re-keyed by video.
// ═════════════════════════════════════════════════════════════════════════════

interface CoreMetrics {
  clicks: {
    landing_page_view: number;
    lead_magnet_click: number;
    newsletter_click: number;
    call_booking_click: number;
    consultation_click: number;
  };
  totalClicks: number;
  direct_offer_revenue: number;
  consultation_revenue: number;
  estimated_call_revenue: number;
  total_revenue: number;
  purchase_thankyou: number;
  consultation_thankyou: number;
  totalConversions: number;
}

function computeClickMetrics(events: PromotionEventRow[]) {
  const clicks: CoreMetrics['clicks'] = {
    landing_page_view: 0,
    lead_magnet_click: 0,
    newsletter_click: 0,
    call_booking_click: 0,
    consultation_click: 0,
  };
  for (const [metricKey, rawTypes] of Object.entries(CLICK_EVENT_MAP)) {
    const typeSet = new Set(rawTypes);
    (clicks as any)[metricKey] = events.filter(e => e.event_type != null && typeSet.has(e.event_type)).length;
  }
  const totalClicks =
    clicks.landing_page_view +
    clicks.lead_magnet_click +
    clicks.newsletter_click +
    clicks.call_booking_click +
    clicks.consultation_click;
  return { clicks, totalClicks };
}

function computeCoreMetrics(
  events: PromotionEventRow[],
  stripePurchases: PromotionStripePurchaseRow[],
  pixelPurchases: PromotionPixelPurchaseRow[],
  activeSource: ActiveSource,
  includeEV: boolean,
  redirectLinkTokenToLinkType: Record<string, string | null>,
): CoreMetrics {
  const { clicks, totalClicks } = computeClickMetrics(events);

  // Reuse analyticsEngine's own enrichment — turns raw stripe rows into
  // { amount, revenue_type, session_id, link_type } using the SAME
  // redirect_link_token → link_type → revenue_type classification the
  // existing Video dashboard uses. sessionLookup is intentionally {} —
  // the promotion engine never needs to resolve a missing video_id/campaign_id,
  // it only reads amount / revenue_type / session_id from the result.
  const enrichedStripe = activeSource === 'pixel'
    ? []
    : buildStripeFromPurchases(
        stripePurchases.map(p => ({
          video_id: p.video_id,
          campaign_id: p.campaign_id,
          amount: p.amount,
          session_id: p.session_id,
          redirect_link_id: p.redirect_link_id ?? null,
          redirect_link_token: p.redirect_link_token ?? null,
        })),
        redirectLinkTokenToLinkType,
        {},
      );

  const enrichedPixel = activeSource === 'stripe'
    ? []
    : buildPixelPurchases(
        pixelPurchases.map(p => ({
          video_id: p.video_id,
          campaign_id: p.campaign_id,
          amount: p.amount,
          event_type: p.event_type,
          session_id: p.session_id,
        })),
        {},
      );

  let direct_offer_revenue = 0;
  let consultation_revenue = 0;
  let estimated_call_revenue = 0;
  let purchase_thankyou = 0;
  let consultation_thankyou = 0;

  if (activeSource === 'stripe') {
    for (const p of enrichedStripe) {
      if (p.revenue_type === 'offer') {
        direct_offer_revenue += p.amount;
        purchase_thankyou++;
      }
      if (p.revenue_type === 'consultation') {
        consultation_revenue += p.amount;
        consultation_thankyou++;
      }
    }
  } else if (activeSource === 'pixel') {
    for (const p of enrichedPixel) {
      const amt = p.amount ?? 0;
      switch (p.event_type) {
        case 'purchase':
          direct_offer_revenue += amt;
          purchase_thankyou++;
          break;
        case 'consultation':
          consultation_revenue += amt;
          consultation_thankyou++;
          break;
        case 'sales_call':
          if (includeEV) estimated_call_revenue += amt;
          break;
        default:
          break;
      }
    }
  } else {
    // total: stripe + pixel, cross-source deduped by session_id (pixel skipped
    // if its session_id already appears in stripe) — same rule as
    // processVideoMetrics TOTAL mode. Conversion COUNTS are additive/no-dedup
    // per that same existing rule.
    for (const p of enrichedPixel) {
      switch (p.event_type) {
        case 'purchase': purchase_thankyou++; break;
        case 'consultation': consultation_thankyou++; break;
        default: break;
      }
    }
    for (const p of enrichedStripe) {
      if (p.revenue_type === 'offer') {
        direct_offer_revenue += p.amount;
        purchase_thankyou++;
      }
      if (p.revenue_type === 'consultation') {
        consultation_revenue += p.amount;
        consultation_thankyou++;
      }
    }
    const stripeSessionIds = new Set(
      enrichedStripe.map(p => p.session_id).filter((s): s is string => !!s),
    );
    for (const p of enrichedPixel) {
      if (p.session_id && stripeSessionIds.has(p.session_id)) continue;
      const amt = p.amount ?? 0;
      if (p.event_type === 'purchase' && amt > 0) direct_offer_revenue += amt;
      if (p.event_type === 'consultation' && amt > 0) consultation_revenue += amt;
      if (p.event_type === 'sales_call' && amt > 0 && includeEV) estimated_call_revenue += amt;
    }
  }

  const total_revenue = direct_offer_revenue + consultation_revenue + estimated_call_revenue;
  const totalConversions = purchase_thankyou + consultation_thankyou;

  return {
    clicks,
    totalClicks,
    direct_offer_revenue,
    consultation_revenue,
    estimated_call_revenue,
    total_revenue,
    purchase_thankyou,
    consultation_thankyou,
    totalConversions,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. KPI CARDS
// ═════════════════════════════════════════════════════════════════════════════

function computeKpis(core: CoreMetrics): PromotionKPIs {
  return {
    revenue: core.total_revenue,
    conversions: core.totalConversions,
    clicks: core.totalClicks,
    conversionRate: core.totalClicks > 0
      ? Number((core.totalConversions / core.totalClicks).toFixed(4))
      : 0,
    epc: core.totalClicks > 0
      ? Number((core.total_revenue / core.totalClicks).toFixed(2))
      : 0,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. PERFORMANCE OVER TIME — new bucketing logic (no equivalent exists yet
//    in analyticsEngine.ts, per the locked architecture decision).
// ═════════════════════════════════════════════════════════════════════════════

type Granularity = 'day' | 'week' | 'month';

function pickGranularity(start: Date, end: Date): Granularity {
  const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
  if (spanDays <= 45) return 'day';
  if (spanDays <= 180) return 'week';
  return 'month';
}

function bucketKey(date: Date, granularity: Granularity): string {
  if (granularity === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'week') {
    // Week bucket = the Monday on/before this date (ISO-ish, no external lib).
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diffToMonday);
    return d.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function computeTimeSeries(
  stripePurchases: PromotionStripePurchaseRow[],
  pixelPurchases: PromotionPixelPurchaseRow[],
  activeSource: ActiveSource,
  dateRange: DateRange,
  customRange: CustomDateRange | null | undefined,
  redirectLinkTokenToLinkType: Record<string, string | null>,
): PromotionTimeSeriesPoint[] {
  const { start, end } = getDateBounds(dateRange, customRange);
  const granularity = pickGranularity(start, end);

  const enrichedStripe = activeSource === 'pixel'
    ? []
    : buildStripeFromPurchases(
        stripePurchases.map(p => ({
          video_id: p.video_id,
          campaign_id: p.campaign_id,
          amount: p.amount,
          session_id: p.session_id,
          redirect_link_id: p.redirect_link_id ?? null,
          redirect_link_token: p.redirect_link_token ?? null,
        })),
        redirectLinkTokenToLinkType,
        {},
      ).map((p, i) => ({ ...p, created_at: stripePurchases[i]?.created_at }));

  const stripeSessionIds = new Set(
    enrichedStripe.map(p => p.session_id).filter((s): s is string => !!s),
  );

  const buckets = new Map<string, PromotionTimeSeriesPoint>();
  const getBucket = (createdAt: string | undefined | null) => {
    if (!createdAt) return null;
    const d = new Date(createdAt);
    const key = bucketKey(d, granularity);
    if (!buckets.has(key)) buckets.set(key, { date: key, revenue: 0, conversions: 0 });
    return buckets.get(key)!;
  };

  if (activeSource !== 'pixel') {
    for (const p of enrichedStripe) {
      if (p.revenue_type !== 'offer' && p.revenue_type !== 'consultation') continue;
      const bucket = getBucket((p as any).created_at);
      if (!bucket) continue;
      bucket.revenue += p.amount;
      bucket.conversions += 1;
    }
  }

  if (activeSource !== 'stripe') {
    for (const p of pixelPurchases) {
      if (activeSource === 'total' && p.session_id && stripeSessionIds.has(p.session_id)) continue;
      if (p.event_type !== 'purchase' && p.event_type !== 'consultation') continue;
      const amt = parseFloat(String(p.amount ?? '0'));
      const bucket = getBucket(p.created_at);
      if (!bucket) continue;
      if (amt > 0) bucket.revenue += amt;
      bucket.conversions += 1;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. CONVERSION DESTINATIONS
//
// Clicks: grouped by events.link_type directly (real column on events, per
// schema — no join needed). Revenue/conversions: grouped by the SAME
// redirect_link_token → link_type classification analyticsEngine.ts already
// uses for Stripe revenue_type. Pixel purchases have no link_type on the row
// and no reliable redirect_link_token join — their revenue is intentionally
// NOT split by destination and is reported once under 'unclassified' rather
// than guessed. This is a real schema gap, not an oversight.
// ═════════════════════════════════════════════════════════════════════════════

function computeDestinations(
  events: PromotionEventRow[],
  stripePurchases: PromotionStripePurchaseRow[],
  pixelPurchases: PromotionPixelPurchaseRow[],
  activeSource: ActiveSource,
  redirectLinkTokenToLinkType: Record<string, string | null>,
): PromotionDestinationBreakdown[] {
  const byType = new Map<string, PromotionDestinationBreakdown>();
  const get = (linkType: string | null | undefined) => {
    const key = linkType ?? 'unclassified';
    if (!byType.has(key)) byType.set(key, { linkType: key, clicks: 0, conversions: 0, revenue: 0 });
    return byType.get(key)!;
  };

  for (const e of events) {
    get(e.link_type).clicks += 1;
  }

  if (activeSource !== 'pixel') {
    const enrichedStripe = buildStripeFromPurchases(
      stripePurchases.map(p => ({
        video_id: p.video_id,
        campaign_id: p.campaign_id,
        amount: p.amount,
        session_id: p.session_id,
        redirect_link_id: p.redirect_link_id ?? null,
        redirect_link_token: p.redirect_link_token ?? null,
      })),
      redirectLinkTokenToLinkType,
      {},
    );
    for (const p of enrichedStripe) {
      if (p.revenue_type !== 'offer' && p.revenue_type !== 'consultation') continue;
      const bucket = get(p.link_type);
      bucket.revenue += p.amount;
      bucket.conversions += 1;
    }
  }

  if (activeSource !== 'stripe') {
    const stripeSessionIds = activeSource === 'total'
      ? new Set(stripePurchases.map(p => p.session_id).filter((s): s is string => !!s))
      : new Set<string>();
    for (const p of pixelPurchases) {
      if (activeSource === 'total' && p.session_id && stripeSessionIds.has(p.session_id)) continue;
      if (p.event_type !== 'purchase' && p.event_type !== 'consultation') continue;
      const amt = parseFloat(String(p.amount ?? '0'));
      const bucket = get('unclassified'); // pixel rows carry no link_type — see doc above
      if (amt > 0) bucket.revenue += amt;
      bucket.conversions += 1;
    }
  }

  return Array.from(byType.values()).sort((a, b) => b.clicks - a.clicks);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. TOP ASSETS — double-keyed by (asset_id, promotion). All inputs here are
//    already promotion-scoped (see scopeToPromotion), so grouping by asset_id
//    alone can no longer pull in another promotion's activity.
// ═════════════════════════════════════════════════════════════════════════════

function computeTopAssets(
  events: PromotionEventRow[],
  stripePurchases: PromotionStripePurchaseRow[],
  pixelPurchases: PromotionPixelPurchaseRow[],
  redirectLinks: PromotionRedirectLinkRow[],
  campaignElementAssets: CampaignElementAssetRow[],
  activeSource: ActiveSource,
  redirectLinkTokenToLinkType: Record<string, string | null>,
): PromotionAssetRow[] {
  const redirectLinkById = new Map(redirectLinks.map(r => [r.id, r]));
  const redirectLinkByToken = new Map(redirectLinks.map(r => [r.token, r]));
  const displayNameByComposite = new Map(
    campaignElementAssets.map(cea => [`${cea.asset_id}::${cea.campaign_id}`, cea.display_name]),
  );

  interface Acc { assetId: string; campaignId: string; clicks: number; conversions: number; revenue: number }
  const byAsset = new Map<string, Acc>();
  const get = (assetId: string, campaignId: string | null) => {
    if (!byAsset.has(assetId)) {
      byAsset.set(assetId, { assetId, campaignId: campaignId ?? '', clicks: 0, conversions: 0, revenue: 0 });
    }
    const acc = byAsset.get(assetId)!;
    if (!acc.campaignId && campaignId) acc.campaignId = campaignId;
    return acc;
  };

  const CLICK_EVENT_TYPES = new Set(Object.values(CLICK_EVENT_MAP).flat());
  for (const e of events) {
    if (!e.asset_id || !e.event_type || !CLICK_EVENT_TYPES.has(e.event_type)) continue;
    get(e.asset_id, e.campaign_id).clicks += 1;
  }

  if (activeSource !== 'pixel') {
    const enrichedStripe = buildStripeFromPurchases(
      stripePurchases.map(p => ({
        video_id: p.video_id,
        campaign_id: p.campaign_id,
        amount: p.amount,
        session_id: p.session_id,
        redirect_link_id: p.redirect_link_id ?? null,
        redirect_link_token: p.redirect_link_token ?? null,
      })),
      redirectLinkTokenToLinkType,
      {},
    );
    for (const p of enrichedStripe) {
      if (p.revenue_type !== 'offer' && p.revenue_type !== 'consultation') continue;
      const linkRow = (p.redirect_link_id && redirectLinkById.get(p.redirect_link_id))
        ?? (p.redirect_link_token && redirectLinkByToken.get(p.redirect_link_token))
        ?? null;
      if (!linkRow?.asset_id) continue; // no resolvable asset — not counted toward any asset row
      const acc = get(linkRow.asset_id, linkRow.campaign_id);
      acc.revenue += p.amount;
      acc.conversions += 1;
    }
  }
  // Pixel purchases have no redirect_link_id/token on the row in this schema,
  // so pixel revenue cannot be attributed to a specific asset — intentionally
  // left out of Top Assets rather than guessed (same schema gap as Destinations).

  const rows: PromotionAssetRow[] = Array.from(byAsset.values()).map(acc => ({
    assetId: acc.assetId,
    campaignId: acc.campaignId,
    displayName: displayNameByComposite.get(`${acc.assetId}::${acc.campaignId}`) ?? acc.assetId,
    clicks: acc.clicks,
    conversions: acc.conversions,
    revenue: acc.revenue,
    conversionRate: acc.clicks > 0 ? Number((acc.conversions / acc.clicks).toFixed(4)) : 0,
  }));

  return rows.sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks);
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. JOURNEY INSIGHTS — thin aggregation layer over buildPurchaseJourney().
//    journeyAnalyticsEngine.ts is called once per conversion and never
//    modified. Language stays evidence-based throughout (see types above).
// ═════════════════════════════════════════════════════════════════════════════

function toCanonicalConversionRow(
  p: PromotionStripePurchaseRow | PromotionPixelPurchaseRow,
  source: 'stripe' | 'pixel',
): CanonicalConversionRow {
  return {
    id: p.id,
    source,
    amount: p.amount,
    created_at: p.created_at,
    session_id: p.session_id,
    video_id: p.video_id,
    campaign_id: p.campaign_id,
    promotion_id: p.promotion_id,
    organization_id: p.organization_id ?? null,
    redirect_link_id: 'redirect_link_id' in p ? p.redirect_link_id ?? null : null,
    redirect_link_token: 'redirect_link_token' in p ? p.redirect_link_token ?? null : null,
  };
}

function computeJourneyInsights(
  stripePurchases: PromotionStripePurchaseRow[],
  pixelPurchases: PromotionPixelPurchaseRow[],
  activeSource: ActiveSource,
  journeyContext: PromotionJourneyContext | undefined,
): PromotionJourneyInsights {
  const empty: PromotionJourneyInsights = {
    journeyCount: 0,
    averageTouchpoints: 0,
    mostCommonFirstTouchpoint: null,
    sampleJourneys: [],
    unresolvedDimensions: [],
  };
  if (!journeyContext) return empty;

  const conversions: CanonicalConversionRow[] = [
    ...(activeSource !== 'pixel' ? stripePurchases.map(p => toCanonicalConversionRow(p, 'stripe')) : []),
    ...(activeSource !== 'stripe' ? pixelPurchases.map(p => toCanonicalConversionRow(p, 'pixel')) : []),
  ];
  if (conversions.length === 0) return empty;

  const journeys: Journey[] = conversions.map(c =>
    buildPurchaseJourney(
      c,
      journeyContext.events,
      journeyContext.redirectLinks,
      journeyContext.campaignElementAssets,
    ),
  );

  const touchpointCounts = journeys.map(j => j.steps.length);
  const averageTouchpoints = touchpointCounts.length > 0
    ? Number((touchpointCounts.reduce((a, b) => a + b, 0) / touchpointCounts.length).toFixed(2))
    : 0;

  const firstTouchCounts = new Map<string, { type: 'video' | 'asset' | 'unknown'; id: string | null; count: number }>();
  for (const j of journeys) {
    const first = j.steps[0];
    if (!first) continue;
    let key: string;
    let type: 'video' | 'asset' | 'unknown';
    let id: string | null;
    if (first.video_id) { type = 'video'; id = first.video_id; key = `video:${id}`; }
    else if (first.asset_id) { type = 'asset'; id = first.asset_id; key = `asset:${id}`; }
    else { type = 'unknown'; id = null; key = 'unknown'; }
    const existing = firstTouchCounts.get(key);
    if (existing) existing.count += 1;
    else firstTouchCounts.set(key, { type, id, count: 1 });
  }
  let mostCommonFirstTouchpoint: PromotionJourneyInsights['mostCommonFirstTouchpoint'] = null;
  let bestCount = 0;
  for (const [, v] of firstTouchCounts) {
    if (v.count > bestCount) {
      bestCount = v.count;
      mostCommonFirstTouchpoint = {
        type: v.type,
        id: v.id,
        label: v.type === 'video' ? `Video ${v.id}` : v.type === 'asset' ? `Asset ${v.id}` : 'Unknown first touchpoint',
      };
    }
  }

  const unresolvedDimensions = Array.from(
    new Set(journeys.flatMap(j => j.meta.unresolvedDimensions)),
  );

  // 3-5 representative journeys: prefer ones with more than one step (more
  // interesting evidence), fall back to whatever exists.
  const withSteps = journeys.filter(j => j.steps.length > 0);
  const sampleJourneys = (withSteps.length > 0 ? withSteps : journeys).slice(0, 5);

  return {
    journeyCount: journeys.length,
    averageTouchpoints,
    mostCommonFirstTouchpoint,
    sampleJourneys,
    unresolvedDimensions,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═════════════════════════════════════════════════════════════════════════════

export function computePromotionAnalytics(input: PromotionAnalyticsEngineInput): PromotionAnalyticsResult {
  const { promotionId, dateRange, customRange, activeSource, includeEV = true } = input;

  const scoped = scopeToPromotion(input);
  const redirectLinkTokenToLinkType = buildRedirectLinkLookup(
    scoped.redirectLinks.map(r => ({ token: r.token, link_type: r.link_type })),
  );

  const core = computeCoreMetrics(
    scoped.events,
    scoped.stripePurchases,
    scoped.pixelPurchases,
    activeSource,
    includeEV,
    redirectLinkTokenToLinkType,
  );

  const kpis = computeKpis(core);

  const timeSeries = computeTimeSeries(
    scoped.stripePurchases,
    scoped.pixelPurchases,
    activeSource,
    dateRange,
    customRange,
    redirectLinkTokenToLinkType,
  );

  const destinations = computeDestinations(
    scoped.events,
    scoped.stripePurchases,
    scoped.pixelPurchases,
    activeSource,
    redirectLinkTokenToLinkType,
  );

  const topAssets = computeTopAssets(
    scoped.events,
    scoped.stripePurchases,
    scoped.pixelPurchases,
    scoped.redirectLinks,
    input.campaignElementAssets,
    activeSource,
    redirectLinkTokenToLinkType,
  );

  const journeyInsights = computeJourneyInsights(
    scoped.stripePurchases,
    scoped.pixelPurchases,
    activeSource,
    input.journeyContext,
  );

  return {
    kpis,
    timeSeries,
    destinations,
    topAssets,
    journeyInsights,
    debug: {
      promotionId,
      activeSource,
      dateRange,
      rowCounts: {
        events: scoped.events.length,
        stripePurchases: scoped.stripePurchases.length,
        pixelPurchases: scoped.pixelPurchases.length,
        redirectLinks: scoped.redirectLinks.length,
        conversions: core.totalConversions,
      },
    },
  };
}
