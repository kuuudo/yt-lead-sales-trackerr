/**
 * getTopPromotionsAnalytics.ts
 * Snapshot-first rankings; forceRefresh only on Update button or empty window.
 * Title: promotions.assignment_id → assignments.title (numeric titles allowed).
 */

import {
  fetchPromotionDisplayTitles,
  getMonthlySnapshot,
  refreshProvisionalMonthlySnapshot,
  utcMonthPeriod,
  utcMonthPeriodFromDate,
  type MonthPeriod,
  type RankingWindow,
} from '../analytics/monthlyRankingSnapshots';
import { resolveConversionOwners } from '../attribution/resolveConversionOwners';
import { supabase } from '../../lib/supabase';

export type TopPromotionsMetric = 'revenue' | 'clicks' | 'sessions' | 'conversions' | 'rpc';
export type TopPromotionsPreset =
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_12_months'
  | 'all_time'
  | 'custom';

export interface TopPromotionRow {
  promotionId: string;
  title: string;
  marketer: string | null;
  revenue: number;
  clicks: number;
  sessions: number;
  conversions: number;
  rpc: number;
}

export interface TopPromotionsParams {
  organizationId: string;
  preset: TopPromotionsPreset;
  customRange?: { start: Date; end: Date } | null;
  forceRefresh?: boolean;
}

export function rankTopPromotions(
  rows: TopPromotionRow[],
  metric: TopPromotionsMetric,
): TopPromotionRow[] {
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
  preset: TopPromotionsPreset,
  customRange?: { start: Date; end: Date } | null,
): MonthPeriod {
  const now = new Date();
  if (preset === 'this_month') {
    const p = utcMonthPeriodFromDate(now);
    return { ...p, rankingWindow: 'this_month' };
  }
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
    return {
      periodStart: '2020-01-01',
      periodEnd: ymd(now),
      rankingWindow: 'all_time',
    };
  }
  if (preset === 'custom' && customRange?.start && customRange?.end) {
    return {
      periodStart: ymd(customRange.start),
      periodEnd: ymd(customRange.end),
      rankingWindow: 'custom',
    };
  }
  const p = utcMonthPeriodFromDate(now);
  return { ...p, rankingWindow: 'this_month' };
}

async function withLivePromotionTitles(rows: TopPromotionRow[]): Promise<TopPromotionRow[]> {
  const ids = rows.map((r) => r.promotionId).filter(Boolean);
  if (ids.length === 0) return rows;
  const titles = await fetchPromotionDisplayTitles(ids);
  return rows.map((r) => ({
    ...r,
    title: titles.get(r.promotionId) || r.title || r.promotionId,
  }));
}

async function loadWindowPromotionRows(
  organizationId: string,
  period: MonthPeriod,
  forceRefresh: boolean,
): Promise<TopPromotionRow[]> {
  console.log('[getTopPromotionsAnalytics] loadWindow', {
    organizationId,
    period,
    forceRefresh,
  });

  if (forceRefresh) {
    await refreshProvisionalMonthlySnapshot(organizationId, period);
  }

  let snap = await getMonthlySnapshot(organizationId, period);
  if (!snap) {
    console.log('[getTopPromotionsAnalytics] empty window — computing once');
    await refreshProvisionalMonthlySnapshot(organizationId, period);
    snap = await getMonthlySnapshot(organizationId, period);
  }
  if (!snap) return [];

  const mapped: TopPromotionRow[] = snap.rows
    .filter((r) => r.ranking_type === 'promotion' && r.rank != null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((r) => ({
      promotionId: r.promotion_id ?? '',
      title: r.entity_name_snapshot ?? r.promotion_id ?? '',
      marketer: null,
      revenue: Number(r.revenue) || 0,
      clicks: Number(r.clicks) || 0,
      sessions: 0,
      conversions: Number(r.conversions) || 0,
      rpc: Number(r.rpc) || 0,
    }));

  return withLivePromotionTitles(mapped);
}

export async function getTopPromotionsAnalytics(
  params: TopPromotionsParams,
): Promise<TopPromotionRow[]> {
  const { organizationId, preset, customRange, forceRefresh = false } = params;
  if (!organizationId) return [];

  const period = windowForPreset(preset, customRange ?? null);
  return loadWindowPromotionRows(organizationId, period, forceRefresh);
}
