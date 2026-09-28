/**
 * src/lib/journeyDomainPreflight.ts
 *
 * Pre-save Journey Domain validation for Videos.tsx (Track New Content).
 * Runs BEFORE createVideo() so an invalid domain can never leave an orphan
 * Video row behind.
 *
 * Rules implemented here (see docs/journey-domain-implementation.md):
 *  - The selected domain is resolved from the SAME id→hostname sources the UI
 *    offers. A non-null domain id that cannot be resolved is an ERROR — it never
 *    silently falls back to vstrk.com.
 *  - MAX 2 distinct normalized hostnames is evaluated PER downstream branch/path.
 *    Branches are never unioned into one budget.
 *  - Only video-turn assets get journey_domains. Terminal assets get null.
 *
 * Does NOT modify structuralJourneyDomains.ts. It only consumes its exports
 * (branches already keep per-branch existingDomains).
 *
 * UNRESOLVED (documented, not solved here): what a SINGLE edge should store when
 * the downstream branches carry DIFFERENT domain sets. See
 * `evaluateNewEdgeAgainstDownstream` — conservative interim rule.
 */

import { supabase } from './supabase';
import {
  VSTRK_HOSTNAME,
  normalizeTrackingHostname,
  hostnameKey,
  buildJourneyDomainsForNewEdge,
  filterCandidatesByJourneyBudget,
  loadStructuralDownstreamForAsset,
  type StructuralDownstreamResult,
} from './structuralJourneyDomains';

export type DomainOption = { id: string; hostname: string };

export type JourneyPreflightAsset = {
  assetId: string;
  /** Human label for error messages. */
  label: string;
  /** The user's selection: a domain id, or null (= "no explicit domain"). */
  domainId: string | null;
  /**
   * Every id→hostname source the UI actually offers for THIS asset
   * (marketer + own verified + shared + sponsor). Built by the caller.
   */
  domainSources: DomainOption[];
};

export type JourneyEdgeEvaluation = {
  ok: boolean;
  hostname: string;
  /** Value to stamp on the new edge. null = not a video-turn asset. */
  journeyDomains: string[] | null;
  /** Branches (0-based index) where adding `hostname` would exceed 2 domains. */
  blockedBranches: { index: number; existingDomains: string[] }[];
  /** True when downstream branches carry different domain sets (UNRESOLVED case). */
  branchesDiverge: boolean;
};

/**
 * Resolve a NON-null selected domain id to a normalized hostname.
 * Throws when the id is not present in any offered source.
 */
export function resolveSelectedHostnameOrThrow(
  domainId: string,
  domainSources: DomainOption[],
  label: string
): string {
  const hit = domainSources.find((d) => d.id === domainId);
  if (!hit?.hostname) {
    throw new Error(
      `Could not resolve the tracking domain you selected for "${label}". ` +
        `Please re-select a domain for this asset.`
    );
  }
  return normalizeTrackingHostname(hit.hostname);
}

/**
 * domainId === null → effective hostname per product rule:
 *   the asset's Campaign landing_page tracking domain if it has one,
 *   otherwise VSTRK.
 *
 * BEST-EFFORT ONLY: reads via the caller's RLS, so a cross-org (shared) asset's
 * campaign may be unreadable → falls back to VSTRK here. The authoritative
 * check is the fail-closed guard in createRedirectLink (redirects.ts), which
 * compares against the hostname actually written.
 *
 * NOTE: createRedirectLink() still falls back to the ORG DEFAULT domain when no
 * domain id is passed. That mismatch is an open question — see the ledger.
 */
export async function resolveNullSelectionHostname(assetId: string): Promise<string> {
  try {
    const { data: videoRow } = await supabase
      .from('videos')
      .select('campaign_id')
      .eq('asset_id', assetId)
      .maybeSingle();
    if (!videoRow?.campaign_id) return VSTRK_HOSTNAME;

    const { data: campaignRow } = await supabase
      .from('campaigns')
      .select('landing_page_tracking_domain_id')
      .eq('id', videoRow.campaign_id)
      .maybeSingle();
    const domainId = campaignRow?.landing_page_tracking_domain_id as string | null | undefined;
    if (!domainId) return VSTRK_HOSTNAME;

    const { data: domainRow } = await supabase
      .from('branded_tracking_domains')
      .select('hostname')
      .eq('id', domainId)
      .eq('status', 'verified')
      .maybeSingle();
    return domainRow?.hostname
      ? normalizeTrackingHostname(domainRow.hostname)
      : VSTRK_HOSTNAME;
  } catch (e) {
    console.warn('[journeyDomainPreflight] null-selection resolve failed', assetId, e);
    return VSTRK_HOSTNAME;
  }
}

/**
 * Per-branch MAX-2 evaluation for a NEW edge that will point at the video-turn
 * asset described by `downstream`.
 *
 * Check  : for EVERY downstream branch b → |b.existingDomains ∪ {hostname}| ≤ 2
 *          (delegates to filterCandidatesByJourneyBudget per branch).
 *
 * Stamp  : (interim, conservative — UNRESOLVED architecture question)
 *   - no downstream branches           → [hostname]
 *   - all branches share ONE domain set → that set ∪ {hostname}
 *   - branches carry DIFFERENT sets     → [hostname] only (never a cross-branch union)
 *   - any result with > 2 entries       → [hostname] only
 */
export function evaluateNewEdgeAgainstDownstream(
  downstream: StructuralDownstreamResult,
  hostnameRaw: string
): JourneyEdgeEvaluation {
  const hostname = normalizeTrackingHostname(hostnameRaw);

  if (!downstream.isVideoTurn) {
    return {
      ok: true,
      hostname,
      journeyDomains: null,
      blockedBranches: [],
      branchesDiverge: false,
    };
  }

  const branches = downstream.branches;
  if (branches.length === 0) {
    return {
      ok: true,
      hostname,
      journeyDomains: [hostname],
      blockedBranches: [],
      branchesDiverge: false,
    };
  }

  const blockedBranches: JourneyEdgeEvaluation['blockedBranches'] = [];
  branches.forEach((b, index) => {
    const { allowed } = filterCandidatesByJourneyBudget(b.existingDomains, [hostname]);
    if (allowed.length === 0) {
      blockedBranches.push({ index, existingDomains: b.existingDomains });
    }
  });

  const setKeys = branches.map((b) =>
    b.existingDomains.map(hostnameKey).sort().join('|')
  );
  const branchesDiverge = new Set(setKeys).size > 1;

  if (blockedBranches.length > 0) {
    return { ok: false, hostname, journeyDomains: null, blockedBranches, branchesDiverge };
  }

  let journeyDomains = branchesDiverge
    ? [hostname]
    : buildJourneyDomainsForNewEdge(branches[0].existingDomains, hostname);
  if (journeyDomains.length > 2) journeyDomains = [hostname];

  return { ok: true, hostname, journeyDomains, blockedBranches: [], branchesDiverge };
}

/**
 * Orchestrator called by Videos.tsx handleSave BEFORE createVideo().
 * Loads downstream FRESH per asset (never trusts a possibly-loading UI cache),
 * resolves the hostname, evaluates per-branch MAX 2, and returns the
 * journey_domains to stamp per asset. Throws a user-facing Error when blocked.
 */
export async function preflightJourneyDomains(
  assets: JourneyPreflightAsset[]
): Promise<Map<string, string[] | null>> {
  const results = await Promise.all(
    assets.map(async (asset) => {
      const downstream = await loadStructuralDownstreamForAsset(asset.assetId);
      if (!downstream.isVideoTurn) {
        return [asset.assetId, null] as const;
      }

      const hostname = asset.domainId
        ? resolveSelectedHostnameOrThrow(asset.domainId, asset.domainSources, asset.label)
        : await resolveNullSelectionHostname(asset.assetId);

      const evaluation = evaluateNewEdgeAgainstDownstream(downstream, hostname);
      if (!evaluation.ok) {
        const detail = evaluation.blockedBranches
          .map((b) => `journey ${b.index + 1} already uses ${b.existingDomains.join(', ')}`)
          .join('; ');
        throw new Error(
          `Journey domain blocked for "${asset.label}": ${evaluation.hostname} would give a ` +
            `downstream journey a 3rd distinct domain (${detail}). ` +
            `Choose a domain that journey already uses.`
        );
      }
      return [asset.assetId, evaluation.journeyDomains] as const;
    })
  );

  return new Map(results);
}
