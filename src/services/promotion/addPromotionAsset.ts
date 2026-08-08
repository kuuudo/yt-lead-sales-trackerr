/**
 * src/services/promotion/addPromotionAsset.ts
 *
 * Sponsor adds an already-owned Asset directly to an existing
 * Promotion, from Promotion Detail's Add Asset picker.
 *
 * REVISED per explicit decision: this now writes to BOTH
 * assignment_assets and promotion_assets, not promotion_assets alone.
 * Reason — promotion_assets's backstop_check_promotion_asset_in_campaign
 * trigger's Sponsor path only checks organization_id (no
 * assignment_assets requirement), so the original promotion_assets-only
 * version worked at the DB level. But leaving assignment_assets
 * untouched meant the added asset never showed up under Promotion
 * Detail's "Access Management — Assigned Assets" (which reads
 * assignment_assets), so the Sponsor had no way to later revoke it
 * through the existing revoke/restore system
 * (assignment_asset_access_states, keyed off assignment_assets rows
 * existing). Writing both makes Add Asset a proper, fully-manageable
 * authorization, not a shortcut that bypasses it.
 *
 * Authorization for both writes is entirely server-side RLS
 * (assignments.created_by_user_id = auth.uid() — see
 * migration_assignment_assets_enable_rls_and_insert_policy.sql and the
 * earlier promotion_assets_insert_by_creator policy). This function
 * does not repeat that check.
 *
 * (assignment_id, asset_id) has a unique constraint on
 * assignment_assets — the existence check below is required, not
 * optional, both to avoid a constraint violation when the asset was
 * already an Assigned Asset (the picker's second category explicitly
 * allows selecting those), and to know whether THIS call is
 * responsible for that row, for safe compensation on failure.
 */

import { supabase } from '../../lib/supabase';

export async function addPromotionAsset(
  promotionId: string,
  assetId: string,
  assignmentId: string
): Promise<void> {
  // Step 1 — ensure assignment_assets has this row. Skip insert if it
  // already exists (the "Assigned Asset" picker category) — never
  // touch a pre-existing row, since it may already carry
  // assignment_asset_access_states revoke history that must not be
  // disturbed.
  const { data: existing, error: checkErr } = await supabase
    .from('assignment_assets')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('asset_id', assetId)
    .maybeSingle();

  if (checkErr) {
    throw new Error(`Failed to check assignment asset: ${checkErr.message}`);
  }

  let insertedAssignmentAsset = false;

  if (!existing) {
    const { error: assignErr } = await supabase
      .from('assignment_assets')
      .insert({ assignment_id: assignmentId, asset_id: assetId });

    if (assignErr) {
      throw new Error(`Failed to authorize asset into this Assignment: ${assignErr.message}`);
    }
    insertedAssignmentAsset = true;
  }

  // Step 2 — insert into promotion_assets.
  const { error: promoErr } = await supabase
    .from('promotion_assets')
    .insert({ promotion_id: promotionId, asset_id: assetId });

  if (promoErr) {
    // Compensate ONLY the row this call created. If the asset was
    // already an Assigned Asset before this call, its assignment_assets
    // row (and any revoke history on it) is left completely untouched.
    if (insertedAssignmentAsset) {
      await supabase
        .from('assignment_assets')
        .delete()
        .eq('assignment_id', assignmentId)
        .eq('asset_id', assetId);
    }
    throw new Error(`Failed to add asset to this promotion: ${promoErr.message}`);
  }
}
