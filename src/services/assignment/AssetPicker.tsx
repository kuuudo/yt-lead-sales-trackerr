/**
 * src/components/assignment/AssetPicker.tsx
 *
 * Asset Library picker for the Create Assignment flow.
 *
 * Responsibilities ONLY:
 *   1. Fetch Library assets the current user can GRANT access to
 *   2. Display a selectable, filterable grid
 *   3. Track selection state
 *   4. Report selectedAssetIds up to the parent via onSelectionChange
 *
 * Explicitly NOT responsible for:
 *   - Calling createAssignment.ts or any assignment write
 *   - Deciding what happens with the selected IDs afterward
 *   - Any assignment-specific validation (title, description, etc.)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE LOCK (unchanged by this pass, this is the reason this file
 * exists as a separate component from PromotedAssetPicker): Ownership and
 * access are different concepts. A Collaborator who receives a Shared
 * Asset does not become its owner, and must never be able to create a
 * new Assignment using it — that would be re-sharing, which is explicitly
 * disallowed everywhere in this product. Therefore:
 *
 *   - This component NEVER calls listSharedAssetsForCollaborator().
 *   - Shared Assets never appear here, under any filter, in any form.
 *   - Data sources are ONLY listAssetsByOrganization() (My Assets) and
 *     getAssignedAssetSummaryForOwner() (an annotation on My Assets, see
 *     below) — nothing else.
 *
 * If a future change ever makes this component call the Shared Assets
 * service "just to display something," that change violates the
 * anti-re-share boundary and should not be made without reopening this
 * discussion explicitly.
 *
 * UPDATE (Full asset-set pass): the video/resource-only restriction below
 * has been REMOVED. It was previously justified by a comment claiming
 * Campaign Elements have their own dedicated "Authorized Assets" section
 * elsewhere in CreateAssignment.tsx — that claim was carried forward
 * across several passes without being re-verified against the current
 * component, and turned out to be treated as a locked architectural fact
 * when it was really just an unverified comment. Per explicit product
 * direction: AssetPicker is no longer a "Library Asset picker" with its
 * own narrower scope — it is a selectable version of the full Asset
 * Library, with exactly ONE restriction (Shared Assets, see the
 * ARCHITECTURE LOCK above, which is unrelated and still holds). There is
 * no second, hidden restriction on Campaign Elements. All / My / Assigned
 * now cover every owned asset, campaign_element included, matching
 * Assets.tsx exactly.
 *
 * NOT verified here (no visibility into the current CreateAssignment.tsx):
 * whether a separate Authorized Assets section for Campaign Elements
 * still exists in that form. If it does, the same asset may now be
 * selectable in two places in one flow — that's a CreateAssignment.tsx
 * question, not something this file can check or resolve on its own.
 *
 * NOT changed by this pass: the external contract
 * (onSelectionChange(ids: string[]), initialSelectedAssetIds) and the
 * inline, non-modal interaction model — both are unrelated to the
 * ownership rule and CreateAssignment.tsx does not need to change for
 * this pass.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { listAssetsByOrganization } from '../../services/asset/listAssetsByOrganization';
import type { AssetLibraryRow } from '../../services/asset/listAssetsByOrganization';
import { getAssignedAssetSummaryForOwner } from '../../services/asset/getAssignedAssetSummaryForOwner';
import { getAssetArchiveContextsForViewer } from '../../services/asset/getAssetArchiveContext';
import type { AssignedAssetSummary } from '../../services/asset/getAssignedAssetSummaryForOwner';
import {
  resolveAssetThumbnail,
  resolveElementThumbnail,
  getElementTypeLabel,
  RESOURCE_TYPE_LABELS,
  type ResourceType,
  type CampaignElementType,
} from '../../lib/videoFormatters';

export interface AssetPickerProps {
  organizationId: string;
  /** Called every time the selection changes, with the full current set of selected asset IDs. */
  onSelectionChange: (selectedAssetIds: string[]) => void;
  /** Optional: pre-select assets (e.g. when re-opening a draft). */
  initialSelectedAssetIds?: string[];
}

type OwnershipFilter = 'all' | 'mine' | 'assigned';
// Same granularity as Assets.tsx / PromotedAssetPicker's dropdown,
// campaign_element INCLUDED — see UPDATE note above.
type CategoryFilter = 'all' | ResourceType | 'campaign_element' | 'other';

// Duplicated intentionally, not extracted — same reasoning as
// PromotedAssetPicker.tsx / Assets.tsx. Mirrors Assets.tsx's actual
// (not idealized) tabCounts logic: campaign_element branch first, then
// resourceType, then 'other' — video rows fall into 'other' since
// resource_type is always null for them, matching Assets.tsx's real
// runtime behavior, not its unused getEffectiveTab() helper.
function getEffectiveCategory(row: {
  assetType: UnifiedAssetRow['assetType'];
  resourceType: ResourceType | null;
}): ResourceType | 'campaign_element' | 'other' {
  if (row.assetType === 'campaign_element') return 'campaign_element';
  return row.resourceType ?? 'other';
}

// Same normalization shape as PromotedAssetPicker's UnifiedAssetRow.
// No isShared/sharedBy fields at all — Shared rows are never fetched
// here, see ARCHITECTURE LOCK above.
interface UnifiedAssetRow {
  key: string;
  assetId: string;
  title: string;
  thumbnail: string | null;
  resourceType: ResourceType | null;
  elementType: CampaignElementType | null;
  assetType: 'video' | 'resource' | 'campaign_element';
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
    // matching Assets.tsx's full asset set. See UPDATE note above.
    assetType: row.asset_type,
    isAssigned: assignedMap.has(row.id),
    assignedCollaboratorCount: assignedMap.get(row.id) ?? null,
  };
}

export function AssetPicker({
  organizationId,
  onSelectionChange,
  initialSelectedAssetIds = [],
}: AssetPickerProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<AssetLibraryRow[]>([]);
  const [assignedSummary, setAssignedSummary] = useState<AssignedAssetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');

  // Selection tracked as a Map keyed by asset_id, holding the full row —
  // unchanged pattern from before this pass. Selection must survive
  // switching filters, same reasoning as the original comment here.
  const [selectedAssetsMap, setSelectedAssetsMap] = useState<Map<string, UnifiedAssetRow>>(
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

    // Deliberately only these two calls — see ARCHITECTURE LOCK above.
    // listSharedAssetsForCollaborator() must never be called here.
    // getAssignedAssetSummaryForOwner takes the VIEWER's user id (whose
    // Assignments to check), not organizationId — mirrors how Assets.tsx
    // and PromotedAssetPicker call it.
    Promise.all([
      listAssetsByOrganization({ organizationId }),
      user ? getAssignedAssetSummaryForOwner(user.id) : Promise.resolve([]),
    ])
      .then(async ([myData, assignedData]) => {
        if (cancelled) return;

        let visibleRows = myData;
        if (user && myData.length > 0) {
          const archiveContextMap = await getAssetArchiveContextsForViewer(
            myData.map(r => ({ id: r.id, assetType: r.asset_type })),
            user.id
          );
          visibleRows = myData.filter(r => !archiveContextMap.get(r.id)?.isArchived);
        }

        if (cancelled) return;
        setRows(visibleRows);
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

  const unifiedRows = useMemo<UnifiedAssetRow[]>(() => {
    const assignedMap = new Map(assignedSummary.map(s => [s.assetId, s.collaboratorCount]));
    const mine = rows.map(row => fromMyRow(row, assignedMap));

    // Assigned is a FILTER over My rows, never a separate fetched list —
    // same architecture lock as Assets.tsx / PromotedAssetPicker.
    if (ownershipFilter === 'assigned') return mine.filter(r => r.isAssigned);
    // 'mine' and 'all' are the same set here — there is no Shared data to
    // union in, unlike PromotedAssetPicker. Kept as two distinct filter
    // options anyway, for UI parity with PromotedAssetPicker/Assets.tsx,
    // even though they currently produce identical results.
    return mine;
  }, [rows, assignedSummary, ownershipFilter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of unifiedRows) {
      const cat = getEffectiveCategory(row);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [unifiedRows]);

  const filteredRows = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return unifiedRows.filter(row => {
      if (categoryFilter !== 'all' && getEffectiveCategory(row) !== categoryFilter) return false;
      if (searchLower && !row.title.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [unifiedRows, categoryFilter, search]);

  function toggleAsset(row: UnifiedAssetRow) {
    setSelectedAssetsMap(prev => {
      const next = new Map(prev);
      if (next.has(row.assetId)) {
        next.delete(row.assetId);
      } else {
        next.set(row.assetId, row);
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

        {/* Category dropdown — same pattern as PromotedAssetPicker,
            Campaign Assets included per the corrected product rule
            (see header UPDATE note). */}
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

      {/* Ownership filter — All / My / Assigned only. No "Shared" option:
          Shared Assets are never assignable, see ARCHITECTURE LOCK above. */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by ownership">
        {(['all', 'mine', 'assigned'] as OwnershipFilter[]).map(f => (
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
            {f === 'all' ? 'All' : f === 'mine' ? 'My' : 'Assigned'}
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
          const isSelected = selectedAssetsMap.has(row.assetId);
          return (
            <button
              key={row.key}
              type="button"
              aria-pressed={isSelected}
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

      {selectedAssets.length > 0 && (
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          {selectedAssets.length} asset{selectedAssets.length === 1 ? '' : 's'} selected
        </p>
      )}
    </div>
  );
}
