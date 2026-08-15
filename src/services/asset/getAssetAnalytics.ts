/**
 * src/services/asset/getAssetAnalytics.ts
 *
 * Fetch layer for single-Asset Analytics (V1 — one assetId in, one
 * AssetAnalyticsResult out; no inventory-wide rollup). Scope is resolved by
 * DIRECT asset_id column match — simpler than getPromotionAnalytics.ts's
 * video-id-pool indirection, because events.asset_id and
 * redirect_links.asset_id are both real, direct columns on this schema:
 *
 *   Asset → redirect_links (asset_id = assetId, organization_id = asset's org)
 *     → token[]    → stripe_purchases.redirect_link_token
 *   Asset → events  (asset_id = assetId, date-bounded)
 *     → session_id[] → pixel_purchases.session_id
 *                    → stripe_purchases.session_id (see checkout-link note below)
 *
 * assets.organization_id is the scope boundary (decision #4) — no
 * Promotion/Assignment resolution happens in this file. Cross-org isolation
 * is additionally enforced defensively downstream in
 * assetAnalyticsEngine.ts's scopeToAsset().
 *
 * JOURNEY CONTEXT RULE (same as getPromotionAnalytics.ts): journey
 * reconstruction is session-scoped and deliberately NOT filtered by
 * asset_id — a session can touch other assets on its way to a conversion.
 *
 * Protected files — unmodified, imported from only:
 *   analyticsEngine.ts, journeyAnalyticsEngine.ts, assetAnalyticsEngine.ts,
 *   supabase.ts. promotionAnalyticsEngine.ts / getPromotionAnalytics.ts are
 *   not imported at all — this file is a sibling, not a dependent.
 */

import { supabase } from '../../lib/supabase';
import {
  computeAssetAnalytics,
  getDateBounds,
  type AssetAnalyticsResult,
  type AssetAnalyticsEngineInput,
  type AssetEventRow,
  type AssetRedirectLinkRow,
  type AssetStripePurchaseRow,
  type AssetPixelPurchaseRow,
  type AssetVideoRow,
  type AssetResourceRow,
  type AssetJourneyContext,
  type ActiveSource,
  type DateRange,
  type CustomDateRange,
} from '../../lib/assetAnalyticsEngine';
import type { CampaignElementAssetRow } from '../../lib/journeyAnalyticsEngine';

export interface GetAssetAnalyticsParams {
  assetId: string;
  dateRange: DateRange;
  customRange?: CustomDateRange | null;
  activeSource: ActiveSource;
  includeEV?: boolean;
}

const ASSETS_COLUMNS = 'id, organization_id, asset_type, created_at, added_to_library_at';

const EVENTS_COLUMNS =
  'id, session_id, video_id, campaign_id, event_type, created_at, organization_id, promotion_id, asset_id, redirect_link_id, tracking_hostname, link_type';

const REDIRECT_LINKS_COLUMNS =
  'id, token, video_id, campaign_id, link_type, destination_url, organization_id, promotion_id, asset_id, tracking_hostname';

const STRIPE_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id';

const PIXEL_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, event_type, organization_id';

const CAMPAIGN_ELEMENT_ASSETS_COLUMNS = 'id, asset_id, campaign_id, element_type, source_field, display_name';

// videos: minimal columns for provenance (§3) — not the full Video row.
const VIDEOS_COLUMNS = 'id, asset_id, campaign_id';

// asset_resources: no campaign_id column exists (confirmed schema gap) —
// selecting only what's needed for defensive-array provenance resolution.
const ASSET_RESOURCES_COLUMNS = 'id, asset_id';

// Postgrest .in() filters are sent as URL query params — chunk large ID
// lists rather than risking an oversized request. Duplicated locally from
// getPromotionAnalytics.ts's helper (not imported — that file is untouched
// and its helper isn't exported).
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
 * getAssetAnalytics
 *
 * Fetches everything computeAssetAnalytics() needs for one asset and
 * returns the computed result. Every conversion counted here is scoped to
 * this asset's own asset_id / organization_id; journey evidence around
 * those conversions is session-scoped, per the rule above.
 */
export async function getAssetAnalytics(
  params: GetAssetAnalyticsParams,
): Promise<AssetAnalyticsResult> {
  const { assetId, dateRange, customRange, activeSource, includeEV = true } = params;
  const { start, end } = getDateBounds(dateRange, customRange);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // ── 0. Resolve the asset itself. organization_id here IS the scope
  // boundary for this engine (decision #4) — no assignment/promotion
  // resolution happens anywhere in this file. ─────────────────────────────
  const { data: assetRow, error: assetError } = await supabase
    .from('assets')
    .select(ASSETS_COLUMNS)
    .eq('id', assetId)
    .single();

  if (assetError || !assetRow) {
    throw new Error(`Failed to fetch asset: ${assetError?.message ?? 'not found'}`);
  }

  const organizationId = assetRow.organization_id as string | null;
  const assetType = assetRow.asset_type as string;

  if (!organizationId) {
    throw new Error(`Asset ${assetId} has no organization_id`);
  }

  // ── 1. Relationships — redirect_links WHERE asset_id = assetId AND
  // organization_id = assetOrgId (primary evidence; promotion_id is never
  // read here — see file header). ─────────────────────────────────────────
  const { data: redirectLinksData, error: redirectLinksError } = await supabase
    .from('redirect_links')
    .select(REDIRECT_LINKS_COLUMNS)
    .eq('asset_id', assetId)
    .eq('organization_id', organizationId);

  if (redirectLinksError) {
    throw new Error(`Failed to fetch redirect_links: ${redirectLinksError.message}`);
  }
  const redirectLinks = (redirectLinksData ?? []) as AssetRedirectLinkRow[];
  const tokens = redirectLinks.map(r => r.token).filter((t): t is string => !!t);

  // ── 2. Events — direct asset_id column match, date-bounded (no
  // video-id-pool indirection — the key simplification vs. Promotion
  // Analytics). ────────────────────────────────────────────────────────────
  const { data: eventsData, error: eventsError } = await supabase
    .from('events')
    .select(EVENTS_COLUMNS)
    .eq('asset_id', assetId)
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  if (eventsError) {
    throw new Error(`Failed to fetch events: ${eventsError.message}`);
  }
  const events = (eventsData ?? []) as AssetEventRow[];

  const sessionIdsFromEvents = events
    .map(e => e.session_id)
    .filter((s): s is string => !!s);

  // ── 3. Stripe by token AND by session bridge, Pixel by session bridge
  // (date-bounded) ───────────────────────────────────────────────────────
  //
  // Same bug class fixed in Promotion Analytics applies here: checkout-type
  // redirect_links commonly carry asset_id = NULL, so a checkout link can
  // NEVER appear in this asset's own `redirect_links` above, and its token
  // can never land in `tokens`. Without the session bridge, a
  // stripe_purchases row whose redirect_link_token points at a checkout
  // link would be invisible here — silently producing $0 Asset Revenue for
  // exactly the purchases that matter. The purchase row's own
  // promotion_id/asset_id (if either even exists on the row) is NOT used to
  // scope this fetch — bridged additively (union, not replacement) with the
  // token match, same as the promotion engine.
  const inDateWindow = <T extends { created_at: string }>(rows: T[]): T[] =>
    rows.filter(p => {
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

  // Merge + dedupe by id — a purchase can legitimately be returned by both
  // queries (token-matched AND session-matched at once).
  const stripePurchases = Array.from(
    new Map([...stripeByToken, ...stripeBySession].map(p => [p.id, p])).values(),
  );

  // ── 4. Provenance joins (§3) — run defensively (array results), never
  // assumed unique. ────────────────────────────────────────────────────────
  const [videosData, resourcesData, ownAssetCampaignElementAssets] = await Promise.all([
    supabase.from('videos').select(VIDEOS_COLUMNS).eq('asset_id', assetId),
    supabase.from('asset_resources').select(ASSET_RESOURCES_COLUMNS).eq('asset_id', assetId),
    supabase.from('campaign_element_assets').select(CAMPAIGN_ELEMENT_ASSETS_COLUMNS).eq('asset_id', assetId),
  ]);

  if (videosData.error) throw new Error(`Failed to fetch videos: ${videosData.error.message}`);
  if (resourcesData.error) throw new Error(`Failed to fetch asset_resources: ${resourcesData.error.message}`);
  if (ownAssetCampaignElementAssets.error) {
    throw new Error(`Failed to fetch campaign_element_assets: ${ownAssetCampaignElementAssets.error.message}`);
  }

  const videos = (videosData.data ?? []) as AssetVideoRow[];
  const resources = (resourcesData.data ?? []) as AssetResourceRow[];

  // ── 5. Journey context — session-scoped, NOT asset-filtered ─────────────
  // Only pull session_ids from the conversion source(s) actually in play
  // for this activeSource, mirroring the engine's own source isolation.
  const conversionSessionIds: string[] = [
    ...(activeSource !== 'pixel' ? stripePurchases.map(p => p.session_id).filter((s): s is string => !!s) : []),
    ...(activeSource !== 'stripe' ? pixelPurchases.map(p => p.session_id).filter((s): s is string => !!s) : []),
  ];

  const journeyEvents = await fetchByIn<AssetEventRow>(
    'events',
    EVENTS_COLUMNS,
    'session_id',
    conversionSessionIds,
  );

  const journeyRedirectLinkIds = journeyEvents
    .map(e => e.redirect_link_id)
    .filter((id): id is string => !!id);

  const journeyRedirectLinks = await fetchByIn<AssetRedirectLinkRow>(
    'redirect_links',
    REDIRECT_LINKS_COLUMNS,
    'id',
    journeyRedirectLinkIds,
  );

  // campaign_element_assets for display-name/element-type resolution across
  // EVERY asset touched anywhere above (this asset's own events/links, plus
  // whatever the journey touched) — not just this asset's own composite
  // key, so journey graph nodes for OTHER assets in the chain (§6's
  // Video A → Asset G → Video B → Resource H example) can still resolve a
  // display name downstream.
  const allTouchedAssetIds = Array.from(
    new Set(
      [
        ...events.map(e => e.asset_id),
        ...redirectLinks.map(r => r.asset_id),
        ...journeyEvents.map(e => e.asset_id),
        ...journeyRedirectLinks.map(r => r.asset_id),
      ].filter((id): id is string => !!id),
    ),
  );

  const journeyCampaignElementAssets = await fetchByIn<CampaignElementAssetRow>(
    'campaign_element_assets',
    CAMPAIGN_ELEMENT_ASSETS_COLUMNS,
    'asset_id',
    allTouchedAssetIds,
  );

  // Merge this asset's own campaign_element_assets rows (fetched in step 4)
  // with whatever the journey touched, deduped by id — classifyAsset() only
  // needs the former, but the journey graph needs the full set.
  const campaignElementAssets = Array.from(
    new Map(
      [...(ownAssetCampaignElementAssets.data ?? []) as CampaignElementAssetRow[], ...journeyCampaignElementAssets].map(
        r => [r.id, r],
      ),
    ).values(),
  );

  const journeyContext: AssetJourneyContext = {
    events: journeyEvents,
    redirectLinks: journeyRedirectLinks,
    campaignElementAssets,
  };

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
    journeyContext,
  };

  return computeAssetAnalytics(input);
}

/**
 * resolveAssetIdForVideo
 *
 * Opt-in recursion helper (§6) — looks up videos.asset_id for a given
 * video_id, letting a caller check whether a promoting source (an
 * AssetRelationshipRow.promotingSourceId) is itself a promoted asset
 * elsewhere, and recurse into getAssetAnalytics() with THAT asset's id.
 *
 * Deliberately NOT called automatically inside getAssetAnalytics() or
 * computeAssetAnalytics() — keeps the default single-asset call cheap.
 * Callers doing Type-2 recursive chains (video→asset→video→asset) must
 * supply their own maxDepth + visited-id guard; cycle protection is the
 * caller's responsibility, not this function's.
 */
export async function resolveAssetIdForVideo(videoId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('videos')
    .select('asset_id')
    .eq('id', videoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve asset_id for video ${videoId}: ${error.message}`);
  }
  return (data?.asset_id as string | undefined) ?? null;
}
