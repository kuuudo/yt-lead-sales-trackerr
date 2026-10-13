/**
 * getPartnerAnalytics.ts
 *
 * Thin adapter for Partner Analytics MVP.
 *
 * Mandatory mappings (product law):
 *   Marketers mode → getTopMarketersAnalytics (current org's ranked marketers)
 *   Sponsors mode  → getTopSponsorsAnalytics (logged-in marketer's sponsor orgs)
 *
 * Two-stage loading:
 *   Stage 1: monthly_ranking_snapshots only (fast; no live formal recompute)
 *   Stage 2 ("More"): remaining relationships not already on the table,
 *            using the same formal path as Top Sponsors outside Top-N
 *            (computeMarketerFormalRevenueInOrg).
 *
 * Revenue-only for MVP. Does not touch Journey, analyticsEngine, or attribution rules.
 */

import { supabase } from '../../lib/supabase';
import {
  getTopMarketersAnalytics,
  type MarketerRow,
  type TopMarketersPreset,
} from './getTopMarketersAnalytics';
import {
  getTopSponsorsAnalytics,
  listSponsorOrganizationsForMarketer,
  computeMarketerFormalRevenueInOrg,
  periodForTopSponsorsPreset,
  type SponsorRow,
  type TopSponsorsPreset,
} from './getTopSponsorsAnalytics';

export type PartnerMode = 'marketers' | 'sponsors';
export type PartnerPreset = TopMarketersPreset;

/** UI row for Partner table (revenue only). */
export type PartnerTableRow = {
  id: string;
  name: string;
  revenue: number;
};

export type PartnerLoadParams = {
  mode: PartnerMode;
  /** Required for Marketers mode (sponsor org). */
  organizationId: string | null;
  /** Required for Sponsors mode (assignment_collaborators.user_id). */
  marketerUserId: string | null;
  preset: PartnerPreset;
  customRange?: { start: Date; end: Date } | null;
  forceRefresh?: boolean;
};

function mapMarketer(r: MarketerRow): PartnerTableRow {
  return { id: r.marketerId, name: r.marketerName, revenue: r.revenue };
}

function mapSponsor(r: SponsorRow): PartnerTableRow {
  return {
    id: r.sponsorOrganizationId,
    name: r.sponsorName,
    revenue: r.revenue,
  };
}

/**
 * Stage 1 — snapshot-backed rows only (fast initial paint).
 * Marketers: org Top-N marketer snapshot.
 * Sponsors: per-sponsor org marketer snapshot rows for this user (snapshotOnly).
 */
export async function loadPartnerTableStage1(
  params: PartnerLoadParams,
): Promise<PartnerTableRow[]> {
  const { mode, organizationId, marketerUserId, preset, customRange, forceRefresh } =
    params;

  if (mode === 'marketers') {
    if (!organizationId) return [];
    const rows = await getTopMarketersAnalytics({
      organizationId,
      preset,
      customRange: customRange ?? null,
      forceRefresh: forceRefresh ?? false,
    });
    return rows.map(mapMarketer);
  }

  if (!marketerUserId) return [];
  const rows = await getTopSponsorsAnalytics({
    marketerUserId,
    preset,
    customRange: customRange ?? null,
    forceRefresh: forceRefresh ?? false,
    snapshotOnly: true,
  });
  return rows.map(mapSponsor);
}

/**
 * Stage 2 — remaining relationships not already listed.
 * Does not refetch ids already present. Uses formal revenue for missing slices
 * (same function Top Sponsors uses outside Top-N).
 */
export async function loadPartnerTableMore(
  params: PartnerLoadParams & { alreadyLoadedIds: string[] },
): Promise<PartnerTableRow[]> {
  const {
    mode,
    organizationId,
    marketerUserId,
    preset,
    customRange,
    alreadyLoadedIds,
  } = params;
  const loaded = new Set(alreadyLoadedIds.filter(Boolean));
  const period = periodForTopSponsorsPreset(preset, customRange ?? null);

  if (mode === 'marketers') {
    if (!organizationId) return [];
    const all = await listMarketerIdsForOrganization(organizationId);
    const missing = all.filter((m) => !loaded.has(m.userId));
    const out: PartnerTableRow[] = [];
    for (const m of missing) {
      const slice = await computeMarketerFormalRevenueInOrg(
        organizationId,
        period,
        m.userId,
      );
      out.push({ id: m.userId, name: m.name || m.userId, revenue: slice.revenue });
    }
    return out.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  }

  // Sponsors mode: relationship orgs not already shown
  if (!marketerUserId) return [];
  const sponsors = await listSponsorOrganizationsForMarketer(marketerUserId);
  const missing = sponsors.filter((s) => !loaded.has(s.organizationId));
  const out: PartnerTableRow[] = [];
  for (const s of missing) {
    const slice = await computeMarketerFormalRevenueInOrg(
      s.organizationId,
      period,
      marketerUserId,
    );
    out.push({
      id: s.organizationId,
      name: s.name,
      revenue: slice.revenue,
    });
  }
  return out.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}

/**
 * All marketer user_ids with an assignment_collaborator on promotions in this org.
 * Used only for Marketers stage-2 "More" — not a second attribution path.
 */
async function listMarketerIdsForOrganization(
  organizationId: string,
): Promise<{ userId: string; name: string }[]> {
  const { data: promos, error } = await supabase
    .from('promotions')
    .select('assignment_collaborator_id')
    .eq('organization_id', organizationId)
    .not('assignment_collaborator_id', 'is', null);
  if (error) {
    console.warn('[getPartnerAnalytics] promotions list failed', error.message);
    return [];
  }
  const collabIds = Array.from(
    new Set(
      (promos ?? [])
        .map((p: { assignment_collaborator_id?: string | null }) => p.assignment_collaborator_id)
        .filter((id): id is string => !!id),
    ),
  );
  if (collabIds.length === 0) return [];

  const { data: collabs, error: cErr } = await supabase
    .from('assignment_collaborators')
    .select('id, user_id')
    .in('id', collabIds);
  if (cErr) {
    console.warn('[getPartnerAnalytics] collaborators failed', cErr.message);
    return [];
  }
  const userIds = Array.from(
    new Set(
      (collabs ?? [])
        .map((c: { user_id?: string | null }) => c.user_id)
        .filter((id): id is string => !!id),
    ),
  );
  if (userIds.length === 0) return [];

  // Best-effort display names (may be limited by RLS; fall back to id)
  const nameById = new Map<string, string>();
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);
  for (const p of profs ?? []) {
    const row = p as { id: string; full_name?: string | null; email?: string | null };
    const label = (row.full_name ?? '').trim() || (row.email ?? '').trim();
    if (label) nameById.set(row.id, label);
  }

  return userIds.map((userId) => ({
    userId,
    name: nameById.get(userId) ?? userId,
  }));
}

export type { TopMarketersPreset, TopSponsorsPreset };
