/**
 * src/services/assignment/getAssignmentDetail.ts
 * ...(existing header comments unchanged)...
 *
 * UPDATE (System Campaign fallback): Assignment Assets with no
 * campaign_assets row are Assets imported directly via Assets.tsx — they
 * have no Marketing Campaign provenance, not because anything is wrong,
 * but because they were never published from a Campaign. These are
 * grouped under the organization's ONLY PROMOTE ASSET System Campaign so
 * the existing campaign_id-based Promotion flow continues to work
 * unchanged. Campaign Element / Content Library assets are unaffected —
 * they still resolve via campaign_assets exactly as before.
 */

import { supabase } from '../../lib/supabase';
import {
  resolveElementThumbnail,
  resolveAssetThumbnail,
  type CampaignElementType,
  type ResourceType,
} from '../../lib/videoFormatters';

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

export interface AssignmentDetailData {
  assignment: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    organization_id: string;
  };
  myInvitation: { id: string; status: string } | null;
  myCollaboratorId: string | null;
  assignmentAssets: AssignmentAssetOption[];
  campaignGroups: CampaignGroup[];
}

const SYSTEM_CAMPAIGN_NAME = 'ONLY PROMOTE ASSET';

export async function getAssignmentDetail(
  assignmentId: string,
  currentUserId: string,
  currentUserEmail: string
): Promise<AssignmentDetailData> {
  const { data: assignment, error: assignmentErr } = await supabase
    .from('assignments')
    .select('id, title, description, status, organization_id')
    .eq('id', assignmentId)
    .single();

  if (assignmentErr || !assignment) {
    throw new Error(assignmentErr?.message ?? 'Assignment not found');
  }

  const [
    { data: invitation, error: invitationErr },
    { data: collaborator, error: collaboratorErr },
    { data: assignmentAssetRows, error: assetsErr },
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
  ]);

  if (invitationErr) throw new Error(`Invitation query failed: ${invitationErr.message}`);
  if (collaboratorErr) throw new Error(`Collaborator query failed: ${collaboratorErr.message}`);
  if (assetsErr) throw new Error(`Assignment assets query failed: ${assetsErr.message}`);

  const assetIds = (assignmentAssetRows ?? []).map(r => r.asset_id);

  let assignmentAssets: AssignmentAssetOption[] = [];
  let campaignGroups: CampaignGroup[] = [];

  if (assetIds.length > 0) {
    const [
      { data: videoRows, error: videoErr },
      { data: elementRows, error: elementErr },
      { data: resourceRows, error: resourceErr },
      { data: campaignAssetRows, error: caErr },
      { data: systemCampaignRow, error: systemCampaignErr },
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
      supabase
        .from('campaign_assets')
        .select('campaign_id, asset_id, campaigns(campaign_name)')
        .in('asset_id', assetIds),
      // The org's System Campaign — the fallback home for imported Assets
      // that have no Marketing Campaign provenance (no campaign_assets row).
      supabase
        .from('campaigns')
        .select('id, campaign_name')
        .eq('organization_id', assignment.organization_id)
        .eq('campaign_name', SYSTEM_CAMPAIGN_NAME)
        .maybeSingle(),
    ]);

    if (videoErr) throw new Error(`Failed to load asset display info: ${videoErr.message}`);
    if (elementErr) throw new Error(`Failed to load campaign element display info: ${elementErr.message}`);
    if (resourceErr) throw new Error(`Failed to load resource display info: ${resourceErr.message}`);
    if (caErr) throw new Error(`Failed to load campaign groupings: ${caErr.message}`);
    if (systemCampaignErr) throw new Error(`Failed to load System Campaign: ${systemCampaignErr.message}`);

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

    // "Select Assets to Promote" — Campaign-backed assets grouped by their
    // real Campaign, exactly as before.
    const groupMap = new Map<string, CampaignGroup>();
    for (const row of campaignAssetRows ?? []) {
      const campaignId = row.campaign_id as string;
      if (!groupMap.has(campaignId)) {
        groupMap.set(campaignId, {
          campaign_id: campaignId,
          campaign_name: (row as any).campaigns?.campaign_name ?? null,
          assets: [],
        });
      }
      groupMap.get(campaignId)!.assets.push(toAssetOption(row.asset_id));
    }

    // Imported Assets (Assets.tsx) — valid Assignment Assets with no
    // Marketing Campaign provenance. Grouped under the org's System
    // Campaign so they still resolve to a normal campaign_id for the
    // existing create_promotion flow. Campaign Element / Content Library
    // assets never reach this branch — they're already in groupMap above.
    if (systemCampaignRow) {
      const assetIdsWithCampaign = new Set((campaignAssetRows ?? []).map(r => r.asset_id));
      const importedAssetIds = assetIds.filter(id => !assetIdsWithCampaign.has(id));

      if (importedAssetIds.length > 0) {
        const systemCampaignId = systemCampaignRow.id;
        if (!groupMap.has(systemCampaignId)) {
          groupMap.set(systemCampaignId, {
            campaign_id: systemCampaignId,
            campaign_name: systemCampaignRow.campaign_name,
            assets: [],
          });
        }
        for (const importedAssetId of importedAssetIds) {
          groupMap.get(systemCampaignId)!.assets.push(toAssetOption(importedAssetId));
        }
      }
    }

    campaignGroups = Array.from(groupMap.values());
  }

  return {
    assignment,
    myInvitation: invitation ?? null,
    myCollaboratorId: collaborator?.id ?? null,
    assignmentAssets,
    campaignGroups,
  };
}