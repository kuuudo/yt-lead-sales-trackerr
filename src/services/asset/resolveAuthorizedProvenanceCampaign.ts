/**
 * src/services/asset/resolveAuthorizedProvenanceCampaign.ts
 *
 * FALLBACK ONLY. Never called for the common (same-org) case — the direct
 * `campaigns` table read in generateAssetRedirectLinks.ts already works
 * fine there and stays as the primary path.
 *
 * Only invoked when:
 *   1. A direct `campaigns` read returned { data: null, error: null } —
 *      the RLS-silent-empty signature, not a real query error, and
 *   2. An explicit promotionContext is already known for this asset
 *      (Shared-asset case, resolved upstream in
 *      resolvePromotionContextForAsset.ts / Videos.tsx before this
 *      function ever runs — never guessed here).
 *
 * Calls a SECURITY DEFINER Postgres function that re-verifies the exact
 * same authorization relationship (promotion_assets membership +
 * promotion ownership/collaboration) before bypassing RLS for that one
 * row. campaigns RLS itself is untouched — this is a narrow, doubly
 * gated side door, not a policy change.
 */

import { supabase } from '../../lib/supabase';
import type { Campaign } from '../../lib/supabase';

export async function resolveAuthorizedProvenanceCampaign(
  assetId: string,
  promotionId: string,
  campaignId: string
): Promise<Campaign | null> {
  const { data, error } = await supabase.rpc('get_authorized_provenance_campaign', {
    p_asset_id: assetId,
    p_promotion_id: promotionId,
    p_campaign_id: campaignId,
  });

  if (error) {
    console.error(
      '[resolveAuthorizedProvenanceCampaign] RPC failed:',
      assetId,
      promotionId,
      error.message
    );
    return null;
  }

  // setof campaigns → array with 0 or 1 row (0 rows means either gate failed)
  return (data && data[0]) ?? null;
}
