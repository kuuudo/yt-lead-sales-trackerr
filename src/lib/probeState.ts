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

/** Clean platform return URL (no handoff params). */
export function buildCleanTargetUrl(targetToken: string): string {
  return `https://www.vstrk.com/${targetToken}`;
}
