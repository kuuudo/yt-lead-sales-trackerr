// ─────────────────────────────────────────────────────────────────────────────
// src/services/attribution/resolvePixelConversionProvenance.ts
//
// PASS 1 (tonight) — Pixel Purchase backward tracing ONLY.
//
// Scope, deliberately narrow (see BridgeToken_FirstTouchConstraint.md and
// tonight's discussion):
//
//   Pixel Purchase
//       ↓
//   session_id
//       ↓
//   verified journey evidence (via existing journeyAnalyticsEngine.ts,
//   UNMODIFIED — this file imports buildPurchaseJourney and reads its
//   output; it does not re-implement or duplicate the Evidence Contract /
//   Attribution Verification logic)
//       ↓
//   direct asset evidence: event.asset_id, or event.redirect_link_id →
//   redirect_links.asset_id — already resolved and attached to each
//   JourneyStep by buildPurchaseJourney(), so this file does NOT do its own
//   redirect_links join. It only reads step.asset_id / step.redirectLink.asset_id.
//       ↓
//   Bridge Token evidence where available, via existing
//   resolveBridgeAttribution.ts (UNMODIFIED). This file does NOT turn that
//   resolver into a general attribution engine — it only calls it once per
//   caller-supplied candidate bridge event id and reads its targetEvents.
//
// EXPLICITLY OUT OF SCOPE FOR TONIGHT (do not re-implement here):
//   - Stripe Purchase backward tracing — a separate pass, tomorrow.
//   - A true reverse lookup "conversion.session_id -> which Bridge Event(s)
//     touched it" across ALL bridge events for an org/date range. That would
//     require either a new indexed query or scanning every bridge_token
//     events row, and is explicitly deferred — see findBridgeEvidenceForSession()
//     below, which instead takes a caller-supplied LIST of candidate bridge
//     event ids. Building the full reverse index is tomorrow's work.
//   - Deciding a priority rule when direct evidence and bridge evidence both
//     exist for the same conversion and name different assets. This file
//     NEVER picks a winner — it returns both pieces of evidence, flags
//     whether they agree, and leaves the decision to the caller / a human.
//     Discovered for real in tonight's example: the same Pixel Purchase's
//     session was independently reachable via (a) a direct redirect_link_id
//     evidence chain naming asset f28e2a0b..., and (b) a Bridge Token
//     targetEvents match naming a DIFFERENT asset cd08c4ec... in a DIFFERENT
//     organization. Both are real. Neither is invalidated by the other.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildPurchaseJourney,
  type CanonicalConversionRow,
  type JourneyEvent,
  type JourneyRedirectLinkRow,
  type CampaignElementAssetRow,
  type Journey,
  type JourneyStep,
} from '../../lib/journeyAnalyticsEngine';

import {
  resolveBridgeAttribution,
  type BridgeEvent,
  type TargetEventResult,
} from './resolveBridgeAttribution';

// ═════════════════════════════════════════════════════════════════════════════
// INPUT TYPES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Everything buildPurchaseJourney() needs, unchanged from journeyAnalyticsEngine.ts.
 * This file does not redefine or reshape these — it passes them straight through.
 */
export interface JourneyInputs {
  events: JourneyEvent[];
  redirectLinks: JourneyRedirectLinkRow[];
  campaignElementAssets: CampaignElementAssetRow[];
}

// ═════════════════════════════════════════════════════════════════════════════
// OUTPUT TYPES
// ═════════════════════════════════════════════════════════════════════════════

export type DirectAssetEvidenceSource =
  /** step.asset_id was present directly on the events row. */
  | 'event_asset_id'
  /** step.asset_id was null, but step.redirectLink.asset_id resolved. */
  | 'redirect_link_asset_id';

export interface DirectAssetEvidence {
  /** The verified JourneyStep this evidence came from — kept whole, not summarized, so a caller/human can inspect exactly what the journey engine verified. */
  step: JourneyStep;
  assetId: string;
  source: DirectAssetEvidenceSource;
}

export interface BridgeSessionEvidence {
  bridgeEventId: string;
  bridgeToken: string;
  sourceVideoId: string | null;
  sourceSessionId: string | null;
  targetAssetId: string;
  /** The specific target-side event (in the conversion's own session) that resolveBridgeAttribution() proved came after this bridge event. There can be more than one; all matches are kept, oldest first. */
  matchedTargetEvents: TargetEventResult[];
}

export type PixelConversionProvenanceStatus =
  /** Verified journey evidence named an asset; no candidate bridge event's target-events touched this session. */
  | 'direct_evidence_only'
  /** No verified journey step named an asset, but a candidate bridge event's target-events matched this session. */
  | 'bridge_evidence_only'
  /**
   * BOTH direct journey evidence and bridge evidence exist for this
   * conversion's session. `assetIdsAgree` says whether they name the same
   * asset. Neither this file nor its caller picks a winner — see file header.
   * This status is intentionally the same regardless of agreement; the
   * important fact is "two independent evidence sources fired," and the
   * agreement bit is reported separately rather than folded into a
   * different, more reassuring-sounding status name.
   */
  | 'direct_and_bridge_both_present'
  /** Neither source produced anything usable. */
  | 'no_evidence';

export interface PixelConversionProvenanceResult {
  conversionId: string;
  sessionId: string | null;
  status: PixelConversionProvenanceStatus;
  /** true/false only when status === 'direct_and_bridge_both_present'; null otherwise. */
  assetIdsAgree: boolean | null;
  /** The full, unmodified Journey — never re-derived or summarized away. Includes journey.meta.attributionSummary for the rejected/ambiguous counts. */
  journey: Journey;
  /** 0+ verified journey steps that resolved to an asset, in chronological (journey) order. */
  directEvidence: DirectAssetEvidence[];
  /** 0+ candidate bridge events whose target-event fan-out touched this conversion's session. Empty if bridgeEventIds was empty/omitted — that is NOT the same claim as "no bridge touched this session," see notes. */
  bridgeEvidence: BridgeSessionEvidence[];
  /** Plain-language caveats about what this specific run could and couldn't check. Always present so a caller never has to re-derive limitations from the shape of the result. */
  notes: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
// DIRECT EVIDENCE — reads buildPurchaseJourney() output; does no joins itself.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * extractDirectAssetEvidence
 *
 * Walks the already-verified journey.steps (journeyAnalyticsEngine.ts has
 * already applied session boundary + temporal causality + Evidence Contract
 * + Attribution Verification — this function trusts that and does no
 * additional filtering). For each step, prefers the event's OWN asset_id;
 * falls back to the step's resolved redirectLink.asset_id. Both are already
 * populated by buildPurchaseJourney() — this function reads, never joins.
 *
 * A step with neither is simply skipped (e.g. a Tier A consultation/sales_call
 * event with no asset_id and no redirect_link_id — real, verified evidence
 * of a touchpoint, just not evidence of WHICH asset).
 */
export function extractDirectAssetEvidence(journey: Journey): DirectAssetEvidence[] {
  const evidence: DirectAssetEvidence[] = [];
  for (const step of journey.steps) {
    if (step.asset_id) {
      evidence.push({ step, assetId: step.asset_id, source: 'event_asset_id' });
      continue;
    }
    if (step.redirectLink?.asset_id) {
      evidence.push({ step, assetId: step.redirectLink.asset_id, source: 'redirect_link_asset_id' });
    }
  }
  return evidence;
}

// ═════════════════════════════════════════════════════════════════════════════
// BRIDGE EVIDENCE — calls resolveBridgeAttribution() per candidate id.
//
// KNOWN LIMITATION (explicitly deferred to tomorrow, per tonight's scope):
// this function does NOT discover candidate bridge events on its own. It
// requires the caller to supply `bridgeEventIds` — e.g. from a simple
// `events` query filtered to `bridge_token IS NOT NULL` within a reasonable
// org/date bound. A true "scan every bridge event for this org" reverse
// index is real work (how far back? which orgs, given Bridge can cross
// organizations as seen tonight?) and is intentionally NOT built here.
// Passing an empty/omitted list means "no candidates were checked," which
// this function surfaces via `notes`, not by silently returning [].
// ═════════════════════════════════════════════════════════════════════════════

export async function findBridgeEvidenceForSession(
  sessionId: string,
  bridgeEventIds: string[],
): Promise<{ evidence: BridgeSessionEvidence[]; checkedCount: number }> {
  const evidence: BridgeSessionEvidence[] = [];

  for (const bridgeEventId of bridgeEventIds) {
    const result = await resolveBridgeAttribution(bridgeEventId);
    if (!result || !result.bridgeEvent.targetAssetId) continue;

    const matches = result.targetEvents.filter((e) => e.sessionId === sessionId);
    if (matches.length === 0) continue;

    evidence.push({
      bridgeEventId: result.bridgeEvent.id,
      bridgeToken: result.bridgeEvent.bridgeToken,
      sourceVideoId: result.bridgeEvent.sourceVideoId,
      sourceSessionId: result.bridgeEvent.sourceSessionId,
      targetAssetId: result.bridgeEvent.targetAssetId,
      matchedTargetEvents: matches,
    });
  }

  return { evidence, checkedCount: bridgeEventIds.length };
}

// ═════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * resolvePixelConversionProvenance
 *
 * The single entry point for tonight's scope: Pixel Purchase → verified
 * journey evidence → (optional) Bridge Token evidence. Does not decide
 * Asset vs Content vs Unknown — that classification step (resolveConversionAttribution)
 * is still Step 3, not built tonight. This only assembles and reports the
 * evidence needed to make that decision later.
 *
 * `bridgeEventIds` is optional and caller-supplied — see
 * findBridgeEvidenceForSession()'s header for why a full reverse scan isn't
 * done here.
 */
export async function resolvePixelConversionProvenance(
  conversion: CanonicalConversionRow,
  journeyInputs: JourneyInputs,
  bridgeEventIds: string[] = [],
): Promise<PixelConversionProvenanceResult> {
  const notes: string[] = [];

  const journey = buildPurchaseJourney(
    conversion,
    journeyInputs.events,
    journeyInputs.redirectLinks,
    journeyInputs.campaignElementAssets,
  );

  const directEvidence = extractDirectAssetEvidence(journey);

  let bridgeEvidence: BridgeSessionEvidence[] = [];
  if (!conversion.session_id) {
    notes.push('Conversion has no session_id — bridge evidence cannot be checked (same reason journeyAnalyticsEngine.ts returns no steps).');
  } else if (bridgeEventIds.length === 0) {
    notes.push('No candidate bridge event ids were supplied — bridge evidence was NOT checked, this is not the same as "no bridge evidence exists." Reverse discovery of candidates is deferred (see file header).');
  } else {
    const { evidence, checkedCount } = await findBridgeEvidenceForSession(conversion.session_id, bridgeEventIds);
    bridgeEvidence = evidence;
    notes.push(`Checked ${checkedCount} candidate bridge event id(s) supplied by the caller.`);
  }

  const hasDirect = directEvidence.length > 0;
  const hasBridge = bridgeEvidence.length > 0;

  let status: PixelConversionProvenanceStatus;
  let assetIdsAgree: boolean | null = null;

  if (hasDirect && hasBridge) {
    status = 'direct_and_bridge_both_present';
    const directAssetIds = new Set(directEvidence.map((e) => e.assetId));
    const bridgeAssetIds = new Set(bridgeEvidence.map((e) => e.targetAssetId));
    assetIdsAgree = [...directAssetIds].some((id) => bridgeAssetIds.has(id));
    notes.push(
      assetIdsAgree
        ? 'Direct evidence and bridge evidence name overlapping asset_id(s) — corroborating, but no auto-merge rule exists yet.'
        : 'Direct evidence and bridge evidence name DIFFERENT asset_id(s) for the same conversion session — unresolved, no priority rule exists yet. Both are preserved below for review.',
    );
  } else if (hasDirect) {
    status = 'direct_evidence_only';
  } else if (hasBridge) {
    status = 'bridge_evidence_only';
  } else {
    status = 'no_evidence';
  }

  return {
    conversionId: conversion.id,
    sessionId: conversion.session_id,
    status,
    assetIdsAgree,
    journey,
    directEvidence,
    bridgeEvidence,
    notes,
  };
}
