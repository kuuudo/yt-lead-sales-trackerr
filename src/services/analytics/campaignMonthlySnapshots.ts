/**
 * campaignMonthlySnapshots.ts
 *
 * Per-campaign month metrics for Tree.tsx.
 * NOT a second attribution engine.
 *
 * Classification (same as analyticsEngine / All Assets / InDepth):
 *   Stripe → redirect_link_token → redirect_links.link_type → mapLinkTypeToRevenueType
 *   Pixel  → pixel_purchases.event_type
 *
 * Campaign association (same as InDepth purchase scope):
 *   Use the purchase row's campaign_id (and session fallback only when building
 *   rows the way the engine does). This is membership counting, not Marketer/
 *   Promotion "功勞" credit.
 *
 * Formal eligibility:
 *   resolveConversionOwners — exclude uncounted + suppressed Pixel; Stripe kept.
 *
 * Revenue:
 *   Sum formal amounts with amount > 0 once per conversion (canonical formal),
 *   matching monthly ranking total_revenue inclusion of paid formal rows.
 *   Newsletter opt-ins do not add revenue unless amount > 0 on a formal row
 *   (normally 0). Estimated call EV is NOT added here so Tree "Revenue" stays
 *   actual formal paid revenue, not projected call value.
 *
 * Counts:
 *   Direct / Sales Call / Newsletter / Consultation via the same type rules as
 *   processVideoMetrics. Only formal-eligible rows (not uncounted/suppressed).
 */

import { supabase } from '../../lib/supabase';
import {
  resolveConversionOwners,
  type ConversionOwnerResult,
  type StripePurchaseOwnerInput,
  type PixelPurchaseOwnerInput,
} from '../attribution/resolveConversionOwners';
import {
  type MonthPeriod,
  utcMonthPeriod,
  utcMonthPeriodFromDate,
} from './monthlyRankingSnapshots';

export type { MonthPeriod };
export { utcMonthPeriod, utcMonthPeriodFromDate };

export type SnapshotStatus = 'provisional' | 'finalized';

export interface CampaignMonthMetrics {
  campaignId: string;
  purchases: number;
  salesCalls: number;
  newsletterOptins: number;
  consultations: number;
  revenue: number;
  revenueConversions: number;
}

export interface CampaignMonthlySnapshotRow {
  organization_id: string;
  campaign_id: string;
  period_start: string;
  period_end: string;
  purchases: number;
  sales_calls: number;
  newsletter_optins: number;
  consultations: number;
  revenue: number;
  revenue_conversions: number;
  status: SnapshotStatus;
  snapshot_version: number;
  snapshot_at: string;
}

/** Mirrors analyticsEngine.mapLinkTypeToRevenueType exactly. */
export type StripeRevenueType = 'offer' | 'consultation' | 'sales_call' | 'newsletter';

export function mapLinkTypeToRevenueType(
  linkType: string | null | undefined,
): StripeRevenueType {
  switch (linkType) {
    case 'consultation':
      return 'consultation';
    case 'sales_call':
      return 'sales_call';
    case 'newsletter':
      return 'newsletter';
    case 'landing_page':
      return 'offer';
    default:
      return 'offer';
  }
}

function parseAmount(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function isFormal(r: ConversionOwnerResult): boolean {
  return r.attributionReason !== 'uncounted' && !r.suppressedByStripeId;
}

function periodBoundsIso(period: MonthPeriod): { startIso: string; endIso: string } {
  return {
    startIso: `${period.periodStart}T00:00:00.000Z`,
    endIso: `${period.periodEnd}T23:59:59.999Z`,
  };
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

/** token → link_type (same path as buildRedirectLinkLookup + InDepth). */
async function fetchLinkTypeByToken(tokens: string[]): Promise<Record<string, string | null>> {
  const lookup: Record<string, string | null> = {};
  const uniq = Array.from(new Set(tokens.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += 100) {
    const slice = uniq.slice(i, i + 100);
    const { data, error } = await supabase
      .from('redirect_links')
      .select('token, link_type')
      .in('token', slice);
    if (error) {
      console.warn('[campaignMonthlySnapshots] redirect_links lookup failed:', error.message);
      continue;
    }
    for (const r of data ?? []) {
      const row = r as { token: string; link_type: string | null };
      if (row.token) lookup[row.token] = row.link_type ?? null;
    }
  }
  return lookup;
}

function emptyMetrics(campaignId: string): CampaignMonthMetrics {
  return {
    campaignId,
    purchases: 0,
    salesCalls: 0,
    newsletterOptins: 0,
    consultations: 0,
    revenue: 0,
    revenueConversions: 0,
  };
}

/**
 * Aggregate five metrics per campaign_id on the purchase row.
 * Reuses resolveConversionOwners for formal eligibility only.
 */
export async function computeCampaignMonthMetrics(
  organizationId: string,
  period: MonthPeriod,
): Promise<CampaignMonthMetrics[]> {
  const { stripe, pixel } = await fetchOrgPurchasesForPeriod(organizationId, period);
  if (stripe.length === 0 && pixel.length === 0) return [];

  const resolved = await resolveConversionOwners({
    stripePurchases: stripe,
    pixelPurchases: pixel,
  });

  const tokens = stripe
    .map((p) => (p as { redirect_link_token?: string | null }).redirect_link_token)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
  const linkByToken = await fetchLinkTypeByToken(tokens);

  const byCampaign = new Map<string, CampaignMonthMetrics>();

  const ensure = (campaignId: string) => {
    let m = byCampaign.get(campaignId);
    if (!m) {
      m = emptyMetrics(campaignId);
      byCampaign.set(campaignId, m);
    }
    return m;
  };

  // Stripe rows — formal if present in byKey and not unresolved-only exclusion.
  // Ranking treats Stripe as financial source; we require a resolved owner entry
  // when one exists, but still count stripe rows that were processed.
  for (const p of stripe) {
    const owner = resolved.byKey.get(`stripe:${p.id}`);
    // If resolver produced a result marked uncounted (Stripe never is) or missing,
    // still allow Stripe with amount path matching engine (amount > 0).
    if (owner && !isFormal(owner)) continue;

    const campaignId = (p.campaign_id as string | null) ?? null;
    if (!campaignId) continue;

    const token =
      (p as { redirect_link_token?: string | null }).redirect_link_token ?? null;
    const linkType = token ? linkByToken[token] ?? null : null;
    const revenueType = mapLinkTypeToRevenueType(linkType);
    const amount = parseAmount(p.amount);
    const m = ensure(campaignId);

    if (revenueType === 'offer' && amount > 0) {
      m.purchases += 1;
      m.revenue += amount;
      m.revenueConversions += 1;
    } else if (revenueType === 'consultation' && amount > 0) {
      m.consultations += 1;
      m.revenue += amount;
      m.revenueConversions += 1;
    } else if (revenueType === 'sales_call') {
      // Engine: stripe sales_call does not increment call_booking_thankyou in stripe mode;
      // booking counts come from pixel. Do not invent stripe booking counts here.
    } else if (revenueType === 'newsletter') {
      // same — newsletter counts from pixel
    } else if (amount > 0) {
      // default offer already handled; leftover positive amounts still formal revenue
      m.purchases += 1;
      m.revenue += amount;
      m.revenueConversions += 1;
    }
  }

  for (const p of pixel) {
    if (resolved.uncountedPixelIds.has(p.id)) continue;
    if (resolved.suppressedPixelIds.has(p.id)) continue;
    const owner = resolved.byKey.get(`pixel:${p.id}`);
    if (owner && !isFormal(owner)) continue;

    const campaignId = (p.campaign_id as string | null) ?? null;
    if (!campaignId) continue;

    const eventType = (p.event_type as string | null) ?? null;
    const amount = parseAmount(p.amount);
    const m = ensure(campaignId);

    // Counts — same switch as processVideoMetrics PIXEL/TOTAL
    switch (eventType) {
      case 'purchase':
        m.purchases += 1;
        break;
      case 'sales_call':
        m.salesCalls += 1;
        break;
      case 'consultation':
        m.consultations += 1;
        break;
      case 'newsletter':
        m.newsletterOptins += 1;
        break;
      default:
        break;
    }

    // Revenue amounts — processVideoMetrics TOTAL: purchase + consultation only;
    // skip if same session already counted via Stripe (cross-source dedup).
    if (
      amount > 0 &&
      (eventType === 'purchase' || eventType === 'consultation')
    ) {
      const sessionId = (p.session_id as string | null) ?? null;
      let skip = false;
      if (sessionId) {
        for (const s of stripe) {
          if ((s.session_id as string | null) === sessionId) {
            skip = true;
            break;
          }
        }
      }
      if (!skip) {
        m.revenue += amount;
        m.revenueConversions += 1;
      }
    }
  }

  return Array.from(byCampaign.values()).sort((a, b) =>
    a.campaignId.localeCompare(b.campaignId),
  );
}

export async function saveProvisionalCampaignSnapshots(
  organizationId: string,
  period: MonthPeriod,
  metrics: CampaignMonthMetrics[],
): Promise<void> {
  // Delete provisional rows for this org+month, then insert (atomic enough for provisional).
  const { error: delErr } = await supabase
    .from('campaign_monthly_snapshots')
    .delete()
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .eq('status', 'provisional');

  if (delErr) throw new Error(delErr.message);

  if (metrics.length === 0) return;

  const snapshotAt = new Date().toISOString();
  const rows = metrics.map((m) => ({
    organization_id: organizationId,
    campaign_id: m.campaignId,
    period_start: period.periodStart,
    period_end: period.periodEnd,
    purchases: m.purchases,
    sales_calls: m.salesCalls,
    newsletter_optins: m.newsletterOptins,
    consultations: m.consultations,
    revenue: m.revenue,
    revenue_conversions: m.revenueConversions,
    status: 'provisional' as const,
    snapshot_version: 1,
    snapshot_at: snapshotAt,
  }));

  const { error: insErr } = await supabase.from('campaign_monthly_snapshots').insert(rows);
  if (insErr) throw new Error(insErr.message);
}

export async function refreshProvisionalCampaignSnapshots(
  organizationId: string,
  period: MonthPeriod,
): Promise<CampaignMonthMetrics[]> {
  const metrics = await computeCampaignMonthMetrics(organizationId, period);
  await saveProvisionalCampaignSnapshots(organizationId, period, metrics);
  return metrics;
}

export async function getCampaignMonthlySnapshots(
  organizationId: string,
  period: MonthPeriod,
): Promise<CampaignMonthlySnapshotRow[]> {
  const { data, error } = await supabase
    .from('campaign_monthly_snapshots')
    .select(
      'organization_id, campaign_id, period_start, period_end, purchases, sales_calls, newsletter_optins, consultations, revenue, revenue_conversions, status, snapshot_version, snapshot_at',
    )
    .eq('organization_id', organizationId)
    .eq('period_start', period.periodStart)
    .order('campaign_id', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignMonthlySnapshotRow[];
}

/**
 * Snapshot-first read. forceRefresh recomputes provisional from canonical purchases.
 * Never overwrites finalized rows (save only deletes status=provisional).
 */
export async function getOrRefreshCampaignMonthMetrics(
  organizationId: string,
  period: MonthPeriod,
  opts?: { forceRefresh?: boolean },
): Promise<CampaignMonthMetrics[]> {
  if (!opts?.forceRefresh) {
    const existing = await getCampaignMonthlySnapshots(organizationId, period);
    if (existing.length > 0) {
      return existing.map((r) => ({
        campaignId: r.campaign_id,
        purchases: r.purchases,
        salesCalls: r.sales_calls,
        newsletterOptins: r.newsletter_optins,
        consultations: r.consultations,
        revenue: Number(r.revenue) || 0,
        revenueConversions: r.revenue_conversions,
      }));
    }
  }
  return refreshProvisionalCampaignSnapshots(organizationId, period);
}

/**
 * Same columns as AllAssetsAnalytics / CampaignStructureMap:
 *   campaigns.id, campaigns.campaign_name, organization_id
 * Selecting non-existent columns (name, title) causes PostgREST to fail the
 * whole query — that was why Tree only showed "All Campaigns".
 */
/** Legacy system campaign auto-created at signup. Never shown in Tree. */
const HIDDEN_CAMPAIGN_NAME = 'ONLY PROMOTE ASSET';

export async function listOrgCampaigns(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, campaign_name, created_at, archived_at, is_system')
    .eq('organization_id', organizationId)
    .is('archived_at', null) // archived campaigns never appear in Tree
    .order('created_at', { ascending: false });

  if (error) throw new Error(`listOrgCampaigns: ${error.message}`);

  return (data ?? [])
    .filter((c: { campaign_name?: string | null; is_system?: boolean | null }) => {
      const name = (c.campaign_name ?? '').toString().trim();
      return name !== HIDDEN_CAMPAIGN_NAME && !c.is_system;
    })
    .map((c: { id: string; campaign_name?: string | null }) => ({
      id: c.id,
      name: (c.campaign_name ?? '').toString().trim() || c.id,
    }));
}

/** UI time presets for Tree (aligned with Top Marketers windows). */
export type CampaignTreePreset =
  | 'all_time'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'month'; // explicit calendar month (periodStart/End set by caller)

function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build period bounds for a preset. All Time uses the same floor as ranking
 * snapshots (2020-01-01 → today UTC) so one snapshot key does not fragment.
 * Rolling windows recompute bounds on each call (no double-count: single
 * query over [start,end], not sum of monthly snapshots).
 */
export function periodFromCampaignTreePreset(
  preset: CampaignTreePreset,
  anchor?: Date,
  explicitMonth?: MonthPeriod,
): MonthPeriod {
  const now = anchor ?? new Date();
  if (preset === 'month' && explicitMonth) {
    return { ...explicitMonth, rankingWindow: 'custom' };
  }
  if (preset === 'all_time') {
    return {
      periodStart: '2020-01-01',
      periodEnd: ymdUTC(now),
      rankingWindow: 'all_time',
    };
  }
  if (preset === 'last_7_days') {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return {
      periodStart: ymdUTC(start),
      periodEnd: ymdUTC(end),
      rankingWindow: 'last_7_days',
    };
  }
  if (preset === 'last_30_days') {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 29);
    return {
      periodStart: ymdUTC(start),
      periodEnd: ymdUTC(end),
      rankingWindow: 'last_30_days',
    };
  }
  // this_month
  const month = utcMonthPeriod(now.getUTCFullYear(), now.getUTCMonth());
  return { ...month, rankingWindow: 'this_month' };
}
