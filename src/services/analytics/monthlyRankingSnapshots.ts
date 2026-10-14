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

export type RankingType = 'total_revenue' | 'marketer' | 'promotion' | 'asset';
export type SnapshotStatus = 'provisional' | 'finalized';
/** Preset key stored on each snapshot row (supports multiple windows per org). */
export type RankingWindow =
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_12_months'
  | 'all_time'
  | 'custom';

/** Asset ranking list scope (only on ranking_type = 'asset' rows). */
/**
 * Matches All Assets / JourneyAnalytics classification:
 *   my | assigned | shared (org-boundary: asset.organization_id !== viewer org)
 */
export type RankingScope = 'my' | 'assigned' | 'shared';

/**
 * Rolling windows keep exactly ONE provisional batch per org + window
 * (and per ranking_scope for assets). Reads ignore period_start drift.
 */
export const ROLLING_WINDOWS: RankingWindow[] = [
  'last_7_days',
  'last_30_days',
  'last_12_months',
  'all_time',
];

export const TOP_N = 10;

export interface MonthPeriod {
  /** Inclusive start date (UTC YYYY-MM-DD). */
  periodStart: string;
  /** Inclusive end date (UTC YYYY-MM-DD). */
  periodEnd: string;
  /** Which UI preset this window belongs to. */
  rankingWindow?: RankingWindow;
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
  rankingWindow: RankingWindow;
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
  ranking_window?: string | null;
  ranking_scope?: string | null;
  rank: number | null;
  marketer_id: string | null;
  promotion_id: string | null;
  asset_id?: string | null;
  entity_name_snapshot: string | null;
  revenue: number;
  conversions: number;
  clicks: number;
  rpc: number;
  snapshot_at: string;
  status: SnapshotStatus;
  snapshot_version: number;
}

export interface AssetRankingEntityRow {
  rank: number;
  assetId: string;
  entityName: string;
  revenue: number;
  conversions: number;
  clicks: number;
  rpc: number;
  thumbnailUrl?: string | null;
  assetType?: string | null;
}

export interface AssetSnapshotPayload {
  organizationId: string;
  period: MonthPeriod;
  rankingWindow: RankingWindow;
  rankingScope: RankingScope;
  topAssets: AssetRankingEntityRow[];
  computedAt: string;
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
    rankingWindow: period.rankingWindow ?? 'this_month',
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

  // Prefer nested assignment title when FK is exposed to PostgREST.
  const { data: nested, error: nestedErr } = await supabase
    .from('promotions')
    .select('id, assignment_id, assignments:assignment_id ( id, title )')
    .in('id', ids);

  if (!nestedErr && nested && nested.length > 0) {
    for (const p of nested as any[]) {
      if (!p?.id) continue;
      const asg = Array.isArray(p.assignments) ? p.assignments[0] : p.assignments;
      const fromAsg =
        (asg?.title && String(asg.title).trim()) ||
        (asg?.name && String(asg.name).trim()) ||
        null;
      const fromPromo = p.title && String(p.title).trim() ? String(p.title).trim() : null;
      // Assignment title wins even when numeric (e.g. "53535").
      out.set(p.id, fromAsg || fromPromo || p.id);
    }
    console.log('[monthlyRankingSnapshots] promotion titles (nested)', {
      count: out.size,
      sample: [...out.entries()].slice(0, 3),
    });
    return out;
  }

  if (nestedErr) {
    console.warn(
      '[monthlyRankingSnapshots] nested assignment title failed, falling back:',
      nestedErr.message,
    );
  }

  const { data: promos, error } = await supabase
    .from('promotions')
    .select('id, assignment_id')
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
    // Try title then name column variants
    let assignments: { id: string; title?: string | null; name?: string | null }[] = [];
    const try1 = await supabase.from('assignments').select('id, title').in('id', assignmentIds);
    if (!try1.error && try1.data) {
      assignments = try1.data as any[];
    } else {
      const try2 = await supabase.from('assignments').select('id, name').in('id', assignmentIds);
      if (!try2.error && try2.data) assignments = try2.data as any[];
      else if (try1.error) {
        console.warn('[monthlyRankingSnapshots] assignments fetch failed:', try1.error.message);
      }
    }
    for (const a of assignments) {
      const label =
        (a.title && String(a.title).trim()) || (a.name && String(a.name).trim()) || null;
      if (a.id && label) assignmentTitle.set(a.id, label);
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
    // Assignment title wins (including numeric titles like "53535").
    out.set(row.id, fromAssignment || fromPromo || row.id);
  }

  console.log('[monthlyRankingSnapshots] promotion titles (fallback)', {
    count: out.size,
    assignmentHits: assignmentTitle.size,
    sample: [...out.entries()].slice(0, 3),
  });
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
  const rankingWindow = payload.rankingWindow ?? period.rankingWindow ?? 'this_month';
  const snapshotAt = payload.computedAt;

  // Delete only Total / Marketer / Promotion provisional rows for this window.
  // Never touch ranking_type = 'asset' (isolated asset ranking batches).
  let del = supabase
    .from('monthly_ranking_snapshots')
    .delete()
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .eq('status', 'provisional')
    .eq('ranking_window', rankingWindow)
    .neq('ranking_type', 'asset');

  const { error: delErr } = await del;

  if (delErr) {
    throw new Error(`monthlyRankingSnapshots: delete provisional failed — ${delErr.message}`);
  }

  const rows: Record<string, unknown>[] = [];

  rows.push({
    organization_id: organizationId,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    ranking_type: 'total_revenue',
    ranking_window: rankingWindow,
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
      ranking_window: rankingWindow,
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
      ranking_window: rankingWindow,
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
  const rankingWindow = period.rankingWindow ?? 'this_month';

  let finQ = supabase
    .from('monthly_ranking_snapshots')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .eq('status', 'finalized')
    .eq('ranking_window', rankingWindow)
    .order('snapshot_version', { ascending: false });

  const { data: finalized, error: fErr } = await finQ;

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
    .eq('ranking_window', rankingWindow)
    .eq('status', 'provisional');

  if (pErr) throw new Error(pErr.message);
  if (!provisional || provisional.length === 0) return null;

  return {
    status: 'provisional',
    version: 1,
    rows: provisional as SnapshotRow[],
  };
}

// ── Asset ranking (isolated from Total / Marketer / Promotion) ───────────────

async function resolveMyAssetIds(organizationId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('assets')
    .select('id')
    .eq('organization_id', organizationId);
  if (error) {
    console.warn('[monthlyRankingSnapshots] my assets query failed:', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: { id: string }) => r.id).filter(Boolean));
}

/**
 * Assigned assets: same signals JourneyAnalytics / All Assets use for isAssigned —
 * promotion-linked assets for this org (assignment_assets) plus assets that appear
 * on creative promotion links. Scope is still restricted to assets the org can read.
 */
async function resolveAssignedAssetIds(organizationId: string): Promise<Set<string>> {
  const { data: promos, error: pErr } = await supabase
    .from('promotions')
    .select('id, assignment_id')
    .eq('organization_id', organizationId);
  if (pErr) {
    console.warn('[monthlyRankingSnapshots] assigned promotions query failed:', pErr.message);
    return new Set();
  }

  const assignmentIds = Array.from(
    new Set(
      (promos ?? [])
        .map((p: { assignment_id?: string | null }) => p.assignment_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );
  const promoIds = (promos ?? []).map((p: { id: string }) => p.id).filter(Boolean);

  const out = new Set<string>();
  for (let i = 0; i < assignmentIds.length; i += 100) {
    const slice = assignmentIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from('assignment_assets')
      .select('asset_id')
      .in('assignment_id', slice);
    if (error) {
      console.warn('[monthlyRankingSnapshots] assignment_assets query failed:', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const id = (row as { asset_id?: string | null }).asset_id;
      if (id) out.add(id);
    }
  }

  // Also count assets referenced by this org's promotion redirect links
  // (covers created_via_creative / promotion-linked assignment without a separate table).
  for (let i = 0; i < promoIds.length; i += 100) {
    const slice = promoIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from('redirect_links')
      .select('asset_id')
      .in('promotion_id', slice)
      .not('asset_id', 'is', null);
    if (error) {
      console.warn('[monthlyRankingSnapshots] assigned redirect_links query failed:', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const id = (row as { asset_id?: string | null }).asset_id;
      if (id) out.add(id);
    }
  }

  // Assigned is an annotation on My (All Assets): keep only org-owned assets.
  const my = await resolveMyAssetIds(organizationId);
  for (const id of [...out]) {
    if (!my.has(id)) out.delete(id);
  }
  return out;
}

/**
 * Shared assets among formal-revenue candidates:
 * asset.organization_id is set and !== viewer org
 * (JourneyAnalytics: else assetScope = 'shared').
 *
 * Only considers asset ids that already have formal ownerAssetId revenue —
 * does not invent rows. Relies on the same assets read path All Assets uses
 * (select by id); if RLS hides an asset, it simply won't classify as shared here.
 */
async function resolveSharedAssetIds(
  organizationId: string,
  candidateAssetIds: string[],
): Promise<Set<string>> {
  const ids = Array.from(new Set(candidateAssetIds.filter(Boolean)));
  const out = new Set<string>();
  if (ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    const { data, error } = await supabase
      .from('assets')
      .select('id, organization_id')
      .in('id', slice);
    if (error) {
      console.warn('[monthlyRankingSnapshots] shared assets query failed:', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; organization_id?: string | null };
      if (!r.id) continue;
      if (r.organization_id && r.organization_id !== organizationId) {
        out.add(r.id);
      }
    }
  }
  return out;
}

/**
 * Campaign-element static thumbs (Vite public/). Matches existing
 * resolveElementThumbnail usage in AllAssetsAnalytics / CampaignStructureMap.
 * Unknown types → null (UI shows package icon), never invent files.
 */
function elementThumbnailPath(elementType: string | null | undefined): string | null {
  const t = (elementType ?? 'landing_page').toLowerCase().trim();
  const map: Record<string, string> = {
    landing_page: '/element-thumbnails/landing_page.jpg',
    lead_magnet: '/element-thumbnails/lead_magnet.jpg',
    newsletter: '/element-thumbnails/newsletter.jpg',
    sales_call: '/element-thumbnails/sales_call.jpg',
    sales: '/element-thumbnails/sales_call.jpg',
    consultation: '/element-thumbnails/consultation.jpg',
    consult: '/element-thumbnails/consultation.jpg',
    custom_domain: '/element-thumbnails/custom_domain.jpg',
    custom_domain2: '/element-thumbnails/custom_domain2.jpg',
  };
  return map[t] ?? null;
}

export async function fetchAssetDisplayMeta(
  assetIds: string[],
): Promise<Map<string, { title: string; thumbnailUrl: string | null; assetType: string | null }>> {
  const out = new Map<string, { title: string; thumbnailUrl: string | null; assetType: string | null }>();
  const ids = Array.from(new Set(assetIds.filter(Boolean)));
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from('assets')
    .select(
      'id, asset_type, videos(video_title, thumbnail_url, platform), asset_resources(title, thumbnail_url, resource_type, platform), campaign_element_assets(display_name, element_type)',
    )
    .in('id', ids);

  if (error) {
    console.warn('[monthlyRankingSnapshots] asset display meta failed:', error.message);
    for (const id of ids) out.set(id, { title: id, thumbnailUrl: null, assetType: null });
    return out;
  }

  for (const row of data ?? []) {
    const r = row as any;
    const v = Array.isArray(r.videos) ? r.videos[0] : r.videos;
    const res = Array.isArray(r.asset_resources) ? r.asset_resources[0] : r.asset_resources;
    const el = Array.isArray(r.campaign_element_assets)
      ? r.campaign_element_assets[0]
      : r.campaign_element_assets;

    let title: string | null = null;
    let thumbnailUrl: string | null = null;
    if (r.asset_type === 'campaign_element') {
      // Same discriminator as AllAssetsAnalytics assetDisplay map.
      title = el?.display_name ?? null;
      thumbnailUrl = elementThumbnailPath(el?.element_type ?? 'landing_page');
    } else if (r.asset_type === 'resource') {
      title = res?.title ?? null;
      thumbnailUrl = res?.thumbnail_url ?? null;
    } else {
      // Video assets: real YouTube thumb only (no generic fallback).
      title = v?.video_title ?? null;
      thumbnailUrl = v?.thumbnail_url ?? null;
    }

    out.set(r.id, {
      title: (title && String(title).trim()) || r.id,
      thumbnailUrl,
      assetType: r.asset_type ?? null,
    });
  }

  for (const id of ids) {
    if (!out.has(id)) out.set(id, { title: id, thumbnailUrl: null, assetType: null });
  }
  return out;
}

/**
 * Canonical Asset ranking payload: group formal conversions by ownerAssetId,
 * then keep only assets in the requested scope (my | assigned).
 */
export async function computeAssetRankingPayload(
  organizationId: string,
  period: MonthPeriod,
  rankingScope: RankingScope,
): Promise<AssetSnapshotPayload> {
  const { stripe, pixel } = await fetchOrgPurchasesForPeriod(organizationId, period);
  const resolved = await resolveConversionOwners({
    stripePurchases: stripe,
    pixelPurchases: pixel,
  });

  const byAsset = new Map<string, Agg>();
  resolved.byKey.forEach((r) => {
    if (!isFormal(r)) return;
    const amount = parseAmount(r.amount);
    if (!(amount > 0) || !r.ownerAssetId) return;
    const a = byAsset.get(r.ownerAssetId) ?? { revenue: 0, conversions: 0, clicks: 0 };
    a.revenue += amount;
    a.conversions += 1;
    byAsset.set(r.ownerAssetId, a);
  });

  // Scope filter only — does not change ownerAssetId or double-count purchases.
  let scopeIds: Set<string>;
  if (rankingScope === 'assigned') {
    scopeIds = await resolveAssignedAssetIds(organizationId);
  } else if (rankingScope === 'shared') {
    scopeIds = await resolveSharedAssetIds(organizationId, [...byAsset.keys()]);
  } else {
    scopeIds = await resolveMyAssetIds(organizationId);
  }

  const eligible = [...byAsset.entries()].filter(([assetId]) => scopeIds.has(assetId));
  eligible.sort((a, b) => b[1].revenue - a[1].revenue || a[0].localeCompare(b[0]));
  const top = eligible.slice(0, TOP_N);

  const meta = await fetchAssetDisplayMeta(top.map(([id]) => id));

  const topAssets: AssetRankingEntityRow[] = top.map(([id, a], i) => {
    const m = meta.get(id);
    return {
      rank: i + 1,
      assetId: id,
      entityName: m?.title ?? id,
      revenue: a.revenue,
      conversions: a.conversions,
      clicks: a.clicks,
      rpc: rpcOf(a),
      thumbnailUrl: m?.thumbnailUrl ?? null,
      assetType: m?.assetType ?? null,
    };
  });

  return {
    organizationId,
    period,
    rankingWindow: period.rankingWindow ?? 'this_month',
    rankingScope,
    topAssets,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Replace provisional asset rows for ONE scope + window only.
 * Does not delete Total / Marketer / Promotion rows.
 */
export async function saveProvisionalAssetSnapshot(payload: AssetSnapshotPayload): Promise<void> {
  const { organizationId, period, rankingScope } = payload;
  const rankingWindow = payload.rankingWindow ?? period.rankingWindow ?? 'this_month';
  const snapshotAt = payload.computedAt;
  const isRolling = ROLLING_WINDOWS.includes(rankingWindow);

  let del = supabase
    .from('monthly_ranking_snapshots')
    .delete()
    .eq('organization_id', organizationId)
    .eq('status', 'provisional')
    .eq('ranking_type', 'asset')
    .eq('ranking_window', rankingWindow)
    .eq('ranking_scope', rankingScope);

  if (!isRolling) {
    del = del.eq('period_start', period.periodStart);
  }
  if (rankingWindow === 'custom') {
    del = del.eq('period_end', period.periodEnd);
  }

  const { error: delErr } = await del;
  if (delErr) {
    throw new Error(`monthlyRankingSnapshots: delete asset provisional failed — ${delErr.message}`);
  }

  if (payload.topAssets.length === 0) {
    // Still write nothing — empty ranking is valid (no formal asset revenue in scope).
    return;
  }

  const rows = payload.topAssets.map((a) => ({
    organization_id: organizationId,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    ranking_type: 'asset' as const,
    ranking_window: rankingWindow,
    ranking_scope: rankingScope,
    rank: a.rank,
    marketer_id: null,
    promotion_id: null,
    asset_id: a.assetId,
    entity_name_snapshot: a.entityName,
    revenue: a.revenue,
    conversions: a.conversions,
    clicks: a.clicks,
    rpc: a.rpc,
    snapshot_at: snapshotAt,
    status: 'provisional' as const,
    snapshot_version: 1,
  }));

  const { error: insErr } = await supabase.from('monthly_ranking_snapshots').insert(rows);
  if (insErr) {
    throw new Error(`monthlyRankingSnapshots: insert asset provisional failed — ${insErr.message}`);
  }

  if (isRolling) {
    const { error: cleanErr } = await supabase
      .from('monthly_ranking_snapshots')
      .delete()
      .eq('organization_id', organizationId)
      .eq('ranking_window', rankingWindow)
      .eq('ranking_scope', rankingScope)
      .eq('status', 'provisional')
      .eq('ranking_type', 'asset')
      .neq('snapshot_at', snapshotAt);
    if (cleanErr) {
      console.warn('[monthlyRankingSnapshots] asset old provisional cleanup failed:', cleanErr.message);
    }
  }
}

export async function refreshProvisionalAssetSnapshot(
  organizationId: string,
  period: MonthPeriod,
  rankingScope: RankingScope,
): Promise<AssetSnapshotPayload> {
  const payload = await computeAssetRankingPayload(organizationId, period, rankingScope);
  await saveProvisionalAssetSnapshot(payload);
  return payload;
}

/**
 * Read asset ranking snapshot for one scope + window.
 * Prefer finalized; else newest provisional batch (by snapshot_at).
 */
export async function getAssetRankingSnapshot(
  organizationId: string,
  period: MonthPeriod,
  rankingScope: RankingScope,
): Promise<{ status: SnapshotStatus; version: number; rows: SnapshotRow[] } | null> {
  const rankingWindow = period.rankingWindow ?? 'this_month';
  const isRolling = ROLLING_WINDOWS.includes(rankingWindow);
  const isCustom = rankingWindow === 'custom';

  let finQ = supabase
    .from('monthly_ranking_snapshots')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('ranking_window', rankingWindow)
    .eq('ranking_scope', rankingScope)
    .eq('ranking_type', 'asset')
    .eq('status', 'finalized')
    .order('snapshot_version', { ascending: false });
  if (!isRolling) finQ = finQ.eq('period_start', period.periodStart);
  if (isCustom) finQ = finQ.eq('period_end', period.periodEnd);

  const { data: finalized, error: fErr } = await finQ;
  if (fErr) throw new Error(fErr.message);

  if (finalized && finalized.length > 0) {
    const version = (finalized[0] as SnapshotRow).snapshot_version;
    const rows = (finalized as SnapshotRow[]).filter((r) => r.snapshot_version === version);
    return { status: 'finalized', version, rows };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    let latestQ = supabase
      .from('monthly_ranking_snapshots')
      .select('snapshot_at')
      .eq('organization_id', organizationId)
      .eq('ranking_window', rankingWindow)
      .eq('ranking_scope', rankingScope)
      .eq('ranking_type', 'asset')
      .eq('status', 'provisional');
    if (!isRolling) latestQ = latestQ.eq('period_start', period.periodStart);
    if (isCustom) latestQ = latestQ.eq('period_end', period.periodEnd);

    const { data: latest, error: lErr } = await latestQ
      .order('snapshot_at', { ascending: false })
      .limit(1);
    if (lErr) throw new Error(lErr.message);
    if (!latest || latest.length === 0) return null;

    const batchAt = (latest[0] as { snapshot_at: string }).snapshot_at;

    let rowsQ = supabase
      .from('monthly_ranking_snapshots')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('ranking_window', rankingWindow)
      .eq('ranking_scope', rankingScope)
      .eq('ranking_type', 'asset')
      .eq('status', 'provisional')
      .eq('snapshot_at', batchAt);
    if (!isRolling) rowsQ = rowsQ.eq('period_start', period.periodStart);
    if (isCustom) rowsQ = rowsQ.eq('period_end', period.periodEnd);

    const { data: rows, error: rErr } = await rowsQ;
    if (rErr) throw new Error(rErr.message);
    if (rows && rows.length > 0) {
      return { status: 'provisional', version: 1, rows: rows as SnapshotRow[] };
    }
  }
  return null;
}
