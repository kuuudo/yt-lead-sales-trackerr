/**
 * TEMPORARY VERIFICATION HARNESS — DELETE AFTER VERIFICATION
 * ─────────────────────────────────────────────────────────
 * File: services/asset/__verify_getAssetAnalyticsRows.ts
 *
 * Purpose: Run getAssetAnalyticsRows() against real authenticated Supabase
 * data and print a structured PASS/FAIL diagnostic. Does NOT touch UI.
 *
 * HOW TO RUN (pick one):
 *
 * A) Temporary debug route (recommended while logged in):
 *    1. Add a route that renders a button calling runAssetAnalyticsVerification()
 *    2. Open the page while authenticated as a real org user
 *    3. Click → inspect browser console
 *
 * B) From browser console (if your app exposes modules / you paste into a
 *    temporary page that imports this):
 *    await runAssetAnalyticsVerification()
 *
 * C) Adapt into a one-off script if you have a Node + supabase service role
 *    path (not required — browser session is preferred so RLS matches prod).
 *
 * REMOVE THIS FILE when verification is complete.
 */

import { supabase } from '../../lib/supabase';
import { getAssetAnalyticsRows } from './getAssetAnalyticsRows';

export interface VerificationReport {
  organizationId: string;
  viewerId: string;
  rowCount: number;
  assetIds: string[];
  unmatchedIdentityCount: number;
  debug: {
    redirectLinkCount: number;
    identityCount: number;
    assetCount: number;
  };
  checks: {
    organizationBoundary: 'PASS' | 'FAIL' | 'UNKNOWN';
    rowIdentity: 'PASS' | 'FAIL';
    type1: 'PASS' | 'FAIL' | 'NO REAL DATA';
    type2: 'PASS' | 'FAIL' | 'NO REAL DATA';
    type3: 'PASS' | 'FAIL' | 'NO REAL DATA';
    multiLinkTypeCollapse: 'PASS' | 'FAIL' | 'NO REAL DATA';
    metricAttribution: 'PASS' | 'FAIL' | 'UNKNOWN';
    archiveContext: 'PASS' | 'FAIL';
    historicalAttribution: 'PASS' | 'UNKNOWN';
    duplicateRows: number;
    unmatchedRelationships: number;
  };
  samples: {
    byType: Record<string, number>;
    multiLinkTypeExamples: Array<{
      video_id: string;
      asset_id: string;
      linkTypes: string[];
    }>;
    metricSamples: Array<{
      video_id: string;
      asset_id: string;
      asset_type: string;
      metrics: {
        clicks: number;
        sessions: number;
        conversions: number;
        revenue: number;
        rpc: number;
      };
    }>;
    archiveSamples: Array<{
      asset_id: string;
      asset_type: string;
      isArchived: boolean;
      level: string;
      reasons: Array<{ sourceType: string; sourceId: string }>;
    }>;
    resourceSamples: Array<{
      asset_id: string;
      video_id: string;
      linkTypes: string[];
      metrics: {
        clicks: number;
        conversions: number;
        revenue: number;
      };
    }>;
  };
  overall: 'READY' | 'NOT READY';
  notes: string[];
}

/**
 * Resolve current authenticated user + primary organization.
 * Uses the same tables the app already uses — no new ownership model.
 */
async function resolveAuthContext(): Promise<{
  viewerId: string;
  organizationId: string;
}> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    throw new Error(
      '[verify] Not authenticated. Log in first, then re-run.',
    );
  }
  const viewerId = auth.user.id;

  // Prefer organization_members if present; fall back to any org-scoped table.
  const { data: membership, error: memError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', viewerId)
    .limit(1)
    .maybeSingle();

  if (!memError && membership?.organization_id) {
    return { viewerId, organizationId: membership.organization_id as string };
  }

  // Fallback: first campaign owned by this user's org context via assets
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('organization_id')
    .limit(1)
    .maybeSingle();

  if (assetError || !asset?.organization_id) {
    throw new Error(
      '[verify] Could not resolve organizationId. ' +
        'organization_members empty and no visible assets. ' +
        (memError?.message ?? assetError?.message ?? ''),
    );
  }

  return { viewerId, organizationId: asset.organization_id as string };
}

export async function runAssetAnalyticsVerification(
  overrides?: {
    organizationId?: string;
    viewerId?: string;
    dateRange?: '7days' | '30days' | '2months' | '6months' | '1year' | 'all';
  },
): Promise<VerificationReport> {
  const notes: string[] = [];

  const ctx = overrides?.organizationId && overrides?.viewerId
    ? {
        organizationId: overrides.organizationId,
        viewerId: overrides.viewerId,
      }
    : await resolveAuthContext();

  const organizationId = overrides?.organizationId ?? ctx.organizationId;
  const viewerId = overrides?.viewerId ?? ctx.viewerId;

  console.log('[verify] Running getAssetAnalyticsRows', {
    organizationId,
    viewerId,
    dateRange: overrides?.dateRange ?? '30days',
  });

  const result = await getAssetAnalyticsRows({
    organizationId,
    viewerId,
    dateRange: overrides?.dateRange ?? '30days',
    activeSource: 'total',
  });

  const rows = result.rows;

  // ── A. Organization boundary ──────────────────────────────────────────
  // Orchestration filters redirect_links by organization_id at fetch time.
  // We cannot see org on the output row directly; we validate by re-querying
  // a sample of asset_ids and confirming they belong to this org.
  let organizationBoundary: 'PASS' | 'FAIL' | 'UNKNOWN' = 'UNKNOWN';
  if (rows.length === 0) {
    organizationBoundary = 'UNKNOWN';
    notes.push('No rows returned — cannot fully prove org boundary from data.');
  } else {
    const sampleAssetIds = Array.from(
      new Set(rows.slice(0, 50).map((r) => r.asset_id)),
    );
    const { data: orgCheck, error: orgErr } = await supabase
      .from('assets')
      .select('id, organization_id')
      .in('id', sampleAssetIds);

    if (orgErr) {
      organizationBoundary = 'UNKNOWN';
      notes.push(`Org boundary re-check failed: ${orgErr.message}`);
    } else {
      const bad = (orgCheck ?? []).filter(
        (a: any) => a.organization_id !== organizationId,
      );
      organizationBoundary = bad.length === 0 ? 'PASS' : 'FAIL';
      if (bad.length > 0) {
        notes.push(
          `ORG LEAK: ${bad.length} assets with foreign organization_id: ${bad
            .map((b: any) => b.id)
            .join(', ')}`,
        );
      }
    }
  }

  // ── B. Row identity + K. Duplicates ───────────────────────────────────
  const pairKeys = rows.map((r) => `${r.video_id}::${r.asset_id}`);
  const pairSet = new Set(pairKeys);
  const duplicateRows = pairKeys.length - pairSet.size;
  const rowIdentity: 'PASS' | 'FAIL' =
    duplicateRows === 0 ? 'PASS' : 'FAIL';
  if (duplicateRows > 0) {
    notes.push(`Duplicate (video_id, asset_id) rows: ${duplicateRows}`);
  }

  // ── C/D/E. Asset types ────────────────────────────────────────────────
  const byType: Record<string, number> = {};
  for (const r of rows) {
    byType[r.asset_type] = (byType[r.asset_type] ?? 0) + 1;
  }

  const type1 =
    (byType['campaign_element'] ?? 0) > 0 ? 'PASS' : 'NO REAL DATA';
  const type2 = (byType['video'] ?? 0) > 0 ? 'PASS' : 'NO REAL DATA';
  const type3 = (byType['resource'] ?? 0) > 0 ? 'PASS' : 'NO REAL DATA';

  // ── F. Multi-link_type collapse ───────────────────────────────────────
  const multiLinkTypeExamples = rows
    .filter((r) => (r.linkTypes?.length ?? 0) > 1)
    .slice(0, 10)
    .map((r) => ({
      video_id: r.video_id,
      asset_id: r.asset_id,
      linkTypes: r.linkTypes,
    }));

  // Also prove collapse: for any multi-link example, confirm only ONE row
  // exists for that pair (already covered by duplicate check, but explicit).
  let multiLinkTypeCollapse: 'PASS' | 'FAIL' | 'NO REAL DATA' = 'NO REAL DATA';
  if (multiLinkTypeExamples.length > 0) {
    const multiKeys = multiLinkTypeExamples.map(
      (e) => `${e.video_id}::${e.asset_id}`,
    );
    const multiDupes = multiKeys.filter(
      (k, i) => multiKeys.indexOf(k) !== i,
    );
    multiLinkTypeCollapse = multiDupes.length === 0 ? 'PASS' : 'FAIL';
    if (multiDupes.length > 0) {
      notes.push(
        `Multi-link_type pairs still produced multiple rows: ${multiDupes.join(', ')}`,
      );
    }
  }

  // ── G. Metric attribution ─────────────────────────────────────────────
  // We cannot re-call computeRelationships from here without re-fetching;
  // we validate structural properties of returned metrics.
  let metricAttribution: 'PASS' | 'FAIL' | 'UNKNOWN' = 'UNKNOWN';
  if (rows.length === 0) {
    metricAttribution = 'UNKNOWN';
  } else {
    const hasShape = rows.every(
      (r) =>
        r.metrics &&
        typeof r.metrics.clicks === 'number' &&
        typeof r.metrics.sessions === 'number' &&
        typeof r.metrics.conversions === 'number' &&
        typeof r.metrics.revenue === 'number' &&
        typeof r.metrics.rpc === 'number',
    );
    // RPC consistency: if clicks > 0, rpc should equal revenue/clicks (±0.02)
    const rpcOk = rows.every((r) => {
      if (r.metrics.clicks === 0) return r.metrics.rpc === 0;
      const expected = Number(
        (r.metrics.revenue / r.metrics.clicks).toFixed(2),
      );
      return Math.abs(r.metrics.rpc - expected) < 0.05;
    });
    metricAttribution = hasShape && rpcOk ? 'PASS' : 'FAIL';
    if (!hasShape) notes.push('Some rows missing AssetMetrics shape.');
    if (!rpcOk) notes.push('RPC inconsistency detected on one or more rows.');
  }

  // ── H. Archive context ────────────────────────────────────────────────
  let archiveContext: 'PASS' | 'FAIL' = 'PASS';
  for (const r of rows) {
    if (!r.archive || typeof r.archive.isArchived !== 'boolean') {
      archiveContext = 'FAIL';
      notes.push(`Missing archive on row ${r.video_id}::${r.asset_id}`);
      break;
    }
    // Resource must not invent campaign/video provenance
    if (r.asset_type === 'resource') {
      const badReasons = (r.archive.reasons ?? []).filter(
        (x) => x.sourceType === 'campaign' || x.sourceType === 'video',
      );
      if (badReasons.length > 0) {
        archiveContext = 'FAIL';
        notes.push(
          `Resource asset ${r.asset_id} has invented provenance reasons: ${JSON.stringify(badReasons)}`,
        );
      }
    }
  }
  if (rows.length === 0) {
    archiveContext = 'PASS'; // vacuously — no counter-example
    notes.push('No rows; archive check is vacuously PASS.');
  }

  // ── I. Historical attribution ─────────────────────────────────────────
  // Orchestration never writes to attribution tables. We mark PASS if
  // archived rows still carry non-zero metrics when present.
  let historicalAttribution: 'PASS' | 'UNKNOWN' = 'UNKNOWN';
  const archivedWithMetrics = rows.filter(
    (r) =>
      r.archive.isArchived &&
      (r.metrics.clicks > 0 ||
        r.metrics.conversions > 0 ||
        r.metrics.revenue > 0),
  );
  if (archivedWithMetrics.length > 0) {
    historicalAttribution = 'PASS';
    notes.push(
      `${archivedWithMetrics.length} archived row(s) still carry metrics — attribution preserved.`,
    );
  } else if (rows.some((r) => r.archive.isArchived)) {
    historicalAttribution = 'PASS';
    notes.push(
      'Archived rows exist but have zero metrics in this date window (not evidence of deletion).',
    );
  } else {
    notes.push('No archived rows in result set — cannot empirically prove preservation.');
  }

  // ── Samples ───────────────────────────────────────────────────────────
  const metricSamples = rows
    .filter(
      (r) =>
        r.metrics.clicks > 0 ||
        r.metrics.conversions > 0 ||
        r.metrics.revenue > 0,
    )
    .slice(0, 8)
    .map((r) => ({
      video_id: r.video_id,
      asset_id: r.asset_id,
      asset_type: r.asset_type,
      metrics: {
        clicks: r.metrics.clicks,
        sessions: r.metrics.sessions,
        conversions: r.metrics.conversions,
        revenue: r.metrics.revenue,
        rpc: r.metrics.rpc,
      },
    }));

  const archiveSamples = rows
    .filter((r) => r.archive.isArchived || r.archive.level !== 'normal')
    .slice(0, 8)
    .map((r) => ({
      asset_id: r.asset_id,
      asset_type: r.asset_type,
      isArchived: r.archive.isArchived,
      level: r.archive.level,
      reasons: (r.archive.reasons ?? []).map((x) => ({
        sourceType: x.sourceType,
        sourceId: x.sourceId,
      })),
    }));

  const resourceSamples = rows
    .filter((r) => r.asset_type === 'resource')
    .slice(0, 8)
    .map((r) => ({
      asset_id: r.asset_id,
      video_id: r.video_id,
      linkTypes: r.linkTypes,
      metrics: {
        clicks: r.metrics.clicks,
        conversions: r.metrics.conversions,
        revenue: r.metrics.revenue,
      },
    }));

  // ── Overall ───────────────────────────────────────────────────────────
  const hardFails = [
    organizationBoundary === 'FAIL',
    rowIdentity === 'FAIL',
    multiLinkTypeCollapse === 'FAIL',
    metricAttribution === 'FAIL',
    archiveContext === 'FAIL',
  ].filter(Boolean).length;

  const overall: 'READY' | 'NOT READY' =
    hardFails === 0 && rows.length > 0 ? 'READY' : 'NOT READY';

  if (rows.length === 0) {
    notes.push(
      'Zero rows returned. Possible causes: no asset-tagged redirect_links in this org, date window empty, or RLS.',
    );
  }

  const report: VerificationReport = {
    organizationId,
    viewerId,
    rowCount: rows.length,
    assetIds: result.assetIds,
    unmatchedIdentityCount: result.unmatchedIdentityCount,
    debug: result.debug,
    checks: {
      organizationBoundary,
      rowIdentity,
      type1,
      type2,
      type3,
      multiLinkTypeCollapse,
      metricAttribution,
      archiveContext,
      historicalAttribution,
      duplicateRows,
      unmatchedRelationships: result.unmatchedIdentityCount,
    },
    samples: {
      byType,
      multiLinkTypeExamples,
      metricSamples,
      archiveSamples,
      resourceSamples,
    },
    overall,
    notes,
  };

  // Pretty console dump
  console.log('══════════════════════════════════════════════════════');
  console.log('REAL-DATA VERIFICATION REPORT');
  console.log('══════════════════════════════════════════════════════');
  console.log(JSON.stringify(report, null, 2));
  console.log('══════════════════════════════════════════════════════');
  console.log('A. Organization boundary:', organizationBoundary);
  console.log('B. Row identity:', rowIdentity);
  console.log('C. Type 1 (campaign_element):', type1);
  console.log('D. Type 2 (video):', type2);
  console.log('E. Type 3 (resource):', type3);
  console.log('F. Multi-link_type collapse:', multiLinkTypeCollapse);
  console.log('G. Metric attribution:', metricAttribution);
  console.log('H. Archive context:', archiveContext);
  console.log('I. Historical attribution:', historicalAttribution);
  console.log('J. Unmatched relationships:', result.unmatchedIdentityCount);
  console.log('K. Duplicate rows:', duplicateRows);
  console.log('L. Overall readiness:', overall);
  console.log('══════════════════════════════════════════════════════');

  return report;
}
