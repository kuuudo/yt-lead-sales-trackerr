// ─────────────────────────────────────────────────────────────────────────────
// assetAnalyticsFilters.ts
//
// Pure client-side filter / option helpers for All Assets Analytics.
// Extracted from AllAssetsAnalytics.tsx — behavior frozen.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AssetAnalyticsRow,
  AssetTypeTag,
  AssetCampaignSelection,
  AssetCampaignFilterOptions,
} from './assetAnalyticsTypes';

/** My / Shared / Assigned — empty scope ('all') or missing org = no filter. */
export function filterByAssetSource(
  rows: AssetAnalyticsRow[],
  selectedAssetSource: 'all' | 'my' | 'shared' | 'assigned',
  organizationId: string | null,
): AssetAnalyticsRow[] {
  if (selectedAssetSource === 'all' || !organizationId) return rows;
  return rows.filter(row => {
    const isMy = row.assetOrganizationId === organizationId;
    if (selectedAssetSource === 'my') return isMy;
    if (selectedAssetSource === 'shared') return !isMy;
    if (selectedAssetSource === 'assigned') return isMy && row.isAssigned;
    return true;
  });
}

/** Empty selectedAssetTypes = no type filter. */
export function filterByAssetType(
  rows: AssetAnalyticsRow[],
  selectedAssetTypes: AssetTypeTag[],
): AssetAnalyticsRow[] {
  if (selectedAssetTypes.length === 0) return rows;
  return rows.filter(row => selectedAssetTypes.includes(row.asset.asset_type));
}

/** Empty selectedPlatforms = no platform filter. Missing platform treated as 'youtube'. */
export function filterByPlatform(
  rows: AssetAnalyticsRow[],
  selectedPlatforms: string[],
): AssetAnalyticsRow[] {
  if (selectedPlatforms.length === 0) return rows;
  return rows.filter(row =>
    selectedPlatforms.includes(row.promoting_video.platform ?? 'youtube'),
  );
}

/** selectedCampaignId === 'all' = no campaign filter (legacy Campaign dropdown). */
export function filterByCampaignId(
  rows: AssetAnalyticsRow[],
  selectedCampaignId: string,
): AssetAnalyticsRow[] {
  if (selectedCampaignId === 'all') return rows;
  return rows.filter(row => row.campaign_id === selectedCampaignId);
}

/** selectedContentOwnerId === 'all' = no content-owner filter. */
export function filterByContentOwnerId(
  rows: AssetAnalyticsRow[],
  selectedContentOwnerId: string,
): AssetAnalyticsRow[] {
  if (selectedContentOwnerId === 'all') return rows;
  return rows.filter(
    row => row.promoting_video.content_owner_id === selectedContentOwnerId,
  );
}

/** Distinct platforms present on rows (missing → 'youtube'), sorted. */
export function collectPresentPlatforms(rows: AssetAnalyticsRow[]): string[] {
  const seen = new Set<string>();
  rows.forEach(row => seen.add(row.promoting_video.platform ?? 'youtube'));
  return Array.from(seen).sort();
}

/** Empty selectedPromotionIds = no promotion-id filter. Phase 5. */
export function filterByPromotionIds(
  rows: AssetAnalyticsRow[],
  selectedPromotionIds: string[],
): AssetAnalyticsRow[] {
  if (selectedPromotionIds.length === 0) return rows;
  return rows.filter(
    row => row.promotion_id != null && selectedPromotionIds.includes(row.promotion_id),
  );
}

/**
 * Creative scope filter — preserves user?.id (not effectiveViewerId).
 * null creativeScopeFilter = no creative filter. Phase 5.
 */
export function filterByCreativeScope(
  rows: AssetAnalyticsRow[],
  creativeScopeFilter: null | 'toMe' | 'byMe',
  viewerUserId: string | null | undefined,
): AssetAnalyticsRow[] {
  if (creativeScopeFilter === 'toMe') {
    return rows.filter(
      row =>
        !!(row.promoting_video as any).created_via_creative &&
        (row.promoting_video as any).content_owner_id === viewerUserId,
    );
  }
  if (creativeScopeFilter === 'byMe') {
    return rows.filter(
      row =>
        !!(row.promoting_video as any).created_via_creative &&
        (row.promoting_video as any).content_owner_id &&
        (row.promoting_video as any).content_owner_id !== viewerUserId,
    );
  }
  return rows;
}

/**
 * Content Owner dropdown options from rows. Phase 6.
 * First-seen name wins; missing → 'Unknown'; sorted by name.
 */
export function collectContentOwners(
  rows: AssetAnalyticsRow[],
): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  rows.forEach(row => {
    const id = row.promoting_video.content_owner_id;
    if (!id) return;
    if (!byId.has(id)) {
      byId.set(id, row.promoting_video.content_owner_name || 'Unknown');
    }
  });
  return Array.from(byId.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Asset Campaign multi-select filter.
 * Copied verbatim from AllAssetsAnalytics assetCampaignFilteredRows (Phase 7).
 * Empty selection = no filter. Does not special-case system / ONLY PROMOTE ASSET.
 */
export function filterByAssetCampaignSelection(
  rows: AssetAnalyticsRow[],
  selected: AssetCampaignSelection[],
  options: AssetCampaignFilterOptions,
): AssetAnalyticsRow[] {
  if (selected.length === 0) return rows;

  const wantAll = selected.some(s => s.type === 'all');
  const wantCampaignFree = wantAll || selected.some(s => s.type === 'campaignFree');
  const wantedCampaignIds = new Set<string>();
  selected.forEach(s => {
    if (s.type === 'campaign') wantedCampaignIds.add(s.id);
    if (s.type === 'owner') {
      options.otherOwners
        .find(o => o.ownerId === s.ownerId)
        ?.campaignIds.forEach(id => wantedCampaignIds.add(id));
    }
  });

  return rows.filter(row => {
    if (wantAll) return row.campaign_id != null || row.isCampaignFreeResource;
    if (wantCampaignFree && row.isCampaignFreeResource) return true;
    return !!row.campaign_id && wantedCampaignIds.has(row.campaign_id);
  });
}
