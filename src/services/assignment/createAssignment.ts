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
import { getOnlyPromoteAssetCampaign } from '../campaign/listSponsorCreativeCampaigns';

export interface AssetPromotionPermission {
  assetId: string;
  allowMarketerDomain: boolean;
  allowSponsorDomain: boolean;
  allowVstrkDomain: boolean;
  /** Required when allowSponsorDomain; must be Sponsor org verified domain id. */
  selectedSponsorDomainId: string | null;
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
  /**
   * Sponsor normal campaign for campaign_links_and_assets only.
   * Must be null for none / campaign_asset_only.
   * Must NOT be ONLY PROMOTE ASSET.
   */
  creativeCampaignId?: string | null;
  /**
   * Creative Creation only. null when mode is none.
   * promotion_only | allow_additional when Creative is enabled.
   */
  assetScope?: 'promotion_only' | 'allow_additional' | null;
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
  creativeCampaignId = null,
  assetScope = null,
}: CreateAssignmentInput): Promise<CreateAssignmentResult> {
  if (!title.trim()) {
    throw new Error('Assignment title is required');
  }
  if (!assetPermissions || assetPermissions.length === 0) {
    throw new Error('At least one Asset must be selected');
  }

  const assetIds = assetPermissions.map(p => p.assetId);

  for (const p of assetPermissions) {
    if (p.allowSponsorDomain && !p.selectedSponsorDomainId) {
      throw new Error(
        `selectedSponsorDomainId is required when allowSponsorDomain is true (asset ${p.assetId})`
      );
    }
  }

  // --------------------------------------------------
  // Creative Content: Assignment-level mode + optional normal campaign
  // --------------------------------------------------
  const mode =
    !creativeCreationMode || creativeCreationMode === 'none'
      ? null
      : creativeCreationMode;

  let resolvedAssetScope: 'promotion_only' | 'allow_additional' | null = null;
  if (mode) {
    if (assetScope === 'allow_additional' || assetScope === 'promotion_only') {
      resolvedAssetScope = assetScope;
    } else {
      // Default safer mode for Creative Assignments
      resolvedAssetScope = 'promotion_only';
    }
  }

  let resolvedCreativeCampaignId: string | null = null;

  if (mode === 'campaign_asset_only' || mode === 'campaign_links_and_assets') {
    const onlyPromote = await getOnlyPromoteAssetCampaign(organizationId);
    if (!onlyPromote) {
      throw new Error(
        'ONLY PROMOTE ASSET system campaign was not found for this organization. Contact support before enabling Content Creation.'
      );
    }
  }

  if (mode === null || mode === 'campaign_asset_only') {
    resolvedCreativeCampaignId = null;
  } else if (mode === 'campaign_links_and_assets') {
    if (!creativeCampaignId) {
      throw new Error(
        'Select one Sponsor campaign for Campaign + links + assets content creation'
      );
    }
    const { data: camp, error: campErr } = await supabase
      .from('campaigns')
      .select('id, organization_id, is_system, campaign_name, archived_at')
      .eq('id', creativeCampaignId)
      .maybeSingle();
    if (campErr || !camp) {
      throw new Error(campErr?.message ?? 'Selected creative campaign not found');
    }
    if (camp.organization_id !== organizationId) {
      throw new Error('Creative campaign must belong to the Sponsor organization');
    }
    if (camp.is_system || camp.campaign_name === 'ONLY PROMOTE ASSET') {
      throw new Error(
        'ONLY PROMOTE ASSET cannot be stored as creative_campaign_id; it is always available separately'
      );
    }
    if (camp.archived_at) {
      throw new Error('Selected creative campaign is archived');
    }
    resolvedCreativeCampaignId = camp.id as string;
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

    const resolvedType = await resolveAssetType(assetId);
    // ResolvedAssetType shape is shared with Videos (organizationId, etc.).
    // Resource assets without campaign provenance get the system campaign.
    const typeName =
      resolvedType && typeof resolvedType === 'object'
        ? String(
            (resolvedType as { assetType?: string; type?: string; kind?: string }).assetType
            ?? (resolvedType as { type?: string }).type
            ?? (resolvedType as { kind?: string }).kind
            ?? ''
          )
        : '';
    if (typeName === 'resource') {
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
      creative_creation_mode: mode,
      creative_campaign_id: resolvedCreativeCampaignId,
      asset_scope: resolvedAssetScope,
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
        selected_sponsor_domain_id: p.allowSponsorDomain
          ? p.selectedSponsorDomainId
          : null,
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
