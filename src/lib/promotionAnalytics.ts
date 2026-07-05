/**
 * src/lib/promotionAnalytics.ts
 *
 * Promotion is an ADDITIONAL attribution dimension, not a replacement for
 * existing Campaign/Video analytics. Those continue to run unchanged.
 * This module answers a new question: "which Promoter generated this
 * traffic/leads/revenue?" — by regrouping the exact same per-video metrics
 * analyticsEngine.ts already computes, just bucketed by Promotion/owner
 * instead of by Campaign.
 *
 * Zero changes to analyticsEngine.ts. This works by:
 *   1. Resolving which video_id(s) belong to each Promotion, via
 *      redirect_links.promotion_id (now populated going forward — see
 *      redirects.ts / Track.tsx / stripe-webhook.ts changes).
 *   2. Calling the EXISTING processVideoMetrics() per video — identical
 *      formulas, identical dedup rules, no reimplementation.
 *   3. Summing via the EXISTING aggregateCampaignMetrics() — despite the
 *      name, it has no campaign-specific logic; it just sums an array of
 *      VideoMetricsResult, which is exactly what's needed here too.
 *
 * IMPORTANT CAVEAT: because processVideoMetrics filters events/purchases
 * by video_id (not promotion_id — those columns exist on events/
 * stripe_purchases but the CORE engine doesn't read them), this only
 * attributes correctly when each video maps to at most one Promotion.
 * That matches the current product flow (one collaborator video → one
 * Promotion). If that assumption ever breaks, this rollup should switch
 * to filtering by promotion_id directly on events/stripe_purchases
 * instead of resolving through video_id — flagging this now rather than
 * silently assuming it can't happen.
 */

import { supabase } from './supabase';
import {
  processVideoMetrics,
  aggregateCampaignMetrics,
  type RawEvent,
  type StripePurchaseRow,
  type PixelPurchaseRow,
  type CampaignMeta,
  type VideoMetricsResult,
} from './analyticsEngine';

export interface PromotionRow {
  id: string;
  organization_id: string;
  campaign_id: string;
  owner_user_id: string;
  assignment_collaborator_id: string | null;
  status: string;
}

export interface PromotionMetricsResult extends VideoMetricsResult {
  promotion: PromotionRow;
  videoIds: string[];
}

/**
 * Resolves promotion_id -> distinct video_id[] via redirect_links.
 * Call this once, pass the result into getPromotionMetrics.
 */
export async function resolvePromotionVideoIds(
  promotionIds: string[]
): Promise<Record<string, string[]>> {
  if (promotionIds.length === 0) return {};

  const { data, error } = await supabase
    .from('redirect_links')
    .select('promotion_id, video_id')
    .in('promotion_id', promotionIds);

  if (error) {
    throw new Error(`Failed to resolve promotion video ids: ${error.message}`);
  }

  const grouped: Record<string, Set<string>> = {};
  for (const row of data ?? []) {
    if (!row.promotion_id || !row.video_id) continue;
    if (!grouped[row.promotion_id]) grouped[row.promotion_id] = new Set();
    grouped[row.promotion_id].add(row.video_id);
  }

  const result: Record<string, string[]> = {};
  for (const [promotionId, videoIds] of Object.entries(grouped)) {
    result[promotionId] = Array.from(videoIds);
  }
  return result;
}

export interface GetPromotionMetricsInput {
  promotions: PromotionRow[];
  /** promotion_id -> video_id[], from resolvePromotionVideoIds() */
  promotionVideoIds: Record<string, string[]>;
  campaigns: CampaignMeta[];
  /** Already date-filtered by the caller (reuse filterEventsByDate from analyticsEngine.ts) */
  events: RawEvent[];
  /** Already enriched by the caller (reuse enrichStripePurchases from analyticsEngine.ts) */
  stripePurchases: StripePurchaseRow[];
  pixelPurchases: PixelPurchaseRow[];
  activeSource: 'stripe' | 'pixel' | 'total';
  includeEV?: boolean;
}

/**
 * Per-Promotion metrics — one row per Promotion, using the exact same
 * revenue/click formulas as the existing Campaign/Video dashboard.
 * Existing Campaign Analytics is untouched; this is purely additive.
 */
export function getPromotionMetrics({
  promotions,
  promotionVideoIds,
  campaigns,
  events,
  stripePurchases,
  pixelPurchases,
  activeSource,
  includeEV = true,
}: GetPromotionMetricsInput): PromotionMetricsResult[] {
  const sourceStripe = activeSource === 'pixel' ? [] : stripePurchases;
  const sourcePixel = activeSource === 'stripe' ? [] : pixelPurchases;

  return promotions.map((promotion): PromotionMetricsResult => {
    const videoIds = promotionVideoIds[promotion.id] ?? [];
    const campaign = campaigns.find(c => c.id === promotion.campaign_id);

    // Per-video metrics, identical to the existing Video dashboard —
    // just filtered down to this Promotion's videos, then summed.
    const perVideo: VideoMetricsResult[] = videoIds.map(videoId =>
      processVideoMetrics({
        videoId,
        campaignId: promotion.campaign_id,
        campaign,
        activeSource,
        events,
        stripePurchases: sourceStripe,
        pixelPurchases: sourcePixel,
        includeEV,
      })
    );

    const summed = aggregateCampaignMetrics(perVideo);

    return {
      ...summed,
      promotion,
      videoIds,
    };
  });
}

/**
 * Rolls Promotion-level metrics up one more level: by owner_user_id
 * (the Promoter), across every Promotion they own — regardless of which
 * Campaign or Assignment those Promotions came from. This is the "who is
 * my top promoter" view.
 */
export function getPromoterMetrics(
  promotionMetrics: PromotionMetricsResult[]
): Array<{ ownerUserId: string; promotionCount: number } & VideoMetricsResult> {
  const byOwner = new Map<string, PromotionMetricsResult[]>();

  for (const pm of promotionMetrics) {
    const key = pm.promotion.owner_user_id;
    if (!byOwner.has(key)) byOwner.set(key, []);
    byOwner.get(key)!.push(pm);
  }

  return Array.from(byOwner.entries()).map(([ownerUserId, rows]) => ({
    ownerUserId,
    promotionCount: rows.length,
    ...aggregateCampaignMetrics(rows),
  }));
}
