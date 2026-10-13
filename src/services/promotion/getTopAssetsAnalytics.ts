/**
 * getTopAssetsAnalytics.ts
 *
 * Snapshot-first Top Assets ranking (Revenue only).
 * Canonical owner: ConversionOwnerResult.ownerAssetId from resolveConversionOwners
 * (same path as AllAssets / formal Revenue).
 *
 * ranking_scope:
 *   my       — assets.organization_id = org
 *   assigned — assignment_assets for this org's promotions
 *
 * Does not write or delete Total / Marketer / Promotion snapshot rows.
 */

import {
  fetchAssetDisplayMeta,
  getAssetRankingSnapshot,
  refreshProvisionalAssetSnapshot,
  utcMonthPeriodFromDate,
  type MonthPeriod,
  type RankingScope,
} from '../analytics/monthlyRankingSnapshots';

export type TopAssetsMetric = 'revenue' | 'conversions';
export type TopAssetsPreset =
  | 'last_7_days'
  | 'last_30_days'
  | 'last_12_months'
  | 'all_time'
  | 'custom';

export type TopAssetsScope = RankingScope; // 'my' | 'assigned'

export interface TopAssetRow {
  assetId: string;
  title: string;
  revenue: number;
  conversions: number;
  thumbnailUrl: string | null;
  assetType: string | null;
  rank: number;
}

export interface TopAssetsParams {
  organizationId: string;
  preset: TopAssetsPreset;
  scope: TopAssetsScope;
  customRange?: { start: Date; end: Date } | null;
  forceRefresh?: boolean;
}

export function rankTopAssets(rows: TopAssetRow[], metric: TopAssetsMetric): TopAssetRow[] {
  return [...rows].sort((a, b) => {
    const dv = (b[metric] ?? 0) - (a[metric] ?? 0);
    if (dv !== 0) return dv;
    return a.title.localeCompare(b.title);
  });
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function windowForPreset(
  preset: TopAssetsPreset,
  customRange?: { start: Date; end: Date } | null,
): MonthPeriod {
  const now = new Date();
  if (preset === 'last_7_days') {
    const end = now;
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 6);
    return { periodStart: ymd(start), periodEnd: ymd(end), rankingWindow: 'last_7_days' };
  }
  if (preset === 'last_30_days') {
    const end = now;
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 29);
    return { periodStart: ymd(start), periodEnd: ymd(end), rankingWindow: 'last_30_days' };
  }
  if (preset === 'last_12_months') {
    const end = now;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    return { periodStart: ymd(start), periodEnd: ymd(end), rankingWindow: 'last_12_months' };
  }
  if (preset === 'all_time') {
    return { periodStart: '2020-01-01', periodEnd: ymd(now), rankingWindow: 'all_time' };
  }
  if (preset === 'custom' && customRange?.start && customRange?.end) {
    return {
      periodStart: ymd(customRange.start),
      periodEnd: ymd(customRange.end),
      rankingWindow: 'custom',
    };
  }
  const end = now;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 29);
  return { periodStart: ymd(start), periodEnd: ymd(end), rankingWindow: 'last_30_days' };
}

async function loadWindowAssetRows(
  organizationId: string,
  period: MonthPeriod,
  scope: RankingScope,
  forceRefresh: boolean,
): Promise<TopAssetRow[]> {
  console.log('[getTopAssetsAnalytics] loadWindow', {
    organizationId,
    period,
    scope,
    forceRefresh,
  });

  if (forceRefresh) {
    await refreshProvisionalAssetSnapshot(organizationId, period, scope);
  }

  let snap = await getAssetRankingSnapshot(organizationId, period, scope);
  if (!snap) {
    console.log('[getTopAssetsAnalytics] empty window — computing once');
    await refreshProvisionalAssetSnapshot(organizationId, period, scope);
    snap = await getAssetRankingSnapshot(organizationId, period, scope);
  }
  if (!snap) return [];

  const ranked = snap.rows
    .filter((r) => r.ranking_type === 'asset' && r.rank != null && r.asset_id)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

  const assetIds = ranked.map((r) => r.asset_id!).filter(Boolean);
  const meta = await fetchAssetDisplayMeta(assetIds);

  return ranked.map((r) => {
    const id = r.asset_id!;
    const m = meta.get(id);
    return {
      assetId: id,
      title: m?.title || r.entity_name_snapshot || id,
      revenue: Number(r.revenue) || 0,
      conversions: Number(r.conversions) || 0,
      thumbnailUrl: m?.thumbnailUrl ?? null,
      assetType: m?.assetType ?? null,
      rank: r.rank ?? 0,
    };
  });
}

export async function getTopAssetsAnalytics(params: TopAssetsParams): Promise<TopAssetRow[]> {
  const { organizationId, preset, scope, customRange, forceRefresh = false } = params;
  if (!organizationId) return [];
  if (scope !== 'my' && scope !== 'assigned') return [];

  const period = windowForPreset(preset, customRange ?? null);
  return loadWindowAssetRows(organizationId, period, scope, forceRefresh);
}
