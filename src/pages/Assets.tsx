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
 * UPDATE (Archive Resolver pass, Phase 1 — ARCHIVE_SYSTEM_DESIGN.md):
 * replaced the old single-source `archivedMap` (asset_user_states only,
 * via getArchivedAssetIdsForUser) with `archiveContextMap`, resolved
 * through the central resolver's batch entry point
 * (getAssetArchiveContextsForViewer). This page no longer independently
 * decides what "archived" means — it renders whatever `level` and
 * `reasons` the resolver returns per Asset. The old single-tier "Archived"
 * modal is now Level 2 only (Hidden — Unhide-only, never touches true
 * archive state); a new inline "Archive Tab" section is Level 1 (visible
 * archived Assets, one row per Asset even with multiple reasons, each
 * reason with its own action, plus a Hide affordance per Design Doc §9).
 *
 * UPDATE (Cache wiring pass — closes the prior "KNOWN GAP"): now that
 * lib/assetsPageCache.ts's `AssetsPageCacheData` has been updated to hold
 * `archiveContextMap` natively, this page trusts a cache hit for archive
 * state exactly the same way it already trusted one for rows/sharedRows/
 * assignedSummary — no more forced live refetch on cache hit. Every
 * action below (archive, restore, hide, unhide) mirrors its local state
 * update into the cache via updateCachedArchiveContextMap, same
 * convention the old archivedMap actions used.
 */
import { useTutorial } from '../lib/tutorial-overlay';
import { assetsTutorial } from '../lib/tutorials/assetsTutorial';
import { createFirstAssetGuide } from '../lib/tutorials/createFirstAssetGuide';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Library, Loader2, Plus, Search, Archive, ArchiveRestore, EyeOff, X, BarChart2, Gamepad2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
import { listAssetsByOrganization } from '../services/asset/listAssetsByOrganization';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';
import {
  listSharedAssetsForCollaborator,
} from '../services/asset/listSharedAssetsForCollaborator';
import {
  getAssignedAssetSummaryForOwner,
} from '../services/asset/getAssignedAssetSummaryForOwner';
import {
  archiveAssetForUser,
  restoreAssetForUser,
} from '../services/asset/assetArchive';
import {
  getAssetArchiveContextsForViewer,
} from '../services/asset/getAssetArchiveContext';
import type { AssetArchiveContext } from '../services/asset/getAssetArchiveContext';
import {
  hideAssetForUser,
  unhideAssetForUser,
} from '../services/asset/archiveUiVisibility';

import type {
  AssignedAssetSummary,
} from '../services/asset/getAssignedAssetSummaryForOwner';
import type {
  SharedAssetLibraryRow,
} from '../services/asset/listSharedAssetsForCollaborator';
import { resolveThumbnail, resolveAssetThumbnail, resolveElementThumbnail, getElementTypeLabel, RESOURCE_TYPE_LABELS, type ResourceType, type CampaignElementType } from '../lib/videoFormatters';
import { ImportAssetModal } from '../components/ImportAssetModal';
import type { AssetResource } from '../services/asset/createAssetResource';
// UPDATE: assetsPageCache.ts now supports archiveContextMap natively —
// the earlier "KNOWN GAP" (cache writes for archive state skipped) is
// closed. updateCachedArchiveContextMap mirrors every archive/restore/
// hide/unhide action into the cache, same convention as rows/sharedRows/
// assignedSummary.
import { assetsPageCache, updateCachedArchiveContextMap } from '../lib/assetsPageCache';
import OnboardingVideoSection02 from '../components/onboarding/OnboardingVideo/OnboardingVideoSection02';
import TopAssetsRanking from '../components/assets/TopAssetsRanking';
// MOVED to module scope (see UPDATE note below) — was previously declared
// inside Assets() but referenced by fromMyRow/fromSharedRow outside it.
type AssetLibraryTab = 'all' | ResourceType | 'campaign_element';
type OwnershipFilter = 'all' | 'mine' | 'shared' | 'assigned' | 'archived';
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

  /**
   * Full archive context for the CURRENT viewer — null means the central
   * resolver hasn't resolved this row yet (still loading), NOT the same
   * as "not archived". Check `archiveContext?.isArchived` /
   * `archiveContext?.level`, never re-derive archive state from other
   * fields on this row. See getAssetArchiveContext.ts.
   */
  archiveContext: AssetArchiveContext | null;
}

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

  // Archive context — resolved entirely through the central resolver
  // (getAssetArchiveContext.ts, batch entry point). Map<asset_id,
  // AssetArchiveContext>, scoped to the current viewer only. Ali and
  // WebMood each get their own Map; archiving/hiding never mutates a
  // shared row, so it can never affect what another user sees.
  const [archiveContextMap, setArchiveContextMap] = useState<Map<string, AssetArchiveContext>>(new Map());
  const [archivingAssetId, setArchivingAssetId] = useState<string | null>(null);
  const [hidingAssetId, setHidingAssetId] = useState<string | null>(null);
  // Level 2 modal — "Hidden" (was "Archived") — lists only rows the
  // viewer has explicitly Hidden via archive_ui_visibility. Restore here
  // is Unhide-only; it never touches true archive state.
  const [showHiddenAssetsModal, setShowHiddenAssetsModal] = useState(false);
  const [selectedHiddenAssetIds, setSelectedHiddenAssetIds] = useState<string[]>([]);
  const [unhidingAssets, setUnhidingAssets] = useState(false);

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
const [activeTab, setActiveTab] = useState<AssetLibraryTab>('all');
const [ownershipFilter, setOwnershipFilter] =
  useState<OwnershipFilter>('all');
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
    fromMyRow(row, assignedMap, archiveContextMap)
  );

  const shared = sharedRows.map(row => fromSharedRow(row, archiveContextMap));

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
  archiveContextMap,
  ownershipFilter,
]);

// Archive is purely an organizational/visibility feature — it never
// changes what data exists, only what's shown in the active list vs the
// Level 1 Archive Tab / Level 2 Hidden modal below.
//
// Three-way split, driven by the central resolver's `level`:
//   normal (or context not yet resolved) -> active list
//   level1                                -> Archive Tab (visible)
//   level2                                -> Hidden modal (Unhide only)
const activeUnifiedRows = useMemo(
  () => unifiedRows.filter(row => !row.archiveContext?.isArchived),
  [unifiedRows]
);

const level1UnifiedRows = useMemo(
  () => unifiedRows.filter(row => row.archiveContext?.level === 'level1'),
  [unifiedRows]
);

const level2UnifiedRows = useMemo(
  () => unifiedRows.filter(row => row.archiveContext?.level === 'level2'),
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
  // loadArchiveContext is kept as a standalone helper (rather than
  // inlined into fetchAssets) because handleArchiveAsset etc. below need
  // the same resolve-then-cache pattern for a single-row optimistic
  // update — but those use direct Map surgery instead of a full re-fetch,
  // for the same "avoid unnecessary round trips" reason the batch
  // resolver itself exists. This helper stays fetch-path only.
  const loadArchiveContext = async (
    myRows: AssetLibraryRow[],
    shared: SharedAssetLibraryRow[]
  ) => {
    if (!user) {
      setArchiveContextMap(new Map());
      return;
    }
    const inputs = [
      ...myRows.map(row => ({ id: row.id, assetType: row.asset_type })),
      ...shared.map(row => ({ id: row.asset_id, assetType: row.asset_type })),
    ];
    try {
      const contextMap = await getAssetArchiveContextsForViewer(inputs, user.id);
      setArchiveContextMap(contextMap);
      return contextMap;
    } catch (err: any) {
      console.error('[Assets] getAssetArchiveContextsForViewer failed:', err);
      // Fail soft — an active list that briefly can't show archive state
      // is much better than a page that won't load at all.
      setArchiveContextMap(new Map());
      return new Map<string, AssetArchiveContext>();
    }
  };

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

      const contextMap = await loadArchiveContext(myData, sharedData);

      if (user) {
        assetsPageCache.set(`${organizationId}:${user.id}`, {
          rows: myData,
          sharedRows: sharedData,
          assignedSummary: assignedData,
          archiveContextMap: contextMap ?? new Map(),
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
      // Trusted directly from cache now, same as rows/sharedRows/
      // assignedSummary — archiveContextMap is a first-class cached field.
      setArchiveContextMap(cached.data.archiveContextMap);
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
  //
  // Optimistic update: since a freshly-archived Asset has no
  // archive_ui_visibility row yet, it always lands at Level 1 —
  // constructed directly here rather than re-running the full resolver
  // for one row.
  const handleArchiveAsset = (row: UnifiedAssetRow) => {
    if (!user) return;
    showConfirm(
      'Archive Asset?',
      'Archived assets will move to your Archive Tab. You can restore them anytime.',
      async () => {
        setArchivingAssetId(row.key);
        try {
          await archiveAssetForUser(row.key, user.id);
          // Single updater function, used for both local state and the
          // cache mirror below, so the two can never drift apart.
          const updater = (prev: Map<string, AssetArchiveContext>) => {
            const next = new Map(prev);
            const existing = next.get(row.key);
            const otherReasons = (existing?.reasons ?? []).filter(r => r.sourceType !== 'personal');
            next.set(row.key, {
              assetId: row.key,
              isArchived: true,
              reasons: [{ sourceType: 'personal', sourceId: row.key, sourceName: null }, ...otherReasons],
              isHiddenByViewer: false,
              level: 'level1',
            });
            return next;
          };
          setArchiveContextMap(updater);
          if (organizationId) {
            updateCachedArchiveContextMap(`${organizationId}:${user.id}`, updater);
          }
        } catch (err: any) {
          showAlert('Archive Failed', err.message || 'Could not archive this asset.', 'danger');
        } finally {
          setArchivingAssetId(null);
        }
      },
      'info'
    );
  };

  // Level 1 -> restore the personal reason directly (this is the only
  // reason a user can restore from this page; Campaign/Video reasons are
  // restored from CampaignDetail/VideoDetail, not here — per LOCKED
  // design, this page navigates to those, it doesn't restore them).
  const handleRestorePersonalReason = async (row: UnifiedAssetRow) => {
    if (!user) return;
    try {
      await restoreAssetForUser(row.key, user.id);
      const updater = (prev: Map<string, AssetArchiveContext>) => {
        const next = new Map(prev);
        const existing = next.get(row.key);
        if (!existing) return next;
        const remainingReasons = existing.reasons.filter(r => r.sourceType !== 'personal');
        next.set(row.key, {
          ...existing,
          reasons: remainingReasons,
          isArchived: remainingReasons.length > 0,
          level: remainingReasons.length > 0 ? 'level1' : 'normal',
        });
        return next;
      };
      setArchiveContextMap(updater);
      if (organizationId) {
        updateCachedArchiveContextMap(`${organizationId}:${user.id}`, updater);
      }
    } catch (err: any) {
      showAlert('Restore Failed', err.message || 'Could not restore this asset.', 'danger');
    }
  };

  // Level 1 -> Hide (writes ONLY archive_ui_visibility; never touches
  // asset_user_states / videos.archived_at / campaigns.archived_at).
  const handleHideAsset = async (row: UnifiedAssetRow) => {
    if (!user) return;
    setHidingAssetId(row.key);
    try {
      await hideAssetForUser(row.key, user.id);
      const updater = (prev: Map<string, AssetArchiveContext>) => {
        const next = new Map(prev);
        const existing = next.get(row.key);
        if (!existing) return next;
        next.set(row.key, { ...existing, isHiddenByViewer: true, level: 'level2' });
        return next;
      };
      setArchiveContextMap(updater);
      if (organizationId) {
        updateCachedArchiveContextMap(`${organizationId}:${user.id}`, updater);
      }
    } catch (err: any) {
      showAlert('Hide Failed', err.message || 'Could not hide this asset.', 'danger');
    } finally {
      setHidingAssetId(null);
    }
  };

  const openHiddenAssetsModal = () => {
    setSelectedHiddenAssetIds([]);
    setShowHiddenAssetsModal(true);
  };

  const toggleHiddenAssetSelection = (assetId: string) => {
    setSelectedHiddenAssetIds(prev =>
      prev.includes(assetId) ? prev.filter(x => x !== assetId) : [...prev, assetId]
    );
  };

  // Level 2 Restore = Unhide ONLY. Deletes the viewer's
  // archive_ui_visibility row(s) — never restores true archive state.
  // An Unhidden Asset with reasons still active drops back to Level 1,
  // not to the active list — this is deliberate per LOCKED design.
  const handleUnhideSelectedAssets = async () => {
    if (!user || selectedHiddenAssetIds.length === 0) return;
    setUnhidingAssets(true);
    try {
      await Promise.all(
        selectedHiddenAssetIds.map(assetId => unhideAssetForUser(assetId, user.id))
      );
      const updater = (prev: Map<string, AssetArchiveContext>) => {
        const next = new Map(prev);
        selectedHiddenAssetIds.forEach(assetId => {
          const existing = next.get(assetId);
          if (existing) {
            next.set(assetId, { ...existing, isHiddenByViewer: false, level: 'level1' });
          }
        });
        return next;
      };
      setArchiveContextMap(updater);
      if (organizationId) {
        updateCachedArchiveContextMap(`${organizationId}:${user.id}`, updater);
      }
      setSelectedHiddenAssetIds([]);
    } catch (err: any) {
      showAlert('Unhide Failed', err.message, 'danger');
    } finally {
      setUnhidingAssets(false);
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

  <button
    onClick={() => setOwnershipFilter('archived')}
    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
      ownershipFilter === 'archived'
        ? 'bg-amber-600 text-white'
        : 'bg-amber-950/40 text-amber-500 hover:text-amber-300'
    }`}
  >
    Archived ({level1UnifiedRows.length})
  </button>
  <button
    onClick={openHiddenAssetsModal}
    className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all"
  >
    <EyeOff size={14} /> Hidden{level2UnifiedRows.length > 0 ? ` (${level2UnifiedRows.length})` : ''}
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

      {!loading && !error && ownershipFilter !== 'archived' && filteredRows.length > 0 && (
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

      {!loading && !error && ownershipFilter === 'archived' && (
        <div className="space-y-2">
          {level1UnifiedRows.length === 0 ? (
            <p className="text-zinc-500 text-sm">No archived assets.</p>
          ) : (
            level1UnifiedRows.map(row => (
              <div key={row.key} className="bg-zinc-900 border border-amber-900/40 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/assets/${row.linkId}`} className="text-sm font-bold text-white truncate hover:text-zinc-300">
                    {row.title}
                  </Link>
                  <button
                    onClick={() => handleHideAsset(row)}
                    disabled={hidingAssetId === row.key}
                    className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white shrink-0 disabled:opacity-50"
                  >
                    {hidingAssetId === row.key ? <Loader2 size={10} className="animate-spin" /> : <EyeOff size={10} />}
                    Hide
                  </button>
                </div>
                <div className="space-y-1.5">
                  {(row.archiveContext?.reasons ?? []).map(reason => (
                    <div key={`${reason.sourceType}-${reason.sourceId}`} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-zinc-400">
                        {reason.sourceType === 'personal' && 'Archived by You'}
                        {reason.sourceType === 'video' && `Source Video Archived${reason.sourceName ? `: ${reason.sourceName}` : ''}`}
                        {reason.sourceType === 'campaign' && `Campaign Archived${reason.sourceName ? `: ${reason.sourceName}` : ''}`}
                      </span>
                      {reason.sourceType === 'personal' && (
                        <button onClick={() => handleRestorePersonalReason(row)} className="font-black uppercase tracking-widest text-white hover:text-zinc-300 shrink-0">
                          Restore
                        </button>
                      )}
                      {reason.sourceType === 'video' && (
                        <Link to={`/videos/${reason.sourceId}`} className="font-black uppercase tracking-widest text-white hover:text-zinc-300 shrink-0">
                          Go to Video
                        </Link>
                      )}
                      {reason.sourceType === 'campaign' && (
                        <Link to={`/campaigns/${reason.sourceId}`} className="font-black uppercase tracking-widest text-white hover:text-zinc-300 shrink-0">
                          Go to Campaign
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
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

      {/* Level 2 — Hidden modal. Shows ONLY assets the CURRENT viewer has
          both (a) an active archive reason for AND (b) explicitly Hidden
          via archive_ui_visibility. Restore here is Unhide-only — it
          never touches asset_user_states / videos.archived_at /
          campaigns.archived_at. Same per-user scoping as Level 1: the
          same asset can be Level 1 for one viewer and Level 2 for
          another. */}
      <AnimatePresence>
        {showHiddenAssetsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowHiddenAssetsModal(false)}
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
                  <EyeOff size={16} className="text-zinc-500" /> Hidden Assets
                </h2>
                <button
                  onClick={() => setShowHiddenAssetsModal(false)}
                  className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
                {level2UnifiedRows.length === 0 ? (
                  <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest text-center py-10">
                    No hidden assets
                  </p>
                ) : (
                  level2UnifiedRows.map(row => (
                    <div
                      key={row.key}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedHiddenAssetIds.includes(row.key)}
                        onChange={() => toggleHiddenAssetSelection(row.key)}
                        className="w-4 h-4 rounded accent-white shrink-0"
                      />
                      <Link
                        to={`/assets/${row.linkId}`}
                        onClick={() => setShowHiddenAssetsModal(false)}
                        className="text-sm text-zinc-200 flex-1 truncate hover:text-white"
                      >
                        {row.title}
                      </Link>
                    </div>
                  ))
                )}
              </div>

              <button
                disabled={selectedHiddenAssetIds.length === 0 || unhidingAssets}
                onClick={handleUnhideSelectedAssets}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {unhidingAssets ? <Loader2 size={14} className="animate-spin" /> : <EyeOff size={14} />}
                Unhide Selected{selectedHiddenAssetIds.length > 0 ? ` (${selectedHiddenAssetIds.length})` : ''}
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
      className="fixed top-[52px] left-[18px] sm:top-4 sm:left-[210px] z-[20001] flex items-center gap-2 bg-white text-zinc-900 border border-zinc-300 rounded-full text-[10px] font-black uppercase tracking-widest px-4 py-2 shadow-lg hover:bg-zinc-100 transition-colors"
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
  archiveContextMap: Map<string, AssetArchiveContext>
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

archiveContext: archiveContextMap.get(row.id) ?? null,
  };
}

function fromSharedRow(
  row: SharedAssetLibraryRow,
  archiveContextMap: Map<string, AssetArchiveContext>
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

archiveContext: archiveContextMap.get(row.asset_id) ?? null,
  };
}