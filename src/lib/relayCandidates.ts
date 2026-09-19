/**
 * Promotion-scoped Relay candidate resolver.
 *
 * LOCKED architecture (do not reintroduce org-wide domain discovery here):
 *   redirect_link.promotion_id / asset_id
 *     → promotions.assignment_id
 *     → assignment_assets (assignment_id + asset_id)   [assignment-time state]
 *     → promotion_assets  (promotion_id + asset_id)    [promotion-specific state]
 *     → effective sponsor id = promotion_assets.selected_sponsor_domain_id
 *                               ?? assignment_assets.selected_sponsor_domain_id
 *     → effective marketer id = promotion_assets.selected_marketer_domain_id
 *     → branded_tracking_domains (by id) → { hostname, relay_token, root_domain }
 *
 * root_domain is carried through for the cookie-scope fix elsewhere
 * (visitorCookie.ts) — it is NEVER used to construct the probe URL here.
 * The probe URL is always https://{hostname}/r/{relay_token}.
 *
 * VSTRK is a fixed platform candidate, not a branded_tracking_domains row —
 * this matches the existing buildPlatformCandidateUrl() convention in
 * probeState.ts (https://www.vstrk.com/r/platform), not a new invention.
 * See "Assumptions" in the accompanying report for why.
 */

import { supabase } from './supabase';

export type RelayCandidateRole = 'sponsor' | 'marketer' | 'vstrk';

export interface RelayCandidate {
  role: RelayCandidateRole;
  hostname: string;
  relay_token: string;
  /** Carried through for cookie Domain= scoping. Never used for probe addressing. */
  root_domain: string;
}

export interface RelayCandidateResolution {
  candidates: RelayCandidate[];
  meta: {
    promotionId: string;
    assetId: string;
    assignmentId: string | null;
    effectiveSponsorDomainId: string | null;
    sponsorSource: 'promotion_assets' | 'assignment_assets' | null;
    effectiveMarketerDomainId: string | null;
    // Flags are surfaced for visibility / future gating decisions but are
    // NOT used to exclude a candidate in this resolver — see report.
    flags: {
      assignment_allow_sponsor_domain: boolean | null;
      assignment_allow_marketer_domain: boolean | null;
      assignment_allow_vstrk_domain: boolean | null;
      promotion_use_marketer_domain: boolean | null;
      promotion_use_vstrk_domain: boolean | null;
      promotion_allow_collaborator_domains: boolean | null;
    };
  };
}

interface PromotionRow {
  id: string;
  assignment_id: string | null;
}

interface AssignmentAssetRow {
  allow_marketer_domain: boolean;
  allow_sponsor_domain: boolean;
  allow_vstrk_domain: boolean;
  selected_sponsor_domain_id: string | null;
}

interface PromotionAssetRow {
  allow_collaborator_domains: boolean;
  use_marketer_domain: boolean;
  selected_sponsor_domain_id: string | null;
  use_vstrk_domain: boolean;
  selected_marketer_domain_id: string | null;
}

interface BrandedDomainRow {
  id: string;
  hostname: string;
  status: string;
  relay_token: string;
  root_domain: string;
}

/**
 * Fixed platform fallback. Not resolved through branded_tracking_domains —
 * mirrors probeState.ts's buildPlatformCandidateUrl().
 */
const VSTRK_CANDIDATE: RelayCandidate = {
  role: 'vstrk',
  hostname: 'www.vstrk.com',
  relay_token: 'platform',
  root_domain: 'vstrk.com',
};

/**
 * Resolve a single branded_tracking_domains row by id. Only 'verified'
 * domains are treated as usable candidates (unverified domains are not
 * guaranteed to be routable, mirroring listVerifiedBrandedDomains()'s
 * existing verified-only convention elsewhere in the codebase).
 */
async function resolveBrandedDomainById(
  domainId: string
): Promise<BrandedDomainRow | null> {
  const { data, error } = await supabase
    .from('branded_tracking_domains')
    .select('id, hostname, status, relay_token, root_domain')
    .eq('id', domainId)
    .maybeSingle();

  if (error) {
    console.error('[relayCandidates] branded domain lookup failed:', error.message);
    return null;
  }

  if (!data || data.status !== 'verified') return null;
  return data as BrandedDomainRow;
}

/**
 * Resolve the ordered, promotion-specific Relay candidates for a given
 * (promotion_id, asset_id) pair: sponsor → marketer → vstrk, skipping any
 * candidate whose selected domain id is null or does not resolve to a
 * verified branded_tracking_domains row. VSTRK is always present as the
 * final candidate.
 *
 * Returns null only on a hard failure to resolve the promotion itself.
 */
/**
 * Build the next-hop probe URL for a resolved candidate (sponsor, marketer,
 * or vstrk — uniform, since all three carry hostname + relay_token).
 * candidateIndex is this candidate's position in the ordered array returned
 * by resolvePromotionRelayCandidates, so the next hop can recompute the
 * same list fresh from `target` and know where to resume.
 */
export function buildRelayCandidateUrl(
  candidate: RelayCandidate,
  targetToken: string,
  candidateIndex: number
): string {
  const url = new URL(`https://${candidate.hostname}/r/${candidate.relay_token}`);
  url.searchParams.set('target', targetToken);
  url.searchParams.set('gi', String(candidateIndex));
  return url.toString();
}

export async function resolvePromotionRelayCandidates(
  promotionId: string,
  assetId: string
): Promise<RelayCandidateResolution | null> {
  if (!promotionId || !assetId) return null;

  // 1. promotions.assignment_id
  const { data: promotionRow, error: promotionErr } = await supabase
    .from('promotions')
    .select('id, assignment_id')
    .eq('id', promotionId)
    .maybeSingle();

  if (promotionErr || !promotionRow) {
    console.error(
      '[relayCandidates] promotion lookup failed:',
      promotionErr?.message ?? 'not found'
    );
    return null;
  }

  const assignmentId = (promotionRow as PromotionRow).assignment_id;

  // 2. assignment_assets, keyed by BOTH assignment_id and asset_id
  let assignmentAssetRow: AssignmentAssetRow | null = null;
  if (assignmentId) {
    const { data, error } = await supabase
      .from('assignment_assets')
      .select(
        'allow_marketer_domain, allow_sponsor_domain, allow_vstrk_domain, selected_sponsor_domain_id'
      )
      .eq('assignment_id', assignmentId)
      .eq('asset_id', assetId)
      .maybeSingle();

    if (error) {
      console.error('[relayCandidates] assignment_assets lookup failed:', error.message);
    } else {
      assignmentAssetRow = data ?? null;
    }
  }

  // 3. promotion_assets, keyed by BOTH promotion_id and asset_id
  const { data: promotionAssetRow, error: promotionAssetErr } = await supabase
    .from('promotion_assets')
    .select(
      'allow_collaborator_domains, use_marketer_domain, selected_sponsor_domain_id, use_vstrk_domain, selected_marketer_domain_id'
    )
    .eq('promotion_id', promotionId)
    .eq('asset_id', assetId)
    .maybeSingle();

  if (promotionAssetErr) {
    console.error(
      '[relayCandidates] promotion_assets lookup failed:',
      promotionAssetErr.message
    );
  }

  const paRow = (promotionAssetRow ?? null) as PromotionAssetRow | null;

  // 4. Effective sponsor id — LOCKED precedence:
  //    promotion_assets wins when non-null, else fall back to assignment_assets.
  let effectiveSponsorDomainId: string | null = null;
  let sponsorSource: 'promotion_assets' | 'assignment_assets' | null = null;

  if (paRow?.selected_sponsor_domain_id) {
    effectiveSponsorDomainId = paRow.selected_sponsor_domain_id;
    sponsorSource = 'promotion_assets';
  } else if (assignmentAssetRow?.selected_sponsor_domain_id) {
    effectiveSponsorDomainId = assignmentAssetRow.selected_sponsor_domain_id;
    sponsorSource = 'assignment_assets';
  }

  // 5. Marketer id — ONLY source is promotion_assets.
  const effectiveMarketerDomainId = paRow?.selected_marketer_domain_id ?? null;

  // 7. Resolve selected ids through branded_tracking_domains.
  const [sponsorDomain, marketerDomain] = await Promise.all([
    effectiveSponsorDomainId ? resolveBrandedDomainById(effectiveSponsorDomainId) : null,
    effectiveMarketerDomainId ? resolveBrandedDomainById(effectiveMarketerDomainId) : null,
  ]);

  // 8. Ordered candidates: sponsor → marketer → vstrk, non-null only.
  const candidates: RelayCandidate[] = [];

  if (sponsorDomain) {
    candidates.push({
      role: 'sponsor',
      hostname: sponsorDomain.hostname,
      relay_token: sponsorDomain.relay_token,
      root_domain: sponsorDomain.root_domain,
    });
  }

  if (marketerDomain) {
    candidates.push({
      role: 'marketer',
      hostname: marketerDomain.hostname,
      relay_token: marketerDomain.relay_token,
      root_domain: marketerDomain.root_domain,
    });
  }

  // VSTRK is always the final candidate.
  candidates.push(VSTRK_CANDIDATE);

  return {
    candidates,
    meta: {
      promotionId,
      assetId,
      assignmentId,
      effectiveSponsorDomainId,
      sponsorSource,
      effectiveMarketerDomainId,
      flags: {
        assignment_allow_sponsor_domain: assignmentAssetRow?.allow_sponsor_domain ?? null,
        assignment_allow_marketer_domain: assignmentAssetRow?.allow_marketer_domain ?? null,
        assignment_allow_vstrk_domain: assignmentAssetRow?.allow_vstrk_domain ?? null,
        promotion_use_marketer_domain: paRow?.use_marketer_domain ?? null,
        promotion_use_vstrk_domain: paRow?.use_vstrk_domain ?? null,
        promotion_allow_collaborator_domains: paRow?.allow_collaborator_domains ?? null,
      },
    },
  };
}
