// ─────────────────────────────────────────────────────────────────────────────
// assetAnalyticsFilters.ts
// Pure client-side filter / option helpers — behavior frozen from AllAssetsAnalytics.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AssetAnalyticsRow,
  AssetTypeTag,
  AssetCampaignSelection,
  AssetCampaignFilterOptions,
} from './assetAnalyticsTypes';

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

export function filterByAssetType(
  rows: AssetAnalyticsRow[],
  selectedAssetTypes: AssetTypeTag[],
): AssetAnalyticsRow[] {
  if (selectedAssetTypes.length === 0) return rows;
  return rows.filter(row => selectedAssetTypes.includes(row.asset.asset_type));
}

export function filterByPlatform(
  rows: AssetAnalyticsRow[],
  selectedPlatforms: string[],
): AssetAnalyticsRow[] {
  if (selectedPlatforms.length === 0) return rows;
  return rows.filter(row =>
    selectedPlatforms.includes(row.promoting_video.platform ?? 'youtube'),
  );
}

export function filterByCampaignId(
  rows: AssetAnalyticsRow[],
  selectedCampaignId: string,
): AssetAnalyticsRow[] {
  if (selectedCampaignId === 'all') return rows;
  return rows.filter(row => row.campaign_id === selectedCampaignId);
}

export function filterByContentOwnerId(
  rows: AssetAnalyticsRow[],
  selectedContentOwnerId: string,
): AssetAnalyticsRow[] {
  if (selectedContentOwnerId === 'all') return rows;
  return rows.filter(
    row => row.promoting_video.content_owner_id === selectedContentOwnerId,
  );
}

export function collectPresentPlatforms(rows: AssetAnalyticsRow[]): string[] {
  const seen = new Set<string>();
  rows.forEach(row => seen.add(row.promoting_video.platform ?? 'youtube'));
  return Array.from(seen).sort();
}

export function filterByPromotionIds(
  rows: AssetAnalyticsRow[],
  selectedPromotionIds: string[],
): AssetAnalyticsRow[] {
  if (selectedPromotionIds.length === 0) return rows;
  return rows.filter(
    row => row.promotion_id != null && selectedPromotionIds.includes(row.promotion_id),
  );
}

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

/**
 * Content Campaign multi-select filter.
 * Copied verbatim from AllAssetsAnalytics contentCampaignFilteredRows (Phase 10).
 * Preserves systemIdsByName OR-expand (no-op when systemCampaigns empty post Phase 9).
 * Empty selection = no filter. wantAll = non-null content_campaign_id only.
 */
export function filterByContentCampaignSelection(
  rows: AssetAnalyticsRow[],
  selected: AssetCampaignSelection[],
  options: AssetCampaignFilterOptions,
): AssetAnalyticsRow[] {
  if (selected.length === 0) return rows;

  const wantAll = selected.some(s => s.type === 'all');
  const wantedCampaignIds = new Set<string>();
  const systemIdsByName = (options as any)._systemIdsByName as Record<string, string[]> | undefined;

  selected.forEach(s => {
    if (s.type === 'campaign') {
      wantedCampaignIds.add(s.id);
      // Own-org system option may represent multiple same-name ids — OR them all.
      const sys = options.systemCampaigns.find(c => c.id === s.id);
      if (sys && systemIdsByName?.[sys.name]) {
        systemIdsByName[sys.name].forEach(id => wantedCampaignIds.add(id));
      }
    }
    if (s.type === 'owner') {
      options.otherOwners
        .find(o => o.ownerId === s.ownerId)
        ?.campaignIds.forEach(id => wantedCampaignIds.add(id));
    }
  });

  return rows.filter(row => {
    const cid = row.promoting_video.content_campaign_id;
    if (wantAll) return cid != null;
    return !!cid && wantedCampaignIds.has(cid);
  });
}

