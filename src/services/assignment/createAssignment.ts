/**
 * src/services/assignment/createAssignment.ts
 *
 * Organization side of the Collaboration flow: creates an Assignment and
 * authorizes it against a chosen set of Assets.
 *
 * Design Lock, restated here since this is exactly where it'd be easy to
 * violate:
 *   - Assignment does NOT own a Campaign. There is no campaign_id on
 *     assignments, and this function does not accept one.
 *   - "Select Campaign" in the UI is only a filter for picking Assets —
 *     it never gets written anywhere on the Assignment itself.
 *   - Assignment references Assets only, via assignment_assets.
 *
 * Status: created directly as 'active'. v1 has no separate draft/publish
 * step in this journey — an Assignment is usable the moment its assets
 * and invitations exist, matching the Simplicity Constraint (no approval
 * workflow). If you want a draft-before-inviting step later, that's an
 * additive change to this function, not a schema change.
 *
 * NOT responsible for:
 *   - Sending invitations (see inviteCollaborator.ts — called separately,
 *     once an assignmentId exists)..
 *
 * UPDATE (Gate 1 / Gate 2 provenance alignment): Rule A previously used
 * resolveAssetCampaign() alone, which rejected any asset with no existing
 * campaign relationship — including Resource Assets, which intentionally
 * have no native campaign provenance (see asset_resources). This meant a
 * valid, promotable Resource Asset could never even enter an Assignment,
 * even though getAssignmentDetail.ts (Gate 2, at START PROMOTING time)
 * already knows how to give Resource Assets a campaign home via
 * ensureResourcePromotionCampaign().
 *
 * Gate 1 now shares the exact same resolver functions as Gate 2:
 *   1. resolvePromotionCampaign(assetId) — read-only, checks
 *      campaign_assets, then the asset's own type-specific source of
 *      truth (videos.campaign_id / campaign_element_assets.campaign_id).
 *   2. If that returns null AND the asset is a Resource Asset —
 *      ensureResourcePromotionCampaign(assetId) is called, which
 *      idempotently links it to the organization's 'ONLY PROMOTE ASSET'
 *      system campaign and returns that campaign_id.
 *   3. If still null (non-resource asset with no provenance anywhere) —
 *      reject, same as before.
 *
 * This does not change asset creation, asset schema, createVideo.ts, or
 * addToLibrary.ts — only what Gate 1 is willing to accept.
 */

import { supabase } from '../../lib/supabase';
import { resolvePromotionCampaign } from '../asset/resolvePromotionCampaign';
import { resolveAssetType } from '../asset/resolveAssetType';
import { ensureResourcePromotionCampaign } from '../asset/ensureResourcePromotionCampaign';

export interface CreateAssignmentInput {
  organizationId: string;
  createdByUserId: string;
  title: string;
  description?: string | null;
  assetIds: string[];
  /**
   * Assignment-level configuration, NOT Asset authorization — a
   * completely separate concern from assetIds above. Optional; an
   * empty/omitted array is a valid state (Assignment created with no
   * Tracking Domains shared). See assignment_tracking_domains.
   */
  domainIds?: string[];
}

export interface CreateAssignmentResult {
  assignmentId: string;
}

export async function createAssignment({
  organizationId,
  createdByUserId,
  title,
  description = null,
  assetIds,
  domainIds = [],
}: CreateAssignmentInput): Promise<CreateAssignmentResult> {
  if (!title.trim()) {
    throw new Error('Assignment title is required');
  }
  if (assetIds.length === 0) {
    throw new Error('At least one Asset must be selected');
  }
  // --------------------------------------------------
  // Rule A:
  //
  // Only Assets that can resolve to a promotion Campaign — either
  // already, or via the Resource Asset system-campaign fallback — can
  // enter an Assignment.
  //
  // Assignment references Assets only.
  // It does not own a Campaign.
  // --------------------------------------------------

  for (const assetId of assetIds) {
    const resolved = await resolvePromotionCampaign(assetId);

    if (resolved) {
      continue;
    }

    // No existing provenance anywhere — the only asset type allowed to
    // recover from this is a Resource Asset, which gets a system-campaign
    // home created on demand (idempotent — safe if called again later).
    const { assetType } = await resolveAssetType(assetId);

    if (assetType === 'resource') {
      await ensureResourcePromotionCampaign(assetId);
      continue;
    }

    throw new Error(
      `Selected asset cannot be assigned because it is not connected to a campaign. Please select a campaign asset.`
    );
  }

  const { data: assignment, error: assignmentErr } = await supabase
    .from('assignments')
    .insert({
      organization_id: organizationId,
      created_by_user_id: createdByUserId,
      title: title.trim(),
      description,
      status: 'active',
      visibility: 'private',
    })
    .select('id')
    .single();

  if (assignmentErr || !assignment) {
    throw new Error(assignmentErr?.message ?? 'Assignment insert returned no data');
  }

  const { error: assetsErr } = await supabase
    .from('assignment_assets')
    .insert(assetIds.map(assetId => ({ assignment_id: assignment.id, asset_id: assetId })));

  if (assetsErr) {
    // Compensate: the Assignment has no invitations/collaborators yet
    // (this is the very first write in its lifecycle), so it's safe to
    // delete outright — same pattern as createVideo.ts / createPromotion.ts.
    await supabase.from('assignments').delete().eq('id', assignment.id);
    throw new Error(`Failed to attach assets to Assignment: ${assetsErr.message}`);
  }

  // --------------------------------------------------
  // Tracking Domains: Assignment configuration, NOT Asset authorization.
  // Deliberately a separate insert into its own table
  // (assignment_tracking_domains), not folded into assignment_assets
  // above. Zero domains selected is valid — this block is skipped
  // entirely in that case, same as how librarySelectedAssetIds being
  // empty is a normal, expected state on the UI side.
  // --------------------------------------------------

  if (domainIds.length > 0) {
    const { error: domainsErr } = await supabase
      .from('assignment_tracking_domains')
      .insert(
        domainIds.map(domainId => ({
          assignment_id: assignment.id,
          branded_tracking_domain_id: domainId,
        }))
      );

    if (domainsErr) {
      // Same compensation reasoning as the assets insert above: no
      // invitations/collaborators exist yet, safe to delete outright.
      await supabase.from('assignments').delete().eq('id', assignment.id);
      throw new Error(`Failed to attach tracking domains to Assignment: ${domainsErr.message}`);
    }
  }

  return { assignmentId: assignment.id };
}
