/**
 * src/services/assignment/createAssignment.ts
 *
 * Organization side of the Collaboration flow: creates an Assignment and
 * authorizes it against a chosen set of Assets.
 *
 * PHASE 2 (Assignment Type):
 *   - Regular Mode  → creative_creation_mode = null
 *                     Marketer will choose their own campaign after Accept (Phase 3).
 *   - Creative Mode → creative_creation_mode = 'campaign_links_and_assets'
 *                     + creative_campaign_id = Sponsor campaign (required).
 *   - Asset Usage (asset_scope) applies to BOTH modes.
 *   - ONLY PROMOTE ASSET is no longer required or written.
 *   - assignment_assets: dedupe by asset_id (Black Box + Select Asset union).
 *
 * Permissions (allow_*) remain per assignment_assets row.
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
  /** Required when allowSponsorDomain; must be Sponsor org verified domain id. */
  selectedSponsorDomainId: string | null;
}

export type AssignmentMode = 'regular' | 'creative';

export interface CreateAssignmentInput {
  organizationId: string;
  createdByUserId: string;
  title: string;
  description?: string | null;
  /**
   * Per-asset promotion-method permissions. assetIds are derived from this
   * list (deduped by assetId — first wins).
   */
  assetPermissions: AssetPromotionPermission[];
  domainIds?: string[];
  /**
   * PHASE 2 Assignment Type.
   * regular  → creative_creation_mode null; Marketer campaign chosen later.
   * creative → Sponsor campaign required (creative_campaign_id).
   */
  assignmentMode: AssignmentMode;
  /**
   * Creative Mode only: Sponsor normal campaign id.
   * Must NOT be the legacy ONLY PROMOTE ASSET system campaign.
   */
  creativeCampaignId?: string | null;
  /**
   * Asset Usage — applies to Regular and Creative.
   * promotion_only | allow_additional
   */
  assetScope?: 'promotion_only' | 'allow_additional' | null;
}

export interface CreateAssignmentResult {
  assignmentId: string;
}

function dedupeAssetPermissions(
  assetPermissions: AssetPromotionPermission[]
): AssetPromotionPermission[] {
  const seen = new Set<string>();
  const out: AssetPromotionPermission[] = [];
  for (const p of assetPermissions) {
    if (!p.assetId || seen.has(p.assetId)) continue;
    seen.add(p.assetId);
    out.push(p);
  }
  return out;
}

export async function createAssignment({
  organizationId,
  createdByUserId,
  title,
  description = null,
  assetPermissions,
  domainIds = [],
  assignmentMode,
  creativeCampaignId = null,
  assetScope = null,
}: CreateAssignmentInput): Promise<CreateAssignmentResult> {
  if (!title.trim()) {
    throw new Error('Assignment title is required');
  }

  const uniquePermissions = dedupeAssetPermissions(assetPermissions ?? []);
  if (uniquePermissions.length === 0) {
    throw new Error('At least one Asset must be selected (Black Box and/or library)');
  }

  for (const p of uniquePermissions) {
    if (p.allowSponsorDomain && !p.selectedSponsorDomainId) {
      throw new Error(
        `selectedSponsorDomainId is required when allowSponsorDomain is true (asset ${p.assetId})`
      );
    }
  }

  const assetIds = uniquePermissions.map(p => p.assetId);

  // --------------------------------------------------
  // Assignment Type → creative_creation_mode + campaign
  // --------------------------------------------------
  let mode: 'campaign_links_and_assets' | null = null;
  let resolvedCreativeCampaignId: string | null = null;

  if (assignmentMode === 'creative') {
    mode = 'campaign_links_and_assets';
    if (!creativeCampaignId) {
      throw new Error('Creative Mode requires one Sponsor campaign');
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
        'Cannot use ONLY PROMOTE ASSET as the Creative campaign — choose a real Sponsor campaign'
      );
    }
    if (camp.archived_at) {
      throw new Error('Selected creative campaign is archived');
    }
    resolvedCreativeCampaignId = camp.id as string;
  } else {
    // Regular Mode: no Sponsor creative campaign; Marketer picks later (Phase 3).
    mode = null;
    resolvedCreativeCampaignId = null;
  }

  // Asset Usage for BOTH modes
  let resolvedAssetScope: 'promotion_only' | 'allow_additional' = 'promotion_only';
  if (assetScope === 'allow_additional' || assetScope === 'promotion_only') {
    resolvedAssetScope = assetScope;
  }

  // --------------------------------------------------
  // Only Assets that can resolve to a promotion Campaign
  // --------------------------------------------------
  for (const assetId of assetIds) {
    const resolved = await resolvePromotionCampaign(assetId);

    if (resolved) {
      continue;
    }

    const resolvedType = await resolveAssetType(assetId);
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
    })
    .select('id')
    .single();

  if (assignmentErr || !assignment) {
    throw new Error(assignmentErr?.message ?? 'Assignment insert returned no data');
  }

  const { error: assetsErr } = await supabase
    .from('assignment_assets')
    .insert(
      uniquePermissions.map(p => ({
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
