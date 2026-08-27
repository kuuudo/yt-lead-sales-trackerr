/**
 * src/services/promotion/getPromotionArchiveImpactForViewer.ts
 *
 * SURFACE B — Archive Impact, MARKETPLACE-LEVEL orchestrator. Diagnostic/
 * informational only, same as getPromotionAssetArchiveImpact.ts (which
 * this module wraps and does NOT modify or duplicate the logic of).
 *
 * Problem this solves: Marketplace.tsx's promotion list rows
 * (PromotionSummary, from services/assignment/collaborationHub.ts) do
 * not carry asset ids — only pages/PromotionDetail.tsx's
 * getPromotionDetail() result does. This module is the ONLY new piece:
 * it bulk-reads `promotion_assets` (promotion_id, asset_id — confirmed
 * many-to-many table, see ARCHIVE_SYSTEM_DESIGN_8.md's DB audit) to
 * learn which asset ids belong to which promotion, then calls the
 * EXISTING getPromotionAssetArchiveImpact(assetIds, viewerId) per
 * promotion, unchanged. It never independently re-derives Asset archive
 * reasons and never touches services/asset/getAssetArchiveContext.ts
 * directly — that stays exclusively behind getPromotionAssetArchiveImpact.ts.
 *
 * Explicitly does NOT:
 *   - read or write promotion_user_states.archived_at (Surface A)
 *   - read or write archive_ui_visibility (Surface A Level 1/Level 2)
 *   - offer/imply Hide, Unhide, or Restore
 *   - trigger any automatic Remove Collaborator / Revoke Asset Access /
 *     Revoke Tracking Domain Access
 *   - move any Promotion out of My Promotions
 *
 * A Promotion with 0 archived assets simply resolves to
 * { archivedAssetCount: 0, impacts: [] } in the returned map (or is
 * absent if it has no promotion_assets rows at all) — callers filter for
 * archivedAssetCount > 0 to build the "Archive Impact" list.
 *
 * Callers:
 *   - pages/Marketplace.tsx (Archive Impact tab/view)
 */

import { supabase } from '../../lib/supabase';
import {
  getPromotionAssetArchiveImpact,
  type PromotionArchiveImpact,
} from './getPromotionAssetArchiveImpact';

export type { PromotionArchiveImpact };

export async function getPromotionArchiveImpactForViewer(
  promotionIds: string[],
  viewerId: string
): Promise<Map<string, PromotionArchiveImpact>> {
  if (promotionIds.length === 0) return new Map();

  const assetIdsByPromotion = await getPromotionAssetIdsBulk(promotionIds);

  const entries = await Promise.all(
    promotionIds.map(async (promotionId): Promise<readonly [string, PromotionArchiveImpact]> => {
      const assetIds = assetIdsByPromotion.get(promotionId) ?? [];
      const impact = await getPromotionAssetArchiveImpact(assetIds, viewerId);
      return [promotionId, impact] as const;
    })
  );

  return new Map(entries);
}

// ── Queries ────────────────────────────────────────────────────────────────

async function getPromotionAssetIdsBulk(promotionIds: string[]): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from('promotion_assets')
    .select('promotion_id, asset_id')
    .in('promotion_id', promotionIds);

  if (error) {
    throw new Error(`Failed to bulk-load promotion_assets: ${error.message}`);
  }

  const map = new Map<string, string[]>();
  for (const row of (data ?? []) as { promotion_id: string; asset_id: string }[]) {
    const list = map.get(row.promotion_id) ?? [];
    list.push(row.asset_id);
    map.set(row.promotion_id, list);
  }
  return map;
}
