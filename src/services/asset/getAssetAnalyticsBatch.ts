/**
 * src/services/asset/getAssetAnalyticsBatch.ts
 *
 * Batched sibling to getAssetAnalytics.ts, built for the Top Assets ranking
 * (Assets.tsx). Same fetch shape as getAssetAnalytics.ts's steps 0–4, but
 * every `.eq('asset_id', assetId)` becomes `.in('asset_id', assetIds)` so
 * ALL candidate assets across every ranking category are fetched in ONE
 * batched round-trip — never one Supabase request per asset.
 *
 * computeAssetAnalytics() (assetAnalyticsEngine.ts, unmodified) remains the
 * only place ranking metrics are computed. It is called once per asset
 * here, but that call is pure in-memory computation over the already-
 * fetched batch — not I/O — so this file introduces zero new attribution
 * logic and zero new network calls per asset.
 *
 * Deliberately omits journeyContext (step 5 of getAssetAnalytics.ts): the
 * ranking only needs `.metrics`, never `.journeyGraph`, and journey
 * reconstruction is the most expensive part of the single-asset fetch.
 * Skipping it here is a scope choice, not an oversight.
 *
 * Protected files — unmodified, only imported from:
 *   assetAnalyticsEngine.ts, journeyAnalyticsEngine.ts, supabase.ts.
 */

import { supabase } from '../../lib/supabase';
import {
  computeAssetAnalytics,
  getDateBounds,
  type AssetMetrics,
  type AssetAnalyticsEngineInput,
  type AssetEventRow,
  type AssetRedirectLinkRow,
  type AssetStripePurchaseRow,
  type AssetPixelPurchaseRow,
  type AssetVideoRow,
  type AssetResourceRow,
  type ActiveSource,
  type DateRange,
  type CustomDateRange,
} from '../../lib/assetAnalyticsEngine';
import type { CampaignElementAssetRow } from '../../lib/journeyAnalyticsEngine';

export interface GetAssetAnalyticsBatchParams {
  /** Candidate asset ids across every ranking category (union, deduped by caller or here). */
  assetIds: string[];
  /** asset_type for each id — needed per-asset by computeAssetAnalytics/classifyAsset. */
  assetTypeById: Record<string, string>;
  organizationId: string;
  dateRange: DateRange;
  customRange?: CustomDateRange | null;
  activeSource: ActiveSource;
  includeEV?: boolean;
}

const REDIRECT_LINKS_COLUMNS =
  'id, token, video_id, campaign_id, link_type, destination_url, organization_id, promotion_id, asset_id, tracking_hostname';

const EVENTS_COLUMNS =
  'id, session_id, video_id, campaign_id, event_type, created_at, organization_id, promotion_id, asset_id, redirect_link_id, tracking_hostname, link_type';

const STRIPE_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id';

const PIXEL_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, event_type, organization_id';

const CAMPAIGN_ELEMENT_ASSETS_COLUMNS = 'id, asset_id, campaign_id, element_type, source_field, display_name';

const VIDEOS_COLUMNS = 'id, asset_id, campaign_id';

const ASSET_RESOURCES_COLUMNS = 'id, asset_id';

// Same chunking discipline as getAssetAnalytics.ts / getPromotionAnalytics.ts —
// Postgrest .in() filters are URL query params, so large id lists are batched.
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
 * getAssetAnalyticsBatch
 *
 * Fetches everything computeAssetAnalytics() needs for MANY assets in one
 * batched pass, then computes each asset's AssetMetrics in memory. Returns
 * a Map<assetId, AssetMetrics> — ranking/sorting is the caller's job.
 */
export async function getAssetAnalyticsBatch(
  params: GetAssetAnalyticsBatchParams,
): Promise<Map<string, AssetMetrics>> {
  const { assetIds, assetTypeById, organizationId, dateRange, customRange, activeSource, includeEV = true } = params;

  const distinctAssetIds = Array.from(new Set(assetIds.filter(Boolean)));
  if (distinctAssetIds.length === 0) return new Map();

  const { start, end } = getDateBounds(dateRange, customRange);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // ── 1. Relationships — redirect_links WHERE asset_id IN (assetIds) AND
  // organization_id = organizationId (mirrors getAssetAnalytics.ts step 1,
  // batched). ───────────────────────────────────────────────────────────────
  const { data: redirectLinksData, error: redirectLinksError } = await supabase
    .from('redirect_links')
    .select(REDIRECT_LINKS_COLUMNS)
    .in('asset_id', distinctAssetIds)
    .eq('organization_id', organizationId);

  if (redirectLinksError) {
    throw new Error(`Failed to fetch redirect_links: ${redirectLinksError.message}`);
  }
  const redirectLinks = (redirectLinksData ?? []) as AssetRedirectLinkRow[];
  const tokens = redirectLinks.map(r => r.token).filter((t): t is string => !!t);

  // ── 2. Events — direct asset_id column match, batched, date-bounded
  // (mirrors getAssetAnalytics.ts step 2 — no organization_id filter here,
  // same as the single-asset fetch). ──────────────────────────────────────
  const { data: eventsData, error: eventsError } = await supabase
    .from('events')
    .select(EVENTS_COLUMNS)
    .in('asset_id', distinctAssetIds)
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  if (eventsError) {
    throw new Error(`Failed to fetch events: ${eventsError.message}`);
  }
  const events = (eventsData ?? []) as AssetEventRow[];
  const sessionIdsFromEvents = events.map(e => e.session_id).filter((s): s is string => !!s);

  // ── 3. Stripe by token AND by session bridge, Pixel by session bridge
  // (date-bounded) — same checkout-link bridge rationale as
  // getAssetAnalytics.ts step 3, batched across all candidate assets. ──────
  const inDateWindow = <T extends { created_at: string }>(rowsIn: T[]): T[] =>
    rowsIn.filter(p => {
      const t = new Date(p.created_at);
      return t >= start && t <= end;
    });

  const [stripeByToken, stripeBySession, pixelPurchases] = await Promise.all([
    tokens.length === 0
      ? Promise.resolve([] as AssetStripePurchaseRow[])
      : fetchByIn<AssetStripePurchaseRow>(
          'stripe_purchases',
          STRIPE_PURCHASES_COLUMNS,
          'redirect_link_token',
          tokens,
        ).then(inDateWindow),
    sessionIdsFromEvents.length === 0
      ? Promise.resolve([] as AssetStripePurchaseRow[])
      : fetchByIn<AssetStripePurchaseRow>(
          'stripe_purchases',
          STRIPE_PURCHASES_COLUMNS,
          'session_id',
          sessionIdsFromEvents,
        ).then(inDateWindow),
    sessionIdsFromEvents.length === 0
      ? Promise.resolve([] as AssetPixelPurchaseRow[])
      : fetchByIn<AssetPixelPurchaseRow>(
          'pixel_purchases',
          PIXEL_PURCHASES_COLUMNS,
          'session_id',
          sessionIdsFromEvents,
        ).then(inDateWindow),
  ]);

  const stripePurchases = Array.from(
    new Map([...stripeByToken, ...stripeBySession].map(p => [p.id, p])).values(),
  );

  // ── 4. Provenance joins (§3 of assetAnalyticsEngine.ts) — batched,
  // defensive array results, never assumed unique. ────────────────────────
  const [videosData, resourcesData, campaignElementAssetsData] = await Promise.all([
    supabase.from('videos').select(VIDEOS_COLUMNS).in('asset_id', distinctAssetIds),
    supabase.from('asset_resources').select(ASSET_RESOURCES_COLUMNS).in('asset_id', distinctAssetIds),
    supabase.from('campaign_element_assets').select(CAMPAIGN_ELEMENT_ASSETS_COLUMNS).in('asset_id', distinctAssetIds),
  ]);

  if (videosData.error) throw new Error(`Failed to fetch videos: ${videosData.error.message}`);
  if (resourcesData.error) throw new Error(`Failed to fetch asset_resources: ${resourcesData.error.message}`);
  if (campaignElementAssetsData.error) {
    throw new Error(`Failed to fetch campaign_element_assets: ${campaignElementAssetsData.error.message}`);
  }

  const videos = (videosData.data ?? []) as AssetVideoRow[];
  const resources = (resourcesData.data ?? []) as AssetResourceRow[];
  const campaignElementAssets = (campaignElementAssetsData.data ?? []) as CampaignElementAssetRow[];

  // ── 5. Per-asset computation — IN MEMORY ONLY. computeAssetAnalytics()
  // (the real engine, unmodified) re-scopes the full batch down to each
  // asset via its own scopeToAsset() on every call — this loop performs no
  // I/O, so it never becomes an N+1 request pattern regardless of how many
  // assets are ranked. ──────────────────────────────────────────────────────
  const results = new Map<string, AssetMetrics>();

  for (const assetId of distinctAssetIds) {
    const assetType = assetTypeById[assetId];
    if (!assetType) continue; // defensive — caller is expected to supply a type for every id

    const input: AssetAnalyticsEngineInput = {
      assetId,
      organizationId,
      assetType,
      dateRange,
      customRange: customRange ?? null,
      activeSource,
      includeEV,
      events,
      stripePurchases,
      pixelPurchases,
      redirectLinks,
      campaignElementAssets,
      videos,
      resources,
      // journeyContext intentionally omitted — see file header.
    };

    results.set(assetId, computeAssetAnalytics(input).metrics);
  }

  return results;
}

/**
 * getPromotionalVideoAssetIds
 *
 * Classifies which of the given video asset ids are "Promotional Videos":
 * assets that own at least one redirect_links row (redirect_links.asset_id
 * = the video asset's own id). This is the exact same relationship
 * getAssetAnalytics.ts step 1 treats as "this asset's own redirect links" —
 * no new relationship is invented, this just batches the id check across
 * many video assets at once instead of one asset at a time.
 */
export async function getPromotionalVideoAssetIds(
  organizationId: string,
  videoAssetIds: string[],
): Promise<Set<string>> {
  const distinct = Array.from(new Set(videoAssetIds.filter(Boolean)));
  if (distinct.length === 0) return new Set();

  const promoting = new Set<string>();
  for (const batch of chunk(distinct, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('redirect_links')
      .select('asset_id')
      .eq('organization_id', organizationId)
      .in('asset_id', batch);

    if (error) {
      throw new Error(`Failed to fetch redirect_links for video classification: ${error.message}`);
    }
    for (const row of (data ?? []) as { asset_id: string | null }[]) {
      if (row.asset_id) promoting.add(row.asset_id);
    }
  }
  return promoting;
}
