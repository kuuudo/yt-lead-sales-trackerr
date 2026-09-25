// ─────────────────────────────────────────────────────────────────────────────
// AllPromotionsAnalytics.tsx
//
// Promotion-grain analytics. Data source: buildPromotionMetricRows() ONLY.
// Does NOT sum All Assets pair rows. Does NOT use promotionAnalyticsEngine.
// Metrics: metricsForFactBag → processVideoMetrics (canonical).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useViewing } from '../lib/ViewingContext';
import {
  TABLE_COLUMNS,
  COLUMN_LABELS,
  handleSortToggle,
  getDateBounds,
  type MetricType,
  type DateRange,
  type CustomDateRange,
  type RevenueView,
} from '../lib/analyticsEngine';
import { getPromotionArchiveContextsForViewer } from '../services/promotion/getPromotionArchiveContext';
import {
  buildPromotionMetricRows,
  type PromotionMetricRow,
} from '../services/analytics/buildPromotionMetricRows';
import { UNATTRIBUTED_PROMOTION_ID } from '../services/analytics/orgAnalyticsFacts';
import {
  ChevronLeft, Calendar, Filter, ArrowUpDown, Loader2, Check, Megaphone,
} from 'lucide-react';

const PROMOTION_METRIC_COLUMNS: MetricType[] = [...TABLE_COLUMNS];

function formatMetricCell(key: MetricType, value: number | string | undefined): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  if (key === 'rpc') return `$${Number.isFinite(n) ? n.toFixed(2) : '0.00'}`;
  if (key.includes('revenue') || key === 'total_revenue') {
    return `$${(Number.isFinite(n) ? n : 0).toLocaleString()}`;
  }
  return (Number.isFinite(n) ? n : 0).toLocaleString();
}

async function resolveOrgAndViewer(viewing?: {
  viewingMemberId: string | null;
  viewingOrgId: string | null;
}): Promise<{ organizationId: string; viewerId: string }> {
  if (viewing?.viewingMemberId && viewing?.viewingOrgId) {
    return { organizationId: viewing.viewingOrgId, viewerId: viewing.viewingMemberId };
  }
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Not authenticated');
  const viewerId = auth.user.id;
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', viewerId)
    .limit(1)
    .maybeSingle();
  if (membership?.organization_id) {
    return { organizationId: membership.organization_id as string, viewerId };
  }
  throw new Error('Could not resolve organizationId');
}

function LoadingBlock() {
  return (
    <div className="py-20 text-center">
      <Loader2 className="animate-spin text-red-600 mx-auto" size={32} aria-hidden />
      <div className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mt-4">
        Loading promotion analytics…
      </div>
      <div className="text-[10px] text-zinc-600 mt-2">
        Building Promotion fact bags from Supabase events / purchases.
      </div>
    </div>
  );
}

/**
 * Viewer archive visibility — same chain as All Assets / Marketplace:
 * promotion_user_states.archived_at → getPromotionArchiveContextsForViewer.
 * Does not invent a new rule from promotions.archived_at alone.
 */
async function loadViewerPromotionArchive(
  promotionIds: string[],
  viewerId: string,
): Promise<Map<string, boolean>> {
  const ids = promotionIds.filter(id => id !== UNATTRIBUTED_PROMOTION_ID);
  const map = new Map<string, boolean>();
  if (ids.length === 0) return map;

  const { data: promoStateRows, error } = await supabase
    .from('promotion_user_states')
    .select('promotion_id, archived_at')
    .eq('user_id', viewerId)
    .in('promotion_id', ids);
  if (error) {
    console.warn('[AllPromotionsAnalytics] promotion_user_states', error.message);
    return map;
  }
  const archivedAtByPromotionId = new Map<string, string | null>(
    (promoStateRows ?? []).map((row: any) => [
      row.promotion_id as string,
      (row.archived_at as string | null) ?? null,
    ]),
  );
  const promotionsForArchive = ids.map(id => ({
    id,
    archivedAt: archivedAtByPromotionId.get(id) ?? null,
  }));
  const full = await getPromotionArchiveContextsForViewer(promotionsForArchive, viewerId);
  for (const [id, ctx] of full.entries()) {
    map.set(id, !!ctx.isArchived);
  }
  return map;
}

export default function AllPromotionsAnalytics() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { viewingMemberId, viewingOrgId, isReadOnly } = useViewing();

  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<string[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  /** Canonical marketer = assignment_collaborators.user_id; 'all' | userId | '__unattributed__' */
  const [selectedMarketerId, setSelectedMarketerId] = useState<string>('all');
  const [hideArchivedPromotion, setHideArchivedPromotion] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total_revenue',
    direction: 'desc',
  });

  const [rows, setRows] = useState<PromotionMetricRow[]>([]);
  /** promotionId → marketer user_id (null = no collaborator → Unattributed for marketer filter) */
  const [marketerUserIdByPromotionId, setMarketerUserIdByPromotionId] = useState<Map<string, string | null>>(new Map());
  const [marketerNameByUserId, setMarketerNameByUserId] = useState<Map<string, string>>(new Map());
  const [viewerArchivedById, setViewerArchivedById] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { organizationId: orgId, viewerId } = await resolveOrgAndViewer(
          isReadOnly
            ? { viewingMemberId: viewingMemberId ?? null, viewingOrgId: viewingOrgId ?? null }
            : undefined,
        );
        if (cancelled) return;
        setOrganizationId(orgId);

        const source: 'stripe' | 'pixel' | 'total' =
          activeSource === 'pixel' || activeSource === 'stripe' ? activeSource : 'total';

        const built = await buildPromotionMetricRows({
          organizationId: orgId,
          dateRange,
          customRange,
          activeSource: source,
          includeEV: true,
        });
        if (cancelled) return;

        const archiveMap = await loadViewerPromotionArchive(
          built.map(r => r.promotionId),
          viewerId,
        );
        if (cancelled) return;

        setRows(built);
        setViewerArchivedById(archiveMap);

        // Content Marketer: promotions.assignment_collaborator_id
        //   → assignment_collaborators.user_id → profiles
        // Not videos.user_id / owner_user_id.
        const realPromoIds = built
          .map(r => r.promotionId)
          .filter(id => id !== UNATTRIBUTED_PROMOTION_ID);
        const marketerByPromo = new Map<string, string | null>();
        const nameByUser = new Map<string, string>();
        if (realPromoIds.length > 0) {
          const { data: promoRows } = await supabase
            .from('promotions')
            .select('id, assignment_collaborator_id')
            .in('id', realPromoIds);
          const collabIds = Array.from(
            new Set(
              (promoRows ?? [])
                .map((p: any) => p.assignment_collaborator_id as string | null)
                .filter((id): id is string => !!id),
            ),
          );
          const collabToUser = new Map<string, string>();
          if (collabIds.length > 0) {
            const { data: collabRows } = await supabase
              .from('assignment_collaborators')
              .select('id, user_id')
              .in('id', collabIds);
            for (const c of collabRows ?? []) {
              if (c.user_id) collabToUser.set(c.id as string, c.user_id as string);
            }
          }
          const userIds = Array.from(new Set(collabToUser.values()));
          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', userIds);
            for (const pr of profiles ?? []) {
              const label =
                (pr.full_name as string | null)?.trim() ||
                (pr.email as string | null)?.trim() ||
                (pr.id as string).slice(0, 8);
              nameByUser.set(pr.id as string, label);
            }
          }
          for (const p of promoRows ?? []) {
            const cid = p.assignment_collaborator_id as string | null;
            const uid = cid ? collabToUser.get(cid) ?? null : null;
            marketerByPromo.set(p.id as string, uid);
          }
          // Promotions with no row / no collaborator → null marketer
          for (const id of realPromoIds) {
            if (!marketerByPromo.has(id)) marketerByPromo.set(id, null);
          }
        }
        // Synthetic unattributed metrics row has no marketer
        marketerByPromo.set(UNATTRIBUTED_PROMOTION_ID, null);
        if (!cancelled) {
          setMarketerUserIdByPromotionId(marketerByPromo);
          setMarketerNameByUserId(nameByUser);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    dateRange,
    customRange,
    activeSource,
    isReadOnly,
    viewingMemberId,
    viewingOrgId,
  ]);

  const isRowArchived = (row: PromotionMetricRow): boolean => {
    if (row.isUnattributed) return false;
    if (viewerArchivedById.has(row.promotionId)) {
      return !!viewerArchivedById.get(row.promotionId);
    }
    // Fallback to Phase B promotions.archived_at only if viewer state missing
    return row.isArchived;
  };

  const campaignOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.isUnattributed || !r.campaignId) continue;
      if (!map.has(r.campaignId)) {
        map.set(r.campaignId, r.campaignName?.trim() || 'Campaign');
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const promotionOptions = useMemo(() => {
    return rows
      .filter(r => !r.isUnattributed)
      .map(r => ({ id: r.promotionId, title: r.title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [rows]);

  const marketerOptions = useMemo(() => {
    const ids = new Set<string>();
    marketerUserIdByPromotionId.forEach(uid => {
      if (uid) ids.add(uid);
    });
    return Array.from(ids)
      .map(id => ({ id, name: marketerNameByUserId.get(id) ?? id.slice(0, 8) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [marketerUserIdByPromotionId, marketerNameByUserId]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (selectedPromotionIds.length > 0) {
      list = list.filter(r => selectedPromotionIds.includes(r.promotionId));
    }
    if (selectedCampaignId !== 'all') {
      list = list.filter(r => r.campaignId === selectedCampaignId);
    }
    if (selectedMarketerId !== 'all') {
      if (selectedMarketerId === '__unattributed__') {
        list = list.filter(r => {
          if (r.isUnattributed) return true;
          return marketerUserIdByPromotionId.get(r.promotionId) == null;
        });
      } else {
        list = list.filter(
          r => marketerUserIdByPromotionId.get(r.promotionId) === selectedMarketerId,
        );
      }
    }
    if (hideArchivedPromotion) {
      list = list.filter(r => !isRowArchived(r));
    }
    return list;
  }, [
    rows,
    selectedPromotionIds,
    selectedCampaignId,
    selectedMarketerId,
    hideArchivedPromotion,
    viewerArchivedById,
    marketerUserIdByPromotionId,
  ]);

  const sortedRows = useMemo(() => {
    const key = sortConfig.key;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      if (key === 'promotion' || key === 'title') {
        const at = (a.title ?? '').toLowerCase();
        const bt = (b.title ?? '').toLowerCase();
        if (at !== bt) return at > bt ? dir : -dir;
        return a.promotionId > b.promotionId ? dir : -dir;
      }
      const av = Number((a.metrics as any)[key] ?? 0);
      const bv = Number((b.metrics as any)[key] ?? 0);
      if (av === bv) return a.promotionId > b.promotionId ? 1 : -1;
      return av > bv ? dir : -dir;
    });
  }, [filteredRows, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => handleSortToggle(prev, key));
  };

  const togglePromotionId = (id: string) => {
    setSelectedPromotionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const colSpan = 1 + PROMOTION_METRIC_COLUMNS.length;

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      {/* Sidebar filters */}
      <aside className="hidden lg:flex w-80 bg-zinc-950 border-r border-zinc-900 flex-col shrink-0">
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Date Range
            </label>
            <div className="relative">
              <select
                value={dateRange}
                onChange={e => {
                  const v = e.target.value as DateRange;
                  setDateRange(v);
                  if (v !== 'custom') setCustomRange(null);
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="2months">Last 2 Months</option>
                <option value="6months">Last 6 Months</option>
                <option value="1year">Last Year</option>
                <option value="all">Lifetime</option>
                <option value="custom">Custom Range</option>
              </select>
              <Calendar size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            </div>
            {dateRange === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-[10px] text-zinc-300"
                  onChange={e =>
                    setCustomRange(prev => ({
                      start: e.target.value,
                      end: prev?.end ?? e.target.value,
                    }))
                  }
                />
                <input
                  type="date"
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-[10px] text-zinc-300"
                  onChange={e =>
                    setCustomRange(prev => ({
                      start: prev?.start ?? e.target.value,
                      end: e.target.value,
                    }))
                  }
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Source
            </label>
            <div className="flex gap-1.5">
              {([
                ['total', 'Total'],
                ['pixel', 'Pixel'],
                ['stripe', 'Stripe'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveSource(key)}
                  className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                    activeSource === key
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Campaign
            </label>
            <select
              value={selectedCampaignId}
              onChange={e => setSelectedCampaignId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer"
            >
              <option value="all">All Campaigns</option>
              {campaignOptions.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Content Marketer
            </label>
            <select
              value={selectedMarketerId}
              onChange={e => setSelectedMarketerId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer"
            >
              <option value="all">All Marketers</option>
              {marketerOptions.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value="__unattributed__">Unattributed (no collaborator)</option>
            </select>
            <p className="text-[9px] text-zinc-600 mt-2 leading-relaxed">
              assignment_collaborator → user — not content owner / promotion owner.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Promotions
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1 border border-zinc-900 rounded-xl p-2">
              {promotionOptions.length === 0 && (
                <div className="text-[10px] text-zinc-600 px-2 py-1">No promotions in range</div>
              )}
              {promotionOptions.map(p => {
                const on = selectedPromotionIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePromotionId(p.id)}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-[10px] font-bold text-zinc-300 hover:bg-zinc-900 truncate"
                  >
                    {on ? <Check size={11} className="text-red-500 shrink-0" /> : <span className="w-[11px] shrink-0" />}
                    <span className="truncate">{p.title}</span>
                  </button>
                );
              })}
            </div>
            {selectedPromotionIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPromotionIds([])}
                className="mt-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
              >
                Clear selection
              </button>
            )}
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Archive
            </label>
            <button
              type="button"
              onClick={() => setHideArchivedPromotion(v => !v)}
              className={`w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                hideArchivedPromotion
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white'
              }`}
            >
              {hideArchivedPromotion ? 'Hiding archived' : 'Show archived'}
            </button>
            <p className="text-[9px] text-zinc-600 mt-2 leading-relaxed">
              Uses viewer promotion_user_states (same as Marketplace / All Assets), not a new rule.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="shrink-0 border-b border-zinc-900 bg-black px-6 py-4">
          <div className="flex items-center gap-3 mb-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
            <div>
              <h1 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                <Megaphone size={14} className="text-red-500" />
                Promotion Analytics
              </h1>
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
                Performance per promotion · fact bags · not asset pair sums
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                {loading ? '…' : `${sortedRows.length} Promotions`}
              </span>
              {organizationId && (
                <span className="text-[9px] text-zinc-700 font-mono truncate max-w-[120px]">
                  org {organizationId.slice(0, 8)}
                </span>
              )}
            </div>
            {/* Source switch — always visible; rebuilds rows via activeSource → buildPromotionMetricRows */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mr-1">
                Source
              </span>
              {([
                ['total', 'Total'],
                ['pixel', 'Pixel'],
                ['stripe', 'Stripe'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveSource(key)}
                  className={`h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                    activeSource === key
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full divide-y divide-zinc-900 border-collapse">
              <thead className="bg-zinc-950 sticky top-0 z-20">
                <tr>
                  <th
                    onClick={() => handleSort('title')}
                    className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[220px] cursor-pointer hover:text-zinc-300"
                  >
                    <div className="flex items-center gap-1.5">
                      Promotion
                      <ArrowUpDown
                        size={10}
                        className={sortConfig.key === 'title' ? 'text-white' : 'text-zinc-700'}
                      />
                    </div>
                  </th>
                  {PROMOTION_METRIC_COLUMNS.map(key => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap cursor-pointer hover:text-zinc-300"
                    >
                      <div className="flex items-center gap-1.5">
                        {COLUMN_LABELS[key] ?? key}
                        <ArrowUpDown
                          size={10}
                          className={sortConfig.key === key ? 'text-white' : 'text-zinc-700'}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-black divide-y divide-zinc-900">
                {loading && (
                  <tr>
                    <td colSpan={colSpan} className="px-6">
                      <LoadingBlock />
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={colSpan} className="px-6 py-20 text-center">
                      <div className="text-[11px] font-black uppercase tracking-widest text-red-500">
                        Failed to load promotion analytics
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-2 max-w-md mx-auto">{error}</div>
                    </td>
                  </tr>
                )}
                {!loading && !error && sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="px-6 py-20 text-center">
                      <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                        No promotions in this range
                      </div>
                      <div className="text-[10px] text-zinc-700 mt-2 max-w-md mx-auto">
                        If the spinner is gone, this filtered set is empty — not still loading.
                      </div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  !error &&
                  sortedRows.map(row => {
                    const archived = isRowArchived(row);
                    const orphan = !!row.isOrphanIdentity;
                    return (
                      <tr key={row.promotionId} className="hover:bg-zinc-950 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="max-w-[240px]">
                            <div
                              className={`text-xs font-bold truncate ${
                                row.isUnattributed
                                  ? 'text-amber-400'
                                  : orphan
                                    ? 'text-zinc-500 italic'
                                    : 'text-zinc-200'
                              }`}
                              title={row.promotionId}
                            >
                              {row.isUnattributed
                                ? 'Unattributed'
                                : orphan
                                  ? `Unresolved · ${row.promotionId.slice(0, 8)}…`
                                  : row.title}
                            </div>
                            <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {row.campaignName && (
                                <span className="truncate max-w-[140px]">{row.campaignName}</span>
                              )}
                              {archived && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zinc-500/10 border border-zinc-500/30 text-[8px] text-zinc-400">
                                  Archived
                                </span>
                              )}
                              {row.isUnattributed && (
                                <span className="text-amber-600/80 normal-case tracking-normal">
                                  unresolved facts
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {PROMOTION_METRIC_COLUMNS.map(key => (
                          <td
                            key={key}
                            className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums"
                          >
                            {formatMetricCell(key, (row.metrics as any)[key])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
