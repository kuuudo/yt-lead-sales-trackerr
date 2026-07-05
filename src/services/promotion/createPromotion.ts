/**
 * src/services/promotion/createPromotion.ts
 *
 * Single entry point for creating a Promotion. This is the one place two
 * independent authorization checks must both pass before a tracking token
 * is issued (per Design Lock):
 *   (a) the Assets being promoted must belong to the chosen Campaign
 *       (application-layer primary check — DB trigger is only a backstop), and
 *   (b) the caller must be authorized: either they own the Campaign's
 *       Organization directly, or they hold an active assignment_collaborator
 *       row whose assignment covers every asset_id being promoted.
 *
 * Design Lock rules encoded here:
 *   - promotions.campaign_id is required (execution/billing context).
 *   - promotion_assets is many-to-many.
 *   - Promotion uses assignment_collaborator_id, never assignment_id + user_id.
 *   - assignment_collaborator_id is null when a Creator promotes their own
 *     Asset directly (no Assignment involved).
 *   - Organization Boundary: campaign, assignment (if any), and every asset
 *     must resolve to the same organization_id as the Promotion.
 *
 * NOT responsible for:
 *   - Creating redirect_links (see redirects.ts — called separately, after
 *     a Promotion exists, once the caller has a promotion_id to attach).
 *   - Any UI state.
 */

import { supabase } from '../../lib/supabase';

export interface CreatePromotionInput {
  organizationId: string;
  campaignId: string;
  ownerUserId: string;
  assetIds: string[];
  /**
   * Null when the owner is promoting their own Asset directly with no
   * Assignment involved. When present, must be an active collaborator row
   * belonging to ownerUserId, on an Assignment that references every one
   * of assetIds.
   */
  assignmentCollaboratorId?: string | null;
}

export interface CreatePromotionResult {
  promotionId: string;
}

export async function createPromotion({
  organizationId,
  campaignId,
  ownerUserId,
  assetIds,
  assignmentCollaboratorId = null,
}: CreatePromotionInput): Promise<CreatePromotionResult> {
  if (assetIds.length === 0) {
    throw new Error('createPromotion requires at least one assetId');
  }

  // ── Check 1: every asset must already belong to this Campaign ───────────
  // Primary guard lives here (better error messaging, fails before any
  // write); the DB trigger (trg_backstop_promotion_asset) is a backstop
  // only, per the locked decision that this is not a historical-data
  // invariant.
  const { data: campaignAssetRows, error: campaignAssetErr } = await supabase
    .from('campaign_assets')
    .select('asset_id')
    .eq('campaign_id', campaignId)
    .in('asset_id', assetIds);

  if (campaignAssetErr) {
    throw new Error(`Failed to verify campaign asset membership: ${campaignAssetErr.message}`);
  }

  const campaignAssetIds = new Set((campaignAssetRows ?? []).map(r => r.asset_id));
  const missing = assetIds.filter(id => !campaignAssetIds.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Asset(s) not part of Campaign ${campaignId}: ${missing.join(', ')}. Add them to the Campaign first.`
    );
  }

  // ── Check 2: authorization ────────────────────────────────────────────────
  if (assignmentCollaboratorId) {
    const { data: collaborator, error: collabErr } = await supabase
      .from('assignment_collaborators')
      .select('id, user_id, status, assignment_id')
      .eq('id', assignmentCollaboratorId)
      .maybeSingle();

    if (collabErr || !collaborator) {
      throw new Error('assignment_collaborator_id not found');
    }
    if (collaborator.user_id !== ownerUserId) {
      throw new Error('assignment_collaborator_id does not belong to this owner');
    }
    if (collaborator.status !== 'active') {
      throw new Error(`Collaborator status is '${collaborator.status}', not active`);
    }

    const { data: assignmentAssetRows, error: assignmentAssetErr } = await supabase
      .from('assignment_assets')
      .select('asset_id')
      .eq('assignment_id', collaborator.assignment_id)
      .in('asset_id', assetIds);

    if (assignmentAssetErr) {
      throw new Error(`Failed to verify assignment asset scope: ${assignmentAssetErr.message}`);
    }

    const assignmentAssetIds = new Set((assignmentAssetRows ?? []).map(r => r.asset_id));
    const outOfScope = assetIds.filter(id => !assignmentAssetIds.has(id));
    if (outOfScope.length > 0) {
      throw new Error(
        `Asset(s) not authorized by this Assignment: ${outOfScope.join(', ')}. ` +
        `Removing an Asset from an Assignment blocks new Promotions using it — existing Promotions are unaffected.`
      );
    }
  }
  // If assignmentCollaboratorId is null: this is a Creator promoting their
  // own Asset with no Assignment. We rely on RLS (organization_id scoping)
  // to have already restricted `assetIds`/`campaignId` to this caller's org;
  // no further check is performed here.

  // ── Create the Promotion ──────────────────────────────────────────────────
  const { data: promotion, error: promotionErr } = await supabase
    .from('promotions')
    .insert({
      organization_id: organizationId,
      campaign_id: campaignId,
      owner_user_id: ownerUserId,
      assignment_collaborator_id: assignmentCollaboratorId,
      status: 'draft',
    })
    .select('id')
    .single();

  if (promotionErr || !promotion) {
    throw new Error(promotionErr?.message ?? 'Promotion insert returned no data');
  }

  // ── Create promotion_assets ────────────────────────────────────────────────
  const { error: promotionAssetsErr } = await supabase
    .from('promotion_assets')
    .insert(assetIds.map(assetId => ({ promotion_id: promotion.id, asset_id: assetId })));

  if (promotionAssetsErr) {
    // Compensate: the Promotion row has zero references yet (no redirect
    // links, no events could exist for an id the caller never received),
    // so it's safe to delete outright — same pattern as createVideo.ts's
    // Asset compensation.
    await supabase.from('promotions').delete().eq('id', promotion.id);
    throw new Error(`Failed to attach assets to Promotion: ${promotionAssetsErr.message}`);
  }

  return { promotionId: promotion.id };
}
