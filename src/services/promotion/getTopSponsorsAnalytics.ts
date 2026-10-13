/**
 * getTopSponsorsAnalytics.ts
 *
 * Sponsor View for a marketer: revenue that marketer generated FOR each sponsor org.
 *
 * Source of truth = same formal conversions as Top Marketers / monthly ranking:
 *   resolveConversionOwners → ownerMarketerId + formal amount
 *   stored on sponsor org's monthly_ranking_snapshots (ranking_type = marketer)
 *
 * Example: Ali (sponsor org) sees Webmood $X on Top Marketers.
 *          Webmood opens Sponsor View → Sponsor Ali shows the same $X
 *          for the same reporting period.
 *
 * NOT a second attribution engine. Does not re-derive marketer identity from
 * videos.user_id or promotions.owner_user_id.
 */

import { supabase } from '../../lib/supabase';
import {
  resolveConversionOwners,
  type StripePurchaseOwnerInput,
  type PixelPurchaseOwnerInput,
  type ConversionOwnerResult,
} from '../attribution/resolveConversionOwners';
import {
  getMonthlySnapshot,
  refreshProvisionalMonthlySnapshot,
  utcMonthPeriodFromDate,
  type MonthPeriod,
} from '../analytics/monthlyRankingSnapshots';
import type { TopMarketersPreset } from './getTopMarketersAnalytics';

export type TopSponsorsPreset = TopMarketersPreset;

export interface SponsorPromotionSlice {
  promotionId: string;
  title: string;
  revenue: number;
}

export interface SponsorRow {
  /** Sponsor organization id (Ali's org, not the marketer's). */
  sponsorOrganizationId: string;
  sponsorName: string;
  revenue: number;
  conversions: number;
  clicks: number;
  rpc: number;
  promotions: SponsorPromotionSlice[];
}

export interface TopSponsorsParams {
  /** Logged-in marketer user id (assignment_collaborators.user_id). */
  marketerUserId: string;
  preset: TopSponsorsPreset;
  customRange?: { start: Date; end: Date } | null;
  forceRefresh?: boolean;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function windowForPreset(
  preset: TopSponsorsPreset,
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

function parseAmount(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function isFormal(r: ConversionOwnerResult): boolean {
  return r.attributionReason !== 'uncounted' && !r.suppressedByStripeId;
}

/**
 * Sponsor orgs where this user is the assigned marketer
 * (promotions.assignment_collaborator_id → assignment_collaborators.user_id).
 * Distinct by organization_id so Ali and Sponsor B stay separate.
 */
export async function listSponsorOrganizationsForMarketer(
  marketerUserId: string,
): Promise<{ organizationId: string; name: string }[]> {
  const { data: collabs, error: cErr } = await supabase
    .from('assignment_collaborators')
    .select('id')
    .eq('user_id', marketerUserId);
  if (cErr) throw new Error(`listSponsorOrgs: collaborators — ${cErr.message}`);
  const collabIds = (collabs ?? []).map((c: { id: string }) => c.id).filter(Boolean);
  if (collabIds.length === 0) return [];

  const orgIds = new Set<string>();
  for (let i = 0; i < collabIds.length; i += 100) {
    const slice = collabIds.slice(i, i + 100);
    const { data: promos, error: pErr } = await supabase
      .from('promotions')
      .select('organization_id, assignment_collaborator_id')
      .in('assignment_collaborator_id', slice);
    if (pErr) throw new Error(`listSponsorOrgs: promotions — ${pErr.message}`);
    for (const p of promos ?? []) {
      const oid = (p as { organization_id?: string | null }).organization_id;
      if (oid) orgIds.add(oid);
    }
  }
  if (orgIds.size === 0) return [];

  const ids = Array.from(orgIds);
  const { data: orgs, error: oErr } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', ids);
  if (oErr) {
    // Fallback if name column differs
    const { data: o2, error: e2 } = await supabase.from('organizations').select('id').in('id', ids);
    if (e2) throw new Error(`listSponsorOrgs: organizations — ${e2.message}`);
    return (o2 ?? []).map((o: { id: string }) => ({
      organizationId: o.id,
      name: o.id,
    }));
  }

  const nameById = new Map<string, string>();
  for (const o of orgs ?? []) {
    const row = o as { id: string; name?: string | null };
    nameById.set(row.id, (row.name ?? '').trim() || row.id);
  }

  return ids
    .map((id) => ({ organizationId: id, name: nameById.get(id) ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

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
  const startIso = `${period.periodStart}T00:00:00.000Z`;
  const endIso = `${period.periodEnd}T23:59:59.999Z`;
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

/**
 * Same formal aggregation as monthly ranking for ONE marketer inside a sponsor org.
 * Used when the marketer is outside the stored Top-10 snapshot rows.
 */
async function computeMarketerSliceInOrg(
  organizationId: string,
  period: MonthPeriod,
  marketerUserId: string,
): Promise<{
  revenue: number;
  conversions: number;
  promotions: SponsorPromotionSlice[];
}> {
  const { stripe, pixel } = await fetchOrgPurchasesForPeriod(organizationId, period);
  if (stripe.length === 0 && pixel.length === 0) {
    return { revenue: 0, conversions: 0, promotions: [] };
  }

  const resolved = await resolveConversionOwners({
    stripePurchases: stripe,
    pixelPurchases: pixel,
  });

  let revenue = 0;
  let conversions = 0;
  const byPromo = new Map<string, number>();

  resolved.byKey.forEach((r) => {
    if (!isFormal(r)) return;
    if (r.ownerMarketerId !== marketerUserId) return;
    const amount = parseAmount(r.amount);
    if (!(amount > 0)) return;
    revenue += amount;
    conversions += 1;
    if (r.ownerPromotionId) {
      byPromo.set(r.ownerPromotionId, (byPromo.get(r.ownerPromotionId) ?? 0) + amount);
    }
  });

  const promoIds = [...byPromo.keys()];
  const titles = new Map<string, string>();
  if (promoIds.length > 0) {
    // Prefer assignment title via promotions.assignment_id when available
    const { data } = await supabase
      .from('promotions')
      .select('id, assignment_id')
      .in('id', promoIds);
    const assignmentIds = (data ?? [])
      .map((p: { assignment_id?: string | null }) => p.assignment_id)
      .filter((id): id is string => !!id);
    const titleByAssignment = new Map<string, string>();
    if (assignmentIds.length > 0) {
      const { data: assigns } = await supabase
        .from('assignments')
        .select('id, title')
        .in('id', assignmentIds);
      for (const a of assigns ?? []) {
        const row = a as { id: string; title?: string | null };
        if (row.title) titleByAssignment.set(row.id, row.title);
      }
    }
    for (const p of data ?? []) {
      const row = p as { id: string; assignment_id?: string | null };
      const t = row.assignment_id ? titleByAssignment.get(row.assignment_id) : null;
      titles.set(row.id, t || row.id);
    }
  }

  const promotions: SponsorPromotionSlice[] = [...byPromo.entries()]
    .map(([promotionId, rev]) => ({
      promotionId,
      title: titles.get(promotionId) || promotionId,
      revenue: rev,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return { revenue, conversions, promotions };
}

async function loadSponsorRowForOrg(
  sponsorOrganizationId: string,
  sponsorName: string,
  marketerUserId: string,
  period: MonthPeriod,
  forceRefresh: boolean,
): Promise<SponsorRow> {
  if (forceRefresh) {
    try {
      await refreshProvisionalMonthlySnapshot(sponsorOrganizationId, period);
    } catch (e) {
      console.warn(
        '[getTopSponsorsAnalytics] refresh failed for',
        sponsorOrganizationId,
        e instanceof Error ? e.message : e,
      );
    }
  }

  let snap = await getMonthlySnapshot(sponsorOrganizationId, period);
  if (!snap && !forceRefresh) {
    try {
      await refreshProvisionalMonthlySnapshot(sponsorOrganizationId, period);
      snap = await getMonthlySnapshot(sponsorOrganizationId, period);
    } catch (e) {
      console.warn(
        '[getTopSponsorsAnalytics] auto-refresh failed',
        e instanceof Error ? e.message : e,
      );
    }
  }

  const marketerSnap = snap?.rows.find(
    (r) => r.ranking_type === 'marketer' && r.marketer_id === marketerUserId,
  );

  if (marketerSnap) {
    const promoSnap = (snap?.rows ?? []).filter(
      (r) => r.ranking_type === 'promotion' && r.promotion_id && r.rank != null,
    );
    // Attach promotions credited to this marketer via assignment_collaborator
    const promoIds = promoSnap.map((r) => r.promotion_id!).filter(Boolean);
    const promotions: SponsorPromotionSlice[] = [];
    if (promoIds.length > 0) {
      const { data: promos } = await supabase
        .from('promotions')
        .select('id, assignment_collaborator_id')
        .in('id', promoIds);
      const collabIds = (promos ?? [])
        .map((p: { assignment_collaborator_id?: string | null }) => p.assignment_collaborator_id)
        .filter((id): id is string => !!id);
      const userByCollab = new Map<string, string>();
      if (collabIds.length > 0) {
        const { data: collabs } = await supabase
          .from('assignment_collaborators')
          .select('id, user_id')
          .in('id', collabIds);
        for (const c of collabs ?? []) {
          const row = c as { id: string; user_id?: string | null };
          if (row.user_id) userByCollab.set(row.id, row.user_id);
        }
      }
      const mine = new Set(
        (promos ?? [])
          .filter((p: { id: string; assignment_collaborator_id?: string | null }) => {
            const uid = p.assignment_collaborator_id
              ? userByCollab.get(p.assignment_collaborator_id)
              : null;
            return uid === marketerUserId;
          })
          .map((p: { id: string }) => p.id),
      );
      for (const r of promoSnap) {
        if (!r.promotion_id || !mine.has(r.promotion_id)) continue;
        promotions.push({
          promotionId: r.promotion_id,
          title: r.entity_name_snapshot || r.promotion_id,
          revenue: Number(r.revenue) || 0,
        });
      }
      promotions.sort((a, b) => b.revenue - a.revenue);
    }

    const revenue = Number(marketerSnap.revenue) || 0;
    const conversions = Number(marketerSnap.conversions) || 0;
    const clicks = Number(marketerSnap.clicks) || 0;
    return {
      sponsorOrganizationId,
      sponsorName,
      revenue,
      conversions,
      clicks,
      rpc: clicks > 0 ? revenue / clicks : Number(marketerSnap.rpc) || 0,
      promotions,
    };
  }

  // Marketer not in Top-10 snapshot → same canonical formal sum for this user only
  const slice = await computeMarketerSliceInOrg(
    sponsorOrganizationId,
    period,
    marketerUserId,
  );
  return {
    sponsorOrganizationId,
    sponsorName,
    revenue: slice.revenue,
    conversions: slice.conversions,
    clicks: 0,
    rpc: 0,
    promotions: slice.promotions,
  };
}

/**
 * All sponsors for this marketer, each with the same revenue Ali would see
 * for this marketer on Top Marketers for the same period.
 */
export async function getTopSponsorsAnalytics(
  params: TopSponsorsParams,
): Promise<SponsorRow[]> {
  const { marketerUserId, preset, customRange, forceRefresh = false } = params;
  if (!marketerUserId) return [];

  const period = windowForPreset(preset, customRange ?? null);
  const sponsors = await listSponsorOrganizationsForMarketer(marketerUserId);
  if (sponsors.length === 0) return [];

  const rows: SponsorRow[] = [];
  for (const s of sponsors) {
    const row = await loadSponsorRowForOrg(
      s.organizationId,
      s.name,
      marketerUserId,
      period,
      forceRefresh,
    );
    rows.push(row);
  }

  // Rank by revenue; keep zero-revenue sponsors visible (relationship exists)
  return rows.sort(
    (a, b) => b.revenue - a.revenue || a.sponsorName.localeCompare(b.sponsorName),
  );
}

export function rankTopSponsors(
  rows: SponsorRow[],
  metric: 'revenue' | 'conversions' | 'clicks' | 'rpc',
): SponsorRow[] {
  return [...rows].sort((a, b) => {
    const dv = (b[metric] ?? 0) - (a[metric] ?? 0);
    if (dv !== 0) return dv;
    return a.sponsorName.localeCompare(b.sponsorName);
  });
}
