/**
 * memberRevenue.ts  (src/services/analytics/)
 *
 * ONE shared Revenue source for Operator Overview, Members and MemberDetail.
 * NOT a second attribution engine: every number comes from
 * campaignMonthlySnapshots.ts (the same module Tree uses).
 *
 * Definition
 *   Member Total Revenue = sum of Campaign Revenue over the member's
 *   *visible* campaigns (listOrgCampaigns: not archived, not system) for ONE
 *   fixed period. This is Tree's "All Campaigns" rule.
 *   Purchases with no campaign_id are NOT added (computeCampaignMonthMetrics
 *   already skips them) — intentional, per business decision.
 *
 * Read path (load)   : campaign_monthly_snapshots only (snapshot-first, same
 *                      as Tree). Raw Stripe/Pixel rows are never added on top.
 * Update path        : computeCampaignMonthMetrics (read-only recompute with
 *                      the existing eligibility rules). It does NOT write
 *                      snapshots: writing into another org's
 *                      campaign_monthly_snapshots is a cross-org write, which
 *                      is why Tree disables Update in read-only mode.
 *
 * Double-count guards
 *   - one fixed period for every page (OPERATOR_REVENUE_PRESET)
 *   - snapshot rows deduped to ONE row per campaign_id
 *     (finalized > provisional, then higher snapshot_version, then newer)
 *   - org totals summed once per organization_id (sumUniqueOrgRevenue)
 *
 * Status rule: Tree does not filter by status, so neither do we.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  computeCampaignMonthMetrics,
  getCampaignMonthlySnapshots,
  listOrgCampaigns,
  periodFromCampaignTreePreset,
  type CampaignMonthlySnapshotRow,
  type CampaignTreePreset,
} from './campaignMonthlySnapshots';

/** Single period rule for all Operator pages. Change here only. */
export const OPERATOR_REVENUE_PRESET: CampaignTreePreset = 'all_time';

export interface MemberRevenueResult {
  memberUserId: string;
  organizationId: string;
  /** null = no snapshot exists yet (press Update to compute). */
  totalRevenue: number | null;
  campaignCount: number;
  source: 'snapshot' | 'computed' | 'none';
  /** ISO timestamp of the snapshot / computation. */
  asOf: string | null;
}

// ── member user_id → that member's own organization_id ──────────────────────
// First possible RLS/schema blocker: if the caller cannot read the member's
// owner row this returns null and getMemberRevenue throws a clear error.
const orgCache = new Map<string, string>();

async function resolveMemberOrganizationId(memberUserId: string): Promise<string | null> {
  const cached = orgCache.get(memberUserId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', memberUserId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`resolve member org: ${error.message}`);
  const orgId = (data as { organization_id?: string } | null)?.organization_id ?? null;
  if (orgId) orgCache.set(memberUserId, orgId);
  return orgId;
}

function rank(r: CampaignMonthlySnapshotRow): [number, number, string] {
  return [r.status === 'finalized' ? 1 : 0, r.snapshot_version ?? 0, r.snapshot_at ?? ''];
}

/** One row per campaign_id so finalized+provisional (or versions) never add twice. */
function dedupeSnapshots(rows: CampaignMonthlySnapshotRow[]): CampaignMonthlySnapshotRow[] {
  const best = new Map<string, CampaignMonthlySnapshotRow>();
  for (const r of rows) {
    const cur = best.get(r.campaign_id);
    if (!cur) {
      best.set(r.campaign_id, r);
      continue;
    }
    const a = rank(r);
    const b = rank(cur);
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) {
      best.set(r.campaign_id, r);
    }
  }
  return Array.from(best.values());
}

const resultCache = new Map<string, MemberRevenueResult>();

/**
 * Shared Revenue function. Per member, independent. Page loads call it with
 * forceRefresh=false (snapshot read); the per-member Update button calls it
 * with forceRefresh=true (recompute for that member only).
 */
export async function getMemberRevenue(
  memberUserId: string,
  opts?: { forceRefresh?: boolean },
): Promise<MemberRevenueResult> {
  const forceRefresh = !!opts?.forceRefresh;
  const period = periodFromCampaignTreePreset(OPERATOR_REVENUE_PRESET);

  const organizationId = await resolveMemberOrganizationId(memberUserId);
  if (!organizationId) throw new Error('Member organization not found');

  const cacheKey = `${organizationId}|${period.rankingWindow}|${period.periodStart}`;
  if (!forceRefresh) {
    const hit = resultCache.get(cacheKey);
    if (hit) return { ...hit, memberUserId };
  }

  const campaigns = await listOrgCampaigns(organizationId);
  const visible = new Set(campaigns.map((c) => c.id));

  let result: MemberRevenueResult;

  if (forceRefresh) {
    const metrics = await computeCampaignMonthMetrics(organizationId, period);
    const eligible = metrics.filter((m) => visible.has(m.campaignId));
    result = {
      memberUserId,
      organizationId,
      totalRevenue: eligible.reduce((s, m) => s + m.revenue, 0),
      campaignCount: eligible.length,
      source: 'computed',
      asOf: new Date().toISOString(),
    };
  } else {
    const rows = await getCampaignMonthlySnapshots(organizationId, period);
    if (rows.length === 0) {
      result = {
        memberUserId,
        organizationId,
        totalRevenue: null,
        campaignCount: 0,
        source: 'none',
        asOf: null,
      };
    } else {
      const eligible = dedupeSnapshots(rows).filter((r) => visible.has(r.campaign_id));
      result = {
        memberUserId,
        organizationId,
        totalRevenue: eligible.reduce((s, r) => s + (Number(r.revenue) || 0), 0),
        campaignCount: eligible.length,
        source: 'snapshot',
        asOf: rows.map((r) => r.snapshot_at).sort().slice(-1)[0] ?? null,
      };
    }
  }

  resultCache.set(cacheKey, result);
  return result;
}

/** Org-level dedupe: two list entries pointing at one org count once. */
export function sumUniqueOrgRevenue(results: (MemberRevenueResult | undefined)[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const r of results) {
    if (!r || r.totalRevenue == null || seen.has(r.organizationId)) continue;
    seen.add(r.organizationId);
    total += r.totalRevenue;
  }
  return total;
}

// ── Thin React wrapper so all three pages share identical state handling ────
export interface MemberRevenueState {
  loading: boolean;
  updating: boolean;
  error: string | null;
  result?: MemberRevenueResult;
}

export function formatMemberRevenue(s: MemberRevenueState | undefined): string {
  if (!s || s.loading) return '…';
  if (s.error || !s.result || s.result.totalRevenue == null) return '—';
  return `$${s.result.totalRevenue.toLocaleString()}`;
}

export function useMemberRevenues(memberIds: string[]) {
  const [byMember, setByMember] = useState<Record<string, MemberRevenueState>>({});
  const mounted = useRef(true);
  const key = memberIds.join(',');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patch = useCallback((id: string, p: Partial<MemberRevenueState>) => {
    if (!mounted.current) return;
    setByMember((prev) => ({
      ...prev,
      [id]: { loading: false, updating: false, error: null, ...prev[id], ...p },
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    for (const id of memberIds) {
      patch(id, { loading: true });
      getMemberRevenue(id)
        .then((result) => !cancelled && patch(id, { loading: false, result, error: null }))
        .catch((e) => {
          console.error('[memberRevenue] load failed', id, e);
          if (!cancelled) patch(id, { loading: false, error: e instanceof Error ? e.message : String(e) });
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, patch]);

  /** Independent per-member Update: recomputes ONLY this member. */
  const update = useCallback(
    async (id: string) => {
      patch(id, { updating: true, error: null });
      try {
        const result = await getMemberRevenue(id, { forceRefresh: true });
        patch(id, { updating: false, result });
      } catch (e) {
        console.error('[memberRevenue] update failed', id, e);
        patch(id, { updating: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
    [patch],
  );

  return { byMember, update };
}
