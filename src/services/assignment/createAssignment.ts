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
 *     once an assignmentId exists).
 *
 * UPDATE (Create Assignment v2):
 *   - Added Assignment-level promotion method permissions:
 *     allow_marketer_domain, allow_sponsor_domain, allow_vstrk_domain
 *   - Added creative_creation_mode
 *   - Create Assignment UI no longer selects concrete Sponsor hostnames.
 *     domainIds may still be supplied by later flows; empty is the normal
 *     Create Assignment path. assignment_tracking_domains infrastructure
 *     is unchanged.
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
   *
   * Create Assignment v2 no longer writes concrete domains from the
   * Sponsor UI. domainIds may still be supplied by later flows
   * (Accept / Promotion setup / Assign Domain). Empty is the normal
   * Create Assignment path.
   */
  domainIds?: string[];
  /** Sponsor allows Marketer to use their own branded tracking domain. */
  allowMarketerDomain?: boolean;
  /** Sponsor allows use of Sponsor tracking domains for this Assignment. */
  allowSponsorDomain?: boolean;
  /** Sponsor allows VSTRK tracking domain as a promotion method. */
  allowVstrkDomain?: boolean;
  /**
   * Content creation capability for this Assignment.
   * null / omitted / 'none' = no content creation capability.
   */
  creativeCreationMode?: 'none' | 'campaign_asset_only' | 'campaign_links_and_assets' | null;
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
  allowMarketerDomain = false,
  allowSponsorDomain = false,
  allowVstrkDomain = false,
  creativeCreationMode = null,
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
      allow_marketer_domain: allowMarketerDomain,
      allow_sponsor_domain: allowSponsorDomain,
      allow_vstrk_domain: allowVstrkDomain,
      creative_creation_mode:
        creativeCreationMode === 'none' ? null : creativeCreationMode,
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
  // entirely in that case. Create Assignment v2 normally passes [].
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
