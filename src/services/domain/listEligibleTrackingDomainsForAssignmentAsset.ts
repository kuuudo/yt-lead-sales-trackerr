/**
 * Phase 2A MVP — Marketer/Sponsor read path for CURRENT Campaign domain eligibility.
 *
 * Wraps SECURITY DEFINER RPC:
 *   list_eligible_tracking_domains_for_assignment_asset(assignment_id, asset_id)
 *
 * Campaign is the authority for NEW-link tracking domains.
 * Does NOT use allow_vstrk_domain / assignment_tracking_domains.
 * Does NOT write or backfill redirect_links.
 */

import { supabase } from '../../lib/supabase';

export type EligibleTrackingHost = {
  id: string;
  hostname: string;
};

export type EligibleTrackingMode =
  | 'vstrk' // root_domain null → trackingDomainId = null
  | 'single' // auto-select the only host
  | 'multi' // user must pick
  | 'misconfigured' // root set but zero verified hosts — do NOT use VSTRK
  | 'unauthorized'; // 0 rows / no campaign

export type EligibleTrackingResult = {
  campaignId: string | null;
  rootDomain: string | null;
  hosts: EligibleTrackingHost[];
  mode: EligibleTrackingMode;
  isSystemCampaign: boolean;
};

type RpcRow = {
  campaign_id: string | null;
  root_domain: string | null;
  domain_id: string | null;
  hostname: string | null;
  is_system_campaign: boolean | null;
};

/**
 * Normalize RPC rows into a single eligibility decision for one Assignment asset.
 */
export function normalizeEligibleTrackingRows(
  rows: RpcRow[] | null | undefined
): EligibleTrackingResult {
  if (!rows || rows.length === 0) {
    return {
      campaignId: null,
      rootDomain: null,
      hosts: [],
      mode: 'unauthorized',
      isSystemCampaign: false,
    };
  }

  const campaignId = rows[0].campaign_id ?? null;
  const rootDomain = rows[0].root_domain ?? null;
  const isSystemCampaign = !!rows[0].is_system_campaign;

  const hosts: EligibleTrackingHost[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.domain_id && r.hostname && !seen.has(r.domain_id)) {
      seen.add(r.domain_id);
      hosts.push({ id: r.domain_id, hostname: r.hostname });
    }
  }

  // Sentinel: root null → VSTRK (even if hosts somehow empty)
  if (rootDomain == null || String(rootDomain).trim() === '') {
    return {
      campaignId,
      rootDomain: null,
      hosts: [],
      mode: 'vstrk',
      isSystemCampaign,
    };
  }

  if (hosts.length === 0) {
    return {
      campaignId,
      rootDomain,
      hosts: [],
      mode: 'misconfigured',
      isSystemCampaign,
    };
  }

  if (hosts.length === 1) {
    return {
      campaignId,
      rootDomain,
      hosts,
      mode: 'single',
      isSystemCampaign,
    };
  }

  return {
    campaignId,
    rootDomain,
    hosts,
    mode: 'multi',
    isSystemCampaign,
  };
}

/**
 * Default trackingDomainId for NEW links from eligibility (no random multi pick).
 * - vstrk → null
 * - single → that id
 * - multi → keep previous if still eligible, else null (UI must force pick)
 * - misconfigured / unauthorized → null (caller should block branded save)
 */
export function defaultTrackingDomainIdFromEligible(
  result: EligibleTrackingResult,
  previousId?: string | null
): string | null {
  if (result.mode === 'vstrk') return null;
  if (result.mode === 'single') return result.hosts[0]?.id ?? null;
  if (result.mode === 'multi') {
    if (previousId && result.hosts.some(h => h.id === previousId)) return previousId;
    return null;
  }
  return null;
}

export async function listEligibleTrackingDomainsForAssignmentAsset(
  assignmentId: string,
  assetId: string
): Promise<EligibleTrackingResult> {
  if (!assignmentId || !assetId) {
    return normalizeEligibleTrackingRows([]);
  }

  const { data, error } = await supabase.rpc(
    'list_eligible_tracking_domains_for_assignment_asset',
    {
      p_assignment_id: assignmentId,
      p_asset_id: assetId,
    }
  );

  if (error) {
    console.error(
      '[listEligibleTrackingDomainsForAssignmentAsset] RPC failed',
      { assignmentId, assetId, message: error.message }
    );
    return normalizeEligibleTrackingRows([]);
  }

  return normalizeEligibleTrackingRows((data as RpcRow[]) ?? []);
}
