/**
 * Phase 3E probe coordination — no shared secret required.
 *
 * Security model:
 * - Client never supplies the next hostname.
 * - Relay recomputes candidates from organization_id + branded_tracking_domains.
 * - group_index only selects within that recomputed list (hard-capped at 3).
 * - target is always re-validated as a redirect_links.token.
 */

import { buildProbeCandidates, type ProbeCandidate } from './cookieParent';
import { supabase } from './supabase';

export const MAX_PROBE_GROUPS = 3;

// The system campaign created automatically for every account, used for
// asset-only promotion (no funnel of its own). Its root_domain is always
// null, so it would never contribute a usable candidate anyway — excluded
// explicitly by name per product convention, not by is_system (other
// legitimate is_system campaigns must NOT be excluded here).
const SYSTEM_ONLY_PROMOTE_ASSET_CAMPAIGN_NAME = 'ONLY PROMOTE ASSET';

interface EligibleCampaignRootRow {
  root_domain: string | null;
}

interface FallbackDomainRow {
  hostname: string;
  relay_token: string;
  root_domain: string;
  is_default: boolean | null;
}

/** One resolved Path B candidate: a root_domain and the single verified
 *  hostname/relay_token chosen to represent it. Deliberately not the
 *  Path A `RelayCandidate` type from relayCandidates.ts — Path B has no
 *  sponsor/marketer/vstrk role concept, and this file should not depend
 *  on the Path A file at all. */
export interface FallbackRelayCandidate {
  hostname: string;
  relay_token: string;
  root_domain: string;
}

/**
 * PATH B — fallback Relay candidate resolver for redirect_links with
 * promotion_id IS NULL.
 *
 * campaigns.organization_id = X
 *   → exclude archived_at IS NOT NULL
 *   → exclude campaign_name = 'ONLY PROMOTE ASSET'
 *   → exclude root_domain IS NULL
 *   → DISTINCT root_domain, capped at MAX_PROBE_GROUPS, sorted for a
 *     deterministic candidate order
 *       → branded_tracking_domains (status='verified', root_domain in set)
 *           → ONE hostname/relay_token per root_domain (prefer is_default,
 *             else alphabetical hostname — same preference order as
 *             buildProbeCandidates() below, just keyed on the stored
 *             root_domain column instead of a computed eTLD+1 guess)
 *
 * organization_id must come from the freshly-resolved redirect_link on
 * every hop (never a client-supplied `org` query param).
 */
export async function resolveOrganizationFallbackCandidates(
  organizationId: string
): Promise<FallbackRelayCandidate[]> {
  if (!organizationId) return [];

  const { data: campaignRows, error: campaignErr } = await supabase
    .from('campaigns')
    .select('root_domain')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .not('root_domain', 'is', null)
    .neq('campaign_name', SYSTEM_ONLY_PROMOTE_ASSET_CAMPAIGN_NAME);

  if (campaignErr) {
    console.error('[probeState] fallback campaign lookup failed:', campaignErr.message);
    return [];
  }

  const uniqueRootDomains = [
    ...new Set(
      ((campaignRows ?? []) as EligibleCampaignRootRow[])
        .map((r) => r.root_domain)
        .filter((r): r is string => !!r)
    ),
  ]
    .sort()
    .slice(0, MAX_PROBE_GROUPS);

  if (uniqueRootDomains.length === 0) return [];

  const { data: domainRows, error: domainErr } = await supabase
    .from('branded_tracking_domains')
    .select('hostname, relay_token, root_domain, is_default')
    .eq('organization_id', organizationId)
    .eq('status', 'verified')
    .in('root_domain', uniqueRootDomains);

  if (domainErr) {
    console.error('[probeState] fallback domain lookup failed:', domainErr.message);
    return [];
  }

  const byRoot = new Map<string, FallbackDomainRow[]>();
  for (const row of (domainRows ?? []) as FallbackDomainRow[]) {
    if (!row.hostname || !row.relay_token || !row.root_domain) continue;
    const list = byRoot.get(row.root_domain) ?? [];
    list.push(row);
    byRoot.set(row.root_domain, list);
  }

  const candidates: FallbackRelayCandidate[] = [];
  for (const rootDomain of uniqueRootDomains) {
    const rows = byRoot.get(rootDomain);
    if (!rows || rows.length === 0) continue;

    rows.sort((a, b) => {
      if (!!a.is_default !== !!b.is_default) return a.is_default ? -1 : 1;
      return a.hostname.localeCompare(b.hostname);
    });

    const pick = rows[0];
    candidates.push({
      hostname: pick.hostname,
      relay_token: pick.relay_token,
      root_domain: pick.root_domain,
    });
  }

  return candidates;
}

/** Path B's own URL builder — mirrors buildRelayCandidateUrl() in
 *  relayCandidates.ts in shape only. Kept separate on purpose so this
 *  file has no import from the Path A file. */
export function buildFallbackCandidateUrl(
  candidate: FallbackRelayCandidate,
  targetToken: string,
  candidateIndex: number
): string {
  const url = new URL(`https://${candidate.hostname}/r/${candidate.relay_token}`);
  url.searchParams.set('target', targetToken);
  url.searchParams.set('gi', String(candidateIndex));
  return url.toString();
}

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeOrgId(raw: string | null): raw is string {
  return typeof raw === 'string' && ORG_UUID_RE.test(raw);
}

export function isSafeGroupIndex(raw: string | null): number | null {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= MAX_PROBE_GROUPS) return null;
  return n;
}

/** Load verified branded domains and build ≤3 cookie-parent probe candidates. */
export async function loadProbeCandidates(
  organizationId: string
): Promise<ProbeCandidate[]> {
  const { data, error } = await supabase
    .from('branded_tracking_domains')
    .select('hostname, relay_token, status, is_default')
    .eq('organization_id', organizationId)
    .eq('status', 'verified');

  if (error || !data) {
    console.error('[probeState] loadProbeCandidates failed:', error?.message);
    return [];
  }

  return buildProbeCandidates(data, MAX_PROBE_GROUPS);
}

export function buildProbeUrl(
  candidate: ProbeCandidate,
  targetToken: string,
  organizationId: string,
  groupIndex: number
): string {
  const url = new URL(`https://${candidate.hostname}/r/${candidate.relay_token}`);
  url.searchParams.set('target', targetToken);
  url.searchParams.set('org', organizationId);
  url.searchParams.set('gi', String(groupIndex));
  return url.toString();
}

/**
 * Platform return URL after probe.
 * When probeExhausted is true, attach vt_probe=exhausted so Track will not
 * restart discovery on the clean landing (loop guard).
 */
export function buildCleanTargetUrl(
  targetToken: string,
  options?: { probeExhausted?: boolean }
): string {
  const url = new URL(`https://www.vstrk.com/${targetToken}`);
  if (options?.probeExhausted) {
    url.searchParams.set('vt_probe', 'exhausted');
  }
  return url.toString();
}

/** Fixed platform-only continuation entry (Step 2). Does not use branded relay_token. */
export function buildPlatformCandidateUrl(
  targetToken: string,
  organizationId: string
): string {
  const url = new URL('https://www.vstrk.com/r/platform');
  url.searchParams.set('target', targetToken);
  url.searchParams.set('org', organizationId);
  return url.toString();
}

