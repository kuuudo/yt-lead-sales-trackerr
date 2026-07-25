/**
 * src/services/assignment/assignmentAssetAccess.ts
 *
 * Phase 2C — Asset-level Access Control. Per-(collaborator, asset)
 * permission, layered UNDER assignment_collaborators (Layer 1: can this
 * person participate at all) and ABOVE promotions (Layer 3: what did
 * they actually promote). This is Layer 2: can this specific
 * collaborator access this specific asset.
 *
 * TERMINOLOGY (locked): "Revoke Access" / "Restore Access" — never
 * "remove asset." The asset itself, assignment_assets, promotion_assets,
 * and promotions are never touched by anything in this file. Only
 * assignment_asset_access_states.revoked_at changes.
 *
 * GRAIN (locked): (assignment_collaborator_id, asset_id) — per person,
 * per asset. Two collaborators on the same Assignment can have
 * independent access to the same asset. Never assignment-wide.
 *
 * Absence of a row = active (default), same convention as every other
 * *_user_states table in this codebase. A row only exists once someone
 * has revoked access at least once.
 *
 * Authorization for the write functions lives entirely server-side in
 * the RPCs (assignments.created_by_user_id = auth.uid() only) — this
 * file does not repeat or re-check that boundary, same convention as
 * removeCollaborator.ts / restoreCollaborator.ts.
 *
 * Callers:
 *   - services/promotion/getPromotionDetail.ts (getAssetAccessStatesForCollaborator)
 *   - services/asset/listSharedAssetsForCollaborator.ts (getAssetAccessStatesForCollaborator)
 *   - pages/PromotionDetail.tsx (revokeAssetAccess, restoreAssetAccess)
 */

import { supabase } from '../../lib/supabase';

/**
 * All (asset_id -> revoked_at) access states for one collaborator.
 * Only assets that have ever been revoked appear here — an asset_id
 * with no entry in this Map is active by default. Mirrors
 * assetArchive.ts's getArchivedAssetIdsForUser shape exactly.
 */
export async function getAssetAccessStatesForCollaborator(
  assignmentCollaboratorId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('assignment_asset_access_states')
    .select('asset_id, revoked_at')
    .eq('assignment_collaborator_id', assignmentCollaboratorId)
    .not('revoked_at', 'is', null);

  if (error) {
    throw new Error(`Failed to load asset access states: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: any) => [row.asset_id as string, row.revoked_at as string])
  );
}

/**
 * Revoke is only ever triggered by an explicit Sponsor click — there is
 * no automatic/time-based revocation anywhere.
 */
export async function revokeAssetAccess(
  assignmentCollaboratorId: string,
  assetId: string
): Promise<void> {
  const { error } = await supabase.rpc('revoke_assignment_asset_access', {
    p_assignment_collaborator_id: assignmentCollaboratorId,
    p_asset_id: assetId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to revoke asset access');
  }
}

/**
 * Restore only ever clears access for this exact (collaborator, asset)
 * pair — it can never affect another collaborator's access to the same
 * asset, and never touches assignment_assets, promotion_assets, or
 * promotions.
 */
export async function restoreAssetAccess(
  assignmentCollaboratorId: string,
  assetId: string
): Promise<void> {
  const { error } = await supabase.rpc('restore_assignment_asset_access', {
    p_assignment_collaborator_id: assignmentCollaboratorId,
    p_asset_id: assetId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to restore asset access');
  }
}
