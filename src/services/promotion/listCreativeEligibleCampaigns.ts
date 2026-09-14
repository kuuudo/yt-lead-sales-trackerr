/**
 * Read-only: Marketer → Creative-eligible Sponsor Campaigns → Promotions.
 * Phase 1 Creative Creation — no writes, no ownership changes.
 */

import { supabase } from '../../lib/supabase';

export type CreativeCreationMode = 'campaign_asset_only' | 'campaign_links_and_assets';

export interface CreativeEligiblePromotion {
  promotionId: string;
  assignmentId: string;
  assignmentCollaboratorId: string;
  /** Assignment title — best available label until promotions have their own title. */
  label: string;
}

export interface CreativeEligibleCampaign {
  campaignId: string;
  campaignName: string;
  sponsorOrganizationId: string;
  mode: CreativeCreationMode;
  promotions: CreativeEligiblePromotion[];
}

export interface CreativePromotionAssetRow {
  asset_id: string;
  title: string;
  thumbnail_url: string | null;
  use_marketer_domain: boolean;
  use_vstrk_domain: boolean;
  selected_sponsor_domain_id: string | null;
}

/**
 * Active collaborator + assignment.creative_creation_mode set →
 * promotions for those collaborators → group by campaign_id.
 */
export async function listCreativeEligibleCampaignsForMarketer(
  userId: string
): Promise<CreativeEligibleCampaign[]> {
  const { data: collabRows, error: collabErr } = await supabase
    .from('assignment_collaborators')
    .select('id, assignment_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (collabErr) {
    throw new Error(`Creative eligibility (collaborators): ${collabErr.message}`);
  }
  if (!collabRows?.length) return [];

  const assignmentIds = [...new Set(collabRows.map(r => r.assignment_id))];
  const collabIds = collabRows.map(r => r.id);

  const { data: assignmentRows, error: assignErr } = await supabase
    .from('assignments')
    .select('id, title, organization_id, creative_creation_mode')
    .in('id', assignmentIds)
    .in('creative_creation_mode', ['campaign_asset_only', 'campaign_links_and_assets']);

  if (assignErr) {
    throw new Error(`Creative eligibility (assignments): ${assignErr.message}`);
  }
  if (!assignmentRows?.length) return [];

  const allowedAssignmentIds = new Set(assignmentRows.map(a => a.id));
  const assignmentById = new Map(assignmentRows.map(a => [a.id, a]));
  const eligibleCollabIds = collabRows
    .filter(c => allowedAssignmentIds.has(c.assignment_id))
    .map(c => c.id);
  if (!eligibleCollabIds.length) return [];

  const { data: promotionRows, error: promoErr } = await supabase
    .from('promotions')
    .select('id, campaign_id, assignment_id, assignment_collaborator_id')
    .in('assignment_collaborator_id', eligibleCollabIds);

  if (promoErr) {
    throw new Error(`Creative eligibility (promotions): ${promoErr.message}`);
  }
  if (!promotionRows?.length) return [];

  const campaignIds = [...new Set(promotionRows.map(p => p.campaign_id).filter(Boolean))];
  if (!campaignIds.length) return [];

  const { data: campaignRows, error: campErr } = await supabase
    .from('campaigns')
    .select('id, campaign_name, organization_id')
    .in('id', campaignIds);

  if (campErr) {
    throw new Error(`Creative eligibility (campaigns): ${campErr.message}`);
  }

  const campaignById = new Map((campaignRows ?? []).map(c => [c.id, c]));

  // campaignId → aggregate
  const byCampaign = new Map<string, CreativeEligibleCampaign>();

  for (const p of promotionRows) {
    if (!p.campaign_id) continue;
    const camp = campaignById.get(p.campaign_id);
    if (!camp) continue; // RLS may hide Sponsor campaign — skip silently

    const assignment =
      assignmentById.get(p.assignment_id) ??
      assignmentById.get(
        collabRows.find(c => c.id === p.assignment_collaborator_id)?.assignment_id ?? ''
      );
    if (!assignment) continue;

    const mode = assignment.creative_creation_mode as CreativeCreationMode;
    if (mode !== 'campaign_asset_only' && mode !== 'campaign_links_and_assets') continue;

    let entry = byCampaign.get(p.campaign_id);
    if (!entry) {
      entry = {
        campaignId: p.campaign_id,
        campaignName: camp.campaign_name ?? 'Campaign',
        sponsorOrganizationId: camp.organization_id ?? assignment.organization_id,
        mode,
        promotions: [],
      };
      byCampaign.set(p.campaign_id, entry);
    }

    entry.promotions.push({
      promotionId: p.id,
      assignmentId: assignment.id,
      assignmentCollaboratorId: p.assignment_collaborator_id,
      label: assignment.title ?? `Promotion ${p.id.slice(0, 8)}`,
    });
  }

  return Array.from(byCampaign.values());
}

/**
 * All promotion_assets for a Promotion + Path B usage + display fields.
 */
export async function loadPromotionAssetsForCreative(
  promotionId: string
): Promise<CreativePromotionAssetRow[]> {
  const { data: paRows, error: paErr } = await supabase
    .from('promotion_assets')
    .select(
      'asset_id, use_marketer_domain, use_vstrk_domain, selected_sponsor_domain_id'
    )
    .eq('promotion_id', promotionId);

  if (paErr) {
    throw new Error(`Load promotion assets: ${paErr.message}`);
  }
  if (!paRows?.length) return [];

  const assetIds = paRows.map(r => r.asset_id);

  const [
    { data: videoRows },
    { data: elementRows },
    { data: resourceRows },
  ] = await Promise.all([
    supabase.from('videos').select('asset_id, video_title, thumbnail_url').in('asset_id', assetIds),
    supabase
      .from('campaign_element_assets')
      .select('asset_id, display_name')
      .in('asset_id', assetIds),
    supabase
      .from('asset_resources')
      .select('asset_id, title, thumbnail_url')
      .in('asset_id', assetIds),
  ]);

  const videoBy = new Map((videoRows ?? []).map(v => [v.asset_id, v]));
  const elementBy = new Map((elementRows ?? []).map(e => [e.asset_id, e]));
  const resourceBy = new Map((resourceRows ?? []).map(r => [r.asset_id, r]));

  return paRows.map(row => {
    const video = videoBy.get(row.asset_id);
    const element = elementBy.get(row.asset_id);
    const resource = resourceBy.get(row.asset_id);
    const title =
      video?.video_title ??
      element?.display_name ??
      resource?.title ??
      row.asset_id;
    const thumbnail_url =
      video?.thumbnail_url ?? resource?.thumbnail_url ?? null;

    return {
      asset_id: row.asset_id,
      title,
      thumbnail_url,
      use_marketer_domain: !!row.use_marketer_domain,
      use_vstrk_domain: !!row.use_vstrk_domain,
      selected_sponsor_domain_id: row.selected_sponsor_domain_id ?? null,
    };
  });
}
