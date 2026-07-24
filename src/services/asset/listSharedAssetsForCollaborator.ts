/**
 * src/services/asset/listSharedAssetsForCollaborator.ts
 *
 * "Shared Assets" — Assets unlocked for the current user via a Promotion
 * they created against an active Assignment collaboration.
 *
 * Architecture lock (do not restructure without re-opening this discussion):
 *   Assignment  -> Authorization  (assignment_assets: what CAN be used)
 *   Promotion   -> Activation     (promotion_assets: what the collaborator
 *                                   actually started promoting)
 *   Workspace   -> Visibility     (this function: what shows up as Shared)
 *
 * Visibility is unlocked by the EXISTENCE of a Promotion row linking the
 * asset to this user — NOT by promotions.status. Do not add a status
 * filter on `promotions` here.
 *
 * "Shared Asset" is not a persisted Asset state — it is a per-user
 * workspace projection. That's why `excludeOrganizationId` is required —
 * "My" and "Shared" are two disjoint queries by construction.
 *
 * UPDATE (sharer identity pass): dropped the organizations.name lookup
 * entirely. Root cause of the earlier blank "Shared by" bug was
 * `organizations` RLS silently returning zero rows for cross-org
 * collaborators — not a code bug. Rather than relaxing organization
 * visibility just to render a workspace name, the product decision is
 * to show WHO shared the asset (a person), not WHICH organization owns
 * it. "Who shared this" = the Assignment's creator (assignments.
 * created_by_user_id) — NOT promotions.owner_user_id. Confirmed against
 * production data: owner_user_id is always the organization's owner
 * (organizations.owner_id, set unconditionally by create_promotion),
 * never the collaborator who actually called START PROMOTING — so using
 * it here would show the org owner as "sharer" on every promotion
 * regardless of who actually granted access. The Assignment creator is
 * the correct "shared by" identity per the Assignment = Authorization
 * architecture lock.
 *
 * Current implementation:
 *
 * Step 1 resolves MY promotion ids via
 * assignment_collaborators.user_id -> assignment_collaborators.id ->
 * promotions.assignment_collaborator_id (see getMyAssignmentCollaboratorIds
 * / getMyPromotions below). This is unrelated to whose name gets
 * displayed as "shared by" — see Step 4/5 for that resolution.
 *
 * FIXED (confirmed against production data): promotions.owner_user_id is
 * NOT a valid way to find a collaborator's own promotions — it is always
 * the organization owner, regardless of who actually called START
 * PROMOTING. Step 1 previously filtered on it and could never match a
 * real collaborator, which meant Shared Assets silently never populated
 * for anyone. Do not reintroduce an owner_user_id filter into Step 1.
 *
 * Deliberately implemented as small, independently-debuggable queries
 * rather than one nested embedded query, for the same debuggability
 * reasons as before. Do not collapse this into a single query.
 *
 * RLS note: `assets` has an organization-membership-only SELECT policy;
 * a policy allowing read access via the promotion_assets/promotions path
 * is still deferred as a separate follow-up (per earlier decision).
 */

import { supabase } from '../../lib/supabase';
import {
  resolveThumbnail,
  resolveAssetThumbnail,
  resolveElementThumbnail,
} from '../../lib/videoFormatters';
import type {
  AssetPickerFilterType,
  LibraryAssetPickerRow,
} from '../assignment/listLibraryAssetsForAssignmentPicker';

export interface SharedAssetLibraryRow extends LibraryAssetPickerRow {
  /** Display name of the person who shared this asset (Assignment creator). Falls back to email, then 'Unknown User'. */
  shared_by_name: string;
  /** Email of the person who shared this asset. */
  shared_by_email: string | null;
}

export interface ListSharedAssetsForCollaboratorInput {
  userId: string;
  excludeOrganizationId: string;
  filterType?: AssetPickerFilterType;
  search?: string;
}

// ---- Step 1a: resolve MY assignment_collaborators.id rows ----
//
// Bridge step: promotions.assignment_collaborator_id points at
// assignment_collaborators.id, not directly at a user_id, so this has to
// be resolved first. Same convention as Step 4/5's
// getAssignmentCreators/getSharerProfiles split below — small,
// independently-debuggable steps, not one nested query.
async function getMyAssignmentCollaboratorIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('assignment_collaborators')
    .select('id')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to load assignment collaborator ids for user: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.id as string);
}

// ---- Step 1: resolve my Promotion IDs, keeping each promotion's assignment_id ----
//
// FIXED: previously filtered on promotions.owner_user_id, which is
// ALWAYS the organization owner (confirmed directly against production
// data — create_promotion sets it unconditionally from
// organizations.owner_id, regardless of which path created the
// Promotion). It is never the collaborator who actually called START
// PROMOTING. Filtering on it here meant a collaborator's own promotions
// could never be found by this function — Step 2 (promotion_assets) and
// everything downstream never ran, so promoted Assets silently never
// appeared in Shared Assets.
//
// Correct resolution: promotions.assignment_collaborator_id ->
// assignment_collaborators.id, scoped to rows where
// assignment_collaborators.user_id = this user (Step 1a above). This is
// the same relationship the file header already documented as the
// eventual fix ("If Promotion ownership semantics ever change... Step 1
// should be migrated to resolve promotion ids via
// assignment_collaborators.user_id -> promotions.assignment_collaborator_id
// instead of owner_user_id") — that condition already holds today, this
// isn't a hypothetical anymore.
async function getMyPromotions(
  userId: string
): Promise<{ id: string; assignment_id: string | null }[]> {
  const myCollaboratorIds = await getMyAssignmentCollaboratorIds(userId);
  if (myCollaboratorIds.length === 0) return [];

  const { data, error } = await supabase
    .from('promotions')
    .select('id, assignment_id')
    .in('assignment_collaborator_id', myCollaboratorIds);

  if (error) {
    throw new Error(`Failed to load promotions for user: ${error.message}`);
  }

  return (data ?? []) as { id: string; assignment_id: string | null }[];
}

// ---- Step 2: resolve asset_ids per promotion, keeping the promotion_id link ----
async function getAssetPromotionPairs(
  promotionIds: string[]
): Promise<{ asset_id: string; promotion_id: string }[]> {
  if (promotionIds.length === 0) return [];

  const { data, error } = await supabase
    .from('promotion_assets')
    .select('asset_id, promotion_id')
    .in('promotion_id', promotionIds);

  if (error) {
    throw new Error(`Failed to load promotion assets: ${error.message}`);
  }

  return (data ?? []) as { asset_id: string; promotion_id: string }[];
}

// ---- Step 3: load display rows for those asset_ids ----
// Unchanged from before — mirrors listLibraryAssetsForAssignmentPicker.ts.
async function getSharedAssetRows(
  assetIds: string[],
  excludeOrganizationId: string,
  filterType?: AssetPickerFilterType,
  search?: string
): Promise<LibraryAssetPickerRow[]> {
  if (assetIds.length === 0) return [];

  const results: LibraryAssetPickerRow[] = [];
  console.log("search =", search, typeof search);
  const searchLower = search?.trim().toLowerCase() || undefined;
  const wantsVideo = !filterType || filterType === 'video';
  const wantsResource = !filterType || filterType === 'resource';

  if (wantsVideo) {
    const { data: videoAssetRows, error: videoErr, status } = await supabase
      .from('assets')
      .select(`
    id,
    videos(
        asset_id,
        video_title,
        thumbnail_url,
        platform
    )
`)

      .in('id', assetIds)
      .eq('asset_type', 'video')
      .neq('organization_id', excludeOrganizationId);
console.log("videoAssetRows", videoAssetRows);
console.log("videoErr", videoErr);
console.log("video status", status);
console.log("videoAssetRows", videoAssetRows);
console.log("videoErr", videoErr);
console.log(videoAssetRows);
console.log(JSON.stringify(videoAssetRows, null, 2));
    if (videoErr) {
      throw new Error(`Failed to load shared video assets: ${videoErr.message}`);
    }

    for (const row of (videoAssetRows ?? []) as any[]) {
      const video = Array.isArray(row.videos) ? row.videos[0] : row.videos;
      const title: string | null = video?.video_title ?? null;

      if (searchLower && !(title ?? '').toLowerCase().includes(searchLower)) {
        continue;
      }

      results.push({
        asset_id: row.id,
        display_name: title ?? 'Untitled video',
        asset_type: 'video',
        resource_type: null,
        thumbnail: video
          ? resolveThumbnail({
              thumbnail_url: video.thumbnail_url,
              platform: video.platform,
            })
          : null,
      });
    }
  }

  if (wantsResource) {
    const { data: resourceAssetRows, error: resourceErr } = await supabase
      .from('assets')
      .select('id, asset_resources!inner(title, thumbnail_url, platform, resource_type)')
      .in('id', assetIds)
      .eq('asset_type', 'resource')
      .neq('organization_id', excludeOrganizationId);
console.log("resourceAssetRows", resourceAssetRows);
console.log("resourceErr", resourceErr);
    if (resourceErr) {
      throw new Error(`Failed to load shared resource assets: ${resourceErr.message}`);
    }

    for (const row of (resourceAssetRows ?? []) as any[]) {
      const resource = Array.isArray(row.asset_resources)
        ? row.asset_resources[0]
        : row.asset_resources;
      const title: string | null = resource?.title ?? null;

      if (searchLower && !(title ?? '').toLowerCase().includes(searchLower)) {
        continue;
      }

      results.push({
        asset_id: row.id,
        display_name: title ?? 'Untitled resource',
        asset_type: 'resource',
        resource_type: resource?.resource_type ?? null,
        thumbnail: resource
          ? resolveAssetThumbnail({
              thumbnail_url: resource.thumbnail_url,
              resource_type: resource.resource_type,
              platform: resource.platform,
            })
          : null,
      });
    }
  }

  // ---- Campaign Element branch ----
  // MISSING PATH, now added: assets -> campaign_element_assets, same
  // shape as the video/resource branches above. Was silently dropped
  // before this fix — promotion_assets correctly referenced these
  // asset_ids, but no query here ever resolved their display metadata,
  // so they never reached `results` and never appeared in Shared Assets.
  //
  // AssetPickerFilterType (video | resource) doesn't include this kind —
  // that type lives in listLibraryAssetsForAssignmentPicker.ts and is out
  // of scope for this fix. Only fetched when no explicit filter is
  // requested, matching this function's existing "no filter = everything"
  // behavior for the other two branches.
  const wantsCampaignElement = !filterType;

  if (wantsCampaignElement) {
    const { data: elementAssetRows, error: elementErr } = await supabase
      .from('assets')
      .select('id, campaign_element_assets(display_name, element_type)')
      .in('id', assetIds)
      .eq('asset_type', 'campaign_element')
      .neq('organization_id', excludeOrganizationId);

    if (elementErr) {
      throw new Error(`Failed to load shared campaign element assets: ${elementErr.message}`);
    }

    for (const row of (elementAssetRows ?? []) as any[]) {
      // asset_id is unique on campaign_element_assets (per
      // listAssetsByOrganization.ts's own note), so this is normally
      // object-shaped — defensively handled the same way as the
      // resource branch above, in case that ever changes.
      const element = Array.isArray(row.campaign_element_assets)
        ? row.campaign_element_assets[0]
        : row.campaign_element_assets;
      const title: string | null = element?.display_name ?? null;

      if (searchLower && !(title ?? '').toLowerCase().includes(searchLower)) {
        continue;
      }

      // Cast required: LibraryAssetPickerRow.asset_type is typed as
      // 'video' | 'resource' only (defined in
      // listLibraryAssetsForAssignmentPicker.ts, out of scope here).
      // 'campaign_element' is a valid runtime asset_type but not part of
      // that shared type's literal union — widening that type is a
      // separate change, not part of this surgical fix.
      results.push({
        asset_id: row.id,
        display_name: title ?? 'Untitled asset',
        asset_type: 'campaign_element',
        resource_type: null,
        thumbnail: element ? resolveElementThumbnail(element.element_type) : null,
      } as LibraryAssetPickerRow);
    }
  }

  return results;
}

// ---- Step 4: resolve each assignment's creator (the Sponsor who shared) ----
async function getAssignmentCreators(
  assignmentIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(assignmentIds));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('assignments')
    .select('id, created_by_user_id')
    .in('id', uniqueIds);

  if (error) {
    throw new Error(`Failed to load assignment creators: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: any) => [row.id as string, row.created_by_user_id as string])
  );
}

// ---- Step 5: resolve sharer profile display info ----
async function getSharerProfiles(
  userIds: string[]
): Promise<Map<string, { full_name: string | null; email: string | null }>> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', uniqueIds);

  if (error) {
    throw new Error(`Failed to load sharer profiles: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: any) => [
      row.id as string,
      { full_name: row.full_name as string | null, email: row.email as string | null },
    ])
  );
}

export async function listSharedAssetsForCollaborator({
  userId,
  excludeOrganizationId,
  filterType,
  search,
}: ListSharedAssetsForCollaboratorInput): Promise<SharedAssetLibraryRow[]> {
  const myPromotions = await getMyPromotions(userId);
  console.log("myPromotions", myPromotions);
  const promotionIds = myPromotions.map(p => p.id);

  const assetPromotionPairs = await getAssetPromotionPairs(promotionIds);
  console.log("assetPromotionPairs", assetPromotionPairs);
  const assetIds = Array.from(new Set(assetPromotionPairs.map(p => p.asset_id)));
  console.log("assetIds", assetIds);
  const rows = await getSharedAssetRows(assetIds, excludeOrganizationId, filterType, search);

  // asset_id -> promotion_id (first match; an asset promoted via multiple
  // promotions is an edge case not resolved here)
  const assetToPromotion = new Map<string, string>();
  for (const pair of assetPromotionPairs) {
    if (!assetToPromotion.has(pair.asset_id)) {
      assetToPromotion.set(pair.asset_id, pair.promotion_id);
    }
  }

  // promotion_id -> assignment_id
  const promotionToAssignment = new Map<string, string | null>();
  for (const p of myPromotions) {
    promotionToAssignment.set(p.id, p.assignment_id);
  }

  const assignmentIds = Array.from(
    new Set(myPromotions.map(p => p.assignment_id).filter((id): id is string => !!id))
  );
  const assignmentCreators = await getAssignmentCreators(assignmentIds);

  const sharerUserIds = Array.from(new Set(Array.from(assignmentCreators.values())));
  const sharerProfiles = await getSharerProfiles(sharerUserIds);

  return rows.map(row => {
    const promotionId = assetToPromotion.get(row.asset_id);
    const assignmentId = promotionId ? promotionToAssignment.get(promotionId) : null;
    const creatorUserId = assignmentId ? assignmentCreators.get(assignmentId) : null;
    const profile = creatorUserId ? sharerProfiles.get(creatorUserId) : null;

    return {
      ...row,
      shared_by_name: profile?.full_name || profile?.email || 'Unknown User',
      shared_by_email: profile?.email ?? null,
    };
  });
}