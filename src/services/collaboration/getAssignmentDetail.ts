/**
 * src/services/assignment/getAssignmentDetail.ts
 *
 * Loads everything the Assignment Detail page needs in one place:
 *   - the assignment itself
 *   - the current user's relationship to it (pending invitation? active
 *     collaborator? neither — e.g. viewing as the org owner)
 *   - its assets, grouped by Campaign
 *
 * Assets are grouped by Campaign because Promotion requires a single
 * campaign_id (Design Lock) — an Assignment's assets may span more than
 * one Campaign, so the user picks one Campaign's worth at a time before
 * generating a Promotion.
 */

import { supabase } from '../../lib/supabase';

export interface AssignmentAssetOption {
  asset_id: string;
  video_title: string | null;
  thumbnail_url: string | null;
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
  /** null if the current user has no relationship to this assignment yet (e.g. viewing as org owner) */
  myInvitation: { id: string; status: string } | null;
  /** null until the invitation has been accepted */
  myCollaboratorId: string | null;
  campaignGroups: CampaignGroup[];
}

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

  const [{ data: invitation }, { data: collaborator }, { data: assignmentAssets }] = await Promise.all([
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

  const assetIds = (assignmentAssets ?? []).map(r => r.asset_id);
  let campaignGroups: CampaignGroup[] = [];

  if (assetIds.length > 0) {
    const { data: campaignAssetRows, error: caErr } = await supabase
      .from('campaign_assets')
      .select('campaign_id, asset_id, campaigns(campaign_name)')
      .in('asset_id', assetIds);

    if (caErr) throw new Error(`Failed to load campaign groupings: ${caErr.message}`);

    const { data: videoRows, error: videoErr } = await supabase
      .from('videos')
      .select('asset_id, video_title, thumbnail_url')
      .in('asset_id', assetIds);

    if (videoErr) throw new Error(`Failed to load asset display info: ${videoErr.message}`);

    const videoByAsset = new Map((videoRows ?? []).map(v => [v.asset_id, v]));
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
      const video = videoByAsset.get(row.asset_id);
      groupMap.get(campaignId)!.assets.push({
        asset_id: row.asset_id,
        video_title: video?.video_title ?? null,
        thumbnail_url: video?.thumbnail_url ?? null,
      });
    }

    campaignGroups = Array.from(groupMap.values());
  }

  return {
    assignment,
    myInvitation: invitation ?? null,
    myCollaboratorId: collaborator?.id ?? null,
    campaignGroups,
  };
}
