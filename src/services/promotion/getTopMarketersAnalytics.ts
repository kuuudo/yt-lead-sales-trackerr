/**
 * getTopMarketersAnalytics.ts
 * Snapshot-first; forceRefresh on Update only.
 * Expands promotions under each marketer from same-window promotion rows
 * + promotions.assignment_collaborator_id → user_id.
 */

import {
  fetchPromotionDisplayTitles,
  getMonthlySnapshot,
  refreshProvisionalMonthlySnapshot,
  utcMonthPeriodFromDate,
  type MonthPeriod,
} from '../analytics/monthlyRankingSnapshots';
import { supabase } from '../../lib/supabase';

export type TopMarketersMetric = 'revenue' | 'clicks' | 'sessions' | 'conversions' | 'rpc';
export type TopMarketersPreset =
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_12_months'
  | 'all_time'
  | 'custom';

export interface MarketerPromotionSlice {
  promotionId: string;
  title: string;
  revenue: number;
}

export interface MarketerRow {
  marketerId: string;
  marketerName: string;
  promotions: MarketerPromotionSlice[];
  revenue: number;
  clicks: number;
  sessions: number;
  conversions: number;
  rpc: number;
}

export interface TopMarketersParams {
  organizationId: string;
  preset: TopMarketersPreset;
  customRange?: { start: Date; end: Date } | null;
  forceRefresh?: boolean;
}

export function rankTopMarketers(rows: MarketerRow[], metric: TopMarketersMetric): MarketerRow[] {
  return [...rows].sort((a, b) => {
    const dv = (b[metric] ?? 0) - (a[metric] ?? 0);
    if (dv !== 0) return dv;
    return a.marketerName.localeCompare(b.marketerName);
  });
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function windowForPreset(
  preset: TopMarketersPreset,
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
    return { periodStart: '2020-01-01', periodEnd: ymd(now), rankingWindow: 'all_time' };
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

/** Map promotion_id → marketer user_id via assignment_collaborator. */
async function marketerIdByPromotionId(
  promotionIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (promotionIds.length === 0) return out;

  const { data: promos, error } = await supabase
    .from('promotions')
    .select('id, assignment_collaborator_id')
    .in('id', promotionIds);
  if (error || !promos) {
    console.warn('[getTopMarketersAnalytics] promotions collaborator fetch failed', error?.message);
    return out;
  }

  const collabIds = promos
    .map((p: any) => p.assignment_collaborator_id)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

  const userByCollab = new Map<string, string>();
  if (collabIds.length > 0) {
    const { data: collabs } = await supabase
      .from('assignment_collaborators')
      .select('id, user_id')
      .in('id', collabIds);
    for (const c of collabs ?? []) {
      if ((c as any).user_id) userByCollab.set((c as any).id, (c as any).user_id);
    }
  }

  for (const p of promos as any[]) {
    const uid = p.assignment_collaborator_id
      ? userByCollab.get(p.assignment_collaborator_id)
      : undefined;
    if (p.id && uid) out.set(p.id, uid);
  }
  return out;
}

async function loadWindowMarketerRows(
  organizationId: string,
  period: MonthPeriod,
  forceRefresh: boolean,
): Promise<MarketerRow[]> {
  console.log('[getTopMarketersAnalytics] loadWindow', { organizationId, period, forceRefresh });

  if (forceRefresh) {
    await refreshProvisionalMonthlySnapshot(organizationId, period);
  }

  let snap = await getMonthlySnapshot(organizationId, period);
  if (!snap) {
    await refreshProvisionalMonthlySnapshot(organizationId, period);
    snap = await getMonthlySnapshot(organizationId, period);
  }
  if (!snap) return [];

  const marketerRows = snap.rows
    .filter((r) => r.ranking_type === 'marketer' && r.rank != null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

  const promoSnap = snap.rows.filter(
    (r) => r.ranking_type === 'promotion' && r.promotion_id && r.rank != null,
  );
  const promoIds = promoSnap.map((r) => r.promotion_id!).filter(Boolean);
  const [titles, promoToMarketer] = await Promise.all([
    fetchPromotionDisplayTitles(promoIds),
    marketerIdByPromotionId(promoIds),
  ]);

  const promosByMarketer = new Map<string, MarketerPromotionSlice[]>();
  for (const r of promoSnap) {
    const pid = r.promotion_id!;
    const mid = promoToMarketer.get(pid);
    if (!mid) continue;
    const list = promosByMarketer.get(mid) ?? [];
    list.push({
      promotionId: pid,
      title: titles.get(pid) || r.entity_name_snapshot || pid,
      revenue: Number(r.revenue) || 0,
    });
    promosByMarketer.set(mid, list);
  }

  return marketerRows.map((r) => {
    const mid = r.marketer_id ?? '';
    const promotions = (promosByMarketer.get(mid) ?? []).sort((a, b) => b.revenue - a.revenue);
    return {
      marketerId: mid,
      marketerName: r.entity_name_snapshot ?? mid,
      promotions,
      revenue: Number(r.revenue) || 0,
      clicks: Number(r.clicks) || 0,
      sessions: 0,
      conversions: Number(r.conversions) || 0,
      rpc: Number(r.rpc) || 0,
    };
  });
}

export async function getTopMarketersAnalytics(
  params: TopMarketersParams,
): Promise<MarketerRow[]> {
  const { organizationId, preset, customRange, forceRefresh = false } = params;
  if (!organizationId) return [];

  const period = windowForPreset(preset, customRange ?? null);
  return loadWindowMarketerRows(organizationId, period, forceRefresh);
}
