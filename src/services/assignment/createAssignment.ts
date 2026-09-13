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
 * UPDATE (Create Assignment v2 — corrected grain):
 *   - creative_creation_mode lives on assignments (Assignment-level).
 *   - allow_marketer_domain / allow_sponsor_domain / allow_vstrk_domain
 *     live on assignment_assets (per asset_id within the Assignment).
 *   - Create Assignment UI no longer selects concrete Sponsor hostnames.
 *     domainIds may still be supplied by later flows; empty is the normal
 *     Create Assignment path. assignment_tracking_domains infrastructure
 *     is unchanged.
 *   - The mistakenly-added assignments.allow_* columns are NOT written.
 */

import { supabase } from '../../lib/supabase';
import { resolvePromotionCampaign } from '../asset/resolvePromotionCampaign';
import { resolveAssetType } from '../asset/resolveAssetType';
import { ensureResourcePromotionCampaign } from '../asset/ensureResourcePromotionCampaign';

export interface AssetPromotionPermission {
  assetId: string;
  allowMarketerDomain: boolean;
  allowSponsorDomain: boolean;
  allowVstrkDomain: boolean;
}

export interface CreateAssignmentInput {
  organizationId: string;
  createdByUserId: string;
  title: string;
  description?: string | null;
  /**
   * Per-asset promotion-method permissions. assetIds are derived from this
   * list. Each entry becomes one assignment_assets row with its three
   * allow_* flags.
   */
  assetPermissions: AssetPromotionPermission[];
  /**
   * Assignment-level configuration, NOT Asset authorization.
   * Create Assignment v2 normally passes []. Concrete domains may still
   * be attached later via Assign Tracking Domain / Accept flows.
   * See assignment_tracking_domains.
   */
  domainIds?: string[];
  /**
   * Content creation capability for this Assignment (Assignment-level).
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
  assetPermissions,
  domainIds = [],
  creativeCreationMode = null,
}: CreateAssignmentInput): Promise<CreateAssignmentResult> {
  if (!title.trim()) {
    throw new Error('Assignment title is required');
  }
  if (!assetPermissions || assetPermissions.length === 0) {
    throw new Error('At least one Asset must be selected');
  }

  const assetIds = assetPermissions.map(p => p.assetId);

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
      creative_creation_mode:
        creativeCreationMode === 'none' ? null : creativeCreationMode,
      // Do NOT write assignments.allow_marketer_domain /
      // allow_sponsor_domain / allow_vstrk_domain — those columns were
      // added by mistake and remain unused. Permissions live on
      // assignment_assets.
    })
    .select('id')
    .single();

  if (assignmentErr || !assignment) {
    throw new Error(assignmentErr?.message ?? 'Assignment insert returned no data');
  }

  const { error: assetsErr } = await supabase
    .from('assignment_assets')
    .insert(
      assetPermissions.map(p => ({
        assignment_id: assignment.id,
        asset_id: p.assetId,
        allow_marketer_domain: p.allowMarketerDomain,
        allow_sponsor_domain: p.allowSponsorDomain,
        allow_vstrk_domain: p.allowVstrkDomain,
      }))
    );

  if (assetsErr) {
    await supabase.from('assignments').delete().eq('id', assignment.id);
    throw new Error(`Failed to attach assets to Assignment: ${assetsErr.message}`);
  }

  // --------------------------------------------------
  // Tracking Domains: optional concrete Sponsor domain grants.
  // Zero domains is valid — block skipped. Create Assignment v2
  // normally passes [].
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
      await supabase.from('assignments').delete().eq('id', assignment.id);
      throw new Error(`Failed to attach tracking domains to Assignment: ${domainsErr.message}`);
    }
  }

  return { assignmentId: assignment.id };
}
