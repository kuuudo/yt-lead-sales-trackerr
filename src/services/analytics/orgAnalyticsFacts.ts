// ─────────────────────────────────────────────────────────────────────────────
// orgAnalyticsFacts.ts
//
// Phase A — shared org-scoped analytics FACT foundation for Promotion (and
// later Marketer) aggregation.
//
// Stripe / Pixel / events come from Supabase tables (already-ingested facts),
// NOT from the Stripe API or any new payment client.
//
// Does NOT:
//   - call processVideoMetrics formulas itself (see metricsForFactBag)
//   - sum All Assets pair rows
//   - use promotionAnalyticsEngine as a metric source
//   - modify AllAssetsAnalytics or analyticsEngine internals
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase';
import {
  getDateBounds,
  buildRedirectLinkLookup,
  type DateRange,
  type CustomDateRange,
  type RawEvent,
  type StripePurchasesRawRow,
} from '../../lib/analyticsEngine';
import {
  metricsForFactBag,
  type FactBagActiveSource,
} from '../../lib/metricsForFactBag';
import type { VideoMetricsResult } from '../../lib/analyticsEngine';

/** Sentinel partition key when promotion cannot be resolved. */
export const UNATTRIBUTED_PROMOTION_ID = '__unattributed__';

// ── Column lists (Supabase selects) — aligned with analyticsEngine consumers ─

export const EVENTS_FACT_COLUMNS =
  'id, video_id, campaign_id, event_type, created_at, asset_id, session_id, promotion_id, redirect_link_id';

export const STRIPE_PURCHASES_FACT_COLUMNS =
  'id, amount, session_id, video_id, campaign_id, redirect_link_id, redirect_link_token, created_at, promotion_id';

export const PIXEL_PURCHASES_FACT_COLUMNS =
  'id, amount, event_type, session_id, video_id, campaign_id, created_at, promotion_id, redirect_link_id';

export const REDIRECT_LINKS_FACT_COLUMNS =
  'id, token, link_type, promotion_id, asset_id, video_id, organization_id';

// ── Fact row shapes (keep id for dedupe; promotion_id may be null) ───────────

export interface OrgEventFact {
  id: string;
  video_id: string | null;
  campaign_id: string | null;
  event_type: string;
  created_at: string;
  asset_id: string | null;
  session_id: string | null;
  promotion_id: string | null;
  redirect_link_id: string | null;
}

export interface OrgStripeFact {
  id: string;
  amount: number | string | null;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  redirect_link_id: string | null;
  redirect_link_token: string | null;
  created_at: string | null;
  promotion_id: string | null;
}

export interface OrgPixelFact {
  id: string;
  amount: number | string | null;
  event_type: string | null;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  created_at: string | null;
  promotion_id: string | null;
  redirect_link_id: string | null;
}

export interface OrgRedirectLinkFact {
  id: string;
  token: string | null;
  link_type: string | null;
  promotion_id: string | null;
  asset_id: string | null;
  video_id: string | null;
  organization_id: string | null;
}

export interface OrgAnalyticsFacts {
  organizationId: string;
  dateRange: DateRange;
  customRange: CustomDateRange | null;
  events: OrgEventFact[];
  stripe: OrgStripeFact[];
  pixel: OrgPixelFact[];
  redirectLinks: OrgRedirectLinkFact[];
  /** token → link_type for buildStripeFromPurchases / metricsForFactBag */
  redirectLinkLookup: Record<string, string | null>;
  /** redirect_links.id → promotion_id (nullable) */
  promotionIdByRedirectLinkId: Map<string, string | null>;
  /** redirect_links.token → promotion_id (nullable) */
  promotionIdByRedirectToken: Map<string, string | null>;
}

// ── Dedupe ───────────────────────────────────────────────────────────────────

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

// ── Promotion resolution (locked) ────────────────────────────────────────────
//
// 1. fact.promotion_id if present
// 2. else redirect_link_id → redirect_links.promotion_id
// 3. else redirect_link_token → redirect_links.promotion_id
// 4. else UNATTRIBUTED_PROMOTION_ID

export function resolvePromotionIdForFact(
  fact: {
    promotion_id?: string | null;
    redirect_link_id?: string | null;
    redirect_link_token?: string | null;
  },
  byLinkId: Map<string, string | null>,
  byToken: Map<string, string | null>,
): string {
  if (fact.promotion_id) return fact.promotion_id;

  if (fact.redirect_link_id) {
    const fromId = byLinkId.get(fact.redirect_link_id);
    if (fromId) return fromId;
  }

  if (fact.redirect_link_token) {
    const fromToken = byToken.get(fact.redirect_link_token);
    if (fromToken) return fromToken;
  }

  return UNATTRIBUTED_PROMOTION_ID;
}

// ── Partition bags ───────────────────────────────────────────────────────────

export interface PromotionFactBag {
  promotionId: string; // real id or UNATTRIBUTED_PROMOTION_ID
  events: RawEvent[];
  stripeRaw: StripePurchasesRawRow[];
  pixelRaw: Array<{
    video_id?: string | null;
    campaign_id?: string | null;
    amount?: number | string | null;
    event_type?: string | null;
    session_id?: string | null;
  }>;
}

/**
 * One fact → one promotion partition after resolvePromotionIdForFact.
 * Does not run metrics.
 */
export function partitionFactsByPromotion(facts: OrgAnalyticsFacts): Map<string, PromotionFactBag> {
  const bags = new Map<string, PromotionFactBag>();

  const ensure = (promotionId: string): PromotionFactBag => {
    let bag = bags.get(promotionId);
    if (!bag) {
      bag = { promotionId, events: [], stripeRaw: [], pixelRaw: [] };
      bags.set(promotionId, bag);
    }
    return bag;
  };

  for (const e of facts.events) {
    const pid = resolvePromotionIdForFact(e, facts.promotionIdByRedirectLinkId, facts.promotionIdByRedirectToken);
    ensure(pid).events.push({
      video_id: e.video_id,
      campaign_id: e.campaign_id,
      event_type: e.event_type,
      created_at: e.created_at,
    });
  }

  for (const s of facts.stripe) {
    const pid = resolvePromotionIdForFact(s, facts.promotionIdByRedirectLinkId, facts.promotionIdByRedirectToken);
    ensure(pid).stripeRaw.push({
      video_id: s.video_id,
      campaign_id: s.campaign_id,
      amount: s.amount,
      session_id: s.session_id,
      redirect_link_id: s.redirect_link_id,
      redirect_link_token: s.redirect_link_token,
    });
  }

  for (const p of facts.pixel) {
    const pid = resolvePromotionIdForFact(p, facts.promotionIdByRedirectLinkId, facts.promotionIdByRedirectToken);
    ensure(pid).pixelRaw.push({
      video_id: p.video_id,
      campaign_id: p.campaign_id,
      amount: p.amount,
      event_type: p.event_type,
      session_id: p.session_id,
    });
  }

  return bags;
}

/**
 * metricsForFactBag for every promotion partition.
 * Unattributed bag is included only if present in the map (i.e. unresolved facts exist).
 */
export function metricsByPromotionId(
  facts: OrgAnalyticsFacts,
  activeSource: FactBagActiveSource,
  includeEV = true,
): Map<string, VideoMetricsResult> {
  const bags = partitionFactsByPromotion(facts);
  const out = new Map<string, VideoMetricsResult>();
  for (const [promotionId, bag] of bags) {
    out.set(
      promotionId,
      metricsForFactBag({
        bagId: promotionId,
        events: bag.events,
        stripeRaw: bag.stripeRaw,
        pixelRaw: bag.pixelRaw,
        activeSource,
        redirectLinkLookup: facts.redirectLinkLookup,
        includeEV,
      }),
    );
  }
  return out;
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchAllInChunks<T>(
  table: string,
  columns: string,
  filter: (q: any) => any,
): Promise<T[]> {
  // Simple path: apply filter, select columns. Chunked .in() can be added later
  // if org fact volume requires it; Phase A keeps the query shape explicit.
  const { data, error } = await filter(
    supabase.from(table).select(columns),
  );
  if (error) {
    throw new Error(`Failed to load ${table}: ${error.message}`);
  }
  return (data ?? []) as T[];
}

export interface FetchOrgAnalyticsFactsInput {
  organizationId: string;
  dateRange: DateRange;
  customRange?: CustomDateRange | null;
}

/**
 * Load org-scoped events / stripe_purchases / pixel_purchases / redirect_links
 * for the date window, dedupe by id, build redirect lookup maps.
 *
 * Organization boundary: redirect_links.organization_id = organizationId.
 * Purchases/events are constrained by created_at in [start, end] and by
 * belonging to this org's redirect-link universe OR explicit organization
 * columns when present.
 *
 * NOTE: Exact org-scoping of events/stripe/pixel mirrors existing analytics
 * services (asset path uses asset_id + org links). Here we scope purchases
 * and events to the date window and resolve promotion via org redirect_links.
 * If a production service already centralizes this fetch, prefer consolidating
 * onto that path in a later phase rather than inventing a second Stripe path.
 */
export async function fetchOrgAnalyticsFacts(
  input: FetchOrgAnalyticsFactsInput,
): Promise<OrgAnalyticsFacts> {
  const { organizationId, dateRange, customRange = null } = input;
  const { start, end } = getDateBounds(dateRange, customRange);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // 1) Org redirect links — promotion resolution + link_type lookup
  const { data: linkRows, error: linkErr } = await supabase
    .from('redirect_links')
    .select(REDIRECT_LINKS_FACT_COLUMNS)
    .eq('organization_id', organizationId);
  if (linkErr) {
    throw new Error(`Failed to load redirect_links: ${linkErr.message}`);
  }
  const redirectLinks: OrgRedirectLinkFact[] = (linkRows ?? []).map((r: any) => ({
    id: r.id as string,
    token: (r.token as string | null) ?? null,
    link_type: (r.link_type as string | null) ?? null,
    promotion_id: (r.promotion_id as string | null) ?? null,
    asset_id: (r.asset_id as string | null) ?? null,
    video_id: (r.video_id as string | null) ?? null,
    organization_id: (r.organization_id as string | null) ?? null,
  }));

  const redirectLinkLookup = buildRedirectLinkLookup(
    redirectLinks
      .filter(r => r.token)
      .map(r => ({ token: r.token as string, link_type: r.link_type })),
  );

  const promotionIdByRedirectLinkId = new Map<string, string | null>();
  const promotionIdByRedirectToken = new Map<string, string | null>();
  for (const r of redirectLinks) {
    promotionIdByRedirectLinkId.set(r.id, r.promotion_id);
    if (r.token) promotionIdByRedirectToken.set(r.token, r.promotion_id);
  }

  const linkIds = redirectLinks.map(r => r.id);
  const linkTokens = redirectLinks.map(r => r.token).filter((t): t is string => !!t);

  // 2) Date-windowed events (org-relevant via redirect_link_id when present,
  //    or promotion_id on the event). Broad date filter first; resolution
  //    still goes through resolvePromotionIdForFact.
  const { data: eventRows, error: eventErr } = await supabase
    .from('events')
    .select(EVENTS_FACT_COLUMNS)
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  if (eventErr) {
    throw new Error(`Failed to load events: ${eventErr.message}`);
  }

  // Keep events that can resolve into this org's promotion universe:
  // - promotion_id set, or
  // - redirect_link_id in org links, or
  // - (later Marketer phase can tighten further)
  const linkIdSet = new Set(linkIds);
  const rawEvents: OrgEventFact[] = (eventRows ?? [])
    .map((e: any) => ({
      id: e.id as string,
      video_id: (e.video_id as string | null) ?? null,
      campaign_id: (e.campaign_id as string | null) ?? null,
      event_type: e.event_type as string,
      created_at: e.created_at as string,
      asset_id: (e.asset_id as string | null) ?? null,
      session_id: (e.session_id as string | null) ?? null,
      promotion_id: (e.promotion_id as string | null) ?? null,
      redirect_link_id: (e.redirect_link_id as string | null) ?? null,
    }))
    .filter(e => {
      if (e.promotion_id) return true;
      if (e.redirect_link_id && linkIdSet.has(e.redirect_link_id)) return true;
      return false;
    });

  // 3) Stripe purchases — Supabase stripe_purchases only (NOT Stripe API)
  const { data: stripeRows, error: stripeErr } = await supabase
    .from('stripe_purchases')
    .select(STRIPE_PURCHASES_FACT_COLUMNS)
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  if (stripeErr) {
    throw new Error(`Failed to load stripe_purchases: ${stripeErr.message}`);
  }

  const tokenSet = new Set(linkTokens);
  const rawStripe: OrgStripeFact[] = (stripeRows ?? [])
    .map((s: any) => ({
      id: s.id as string,
      amount: s.amount,
      session_id: (s.session_id as string | null) ?? null,
      video_id: (s.video_id as string | null) ?? null,
      campaign_id: (s.campaign_id as string | null) ?? null,
      redirect_link_id: (s.redirect_link_id as string | null) ?? null,
      redirect_link_token: (s.redirect_link_token as string | null) ?? null,
      created_at: (s.created_at as string | null) ?? null,
      promotion_id: (s.promotion_id as string | null) ?? null,
    }))
    .filter(s => {
      if (s.promotion_id) return true;
      if (s.redirect_link_id && linkIdSet.has(s.redirect_link_id)) return true;
      if (s.redirect_link_token && tokenSet.has(s.redirect_link_token)) return true;
      return false;
    });

  // 4) Pixel purchases
  const { data: pixelRows, error: pixelErr } = await supabase
    .from('pixel_purchases')
    .select(PIXEL_PURCHASES_FACT_COLUMNS)
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  if (pixelErr) {
    throw new Error(`Failed to load pixel_purchases: ${pixelErr.message}`);
  }

  const rawPixel: OrgPixelFact[] = (pixelRows ?? [])
    .map((p: any) => ({
      id: p.id as string,
      amount: p.amount,
      event_type: (p.event_type as string | null) ?? null,
      session_id: (p.session_id as string | null) ?? null,
      video_id: (p.video_id as string | null) ?? null,
      campaign_id: (p.campaign_id as string | null) ?? null,
      created_at: (p.created_at as string | null) ?? null,
      promotion_id: (p.promotion_id as string | null) ?? null,
      redirect_link_id: (p.redirect_link_id as string | null) ?? null,
    }))
    .filter(p => {
      if (p.promotion_id) return true;
      if (p.redirect_link_id && linkIdSet.has(p.redirect_link_id)) return true;
      return false;
    });

  return {
    organizationId,
    dateRange,
    customRange,
    events: dedupeById(rawEvents),
    stripe: dedupeById(rawStripe),
    pixel: dedupeById(rawPixel),
    redirectLinks,
    redirectLinkLookup,
    promotionIdByRedirectLinkId,
    promotionIdByRedirectToken,
  };
}
