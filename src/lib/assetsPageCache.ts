import { createPageCache } from './pageCache';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';
import type { SharedAssetLibraryRow } from '../services/asset/listSharedAssetsForCollaborator';
import type { AssignedAssetSummary } from '../services/asset/getAssignedAssetSummaryForOwner';
import type { AssetArchiveContext } from '../services/asset/getAssetArchiveContext';

// UPDATE (Archive Resolver pass, Phase 1 — ARCHIVE_SYSTEM_DESIGN.md):
// `archivedMap: Map<string, string>` (asset_user_states only) replaced
// with `archiveContextMap: Map<string, AssetArchiveContext>` — the full
// resolver output (personal + Video + Campaign reasons, plus Level 1/
// Level 2). This cache entry is now the single cached snapshot of
// whatever getAssetArchiveContextsForViewer last resolved, not just the
// personal-archive slice of it.
export type AssetsPageCacheData = {
  rows: AssetLibraryRow[];
  sharedRows: SharedAssetLibraryRow[];
  assignedSummary: AssignedAssetSummary[];
  archiveContextMap: Map<string, AssetArchiveContext>;
};

// Keyed by `${organizationId}:${userId}` — rows is org-scoped, but
// sharedRows/assignedSummary/archiveContextMap are all user-scoped, so
// the key must capture both to avoid serving one user's data to another
// in the same org.
export const assetsPageCache = createPageCache<AssetsPageCacheData>();

/**
 * Mirrors an archiveContextMap update (archive / restore / hide / unhide)
 * into the existing cache entry, using the exact same updater-function
 * shape as setArchiveContextMap(prev => ...) in Assets.tsx. No-ops if
 * there's no cached entry yet for this key (nothing to keep in sync
 * with) — same behavior as the old updateCachedArchivedMap this replaces.
 */
export function updateCachedArchiveContextMap(
  key: string,
  updater: (prev: Map<string, AssetArchiveContext>) => Map<string, AssetArchiveContext>
): void {
  const cached = assetsPageCache.get(key);
  if (!cached) return;
  assetsPageCache.set(key, {
    ...cached.data,
    archiveContextMap: updater(cached.data.archiveContextMap),
  });
}
