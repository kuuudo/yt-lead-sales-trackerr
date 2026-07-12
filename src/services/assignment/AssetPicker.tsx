/**
 * src/components/assignment/AssetPicker.tsx
 *
 * Asset Library picker for the Create Assignment flow.
 *
 * Responsibilities ONLY:
 *   1. Fetch Library assets via listLibraryAssetsForAssignmentPicker
 *   2. Display a selectable, filterable grid
 *   3. Track selection state
 *   4. Report selectedAssetIds up to the parent via onSelectionChange
 *
 * Explicitly NOT responsible for:
 *   - Calling createAssignment.ts or any assignment write
 *   - Deciding what happens with the selected IDs afterward
 *   - Any assignment-specific validation (title, description, etc.)
 *
 * Data source: listLibraryAssetsForAssignmentPicker.ts. Scope is video +
 * resource only — Campaign Elements are handled by their own Authorized
 * Assets section elsewhere in CreateAssignment.tsx, not duplicated here.
 *
 * UPDATE (Picker UI pass): switched from a bare <ul>/checkbox list with
 * plain CSS classes to a Tailwind card grid, matching the visual language
 * the rest of the app already uses (Assets.tsx included). Cards are fully
 * clickable (not just a small checkbox target) — selection state shown via
 * border highlight + a check badge, not a native checkbox input. This is a
 * deliberate one-off card layout for this component, not a shared
 * component with Assets.tsx — the interaction models differ (select vs.
 * navigate), so nothing is being abstracted here until there's a real,
 * observed need to.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import {
  listLibraryAssetsForAssignmentPicker,
  type AssetPickerFilterType,
  type LibraryAssetPickerRow,
} from '../../services/assignment/listLibraryAssetsForAssignmentPicker';

export interface AssetPickerProps {
  organizationId: string;
  /** Called every time the selection changes, with the full current set of selected asset IDs. */
  onSelectionChange: (selectedAssetIds: string[]) => void;
  /** Optional: pre-select assets (e.g. when re-opening a draft). */
  initialSelectedAssetIds?: string[];
}

type FilterOption = { label: string; value: AssetPickerFilterType | 'all' };

const FILTERS: FilterOption[] = [
  { label: 'All', value: 'all' },
  { label: 'Video', value: 'video' },
  { label: 'Resource', value: 'resource' },
];

export function AssetPicker({
  organizationId,
  onSelectionChange,
  initialSelectedAssetIds = [],
}: AssetPickerProps) {
  const [assets, setAssets] = useState<LibraryAssetPickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<AssetPickerFilterType | 'all'>('all');
  const [search, setSearch] = useState('');

  // Selected assets are stored as a Map keyed by asset_id, holding the full
  // row (not just the id). This is intentionally independent of `assets`
  // (the currently loaded/filtered list) — selection must survive switching
  // filters, even though the previously-selected asset is no longer in the
  // current result set. Deriving "selected assets" by filtering `assets`
  // (the earlier version of this component did that) breaks as soon as the
  // filter changes and the selected item scrolls out of the loaded set.
  //
  // Known limitation (not fixed here, doesn't affect Create Assignment):
  // initialSelectedAssetIds only carries ids, not full rows, so on first
  // mount these ids are tracked but won't render display info in the
  // "Selected Assets" list until/unless a matching row happens to load.
  const [selectedAssetsMap, setSelectedAssetsMap] = useState<Map<string, LibraryAssetPickerRow>>(
    () => new Map(initialSelectedAssetIds.map(id => [id, { asset_id: id } as LibraryAssetPickerRow]))
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listLibraryAssetsForAssignmentPicker({
      organizationId,
      filterType: activeFilter === 'all' ? undefined : activeFilter,
      search: search.trim() || undefined,
    })
      .then(rows => {
        if (!cancelled) setAssets(rows);
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load assets');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, activeFilter, search]);

  function toggleAsset(asset: LibraryAssetPickerRow) {
    setSelectedAssetsMap(prev => {
      const next = new Map(prev);
      if (next.has(asset.asset_id)) {
        next.delete(asset.asset_id);
      } else {
        next.set(asset.asset_id, asset);
      }
      onSelectionChange(Array.from(next.keys()));
      return next;
    });
  }

  const selectedAssets = Array.from(selectedAssetsMap.values());

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search assets"
            aria-label="Search assets"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-600"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by type">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              aria-pressed={activeFilter === f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === f.value
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-950 text-zinc-500 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading assets…
        </div>
      )}
      {error && (
        <p className="text-red-500 text-sm" role="alert">
          Couldn't load assets: {error}
        </p>
      )}
      {!loading && !error && assets.length === 0 && (
        <p className="text-zinc-500 text-sm">No Library assets match this filter.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {assets.map(asset => {
          const isSelected = selectedAssetsMap.has(asset.asset_id);
          return (
            <button
              key={asset.asset_id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggleAsset(asset)}
              className={`relative flex flex-col text-left bg-zinc-950 border rounded-xl overflow-hidden transition-all ${
                isSelected
                  ? 'border-red-600 ring-1 ring-red-600'
                  : 'border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <div className="w-full aspect-video bg-zinc-900 overflow-hidden">
                {asset.thumbnail && (
                  <img src={asset.thumbnail} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="px-3 py-2">
                <p className="text-xs font-bold text-white truncate">{asset.display_name}</p>
                <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest mt-0.5">
                  {asset.asset_type === 'video' ? 'Video' : 'Resource'}
                </p>
              </div>

              {isSelected && (
                <span className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white">
                  <Check size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedAssets.length > 0 && (
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          {selectedAssets.length} asset{selectedAssets.length === 1 ? '' : 's'} selected
        </p>
      )}
    </div>
  );
}
