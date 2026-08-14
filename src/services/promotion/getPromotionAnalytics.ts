/**
 * src/services/promotion/getPromotionAnalytics.ts
 *
 * Fetch layer for Individual Promotion Analytics. Resolves promotion-scoped
 * events / stripe_purchases / pixel_purchases / redirect_links directly by
 * promotion_id (per the locked architecture — see promotionAnalyticsEngine.ts
 * header), plus a SESSION-scoped journey context, then hands everything to
 * computePromotionAnalytics(). No analytics math lives in this file — this
 * is data access only.
 *
 * STRIPE PURCHASE SCOPING (see fetchPromotionStripePurchases below): real
 * stripe_purchases rows can have promotion_id = NULL at write time even
 * though they genuinely belong to this promotion via
 * redirect_link_id → redirect_links.promotion_id. A plain
 * `.eq('promotion_id', promotionId)` never matches those NULL rows, so
 * Stripe purchases are fetched by promotion_id OR by this promotion's own
 * redirect_link ids and merged. pixel_purchases has no redirect_link_id/
 * redirect_link_token column in this schema, so the same NULL-fallback does
 * not apply there — it stays a plain promotion_id match.
 *
 * JOURNEY CONTEXT RULE (locked): the conversion itself must originate from
 * the selected promotion (promotion_id = promotionId), but journey
 * reconstruction is session-scoped and deliberately NOT filtered by
 * promotion_id — a session can touch other promotions' redirect links /
 * assets on its way to a conversion, and journeyAnalyticsEngine.ts is meant
 * to see all of that. Only the conversion-origin query is promotion-scoped;
 * everything fetched for journeyContext is scoped by session_id instead.
 */

import { supabase } from '../../lib/supabase';
import {
  getDateBounds,
  type DateRange,
  type CustomDateRange,
} from '../../lib/analyticsEngine';
import {
  computePromotionAnalytics,
  type PromotionAnalyticsResult,
  type PromotionAnalyticsEngineInput,
  type PromotionEventRow,
  type PromotionRedirectLinkRow,
  type PromotionStripePurchaseRow,
  type PromotionPixelPurchaseRow,
  type PromotionJourneyContext,
  type ActiveSource,
} from '../../lib/promotionAnalyticsEngine';
import type { CampaignElementAssetRow } from '../../lib/journeyAnalyticsEngine';

export interface GetPromotionAnalyticsParams {
  promotionId: string;
  dateRange: DateRange;
  customRange?: CustomDateRange | null;
  activeSource: ActiveSource;
  includeEV?: boolean;
}

const EVENTS_COLUMNS =
  'id, session_id, video_id, campaign_id, event_type, created_at, organization_id, promotion_id, asset_id, redirect_link_id, tracking_hostname, link_type';

const REDIRECT_LINKS_COLUMNS =
  'id, token, video_id, campaign_id, link_type, destination_url, organization_id, promotion_id, asset_id, tracking_hostname';

const STRIPE_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id';

const PIXEL_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, event_type, organization_id';

const CAMPAIGN_ELEMENT_ASSETS_COLUMNS =
  'id, asset_id, campaign_id, element_type, source_field, display_name';

// Postgrest .in() filters are sent as URL query params — chunk large ID
// lists rather than risking an oversized request for busy promotions.
const IN_CHUNK_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchByIn<T>(
  table: string,
  columns: string,
  column: string,
  values: string[],
): Promise<T[]> {
  const distinct = Array.from(new Set(values.filter(Boolean)));
  if (distinct.length === 0) return [];

  const results: T[] = [];
  for (const batch of chunk(distinct, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase.from(table).select(columns).in(column, batch);
    if (error) {
      throw new Error(`Failed to fetch ${table} by ${column}: ${error.message}`);
    }
    results.push(...((data ?? []) as T[]));
  }
  return results;
}

/**
 * fetchPromotionStripePurchases
 *
 * A Stripe purchase belongs to this promotion if EITHER:
 *   stripe_purchases.promotion_id === promotionId
 * OR (because real purchase-webhook rows can land with promotion_id NULL):
 *   stripe_purchases.redirect_link_id → redirect_links.id → redirect_links.promotion_id === promotionId
 *
 * Postgres/PostgREST `.eq('promotion_id', promotionId)` never matches a NULL
 * promotion_id row, so a plain single query silently drops the second case.
 * We run two queries — one by promotion_id, one by redirect_link_id against
 * the promotion's own redirect_links (already resolved by the caller) — and
 * merge by purchase id. This does not touch revenue classification; it only
 * changes which rows reach buildStripeFromPurchases() in
 * promotionAnalyticsEngine.ts.
 */
async function fetchPromotionStripePurchases(
  promotionId: string,
  promotionRedirectLinkIds: string[],
  startIso: string,
  endIso: string,
): Promise<PromotionStripePurchaseRow[]> {
  const byPromotionId = supabase
    .from('stripe_purchases')
    .select(STRIPE_PURCHASES_COLUMNS)
    .eq('promotion_id', promotionId)
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  const distinctLinkIds = Array.from(new Set(promotionRedirectLinkIds.filter(Boolean)));
  const byRedirectLinkQueries = chunk(distinctLinkIds, IN_CHUNK_SIZE).map(batch =>
    supabase
      .from('stripe_purchases')
      .select(STRIPE_PURCHASES_COLUMNS)
      .in('redirect_link_id', batch)
      .gte('created_at', startIso)
      .lte('created_at', endIso),
  );

  const results = await Promise.all([byPromotionId, ...byRedirectLinkQueries]);

  const merged = new Map<string, PromotionStripePurchaseRow>();
  for (const res of results) {
    if (res.error) {
      throw new Error(`Failed to fetch promotion stripe purchases: ${res.error.message}`);
    }
    for (const row of (res.data ?? []) as PromotionStripePurchaseRow[]) {
      merged.set(row.id, row);
    }
  }
  return Array.from(merged.values());
}

/**
 * getPromotionAnalytics
 *
 * Fetches everything computePromotionAnalytics() needs for one promotion
 * and returns the computed result. Every conversion counted here has
 * promotion_id = promotionId; journey evidence around those conversions is
 * session-scoped, per the rule above.
 */
export async function getPromotionAnalytics(
  params: GetPromotionAnalyticsParams,
): Promise<PromotionAnalyticsResult> {
  const { promotionId, dateRange, customRange, activeSource, includeEV = true } = params;
  const { start, end } = getDateBounds(dateRange, customRange);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // ── 1. Promotion-scoped core data (the conversion itself must come from
  // here) ─────────────────────────────────────────────────────────────────
  // redirect_links is fetched first (not date-bounded — reference/
  // classification data, not time-series events) because the Stripe
  // purchase fetch below needs this promotion's redirect_link ids to catch
  // purchase rows whose own promotion_id is NULL (see
  // fetchPromotionStripePurchases doc comment).
  const [eventsRes, pixelRes, redirectLinksRes] = await Promise.all([
    supabase
      .from('events')
      .select(EVENTS_COLUMNS)
      .eq('promotion_id', promotionId)
      .gte('created_at', startIso)
      .lte('created_at', endIso),
    supabase
      .from('pixel_purchases')
      .select(PIXEL_PURCHASES_COLUMNS)
      .eq('promotion_id', promotionId)
      .gte('created_at', startIso)
      .lte('created_at', endIso),
    supabase.from('redirect_links').select(REDIRECT_LINKS_COLUMNS).eq('promotion_id', promotionId),
  ]);

  if (eventsRes.error) throw new Error(`Failed to fetch promotion events: ${eventsRes.error.message}`);
  if (pixelRes.error) throw new Error(`Failed to fetch promotion pixel purchases: ${pixelRes.error.message}`);
  if (redirectLinksRes.error) throw new Error(`Failed to fetch promotion redirect links: ${redirectLinksRes.error.message}`);

  const events = (eventsRes.data ?? []) as PromotionEventRow[];
  const pixelPurchases = (pixelRes.data ?? []) as PromotionPixelPurchaseRow[];
  const redirectLinks = (redirectLinksRes.data ?? []) as PromotionRedirectLinkRow[];

  // Stripe purchases: promotion_id = promotionId OR resolvable via this
  // promotion's own redirect_links (id column, fetched above).
  const stripePurchases = await fetchPromotionStripePurchases(
    promotionId,
    redirectLinks.map(r => r.id),
    startIso,
    endIso,
  );

  // ── 2. Journey context — session-scoped, NOT promotion-filtered ─────────
  // Only pull session_ids from the conversion source(s) actually in play
  // for this activeSource, mirroring the engine's own source isolation.
  const conversionSessionIds: string[] = [
    ...(activeSource !== 'pixel' ? stripePurchases.map(p => p.session_id).filter((s): s is string => !!s) : []),
    ...(activeSource !== 'stripe' ? pixelPurchases.map(p => p.session_id).filter((s): s is string => !!s) : []),
  ];

  const journeyEvents = await fetchByIn<PromotionEventRow>(
    'events',
    EVENTS_COLUMNS,
    'session_id',
    conversionSessionIds,
  );

  const journeyRedirectLinkIds = journeyEvents
    .map(e => e.redirect_link_id)
    .filter((id): id is string => !!id);

  const journeyRedirectLinks = await fetchByIn<PromotionRedirectLinkRow>(
    'redirect_links',
    REDIRECT_LINKS_COLUMNS,
    'id',
    journeyRedirectLinkIds,
  );

  // ── 3. campaign_element_assets — resolve display names / element types
  // for every asset touched anywhere above (promotion-scoped or journey
  // context), keyed by asset_id (campaign_id disambiguation happens engine
  // + journeyAnalyticsEngine-side via the composite key already on each row).
  const assetIds = [
    ...events.map(e => e.asset_id),
    ...redirectLinks.map(r => r.asset_id),
    ...journeyEvents.map(e => e.asset_id),
    ...journeyRedirectLinks.map(r => r.asset_id),
  ].filter((id): id is string => !!id);

  const campaignElementAssets = await fetchByIn<CampaignElementAssetRow>(
    'campaign_element_assets',
    CAMPAIGN_ELEMENT_ASSETS_COLUMNS,
    'asset_id',
    assetIds,
  );

  const journeyContext: PromotionJourneyContext = {
    events: journeyEvents,
    redirectLinks: journeyRedirectLinks,
    campaignElementAssets,
  };

  const input: PromotionAnalyticsEngineInput = {
    promotionId,
    dateRange,
    customRange: customRange ?? null,
    activeSource,
    includeEV,
    events,
    stripePurchases,
    pixelPurchases,
    redirectLinks,
    campaignElementAssets,
    journeyContext,
  };

  return computePromotionAnalytics(input);
}
