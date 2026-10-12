/**
 * getTopPromotionsAnalytics.ts
 *
 * Top Promotions ranking for Marketplace cards.
 * Formal Revenue only via canonical conversion owners:
 *   ownerPromotionId ← TRUE START A→B redirect_links.promotion_id
 *
 * Data path:
 *   1) Prefer monthly_ranking_snapshots for calendar-month windows
 *   2) If no provisional/finalized snapshot for the resolved month → compute
 *      via monthlyRankingSnapshots (resolveConversionOwners) and save provisional
 *   3) Non-month presets (last_7_days, etc.) compute live for that window
 *      without inventing a second attribution formula
 *
 * Does NOT use legacy promotion-level metric rollups.
 */

import {
  computeMonthlySnapshotPayload,
  getMonthlySnapshot,
  refreshProvisionalMonthlySnapshot,
  utcMonthPeriod,
  utcMonthPeriodFromDate,
  type MonthPeriod,
  type RankingEntityRow,
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

function periodForPreset(
  preset: TopPromotionsPreset,
  customRange?: { start: Date; end: Date } | null,
): { mode: 'month'; period: MonthPeriod } | { mode: 'range'; start: Date; end: Date } {
  const now = new Date();
  if (preset === 'this_month') {
    return { mode: 'month', period: utcMonthPeriodFromDate(now) };
  }
  if (preset === 'custom' && customRange?.start && customRange?.end) {
    const s = customRange.start;
    const e = customRange.end;
    // Single UTC calendar month → snapshot path
    if (
      s.getUTCFullYear() === e.getUTCFullYear() &&
      s.getUTCMonth() === e.getUTCMonth() &&
      s.getUTCDate() === 1 &&
      e.getUTCDate() === new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate()
    ) {
      return { mode: 'month', period: utcMonthPeriod(s.getUTCFullYear(), s.getUTCMonth()) };
    }
    return { mode: 'range', start: s, end: e };
  }
  if (preset === 'last_7_days') {
    const end = now;
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 6);
    return { mode: 'range', start, end };
  }
  if (preset === 'last_30_days') {
    const end = now;
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 29);
    return { mode: 'range', start, end };
  }
  if (preset === 'last_12_months') {
    const end = now;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    return { mode: 'range', start, end };
  }
  // all_time — wide range; live compute
  return {
    mode: 'range',
    start: new Date('2020-01-01T00:00:00.000Z'),
    end: now,
  };
}

function rowsFromSnapshotEntities(entities: RankingEntityRow[]): TopPromotionRow[] {
  return entities.map((e) => ({
    promotionId: e.promotionId ?? '',
    title: e.entityName,
    marketer: null,
    revenue: e.revenue,
    clicks: e.clicks,
    sessions: 0,
    conversions: e.conversions,
    rpc: e.rpc,
  }));
}

async function loadMonthPromotionRows(
  organizationId: string,
  period: MonthPeriod,
): Promise<TopPromotionRow[]> {
  let snap = await getMonthlySnapshot(organizationId, period);
  const isCurrentMonth =
    period.periodStart === utcMonthPeriodFromDate(new Date()).periodStart;

  if (!snap && isCurrentMonth) {
    await refreshProvisionalMonthlySnapshot(organizationId, period);
    snap = await getMonthlySnapshot(organizationId, period);
  }

  // Historical month with no snapshot: compute once as provisional (does not touch finalized)
  if (!snap) {
    await refreshProvisionalMonthlySnapshot(organizationId, period);
    snap = await getMonthlySnapshot(organizationId, period);
  }

  if (!snap) return [];

  const promoRows = snap.rows
    .filter((r) => r.ranking_type === 'promotion' && r.rank != null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

  return promoRows.map((r) => ({
    promotionId: r.promotion_id ?? '',
    title: r.entity_name_snapshot ?? r.promotion_id ?? '',
    marketer: null,
    revenue: Number(r.revenue) || 0,
    clicks: Number(r.clicks) || 0,
    sessions: 0,
    conversions: Number(r.conversions) || 0,
    rpc: Number(r.rpc) || 0,
  }));
}

/** Live range: same canonical owners, no second formula. */
async function computePromotionRowsForRange(
  organizationId: string,
  start: Date,
  end: Date,
): Promise<TopPromotionRow[]> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [stripeRes, pixelRes] = await Promise.all([
    supabase
      .from('stripe_purchases')
      .select(
        'id, session_id, token, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id',
      )
      .eq('organization_id', organizationId)
      .gte('created_at', startIso)
      .lte('created_at', endIso),
    supabase
      .from('pixel_purchases')
      .select(
        'id, event_id, session_id, video_id, campaign_id, amount, event_type, created_at, asset_id, organization_id, promotion_id',
      )
      .eq('organization_id', organizationId)
      .gte('created_at', startIso)
      .lte('created_at', endIso),
  ]);

  if (stripeRes.error) throw new Error(stripeRes.error.message);
  if (pixelRes.error) throw new Error(pixelRes.error.message);

  const resolved = await resolveConversionOwners({
    stripePurchases: (stripeRes.data ?? []) as any,
    pixelPurchases: (pixelRes.data ?? []) as any,
  });

  const byPromo = new Map<string, { revenue: number; conversions: number }>();
  resolved.byKey.forEach((r) => {
    if (r.attributionReason === 'uncounted' || r.suppressedByStripeId) return;
    const amount = typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount ?? 0));
    if (!(amount > 0) || !r.ownerPromotionId) return;
    const a = byPromo.get(r.ownerPromotionId) ?? { revenue: 0, conversions: 0 };
    a.revenue += amount;
    a.conversions += 1;
    byPromo.set(r.ownerPromotionId, a);
  });

  const sorted = [...byPromo.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10);

  const ids = sorted.map(([id]) => id);
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from('promotions').select('id, title').in('id', ids);
    for (const row of data ?? []) {
      names.set((row as any).id, (row as any).title ?? (row as any).id);
    }
  }

  return sorted.map(([id, a]) => ({
    promotionId: id,
    title: names.get(id) ?? id,
    marketer: null,
    revenue: a.revenue,
    clicks: 0,
    sessions: 0,
    conversions: a.conversions,
    rpc: 0,
  }));
}

export async function getTopPromotionsAnalytics(
  params: TopPromotionsParams,
): Promise<TopPromotionRow[]> {
  const { organizationId, preset, customRange } = params;
  if (!organizationId) return [];

  const window = periodForPreset(preset, customRange ?? null);

  if (window.mode === 'month') {
    return loadMonthPromotionRows(organizationId, window.period);
  }

  return computePromotionRowsForRange(organizationId, window.start, window.end);
}
