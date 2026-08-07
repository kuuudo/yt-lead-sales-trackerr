/**
 * src/services/promotion/addPromotionAsset.ts
 *
 * MVP — Sponsor adds an already-owned Asset directly to an existing
 * Promotion. Direct insert, no RPC. Authorization is entirely handled
 * server-side by promotion_assets_insert_by_creator RLS (Assignment
 * creator only, asset must belong to the Promotion's own organization)
 * — this function does not repeat that check, same convention as every
 * other write wrapper in this codebase.
 *
 * Deliberately does NOT touch assignment_assets — a My Asset can be
 * added here even if it was never authorized into the Assignment.
 * resolvePromotionContextForAsset.ts already resolves Promotion Context
 * directly off promotion_assets membership, so no other file needs to
 * change for +Track New Content to recognize this asset.
 */

import { supabase } from '../../lib/supabase';

export async function addPromotionAsset(promotionId: string, assetId: string): Promise<void> {
  const { error } = await supabase
    .from('promotion_assets')
    .insert({ promotion_id: promotionId, asset_id: assetId });

  if (error) {
    throw new Error(error.message ?? 'Failed to add asset to this promotion');
  }
}