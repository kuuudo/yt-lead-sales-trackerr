/**
 * src/components/assignment/AssetPicker.tsx
 *
 * Asset Library picker for the Create Assignment flow.
 *
 * Responsibilities ONLY:
 *   1. Fetch Library assets via listLibraryAssetsForAssignmentPicker
 *   2. Display a selectable, filterable list
 *   3. Track selection state
 *   4. Report selectedAssetIds up to the parent via onSelectionChange
 *
 * Explicitly NOT responsible for:
 *   - Calling createAssignment.ts or any assignment write
 *   - Deciding what happens with the selected IDs afterward
 *   - Any assignment-specific validation (title, description, etc.)
 *
 * Data source: listLibraryAssetsForAssignmentPicker.ts, used unmodified.
 * Styling kept minimal/functional on purpose — not a design pass, just
 * enough structure to be usable and testable.
 */

import { useEffect, useState } from 'react';
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
  { label: 'Landing Page', value: 'landing_page' },
  { label: 'Newsletter', value: 'newsletter' },
  { label: 'Sales Call', value: 'sales_call' },
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
    <div className="asset-picker">
      <div className="asset-picker__controls">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search assets"
          aria-label="Search assets"
        />

        <div className="asset-picker__filters" role="group" aria-label="Filter by type">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              aria-pressed={activeFilter === f.value}
              onClick={() => setActiveFilter(f.value)}
              className={activeFilter === f.value ? 'is-active' : ''}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="asset-picker__status">Loading assets…</p>}
      {error && (
        <p className="asset-picker__status" role="alert">
          Couldn't load assets: {error}
        </p>
      )}
      {!loading && !error && assets.length === 0 && (
        <p className="asset-picker__status">No Library assets match this filter.</p>
      )}

      <ul className="asset-picker__list">
        {assets.map(asset => {
          const isSelected = selectedAssetsMap.has(asset.asset_id);
          return (
            <li key={asset.asset_id} className="asset-picker__item">
              <label>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleAsset(asset)}
                />
                {asset.thumbnail && (
                  <img src={asset.thumbnail} alt="" width={40} height={40} />
                )}
                <span>{asset.display_name}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {selectedAssets.length > 0 && (
        <div className="asset-picker__selected">
          <h4>Selected Assets:</h4>
          <ul>
            {selectedAssets.map(a => (
              <li key={a.asset_id}>{a.display_name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
