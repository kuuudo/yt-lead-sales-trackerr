// ─────────────────────────────────────────────────────────────────────────────
// assetJourney.ts
//
// PURPOSE: Asset-scoped interpretation layer on top of journey.ts. Given an
// assetId and an already-reconstructed JourneyPath, annotate which steps
// belong to that Asset.
//
// Does NOT reconstruct journeys itself — always consumes a JourneyPath
// produced by journey.ts. Does NOT delete or filter out non-matching
// steps: the complete observed JourneyPath is preserved in order, and
// Asset relevance is an annotation, not a destructive transformation.
//
// PURE FUNCTION, NO DATABASE ACCESS: JourneyStep.assetId already comes
// from the canonical journey_snapshot (via journey.ts), so this file only
// needs to compare it against the requested assetId — no Supabase query
// is needed.
//
// ASSET IDENTITY RULE (first version, deliberately narrow): a step belongs
// to the requested Asset if and only if step.assetId === assetId. This
// does NOT infer asset identity from promotion_id, campaign_id, video_id,
// redirect_link_id, purchase data, revenue, or redirect_links.asset_id.
//
// PARALLEL TO promotionJourney.ts, NOT LAYERED UNDER IT: this file does
// not import promotionJourney.ts and does not query promotion_assets. An
// Asset may belong to more than one Promotion — that composition is left
// to a future, higher-level consumer, not decided here.
//
//   journey.ts
//      │
//      ├── promotionJourney.ts   (Promotion-scoped interpretation)
//      │
//      └── assetJourney.ts       (Asset-scoped interpretation, this file)
// ─────────────────────────────────────────────────────────────────────────────

import type { JourneyPath, JourneyStep } from './journey';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type AssetJourneyStep = JourneyStep & {
  isTargetAsset: boolean;
};

export type AssetJourney = {
  journeyId: string;
  createdAt: string;
  assetId: string;
  // Complete original path length/order preserved — see file header.
  steps: AssetJourneyStep[];
};

// ═══════════════════════════════════════════════════════════════════════════
// getAssetJourney
// ═══════════════════════════════════════════════════════════════════════════

export function getAssetJourney(assetId: string, journey: JourneyPath): AssetJourney {
  const steps: AssetJourneyStep[] = journey.steps.map((step) => ({
    ...step,
    isTargetAsset: step.assetId === assetId,
  }));

  return {
    journeyId: journey.journeyId,
    createdAt: journey.createdAt,
    assetId,
    steps,
  };
}
