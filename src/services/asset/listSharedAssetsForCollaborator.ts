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
 * filter on `promotions` here; Promotion lifecycle (draft/active/paused/
 * etc.) is a separate concern from Asset sharing visibility. This was
 * deliberately decided, not an oversight — see project history if this
 * needs revisiting.
 *
 * "Shared Asset" is not a persisted Asset state — there is no shared=true
 * column anywhere, and this function does not create one. It is a
 * per-user workspace projection: the same `assets` row is "My Asset" for
 * members of its owning organization, and "Shared Asset" for a Promotion
 * collaborator outside that organization. That's why `excludeOrganizationId`
 * is required — "My" and "Shared" are two disjoint queries by
 * construction, not two overlapping queries reconciled with a de-dupe
 * step in the UI.
 *
 * Current implementation:
 *
 * owner_user_id is used only because create_promotion() guarantees that
 * the Promotion owner is the Assignment collaborator who created it.
 *
 * This is an implementation detail.
 *
 * The business authority remains:
 *
 * Assignment
 *   -> Promotion
 *   -> Promotion Assets
 *
 * If Promotion ownership ever changes (co-marketers, delegated
 * promotions, etc.), this lookup should be replaced with the Assignment
 * relationship rather than relying on owner_user_id.
 *
 * Deliberately implemented as three separate, independently-debuggable
 * queries (Promotions -> Promotion Assets -> Assets) rather than one
 * nested embedded query. Each step's output can be logged/inspected on
 * its own. This can be collapsed into a single embedded query later as
 * an optimization once the feature is verified end-to-end — not before.
 *
 * RLS note (deferred on purpose, tracked as a separate follow-up):
 * `assets` currently has RLS enabled with an organization-membership-only
 * SELECT policy. Until a policy is added allowing read access via the
 * promotion_assets/promotions path, cross-organization Shared Assets
 * will resolve correctly through Steps 1-2 but return zero rows at
 * Step 3 once they hit the `assets` table's RLS. Same-organization
 * collaborators are unaffected. Not addressed here — intentionally out
 * of scope until the feature is verified end-to-end.
 *
 * Step 3 mirrors listLibraryAssetsForAssignmentPicker.ts's video/resource
 * branching (including the embed array-vs-object caveat) and reuses its
 * LibraryAssetPickerRow shape, so picker UIs can render "My" and
 * "Shared" rows identically without a second row type.
 *
 * Scope note: same as listLibraryAssetsForAssignmentPicker.ts,
 * campaign_element assets are out of scope here.
 */

import { supabase } from '../../lib/supabase';
import { resolveAssetThumbnail } from '../../lib/videoFormatters';
import type {
  AssetPickerFilterType,
  LibraryAssetPickerRow,
} from '../assignment/listLibraryAssetsForAssignmentPicker';
export interface SharedAssetLibraryRow extends LibraryAssetPickerRow {
  organization_name: string;
}

export interface ListSharedAssetsForCollaboratorInput {
  userId: string;
  /**
   * The viewer's current organization context — the same organizationId
   * already passed to listAssetsByOrganization() / 
   * listLibraryAssetsForAssignmentPicker() for "My Assets". Assets
   * belonging to this organization are excluded here so "My" and
   * "Shared" never overlap.
   */
  excludeOrganizationId: string;
  filterType?: AssetPickerFilterType;
  search?: string;
}

// ---- Step 1: resolve my Promotion IDs ----
//
// TODO: this lookup uses owner_user_id purely as an implementation
// convenience — the same pattern already used by
// collaborationHub.ts's listMyPromotions(). It works today ONLY because
// create_promotion() guarantees that promotions.owner_user_id ===
// the assignment_collaborators.user_id who created it.
//
// owner_user_id is NOT the business authority here. The authority is:
//
//   Assignment (assignment_collaborators)
//     -> Promotion
//     -> Promotion Assets
//
// If Promotion ownership semantics ever change (co-marketers, delegated
// promotions, a promotion created on behalf of a collaborator by someone
// else, etc.), this function should be migrated to resolve promotion IDs
// via assignment_collaborators.user_id -> promotions.assignment_collaborator_id
// instead of owner_user_id. Do not treat owner_user_id as authorization
// just because it happens to agree with it today.
async function getMyPromotionIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('id')
    .eq('owner_user_id', userId);

  if (error) {
    throw new Error(`Failed to load promotions for user: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.id as string);
}

// ---- Step 2: resolve which asset_ids those Promotions activated ----
async function getAssetIdsForPromotions(promotionIds: string[]): Promise<string[]> {
  if (promotionIds.length === 0) return [];

  const { data, error } = await supabase
    .from('promotion_assets')
    .select('asset_id')
    .in('promotion_id', promotionIds);

  if (error) {
    throw new Error(`Failed to load promotion assets: ${error.message}`);
  }

  return Array.from(new Set((data ?? []).map((row: any) => row.asset_id as string)));
}

// ---- Step 3: load display rows for those asset_ids ----
// Mirrors listLibraryAssetsForAssignmentPicker.ts's video/resource
// branching verbatim, filtered by asset_id instead of organization_id,
// and with excludeOrganizationId subtracted so this never overlaps with
// "My Assets".
async function getSharedAssetRows(
  assetIds: string[],
  excludeOrganizationId: string,
  filterType?: AssetPickerFilterType,
  search?: string
): Promise<{
  rows: LibraryAssetPickerRow[];
  assetOrgMap: Map<string, string>;
}> {
  if (assetIds.length === 0) {
    return {
        rows: [],
        assetOrgMap: new Map(),
    };
}

  const results: LibraryAssetPickerRow[] = [];
  const assetOrgMap = new Map<string, string>();
  const searchLower = search?.trim().toLowerCase() || undefined;
  const wantsVideo = !filterType || filterType === 'video';
  const wantsResource = !filterType || filterType === 'resource';

  if (wantsVideo) {
    const { data: videoAssetRows, error: videoErr } = await supabase
      .from('assets')
      .select('id, organization_id, videos!inner(video_title, thumbnail_url, platform)')
      .in('id', assetIds)
      .eq('asset_type', 'video')
      .neq('organization_id', excludeOrganizationId);

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
    assetOrgMap.set(row.id, row.organization_id);  
    }
  }

  if (wantsResource) {
    const { data: resourceAssetRows, error: resourceErr } = await supabase
      .from('assets')
      .select(
        'id, organization_id, asset_resources!inner(title, thumbnail_url, platform, resource_type)'
      )
      .in('id', assetIds)
      .eq('asset_type', 'resource')
      .neq('organization_id', excludeOrganizationId);

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
      assetOrgMap.set(row.id, row.organization_id);
    }
  }

  return {
    rows: results,
    assetOrgMap,
};
}

export async function listSharedAssetsForCollaborator({
  userId,
  excludeOrganizationId,
  filterType,
  search,
}: ListSharedAssetsForCollaboratorInput): Promise<SharedAssetLibraryRow[]> {
const promotionIds = await getMyPromotionIds(userId);

const assetIds = await getAssetIdsForPromotions(promotionIds);

const { rows, assetOrgMap } = await getSharedAssetRows(
  assetIds,
  excludeOrganizationId,
  filterType,
  search
);
console.log('rows', rows);
console.log('assetOrgMap', Array.from(assetOrgMap.entries()));
const organizationNames = await getOwnerOrganizationNames(
  Array.from(assetOrgMap.values())
);
console.log(
  'organizationNames',
  Array.from(organizationNames.entries())
);
return rows.map(row => ({
  ...row,
  organization_name:
    organizationNames.get(assetOrgMap.get(row.asset_id) ?? '') ??
    'Unknown Organization',
}));
}
async function getOwnerOrganizationNames(
  organizationIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(organizationIds));
console.log('uniqueIds', uniqueIds);
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', uniqueIds);
console.log('organization query', {
  data,
  error,
});
  if (error) {
    throw new Error(
      `Failed to load owner organization names: ${error.message}`
    );
  }

  return new Map(
    (data ?? []).map((row: any) => [row.id as string, row.name as string])
  );
}