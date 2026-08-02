import { createPageCache } from './pageCache';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';
import type { SharedAssetLibraryRow } from '../services/asset/listSharedAssetsForCollaborator';
import type { AssignedAssetSummary } from '../services/asset/getAssignedAssetSummaryForOwner';

export type AssetsPageCacheData = {
  rows: AssetLibraryRow[];
  sharedRows: SharedAssetLibraryRow[];
  assignedSummary: AssignedAssetSummary[];
  archivedMap: Map<string, string>;
};

// Keyed by `${organizationId}:${userId}` — rows is org-scoped, but
// sharedRows/assignedSummary/archivedMap are all user-scoped, so the key
// must capture both to avoid serving one user's data to another in the
// same org.
export const assetsPageCache = createPageCache<AssetsPageCacheData>();

/**
 * Mirrors an archivedMap update (archive or restore) into the existing
 * cache entry, using the exact same updater-function shape as
 * setArchivedMap(prev => ...). No-ops if there's no cached entry yet for
 * this key (nothing to keep in sync with).
 */
export function updateCachedArchivedMap(
  key: string,
  updater: (prev: Map<string, string>) => Map<string, string>
): void {
  const cached = assetsPageCache.get(key);
  if (!cached) return;
  assetsPageCache.set(key, {
    ...cached.data,
    archivedMap: updater(cached.data.archivedMap),
  });
}
