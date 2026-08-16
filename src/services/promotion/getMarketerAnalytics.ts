/**
 * src/services/promotion/getMarketerAnalytics.ts
 *
 * Orchestration layer for the Marketer Analytics page (MarketerAnalytics.tsx).
 * Composes existing, trusted primitives — does not reimplement scope
 * resolution or revenue calculation:
 *
 *   MARKETER IDENTITY & "ALL MARKETERS" RANKING
 *     → getTopMarketersAnalytics() (getTopMarketersAnalytics.ts, untouched).
 *       Already resolves marketerId via
 *       promotions.assignment_collaborator_id → assignment_collaborators.user_id
 *       (the ACCEPTED collaborator — never promotions.owner_user_id, the
 *       assignment creator). This file calls it, never re-derives marketer
 *       identity itself.
 *
 *   PROMOTION → ASSIGNMENT → ASSET POOL
 *     → resolvePromotionAssetIds() below duplicates ONLY the two read
 *       queries getPromotionAnalytics.ts already performs in its steps 0–1
 *       (promotions row → assignment_assets rows). Same duplication
 *       convention already used throughout this codebase (see chunk/
 *       fetchByIn duplicated verbatim across getAssetAnalytics.ts /
 *       getAssetAnalyticsBatch.ts / getPromotionAnalytics.ts) rather than
 *       reaching into a file that isn't meant to export internals.
 *
 *   ASSET DISPLAY METADATA (thumbnail/title/platform/element type)
 *     → listAssetsByOrganization() (untouched), filtered client-side down
 *       to the resolved assignment_assets id set. No new display system.
 *
 *   ASSET CLASSIFICATION (4 content-type tabs)
 *     → resolveAssetType.ts's asset_type vocabulary (campaign_element /
 *       video / resource) + getPromotionalVideoAssetIds() (untouched) to
 *       split video into Promotional Video vs Content Video. No new
 *       definition of "promotional".
 *
 *   PER-ASSET METRICS (Promotional Video / Resource / Content Video tables)
 *     → getAssetAnalyticsBatch() (untouched) — batched, not N+1.
 *
 *   PER-ASSET GRANULAR BREAKDOWN (Campaign Element table)
 *     → computeCampaignElementBreakdown() (campaignElementAnalyticsEngine.ts,
 *       new — see that file's header for why this one primitive is
 *       genuinely missing from the existing engines and what it reuses).
 *
 * SCOPE RULE (locked): every function here resolves scope OUTWARD from a
 * known promotionId (→ assignment_id → assignment_assets → asset_id), the
 * same direction getPromotionAnalytics.ts and promotionAnalyticsEngine.ts
 * already use. Nothing here ever falls back to "every asset this marketer
 * owns" or any asset/video ownership column.
 */

import { supabase } from '../../lib/supabase';
import {
  getDateBounds,
  type DateRange,
  type CustomDateRange,
} from '../../lib/analyticsEngine';
import {
  getAssetAnalyticsBatch,
  getPromotionalVideoAssetIds,
} from '../asset/getAssetAnalyticsBatch';
import type { AssetMetrics, ActiveSource } from '../../lib/assetAnalyticsEngine';
import { listAssetsByOrganization, type AssetLibraryRow } from '../asset/listAssetsByOrganization';
import {
  getTopMarketersAnalytics,
  rankTopMarketers,
  type MarketerRow,
  type TopMarketersMetric,
} from './getTopMarketersAnalytics';
import {
  computeCampaignElementBreakdown,
  type CampaignElementMetricRow,
  type CampaignElementEventRow,
  type CampaignElementRedirectLinkRow,
  type CampaignElementStripePurchaseRow,
} from '../../lib/campaignElementAnalyticsEngine';

export type { MarketerRow, TopMarketersMetric };
export { rankTopMarketers };

// ── Postgrest .in() chunking — same discipline/limit as every sibling
// fetch layer in this codebase (getAssetAnalytics.ts, getAssetAnalyticsBatch.ts,
// getPromotionAnalytics.ts). Duplicated locally, not imported — none of
// those files export it. ─────────────────────────────────────────────────
const IN_CHUNK_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchByIn<T>(table: string, columns: string, column: string, values: string[]): Promise<T[]> {
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

// ═════════════════════════════════════════════════════════════════════════
// 1. MARKETER LIST / "ALL MARKETERS" RANKING
// ═════════════════════════════════════════════════════════════════════════

/**
 * getMarketersForOrg
 *
 * Thin bridge from this page's single DateRange control (item 13 — the
 * same '7days'|'30days'|'thismonth'|'2months'|'6months'|'1year'|'all'|'custom'
 * system used by the asset/promotion engines) into getTopMarketersAnalytics'
 * own preset vocabulary ('last_7_days'|...|'custom'), which doesn't have a
 * 1:1 slot for every DateRange value (e.g. '2months'/'6months'/'1year').
 * Rather than inventing a lossy mapping, every call here resolves concrete
 * start/end bounds via getDateBounds() — the SAME trusted boundary function
 * every other engine on this page uses — and always passes them through as
 * an explicit custom range. This changes no ranking/aggregation logic in
 * getTopMarketersAnalytics.ts, only how its date window is supplied.
 */
export async function getMarketersForOrg(
  organizationId: string,
  dateRange: DateRange,
  customRange?: CustomDateRange | null,
): Promise<MarketerRow[]> {
  const { start, end } = getDateBounds(dateRange, customRange ?? null);
  return getTopMarketersAnalytics({ organizationId, preset: 'custom', customRange: { start, end } });
}

// ═════════════════════════════════════════════════════════════════════════
// 2. PROMOTION → ASSIGNMENT → ASSET POOL (the locked scope chain)
// ═════════════════════════════════════════════════════════════════════════

export interface PromotionAssetPool {
  promotionId: string;
  assignmentId: string | null;
  organizationId: string | null;
  assetIds: string[];
}

/**
 * resolvePromotionAssetIds
 *
 * Mirrors getPromotionAnalytics.ts steps 0–1 exactly: promotions row →
 * assignment_id → assignment_assets → asset_id[]. Never touches
 * asset.owner / video.user_id / any ownership column.
 */
export async function resolvePromotionAssetIds(promotionId: string): Promise<PromotionAssetPool> {
  const { data: promotionRow, error: promotionError } = await supabase
    .from('promotions')
    .select('id, assignment_id, organization_id')
    .eq('id', promotionId)
    .single();

  if (promotionError || !promotionRow) {
    throw new Error(`Failed to fetch promotion: ${promotionError?.message ?? 'not found'}`);
  }

  const assignmentId = (promotionRow as any).assignment_id as string | null;
  const organizationId = (promotionRow as any).organization_id as string | null;

  if (!assignmentId) {
    return { promotionId, assignmentId: null, organizationId, assetIds: [] };
  }

  const { data: assignmentAssetsRows, error: assignmentAssetsError } = await supabase
    .from('assignment_assets')
    .select('asset_id')
    .eq('assignment_id', assignmentId);

  if (assignmentAssetsError) {
    throw new Error(`Failed to fetch assignment_assets: ${assignmentAssetsError.message}`);
  }

  const assetIds = (assignmentAssetsRows ?? [])
    .map((r: { asset_id: string | null }) => r.asset_id)
    .filter((id): id is string => !!id);

  return { promotionId, assignmentId, organizationId, assetIds };
}

/**
 * getScopedAssetIds
 *
 * Union of assignment_assets asset pools across one or more promotions —
 * "All Promotions" for a marketer means the union of each of their
 * promotions' own asset pool, never "everything this marketer owns".
 * Deduped, since two promotions could in principle share an assignment.
 */
export async function getScopedAssetIds(promotionIds: string[]): Promise<string[]> {
  const distinct = Array.from(new Set(promotionIds.filter(Boolean)));
  if (distinct.length === 0) return [];

  const pools = await Promise.all(distinct.map(resolvePromotionAssetIds));
  const union = new Set<string>();
  for (const pool of pools) {
    for (const id of pool.assetIds) union.add(id);
  }
  return Array.from(union);
}

// ═════════════════════════════════════════════════════════════════════════
// 3. CONTENT / ASSET-LEVEL ANALYTICS FOR THE RESOLVED SCOPE
// ═════════════════════════════════════════════════════════════════════════

export interface PromotionalVideoRow extends AssetLibraryRow {
  metrics: AssetMetrics;
  /** Best-effort funnel-step label derived from this video's OWN redirect_link(s) (link_type) — see file header. Not a specific target-asset name unless one could be resolved. */
  promotesLabel: string;
}

export interface ContentAssetRow extends AssetLibraryRow {
  metrics: AssetMetrics;
}

export interface MarketerContentAnalyticsResult {
  campaignElements: CampaignElementMetricRow[];
  promotionalVideos: PromotionalVideoRow[];
  resources: ContentAssetRow[];
  contentVideos: ContentAssetRow[];
  /** Distinct, real platform values found across the scoped video/resource rows — for the platform tabs (item 12). Never hardcoded. */
  platforms: string[];
}

const EMPTY_METRICS: AssetMetrics = { clicks: 0, sessions: 0, conversions: 0, revenue: 0, rpc: 0 };

const LINK_TYPE_LABELS: Record<string, string> = {
  landing_page: 'Landing Page',
  lead_magnet: 'Lead Magnet',
  newsletter: 'Newsletter',
  sales_call: 'Sales Call',
  consultation: 'Consultation',
  checkout: 'Checkout',
};

function labelForLinkType(linkType: string | null): string {
  if (!linkType) return 'Funnel';
  return LINK_TYPE_LABELS[linkType] ?? linkType;
}

export interface GetMarketerContentAnalyticsParams {
  organizationId: string;
  /** Either [singlePromotionId] (Specific Promotion) or the marketer's full promotion id list (All Promotions). Never all org promotions. */
  promotionIds: string[];
  dateRange: DateRange;
  customRange?: CustomDateRange | null;
  activeSource: ActiveSource;
}

const EMPTY_RESULT: MarketerContentAnalyticsResult = {
  campaignElements: [],
  promotionalVideos: [],
  resources: [],
  contentVideos: [],
  platforms: [],
};

/**
 * getMarketerContentAnalytics
 *
 * resolve scope → batch fetch → compute → group (item 13 of the spec).
 * Zero N+1: one assignment_assets fetch per promotion (parallelized), one
 * org-wide listAssetsByOrganization call, one getAssetAnalyticsBatch call,
 * and one small raw-data fetch for the Campaign Element breakdown.
 */
export async function getMarketerContentAnalytics(
  params: GetMarketerContentAnalyticsParams,
): Promise<MarketerContentAnalyticsResult> {
  const { organizationId, promotionIds, dateRange, customRange, activeSource } = params;

  const assetIds = await getScopedAssetIds(promotionIds);
  if (assetIds.length === 0) return EMPTY_RESULT;
  const assetIdSet = new Set(assetIds);

  // ── Display metadata — reuse the existing Asset Library data source,
  // narrowed to this scope. Org-wide fetch, client-side filter: same
  // pattern Assets.tsx / TopAssetsRanking.tsx already use. ────────────────
  const allOrgRows = await listAssetsByOrganization({ organizationId });
  const scopedRows = allOrgRows.filter(r => assetIdSet.has(r.id));

  const campaignElementRows = scopedRows.filter(r => r.asset_type === 'campaign_element');
  const resourceRows = scopedRows.filter(r => r.asset_type === 'resource');
  const videoRows = scopedRows.filter(r => r.asset_type === 'video');

  const videoIds = videoRows.map(r => r.id);
  const promotionalVideoIdSet =
    videoIds.length === 0
      ? new Set<string>()
      : await getPromotionalVideoAssetIds(organizationId, videoIds);

  const promotionalVideoRows = videoRows.filter(r => promotionalVideoIdSet.has(r.id));
  const contentVideoRows = videoRows.filter(r => !promotionalVideoIdSet.has(r.id));

  // ── Per-asset AssetMetrics (clicks/sessions/conversions/revenue/rpc) for
  // Promotional Video / Resource / Content Video tables — existing batched
  // engine, unmodified. ────────────────────────────────────────────────────
  const assetTypeById: Record<string, string> = {};
  for (const r of scopedRows) assetTypeById[r.id] = r.asset_type;

  const metricsMap =
    scopedRows.length === 0
      ? new Map<string, AssetMetrics>()
      : await getAssetAnalyticsBatch({
          assetIds: scopedRows.map(r => r.id),
          assetTypeById,
          organizationId,
          dateRange,
          customRange,
          activeSource,
        });

  // ── Raw data for the Campaign Element granular breakdown + the
  // Promotional Video "Promotes →" labels — one shared redirect_links
  // fetch across both id sets, mirrors getAssetAnalyticsBatch.ts's own
  // fetch shape (steps 1–3), scoped to just this table's assets instead of
  // the whole org. ─────────────────────────────────────────────────────────
  const linkOwnerIds = [...campaignElementRows.map(r => r.id), ...promotionalVideoRows.map(r => r.id)];

  const REDIRECT_LINKS_COLUMNS = 'id, token, link_type, organization_id, asset_id';
  const redirectLinksRaw =
    linkOwnerIds.length === 0
      ? []
      : (
          await fetchByIn<CampaignElementRedirectLinkRow & { organization_id: string | null }>(
            'redirect_links',
            REDIRECT_LINKS_COLUMNS,
            'asset_id',
            linkOwnerIds,
          )
        ).filter(r => r.organization_id === organizationId);

  const ceAssetIdSet = new Set(campaignElementRows.map(r => r.id));
  const ceLinks = redirectLinksRaw.filter(r => r.asset_id && ceAssetIdSet.has(r.asset_id));
  const videoLinks = redirectLinksRaw.filter(r => r.asset_id && promotionalVideoIdSet.has(r.asset_id));

  // "Promotes →" label per promotional video — best-effort from its own
  // redirect_link(s) link_type. See file header: this is a funnel-step
  // label, not a specific target-asset name, since no target-asset foreign
  // key was confirmed on redirect_links in the provided schema.
  const promotesLabelByVideoId = new Map<string, string>();
  for (const link of videoLinks) {
    if (!link.asset_id) continue;
    if (!promotesLabelByVideoId.has(link.asset_id)) {
      promotesLabelByVideoId.set(link.asset_id, labelForLinkType(link.link_type));
    }
  }

  let campaignElements: CampaignElementMetricRow[] = campaignElementRows.map(r => ({
    assetId: r.id,
    displayName: r.video_title ?? r.id,
    landing_page_view: 0,
    lead_magnet_click: 0,
    newsletter_click: 0,
    call_booking_click: 0,
    consultation_click: 0,
    totalClicks: 0,
    purchase_thankyou: 0,
    consultation_thankyou: 0,
    newsletter_thankyou: 0,
    call_booking_thankyou: 0,
    direct_offer_revenue: 0,
    consultation_revenue: 0,
    estimated_call_revenue: 0,
    total_revenue: 0,
    rpc: 0,
  }));

  if (campaignElementRows.length > 0) {
    const { start, end } = getDateBounds(dateRange, customRange ?? null);
    const ceIds = campaignElementRows.map(r => r.id);

    const EVENTS_COLUMNS = 'event_type, asset_id, session_id, created_at';
    const ceEventsRaw = await fetchByIn<
      CampaignElementEventRow & { session_id: string | null; created_at: string }
    >('events', EVENTS_COLUMNS, 'asset_id', ceIds).then(rows =>
      rows.filter(e => {
        const t = new Date(e.created_at);
        return t >= start && t <= end;
      }),
    );
    const events = ceEventsRaw;

    const sessionIdsFromEvents = ceEventsRaw
      .map(e => e.session_id)
      .filter((s): s is string => !!s);

    const tokens = ceLinks.map(r => r.token).filter((t): t is string => !!t);
    const STRIPE_PURCHASES_COLUMNS =
      'amount, redirect_link_id, redirect_link_token, session_id, created_at';

    const inDateWindow = <T extends { created_at: string }>(rows: T[]): T[] =>
      rows.filter(p => {
        const t = new Date(p.created_at);
        return t >= start && t <= end;
      });

    const [stripeByToken, stripeBySession] = await Promise.all([
      tokens.length === 0
        ? Promise.resolve([] as (CampaignElementStripePurchaseRow & { created_at: string })[])
        : fetchByIn<CampaignElementStripePurchaseRow & { created_at: string }>(
            'stripe_purchases',
            STRIPE_PURCHASES_COLUMNS,
            'redirect_link_token',
            tokens,
          ).then(inDateWindow),
      sessionIdsFromEvents.length === 0
        ? Promise.resolve([] as (CampaignElementStripePurchaseRow & { created_at: string; session_id?: string | null })[])
        : fetchByIn<CampaignElementStripePurchaseRow & { created_at: string; session_id?: string | null }>(
            'stripe_purchases',
            STRIPE_PURCHASES_COLUMNS,
            'session_id',
            sessionIdsFromEvents,
          ).then(inDateWindow),
    ]);

    const seen = new Set<string>();
    const stripePurchases: CampaignElementStripePurchaseRow[] = [];
    for (const p of [...stripeByToken, ...stripeBySession]) {
      const key = `${p.redirect_link_id ?? ''}::${p.redirect_link_token ?? ''}::${(p as any).session_id ?? ''}::${p.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stripePurchases.push(p);
    }

    const displayNameByAssetId: Record<string, string> = {};
    for (const r of campaignElementRows) displayNameByAssetId[r.id] = r.video_title ?? r.id;

    campaignElements = computeCampaignElementBreakdown({
      assetIds: ceIds,
      displayNameByAssetId,
      events: events.map(e => ({ event_type: e.event_type, asset_id: e.asset_id })),
      redirectLinks: ceLinks.map(r => ({ id: r.id, token: r.token, link_type: r.link_type, asset_id: r.asset_id })),
      stripePurchases,
      activeSource,
    });
  }

  const promotionalVideos: PromotionalVideoRow[] = promotionalVideoRows.map(r => ({
    ...r,
    metrics: metricsMap.get(r.id) ?? EMPTY_METRICS,
    promotesLabel: promotesLabelByVideoId.get(r.id) ?? 'Funnel',
  }));

  const resources: ContentAssetRow[] = resourceRows.map(r => ({
    ...r,
    metrics: metricsMap.get(r.id) ?? EMPTY_METRICS,
  }));

  const contentVideos: ContentAssetRow[] = contentVideoRows.map(r => ({
    ...r,
    metrics: metricsMap.get(r.id) ?? EMPTY_METRICS,
  }));

  const platforms = Array.from(
    new Set(
      [...videoRows, ...resourceRows]
        .map(r => r.platform)
        .filter((p): p is string => !!p),
    ),
  ).sort();

  return { campaignElements, promotionalVideos, resources, contentVideos, platforms };
}
