/**
 * Phase 1 — Revoke Access at Promotion × Asset grain.
 * Removes the promotion_assets row only. Does NOT touch assignment_assets
 * or assignment_asset_access_states (Assignment-level permission stays).
 */
import { supabase } from '../../lib/supabase';

export async function removePromotionAsset(promotionAssetId: string): Promise<void> {
  const { error } = await supabase
    .from('promotion_assets')
    .delete()
    .eq('id', promotionAssetId);

  if (error) {
    throw new Error(error.message ?? 'Failed to revoke asset from this promotion');
  }
}
