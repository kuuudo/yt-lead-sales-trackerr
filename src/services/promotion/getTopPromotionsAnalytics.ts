/**
 * src/services/promotion/getTopPromotionsAnalytics.ts
 *
 * Batch/ranking layer for the Marketplace "Top Promotions" card.
 *
 * getPromotionAnalytics.ts is one-promotion-in, one-result-out. This file
 * does NOT call it in a loop (that would be N+1 — one round trip per
 * promotion). Instead it:
 *
 *   1. Fetches this organization's promotions ONCE.
 *   2. Fetches assignment_assets, redirect_links, events, stripe_purchases
 *      and pixel_purchases ONCE EACH, batched with `.in(...)` across every
 *      promotion in the org (not per-promotion), using the exact same
 *      asset-pool resolution path documented in getPromotionAnalytics.ts:
 *
 *        promotion → assignment_id → assignment_assets → asset pool
 *          → redirect_links (asset_id IN pool, org-bounded)
 *            → token[]    → stripe_purchases.redirect_link_token
 *            → video_id[] → events.video_id → session_id[]
 *                              → pixel_purchases.session_id
 *                              → stripe_purchases.session_id (checkout bridge)
 *
 *   3. Slices those already-in-memory arrays per promotion (no additional
 *      queries) and calls computePromotionAnalytics() from
 *      promotionAnalyticsEngine.ts once per promotion — so every number a
 *      promotion gets here is produced by the exact same attribution logic
 *      (clicks, sessions bridging, revenue_type classification, Stripe
 *      checkout-link bridge, defensive scopeToPromotion re-narrowing) that
 *      Individual Promotion Analytics uses. Nothing about revenue/click/
 *      conversion attribution is reimplemented in this file.
 *
 * journeyContext is intentionally omitted per promotion (computeJourneyInsights
 * short-circuits to an empty result when it's undefined) — Top Promotions
 * doesn't render journeys, so there's no reason to pay for
 * buildPurchaseJourney() across every conversion for every promotion in the
 * org.
 *
 * campaignElementAssets is passed as [] per promotion for the same reason:
 * Top Promotions never reads topAssets, so there's no reason to fetch/pass
 * display-name resolution data.
 *
 * "sessions" (distinct session_ids touching this promotion) isn't part of
 * PromotionAnalyticsResult's public kpis, so it's derived locally with the
 * same tiny, non-revenue video/session scoping rule scopeToPromotion() uses
 * internally (redirect_links kept if promotion_id matches or is NULL, then
 * events narrowed to those redirect_links' video_ids). This does not touch
 * revenue/conversion logic in any way.
 *
 * ORG ISOLATION: the only query that can return cross-org rows is the
 * initial `promotions` fetch, and it is filtered by
 * `.eq('organization_id', organizationId)`. Every downstream table is
 * reached only through that org's promotions → assignments → assets, and
 * redirect_links are additionally filtered to `organization_id ===
 * organizationId` exactly as getPromotionAnalytics.ts does. No new
 * organization-resolution mechanism is introduced.
 *
 * TITLE / MARKETER NOTE: `promotions` itself has no title column (see
 * getPromotionAnalytics.ts's PROMOTIONS_COLUMNS). Marketplace.tsx already
 * displays promotion titles as `p.assignment?.title ?? p.campaign?.campaign_name
 * ?? 'Promotion'` (see Marketplace.tsx), so `assignments.title` and
 * `campaigns.campaign_name` are resolved here the same way, batched by id.
 * If your `assignments`/`campaigns` tables use different column names than
 * assumed here, adjust ASSIGNMENTS_COLUMNS / CAMPAIGNS_COLUMNS below — this
 * is the one place in this file inferred from UI usage rather than from a
 * schema file you gave me directly. `marketer` has no evidence anywhere in
 * the supplied files, so it is always returned as `null` rather than
 * guessed, per your instructions.
 */

import { supabase } from '../../lib/supabase';
import { getDateBounds, type DateRange, type CustomDateRange } from '../../lib/analyticsEngine';
import {
  computePromotionAnalytics,
  type PromotionAnalyticsEngineInput,
  type PromotionEventRow,
  type PromotionRedirectLinkRow,
  type PromotionStripePurchaseRow,
  type PromotionPixelPurchaseRow,
} from '../../lib/promotionAnalyticsEngine';

// ── Public API expected by TopPromotions.tsx ───────────────────────────────

export type TopPromotionsMetric = 'revenue' | 'clicks' | 'sessions' | 'conversions' | 'rpc';

/** Same preset vocabulary as the existing analytics date-range picker. */
export type TopPromotionsPreset = DateRange;

export interface TopPromotionRow {
  promotionId: string;
  title: string;
  marketer: string | null;
  clicks: number;
  sessions: number;
  conversions: number;
  revenue: number;
  rpc: number;
}

export interface GetTopPromotionsAnalyticsParams {
  organizationId: string;
  preset: TopPromotionsPreset;
  customRange?: CustomDateRange | null;
}

// ── Column sets (mirrors getPromotionAnalytics.ts exactly where shared) ────

const PROMOTIONS_COLUMNS = 'id, assignment_id, organization_id, campaign_id';
const ASSIGNMENT_ASSETS_COLUMNS = 'assignment_id, asset_id';
const REDIRECT_LINKS_COLUMNS =
  'id, token, video_id, campaign_id, link_type, destination_url, organization_id, promotion_id, asset_id, tracking_hostname';
const EVENTS_COLUMNS =
  'id, session_id, video_id, campaign_id, event_type, created_at, organization_id, promotion_id, asset_id, redirect_link_id, tracking_hostname, link_type';
const STRIPE_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id';
const PIXEL_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, event_type, organization_id';

// Inferred from Marketplace.tsx's display fallback — see file header note.
const ASSIGNMENTS_COLUMNS = 'id, title';
const CAMPAIGNS_COLUMNS = 'id, campaign_name';

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
    if (error) throw new Error(`Failed to fetch ${table} by ${column}: ${error.message}`);
    results.push(...((data ?? []) as T[]));
  }
  return results;
}

/**
 * getTopPromotionsAnalytics
 *
 * One batched round of queries for the whole organization, then one
 * in-memory computePromotionAnalytics() call per promotion. No query is
 * issued per-promotion.
 */
export async function getTopPromotionsAnalytics(
  params: GetTopPromotionsAnalyticsParams,
): Promise<TopPromotionRow[]> {
  const { organizationId, preset, customRange = null } = params;
  if (!organizationId) return [];

  const { start, end } = getDateBounds(preset, customRange);

  // ── 1. Promotions for this org, once. Org isolation starts here. ────────
  const { data: promotionRows, error: promotionsError } = await supabase
    .from('promotions')
    .select(PROMOTIONS_COLUMNS)
    .eq('organization_id', organizationId);

  if (promotionsError) {
    throw new Error(`Failed to fetch promotions: ${promotionsError.message}`);
  }

  type PromotionRow = { id: string; assignment_id: string | null; organization_id: string | null; campaign_id: string | null };
  const promotions = ((promotionRows ?? []) as PromotionRow[]).filter(
    p => !!p.assignment_id && p.organization_id === organizationId,
  );
  if (promotions.length === 0) return [];

  const assignmentIds = promotions.map(p => p.assignment_id!).filter(Boolean);
  const campaignIds = promotions.map(p => p.campaign_id).filter((id): id is string => !!id);

  // ── 2. Titles — batched, best-effort (see file header note). ────────────
  const [assignmentRows, campaignRows] = await Promise.all([
    fetchByIn<{ id: string; title: string | null }>(
      'assignments',
      ASSIGNMENTS_COLUMNS,
      'id',
      assignmentIds,
    ).catch(() => []),
    fetchByIn<{ id: string; campaign_name: string | null }>(
      'campaigns',
      CAMPAIGNS_COLUMNS,
      'id',
      campaignIds,
    ).catch(() => []),
  ]);
  const titleByAssignmentId = new Map(assignmentRows.map(a => [a.id, a.title]));
  const nameByCampaignId = new Map(campaignRows.map(c => [c.id, c.campaign_name]));

  // ── 3. assignment_assets → asset pool per promotion, batched once. ──────
  const assignmentAssetsRows = await fetchByIn<{ assignment_id: string; asset_id: string | null }>(
    'assignment_assets',
    ASSIGNMENT_ASSETS_COLUMNS,
    'assignment_id',
    assignmentIds,
  );
  const assetIdsByAssignmentId = new Map<string, string[]>();
  for (const row of assignmentAssetsRows) {
    if (!row.asset_id) continue;
    const list = assetIdsByAssignmentId.get(row.assignment_id) ?? [];
    list.push(row.asset_id);
    assetIdsByAssignmentId.set(row.assignment_id, list);
  }
  const allAssetIds = assignmentAssetsRows.map(r => r.asset_id).filter((id): id is string => !!id);

  // ── 4. redirect_links for the whole org's asset pool, batched once. ─────
  const allRedirectLinks = (
    await fetchByIn<PromotionRedirectLinkRow>('redirect_links', REDIRECT_LINKS_COLUMNS, 'asset_id', allAssetIds)
  ).filter(r => r.organization_id === organizationId);
  const redirectLinksByAssetId = new Map<string, PromotionRedirectLinkRow[]>();
  for (const link of allRedirectLinks) {
    if (!link.asset_id) continue;
    const list = redirectLinksByAssetId.get(link.asset_id) ?? [];
    list.push(link);
    redirectLinksByAssetId.set(link.asset_id, list);
  }

  const allTokens = allRedirectLinks.map(r => r.token).filter((t): t is string => !!t);
  const allVideoIds = allRedirectLinks.map(r => r.video_id).filter((id): id is string => !!id);

  // ── 5. events by video_id pool, date-bounded, batched once. ─────────────
  const allEvents = (
    await fetchByIn<PromotionEventRow>('events', EVENTS_COLUMNS, 'video_id', allVideoIds)
  ).filter(e => {
    const t = new Date(e.created_at);
    return t >= start && t <= end;
  });
  const eventsByVideoId = new Map<string, PromotionEventRow[]>();
  for (const e of allEvents) {
    if (!e.video_id) continue;
    const list = eventsByVideoId.get(e.video_id) ?? [];
    list.push(e);
    eventsByVideoId.set(e.video_id, list);
  }

  const allSessionIds = allEvents.map(e => e.session_id).filter((s): s is string => !!s);

  const inDateWindow = <T extends { created_at: string }>(rows: T[]): T[] =>
    rows.filter(p => {
      const t = new Date(p.created_at);
      return t >= start && t <= end;
    });

  // ── 6. stripe/pixel purchases, batched once (token match + session bridge,
  // same union-not-replacement rule as getPromotionAnalytics.ts). ─────────
  const [stripeByToken, stripeBySession, allPixelPurchases] = await Promise.all([
    fetchByIn<PromotionStripePurchaseRow>(
      'stripe_purchases',
      STRIPE_PURCHASES_COLUMNS,
      'redirect_link_token',
      allTokens,
    ).then(inDateWindow),
    fetchByIn<PromotionStripePurchaseRow>(
      'stripe_purchases',
      STRIPE_PURCHASES_COLUMNS,
      'session_id',
      allSessionIds,
    ).then(inDateWindow),
    fetchByIn<PromotionPixelPurchaseRow>(
      'pixel_purchases',
      PIXEL_PURCHASES_COLUMNS,
      'session_id',
      allSessionIds,
    ).then(inDateWindow),
  ]);
  const allStripePurchases = Array.from(
    new Map([...stripeByToken, ...stripeBySession].map(p => [p.id, p])).values(),
  );

  const stripeByTokenMap = new Map<string, PromotionStripePurchaseRow[]>();
  const stripeBySessionMap = new Map<string, PromotionStripePurchaseRow[]>();
  for (const p of allStripePurchases) {
    if (p.redirect_link_token) {
      const l = stripeByTokenMap.get(p.redirect_link_token) ?? [];
      l.push(p);
      stripeByTokenMap.set(p.redirect_link_token, l);
    }
    if (p.session_id) {
      const l = stripeBySessionMap.get(p.session_id) ?? [];
      l.push(p);
      stripeBySessionMap.set(p.session_id, l);
    }
  }
  const pixelBySessionMap = new Map<string, PromotionPixelPurchaseRow[]>();
  for (const p of allPixelPurchases) {
    if (!p.session_id) continue;
    const l = pixelBySessionMap.get(p.session_id) ?? [];
    l.push(p);
    pixelBySessionMap.set(p.session_id, l);
  }

  // ── 7. Slice in-memory per promotion and reuse the real engine. No
  // queries happen below this line. ────────────────────────────────────────
  const rows: TopPromotionRow[] = [];

  for (const promotion of promotions) {
    const assetIds = assetIdsByAssignmentId.get(promotion.assignment_id!) ?? [];
    const redirectLinks = assetIds.flatMap(id => redirectLinksByAssetId.get(id) ?? []);

    const tokens = redirectLinks.map(r => r.token).filter((t): t is string => !!t);
    const videoIds = redirectLinks.map(r => r.video_id).filter((id): id is string => !!id);
    const events = videoIds.flatMap(id => eventsByVideoId.get(id) ?? []);
    const sessionIds = events.map(e => e.session_id).filter((s): s is string => !!s);

    const stripePurchases = Array.from(
      new Map(
        [
          ...tokens.flatMap(t => stripeByTokenMap.get(t) ?? []),
          ...sessionIds.flatMap(s => stripeBySessionMap.get(s) ?? []),
        ].map(p => [p.id, p]),
      ).values(),
    );
    const pixelPurchases = Array.from(
      new Map(sessionIds.flatMap(s => pixelBySessionMap.get(s) ?? []).map(p => [p.id, p])).values(),
    );

    const input: PromotionAnalyticsEngineInput = {
      promotionId: promotion.id,
      dateRange: preset,
      customRange,
      activeSource: 'total',
      includeEV: true,
      events,
      stripePurchases,
      pixelPurchases,
      redirectLinks,
      campaignElementAssets: [], // Top Promotions never reads topAssets
      journeyContext: undefined, // Top Promotions never reads journeyInsights
    };

    const result = computePromotionAnalytics(input);

    // "sessions" isn't in PromotionKPIs — derive it with the same (non-
    // revenue) video/session scoping rule scopeToPromotion() uses, so it
    // lines up with the events the engine actually counted.
    const scopedRedirectLinks = redirectLinks.filter(
      r => r.promotion_id === promotion.id || r.promotion_id == null,
    );
    const scopedVideoIds = new Set(scopedRedirectLinks.map(r => r.video_id).filter((id): id is string => !!id));
    const scopedSessions = new Set(
      events.filter(e => e.video_id != null && scopedVideoIds.has(e.video_id)).map(e => e.session_id),
    );

    const title =
      titleByAssignmentId.get(promotion.assignment_id!) ??
      (promotion.campaign_id ? nameByCampaignId.get(promotion.campaign_id) : null) ??
      'Promotion';

    rows.push({
      promotionId: promotion.id,
      title,
      marketer: null, // no evidence of a marketer field anywhere in the supplied schema
      clicks: result.kpis.clicks,
      sessions: scopedSessions.size,
      conversions: result.kpis.conversions,
      revenue: result.kpis.revenue,
      rpc: result.kpis.epc, // same revenue/clicks formula the engine calls "epc"
    });
  }

  return rows;
}

/**
 * rankTopPromotions — pure, non-mutating descending sort by metric.
 * Ties break by revenue, then promotionId, for a stable/deterministic order.
 */
export function rankTopPromotions(
  rows: TopPromotionRow[],
  metric: TopPromotionsMetric,
): TopPromotionRow[] {
  return [...rows].sort((a, b) => {
    const diff = b[metric] - a[metric];
    if (diff !== 0) return diff;
    if (metric !== 'revenue') {
      const revDiff = b.revenue - a.revenue;
      if (revDiff !== 0) return revDiff;
    }
    return a.promotionId.localeCompare(b.promotionId);
  });
}
