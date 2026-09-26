// ─────────────────────────────────────────────────────────────────────────────
// buildPromotionMetricRows.ts
//
// Phase B — Promotion-level data model (no UI).
//
// FACTS (Phase A)
//   → partition by resolved promotion_id
//   → metricsForFactBag once per partition
//   → join org promotions identity (title / campaign)
//   → zero-activity promotions get empty-bag metrics
//   → Unattributed row only when unresolved facts exist
//
// Does NOT sum All Assets pair rows.
// Does NOT call promotionAnalyticsEngine / legacy promotion metrics.
// Does NOT invent revenue/click formulas (processVideoMetrics only).
// Stripe facts remain Supabase stripe_purchases via Phase A fetch.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase';
import {
  CLICK_EVENT_MAP,
  type DateRange,
  type CustomDateRange,
  type VideoMetricsResult,
} from '../../lib/analyticsEngine';
import {
  metricsForFactBag,
  type FactBagActiveSource,
} from '../../lib/metricsForFactBag';
import {
  UNATTRIBUTED_PROMOTION_ID,
  fetchOrgAnalyticsFacts,
  partitionFactsByPromotion,
  type OrgAnalyticsFacts,
  type PromotionFactBag,
} from './orgAnalyticsFacts';

// ── Output row (Phase C AllPromotionsAnalytics data source) ─────────────────

export interface PromotionMetricRow {
  /** Real promotions.id, or UNATTRIBUTED_PROMOTION_ID. */
  promotionId: string;
  /** assignment.title → campaigns.campaign_name → "Promotion" */
  title: string;
  campaignId: string | null;
  campaignName: string | null;
  /** True only for the synthetic unresolved-facts bucket. */
  isUnattributed: boolean;
  /** True when facts resolved to an id not in org promotions list. */
  isOrphanIdentity: boolean;
  /**
   * Archive defaults from Phase B are false/null.
   * Canonical viewer archive is applied by the page via
   * promotion_user_states → getPromotionArchiveContextsForViewer.
   * promotions.archived_at does NOT exist on the real schema.
   */
  isArchived: boolean;
  archivedAt: string | null;
  /** Canonical metrics — one metricsForFactBag call per row. */
  metrics: VideoMetricsResult;
  /**
   * Asset Clicks at Promotion/fact-bag grain (NOT sum of AllAssets pair rows).
   * Same semantics as AllAssets metrics.clicks / design:
   * events with non-null asset_id whose event_type is in CLICK_EVENT_MAP,
   * deduped by event id within the promotion bag.
   */
  asset_clicks: number;
  /**
   * Per-asset click counts (same rules as asset_clicks).
   * Keys = assets.id. Assets with 0 clicks may be absent here;
   * UI merges with promotion_assets membership for zero rows.
   */
  asset_clicks_by_asset: Record<string, number>;
  /** Debug / verification aids (not required by UI). */
  factCounts: {
    events: number;
    stripe: number;
    pixel: number;
  };
}

export interface BuildPromotionMetricRowsInput {
  organizationId: string;
  dateRange: DateRange;
  customRange?: CustomDateRange | null;
  activeSource: FactBagActiveSource;
  includeEV?: boolean;
  /**
   * Optional pre-fetched facts (tests / callers that already ran Phase A).
   * When omitted, fetchOrgAnalyticsFacts is called once.
   */
  facts?: OrgAnalyticsFacts;
}

// ── Identity join ────────────────────────────────────────────────────────────

interface OrgPromotionIdentity {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  assignmentTitle: string | null;
}

/**
 * Marketplace display rule:
 *   assignment.title → campaigns.campaign_name → "Promotion"
 */
export function resolvePromotionTitle(identity: {
  assignmentTitle: string | null | undefined;
  campaignName: string | null | undefined;
}): string {
  const fromAssignment = identity.assignmentTitle?.trim();
  if (fromAssignment) return fromAssignment;
  const fromCampaign = identity.campaignName?.trim();
  if (fromCampaign) return fromCampaign;
  return 'Promotion';
}

/**
 * Org-scoped promotions + assignment title + campaign name.
 * Does not load marketer / collaborator aggregation (Phase D).
 */

/** Flatten CLICK_EVENT_MAP raw event_type strings (AllAssets Asset Clicks path). */
const ASSET_CLICK_EVENT_TYPES: Set<string> = new Set(
  Object.values(CLICK_EVENT_MAP).flatMap(types => types),
);

/**
 * Promotion-level Asset Clicks from a fact bag's events only.
 * - Requires asset_id (asset-scoped event)
 * - event_type in CLICK_EVENT_MAP values
 * - Dedupe by event id (bag may already be unique; still safe)
 * Does NOT sum AllAssets display rows. Does NOT use processVideoMetrics.
 */
export function countAssetClicksFromEvents(
  events: { id: string; asset_id?: string | null; event_type?: string | null }[],
): number {
  const seen = new Set<string>();
  for (const e of events) {
    if (!e.asset_id) continue;
    if (!e.event_type || !ASSET_CLICK_EVENT_TYPES.has(e.event_type)) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
  }
  return seen.size;
}

/**
 * Per-asset breakdown using the SAME rules as countAssetClicksFromEvents.
 * sum(values) === countAssetClicksFromEvents(events) when every counted
 * event has a single asset_id (guaranteed by the filter).
 */
export function countAssetClicksByAssetId(
  events: { id: string; asset_id?: string | null; event_type?: string | null }[],
): Map<string, number> {
  const seen = new Set<string>();
  const byAsset = new Map<string, number>();
  for (const e of events) {
    if (!e.asset_id) continue;
    if (!e.event_type || !ASSET_CLICK_EVENT_TYPES.has(e.event_type)) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    byAsset.set(e.asset_id, (byAsset.get(e.asset_id) ?? 0) + 1);
  }
  return byAsset;
}

export async function fetchOrgPromotionIdentities(
  organizationId: string,
): Promise<OrgPromotionIdentity[]> {
  // promotions for this org; join assignment + campaign for title rule.
  // Column names match common VSTRK schema; if a column is missing in a
  // given environment, tighten the select rather than inventing titles.
  // promotions has NO archived_at column. Archive is per-viewer via
  // promotion_user_states → getPromotionArchiveContextsForViewer (page layer).
  const { data, error } = await supabase
    .from('promotions')
    .select(
      `
      id,
      campaign_id,
      assignments ( title ),
      campaigns ( campaign_name )
    `,
    )
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Failed to load promotions for identity join: ${error.message}`);
  }

  return (data ?? []).map((row: any) => {
    const assignment = Array.isArray(row.assignments)
      ? row.assignments[0]
      : row.assignments;
    const campaign = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns;
    return {
      id: row.id as string,
      campaignId: (row.campaign_id as string | null) ?? null,
      campaignName: (campaign?.campaign_name as string | null) ?? null,
      assignmentTitle: (assignment?.title as string | null) ?? null,
    };
  });
}

// ── Empty bag metrics (zero-activity promotions) ─────────────────────────────

function emptyBagMetrics(
  bagId: string,
  activeSource: FactBagActiveSource,
  redirectLinkLookup: Record<string, string | null>,
  includeEV: boolean,
): VideoMetricsResult {
  // Prefer one metricsForFactBag call with empty arrays so Total/Pixel/Stripe
  // isolation and processVideoMetrics defaults stay identical to non-empty bags.
  return metricsForFactBag({
    bagId,
    events: [],
    stripeRaw: [],
    pixelRaw: [],
    activeSource,
    redirectLinkLookup,
    includeEV,
  });
}

function bagFactCounts(bag: PromotionFactBag | undefined): PromotionMetricRow['factCounts'] {
  if (!bag) return { events: 0, stripe: 0, pixel: 0 };
  return {
    events: bag.events.length,
    stripe: bag.stripeRaw.length,
    pixel: bag.pixelRaw.length,
  };
}

// ── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build one PromotionMetricRow per org promotion (including zero-activity),
 * plus an Unattributed row only when unresolved facts exist.
 *
 * Metrics: exactly one metricsForFactBag invocation per output row.
 * Never sums All Assets pair rows. Never averages child RPCs.
 */
export async function buildPromotionMetricRows(
  input: BuildPromotionMetricRowsInput,
): Promise<PromotionMetricRow[]> {
  const {
    organizationId,
    dateRange,
    customRange = null,
    activeSource,
    includeEV = true,
  } = input;

  const facts =
    input.facts ??
    (await fetchOrgAnalyticsFacts({
      organizationId,
      dateRange,
      customRange,
    }));

  const identities = await fetchOrgPromotionIdentities(organizationId);
  const identityById = new Map(identities.map(i => [i.id, i]));

  const bags = partitionFactsByPromotion(facts);
  const rows: PromotionMetricRow[] = [];

  // 1) Every org promotion — including zero-activity (empty bag → zero metrics)
  for (const identity of identities) {
    const bag = bags.get(identity.id);
    const metrics = bag
      ? metricsForFactBag({
          bagId: identity.id,
          events: bag.events,
          stripeRaw: bag.stripeRaw,
          pixelRaw: bag.pixelRaw,
          activeSource,
          redirectLinkLookup: facts.redirectLinkLookup,
          includeEV,
        })
      : emptyBagMetrics(
          identity.id,
          activeSource,
          facts.redirectLinkLookup,
          includeEV,
        );

    rows.push({
      promotionId: identity.id,
      title: resolvePromotionTitle(identity),
      campaignId: identity.campaignId,
      campaignName: identity.campaignName,
      isUnattributed: false,
      isOrphanIdentity: false,
      isArchived: false,
      archivedAt: null,
      metrics,
      asset_clicks: countAssetClicksFromEvents(bag?.events ?? []),
      asset_clicks_by_asset: (() => {
        const m = countAssetClicksByAssetId(bag?.events ?? []);
        const o: Record<string, number> = {};
        m.forEach((v, k) => { o[k] = v; });
        return o;
      })(),
      factCounts: bagFactCounts(bag),
    });
  }

  // 2) Unattributed — only if unresolved facts actually exist
  const unattributedBag = bags.get(UNATTRIBUTED_PROMOTION_ID);
  if (unattributedBag) {
    const hasFacts =
      unattributedBag.events.length > 0 ||
      unattributedBag.stripeRaw.length > 0 ||
      unattributedBag.pixelRaw.length > 0;

    if (hasFacts) {
      const metrics = metricsForFactBag({
        bagId: UNATTRIBUTED_PROMOTION_ID,
        events: unattributedBag.events,
        stripeRaw: unattributedBag.stripeRaw,
        pixelRaw: unattributedBag.pixelRaw,
        activeSource,
        redirectLinkLookup: facts.redirectLinkLookup,
        includeEV,
      });

      rows.push({
        promotionId: UNATTRIBUTED_PROMOTION_ID,
        title: 'Unattributed',
        campaignId: null,
        campaignName: null,
        isUnattributed: true,
        isOrphanIdentity: false,
        isArchived: false,
        archivedAt: null,
        metrics,
        asset_clicks: countAssetClicksFromEvents(unattributedBag.events),
        asset_clicks_by_asset: (() => {
          const m = countAssetClicksByAssetId(unattributedBag.events);
          const o: Record<string, number> = {};
          m.forEach((v, k) => { o[k] = v; });
          return o;
        })(),
        factCounts: bagFactCounts(unattributedBag),
      });
    }
  }

  // Facts that resolved to a promotion_id not in this org's promotions list
  // still produced a bag. Surface them as rows so revenue is not dropped.
  // Title falls back to "Promotion"; Phase C can decide display policy.
  for (const [promotionId, bag] of bags) {
    if (promotionId === UNATTRIBUTED_PROMOTION_ID) continue;
    if (identityById.has(promotionId)) continue;

    const hasFacts =
      bag.events.length > 0 || bag.stripeRaw.length > 0 || bag.pixelRaw.length > 0;
    if (!hasFacts) continue;

    rows.push({
      promotionId,
      title: 'Promotion',
      campaignId: null,
      campaignName: null,
      isUnattributed: false,
      isOrphanIdentity: true,
      isArchived: false,
      archivedAt: null,
      metrics: metricsForFactBag({
        bagId: promotionId,
        events: bag.events,
        stripeRaw: bag.stripeRaw,
        pixelRaw: bag.pixelRaw,
        activeSource,
        redirectLinkLookup: facts.redirectLinkLookup,
        includeEV,
      }),
      asset_clicks: countAssetClicksFromEvents(bag.events),
      asset_clicks_by_asset: (() => {
        const m = countAssetClicksByAssetId(bag.events);
        const o: Record<string, number> = {};
        m.forEach((v, k) => { o[k] = v; });
        return o;
      })(),
      factCounts: bagFactCounts(bag),
    });
  }

  return rows;
}

