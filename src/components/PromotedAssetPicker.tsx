/**
 * src/components/PromotedAssetPicker.tsx
 *
 * "Select Asset to Promote" modal for the Import Content flow (Videos.tsx).
 *
 * Scope (per locked decision): this is UI only. Selecting assets here
 * does NOT persist anything — no relationship is written, no Redirect
 * Link is created, no Promotion is created. The selection lives in
 * Videos.tsx's local React state only, exactly like the rest of the
 * "Track New Content" form before Generate Tracking Link is pressed.
 * Wiring the selection into a real video -> asset relationship is a
 * separate, later piece of work.
 *
 * Option B (locked decision): NOT filtered by Campaign. Asset is
 * Organization Library scope; Campaign is Video -> Tracking scope.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UPDATE (Asset Visibility architecture pass): mirrors Assets.tsx's
 * canonical composition — My / Shared / Assigned fetched independently
 * via Promise.all, never merged into one query, never deduped in the UI
 * (see Assets.tsx / listSharedAssetsForCollaborator.ts /
 * getAssignedAssetSummaryForOwner.ts for the architecture lock this
 * follows). Assigned remains an ANNOTATION on My rows, never a third
 * asset source.
 *
 * UPDATE (Full asset-set pass): the earlier video/resource-only
 * restriction on My Assets has been REMOVED per explicit product
 * decision — "Track New Content → Select Asset" is now a true selectable
 * version of the Asset Library, matching Assets.tsx's full asset set
 * (video / resource / campaign_element). "All" now really means all.
 * This was Claude's own filter added in an earlier pass, not a
 * pre-existing restriction or a data bug in listAssetsByOrganization().
 *
 * What downstream code (Videos.tsx, and anything beyond it) does with a
 * selected campaign_element is explicitly NOT solved here — this remains
 * a UI selection screen only. Shared Assets still only support video/
 * resource (see fromSharedRow below) — that asymmetry is inherited from
 * listSharedAssetsForCollaborator.ts, not introduced by this picker.
 *
 * PromotedAssetRow (below) is a NEW, locally-scoped type distinct from
 * LibraryAssetPickerRow — see its own doc comment for why the shared
 * type from listLibraryAssetsForAssignmentPicker.ts was deliberately
 * NOT widened.
 *
 * UPDATE (Category dropdown pass): replaced the old flat All/Video/
 * Resource filter row with a single dropdown using the same category
 * granularity as Assets.tsx (RESOURCE_TYPE_LABELS entries). This
 * duplicates Assets.tsx's category-matching logic on purpose, per
 * explicit product decision — no shared helper extraction in this pass,
 * since only two screens use it today. If a third screen needs this,
 * extract then, not preemptively.
 *
 * Deliberately mirrors Assets.tsx's ACTUAL runtime categorization, not
 * its unused getEffectiveTab() helper: Assets.tsx's live filtering logic
 * buckets a row by `resourceType ?? 'other'`, which means asset_type:
 * 'video' rows (resource_type is always null for those) fall into
 * "Other", not a dedicated "Video" bucket — getEffectiveTab() would
 * special-case video into its own tab, but nothing in Assets.tsx actually
 * calls it. Reproduced here as-is for behavioral consistency with the
 * Asset Library, not fixed — flagged as a known quirk, not an oversight.
 *
 * UPDATE (Multi-select pass): converted from single-select to
 * multi-select. Prior to this pass the component was single-select BY
 * ORIGINAL DESIGN (not a regression introduced by the architecture
 * pass above) — its own former header comment said so explicitly
 * ("only one Promoted Asset per piece of content"). This pass is a
 * deliberate, confirmed product decision to change that, not a bugfix.
 * onSelect's contract changes from a single row to an array — the
 * Videos.tsx call site needs a matching update, not covered by this file.
 *
 * Selection is tracked as a Map<assetId, UnifiedAssetRow> (same pattern
 * AssetPicker.tsx already uses for its own multi-select), so a selection
 * survives switching the ownership/category filter or search — the
 * previously-selected card doesn't need to still be in the currently
 * filtered set to remain selected.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { listAssetsByOrganization } from '../services/asset/listAssetsByOrganization';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';
import { listSharedAssetsForCollaborator } from '../services/asset/listSharedAssetsForCollaborator';
import type { SharedAssetLibraryRow } from '../services/asset/listSharedAssetsForCollaborator';
import { getAssignedAssetSummaryForOwner } from '../services/asset/getAssignedAssetSummaryForOwner';
import type { AssignedAssetSummary } from '../services/asset/getAssignedAssetSummaryForOwner';
import {
  resolveAssetThumbnail,
  resolveElementThumbnail,
  getElementTypeLabel,
  RESOURCE_TYPE_LABELS,
  type ResourceType,
  type CampaignElementType,
} from '../lib/videoFormatters';

// Locally-scoped, NOT the same type as LibraryAssetPickerRow (from
// listLibraryAssetsForAssignmentPicker.ts). That type is shared with
// AssetPicker.tsx / Create Assignment, whose whole job is the anti-
// re-share boundary (My Assets only, ever). Widening it to include
// campaign_element there was never asked for and isn't done here —
// this picker gets its own row type instead, so the widening stays
// scoped to the one flow that actually changed.
export interface PromotedAssetRow {
  asset_id: string;
  display_name: string;
  asset_type: 'video' | 'resource' | 'campaign_element';
  resource_type: ResourceType | null;
  element_type: CampaignElementType | null;
  thumbnail: string | null;
}

export interface PromotedAssetPickerProps {
  organizationId: string;
  /** Pre-select if the user is changing an existing choice. */
  initialSelectedAssetIds?: string[];
  onClose: () => void;
  onSelect: (assets: PromotedAssetRow[]) => void;
}

type OwnershipFilter = 'all' | 'mine' | 'shared' | 'assigned';
// Same category granularity as Assets.tsx's tabs, INCLUDING
// 'campaign_element' now that the video/resource-only restriction is
// removed. 'other' catches anything without a resource_type that isn't
// campaign_element, INCLUDING video rows — see the header note on why
// that's a deliberate mirror of Assets.tsx's actual (not idealized)
// behavior.
type CategoryFilter = 'all' | ResourceType | 'campaign_element' | 'other';

// Duplicated intentionally, not extracted — see header note. Mirrors
// Assets.tsx's actual inline tabCounts logic exactly (campaign_element
// branch first, then resourceType, then 'other'). If this drifts from
// Assets.tsx's own version, that's a signal to extract a shared helper
// then, not a bug in either file individually.
function getEffectiveCategory(row: {
  assetType: UnifiedAssetRow['assetType'];
  resourceType: ResourceType | null;
}): ResourceType | 'campaign_element' | 'other' {
  if (row.assetType === 'campaign_element') return 'campaign_element';
  return row.resourceType ?? 'other';
}

// Same normalization shape as Assets.tsx's UnifiedAssetRow.
interface UnifiedAssetRow {
  key: string;
  assetId: string;
  title: string;
  thumbnail: string | null;
  resourceType: ResourceType | null;
  elementType: CampaignElementType | null;
  assetType: 'video' | 'resource' | 'campaign_element';
  isShared: boolean;
  isAssigned: boolean;
  assignedCollaboratorCount: number | null;
}

function fromMyRow(row: AssetLibraryRow, assignedMap: Map<string, number>): UnifiedAssetRow {
  return {
    key: row.id,
    assetId: row.id,
    title: row.video_title || 'Untitled',
    thumbnail:
      row.asset_type === 'campaign_element'
        ? resolveElementThumbnail((row.element_type ?? 'landing_page') as CampaignElementType)
        : row.resource_type
        ? resolveAssetThumbnail({
            thumbnail_url: row.thumbnail_url,
            resource_type: row.resource_type,
            platform: row.platform,
          })
        : row.thumbnail_url,
    resourceType: (row.resource_type as ResourceType) ?? null,
    elementType: (row.element_type as CampaignElementType) ?? null,
    // No filter applied anymore — My Assets now include campaign_element,
    // matching Assets.tsx's full asset set (see header UPDATE note).
    assetType: row.asset_type,
    isShared: false,
    isAssigned: assignedMap.has(row.id),
    assignedCollaboratorCount: assignedMap.get(row.id) ?? null,
  };
}

// Shared Assets remain video/resource only — listSharedAssetsForCollaborator.ts's
// underlying query doesn't support campaign_element, unchanged by this pass.
// This is an existing asymmetry between My and Shared, not something
// introduced here.
function fromSharedRow(row: SharedAssetLibraryRow): UnifiedAssetRow {
  return {
    key: row.asset_id,
    assetId: row.asset_id,
    title: row.display_name,
    thumbnail: row.thumbnail,
    resourceType: row.resource_type,
    elementType: null,
    assetType: row.asset_type,
    isShared: true,
    isAssigned: false,
    assignedCollaboratorCount: null,
  };
}

function toPromotedAssetRow(row: UnifiedAssetRow): PromotedAssetRow {
  return {
    asset_id: row.assetId,
    display_name: row.title,
    asset_type: row.assetType,
    resource_type: row.resourceType,
    element_type: row.elementType,
    thumbnail: row.thumbnail,
  };
}

export function PromotedAssetPicker({
  organizationId,
  initialSelectedAssetIds = [],
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
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  // Multi-select: Map keyed by assetId, holding the full normalized row —
  // same pattern as AssetPicker.tsx, so selection survives filter/search
  // changes instead of being derived by filtering the currently-loaded set.
  const [selectedMap, setSelectedMap] = useState<Map<string, UnifiedAssetRow>>(
    () =>
      new Map(
        initialSelectedAssetIds.map(id => [
          id,
          { assetId: id, elementType: null } as UnifiedAssetRow,
        ])
      )
  );

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
        // No asset_type filter — My Assets now matches Assets.tsx's full
        // set (video / resource / campaign_element). Removed per explicit
        // product decision: this is purely a selection UI, downstream
        // handling of a selected campaign_element is a separate concern.
        setRows(myData);
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

  // Category counts for the dropdown — mirrors Assets.tsx's tabCounts,
  // computed off the ownership-filtered set.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of unifiedRows) {
      const cat = getEffectiveCategory(row);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [unifiedRows]);

  // Category filter + search, both applied client-side (listAssetsByOrganization
  // has no server-side search/category param, same as Assets.tsx's approach).
  const filteredRows = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return unifiedRows.filter(row => {
      if (categoryFilter !== 'all' && getEffectiveCategory(row) !== categoryFilter) return false;
      if (searchLower && !row.title.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [unifiedRows, categoryFilter, search]);

  function toggleAsset(row: UnifiedAssetRow) {
    setSelectedMap(prev => {
      const next = new Map(prev);
      if (next.has(row.assetId)) {
        next.delete(row.assetId);
      } else {
        next.set(row.assetId, row);
      }
      return next;
    });
  }

  const selectedRows = Array.from(selectedMap.values());

  const handleConfirm = () => {
    if (selectedRows.length > 0) {
      onSelect(selectedRows.map(toPromotedAssetRow));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-200">Select Assets to Promote</h2>
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

            {/* Category dropdown — replaces the old All/Video/Resource
                filter row. Same granularity as Assets.tsx's tabs, minus
                Campaign Assets (see SCOPE NOTE above). */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as CategoryFilter)}
              aria-label="Filter by category"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-300"
            >
              <option value="all">All Types ({unifiedRows.length})</option>
              <option value="campaign_element">
                Campaign Assets ({categoryCounts['campaign_element'] ?? 0})
              </option>
              {(Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]).map(rt => (
                <option key={rt} value={rt}>
                  {RESOURCE_TYPE_LABELS[rt]} ({categoryCounts[rt] ?? 0})
                </option>
              ))}
              <option value="other">Other ({categoryCounts['other'] ?? 0})</option>
            </select>
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
              const isSelected = selectedMap.has(row.assetId);
              return (
                <button
                  key={row.key}
                  type="button"
                  aria-pressed={isSelected}
                  // Multi-select: clicking toggles this card in/out of the
                  // selection, it doesn't replace the previous selection.
                  onClick={() => toggleAsset(row)}
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
                      {row.assetType === 'campaign_element'
                        ? getElementTypeLabel((row.elementType ?? 'landing_page') as CampaignElementType)
                        : row.assetType === 'video'
                        ? 'Video'
                        : 'Resource'}
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

          {selectedRows.length > 0 && (
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              {selectedRows.length} asset{selectedRows.length === 1 ? '' : 's'} selected
            </p>
          )}
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
            disabled={selectedRows.length === 0}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
