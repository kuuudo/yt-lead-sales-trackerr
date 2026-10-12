/**
 * getTopMarketersAnalytics.ts
 *
 * Top Marketers ranking for Marketplace cards.
 * Formal Revenue only via canonical conversion owners:
 *   ownerMarketerId ← promotion.assignment_collaborator_id → assignment_collaborators.user_id
 *
 * Same snapshot path as getTopPromotionsAnalytics — not legacy promotion rollups.
 */

import {
  getMonthlySnapshot,
  refreshProvisionalMonthlySnapshot,
  utcMonthPeriod,
  utcMonthPeriodFromDate,
  type MonthPeriod,
} from '../analytics/monthlyRankingSnapshots';
import { resolveConversionOwners } from '../attribution/resolveConversionOwners';
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
}

export function rankTopMarketers(rows: MarketerRow[], metric: TopMarketersMetric): MarketerRow[] {
  return [...rows].sort((a, b) => {
    const dv = (b[metric] ?? 0) - (a[metric] ?? 0);
    if (dv !== 0) return dv;
    return a.marketerName.localeCompare(b.marketerName);
  });
}

function periodForPreset(
  preset: TopMarketersPreset,
  customRange?: { start: Date; end: Date } | null,
): { mode: 'month'; period: MonthPeriod } | { mode: 'range'; start: Date; end: Date } {
  const now = new Date();
  if (preset === 'this_month') {
    return { mode: 'month', period: utcMonthPeriodFromDate(now) };
  }
  if (preset === 'custom' && customRange?.start && customRange?.end) {
    const s = customRange.start;
    const e = customRange.end;
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
    return {
      mode: 'range',
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)),
      end: now,
    };
  }
  return {
    mode: 'range',
    start: new Date('2020-01-01T00:00:00.000Z'),
    end: now,
  };
}

async function loadMonthMarketerRows(
  organizationId: string,
  period: MonthPeriod,
): Promise<MarketerRow[]> {
  let snap = await getMonthlySnapshot(organizationId, period);
  if (!snap) {
    await refreshProvisionalMonthlySnapshot(organizationId, period);
    snap = await getMonthlySnapshot(organizationId, period);
  }
  if (!snap) return [];

  const marketerRows = snap.rows
    .filter((r) => r.ranking_type === 'marketer' && r.rank != null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

  // Snapshot stores marketer aggregates only; expand list stays empty unless we attach promotions later
  return marketerRows.map((r) => ({
    marketerId: r.marketer_id ?? '',
    marketerName: r.entity_name_snapshot ?? r.marketer_id ?? '',
    promotions: [],
    revenue: Number(r.revenue) || 0,
    clicks: Number(r.clicks) || 0,
    sessions: 0,
    conversions: Number(r.conversions) || 0,
    rpc: Number(r.rpc) || 0,
  }));
}

async function computeMarketerRowsForRange(
  organizationId: string,
  start: Date,
  end: Date,
): Promise<MarketerRow[]> {
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

  const byMarketer = new Map<
    string,
    { revenue: number; conversions: number; byPromo: Map<string, number> }
  >();

  resolved.byKey.forEach((r) => {
    if (r.attributionReason === 'uncounted' || r.suppressedByStripeId) return;
    const amount = typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount ?? 0));
    if (!(amount > 0) || !r.ownerMarketerId) return;
    const bucket =
      byMarketer.get(r.ownerMarketerId) ?? {
        revenue: 0,
        conversions: 0,
        byPromo: new Map<string, number>(),
      };
    bucket.revenue += amount;
    bucket.conversions += 1;
    if (r.ownerPromotionId) {
      bucket.byPromo.set(
        r.ownerPromotionId,
        (bucket.byPromo.get(r.ownerPromotionId) ?? 0) + amount,
      );
    }
    byMarketer.set(r.ownerMarketerId, bucket);
  });

  const sorted = [...byMarketer.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10);

  const marketerIds = sorted.map(([id]) => id);
  const allPromoIds = new Set<string>();
  for (const [, b] of sorted) {
    for (const pid of b.byPromo.keys()) allPromoIds.add(pid);
  }

  const names = new Map<string, string>();
  if (marketerIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', marketerIds);
    for (const row of data ?? []) {
      names.set((row as any).id, (row as any).full_name ?? (row as any).id);
    }
  }

  const promoTitles = new Map<string, string>();
  if (allPromoIds.size > 0) {
    const { data } = await supabase
      .from('promotions')
      .select('id, title')
      .in('id', Array.from(allPromoIds));
    for (const row of data ?? []) {
      promoTitles.set((row as any).id, (row as any).title ?? (row as any).id);
    }
  }

  return sorted.map(([id, b]) => ({
    marketerId: id,
    marketerName: names.get(id) ?? id,
    promotions: [...b.byPromo.entries()]
      .sort((a, c) => c[1] - a[1])
      .map(([promotionId, revenue]) => ({
        promotionId,
        title: promoTitles.get(promotionId) ?? promotionId,
        revenue,
      })),
    revenue: b.revenue,
    clicks: 0,
    sessions: 0,
    conversions: b.conversions,
    rpc: 0,
  }));
}

export async function getTopMarketersAnalytics(
  params: TopMarketersParams,
): Promise<MarketerRow[]> {
  const { organizationId, preset, customRange } = params;
  if (!organizationId) return [];

  const window = periodForPreset(preset, customRange ?? null);

  if (window.mode === 'month') {
    return loadMonthMarketerRows(organizationId, window.period);
  }

  return computeMarketerRowsForRange(organizationId, window.start, window.end);
}
