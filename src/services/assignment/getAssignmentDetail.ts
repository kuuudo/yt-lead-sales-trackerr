/**
 * src/services/assignment/getAssignmentDetail.ts
 * ...(existing header comments unchanged)...
 *
 * UPDATE (START PROMOTING door — broadened provenance resolution):
 * campaignGroups is no longer built from a single campaign_assets query.
 * Assets have 3 legitimate provenance sources (campaign_element_assets,
 * videos.campaign_id, or a formal campaign_assets row), and Resource
 * Assets intentionally have none of these natively. The door now asks,
 * per asset:
 *
 *   1. resolvePromotionCampaign(assetId) — read-only. Checks
 *      campaign_assets first (strongest, authoritative relationship),
 *      then falls back to the asset's own type-specific source of truth
 *      (videos.campaign_id for video assets, campaign_element_assets
 *      .campaign_id for campaign_element assets). Returns null for
 *      resource assets with no existing campaign_assets row — that's
 *      expected, not an error.
 *
 *   2. If null AND the asset is a resource asset —
 *      ensureResourcePromotionCampaign(assetId) is called. This is the
 *      only write path here: it finds (or requires) the organization's
 *      'ONLY PROMOTE ASSET' system campaign and inserts a campaign_assets
 *      row linking the resource asset to it, idempotently, then returns
 *      that campaign_id.
 *
 *   3. If still null (non-resource asset with no provenance anywhere) —
 *      the asset stays visible in `assignmentAssets` but is excluded
 *      from `campaignGroups`, i.e. not promotable. Same graceful
 *      degradation as before.
 *
 * This does NOT change asset creation, asset schema, createVideo.ts, or
 * addToLibrary.ts. Those remain untouched — this file only widens what
 * START PROMOTING is able to recognize as a valid promotion campaign.
 */

import { supabase } from '../../lib/supabase';
import {
  resolveElementThumbnail,
  resolveAssetThumbnail,
  type CampaignElementType,
  type ResourceType,
} from '../../lib/videoFormatters';
import { resolvePromotionCampaign } from '../asset/resolvePromotionCampaign';
import { ensureResourcePromotionCampaign } from '../asset/ensureResourcePromotionCampaign';

export interface AssignmentAssetOption {
  asset_id: string;
  kind: 'video' | 'campaign_element' | 'resource';
  video_title: string | null;
  thumbnail_url: string | null;
  display_name?: string;
  element_type?: CampaignElementType;
  resource_type?: ResourceType;
}

export interface CampaignGroup {
  campaign_id: string;
  campaign_name: string | null;
  assets: AssignmentAssetOption[];
}

/**
 * One shared Tracking Domain, as currently listed in
 * assignment_tracking_domains for this Assignment. Read-only display
 * shape — no status/authorization fields, since this PR does not add
 * any management action. hostname is reused directly from
 * branded_tracking_domains via the join below, not re-fetched through
 * listVerifiedBrandedDomains (which is org-scoped and answers a
 * different question — "what could be shared," not "what was shared
 * with this Assignment").
 */
export interface AssignmentTrackingDomain {
  id: string;
  hostname: string;
}

export interface AssignmentDetailData {
  assignment: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    organization_id: string;
    created_by_user_id: string;
    sponsor_name: string | null;
  };
  myInvitation: { id: string; status: string } | null;
  myCollaboratorId: string | null;
  assignmentAssets: AssignmentAssetOption[];
  campaignGroups: CampaignGroup[];
  trackingDomains: AssignmentTrackingDomain[];
}

export async function getAssignmentDetail(
  assignmentId: string,
  currentUserId: string,
  currentUserEmail: string
): Promise<AssignmentDetailData> {
  const { data: assignment, error: assignmentErr } = await supabase
    .from('assignments')
    .select('id, title, description, status, organization_id, created_by_user_id')
    .eq('id', assignmentId)
    .single();

  if (assignmentErr || !assignment) {
    throw new Error(assignmentErr?.message ?? 'Assignment not found');
  }

  const { data: sponsorProfile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', assignment.created_by_user_id)
    .maybeSingle();

  const sponsorName =
  sponsorProfile?.full_name?.trim() ||
  sponsorProfile?.email ||
  null;

  const [
    { data: invitation, error: invitationErr },
    { data: collaborator, error: collaboratorErr },
    { data: assignmentAssetRows, error: assetsErr },
    { data: trackingDomainRows, error: trackingDomainsErr },
  ] = await Promise.all([
    supabase
      .from('assignment_invitations')
      .select('id, status')
      .eq('assignment_id', assignmentId)
      .ilike('invited_email', currentUserEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('assignment_collaborators')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('user_id', currentUserId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('assignment_assets')
      .select('asset_id')
      .eq('assignment_id', assignmentId),
    // Read-only, this PR's actual addition. Reuses branded_tracking_domains
    // via a nested select on the join, rather than a second round trip —
    // same join-for-display-data pattern already used below for
    // videos/campaign_element_assets/asset_resources.
    supabase
      .from('assignment_tracking_domains')
      .select('branded_tracking_domain_id, branded_tracking_domains(id, hostname)')
      .eq('assignment_id', assignmentId),
  ]);

  if (invitationErr) throw new Error(`Invitation query failed: ${invitationErr.message}`);
  if (collaboratorErr) throw new Error(`Collaborator query failed: ${collaboratorErr.message}`);
  if (assetsErr) throw new Error(`Assignment assets query failed: ${assetsErr.message}`);
  if (trackingDomainsErr) throw new Error(`Tracking domains query failed: ${trackingDomainsErr.message}`);

  const trackingDomains: AssignmentTrackingDomain[] = (trackingDomainRows ?? [])
    .map((row: any) => row.branded_tracking_domains)
    .filter((d: any): d is { id: string; hostname: string } => !!d)
    .map((d: any) => ({ id: d.id, hostname: d.hostname }));

  const assetIds = (assignmentAssetRows ?? []).map(r => r.asset_id);

  let assignmentAssets: AssignmentAssetOption[] = [];
  let campaignGroups: CampaignGroup[] = [];

  if (assetIds.length > 0) {
    // These three queries remain — they're display-data lookups only
    // (title, thumbnail, element type, etc.), used by toAssetOption().
    // They are NOT used to decide campaign grouping anymore.
    const [
      { data: videoRows, error: videoErr },
      { data: elementRows, error: elementErr },
      { data: resourceRows, error: resourceErr },
    ] = await Promise.all([
      supabase
        .from('videos')
        .select('asset_id, video_title, thumbnail_url')
        .in('asset_id', assetIds),
      supabase
        .from('campaign_element_assets')
        .select('asset_id, display_name, element_type')
        .in('asset_id', assetIds),
      supabase
        .from('asset_resources')
        .select('asset_id, title, thumbnail_url, platform, resource_type')
        .in('asset_id', assetIds),
    ]);

    if (videoErr) throw new Error(`Failed to load asset display info: ${videoErr.message}`);
    if (elementErr) throw new Error(`Failed to load campaign element display info: ${elementErr.message}`);
    if (resourceErr) throw new Error(`Failed to load resource display info: ${resourceErr.message}`);

    const videoByAsset = new Map((videoRows ?? []).map(v => [v.asset_id, v]));
    const elementByAsset = new Map((elementRows ?? []).map(e => [e.asset_id, e]));
    const resourceByAsset = new Map((resourceRows ?? []).map(r => [r.asset_id, r]));

    const toAssetOption = (assetId: string): AssignmentAssetOption => {
      const element = elementByAsset.get(assetId);
      if (element) {
        return {
          asset_id: assetId,
          kind: 'campaign_element',
          video_title: null,
          thumbnail_url: resolveElementThumbnail(element.element_type),
          display_name: element.display_name,
          element_type: element.element_type,
        };
      }
      const video = videoByAsset.get(assetId);
      if (video) {
        return {
          asset_id: assetId,
          kind: 'video',
          video_title: video.video_title ?? null,
          thumbnail_url: video.thumbnail_url ?? null,
        };
      }
      const resource = resourceByAsset.get(assetId);
      if (resource) {
        return {
          asset_id: assetId,
          kind: 'resource',
          video_title: resource.title ?? null,
          thumbnail_url: resolveAssetThumbnail({
            thumbnail_url: resource.thumbnail_url,
            resource_type: resource.resource_type,
            platform: resource.platform,
          }),
          resource_type: resource.resource_type,
        };
      }
      return {
        asset_id: assetId,
        kind: 'video',
        video_title: null,
        thumbnail_url: null,
      };
    };

    // "Assets in this Assignment" — unchanged, every asset regardless of
    // Campaign provenance.
    assignmentAssets = assetIds.map(toAssetOption);

    // "Select Assets to Promote" — the broadened door. Each asset resolves
    // its own promotion campaign via its own type's source of truth;
    // resource assets get an idempotent system-campaign link created on
    // demand instead of being permanently excluded.
    const groupMap = new Map<string, CampaignGroup>();
    const campaignNameCache = new Map<string, string | null>();

    const getCampaignName = async (campaignId: string): Promise<string | null> => {
      if (campaignNameCache.has(campaignId)) return campaignNameCache.get(campaignId)!;
      const { data, error } = await supabase
        .from('campaigns')
        .select('campaign_name')
        .eq('id', campaignId)
        .maybeSingle();
      const name = error ? null : data?.campaign_name ?? null;
      campaignNameCache.set(campaignId, name);
      return name;
    };

    const addToGroup = async (campaignId: string, assetOption: AssignmentAssetOption) => {
      if (!groupMap.has(campaignId)) {
        groupMap.set(campaignId, {
          campaign_id: campaignId,
          campaign_name: await getCampaignName(campaignId),
          assets: [],
        });
      }
      groupMap.get(campaignId)!.assets.push(assetOption);
    };

    for (const assetId of assetIds) {
      const assetOption = toAssetOption(assetId);
      const resolved = await resolvePromotionCampaign(assetId);

      if (resolved) {
        await addToGroup(resolved.campaignId, assetOption);
        continue;
      }

      if (assetOption.kind === 'resource') {
        const campaignId = await ensureResourcePromotionCampaign(assetId);
        await addToGroup(campaignId, assetOption);
      }
      // else: no provenance anywhere and not a resource asset — stays
      // visible in assignmentAssets but excluded from campaignGroups
      // (not promotable), same graceful degradation as before.
    }

    campaignGroups = Array.from(groupMap.values());
  }

  return {
    assignment: { ...assignment, sponsor_name: sponsorName },
    myInvitation: invitation ?? null,
    myCollaboratorId: collaborator?.id ?? null,
    assignmentAssets,
    campaignGroups,
    trackingDomains,
  };
}
