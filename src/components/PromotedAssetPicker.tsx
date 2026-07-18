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
 * Organization Library scope; Campaign is Video -> Tracking scope.
 *
 * Single-select, not multi-select (only one Promoted Asset per piece of
 * content) — this is why it's a separate component from AssetPicker.tsx
 * rather than a shared one. That interaction model is UNCHANGED by this
 * pass.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UPDATE (Asset Visibility architecture pass): this picker previously
 * called listLibraryAssetsForAssignmentPicker() directly — a single,
 * My-Assets-only, org-scoped query. That made it the only surface in the
 * product that didn't follow the Asset Library visibility model, so a
 * Collaborator opening "Track New Content" could never select an asset
 * that had been shared with them.
 *
 * This pass makes PromotedAssetPicker mirror Assets.tsx's canonical
 * composition EXACTLY (see Assets.tsx / listSharedAssetsForCollaborator.ts /
 * getAssignedAssetSummaryForOwner.ts):
 *
 *   - My Assets:        listAssetsByOrganization({ organizationId })
 *   - Shared Assets:     listSharedAssetsForCollaborator({ userId, excludeOrganizationId })
 *   - Assigned Summary:  getAssignedAssetSummaryForOwner(userId)  — an
 *       ANNOTATION on My Assets, never a third asset source, never
 *       applicable to Shared rows. Same architecture lock as Assets.tsx.
 *
 * All three are fetched independently via Promise.all — not merged into
 * one query, not deduped in the UI. Same UnifiedAssetRow normalization
 * shape as Assets.tsx, copied as-is.
 *
 * SCOPE NOTE (deliberate, not inherited automatically from Assets.tsx):
 * this picker has only ever offered video/resource assets — Campaign
 * Elements have their own Authorized Assets flow elsewhere and were
 * explicitly excluded from listLibraryAssetsForAssignmentPicker.ts.
 * listAssetsByOrganization() returns all three asset_types, so "My"
 * results are filtered down to asset_type !== 'campaign_element'
 * immediately after fetching. This preserves this picker's existing
 * scope; it is not a byproduct of reusing the canonical query, it's a
 * conscious choice to keep it. Shared Assets are unaffected — the
 * underlying video/resource query in listSharedAssetsForCollaborator.ts
 * already only supports those two kinds.
 *
 * SEARCH/FILTER NOTE: listAssetsByOrganization has no server-side search
 * or asset-type filter param (unlike the old
 * listLibraryAssetsForAssignmentPicker call). Following Assets.tsx,
 * search and the Video/Resource filter are now applied client-side over
 * the unified, already-fetched rows, not sent as query params. Fetching
 * is now keyed on [organizationId, user] only — typing in the search box
 * or switching filters no longer triggers a refetch, only a re-filter.
 *
 * NOT changed: single-select interaction, card grid markup, onSelect's
 * contract (still receives a LibraryAssetPickerRow-shaped object — built
 * via a small adapter from UnifiedAssetRow at confirm time, since the
 * unified row is a superset of that shape).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  type AssetPickerFilterType,
  type LibraryAssetPickerRow,
} from '../services/assignment/listLibraryAssetsForAssignmentPicker';
import { listAssetsByOrganization } from '../services/asset/listAssetsByOrganization';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';
import { listSharedAssetsForCollaborator } from '../services/asset/listSharedAssetsForCollaborator';
import type { SharedAssetLibraryRow } from '../services/asset/listSharedAssetsForCollaborator';
import { getAssignedAssetSummaryForOwner } from '../services/asset/getAssignedAssetSummaryForOwner';
import type { AssignedAssetSummary } from '../services/asset/getAssignedAssetSummaryForOwner';
import { resolveAssetThumbnail, type ResourceType } from '../lib/videoFormatters';

export interface PromotedAssetPickerProps {
  organizationId: string;
  /** Pre-select if the user is changing an existing choice. */
  initialSelectedAssetId?: string | null;
  onClose: () => void;
  onSelect: (asset: LibraryAssetPickerRow) => void;
}

type FilterOption = { label: string; value: AssetPickerFilterType | 'all' };
type OwnershipFilter = 'all' | 'mine' | 'shared' | 'assigned';

const FILTERS: FilterOption[] = [
  { label: 'All', value: 'all' },
  { label: 'Video', value: 'video' },
  { label: 'Resource', value: 'resource' },
];

// Same normalization shape as Assets.tsx's UnifiedAssetRow, trimmed to
// the fields this picker actually renders/needs (no campaign_element /
// elementType — see SCOPE NOTE above).
interface UnifiedAssetRow {
  key: string;
  assetId: string;
  title: string;
  thumbnail: string | null;
  resourceType: ResourceType | null;
  assetType: 'video' | 'resource';
  isShared: boolean;
  isAssigned: boolean;
  assignedCollaboratorCount: number | null;
}

function fromMyRow(row: AssetLibraryRow, assignedMap: Map<string, number>): UnifiedAssetRow {
  return {
    key: row.id,
    assetId: row.id,
    title: row.video_title || 'Untitled',
    thumbnail: row.resource_type
      ? resolveAssetThumbnail({
          thumbnail_url: row.thumbnail_url,
          resource_type: row.resource_type,
          platform: row.platform,
        })
      : row.thumbnail_url,
    resourceType: (row.resource_type as ResourceType) ?? null,
    // asset_type is narrowed to 'video' | 'resource' by the filter applied
    // before fromMyRow is called (campaign_element rows are dropped first).
    assetType: row.asset_type as 'video' | 'resource',
    isShared: false,
    isAssigned: assignedMap.has(row.id),
    assignedCollaboratorCount: assignedMap.get(row.id) ?? null,
  };
}

function fromSharedRow(row: SharedAssetLibraryRow): UnifiedAssetRow {
  return {
    key: row.asset_id,
    assetId: row.asset_id,
    title: row.display_name,
    thumbnail: row.thumbnail,
    resourceType: row.resource_type,
    assetType: row.asset_type,
    isShared: true,
    isAssigned: false,
    assignedCollaboratorCount: null,
  };
}

function toLibraryAssetPickerRow(row: UnifiedAssetRow): LibraryAssetPickerRow {
  return {
    asset_id: row.assetId,
    display_name: row.title,
    asset_type: row.assetType,
    resource_type: row.resourceType,
    thumbnail: row.thumbnail,
  };
}

export function PromotedAssetPicker({
  organizationId,
  initialSelectedAssetId = null,
  onClose,
  onSelect,
}: PromotedAssetPickerProps) {
  const { user } = useAuth();

  const [rows, setRows] = useState<AssetLibraryRow[]>([]);
  const [sharedRows, setSharedRows] = useState<SharedAssetLibraryRow[]>([]);
  const [assignedSummary, setAssignedSummary] = useState<AssignedAssetSummary[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [activeFilter, setActiveFilter] = useState<AssetPickerFilterType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(initialSelectedAssetId);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      listAssetsByOrganization({ organizationId }),
      user
        ? listSharedAssetsForCollaborator({
            userId: user.id,
            excludeOrganizationId: organizationId,
          })
        : Promise.resolve([]),
      user ? getAssignedAssetSummaryForOwner(user.id) : Promise.resolve([]),
    ])
      .then(([myData, sharedData, assignedData]) => {
        if (cancelled) return;
        // Scope lock: this picker only ever offers video/resource assets,
        // same as before this pass. Campaign Elements have their own
        // Authorized Assets flow and are not selectable here.
        setRows(myData.filter(r => r.asset_type === 'video' || r.asset_type === 'resource'));
        setSharedRows(sharedData);
        setAssignedSummary(assignedData);
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
  }, [organizationId, user]);

  // Same merge shape as Assets.tsx: Assigned is a filter over My rows,
  // never a concatenated third list.
  const unifiedRows = useMemo<UnifiedAssetRow[]>(() => {
    const assignedMap = new Map(assignedSummary.map(s => [s.assetId, s.collaboratorCount]));
    const mine = rows.map(row => fromMyRow(row, assignedMap));
    const shared = sharedRows.map(fromSharedRow);

    if (ownershipFilter === 'mine') return mine;
    if (ownershipFilter === 'shared') return shared;
    if (ownershipFilter === 'assigned') return mine.filter(r => r.isAssigned);
    return [...mine, ...shared];
  }, [rows, sharedRows, assignedSummary, ownershipFilter]);

  // Resource-type filter + search, both applied client-side now that
  // fetching is no longer parameterized by them (see SEARCH/FILTER NOTE).
  const filteredRows = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return unifiedRows.filter(row => {
      if (activeFilter !== 'all' && row.assetType !== activeFilter) return false;
      if (searchLower && !row.title.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [unifiedRows, activeFilter, search]);

  const selectedRow = filteredRows.find(r => r.assetId === selectedAssetId)
    ?? unifiedRows.find(r => r.assetId === selectedAssetId)
    ?? null;

  const handleConfirm = () => {
    if (selectedRow) {
      onSelect(toLibraryAssetPickerRow(selectedRow));
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
          <div className="relative max-w-xs">
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

          {/* Ownership filter — same pattern/labels as Assets.tsx */}
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by ownership">
            {(['all', 'mine', 'shared', 'assigned'] as OwnershipFilter[]).map(f => (
              <button
                key={f}
                type="button"
                aria-pressed={ownershipFilter === f}
                onClick={() => setOwnershipFilter(f)}
                className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                  ownershipFilter === f
                    ? 'bg-red-600 text-white'
                    : 'bg-zinc-950 text-zinc-500 hover:text-white'
                }`}
              >
                {f === 'all' ? 'All' : f === 'mine' ? 'My' : f === 'shared' ? 'Shared' : 'Assigned'}
              </button>
            ))}
          </div>

          {/* Resource-type filter — unchanged from before this pass */}
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
          {!loading && !error && filteredRows.length === 0 && (
            <p className="text-zinc-500 text-sm">No Library assets match this filter.</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredRows.map(row => {
              const isSelected = row.assetId === selectedAssetId;
              return (
                <button
                  key={row.key}
                  type="button"
                  aria-pressed={isSelected}
                  // Single-select: clicking a new card replaces the
                  // previous selection, it doesn't add to it. Unchanged.
                  onClick={() => setSelectedAssetId(isSelected ? null : row.assetId)}
                  className={`relative flex flex-col text-left bg-zinc-950 border rounded-xl overflow-hidden transition-all ${
                    isSelected
                      ? 'border-red-600 ring-1 ring-red-600'
                      : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="w-full aspect-video bg-zinc-900 overflow-hidden">
                    {row.thumbnail && (
                      <img src={row.thumbnail} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-xs font-bold text-white truncate">{row.title}</p>
                    <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest mt-0.5">
                      {row.assetType === 'video' ? 'Video' : 'Resource'}
                    </p>
                    {row.isShared && (
                      <p className="text-[9px] font-black uppercase text-red-500 tracking-widest mt-0.5">
                        Shared
                      </p>
                    )}
                    {row.isAssigned && (
                      <p className="text-[9px] font-black uppercase text-blue-400 tracking-widest mt-0.5">
                        Assigned · {row.assignedCollaboratorCount}{' '}
                        {row.assignedCollaboratorCount === 1 ? 'User' : 'Users'}
                      </p>
                    )}
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
            disabled={!selectedRow}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
