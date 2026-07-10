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
 * "Type" filters as presented in the UI map onto the underlying schema as:
 *   - video          -> assets.asset_type = 'video'
 *   - landing_page   -> assets.asset_type = 'campaign_element', campaign_element_assets.element_type = 'landing_page'
 *   - newsletter     -> assets.asset_type = 'campaign_element', campaign_element_assets.element_type = 'newsletter'
 *   - sales_call     -> assets.asset_type = 'campaign_element', campaign_element_assets.element_type = 'sales_call'
 *
 * RLS note (flagged, not fixed here):
 *   campaign_element_assets' RLS policy scopes visibility via
 *   campaign_id -> campaigns.organization_id, NOT via assets.organization_id
 *   directly. This function's join path (assets.id -> campaign_element_assets.asset_id)
 *   is therefore a *different* column than the one RLS checks. Rows will only
 *   return correctly if the invariant "asset's org == its campaign_element_assets
 *   row's campaign's org" always holds. That invariant has not yet been
 *   verified with a direct query — see pending verification query discussed
 *   separately. If it doesn't hold for some rows, those rows will silently
 *   disappear from picker results (not an error, just missing rows) — worth
 *   checking when testing this against real data.
 *
 * Does NOT touch: RLS policies, schema, createAssignment.ts, or existing
 * shared types. Read-only. Additive only.
 */

import { supabase } from '../../lib/supabase';
import {
  resolveElementThumbnail,
  resolveAssetThumbnail,
  type CampaignElementType,
  type ResourceType,
} from '../../lib/videoFormatters';

export type AssetPickerFilterType = 'video' | 'landing_page' | 'newsletter' | 'sales_call' | 'resource';

export interface LibraryAssetPickerRow {
  asset_id: string;
  display_name: string;
  asset_type: 'video' | 'campaign_element' | 'resource';
  element_type: CampaignElementType | null;
  // New — only populated for asset_type: 'resource' rows. Scope-locked to
  // this addition only; no unified type introduced (per current Domain
  // decision — CampaignElementType and ResourceType stay separate).
  resource_type: ResourceType | null;
  thumbnail: string | null;
}

export interface ListLibraryAssetsForAssignmentPickerInput {
  organizationId: string;
  filterType?: AssetPickerFilterType;
  search?: string;
}

const ELEMENT_TYPE_BY_FILTER: Record<Exclude<AssetPickerFilterType, 'video' | 'resource'>, CampaignElementType> = {
  landing_page: 'landing_page',
  newsletter: 'newsletter',
  sales_call: 'sales_call',
};

export async function listLibraryAssetsForAssignmentPicker({
  organizationId,
  filterType,
  search,
}: ListLibraryAssetsForAssignmentPickerInput): Promise<LibraryAssetPickerRow[]> {
  const results: LibraryAssetPickerRow[] = [];
  const searchLower = search?.trim().toLowerCase() || undefined;

  const wantsVideo = !filterType || filterType === 'video';
  const wantsElement = !filterType || (filterType !== 'video' && filterType !== 'resource');
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
        element_type: null,
        resource_type: null,
        thumbnail: video?.thumbnail_url ?? null,
      });
    }
  }

  // ---- Campaign element branch (Landing Page / Newsletter / Sales Call) ----
  if (wantsElement) {
    const { data: elementAssetRows, error: assetErr } = await supabase
      .from('assets')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('asset_type', 'campaign_element')
      .not('added_to_library_at', 'is', null);

    if (assetErr) {
      throw new Error(`Failed to load campaign_element assets for picker: ${assetErr.message}`);
    }

    const elementAssetIds = (elementAssetRows ?? []).map(r => r.id);

    if (elementAssetIds.length > 0) {
      let elementQuery = supabase
        .from('campaign_element_assets')
        .select('asset_id, display_name, element_type')
        .in('asset_id', elementAssetIds);

      if (filterType && filterType !== 'video' && filterType !== 'resource') {
        elementQuery = elementQuery.eq('element_type', ELEMENT_TYPE_BY_FILTER[filterType]);
      }

      const { data: elementRows, error: elementErr } = await elementQuery;

      if (elementErr) {
        throw new Error(`Failed to load campaign_element_assets for picker: ${elementErr.message}`);
      }

      for (const e of elementRows ?? []) {
        if (searchLower && !e.display_name.toLowerCase().includes(searchLower)) {
          continue;
        }

        results.push({
          asset_id: e.asset_id,
          display_name: e.display_name,
          asset_type: 'campaign_element',
          element_type: e.element_type,
          resource_type: null,
          thumbnail: resolveElementThumbnail(e.element_type),
        });
      }
    }
  }

  // ---- Resource branch (Import Asset pipeline) ----
  // Same scoping rule as the video/element branches above (org + Library-
  // visible). asset_resources.asset_id has a UNIQUE constraint (see
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
        element_type: null,
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
