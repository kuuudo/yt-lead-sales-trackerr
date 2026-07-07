/**
 * src/services/assignment/getAssignmentDetail.ts
 *
 * Loads everything the Assignment Detail page needs in one place:
 *   - the assignment itself
 *   - the current user's relationship to it (pending invitation? active
 *     collaborator? neither — e.g. viewing as the org owner)
 *   - its assets — as two separate views, per the Design Lock:
 *
 *     `assignmentAssets` — EVERY asset attached via assignment_assets,
 *     regardless of Campaign provenance. This is "what's in this
 *     Assignment" and is the source of truth for the assets list shown
 *     to the user.
 *
 *     `campaignGroups` — only assets that also have a campaign_assets
 *     record, grouped by Campaign. This exists purely to drive the
 *     "Select Assets to Promote" flow, since Promotion requires a single
 *     campaign_id (Design Lock) and Library assets with no Campaign
 *     provenance simply aren't eligible for Promotion.
 *
 * These two were previously conflated — campaignGroups was the only
 * source used for display, which silently dropped any asset that had no
 * campaign_assets row (e.g. a Library asset added directly via the Asset
 * Picker, never published from a Campaign). They're now computed
 * independently from the same underlying assignment_assets / videos /
 * campaign_element_assets data, so an asset with no Campaign provenance
 * still shows up in the Assignment's asset list — it just won't appear
 * as a Promotion candidate, which is correct.
 */

import { supabase } from '../../lib/supabase';
import { resolveElementThumbnail, type CampaignElementType } from '../../lib/videoFormatters';

export interface AssignmentAssetOption {
  asset_id: string;
  kind: 'video' | 'campaign_element';
  video_title: string | null;
  thumbnail_url: string | null;
  display_name?: string;
  element_type?: CampaignElementType;
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
  /** Every asset attached to this Assignment, regardless of Campaign provenance. Drives "Assets in this Assignment". */
  assignmentAssets: AssignmentAssetOption[];
  /** Only Campaign-backed assets, grouped by Campaign. Drives "Select Assets to Promote" only. */
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
console.log('==============================');
console.log('[getAssignmentDetail] assignmentId:', assignmentId);
console.log('[getAssignmentDetail] currentUserId:', currentUserId);
console.log('[getAssignmentDetail] assetIds:', assetIds);
  let assignmentAssets: AssignmentAssetOption[] = [];
  let campaignGroups: CampaignGroup[] = [];

  if (assetIds.length > 0) {
    const [
      { data: videoRows, error: videoErr },
      { data: elementRows, error: elementErr },
      { data: campaignAssetRows, error: caErr },
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
        .from('campaign_assets')
        .select('campaign_id, asset_id, campaigns(campaign_name)')
        .in('asset_id', assetIds),
    ]);

    if (videoErr) throw new Error(`Failed to load asset display info: ${videoErr.message}`);
    if (elementErr) throw new Error(`Failed to load campaign element display info: ${elementErr.message}`);
    if (caErr) throw new Error(`Failed to load campaign groupings: ${caErr.message}`);
console.log('------------------------------');
console.log('[getAssignmentDetail] videoRows:', videoRows);
console.log('[getAssignmentDetail] videoErr:', videoErr);

console.log('[getAssignmentDetail] elementRows:', elementRows);
console.log('[getAssignmentDetail] elementErr:', elementErr);

console.log('[getAssignmentDetail] campaignAssetRows:', campaignAssetRows);
console.log('[getAssignmentDetail] caErr:', caErr);
    const videoByAsset = new Map((videoRows ?? []).map(v => [v.asset_id, v]));
    console.log('------------------------------');
console.log(
  '[getAssignmentDetail] videoByAsset keys:',
  [...videoByAsset.keys()]
);
    const elementByAsset = new Map((elementRows ?? []).map(e => [e.asset_id, e]));

    // Shared resolver so assignmentAssets and campaignGroups never disagree
    // about how a given asset_id renders (title/thumbnail/kind).
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
      return {
        asset_id: assetId,
        kind: 'video',
        video_title: video?.video_title ?? null,
        thumbnail_url: video?.thumbnail_url ?? null,
      };
    };

    // "Assets in this Assignment" — every asset attached via
    // assignment_assets, regardless of Campaign provenance.
    assignmentAssets = assetIds.map(toAssetOption);

    // "Select Assets to Promote" — only assets that also have a
    // campaign_assets record, grouped by Campaign. Assets with no Campaign
    // provenance (e.g. Library assets added directly, never published from
    // a Campaign) are correctly absent here — they have no campaign_id to
    // promote under.
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
