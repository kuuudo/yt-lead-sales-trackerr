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
 */
import { useTutorial } from '../lib/tutorial-overlay';
import { assetsTutorial } from '../lib/tutorials/assetsTutorial';
import { createFirstAssetGuide } from '../lib/tutorials/createFirstAssetGuide';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Library, Loader2, Plus, Search, Archive, ArchiveRestore, X, BarChart2, Gamepad2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
import { useTutorial } from '../lib/tutorial-overlay';
import { listAssetsByOrganization } from '../services/asset/listAssetsByOrganization';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';
import {
  listSharedAssetsForCollaborator,
} from '../services/asset/listSharedAssetsForCollaborator';
import {
  getAssignedAssetSummaryForOwner,
} from '../services/asset/getAssignedAssetSummaryForOwner';
import {
  getArchivedAssetIdsForUser,
  archiveAssetForUser,
  restoreAssetForUser,
} from '../services/asset/assetArchive';

import type {
  AssignedAssetSummary,
} from '../services/asset/getAssignedAssetSummaryForOwner';
import type {
  SharedAssetLibraryRow,
} from '../services/asset/listSharedAssetsForCollaborator';
import { resolveThumbnail, resolveAssetThumbnail, resolveElementThumbnail, getElementTypeLabel, RESOURCE_TYPE_LABELS, type ResourceType, type CampaignElementType } from '../lib/videoFormatters';
import { ImportAssetModal } from '../components/ImportAssetModal';
import type { AssetResource } from '../services/asset/createAssetResource';
import { assetsPageCache, updateCachedArchivedMap } from '../lib/assetsPageCache';
import OnboardingVideoSection02 from '../components/onboarding/OnboardingVideo/OnboardingVideoSection02';
import TopAssetsRanking from '../components/assets/TopAssetsRanking';
export default function Assets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [rows, setRows] = useState<AssetLibraryRow[]>([]);
  const [sharedRows, setSharedRows] = useState<SharedAssetLibraryRow[]>([]);
  const [assignedSummary, setAssignedSummary] =
  useState<AssignedAssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const { notify } = useTutorial();
  const tutorial = useTutorial();
  const [search, setSearch] = useState('');

  // Personal archive state — Map<asset_id, archived_at>, scoped to the
  // current user only (see services/asset/assetArchive.ts). Ali and
  // WebMood each get their own Map; archiving never mutates the asset row
  // itself, so it can never affect what another user sees.
  const [archivedMap, setArchivedMap] = useState<Map<string, string>>(new Map());
  const [archivingAssetId, setArchivingAssetId] = useState<string | null>(null);
  const [showArchivedAssets, setShowArchivedAssets] = useState(false);
  const [selectedArchivedAssetIds, setSelectedArchivedAssetIds] = useState<string[]>([]);
  const [restoringAssets, setRestoringAssets] = useState(false);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'info' | 'danger' | 'success';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'info' });

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info') => {
    setModalConfig({ isOpen: true, title, message, variant, onConfirm: undefined });
  };

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    variant: 'info' | 'danger' | 'success' = 'danger'
  ) => {
    setModalConfig({ isOpen: true, title, message, variant, onConfirm });
  };
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

  isAssigned: boolean;

  assignedCollaboratorCount: number | null;

  /** archived_at for the CURRENT user only — null means active. See assetArchive.ts. */
  archivedAt: string | null;
}
function getEffectiveTab(row: AssetLibraryRow): AssetLibraryTab {
  if (row.asset_type === 'campaign_element') return 'campaign_element';
  if (row.resource_type) return row.resource_type as ResourceType;
  if (row.asset_type === 'video') return 'video';

  return 'other';
}
const unifiedRows = useMemo<UnifiedAssetRow[]>(() => {
  const assignedMap = new Map(
    assignedSummary.map(summary => [
      summary.assetId,
      summary.collaboratorCount,
    ])
  );

  const mine = rows.map(row =>
    fromMyRow(row, assignedMap, archivedMap)
  );

  const shared = sharedRows.map(row => fromSharedRow(row, archivedMap));

  if (ownershipFilter === 'mine') {
    return mine;
  }

  if (ownershipFilter === 'shared') {
    return shared;
  }

  if (ownershipFilter === 'assigned') {
    return mine.filter(row => row.isAssigned);
  }

  return [...mine, ...shared];
}, [
  rows,
  sharedRows,
  assignedSummary,
  archivedMap,
  ownershipFilter,
]);

// Archive is purely an organizational/visibility feature — it never
// changes what data exists, only what's shown in the active list vs the
// Archived modal below.
const activeUnifiedRows = useMemo(
  () => unifiedRows.filter(row => !row.archivedAt),
  [unifiedRows]
);

const archivedUnifiedRows = useMemo(
  () => unifiedRows.filter(row => !!row.archivedAt),
  [unifiedRows]
);

// 計算每個 Tab 有幾個
const tabCounts = useMemo(() => {
  const counts: Record<string, number> = {};

  for (const row of activeUnifiedRows) {
    const rt =
  row.assetType === 'campaign_element'
    ? 'campaign_element'
    : row.resourceType ?? 'other';
    counts[rt] = (counts[rt] ?? 0) + 1;
  }

  return counts;
}, [activeUnifiedRows]);


// 根據 tab 過濾
const filteredRows = useMemo(() => {
  const searchLower = search.trim().toLowerCase();

  return activeUnifiedRows.filter(row => {
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
  activeUnifiedRows,
  activeTab,
  search,
]);
  const fetchAssets = async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [myData, sharedData, assignedData, archivedIds] = await Promise.all([
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
  user
    ? getArchivedAssetIdsForUser(user.id)
    : Promise.resolve(new Map<string, string>()),
]);

setRows(myData);

setSharedRows(sharedData);

setAssignedSummary(assignedData);

setArchivedMap(archivedIds);

if (user) {
  assetsPageCache.set(`${organizationId}:${user.id}`, {
    rows: myData,
    sharedRows: sharedData,
    assignedSummary: assignedData,
    archivedMap: archivedIds,
  });
  console.log('[Assets] Cache updated');
}
    } catch (err: any) {
      setError(err.message || 'Could not load your Asset Library.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !organizationId) return;

    const cacheKey = `${organizationId}:${user.id}`;
    const cached = assetsPageCache.get(cacheKey);
    if (cached) {
      console.log('[Assets] Cache hit', new Date(cached.cachedAt).toLocaleTimeString());
      setRows(cached.data.rows);
      setSharedRows(cached.data.sharedRows);
      setAssignedSummary(cached.data.assignedSummary);
      setArchivedMap(cached.data.archivedMap);
      setLoading(false);
      return;
    }
    console.log('[Assets] Cache miss — fetching from Supabase');
    fetchAssets();
  }, [user?.id, organizationId]);

  // Archive is only ever triggered by an explicit user click on the
  // Archive button below — there is no automatic/time-based archiving
  // anywhere. This only ever writes a row scoped to (asset_id, the
  // CURRENT user's id) — it can never affect another user's view of the
  // same asset, never touches sharing, assignments, or ownership.
  const handleArchiveAsset = (row: UnifiedAssetRow) => {
    if (!user) return;
    showConfirm(
      'Archive Asset?',
      'Archived assets will be hidden from your library. You can restore them anytime.',
      async () => {
        setArchivingAssetId(row.key);
        try {
          await archiveAssetForUser(row.key, user.id);
          setArchivedMap(prev => new Map(prev).set(row.key, new Date().toISOString()));
          updateCachedArchivedMap(`${organizationId}:${user.id}`, prev => new Map(prev).set(row.key, new Date().toISOString()));
        } catch (err: any) {
          showAlert('Archive Failed', err.message || 'Could not archive this asset.', 'danger');
        } finally {
          setArchivingAssetId(null);
        }
      },
      'info'
    );
  };

  const openArchivedAssetsModal = () => {
    setSelectedArchivedAssetIds([]);
    setShowArchivedAssets(true);
  };

  const toggleArchivedAssetSelection = (assetId: string) => {
    setSelectedArchivedAssetIds(prev =>
      prev.includes(assetId) ? prev.filter(x => x !== assetId) : [...prev, assetId]
    );
  };

  const handleRestoreSelectedAssets = async () => {
    if (!user || selectedArchivedAssetIds.length === 0) return;
    setRestoringAssets(true);
    try {
      await Promise.all(
        selectedArchivedAssetIds.map(assetId => restoreAssetForUser(assetId, user.id))
      );
      setArchivedMap(prev => {
        const next = new Map(prev);
        selectedArchivedAssetIds.forEach(assetId => next.delete(assetId));
        return next;
      });
      if (organizationId) {
        updateCachedArchivedMap(`${organizationId}:${user.id}`, prev => {
          const next = new Map(prev);
          selectedArchivedAssetIds.forEach(assetId => next.delete(assetId));
          return next;
        });
      }
      setSelectedArchivedAssetIds([]);
    } catch (err: any) {
      showAlert('Restore Failed', err.message, 'danger');
    } finally {
      setRestoringAssets(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
  <Library className="text-red-600" size={28} /> Asset Library
  <button
    onClick={() => setShowOnboarding(true)}
    className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-600 text-white text-sm flex items-center justify-center hover:bg-zinc-700 hover:border-zinc-500 transition-colors"
    aria-label="Watch onboarding"
  >
    🦊
  </button>
</h1>
        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">
          Content you own and can promote
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            data-tutorial-id="assets-import-open"
            onClick={() => { setShowImportModal(true); notify('follow-along-import-opened'); }}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all"
          >
            <Plus size={14} /> Import Asset
          </button>
          <button
            onClick={openArchivedAssetsModal}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all"
          >
            <Archive size={14} /> Archived{archivedUnifiedRows.length > 0 ? ` (${archivedUnifiedRows.length})` : ''}
          </button>
        </div>
      </header>

      {organizationId && rows.length > 0 && (
        <div className="hidden md:block">
          <TopAssetsRanking organizationId={organizationId} rows={rows} />
        </div>
      )}

      

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
    data-tutorial-id="assets-shared-filter"
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
    All ({activeUnifiedRows.length})
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
            <div
              key={row.key}
              className="relative group flex items-center gap-4 p-4 pr-32 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all"
            >
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/assets/${row.linkId}/analytics`);
                  }}
                  title="Analytics"
                  className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                >
                  <BarChart2 size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/assets/${row.linkId}`);
                  }}
                  title="Asset Detail"
                  className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                >
                  <Gamepad2 size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchiveAsset(row);
                  }}
                  disabled={archivingAssetId === row.key}
                  title="Archive"
                  className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                >
                  {archivingAssetId === row.key ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                </button>
              </div>
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
{row.isAssigned && (
  <p className="text-[9px] font-black uppercase text-blue-400 tracking-widest mt-0.5">
    Assigned · {row.assignedCollaboratorCount}{' '}
    {row.assignedCollaboratorCount === 1
      ? 'User'
      : 'Users'}
  </p>
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
                
            </div>
          ))}
        </div>
      )}

      {showImportModal && (
        <ImportAssetModal
          onClose={() => setShowImportModal(false)}
          onImported={(_assetResource: AssetResource) => {
            fetchAssets();
            notify('follow-along-import-created');
          }}
        />
      )}

      {/* Archived assets modal — shows ONLY assets the CURRENT user has
          personally archived. The same asset can be Active for one user
          and Archived for another; this list never reflects anyone else's
          state. */}
      <AnimatePresence>
        {showArchivedAssets && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowArchivedAssets(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Archive size={16} className="text-zinc-500" /> Archived Assets
                </h2>
                <button
                  onClick={() => setShowArchivedAssets(false)}
                  className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
                {archivedUnifiedRows.length === 0 ? (
                  <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest text-center py-10">
                    No archived assets
                  </p>
                ) : (
                  archivedUnifiedRows.map(row => (
                    <div
                      key={row.key}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedArchivedAssetIds.includes(row.key)}
                        onChange={() => toggleArchivedAssetSelection(row.key)}
                        className="w-4 h-4 rounded accent-white shrink-0"
                      />
                      <Link
                        to={`/assets/${row.linkId}`}
                        onClick={() => setShowArchivedAssets(false)}
                        className="text-sm text-zinc-200 flex-1 truncate hover:text-white"
                      >
                        {row.title}
                      </Link>
                    </div>
                  ))
                )}
              </div>

              <button
                disabled={selectedArchivedAssetIds.length === 0 || restoringAssets}
                onClick={handleRestoreSelectedAssets}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {restoringAssets ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={14} />}
                Restore Selected{selectedArchivedAssetIds.length > 0 ? ` (${selectedArchivedAssetIds.length})` : ''}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
        onConfirm={modalConfig.onConfirm}
      />
      {showOnboarding && (
  <div className="fixed inset-0 z-[20000] bg-white overflow-auto">
    {/* 
<button
  onClick={() => setShowOnboarding(false)}
  className="fixed top-4 right-4 z-[20001] w-10 h-10 rounded-full bg-zinc-900 text-white border border-zinc-700 flex items-center justify-center text-lg shadow-lg"
  aria-label="Close video"
>
  ✕
</button>
*/}

<button
      onClick={() => {
        setShowOnboarding(false);
        tutorial.start(assetsTutorial);
      }}
      className="fixed top-4 left-4 z-[20001] flex items-center gap-2 bg-zinc-900 text-white border border-zinc-700 rounded-full text-[10px] font-black uppercase tracking-widest px-4 py-2 shadow-lg hover:bg-zinc-800 transition-colors"
    >
      Take the interactive tour 
    </button>
    <button
      onClick={() => {
        setShowOnboarding(false);
        tutorial.start(createFirstAssetGuide);
      }}
      className="fixed top-4 z-[20001] flex items-center gap-2 bg-white text-zinc-900 border border-zinc-300 rounded-full text-[10px] font-black uppercase tracking-widest px-4 py-2 shadow-lg hover:bg-zinc-100 transition-colors"
      style={{ left: 210 }}
    >
      🎓 Create Your First Asset
    </button>
    <OnboardingVideoSection02
      onSkip={() => setShowOnboarding(false)}
      onComplete={() => setShowOnboarding(false)}
    />
  </div>
)}
    </div>
  );
}


function fromMyRow(
  row: AssetLibraryRow,
  assignedMap: Map<string, number>,
  archivedMap: Map<string, string>
): UnifiedAssetRow {
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

isAssigned: assignedMap.has(row.id),

assignedCollaboratorCount:
  assignedMap.get(row.id) ?? null,

archivedAt: archivedMap.get(row.id) ?? null,
  };
}

function fromSharedRow(
  row: SharedAssetLibraryRow,
  archivedMap: Map<string, string>
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

isAssigned: false,

assignedCollaboratorCount: null,

archivedAt: archivedMap.get(row.asset_id) ?? null,
  };
}