/**
 * src/services/assignment/listLibraryAssetsForAssignmentPicker.ts
 *
 * Library-scoped Asset Picker query for the Create Assignment flow.
 *
 * Scoping rule (deliberately different from listAssetsForCampaign() in
 * listAssetsForAssignmentPicker.ts):
 *   - listAssetsForCampaign()  scopes by campaign_id, via campaign_assets
 *     (provenance only — "which Campaign published this Asset").
 *   - listLibraryAssetsForAssignmentPicker() scopes by organization_id +
 *     added_to_library_at IS NOT NULL — i.e. the actual Asset Library,
 *     matching the scoping rule already used in listAssetsByOrganization.ts.
 *
 * UPDATE (Picker UI pass): campaign_element removed from this picker's
 * scope. Not a permissions decision — Campaign Elements already have a
 * dedicated authorization flow in CreateAssignment.tsx (Campaign ->
 * Authorized Assets, above this picker), which writes the same
 * assignment_assets rows this picker's selections do. Showing them again
 * here would let the same Landing Page / Newsletter / Sales Call be
 * selected in two different places in the same form — this picker now
 * covers Library assets only (video / resource).
 *
 * Does NOT touch: RLS policies, schema, createAssignment.ts, or existing
 * shared types. Read-only. Additive only.
 */

import { supabase } from '../../lib/supabase';
import { resolveAssetThumbnail, type ResourceType } from '../../lib/videoFormatters';
import { getAssetArchiveContextsForViewer } from '../asset/getAssetArchiveContext';
export type AssetPickerFilterType = 'video' | 'resource';

export interface LibraryAssetPickerRow {
  asset_id: string;
  display_name: string;
  asset_type: 'video' | 'resource';
  resource_type: ResourceType | null;
  thumbnail: string | null;
}

export interface ListLibraryAssetsForAssignmentPickerInput {
  organizationId: string;
  viewerId: string;
  filterType?: AssetPickerFilterType;
  search?: string;
}

export async function listLibraryAssetsForAssignmentPicker({
  organizationId,
  viewerId,
  filterType,
  search,
}: ListLibraryAssetsForAssignmentPickerInput): Promise<LibraryAssetPickerRow[]> {
  const results: LibraryAssetPickerRow[] = [];
  const searchLower = search?.trim().toLowerCase() || undefined;

  const wantsVideo = !filterType || filterType === 'video';
  const wantsResource = !filterType || filterType === 'resource';

  // ---- Video branch ----
  // Same scoping rule as listAssetsByOrganization.ts (org + Library-visible),
  // filtered down to asset_type = 'video'.
  if (wantsVideo) {
    const { data: videoAssetRows, error: videoErr } = await supabase
      .from('assets')
      .select('id, videos!inner(video_title, thumbnail_url, platform)')
      .eq('organization_id', organizationId)
      .eq('asset_type', 'video')
      .not('added_to_library_at', 'is', null);

    if (videoErr) {
      throw new Error(`Failed to load video assets for picker: ${videoErr.message}`);
    }

    for (const row of (videoAssetRows ?? []) as any[]) {
      // PostgREST embed shape caveat (same root cause documented in
      // listAssetsByOrganization.ts): no UNIQUE constraint on
      // videos.asset_id means this may come back as an array.
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

  // ---- Resource branch (Import Asset pipeline) ----
  // Same scoping rule as the video branch above (org + Library-visible).
  // asset_resources.asset_id has a UNIQUE constraint (see
  // listAssetsByOrganization.ts's own note on this), so the embed is
  // object-shaped — but we defensively handle the array case too, same
  // as the video branch does, in case that ever changes.
  if (wantsResource) {
    const { data: resourceAssetRows, error: resourceErr } = await supabase
      .from('assets')
      .select('id, asset_resources!inner(title, thumbnail_url, platform, resource_type)')
      .eq('organization_id', organizationId)
      .eq('asset_type', 'resource')
      .not('added_to_library_at', 'is', null);

    if (resourceErr) {
      throw new Error(`Failed to load resource assets for picker: ${resourceErr.message}`);
    }

    for (const row of (resourceAssetRows ?? []) as any[]) {
      const resource = Array.isArray(row.asset_resources) ? row.asset_resources[0] : row.asset_resources;
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

  if (results.length === 0) return results;

  const archiveContextMap = await getAssetArchiveContextsForViewer(
    results.map(r => ({ id: r.asset_id, assetType: r.asset_type })),
    viewerId
  );

  return results.filter(r => !archiveContextMap.get(r.asset_id)?.isArchived);
}
