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
 * created_by_user_id) — NOT promotions.owner_user_id. owner_user_id is
 * the Marketer's own id (the person calling create_promotion), so using
 * it here would incorrectly label the Marketer as the sharer of their
 * own shared asset. The Assignment creator is the Sponsor who actually
 * granted access, which is the correct "shared by" identity per the
 * Assignment = Authorization architecture lock.
 *
 * Current implementation:
 *
 * owner_user_id is used only to resolve MY promotion ids (Step 1) —
 * because create_promotion() guarantees promotions.owner_user_id is the
 * calling collaborator. This is unrelated to whose name gets displayed;
 * see Step 4/5 for the sharer identity resolution.
 *
 * If Promotion ownership semantics ever change (co-marketers, delegated
 * promotions, etc.), Step 1 should be migrated to resolve promotion ids
 * via assignment_collaborators.user_id -> promotions.assignment_collaborator_id
 * instead of owner_user_id.
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
import { resolveAssetThumbnail } from '../../lib/videoFormatters';
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

// ---- Step 1: resolve my Promotion IDs, keeping each promotion's assignment_id ----
//
// TODO: owner_user_id is an implementation convenience for finding MY
// promotions (see file header). Not related to sharer identity.
async function getMyPromotions(
  userId: string
): Promise<{ id: string; assignment_id: string | null }[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('id, assignment_id')
    .eq('owner_user_id', userId);

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
      .select('id')
      .in('id', assetIds)
      .eq('asset_type', 'video')
      .neq('organization_id', excludeOrganizationId);
console.log("videoAssetRows", videoAssetRows);
console.log("videoErr", videoErr);
console.log("video status", status);
console.log("videoAssetRows", videoAssetRows);
console.log("videoErr", videoErr);
console.log(videoAssetRows);
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
        thumbnail: video?.thumbnail_url ?? null,
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