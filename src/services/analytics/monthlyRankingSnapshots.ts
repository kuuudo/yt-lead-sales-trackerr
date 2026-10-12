/**
 * monthlyRankingSnapshots.ts
 *
 * Persist monthly Total Revenue + Top 10 Marketer / Top 10 Promotion rankings.
 * Snapshot of canonical conversion attribution — NOT a second attribution engine.
 *
 * Revenue dimensions:
 *   Total  — sum of formal conversion amounts once (not sum of Top 10)
 *   Promotion — ConversionOwnerResult.ownerPromotionId (TRUE START hop link)
 *   Marketer  — ConversionOwnerResult.ownerMarketerId (promotion collaborator)
 *
 * Lifecycle:
 *   provisional — replaceable for the same org + calendar month
 *   finalized   — read-only for ordinary refresh; restatement bumps snapshot_version
 *
 * Timezone: UTC calendar months unless callers pass explicit period bounds.
 */

import { supabase } from '../../lib/supabase';
import {
  resolveConversionOwners,
  type ConversionOwnerResult,
  type StripePurchaseOwnerInput,
  type PixelPurchaseOwnerInput,
} from '../attribution/resolveConversionOwners';

export type RankingType = 'total_revenue' | 'marketer' | 'promotion';
export type SnapshotStatus = 'provisional' | 'finalized';

export const TOP_N = 10;

export interface MonthPeriod {
  /** Inclusive first day of month (UTC date). */
  periodStart: string; // YYYY-MM-DD
  /** Inclusive last day of month (UTC date). */
  periodEnd: string; // YYYY-MM-DD
}

export interface RankingEntityRow {
  rank: number;
  marketerId?: string | null;
  promotionId?: string | null;
  entityName: string;
  revenue: number;
  conversions: number;
  clicks: number;
  rpc: number;
}

export interface MonthlySnapshotPayload {
  organizationId: string;
  period: MonthPeriod;
  totalRevenue: number;
  totalConversions: number;
  totalClicks: number;
  totalRpc: number;
  topMarketers: RankingEntityRow[];
  topPromotions: RankingEntityRow[];
  computedAt: string;
}

export interface SnapshotRow {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  ranking_type: RankingType;
  rank: number | null;
  marketer_id: string | null;
  promotion_id: string | null;
  entity_name_snapshot: string | null;
  revenue: number;
  conversions: number;
  clicks: number;
  rpc: number;
  snapshot_at: string;
  status: SnapshotStatus;
  snapshot_version: number;
}

// ── Period helpers (UTC calendar month) ─────────────────────────────────────

export function utcMonthPeriod(year: number, monthIndex0: number): MonthPeriod {
  const start = new Date(Date.UTC(year, monthIndex0, 1));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

export function utcMonthPeriodFromDate(d: Date): MonthPeriod {
  return utcMonthPeriod(d.getUTCFullYear(), d.getUTCMonth());
}

function periodBoundsIso(period: MonthPeriod): { startIso: string; endIso: string } {
  return {
    startIso: `${period.periodStart}T00:00:00.000Z`,
    endIso: `${period.periodEnd}T23:59:59.999Z`,
  };
}

// ── Fetch org purchases for the month ───────────────────────────────────────

const STRIPE_COLUMNS =
  'id, session_id, token, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id';
const PIXEL_COLUMNS =
  'id, event_id, session_id, video_id, campaign_id, amount, event_type, created_at, asset_id, organization_id, promotion_id';

const PAGE = 1000;

async function fetchPaged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function fetchOrgPurchasesForPeriod(
  organizationId: string,
  period: MonthPeriod,
): Promise<{ stripe: StripePurchaseOwnerInput[]; pixel: PixelPurchaseOwnerInput[] }> {
  const { startIso, endIso } = periodBoundsIso(period);

  const [stripe, pixel] = await Promise.all([
    fetchPaged<StripePurchaseOwnerInput>((from, to) =>
      supabase
        .from('stripe_purchases')
        .select(STRIPE_COLUMNS)
        .eq('organization_id', organizationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchPaged<PixelPurchaseOwnerInput>((from, to) =>
      supabase
        .from('pixel_purchases')
        .select(PIXEL_COLUMNS)
        .eq('organization_id', organizationId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  return { stripe, pixel };
}

function isFormal(r: ConversionOwnerResult): boolean {
  return r.attributionReason !== 'uncounted' && !r.suppressedByStripeId;
}

function parseAmount(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

// ── Aggregate from canonical owners ─────────────────────────────────────────

interface Agg {
  revenue: number;
  conversions: number;
  clicks: number;
}

function rpcOf(a: Agg): number {
  return a.clicks > 0 ? Number((a.revenue / a.clicks).toFixed(4)) : 0;
}

/**
 * Build snapshot payload from canonical resolveConversionOwners.
 * Clicks are left at 0 in this path (canonical owner layer is conversion/revenue focused).
 * Ranking metric for Top 10 is revenue; clicks/rpc stored for display compatibility.
 */
export async function computeMonthlySnapshotPayload(
  organizationId: string,
  period: MonthPeriod,
): Promise<MonthlySnapshotPayload> {
  const { stripe, pixel } = await fetchOrgPurchasesForPeriod(organizationId, period);
  const resolved = await resolveConversionOwners({
    stripePurchases: stripe,
    pixelPurchases: pixel,
  });

  const formal: ConversionOwnerResult[] = [];
  resolved.byKey.forEach((r) => {
    if (isFormal(r) && parseAmount(r.amount) > 0) formal.push(r);
  });

  const total: Agg = { revenue: 0, conversions: 0, clicks: 0 };
  const byPromotion = new Map<string, Agg>();
  const byMarketer = new Map<string, Agg>();

  for (const r of formal) {
    const amount = parseAmount(r.amount);
    total.revenue += amount;
    total.conversions += 1;

    if (r.ownerPromotionId) {
      const a = byPromotion.get(r.ownerPromotionId) ?? { revenue: 0, conversions: 0, clicks: 0 };
      a.revenue += amount;
      a.conversions += 1;
      byPromotion.set(r.ownerPromotionId, a);
    }
    if (r.ownerMarketerId) {
      const a = byMarketer.get(r.ownerMarketerId) ?? { revenue: 0, conversions: 0, clicks: 0 };
      a.revenue += amount;
      a.conversions += 1;
      byMarketer.set(r.ownerMarketerId, a);
    }
  }

  const topPromotionIds = [...byPromotion.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue || a[0].localeCompare(b[0]))
    .slice(0, TOP_N)
    .map(([id]) => id);

  const topMarketerIds = [...byMarketer.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue || a[0].localeCompare(b[0]))
    .slice(0, TOP_N)
    .map(([id]) => id);

  const [promoNames, marketerNames] = await Promise.all([
    fetchPromotionDisplayTitles(topPromotionIds),
    fetchNames('profiles', 'id', 'full_name', topMarketerIds),
  ]);

  const topPromotions: RankingEntityRow[] = topPromotionIds.map((id, i) => {
    const a = byPromotion.get(id)!;
    return {
      rank: i + 1,
      promotionId: id,
      entityName: promoNames.get(id) ?? id,
      revenue: a.revenue,
      conversions: a.conversions,
      clicks: a.clicks,
      rpc: rpcOf(a),
    };
  });

  const topMarketers: RankingEntityRow[] = topMarketerIds.map((id, i) => {
    const a = byMarketer.get(id)!;
    return {
      rank: i + 1,
      marketerId: id,
      entityName: marketerNames.get(id) ?? id,
      revenue: a.revenue,
      conversions: a.conversions,
      clicks: a.clicks,
      rpc: rpcOf(a),
    };
  });

  return {
    organizationId,
    period,
    totalRevenue: total.revenue,
    totalConversions: total.conversions,
    totalClicks: total.clicks,
    totalRpc: rpcOf(total),
    topMarketers,
    topPromotions,
    computedAt: new Date().toISOString(),
  };
}

async function fetchNames(
  table: string,
  idCol: string,
  nameCol: string,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from(table).select(`${idCol}, ${nameCol}`).in(idCol, ids);
  if (error) {
    console.warn(`[monthlyRankingSnapshots] name fetch ${table} failed:`, error.message);
    return out;
  }
  for (const row of data ?? []) {
    const id = (row as Record<string, string>)[idCol];
    const name = (row as Record<string, string | null>)[nameCol];
    if (id) out.set(id, name && String(name).trim() ? String(name) : id);
  }
  return out;
}

/**
 * Display name for a promotion: prefer assignments.title via promotions.assignment_id.
 * promotions.title is often a short code (e.g. "3") and is only a fallback.
 */
export async function fetchPromotionDisplayTitles(
  promotionIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(promotionIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const { data: promos, error } = await supabase
    .from('promotions')
    .select('id, title, assignment_id')
    .in('id', ids);
  if (error) {
    console.warn('[monthlyRankingSnapshots] promotions title fetch failed:', error.message);
    return out;
  }

  const assignmentIds = (promos ?? [])
    .map((p: { assignment_id?: string | null }) => p.assignment_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const assignmentTitle = new Map<string, string>();
  if (assignmentIds.length > 0) {
    const { data: assignments, error: aErr } = await supabase
      .from('assignments')
      .select('id, title')
      .in('id', assignmentIds);
    if (aErr) {
      console.warn('[monthlyRankingSnapshots] assignments title fetch failed:', aErr.message);
    } else {
      for (const a of assignments ?? []) {
        const row = a as { id: string; title?: string | null };
        if (row.id && row.title && String(row.title).trim()) {
          assignmentTitle.set(row.id, String(row.title).trim());
        }
      }
    }
  }

  for (const p of promos ?? []) {
    const row = p as { id: string; title?: string | null; assignment_id?: string | null };
    if (!row.id) continue;
    const fromAssignment =
      row.assignment_id && assignmentTitle.has(row.assignment_id)
        ? assignmentTitle.get(row.assignment_id)!
        : null;
    const fromPromo = row.title && String(row.title).trim() ? String(row.title).trim() : null;
    out.set(row.id, fromAssignment || fromPromo || row.id);
  }
  return out;
}

/**
 * Ensure the current UTC month has a provisional snapshot (writes rows).
 * Safe to call from Top* loaders; surfaces errors to the console.
 */
export async function ensureCurrentMonthProvisional(organizationId: string): Promise<void> {
  const period = utcMonthPeriodFromDate(new Date());
  console.log('[monthlyRankingSnapshots] ensureCurrentMonthProvisional', {
    organizationId,
    period,
  });
  try {
    const payload = await refreshProvisionalMonthlySnapshot(organizationId, period);
    console.log('[monthlyRankingSnapshots] provisional saved', {
      organizationId,
      period,
      totalRevenue: payload.totalRevenue,
      topMarketers: payload.topMarketers.length,
      topPromotions: payload.topPromotions.length,
    });
  } catch (e) {
    console.error('[monthlyRankingSnapshots] ensureCurrentMonthProvisional FAILED', e);
    throw e;
  }
}

// ── Persist provisional (atomic replace) ────────────────────────────────────

/**
 * Replace all provisional rows for this org + month with a fresh computation.
 * Does not touch finalized rows.
 */
export async function refreshProvisionalMonthlySnapshot(
  organizationId: string,
  period: MonthPeriod,
): Promise<MonthlySnapshotPayload> {
  const payload = await computeMonthlySnapshotPayload(organizationId, period);
  await saveProvisionalSnapshot(payload);
  return payload;
}

export async function saveProvisionalSnapshot(payload: MonthlySnapshotPayload): Promise<void> {
  const { organizationId, period } = payload;
  const snapshotAt = payload.computedAt;

  // Delete existing provisional set for this org/month, then insert full set.
  const { error: delErr } = await supabase
    .from('monthly_ranking_snapshots')
    .delete()
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .eq('status', 'provisional');

  if (delErr) {
    throw new Error(`monthlyRankingSnapshots: delete provisional failed — ${delErr.message}`);
  }

  const rows: Record<string, unknown>[] = [];

  rows.push({
    organization_id: organizationId,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    ranking_type: 'total_revenue',
    rank: null,
    marketer_id: null,
    promotion_id: null,
    entity_name_snapshot: 'Total Revenue',
    revenue: payload.totalRevenue,
    conversions: payload.totalConversions,
    clicks: payload.totalClicks,
    rpc: payload.totalRpc,
    snapshot_at: snapshotAt,
    status: 'provisional',
    snapshot_version: 1,
  });

  for (const m of payload.topMarketers) {
    rows.push({
      organization_id: organizationId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      ranking_type: 'marketer',
      rank: m.rank,
      marketer_id: m.marketerId ?? null,
      promotion_id: null,
      entity_name_snapshot: m.entityName,
      revenue: m.revenue,
      conversions: m.conversions,
      clicks: m.clicks,
      rpc: m.rpc,
      snapshot_at: snapshotAt,
      status: 'provisional',
      snapshot_version: 1,
    });
  }

  for (const p of payload.topPromotions) {
    rows.push({
      organization_id: organizationId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      ranking_type: 'promotion',
      rank: p.rank,
      marketer_id: null,
      promotion_id: p.promotionId ?? null,
      entity_name_snapshot: p.entityName,
      revenue: p.revenue,
      conversions: p.conversions,
      clicks: p.clicks,
      rpc: p.rpc,
      snapshot_at: snapshotAt,
      status: 'provisional',
      snapshot_version: 1,
    });
  }

  if (rows.length === 0) return;

  const { error: insErr } = await supabase.from('monthly_ranking_snapshots').insert(rows);
  if (insErr) {
    throw new Error(`monthlyRankingSnapshots: insert provisional failed — ${insErr.message}`);
  }
}

/**
 * Finalize the current provisional snapshot for a month.
 * Refuses if a finalized version already exists (use restateFinalizedMonth for corrections).
 */
export async function finalizeMonthlySnapshot(
  organizationId: string,
  period: MonthPeriod,
): Promise<void> {
  const { data: existingFinal, error: exErr } = await supabase
    .from('monthly_ranking_snapshots')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .eq('status', 'finalized')
    .limit(1);

  if (exErr) throw new Error(exErr.message);
  if (existingFinal && existingFinal.length > 0) {
    throw new Error(
      'monthlyRankingSnapshots: finalized snapshot already exists for this month; use restateFinalizedMonth',
    );
  }

  const { error } = await supabase
    .from('monthly_ranking_snapshots')
    .update({ status: 'finalized', updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .eq('status', 'provisional');

  if (error) throw new Error(`monthlyRankingSnapshots: finalize failed — ${error.message}`);
}

/**
 * Explicit correction: compute a new payload, write as finalized with snapshot_version = max+1.
 * Does not delete prior finalized versions (audit trail).
 */
export async function restateFinalizedMonth(
  organizationId: string,
  period: MonthPeriod,
): Promise<MonthlySnapshotPayload> {
  const payload = await computeMonthlySnapshotPayload(organizationId, period);

  const { data: vers, error: vErr } = await supabase
    .from('monthly_ranking_snapshots')
    .select('snapshot_version')
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .eq('status', 'finalized')
    .order('snapshot_version', { ascending: false })
    .limit(1);

  if (vErr) throw new Error(vErr.message);
  const nextVersion = ((vers?.[0] as { snapshot_version?: number } | undefined)?.snapshot_version ?? 0) + 1;
  const snapshotAt = payload.computedAt;

  const rows: Record<string, unknown>[] = [
    {
      organization_id: organizationId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      ranking_type: 'total_revenue',
      rank: null,
      marketer_id: null,
      promotion_id: null,
      entity_name_snapshot: 'Total Revenue',
      revenue: payload.totalRevenue,
      conversions: payload.totalConversions,
      clicks: payload.totalClicks,
      rpc: payload.totalRpc,
      snapshot_at: snapshotAt,
      status: 'finalized',
      snapshot_version: nextVersion,
    },
  ];

  for (const m of payload.topMarketers) {
    rows.push({
      organization_id: organizationId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      ranking_type: 'marketer',
      rank: m.rank,
      marketer_id: m.marketerId ?? null,
      promotion_id: null,
      entity_name_snapshot: m.entityName,
      revenue: m.revenue,
      conversions: m.conversions,
      clicks: m.clicks,
      rpc: m.rpc,
      snapshot_at: snapshotAt,
      status: 'finalized',
      snapshot_version: nextVersion,
    });
  }

  for (const p of payload.topPromotions) {
    rows.push({
      organization_id: organizationId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      ranking_type: 'promotion',
      rank: p.rank,
      marketer_id: null,
      promotion_id: p.promotionId ?? null,
      entity_name_snapshot: p.entityName,
      revenue: p.revenue,
      conversions: p.conversions,
      clicks: p.clicks,
      rpc: p.rpc,
      snapshot_at: snapshotAt,
      status: 'finalized',
      snapshot_version: nextVersion,
    });
  }

  const { error } = await supabase.from('monthly_ranking_snapshots').insert(rows);
  if (error) throw new Error(`monthlyRankingSnapshots: restate failed — ${error.message}`);
  return payload;
}

/**
 * Read snapshot for a month.
 * Prefer latest finalized; if none, return provisional (current open month).
 */
export async function getMonthlySnapshot(
  organizationId: string,
  period: MonthPeriod,
): Promise<{ status: SnapshotStatus; version: number; rows: SnapshotRow[] } | null> {
  const { data: finalized, error: fErr } = await supabase
    .from('monthly_ranking_snapshots')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .eq('status', 'finalized')
    .order('snapshot_version', { ascending: false });

  if (fErr) throw new Error(fErr.message);

  if (finalized && finalized.length > 0) {
    const version = (finalized[0] as SnapshotRow).snapshot_version;
    const rows = (finalized as SnapshotRow[]).filter((r) => r.snapshot_version === version);
    return { status: 'finalized', version, rows };
  }

  const { data: provisional, error: pErr } = await supabase
    .from('monthly_ranking_snapshots')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .eq('status', 'provisional');

  if (pErr) throw new Error(pErr.message);
  if (!provisional || provisional.length === 0) return null;

  return {
    status: 'provisional',
    version: 1,
    rows: provisional as SnapshotRow[],
  };
}
