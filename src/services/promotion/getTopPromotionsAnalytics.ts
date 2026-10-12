/**
 * getTopPromotionsAnalytics.ts
 *
 * Fast path: read monthly_ranking_snapshots when present.
 * Slow path (canonical resolve + write): only when no snapshot rows exist,
 * or when forceRefresh=true (Update button).
 *
 * Display title: assignments.title via promotions.assignment_id (live overlay).
 */

import {
  fetchPromotionDisplayTitles,
  getMonthlySnapshot,
  refreshProvisionalMonthlySnapshot,
  utcMonthPeriod,
  utcMonthPeriodFromDate,
  type MonthPeriod,
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
  /** When true, recompute and replace provisional snapshot for the target month. */
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

/**
 * Prefer calendar-month snapshot reads for common presets so Marketplace stays fast.
 * last_7_days / last_30_days map to the current UTC month snapshot (not a live 20s resolve).
 */
function periodForPreset(
  preset: TopPromotionsPreset,
  customRange?: { start: Date; end: Date } | null,
): { mode: 'month'; period: MonthPeriod } | { mode: 'range'; start: Date; end: Date } {
  const now = new Date();
  if (preset === 'this_month' || preset === 'last_7_days' || preset === 'last_30_days') {
    return { mode: 'month', period: utcMonthPeriodFromDate(now) };
  }
  if (preset === 'custom' && customRange?.start && customRange?.end) {
    const s = customRange.start;
    const e = customRange.end;
    // Any range within one UTC month → that month's snapshot
    if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
      return { mode: 'month', period: utcMonthPeriod(s.getUTCFullYear(), s.getUTCMonth()) };
    }
    return { mode: 'range', start: s, end: e };
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

async function withLivePromotionTitles(rows: TopPromotionRow[]): Promise<TopPromotionRow[]> {
  const ids = rows.map((r) => r.promotionId).filter(Boolean);
  if (ids.length === 0) return rows;
  const titles = await fetchPromotionDisplayTitles(ids);
  return rows.map((r) => ({
    ...r,
    title: titles.get(r.promotionId) || r.title || r.promotionId,
  }));
}

async function loadMonthPromotionRows(
  organizationId: string,
  period: MonthPeriod,
  forceRefresh: boolean,
): Promise<TopPromotionRow[]> {
  console.log('[getTopPromotionsAnalytics] loadMonth', { organizationId, period, forceRefresh });

  if (forceRefresh) {
    await refreshProvisionalMonthlySnapshot(organizationId, period);
  }

  let snap = await getMonthlySnapshot(organizationId, period);

  // Only compute when there is truly no snapshot (first visit / empty month).
  if (!snap) {
    console.log('[getTopPromotionsAnalytics] no snapshot rows — computing once');
    await refreshProvisionalMonthlySnapshot(organizationId, period);
    snap = await getMonthlySnapshot(organizationId, period);
  }

  if (!snap) return [];

  const promoRows = snap.rows
    .filter((r) => r.ranking_type === 'promotion' && r.rank != null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

  const mapped: TopPromotionRow[] = promoRows.map((r) => ({
    promotionId: r.promotion_id ?? '',
    title: r.entity_name_snapshot ?? r.promotion_id ?? '',
    marketer: null,
    revenue: Number(r.revenue) || 0,
    clicks: Number(r.clicks) || 0,
    sessions: 0,
    conversions: Number(r.conversions) || 0,
    rpc: Number(r.rpc) || 0,
  }));

  // Overlay assignment titles so UUID / stale entity_name_snapshot never shows in UI.
  return withLivePromotionTitles(mapped);
}

async function computePromotionRowsForRange(
  organizationId: string,
  start: Date,
  end: Date,
): Promise<TopPromotionRow[]> {
  console.log('[getTopPromotionsAnalytics] live range (no snapshot write)', {
    organizationId,
    start: start.toISOString(),
    end: end.toISOString(),
  });

  const [stripeRes, pixelRes] = await Promise.all([
    supabase
      .from('stripe_purchases')
      .select(
        'id, session_id, token, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id',
      )
      .eq('organization_id', organizationId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()),
    supabase
      .from('pixel_purchases')
      .select(
        'id, event_id, session_id, video_id, campaign_id, amount, event_type, created_at, asset_id, organization_id, promotion_id',
      )
      .eq('organization_id', organizationId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString()),
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

  const titles = await fetchPromotionDisplayTitles(sorted.map(([id]) => id));

  return sorted.map(([id, a]) => ({
    promotionId: id,
    title: titles.get(id) ?? id,
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
  const { organizationId, preset, customRange, forceRefresh = false } = params;
  if (!organizationId) return [];

  const window = periodForPreset(preset, customRange ?? null);

  if (window.mode === 'month') {
    return loadMonthPromotionRows(organizationId, window.period, forceRefresh);
  }

  // Multi-month range: live only (does not rewrite monthly snapshots).
  return computePromotionRowsForRange(organizationId, window.start, window.end);
}
