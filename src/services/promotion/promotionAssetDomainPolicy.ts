/**
 * src/services/promotion/promotionAssetDomainPolicy.ts
 *
 * MVP — Promotion-level "Allow collaborator domains" policy. One
 * boolean per promoted asset, living on promotion_assets (see
 * migration_promotion_assets_allow_collaborator_domains.sql for the
 * grain rationale). Explicitly NOT an Assignment-level setting, NOT a
 * new permission system, NOT a revoke/restore table — a direct
 * RLS-guarded read/update on an existing column, nothing more.
 *
 * Independent of, and does not modify, any of:
 *   - assignment_assets / Assignment Asset architecture
 *   - assignment_tracking_domains / Assignment Tracking Domains
 *   - assignment_tracking_domain_access_states / revoke-restore
 *   - resolvePromotionContextForAsset.ts
 *   - getAssignmentDetail.ts
 *   - assignmentTrackingDomainAccess.ts
 *
 * Callers:
 *   - services/promotion/getPromotionDetail.ts (read, folded into `assets`)
 *   - pages/PromotionDetail.tsx (write, Sponsor-only toggle)
 *   - pages/Videos.tsx (read, Track New Content dropdown gating)
 */

import { supabase } from '../../lib/supabase';

/**
 * Batched read for Track New Content — one query per Promotion, not
 * per asset. Keyed by asset_id since that's what Videos.tsx already
 * has on hand per selected asset; promotionAssetId (the actual row id)
 * is an internal detail this map's caller doesn't need.
 */
export async function getAllowCollaboratorDomainsMap(
  promotionId: string
): Promise<Map<string, boolean>> {
  const { data, error } = await supabase
    .from('promotion_assets')
    .select('asset_id, allow_collaborator_domains')
    .eq('promotion_id', promotionId);

  if (error) {
    throw new Error(`Failed to load collaborator domain policy: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: any) => [row.asset_id as string, row.allow_collaborator_domains as boolean])
  );
}

/**
 * Direct update, no RPC — a single boolean field with no asymmetric
 * revoke/restore semantics to encode. Authorization lives entirely in
 * the promotion_assets_update_domain_policy_by_creator RLS policy
 * (assignments.created_by_user_id = auth.uid() only); this function
 * does not repeat or re-check that boundary, same convention as every
 * other write wrapper in this codebase.
 */
export async function setAllowCollaboratorDomains(
  promotionAssetId: string,
  allow: boolean
): Promise<void> {
  const { error } = await supabase
    .from('promotion_assets')
    .update({ allow_collaborator_domains: allow })
    .eq('id', promotionAssetId);

  if (error) {
    throw new Error(error.message ?? 'Failed to update collaborator domain policy');
  }
}
