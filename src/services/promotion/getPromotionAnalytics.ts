/**
 * src/services/promotion/getPromotionAnalytics.ts
 *
 * Fetch layer for Individual Promotion Analytics. The scope is resolved
 * OUTWARD from the known promotionId, never by filtering rows on their own
 * promotion_id column:
 *
 *   Promotion → promotions.assignment_id → assignment_assets → asset pool
 *     → redirect_links (asset_id IN pool, organization_id = Promotion's org)
 *       → token[]      → stripe_purchases.redirect_link_token
 *       → video_id[]   → events.video_id → session_id[]
 *                           → pixel_purchases.session_id
 *                           → stripe_purchases.session_id (see §3 below)
 *
 * redirect_links.promotion_id is checked ONLY as secondary disambiguation,
 * downstream in promotionAnalyticsEngine.ts's scopeToPromotion() — include
 * if it matches this promotion or is NULL, exclude only if it's stamped for
 * a DIFFERENT promotion. No row anywhere in this file is fetched via
 * `.eq('promotion_id', promotionId)`, and a purchase's own promotion_id is
 * never treated as authoritative (see §3).
 *
 * JOURNEY CONTEXT RULE (locked): journey reconstruction is session-scoped
 * and deliberately NOT filtered by promotion_id — a session can touch other
 * promotions' redirect links / assets on its way to a conversion, and
 * journeyAnalyticsEngine.ts is meant to see all of that.
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
const PROMOTIONS_COLUMNS =
  'id, assignment_id, organization_id, campaign_id';

const ASSIGNMENT_ASSETS_COLUMNS =
  'asset_id';
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
  // ── 0. Resolve promotion → assignment → asset pool ───────────────────────
  const { data: promotionRow, error: promotionError } = await supabase
    .from('promotions')
    .select(PROMOTIONS_COLUMNS)
    .eq('id', promotionId)
    .single();

  if (promotionError || !promotionRow) {
    throw new Error(`Failed to fetch promotion: ${promotionError?.message ?? 'not found'}`);
  }

  const assignmentId = promotionRow.assignment_id as string | null;
  const organizationId = promotionRow.organization_id as string | null;

  if (!assignmentId) {
    throw new Error(`Promotion ${promotionId} has no assignment_id`);
  }
  if (!organizationId) {
    throw new Error(`Promotion ${promotionId} has no organization_id`);
  }

  const { data: assignmentAssetsRows, error: assignmentAssetsError } = await supabase
    .from('assignment_assets')
    .select(ASSIGNMENT_ASSETS_COLUMNS)
    .eq('assignment_id', assignmentId);

  if (assignmentAssetsError) {
    throw new Error(`Failed to fetch assignment_assets: ${assignmentAssetsError.message}`);
  }

  const assetIds = (assignmentAssetsRows ?? [])
    .map((r: { asset_id: string | null }) => r.asset_id)
    .filter((id): id is string => !!id);

  // ── 1. Candidate redirect_links for this promotion's asset pool ──────────
  // Secondary promotion_id match/exclude/null happens later in scopeToPromotion.
  const redirectLinks = assetIds.length === 0
    ? []
    : await fetchByIn<PromotionRedirectLinkRow>(
        'redirect_links',
        REDIRECT_LINKS_COLUMNS,
        'asset_id',
        assetIds,
      ).then(rows =>
        rows.filter(r => r.organization_id === organizationId),
      );

  const tokens = redirectLinks.map(r => r.token).filter((t): t is string => !!t);
  const videoIds = redirectLinks.map(r => r.video_id).filter((id): id is string => !!id);

  // ── 2. Events by video_id pool (date-bounded) ────────────────────────────
  const events = videoIds.length === 0
    ? []
    : await fetchByIn<PromotionEventRow>(
        'events',
        EVENTS_COLUMNS,
        'video_id',
        videoIds,
      ).then(rows =>
        rows.filter(e => {
          const t = new Date(e.created_at);
          return t >= start && t <= end;
        }),
      );

  // ── 3. Stripe by token AND by session bridge, Pixel by session bridge
  // (date-bounded) ───────────────────────────────────────────────────────
  //
  // Checkout-type redirect_links (link_type = 'checkout') commonly carry
  // asset_id = NULL and video_id = NULL on the DB row (verified against
  // production data — a checkout link is a generic per-campaign destination,
  // not tied to any one asset). That means a checkout link's token NEVER
  // appears in `tokens` above (which is derived purely from the asset-pool
  // redirect_links), so a stripe_purchases row whose redirect_link_token
  // points at a checkout link is invisible to the token-only fetch — this
  // was silently producing $0 Promotion Revenue for exactly the purchases
  // that matter. Pixel already avoids this by bridging through session_id;
  // Stripe purchases carry a session_id column too, so the same bridge is
  // applied here, additively (union, not replacement) with the token match.
  // The purchase row's own promotion_id is NOT used to scope this fetch —
  // per the locked architecture, it is secondary evidence only, checked (if
  // at all) downstream in scopeToPromotion(), never authoritative here.
  const sessionIdsFromEvents = events
    .map(e => e.session_id)
    .filter((s): s is string => !!s);

  const inDateWindow = <T extends { created_at: string }>(rows: T[]): T[] =>
    rows.filter(p => {
      const t = new Date(p.created_at);
      return t >= start && t <= end;
    });

  const [stripeByToken, stripeBySession, pixelPurchases] = await Promise.all([
    tokens.length === 0
      ? Promise.resolve([] as PromotionStripePurchaseRow[])
      : fetchByIn<PromotionStripePurchaseRow>(
          'stripe_purchases',
          STRIPE_PURCHASES_COLUMNS,
          'redirect_link_token',
          tokens,
        ).then(inDateWindow),
    sessionIdsFromEvents.length === 0
      ? Promise.resolve([] as PromotionStripePurchaseRow[])
      : fetchByIn<PromotionStripePurchaseRow>(
          'stripe_purchases',
          STRIPE_PURCHASES_COLUMNS,
          'session_id',
          sessionIdsFromEvents,
        ).then(inDateWindow),
    sessionIdsFromEvents.length === 0
      ? Promise.resolve([] as PromotionPixelPurchaseRow[])
      : fetchByIn<PromotionPixelPurchaseRow>(
          'pixel_purchases',
          PIXEL_PURCHASES_COLUMNS,
          'session_id',
          sessionIdsFromEvents,
        ).then(inDateWindow),
  ]);

  // Merge + dedupe by id — the same purchase can legitimately be returned by
  // both queries (token-matched AND session-matched at once).
  const stripePurchases = Array.from(
    new Map(
      [...stripeByToken, ...stripeBySession].map(p => [p.id, p]),
    ).values(),
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
    const allAssetIds = [
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
