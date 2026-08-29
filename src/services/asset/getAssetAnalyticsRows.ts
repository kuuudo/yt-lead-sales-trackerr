/**
 * services/asset/getAssetAnalyticsRows.ts
 *
 * ORCHESTRATION LAYER for AllAssetsAnalytics.
 *
 * Source of truth: ASSET_ANALYTICS_DESIGN.md
 *   — SOURCE OF TRUTH — REUSABLE ANALYTICS ARCHITECTURE (DO NOT RE-INVESTIGATE)
 *
 * Responsibility (and ONLY this):
 *   1. Org-scoped fetch of redirect_links + attribution inputs (same shape as getAssetAnalyticsBatch)
 *   2. buildAssetAnalyticsRows() → canonical (video_id, asset_id) identities
 *   3. computeAssetAnalytics() per distinct asset_id, keeping .relationships
 *   4. Join identity × relationship by promotingSourceId === video_id
 *   5. Attach archive context via getAssetArchiveContextsForViewer
 *   6. Return final table rows
 *
 * Explicitly does NOT:
 *   - Reimplement attribution or metric math
 *   - Modify buildAssetAnalyticsRows / assetAnalyticsEngine / redirect generation
 *   - Put archive logic inside engines
 *   - Apply UI filters
 *   - Touch AllAssetsAnalytics.tsx
 *
 * Signature verification (against real source):
 *   - buildAssetAnalyticsRows(redirectLinks) → { assetAnalyticsRows, ownCampaignRows, unclassified }
 *   - computeAssetAnalytics(AssetAnalyticsEngineInput) → AssetAnalyticsResult (SYNC)
 *   - AssetRelationshipRow.promotingSourceId + .metrics
 *   - getAssetArchiveContextsForViewer(AssetForArchiveContext[], viewerId) → Map
 */

import { supabase } from '../../lib/supabase';
import {
  buildAssetAnalyticsRows,
  type RedirectLinkAttributionRow,
  type AssetAnalyticsRowIdentity,
} from '../../lib/buildAssetAnalyticsRows';
import {
  computeAssetAnalytics,
  getDateBounds,
  type AssetMetrics,
  type AssetRelationshipRow,
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
import {
  getAssetArchiveContextsForViewer,
  type AssetArchiveContext,
  type AssetForArchiveContext,
} from './getAssetArchiveContext';

import { getAssignedAssetSummaryForOwner } from './getAssignedAssetSummaryForOwner';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GetAssetAnalyticsRowsParams {
  organizationId: string;
  viewerId: string;
  dateRange?: DateRange;
  customRange?: CustomDateRange | null;
  activeSource?: ActiveSource;
  includeEV?: boolean;
  /**
   * Optional: limit to specific asset ids (e.g. after a UI filter).
   * If omitted, all org redirect_links with asset_id IS NOT NULL drive the set.
   */
  assetIds?: string[];
}

export interface AssetAnalyticsTableRow {
  video_id: string;
  asset_id: string;
  linkTypes: string[];
  campaignIds: string[];
  promotionIds: string[];
  /** Metrics for this exact (video_id, asset_id) from computeRelationships. */
  metrics: AssetMetrics;
  /** Asset type from assets table (campaign_element | video | resource). */
  asset_type: string;
  /** assets.organization_id — raw fact only, not a label. AllAssetsAnalytics.tsx
   *  compares this to the viewer's organizationId to derive My vs Shared. */
  assetOrganizationId: string;
  /** From getAssignedAssetSummaryForOwner(viewerId) — true if this asset is
   *  currently handed out to a collaborator. Annotation on top of My, not a
   *  separate/exclusive category — see ASSET_ANALYTICS_DESIGN_6.md. */
  isAssigned: boolean;
  archive: {
    isArchived: boolean;
    level: 'normal' | 'level1' | 'level2';
    reasons: AssetArchiveContext['reasons'];
    isHiddenByViewer: boolean;
  };
}

export interface GetAssetAnalyticsRowsResult {
  rows: AssetAnalyticsTableRow[];
  assetIds: string[];
  unmatchedIdentityCount: number;
  debug: {
    redirectLinkCount: number;
    identityCount: number;
    assetCount: number;
  };
}

// ---------------------------------------------------------------------------
// Fetch helpers (mirrored from getAssetAnalyticsBatch — no new attribution)
// ---------------------------------------------------------------------------

const REDIRECT_LINKS_COLUMNS =
  'id, token, video_id, campaign_id, link_type, destination_url, organization_id, promotion_id, asset_id, tracking_hostname, created_at';

const EVENTS_COLUMNS =
  'id, session_id, video_id, campaign_id, event_type, created_at, organization_id, promotion_id, asset_id, redirect_link_id, tracking_hostname, link_type';

const STRIPE_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id';

const PIXEL_PURCHASES_COLUMNS =
  'id, promotion_id, session_id, video_id, campaign_id, amount, created_at, event_type, organization_id';

const CAMPAIGN_ELEMENT_ASSETS_COLUMNS =
  'id, asset_id, campaign_id, element_type, source_field, display_name';

const VIDEOS_COLUMNS = 'id, asset_id, campaign_id';
const ASSET_RESOURCES_COLUMNS = 'id, asset_id';
const ASSETS_COLUMNS = 'id, asset_type, organization_id';

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

function emptyMetrics(): AssetMetrics {
  return { clicks: 0, sessions: 0, conversions: 0, revenue: 0, rpc: 0 };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function getAssetAnalyticsRows(
  params: GetAssetAnalyticsRowsParams,
): Promise<GetAssetAnalyticsRowsResult> {
  const {
    organizationId,
    viewerId,
    dateRange = '30days',
    customRange = null,
    activeSource = 'total',
    includeEV = true,
    assetIds: assetIdsFilter,
  } = params;

  const { start, end } = getDateBounds(dateRange, customRange);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // ── 1. Org-scoped redirect_links with asset_id IS NOT NULL ─────────────
  let redirectQuery = supabase
    .from('redirect_links')
    .select(REDIRECT_LINKS_COLUMNS)
    .eq('organization_id', organizationId)
    .not('asset_id', 'is', null);

  if (assetIdsFilter && assetIdsFilter.length > 0) {
    redirectQuery = redirectQuery.in('asset_id', assetIdsFilter);
  }

  const { data: redirectLinksData, error: redirectLinksError } = await redirectQuery;
  if (redirectLinksError) {
    throw new Error(`Failed to fetch redirect_links: ${redirectLinksError.message}`);
  }

  const redirectLinks = (redirectLinksData ?? []) as RedirectLinkAttributionRow[];

  if (redirectLinks.length === 0) {
    return {
      rows: [],
      assetIds: [],
      unmatchedIdentityCount: 0,
      debug: { redirectLinkCount: 0, identityCount: 0, assetCount: 0 },
    };
  }

  // ── 2. Canonical identities ───────────────────────────────────────────
  const { assetAnalyticsRows: identities } = buildAssetAnalyticsRows(redirectLinks);

  if (identities.length === 0) {
    return {
      rows: [],
      assetIds: [],
      unmatchedIdentityCount: 0,
      debug: {
        redirectLinkCount: redirectLinks.length,
        identityCount: 0,
        assetCount: 0,
      },
    };
  }

  const distinctAssetIds = Array.from(
    new Set(identities.map((i) => i.asset_id).filter(Boolean)),
  );

  // ── 3. Asset types (needed for archive + computeAssetAnalytics) ───────
  const { data: assetsData, error: assetsError } = await supabase
    .from('assets')
    .select(ASSETS_COLUMNS)
    .in('id', distinctAssetIds);

  if (assetsError) {
    throw new Error(`Failed to fetch assets: ${assetsError.message}`);
  }

  const assetTypeById = new Map<string, string>();
  const assetOrgIdById = new Map<string, string>();
  for (const a of assetsData ?? []) {
    assetTypeById.set((a as any).id, (a as any).asset_type);
    assetOrgIdById.set((a as any).id, (a as any).organization_id);
  }

  // ── 4. Attribution bags (same pattern as getAssetAnalyticsBatch) ──────
  const engineRedirectLinks = redirectLinks as unknown as AssetRedirectLinkRow[];
  const tokens = engineRedirectLinks.map((r) => r.token).filter((t): t is string => !!t);

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
  const sessionIdsFromEvents = events
    .map((e) => e.session_id)
    .filter((s): s is string => !!s);

  const inDateWindow = <T extends { created_at: string }>(rowsIn: T[]): T[] =>
    rowsIn.filter((p) => {
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
    new Map([...stripeByToken, ...stripeBySession].map((p) => [p.id, p])).values(),
  );

  const [videosData, resourcesData, campaignElementAssetsData, assignedAssetSummary] = await Promise.all([
    supabase.from('videos').select(VIDEOS_COLUMNS).in('asset_id', distinctAssetIds),
    supabase.from('asset_resources').select(ASSET_RESOURCES_COLUMNS).in('asset_id', distinctAssetIds),
    supabase
      .from('campaign_element_assets')
      .select(CAMPAIGN_ELEMENT_ASSETS_COLUMNS)
      .in('asset_id', distinctAssetIds),
    getAssignedAssetSummaryForOwner(viewerId),
  ]);

  if (videosData.error) throw new Error(`Failed to fetch videos: ${videosData.error.message}`);
  if (resourcesData.error) {
    throw new Error(`Failed to fetch asset_resources: ${resourcesData.error.message}`);
  }
  if (campaignElementAssetsData.error) {
    throw new Error(
      `Failed to fetch campaign_element_assets: ${campaignElementAssetsData.error.message}`,
    );
  }

  const videos = (videosData.data ?? []) as AssetVideoRow[];
  const resources = (resourcesData.data ?? []) as AssetResourceRow[];
  const campaignElementAssets = (campaignElementAssetsData.data ?? []) as CampaignElementAssetRow[];

  const assignedAssetIds = new Set(assignedAssetSummary.map((s) => s.assetId));

  // ── 5. Per-asset computeAssetAnalytics — KEEP relationships ───────────
  const relationshipsByAsset = new Map<string, AssetRelationshipRow[]>();

  for (const assetId of distinctAssetIds) {
    const assetType = assetTypeById.get(assetId);
    if (!assetType) {
      relationshipsByAsset.set(assetId, []);
      continue;
    }

    const input: AssetAnalyticsEngineInput = {
      assetId,
      organizationId,
      assetType,
      dateRange,
      customRange,
      activeSource,
      includeEV,
      events,
      stripePurchases,
      pixelPurchases,
      redirectLinks: engineRedirectLinks,
      campaignElementAssets,
      videos,
      resources,
      // journeyContext omitted — not needed for table metrics
    };

    const result = computeAssetAnalytics(input);
    relationshipsByAsset.set(assetId, result.relationships ?? []);
  }

  // ── 6. Archive context (viewer-scoped) ────────────────────────────────
  const assetsForArchive: AssetForArchiveContext[] = distinctAssetIds
    .filter((id) => assetTypeById.has(id))
    .map((id) => ({
      id,
      assetType: assetTypeById.get(id)!,
    }));

  let archiveByAssetId = new Map<string, AssetArchiveContext>();
  try {
    archiveByAssetId = await getAssetArchiveContextsForViewer(
      assetsForArchive,
      viewerId,
    );
  } catch (err) {
    console.error(
      '[getAssetAnalyticsRows] getAssetArchiveContextsForViewer failed',
      err,
    );
  }

  // ── 7. Join identity × relationship × archive ─────────────────────────
  let unmatchedIdentityCount = 0;
  const rows: AssetAnalyticsTableRow[] = [];

  for (const identity of identities as AssetAnalyticsRowIdentity[]) {
    const { video_id, asset_id, linkTypes, campaignIds, promotionIds } = identity;
    if (!video_id || !asset_id) continue;

    const relationships = relationshipsByAsset.get(asset_id) ?? [];
    const match = relationships.find((r) => r.promotingSourceId === video_id);

    let metrics: AssetMetrics;
    if (match) {
      metrics = match.metrics;
    } else {
      unmatchedIdentityCount += 1;
      metrics = emptyMetrics();
    }

    const archiveCtx = archiveByAssetId.get(asset_id);
    const archive = archiveCtx
      ? {
          isArchived: !!archiveCtx.isArchived,
          level: archiveCtx.level,
          reasons: archiveCtx.reasons ?? [],
          isHiddenByViewer: !!archiveCtx.isHiddenByViewer,
        }
      : {
          isArchived: false,
          level: 'normal' as const,
          reasons: [],
          isHiddenByViewer: false,
        };

    rows.push({
      video_id,
      asset_id,
      linkTypes: linkTypes ?? [],
      campaignIds: campaignIds ?? [],
      promotionIds: promotionIds ?? [],
      metrics,
      asset_type: assetTypeById.get(asset_id) ?? 'unknown',
      assetOrganizationId: assetOrgIdById.get(asset_id) ?? '',
      isAssigned: assignedAssetIds.has(asset_id),
      archive,
    });
  }

  return {
    rows,
    assetIds: distinctAssetIds,
    unmatchedIdentityCount,
    debug: {
      redirectLinkCount: redirectLinks.length,
      identityCount: identities.length,
      assetCount: distinctAssetIds.length,
    },
  };
}
