// ─────────────────────────────────────────────────────────────────────────────
// promotionJourney.ts
//
// PURPOSE: Thin Promotion-scoped interpretation layer on top of journey.ts.
// Given a promotionId and an already-reconstructed JourneyPath, annotate
// which steps have provenance connected to that Promotion.
//
// Does NOT reconstruct journeys itself — always consumes a JourneyPath
// produced by journey.ts (getJourneyById / getJourneysForEvent /
// getJourneysForSessionId). Does NOT delete or filter out non-relevant
// steps: the complete observed JourneyPath is preserved, and Promotion
// relevance is an annotation, not a destructive transformation.
//
// TWO INDEPENDENT PROMOTION SIGNALS (deliberately kept separate, not
// collapsed into one boolean — see architecture discussion):
//   1. redirectLinkPromotionId — from redirect_links.promotion_id, reached
//      via JourneyStep.redirectLinkId.
//   2. isAssetInPromotion — from promotion_assets, reached via
//      JourneyStep.assetId + the given promotionId.
// These two signals are not guaranteed to agree (e.g. a step's
// redirect_link may point to a different/null promotion_id than what its
// asset_id's promotion_assets membership says). This file does not decide
// which one is "ground truth" — that judgment is left to the consumer.
//
// promotion_assets is NOT assumed to be a 1:1 asset_id -> promotion_id
// mapping. The same asset_id may appear under more than one promotion_id
// (unverified as of this writing — recommended SQL check is in the
// architecture discussion). isAssetInPromotion only asserts membership for
// THIS specific promotionId; it does not claim exclusivity.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import type { JourneyPath, JourneyStep } from './journey';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type PromotionJourneyStep = JourneyStep & {
  redirectLinkPromotionId: string | null;
  isAssetInPromotion: boolean;
};

export type PromotionJourney = {
  journeyId: string;
  createdAt: string;
  promotionId: string;
  // Complete original path length/order preserved — see file header.
  steps: PromotionJourneyStep[];
};

type RedirectLinkRow = {
  id: string;
  promotion_id: string | null;
};

type PromotionAssetRow = {
  asset_id: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// getPromotionJourney
// ═══════════════════════════════════════════════════════════════════════════

export async function getPromotionJourney(
  promotionId: string,
  journey: JourneyPath,
): Promise<PromotionJourney> {
  const redirectLinkIds = Array.from(
    new Set(
      journey.steps
        .map((s) => s.redirectLinkId)
        .filter((id): id is string => id !== null),
    ),
  );

  const assetIds = Array.from(
    new Set(journey.steps.map((s) => s.assetId).filter((id): id is string => id !== null)),
  );

  const [redirectLinksResult, promotionAssetsResult] = await Promise.all([
    redirectLinkIds.length > 0
      ? supabase.from('redirect_links').select('id, promotion_id').in('id', redirectLinkIds)
      : Promise.resolve({ data: [] as RedirectLinkRow[], error: null }),
    assetIds.length > 0
      ? supabase
          .from('promotion_assets')
          .select('asset_id')
          .eq('promotion_id', promotionId)
          .in('asset_id', assetIds)
      : Promise.resolve({ data: [] as PromotionAssetRow[], error: null }),
  ]);

  if (redirectLinksResult.error) {
    throw new Error(
      `promotionJourney.ts getPromotionJourney: redirect_links query failed — ${redirectLinksResult.error.message}`,
    );
  }
  if (promotionAssetsResult.error) {
    throw new Error(
      `promotionJourney.ts getPromotionJourney: promotion_assets query failed — ${promotionAssetsResult.error.message}`,
    );
  }

  const promotionIdByRedirectLinkId = new Map(
    ((redirectLinksResult.data ?? []) as RedirectLinkRow[]).map((r) => [r.id, r.promotion_id]),
  );

  const assetIdsInThisPromotion = new Set(
    ((promotionAssetsResult.data ?? []) as PromotionAssetRow[]).map((r) => r.asset_id),
  );

  const steps: PromotionJourneyStep[] = journey.steps.map((step) => ({
    ...step,
    redirectLinkPromotionId: step.redirectLinkId
      ? promotionIdByRedirectLinkId.get(step.redirectLinkId) ?? null
      : null,
    isAssetInPromotion: step.assetId ? assetIdsInThisPromotion.has(step.assetId) : false,
  }));

  return {
    journeyId: journey.journeyId,
    createdAt: journey.createdAt,
    promotionId,
    steps,
  };
}
