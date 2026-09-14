/**
 * Read-only: Marketer → Creative-eligible Sponsor Campaigns → Promotions.
 * Phase 1 Creative Creation — no writes, no ownership changes.
 *
 * Also loads per-asset Path B capability (assignment_assets.allow_*) and
 * usage (promotion_assets.use_* / selected_sponsor_domain_id) for Create Content UI.
 */

import { supabase } from '../../lib/supabase';

export type CreativeCreationMode = 'campaign_asset_only' | 'campaign_links_and_assets';

export interface CreativeEligiblePromotion {
  promotionId: string;
  assignmentId: string;
  assignmentCollaboratorId: string;
  campaignId: string;
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
  /** Sponsor capability from assignment_assets */
  allow_marketer_domain: boolean;
  allow_sponsor_domain: boolean;
  allow_vstrk_domain: boolean;
  /** Actual usage from promotion_assets */
  use_marketer_domain: boolean;
  use_vstrk_domain: boolean;
  selected_sponsor_domain_id: string | null;
  /** Resolved hostname for selected_sponsor_domain_id (null if none) */
  selected_sponsor_hostname: string | null;
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
  const byCampaign = new Map<string, CreativeEligibleCampaign>();

  for (const p of promotionRows) {
    if (!p.campaign_id) continue;
    const camp = campaignById.get(p.campaign_id);
    if (!camp) continue;

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
      campaignId: p.campaign_id,
      label: assignment.title ?? `Promotion ${p.id.slice(0, 8)}`,
    });
  }

  return Array.from(byCampaign.values());
}

/**
 * Flat list of every creative-eligible promotion (Route B — Promotion-first).
 */
export function flattenCreativePromotions(
  campaigns: CreativeEligibleCampaign[]
): Array<CreativeEligiblePromotion & { campaignName: string; mode: CreativeCreationMode; sponsorOrganizationId: string }> {
  const out: Array<
    CreativeEligiblePromotion & {
      campaignName: string;
      mode: CreativeCreationMode;
      sponsorOrganizationId: string;
    }
  > = [];
  for (const c of campaigns) {
    for (const p of c.promotions) {
      out.push({
        ...p,
        campaignName: c.campaignName,
        mode: c.mode,
        sponsorOrganizationId: c.sponsorOrganizationId,
      });
    }
  }
  return out;
}

/**
 * All promotion_assets for a Promotion + Path B usage + assignment allow_* + display.
 */
export async function loadPromotionAssetsForCreative(
  promotionId: string,
  assignmentId: string
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
    { data: allowRows },
    { data: videoRows },
    { data: elementRows },
    { data: resourceRows },
  ] = await Promise.all([
    supabase
      .from('assignment_assets')
      .select(
        'asset_id, allow_marketer_domain, allow_sponsor_domain, allow_vstrk_domain'
      )
      .eq('assignment_id', assignmentId)
      .in('asset_id', assetIds),
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

  const allowBy = new Map(
    (allowRows ?? []).map(r => [
      r.asset_id as string,
      {
        allow_marketer_domain: !!r.allow_marketer_domain,
        allow_sponsor_domain: !!r.allow_sponsor_domain,
        allow_vstrk_domain: !!r.allow_vstrk_domain,
      },
    ])
  );

  const sponsorIds = [
    ...new Set(
      paRows
        .map(r => r.selected_sponsor_domain_id)
        .filter((id): id is string => !!id)
    ),
  ];
  let hostnameById = new Map<string, string>();
  if (sponsorIds.length > 0) {
    const { data: domainRows } = await supabase
      .from('branded_tracking_domains')
      .select('id, hostname')
      .in('id', sponsorIds);
    hostnameById = new Map((domainRows ?? []).map(d => [d.id as string, d.hostname as string]));
  }

  const videoBy = new Map((videoRows ?? []).map(v => [v.asset_id, v]));
  const elementBy = new Map((elementRows ?? []).map(e => [e.asset_id, e]));
  const resourceBy = new Map((resourceRows ?? []).map(r => [r.asset_id, r]));

  return paRows.map(row => {
    const video = videoBy.get(row.asset_id);
    const element = elementBy.get(row.asset_id);
    const resource = resourceBy.get(row.asset_id);
    const allows = allowBy.get(row.asset_id) ?? {
      allow_marketer_domain: false,
      allow_sponsor_domain: false,
      allow_vstrk_domain: false,
    };
    const title =
      video?.video_title ??
      element?.display_name ??
      resource?.title ??
      row.asset_id;
    const thumbnail_url =
      video?.thumbnail_url ?? resource?.thumbnail_url ?? null;
    const sid = row.selected_sponsor_domain_id ?? null;

    return {
      asset_id: row.asset_id,
      title,
      thumbnail_url,
      allow_marketer_domain: allows.allow_marketer_domain,
      allow_sponsor_domain: allows.allow_sponsor_domain,
      allow_vstrk_domain: allows.allow_vstrk_domain,
      use_marketer_domain: !!row.use_marketer_domain,
      use_vstrk_domain: !!row.use_vstrk_domain,
      selected_sponsor_domain_id: sid,
      selected_sponsor_hostname: sid ? hostnameById.get(sid) ?? null : null,
    };
  });
}
