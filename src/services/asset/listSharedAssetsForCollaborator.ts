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
import { getAssetAccessStatesForCollaborator } from '../assignment/assignmentAssetAccess';
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

/**
 * assignment_collaborators.id[] belonging to this user — the bridge
 * between a user and promotions.assignment_collaborator_id (which points
 * to assignment_collaborators.id, not directly to a user_id). Small,
 * independently-debuggable step, reused by getMyPromotions below.
 *
 * PHASE 2B FIX: filtered to status = 'active' only. Remove Collaborator
 * (Phase 2A) flips assignment_collaborators.status to 'removed' but
 * deliberately never deletes the row, any promotions, or promotion_assets
 * — historical data stays intact. Without this filter, a removed
 * collaborator's id was still returned here, so getMyPromotions still
 * found their old promotions and Shared Assets kept showing previously
 * promoted assets after removal. This is the ONLY change needed to make
 * Shared Assets respect removal — no promotion/promotion_assets row is
 * touched, access is blocked purely by this read-time filter, per the
 * locked "authorization blocks access, history is not deleted" rule.
 */
async function getMyAssignmentCollaboratorIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('assignment_collaborators')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active');

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
): Promise<{ id: string; assignment_id: string | null; assignment_collaborator_id: string | null }[]> {
  console.time('[SharedAssets] step 1a: getMyAssignmentCollaboratorIds');
  const myCollaboratorIds = await getMyAssignmentCollaboratorIds(userId);
  console.timeEnd('[SharedAssets] step 1a: getMyAssignmentCollaboratorIds');
  console.log('[SharedAssets] counts', { myCollaboratorIds: myCollaboratorIds.length });
  if (myCollaboratorIds.length === 0) return [];

  console.time('[SharedAssets] step 1b: promotions query');
  const { data, error } = await supabase
    .from('promotions')
    .select('id, assignment_id, assignment_collaborator_id')
    .in('assignment_collaborator_id', myCollaboratorIds);
  console.timeEnd('[SharedAssets] step 1b: promotions query');

  if (error) {
    throw new Error(`Failed to load promotions for user: ${error.message}`);
  }

  return (data ?? []) as { id: string; assignment_id: string | null; assignment_collaborator_id: string | null }[];
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
    console.time('[SharedAssets] step 4a: video assets query');
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
    console.timeEnd('[SharedAssets] step 4a: video assets query');
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
    console.time('[SharedAssets] step 4b: resource assets query');
    const { data: resourceAssetRows, error: resourceErr } = await supabase
      .from('assets')
      .select('id, asset_resources!inner(title, thumbnail_url, platform, resource_type)')
      .in('id', assetIds)
      .eq('asset_type', 'resource')
      .neq('organization_id', excludeOrganizationId);
console.log("resourceAssetRows", resourceAssetRows);
console.log("resourceErr", resourceErr);
    console.timeEnd('[SharedAssets] step 4b: resource assets query');
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
    console.time('[SharedAssets] step 4c: campaign element assets query');
    const { data: elementAssetRows, error: elementErr } = await supabase
      .from('assets')
      .select('id, campaign_element_assets(display_name, element_type)')
      .in('id', assetIds)
      .eq('asset_type', 'campaign_element')
      .neq('organization_id', excludeOrganizationId);
    console.timeEnd('[SharedAssets] step 4c: campaign element assets query');

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

// ---- Step 2a (Phase 2C): resolve revoked (collaborator, asset) keys ----
//
// Reuses getAssetAccessStatesForCollaborator from assignmentAssetAccess.ts
// rather than writing a new query here — same "reuse, don't duplicate
// resolvers" discipline as getAssetDetail() reuse in getPromotionDetail.ts.
// Called once per distinct assignment_collaborator_id involved (small N,
// same acceptable N+1 tradeoff already used elsewhere in this codebase
// for per-item resolution). Keys are "collaboratorId:assetId" since a
// user's Shared Assets can in principle span multiple distinct
// collaborator relationships (different Assignments, possibly different
// orgs), and revocation is scoped per-collaborator, never per-user.
async function getRevokedAssetKeys(collaboratorIds: string[]): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(collaboratorIds));
  if (uniqueIds.length === 0) return new Set();

  const perCollaborator = await Promise.all(
    uniqueIds.map(async (id) => ({ id, revokedMap: await getAssetAccessStatesForCollaborator(id) }))
  );

  const revoked = new Set<string>();
  for (const { id, revokedMap } of perCollaborator) {
    for (const assetId of revokedMap.keys()) {
      revoked.add(`${id}:${assetId}`);
    }
  }
  return revoked;
}

export async function listSharedAssetsForCollaborator({
  userId,
  excludeOrganizationId,
  filterType,
  search,
}: ListSharedAssetsForCollaboratorInput): Promise<SharedAssetLibraryRow[]> {
  console.log('[SharedAssets] START');
  console.time('[SharedAssets] TOTAL');

  console.time('[SharedAssets] step 1: getMyPromotions');
  const myPromotions = await getMyPromotions(userId);
  console.timeEnd('[SharedAssets] step 1: getMyPromotions');
  console.log("myPromotions", myPromotions);
  const promotionIds = myPromotions.map(p => p.id);

  console.time('[SharedAssets] step 2: getAssetPromotionPairs');
  const assetPromotionPairs = await getAssetPromotionPairs(promotionIds);
  console.timeEnd('[SharedAssets] step 2: getAssetPromotionPairs');
  console.log("assetPromotionPairs", assetPromotionPairs);

  // promotion_id -> assignment_collaborator_id (needed to know WHICH
  // collaborator's access state governs each promoted asset)
  const promotionToCollaborator = new Map<string, string | null>();
  for (const p of myPromotions) {
    promotionToCollaborator.set(p.id, p.assignment_collaborator_id);
  }

  // asset_id -> assignment_collaborator_id (first match; same "first
  // match" tolerance already used for assetToPromotion below)
  const assetToCollaborator = new Map<string, string>();
  for (const pair of assetPromotionPairs) {
    if (!assetToCollaborator.has(pair.asset_id)) {
      const collaboratorId = promotionToCollaborator.get(pair.promotion_id);
      if (collaboratorId) assetToCollaborator.set(pair.asset_id, collaboratorId);
    }
  }

  // Phase 2C: an asset revoked for THIS SPECIFIC collaborator must
  // disappear from Shared Assets, symmetric with what Remove Collaborator
  // already does — same "hide through a read-time filter, never delete
  // promotion_assets/promotions" discipline. Filtered BEFORE resolving
  // display metadata, so a revoked asset never even reaches
  // getSharedAssetRows — cheaper, and it never enters the `rows` array
  // to leak through downstream.
  console.time('[SharedAssets] step 3: getRevokedAssetKeys');
  const revokedKeys = await getRevokedAssetKeys(Array.from(new Set(assetToCollaborator.values())));
  console.timeEnd('[SharedAssets] step 3: getRevokedAssetKeys');
  const allAssetIds = Array.from(new Set(assetPromotionPairs.map(p => p.asset_id)));
  const assetIds = allAssetIds.filter(assetId => {
    const collaboratorId = assetToCollaborator.get(assetId);
    return !(collaboratorId && revokedKeys.has(`${collaboratorId}:${assetId}`));
  });
  console.log("assetIds", assetIds);
  console.time('[SharedAssets] step 4: getSharedAssetRows (all 3 sub-queries)');
  const rows = await getSharedAssetRows(assetIds, excludeOrganizationId, filterType, search);
  console.timeEnd('[SharedAssets] step 4: getSharedAssetRows (all 3 sub-queries)');

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
  console.time('[SharedAssets] step 5: getAssignmentCreators');
  const assignmentCreators = await getAssignmentCreators(assignmentIds);
  console.timeEnd('[SharedAssets] step 5: getAssignmentCreators');

  const sharerUserIds = Array.from(new Set(Array.from(assignmentCreators.values())));
  console.time('[SharedAssets] step 6: getSharerProfiles');
  const sharerProfiles = await getSharerProfiles(sharerUserIds);
  console.timeEnd('[SharedAssets] step 6: getSharerProfiles');

  console.log('[SharedAssets] counts', { finalRows: rows.length, assignmentIds: assignmentIds.length, sharerUserIds: sharerUserIds.length });
  console.timeEnd('[SharedAssets] TOTAL');
  console.log('[SharedAssets] END');

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