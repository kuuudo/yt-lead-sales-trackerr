/**
 * src/pages/Assets.tsx
 *
 * Content Library — answers "what do I own, what can I promote"
 * (Design Lock: Videos.tsx vs Assets.tsx responsibility split).
 *
 * Minimal viable version per Design Lock §4:
 *   - One list, one query (listAssetsByOrganization)
 *   - No filter / sort / grid-list toggle / bulk actions
 *   - No custom AssetDetail beyond the empty shell — each row links to
 *     /assets/:id (AssetDetail.tsx), not /videos/:id. VideoDetail.tsx is
 *     untouched by this page.
 *
 * Integration testing found the underlying join was fine, but PostgREST
 * returns the embedded `videos` relation as an array (no UNIQUE constraint
 * on videos.asset_id to prove it's 1:1) — see the fix and full explanation
 * in services/asset/listAssetsByOrganization.ts. This component now consumes
 * the flat `AssetLibraryRow` shape that function normalizes to, so nothing
 * here needs to know about the array/object embed detail.
 *
 * UPDATE (Import Asset pass): added the "Import Asset" entry point
 * (ImportAssetModal) and switched thumbnail resolution to branch between
 * video-domain and resource-domain fallbacks depending on row.resource_type.
 *
 * UPDATE (Campaign Element pass): added a standalone "Campaign Assets" tab
 * (kept separate from the ResourceType tabs, not merged in — Campaign
 * Elements are asset_type: 'campaign_element', a different provenance from
 * asset_type: 'resource', even where the content looks similar, e.g.
 * "Newsletter"). Thumbnail/label for this tab reuse resolveElementThumbnail
 * / getElementTypeLabel — the same formatters Assignment Picker and
 * Assignment Detail already use, no new presentation logic introduced.
 *
 * UPDATE (Picker UI pass): added a search box (substring match on
 * video_title, same approach the Assignment Picker already used). Card
 * markup itself unchanged — this pass only added search, kept deliberately
 * separate from the Assignment Picker's card-grid rework happening in the
 * same pass, since the two changes don't depend on each other.
 *
 * UPDATE (Workspace Model pass — My / Shared / Assigned): added the
 * "Assigned" ownership filter. ARCHITECTURE LOCK: Workspace still has
 * exactly two real Asset sources — My and Shared. `All = My + Shared`,
 * unchanged. Assigned is NOT a third source: it is
 * `My.filter(row.isAssigned)`, annotated via a third, independent
 * Promise.all fetch (getAssignedAssetSummaryForOwner — a thin
 * asset_id -> collaboratorCount lookup, no asset rows, no re-query of
 * `assets`). Do not turn Assigned into a unioned list — that would
 * reintroduce the exact duplicate-row problem the My/Shared split was
 * designed to avoid (an assigned asset is by definition already in My,
 * per the CreateAssignment AssetPicker My-only boundary). All four tabs
 * (All / My / Shared / Assigned) are always shown to every user,
 * regardless of whether they have any Sponsor or Collaborator activity —
 * empty tabs are just an empty state, not conditionally hidden UI.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Loader2, Plus, Search } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
import { listAssetsByOrganization } from '../services/asset/listAssetsByOrganization';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';
import {
  listSharedAssetsForCollaborator,
} from '../services/asset/listSharedAssetsForCollaborator';

import type {
  SharedAssetLibraryRow,
} from '../services/asset/listSharedAssetsForCollaborator';
import { getAssignedAssetSummaryForOwner } from '../services/asset/getAssignedAssetSummaryForOwner';
import type { AssignedAssetSummary } from '../services/asset/getAssignedAssetSummaryForOwner';
import { resolveThumbnail, resolveAssetThumbnail, resolveElementThumbnail, getElementTypeLabel, RESOURCE_TYPE_LABELS, type ResourceType, type CampaignElementType } from '../lib/videoFormatters';
import { ImportAssetModal } from '../components/ImportAssetModal';
import type { AssetResource } from '../services/asset/createAssetResource';

export default function Assets() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [rows, setRows] = useState<AssetLibraryRow[]>([]);
  const [sharedRows, setSharedRows] = useState<SharedAssetLibraryRow[]>([]);
  const [assignedSummary, setAssignedSummary] = useState<AssignedAssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [search, setSearch] = useState('');
type AssetLibraryTab = 'all' | ResourceType | 'campaign_element';
type OwnershipFilter = 'all' | 'mine' | 'shared' | 'assigned';
const [activeTab, setActiveTab] = useState<AssetLibraryTab>('all');
const [ownershipFilter, setOwnershipFilter] =
  useState<OwnershipFilter>('all');
// video asset 目前 resource_type 是 null
// campaign_element asset 沒有 resource_type,只有 element_type,獨立分類,不混進 ResourceType
// 只在這頁補上,不改 service
interface UnifiedAssetRow {
  key: string;
  linkId: string;
  title: string;

  thumbnail: string | null;

  resourceType: ResourceType | 'other' | null;

  elementType: CampaignElementType | null;

  assetType: string;

  platform: string | null;

  deletedAt: string | null;

  isShared: boolean;

  sharedByName: string | null;

  sharedByEmail: string | null;

  // Assigned annotation — only ever set on My-sourced rows (fromMyRow).
  // Shared-sourced rows (fromSharedRow) are always isAssigned: false —
  // a Collaborator viewing an asset shared TO them did not assign it
  // themselves; those are independent facts about the same asset_id,
  // not something to merge together here.
  isAssigned: boolean;

  assignedCollaboratorCount: number | null;
}
function getEffectiveTab(row: AssetLibraryRow): AssetLibraryTab {
  if (row.asset_type === 'campaign_element') return 'campaign_element';
  if (row.resource_type) return row.resource_type as ResourceType;
  if (row.asset_type === 'video') return 'video';

  return 'other';
}
// asset_id -> collaboratorCount, built once per fetch so fromMyRow can do
// an O(1) lookup instead of each row re-scanning the summary array.
const assignedSummaryMap = useMemo(() => {
  const map = new Map<string, number>();

  for (const s of assignedSummary) {
    map.set(s.assetId, s.collaboratorCount);
  }

  return map;
}, [assignedSummary]);

const unifiedRows = useMemo<UnifiedAssetRow[]>(() => {
  const mine = rows.map(row => fromMyRow(row, assignedSummaryMap));

  const shared = sharedRows.map(fromSharedRow);

  if (ownershipFilter === 'mine') return mine;

  if (ownershipFilter === 'shared') return shared;

  // Assigned = My.filter(isAssigned) — NOT a third source, NOT a union.
  // Every row here already exists in `mine`; this only narrows it.
  if (ownershipFilter === 'assigned') return mine.filter(row => row.isAssigned);

  return [...mine, ...shared];
}, [
  rows,
  sharedRows,
  ownershipFilter,
  assignedSummaryMap,
]);

// 計算每個 Tab 有幾個
const tabCounts = useMemo(() => {
  const counts: Record<string, number> = {};

  for (const row of unifiedRows) {
    const rt =
  row.assetType === 'campaign_element'
    ? 'campaign_element'
    : row.resourceType ?? 'other';
    counts[rt] = (counts[rt] ?? 0) + 1;
  }

  return counts;
}, [unifiedRows]);


// 根據 tab 過濾
const filteredRows = useMemo(() => {
  const searchLower = search.trim().toLowerCase();

  return unifiedRows.filter(row => {
    const effectiveTab =
      row.assetType === 'campaign_element'
        ? 'campaign_element'
        : row.resourceType ?? 'other';

    if (activeTab !== 'all' && effectiveTab !== activeTab) {
      return false;
    }

    if (
      searchLower &&
      !row.title.toLowerCase().includes(searchLower)
    ) {
      return false;
    }

    return true;
  });
}, [
  unifiedRows,
  activeTab,
  search,
]);
  const fetchAssets = async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [myData, sharedData, assignedData] = await Promise.all([
  listAssetsByOrganization({
    organizationId,
  }),

  user
    ? listSharedAssetsForCollaborator({
        userId: user.id,
        excludeOrganizationId: organizationId,
      })
    : Promise.resolve([]),

  user
    ? getAssignedAssetSummaryForOwner(user.id)
    : Promise.resolve([]),
]);

setRows(myData);

setSharedRows(sharedData);

setAssignedSummary(assignedData);
    } catch (err: any) {
      setError(err.message || 'Could not load your Asset Library.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !organizationId) return;
    fetchAssets();
  }, [user, organizationId]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Library className="text-red-600" size={28} /> Asset Library
        </h1>
        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">
          Content you own and can promote
        </p>
        <button
          onClick={() => setShowImportModal(true)}
          className="mt-4 flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all"
        >
          <Plus size={14} /> Import Asset
        </button>
      </header>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search assets"
          aria-label="Search assets"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
      </div>
<div className="flex items-center gap-2 flex-wrap mb-3">
  <button
    onClick={() => setOwnershipFilter('all')}
    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
      ownershipFilter === 'all'
        ? 'bg-red-600 text-white'
        : 'bg-zinc-900 text-zinc-500 hover:text-white'
    }`}
  >
    All
  </button>

  <button
    onClick={() => setOwnershipFilter('mine')}
    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
      ownershipFilter === 'mine'
        ? 'bg-red-600 text-white'
        : 'bg-zinc-900 text-zinc-500 hover:text-white'
    }`}
  >
    My
  </button>

  <button
    onClick={() => setOwnershipFilter('shared')}
    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
      ownershipFilter === 'shared'
        ? 'bg-red-600 text-white'
        : 'bg-zinc-900 text-zinc-500 hover:text-white'
    }`}
  >
    Shared
  </button>

  <button
    onClick={() => setOwnershipFilter('assigned')}
    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
      ownershipFilter === 'assigned'
        ? 'bg-red-600 text-white'
        : 'bg-zinc-900 text-zinc-500 hover:text-white'
    }`}
  >
    Assigned
  </button>
</div>
<div className="flex items-center gap-2 flex-wrap">
  <button
    onClick={() => setActiveTab('all')}
    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
      activeTab === 'all'
        ? 'bg-red-600 text-white'
        : 'bg-zinc-900 text-zinc-500 hover:text-white'
    }`}
  >
    All ({unifiedRows.length})
  </button>

  <button
    onClick={() => setActiveTab('campaign_element')}
    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
      activeTab === 'campaign_element'
        ? 'bg-red-600 text-white'
        : 'bg-zinc-900 text-zinc-500 hover:text-white'
    }`}
  >
    Campaign Assets ({tabCounts['campaign_element'] ?? 0})
  </button>

  {(Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]).map(rt => (
    <button
      key={rt}
      onClick={() => setActiveTab(rt)}
      className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
        activeTab === rt
          ? 'bg-red-600 text-white'
          : 'bg-zinc-900 text-zinc-500 hover:text-white'
      }`}
    >
      {RESOURCE_TYPE_LABELS[rt]} ({tabCounts[rt] ?? 0})
    </button>
  ))}
</div>
      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      )}

      {error && <div className="text-red-500 text-sm">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-zinc-500 text-sm">
          Nothing in your Library yet. Add a video to your Library from its detail page, or import a link above.
        </p>
      )}

      {!loading && !error && filteredRows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRows.map((row) => (
            <Link
              key={row.key}
              to={`/assets/${row.linkId}`}
              className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all"
            >
              <div className="w-16 h-10 overflow-hidden rounded-lg border border-zinc-800 flex-shrink-0">
                <img
  src={row.thumbnail ?? undefined}
  className="w-full h-full object-cover"
/>
              </div>
              <div className="min-w-0">
  <p className="text-sm font-bold text-white truncate">
    {row.title}
  </p>

  <p className="text-[10px] font-bold uppercase text-zinc-300 tracking-wide mt-1">
    {row.assetType === 'campaign_element'
  ? getElementTypeLabel(row.elementType as CampaignElementType)
  : RESOURCE_TYPE_LABELS[row.resourceType as ResourceType]}
  </p>

  {row.isShared && (
  <div className="mt-0.5">
    <p className="text-[9px] font-black uppercase text-red-500 tracking-widest">
      Shared by
    </p>

    <p className="text-[10px] text-zinc-300">
      {row.sharedByName}

      {row.sharedByEmail && (
        <span className="text-zinc-400">
          {" "}
          ({row.sharedByEmail})
        </span>
      )}
    </p>
  </div>
)}

  {/* Assigned badge — count only, never names. Same asset can be
      referenced by multiple Assignments / shared to multiple
      Collaborators, so a name list doesn't belong on the card;
      full breakdown is Asset Detail's job. */}
  {row.isAssigned && (
    <div className="mt-0.5">
      <p className="text-[9px] font-black uppercase text-blue-400 tracking-widest">
        Assigned
      </p>

      <p className="text-[10px] text-zinc-300">
        {row.assignedCollaboratorCount}{' '}
        {row.assignedCollaboratorCount === 1 ? 'User' : 'Users'}
      </p>
    </div>
  )}

  <div className="flex items-center gap-2 mt-0.5">
    {row.platform && (
      <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">
        {row.platform}
      </span>
    )}

    {row.deletedAt && (
      <span className="text-[9px] font-black uppercase text-red-600 tracking-widest">
        Original content deleted
      </span>
    )}
  </div>
</div>
                
            </Link>
          ))}
        </div>
      )}

      {showImportModal && (
        <ImportAssetModal
          onClose={() => setShowImportModal(false)}
          onImported={(_assetResource: AssetResource) => {
            fetchAssets();
          }}
        />
      )}
    </div>
  );
}


function fromMyRow(
  row: AssetLibraryRow,
  assignedSummaryMap: Map<string, number>
): UnifiedAssetRow {
  const collaboratorCount = assignedSummaryMap.get(row.id) ?? null;

  return {
    key: row.id,
    linkId: row.id,

    title: row.video_title || 'Untitled',

    thumbnail:
      row.asset_type === 'campaign_element'
        ? resolveElementThumbnail(row.element_type as CampaignElementType)
        : row.resource_type
        ? resolveAssetThumbnail({
            thumbnail_url: row.thumbnail_url,
            resource_type: row.resource_type,
            platform: row.platform,
          })
        : resolveThumbnail(row),

    resourceType: (row.resource_type as ResourceType) ?? null,

    elementType: (row.element_type as CampaignElementType) ?? null,

    assetType: row.asset_type,

    platform: row.platform,

    deletedAt: row.deleted_at,

    isShared: false,

    sharedByName: null,

    sharedByEmail: null,

    // Presence in assignedSummaryMap means at least one of my Assignments
    // references this asset (via assignment_assets), regardless of
    // collaboratorCount — an assignment with zero invited collaborators
    // yet is still "assigned", just assigned to 0 people.
    isAssigned: collaboratorCount !== null,

    assignedCollaboratorCount: collaboratorCount,
  };
}

function fromSharedRow(
  row: SharedAssetLibraryRow
): UnifiedAssetRow {
  return {
    key: row.asset_id,

    linkId: row.asset_id,

    title: row.display_name,

    thumbnail: row.thumbnail,

    resourceType: row.resource_type,

    elementType: null,

    assetType: row.asset_type,

    platform: null,

    deletedAt: null,

    isShared: true,

    sharedByName: row.shared_by_name,

    sharedByEmail: row.shared_by_email,

    // A Shared row represents an asset shared TO me — Assigned describes
    // assets I've shared OUT as the Sponsor. These are independent facts
    // even when (rare, but possible) the same person is Sponsor on one
    // Assignment and Collaborator on another for a *different* asset_id
    // that happens to render on the same page. Never true for a Shared
    // row itself, since Shared rows are always org-external assets I do
    // not own.
    isAssigned: false,

    assignedCollaboratorCount: null,
  };
}
