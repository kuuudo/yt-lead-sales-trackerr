/**
 * src/components/PromotedAssetPicker.tsx
 *
 * "Select Asset to Promote" modal for the Import Content flow (Videos.tsx).
 *
 * Scope (per locked decision): this is UI only. Selecting an asset here
 * does NOT persist anything — no relationship is written, no Redirect
 * Link is created, no Promotion is created. The selected asset lives in
 * Videos.tsx's local React state only, exactly like the rest of the
 * "Track New Content" form before Generate Tracking Link is pressed.
 * Wiring the selection into a real video -> asset relationship is a
 * separate, later piece of work.
 *
 * Option B (locked decision): NOT filtered by Campaign. Asset is
 * Organization Library scope; Campaign is Video -> Tracking scope. The two
 * are unrelated dimensions, so this picker reuses
 * listLibraryAssetsForAssignmentPicker verbatim — no new query, no
 * Campaign parameter threaded through.
 *
 * Single-select, not multi-select (only one Promoted Asset per piece of
 * content) — this is why it's a separate component from AssetPicker.tsx
 * rather than a shared one. Visual language (search, filter chips, card
 * grid) intentionally mirrors AssetPicker.tsx; the interaction model
 * (pick one + confirm, vs. toggle many) is different enough that forcing
 * both through one component would need branching for select-one vs.
 * select-many, which is exactly the premature-abstraction trap this
 * project has been avoiding elsewhere.
 */

import { useEffect, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import {
  listLibraryAssetsForAssignmentPicker,
  type AssetPickerFilterType,
  type LibraryAssetPickerRow,
} from '../services/assignment/listLibraryAssetsForAssignmentPicker';

export interface PromotedAssetPickerProps {
  organizationId: string;
  /** Pre-select if the user is changing an existing choice. */
  initialSelectedAssetId?: string | null;
  onClose: () => void;
  onSelect: (asset: LibraryAssetPickerRow) => void;
}

type FilterOption = { label: string; value: AssetPickerFilterType | 'all' };

const FILTERS: FilterOption[] = [
  { label: 'All', value: 'all' },
  { label: 'Video', value: 'video' },
  { label: 'Resource', value: 'resource' },
];

export function PromotedAssetPicker({
  organizationId,
  initialSelectedAssetId = null,
  onClose,
  onSelect,
}: PromotedAssetPickerProps) {
  const [assets, setAssets] = useState<LibraryAssetPickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<AssetPickerFilterType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(initialSelectedAssetId);

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

  const selectedAsset = assets.find(a => a.asset_id === selectedAssetId) ?? null;

  const handleConfirm = () => {
    if (selectedAsset) {
      onSelect(selectedAsset);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-200">Select Asset to Promote</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
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
              const isSelected = asset.asset_id === selectedAssetId;
              return (
                <button
                  key={asset.asset_id}
                  type="button"
                  aria-pressed={isSelected}
                  // Single-select: clicking a new card replaces the
                  // previous selection, it doesn't add to it.
                  onClick={() => setSelectedAssetId(isSelected ? null : asset.asset_id)}
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
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedAsset}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
