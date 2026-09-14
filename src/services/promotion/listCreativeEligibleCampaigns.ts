/**
 * Read-only: Marketer → eligible Promotions (not gated on Creative Campaign).
 * Optional Creative Campaign is attached when assignment.creative_creation_mode is set.
 * Loads promotion_assets Path B usage + assignment_assets.allow_* for Create Content.
 */

import { supabase } from '../../lib/supabase';

export type CreativeCreationMode = 'campaign_asset_only' | 'campaign_links_and_assets';

export interface EligiblePromotion {
  promotionId: string;
  assignmentId: string;
  assignmentCollaboratorId: string;
  /** promotions.campaign_id — may exist without creative mode */
  campaignId: string | null;
  campaignName: string | null;
  sponsorOrganizationId: string | null;
  label: string;
  /** Set only when assignment has creative_creation_mode */
  creativeMode: CreativeCreationMode | null;
}

/** @deprecated Prefer EligiblePromotion — kept for Videos campaign grouping */
export interface CreativeEligiblePromotion {
  promotionId: string;
  assignmentId: string;
  assignmentCollaboratorId: string;
  campaignId: string;
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
  allow_marketer_domain: boolean;
  allow_sponsor_domain: boolean;
  allow_vstrk_domain: boolean;
  use_marketer_domain: boolean;
  use_vstrk_domain: boolean;
  selected_sponsor_domain_id: string | null;
  selected_sponsor_hostname: string | null;
  selected_marketer_domain_id: string | null;
  selected_marketer_hostname: string | null;
}

/**
 * All promotions where the user is an active collaborator.
 * Not filtered by creative_creation_mode — any eligible Promotion is selectable.
 * creativeMode is set when the Assignment has creative_creation_mode.
 */
export async function listEligiblePromotionsForMarketer(
  userId: string
): Promise<EligiblePromotion[]> {
  const { data: collabRows, error: collabErr } = await supabase
    .from('assignment_collaborators')
    .select('id, assignment_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (collabErr) {
    throw new Error(`Eligible promotions (collaborators): ${collabErr.message}`);
  }
  if (!collabRows?.length) return [];

  const collabIds = collabRows.map(r => r.id);
  const assignmentIds = [...new Set(collabRows.map(r => r.assignment_id))];

  const { data: assignmentRows, error: assignErr } = await supabase
    .from('assignments')
    .select('id, title, organization_id, creative_creation_mode')
    .in('id', assignmentIds);

  if (assignErr) {
    throw new Error(`Eligible promotions (assignments): ${assignErr.message}`);
  }

  const assignmentById = new Map((assignmentRows ?? []).map(a => [a.id, a]));

  const { data: promotionRows, error: promoErr } = await supabase
    .from('promotions')
    .select('id, campaign_id, assignment_id, assignment_collaborator_id')
    .in('assignment_collaborator_id', collabIds);

  if (promoErr) {
    throw new Error(`Eligible promotions (promotions): ${promoErr.message}`);
  }
  if (!promotionRows?.length) return [];

  const campaignIds = [
    ...new Set(promotionRows.map(p => p.campaign_id).filter(Boolean) as string[]),
  ];
  const campaignById = new Map<string, { id: string; campaign_name: string | null; organization_id: string }>();
  if (campaignIds.length > 0) {
    const { data: campaignRows, error: campErr } = await supabase
      .from('campaigns')
      .select('id, campaign_name, organization_id')
      .in('id', campaignIds);
    if (campErr) {
      throw new Error(`Eligible promotions (campaigns): ${campErr.message}`);
    }
    for (const c of campaignRows ?? []) {
      campaignById.set(c.id, c as any);
    }
  }

  const out: EligiblePromotion[] = [];

  for (const p of promotionRows) {
    const collab = collabRows.find(c => c.id === p.assignment_collaborator_id);
    const assignment =
      assignmentById.get(p.assignment_id) ??
      (collab ? assignmentById.get(collab.assignment_id) : undefined);
    if (!assignment) continue;

    const camp = p.campaign_id ? campaignById.get(p.campaign_id) : null;
    const modeRaw = assignment.creative_creation_mode as string | null;
    const creativeMode: CreativeCreationMode | null =
      modeRaw === 'campaign_asset_only' || modeRaw === 'campaign_links_and_assets'
        ? modeRaw
        : null;

    out.push({
      promotionId: p.id,
      assignmentId: assignment.id,
      assignmentCollaboratorId: p.assignment_collaborator_id,
      campaignId: p.campaign_id ?? null,
      campaignName: camp?.campaign_name ?? null,
      sponsorOrganizationId:
        camp?.organization_id ?? (assignment.organization_id as string) ?? null,
      label: (assignment.title as string) ?? `Promotion ${p.id.slice(0, 8)}`,
      creativeMode,
    });
  }

  return out;
}

/**
 * Group promotions that HAVE a creative mode by campaign (for campaign-first UI).
 */
export async function listCreativeEligibleCampaignsForMarketer(
  userId: string
): Promise<CreativeEligibleCampaign[]> {
  const all = await listEligiblePromotionsForMarketer(userId);
  const byCampaign = new Map<string, CreativeEligibleCampaign>();

  for (const p of all) {
    if (!p.creativeMode || !p.campaignId) continue;
    let entry = byCampaign.get(p.campaignId);
    if (!entry) {
      entry = {
        campaignId: p.campaignId,
        campaignName: p.campaignName ?? 'Campaign',
        sponsorOrganizationId: p.sponsorOrganizationId ?? '',
        mode: p.creativeMode,
        promotions: [],
      };
      byCampaign.set(p.campaignId, entry);
    }
    entry.promotions.push({
      promotionId: p.promotionId,
      assignmentId: p.assignmentId,
      assignmentCollaboratorId: p.assignmentCollaboratorId,
      campaignId: p.campaignId,
      label: p.label,
    });
  }

  return Array.from(byCampaign.values());
}

export function flattenCreativePromotions(
  campaigns: CreativeEligibleCampaign[]
): Array<
  CreativeEligiblePromotion & {
    campaignName: string;
    mode: CreativeCreationMode;
    sponsorOrganizationId: string;
  }
> {
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
 * promotion_assets + assignment allow_* + hostnames for selected_* domains.
 */
export async function loadPromotionAssetsForCreative(
  promotionId: string,
  assignmentId: string
): Promise<CreativePromotionAssetRow[]> {
  // selected_marketer_domain_id may not exist on older DBs — try full select, fall back.
  let paRows: any[] | null = null;
  {
    const full = await supabase
      .from('promotion_assets')
      .select(
        'asset_id, use_marketer_domain, use_vstrk_domain, selected_sponsor_domain_id, selected_marketer_domain_id'
      )
      .eq('promotion_id', promotionId);
    if (full.error && /selected_marketer_domain_id/i.test(full.error.message)) {
      const basic = await supabase
        .from('promotion_assets')
        .select(
          'asset_id, use_marketer_domain, use_vstrk_domain, selected_sponsor_domain_id'
        )
        .eq('promotion_id', promotionId);
      if (basic.error) {
        throw new Error(`Load promotion assets: ${basic.error.message}`);
      }
      paRows = (basic.data ?? []).map(r => ({
        ...r,
        selected_marketer_domain_id: null,
      }));
    } else if (full.error) {
      throw new Error(`Load promotion assets: ${full.error.message}`);
    } else {
      paRows = full.data ?? [];
    }
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

  const domainIds = [
    ...new Set(
      paRows
        .flatMap(r => [r.selected_sponsor_domain_id, r.selected_marketer_domain_id])
        .filter((id): id is string => !!id)
    ),
  ];
  let hostnameById = new Map<string, string>();
  if (domainIds.length > 0) {
    const { data: domainRows } = await supabase
      .from('branded_tracking_domains')
      .select('id, hostname')
      .in('id', domainIds);
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
    const mid = row.selected_marketer_domain_id ?? null;

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
      selected_marketer_domain_id: mid,
      selected_marketer_hostname: mid ? hostnameById.get(mid) ?? null : null,
    };
  });
}
