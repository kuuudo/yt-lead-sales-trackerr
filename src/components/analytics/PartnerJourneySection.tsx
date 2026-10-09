// ─────────────────────────────────────────────────────────────────────────────
// PartnerJourneySection.tsx
// Lower section of Partner Analytics (/analytics/partners): the Journey list
// from JourneyAnalytics, scoped by the partners checked in the table above.
//
// • DATA: reuses JourneyAnalytics' own loader (loadJourneyDataset) and filter
//   function (filterJourneys), so membership (org content universe + singleton
//   [Video] rows), full-path rendering and filter semantics are identical.
//   Nothing here re-implements attribution, asset classification or revenue.
// • PARTNER SYNC: selection lives in PartnerAnalytics (single source of truth).
//   Checking a partner there adds it here; removing a chip here unchecks it
//   there. Nothing is copied into a second state.
// • PAGING: first PAGE_SIZE journeys render, "Show more" reveals the rest.
//   All filtering/counting runs on the full list; only rendering is windowed.
// • Date range follows the page-level range selector (not duplicated here).
//
// PARTNER → JOURNEY ADAPTER (see partnerOwnerIds below): a partner id is
// matched against videos.user_id of ANY step on the path (content owner), the
// same field the Content Marketer filter uses. The partner source in
// PartnerAnalytics is still preview data, so real matching starts working when
// partner ids become real user ids. Change only that adapter if the real
// sponsor/marketer relation turns out to be different.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronDown, ChevronLeft, Check, Filter, Loader2, Maximize2, X } from 'lucide-react';

import { useAuth } from '../../lib/auth';
import { useViewing } from '../../lib/ViewingContext';
import { useOrganization } from '../../lib/useOrganization';
import { PLATFORM_CONFIG, type Platform } from '../../lib/platformParser';
import {
  TABLE_COLUMNS,
  COLUMN_LABELS,
  type CustomDateRange,
  type DateRange,
  type MetricType,
  type RevenueView,
} from '../../lib/analyticsEngine';
import {
  ASSET_TYPE_OPTIONS,
  SCOPE_OPTIONS,
  filterJourneys,
  journeyPromotedTypes,
  TypeCell,
  JOURNEY_ANALYTICS_EXTRA,
  loadJourneyDataset,
  stepsForJourney,
  usePromotionOptions,
  useCampaignOptions,
  type JourneyDataset,
} from '../../pages/JourneyAnalytics';
import { AnalyticsMobileFilterSheet } from '../../pages/analytics-lego/AnalyticsMobileFilterSheet';
import JourneyStrip from './JourneyStrip';

export const JOURNEY_PAGE_SIZE = 20;
const EMPTY_DISPLAY: JourneyDataset['videoDisplay'] = new Map();
const EMPTY_JOURNEYS: JourneyDataset['journeys'] = [];

export type PartnerJourneyPartner = { id: string; name: string; color: string };
export type PartnerJourneyRange = '7days' | '15days' | '30days' | '6months' | '1year' | 'all' | 'custom';

type Props = {
  mode: 'marketer' | 'sponsor';
  /** Every partner in the table (for names / colours). */
  partners: PartnerJourneyPartner[];
  /** Checked partners — owned by PartnerAnalytics. */
  selectedIds: string[];
  onTogglePartner: (id: string) => void;
  onClearPartners: () => void;
  range: PartnerJourneyRange;
  customStart: string;
  customEnd: string;
  labels: {
    title: string;
    hint: string;
    allPartners: string;
    scopedTo: string;
    removePartner: string;
    filters: string;
    clear: string;
    showMore: string;
    showing: string;
    of: string;
    loading: string;
    empty: string;
    showOwner: string;
    hideOwner: string;
    done: string;
    allPlatforms: string;
    assetType: string;
    assetScope: string;
    promotion: string;
    assetCampaign: string;
    contentCampaign: string;
    campaign: string;
    allCampaigns: string;
    partner: string;
    addPartner: string;
    rangeLabel: string;
    truncated: string;
  };
};

/** Page-level range → JourneyAnalytics DateRange (+custom bounds when needed). */
function resolveRange(
  range: PartnerJourneyRange,
  customStart: string,
  customEnd: string,
): { dateRange: DateRange; customRange: CustomDateRange | null } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (range) {
    case '7days':
    case '30days':
    case '6months':
    case '1year':
    case 'all':
      return { dateRange: range as DateRange, customRange: null };
    case '15days': {
      const end = new Date();
      const start = new Date(end.getTime() - 14 * 86_400_000);
      return { dateRange: 'custom', customRange: { start: iso(start), end: iso(end) } as CustomDateRange };
    }
    default:
      return customStart && customEnd
        ? { dateRange: 'custom', customRange: { start: customStart, end: customEnd } as CustomDateRange }
        : { dateRange: 'all', customRange: null };
  }
}

/** THE partner → journey adapter. Empty array = no partner scoping. */
function partnerOwnerIds(_mode: 'marketer' | 'sponsor', selectedIds: string[]): string[] {
  return selectedIds;
}

function useIsDesktop(): boolean {
  const q = '(min-width: 1024px)';
  const [v, setV] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(q).matches));
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setV(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return v;
}

function MultiPick({
  label,
  allLabel,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  allLabel: string;
  options: Array<{ id: string; name: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">{label}</label>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest truncate ${
            open ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          <span className="truncate">{selected.length === 0 ? allLabel : `${selected.length} Selected`}</span>
          <ChevronDown size={11} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50">
            <button
              type="button"
              onClick={onClear}
              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 border-b border-zinc-800"
            >
              {selected.length === 0 ? <Check size={11} className="text-red-500" /> : <span className="w-[11px]" />}
              {allLabel}
            </button>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onToggle(o.id)}
                className="w-full flex items-center gap-2 text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 truncate"
              >
                {selected.includes(o.id) ? (
                  <Check size={11} className="shrink-0 text-red-500" />
                ) : (
                  <span className="w-[11px] shrink-0" />
                )}
                <span className="truncate">{o.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PartnerJourneySection({
  mode,
  partners,
  selectedIds,
  onTogglePartner,
  onClearPartners,
  range,
  customStart,
  customEnd,
  labels,
}: Props) {
  const { user } = useAuth();
  const { viewingMemberId, viewingOrgId, isReadOnly } = useViewing();
  const { organizationId: hookOrgId } = useOrganization();
  const effectiveOrgId = isReadOnly ? (viewingOrgId ?? null) : (hookOrgId ?? null);
  const effectiveViewerId = isReadOnly ? viewingMemberId : (user?.id ?? null);
  const campaignOptions = useCampaignOptions(effectiveViewerId);
  const isDesktop = useIsDesktop();

  // ── Load lazily: only once the section is near the viewport ──────────────
  const rootRef = useRef<HTMLElement>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || armed) return;
    if (typeof IntersectionObserver === 'undefined') {
      setArmed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);

  const [dataset, setDataset] = useState<JourneyDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const ds = await loadJourneyDataset(effectiveOrgId, effectiveOrgId, () => cancelled);
        if (!cancelled && ds) setDataset(ds);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [armed, effectiveOrgId]);

  // ── Local (non-partner) filters ──────────────────────────────────────────
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [assetSource, setAssetSource] = useState<'all' | 'my' | 'shared' | 'assigned'>('all');
  const [promotionIds, setPromotionIds] = useState<string[]>([]);
  const [assetCampaignIds, setAssetCampaignIds] = useState<string[]>([]);
  const [contentCampaignIds, setContentCampaignIds] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState('all');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showOwner, setShowOwner] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Full screen: Esc closes, background scroll locked.
  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullScreen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [fullScreen]);
  const toggle = (id: string, list: string[], set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const journeys = dataset?.journeys ?? EMPTY_JOURNEYS;
  const display = dataset?.videoDisplay ?? EMPTY_DISPLAY;

  const loadedPromotionIds = useMemo(() => {
    const ids = new Set<string>();
    display.forEach((d) => {
      if (d.isAsset) d.promotionIds.forEach((p) => ids.add(p));
    });
    return Array.from(ids).sort();
  }, [display]);
  const promotionOptions = usePromotionOptions(loadedPromotionIds);

  const presentPlatforms = useMemo(() => {
    const s = new Set<string>();
    display.forEach((v) => s.add(v.platform ?? 'youtube'));
    return Array.from(s).sort();
  }, [display]);

  const assetTypeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    display.forEach((v) => {
      if (v.isAsset && v.assetTypeTag) c[v.assetTypeTag] = (c[v.assetTypeTag] ?? 0) + 1;
    });
    return c;
  }, [display]);

  const { dateRange, customRange } = useMemo(
    () => resolveRange(range, customStart, customEnd),
    [range, customStart, customEnd],
  );

  const ownerIds = useMemo(() => partnerOwnerIds(mode, selectedIds), [mode, selectedIds]);

  const visible = useMemo(
    () =>
      filterJourneys(journeys, display, {
        selectedVideoId,
        platforms,
        contentOwnerIds: ownerIds,
        campaignId,
        contentCampaignIds,
        assetCampaignIds,
        promotionIds,
        assetTypes,
        creativeScope: null,
        viewerId: user?.id ?? null,
        assetSource,
        dateRange,
        customRange,
      }),
    [
      journeys,
      display,
      selectedVideoId,
      platforms,
      ownerIds,
      campaignId,
      contentCampaignIds,
      assetCampaignIds,
      promotionIds,
      assetTypes,
      assetSource,
      dateRange,
      customRange,
      user?.id,
    ],
  );

  // Paging: first PAGE_SIZE, then everything on "Show more". Reset on any change.
  const [revealAll, setRevealAll] = useState(false);
  useEffect(() => setRevealAll(false), [visible]);
  const shown = revealAll ? visible : visible.slice(0, JOURNEY_PAGE_SIZE);
  const hidden = visible.length - shown.length;

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const unselectedPartners = partners.filter((p) => !selectedIds.includes(p.id));
  const activeLocalFilters =
    platforms.length +
    assetTypes.length +
    promotionIds.length +
    assetCampaignIds.length +
    contentCampaignIds.length +
    (assetSource !== 'all' ? 1 : 0) +
    (campaignId !== 'all' ? 1 : 0);

  const clearLocal = () => {
    setPlatforms([]);
    setAssetTypes([]);
    setPromotionIds([]);
    setAssetCampaignIds([]);
    setContentCampaignIds([]);
    setAssetSource('all');
    setCampaignId('all');
    setSelectedVideoId(null);
  };

  const pill = (active: boolean) =>
    `h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
      active
        ? 'bg-red-600 border-red-600 text-white'
        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
    }`;

  const filtersBody = (
    <div className="space-y-6">
      {/* Partner scope — mirrors the table selection above (same state). */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">
          {labels.partner}
        </label>
        <div className="flex flex-wrap gap-2">
          {selectedIds.length === 0 && (
            <span className="text-[10px] font-bold text-zinc-600">{labels.allPartners}</span>
          )}
          {selectedIds.map((id) => {
            const p = partnerById.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-[11px] font-bold text-zinc-300"
              >
                <span className="w-2 h-2 rounded-sm" style={{ background: p?.color ?? '#71717a' }} />
                {p?.name ?? id}
                <button
                  type="button"
                  onClick={() => onTogglePartner(id)}
                  aria-label={`${labels.removePartner} ${p?.name ?? id}`}
                  className="p-0.5 rounded text-zinc-500 hover:text-white"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
        {unselectedPartners.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && onTogglePartner(e.target.value)}
            className="mt-2 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 outline-none focus:border-red-600"
          >
            <option value="">{labels.addPartner}</option>
            {unselectedPartners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">
          {labels.campaign}
        </label>
        <select
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 outline-none focus:border-red-600"
        >
          <option value="all">{labels.allCampaigns}</option>
          {campaignOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.campaign_name}
            </option>
          ))}
        </select>
      </div>

      <MultiPick
        label={labels.assetCampaign}
        allLabel={labels.allCampaigns}
        options={campaignOptions.map((c) => ({ id: c.id, name: c.campaign_name }))}
        selected={assetCampaignIds}
        onToggle={(id) => toggle(id, assetCampaignIds, setAssetCampaignIds)}
        onClear={() => setAssetCampaignIds([])}
      />
      <MultiPick
        label={labels.contentCampaign}
        allLabel={labels.allCampaigns}
        options={campaignOptions.map((c) => ({ id: c.id, name: c.campaign_name }))}
        selected={contentCampaignIds}
        onToggle={(id) => toggle(id, contentCampaignIds, setContentCampaignIds)}
        onClear={() => setContentCampaignIds([])}
      />
      <MultiPick
        label={labels.promotion}
        allLabel={labels.allCampaigns}
        options={promotionOptions}
        selected={promotionIds}
        onToggle={(id) => toggle(id, promotionIds, setPromotionIds)}
        onClear={() => setPromotionIds([])}
      />

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">
          {labels.assetType}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ASSET_TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value, assetTypes, setAssetTypes)}
              className={pill(assetTypes.includes(o.value))}
            >
              {o.label}
              <span className="ml-1 opacity-70">{assetTypeCounts[o.value] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">
          {labels.assetScope}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SCOPE_OPTIONS.map((o) => (
            <button key={o.value} type="button" onClick={() => setAssetSource(o.value)} className={pill(assetSource === o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {(activeLocalFilters > 0 || selectedVideoId) && (
        <button
          type="button"
          onClick={clearLocal}
          className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
        >
          {labels.clear}
        </button>
      )}
    </div>
  );

  const renderStrip = (j: (typeof visible)[number]) => (
    <JourneyStrip
      steps={stepsForJourney(j, display)}
      highlightVideoId={selectedVideoId}
      onSelectVideo={(id: string) => setSelectedVideoId((p) => (p === id ? null : id))}
      showContentOwner={showOwner}
    />
  );

  const thCls =
    'px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap';
  const dashCls = 'px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600 tabular-nums';

  const fullScreenView = fullScreen
    ? createPortal(
        <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
          {/* Sidebar: static on lg so it PUSHES the content */}
          <aside
            className={`${
              sidebarOpen ? 'hidden lg:flex' : 'hidden'
            } w-80 bg-zinc-950 border-r border-zinc-900 flex-col shrink-0 fixed inset-y-0 left-0 z-50 lg:static`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 shrink-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{labels.filters}</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
                aria-label="Close filters"
              >
                <X size={16} />
              </button>
            </div>
            {sidebarOpen && <div className="flex-1 overflow-y-auto px-6 py-6">{filtersBody}</div>}
          </aside>

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <AnalyticsMobileFilterSheet open={sheetOpen} onOpenChange={setSheetOpen}>
              {filtersBody}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="w-full py-3 rounded-xl bg-red-600 text-white text-[11px] font-black uppercase tracking-widest"
                >
                  {labels.done} · {visible.length}
                </button>
              </div>
            </AnalyticsMobileFilterSheet>

            <header className="shrink-0 border-b border-zinc-900 bg-zinc-950 px-4 lg:px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setFullScreen(false)}
                    className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all"
                    aria-label="Back"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => (isDesktop ? setSidebarOpen((o) => !o) : setSheetOpen(true))}
                    className={`p-3 border rounded-2xl transition-all ${
                      sidebarOpen && isDesktop
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Filter size={20} />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-xl lg:text-2xl font-black text-white uppercase tracking-tight">{labels.title}</h2>
                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
                      {selectedIds.length === 0
                        ? labels.allPartners
                        : selectedIds.map((id) => partnerById.get(id)?.name ?? id).join(', ')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                    {(['total', 'pixel', 'stripe'] as RevenueView[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setActiveSource(v)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                          activeSource === v ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOwner((v) => !v)}
                    className={`h-9 px-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                      showOwner
                        ? 'bg-zinc-700 border-zinc-600 text-white'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {showOwner ? labels.hideOwner : labels.showOwner}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAnalytics((v) => !v)}
                    className={`h-9 px-4 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                      showAnalytics
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-600'
                    }`}
                  >
                    <BarChart3 size={14} />
                    {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => setPlatforms([])} className={pill(platforms.length === 0)}>
                    {labels.allPlatforms}
                    <span className="ml-1.5 text-[8px] opacity-70">{journeys.length}</span>
                  </button>
                  {presentPlatforms.map((p) => {
                    const cfg = PLATFORM_CONFIG[p as Platform];
                    const active = platforms.includes(p);
                    const color = cfg?.color ?? '#dc2626';
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggle(p, platforms, setPlatforms)}
                        style={active ? { backgroundColor: color, borderColor: color } : {}}
                        className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                          active ? 'text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                        }`}
                      >
                        {cfg?.icon ? <span className="mr-1 opacity-70">{cfg.icon}</span> : null}
                        {cfg?.label ?? p}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
                  Rows {journeys.length} · Showing {visible.length}
                  {dataset?.truncated && <span className="text-amber-600"> · {labels.truncated}</span>}
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-auto">
              {(!armed || loading) && (
                <div className="py-20 text-center">
                  <Loader2 className="animate-spin text-red-600 mx-auto" size={32} aria-hidden />
                  <div className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mt-4">{labels.loading}</div>
                </div>
              )}
              {armed && !loading && error && (
                <div className="py-20 text-center text-[11px] font-black uppercase tracking-widest text-red-500">{error}</div>
              )}
              {armed && !loading && !error && visible.length === 0 && (
                <div className="py-20 text-center text-[11px] font-black uppercase tracking-widest text-zinc-600">
                  {labels.empty}
                </div>
              )}

              {armed && !loading && !error && visible.length > 0 && !showAnalytics && (
                <div className="px-4 lg:px-6 py-4 space-y-2">
                  {visible.map((j) => (
                    <div key={j.journeyId} className="rounded-xl border border-zinc-900 bg-zinc-950/80 px-2 py-1.5">
                      <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5 px-0.5">
                        Journey · {j.journeyId.slice(0, 8)}…
                      </div>
                      {renderStrip(j)}
                    </div>
                  ))}
                </div>
              )}

              {armed && !loading && !error && visible.length > 0 && showAnalytics && (
                <div className="inline-block min-w-full align-middle">
                  <table className="min-w-full divide-y divide-zinc-900 border-collapse">
                    <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
                      <tr>
                        <th className={`${thCls} min-w-[320px] sticky left-0 z-30`}>Journey Map</th>
                        {JOURNEY_ANALYTICS_EXTRA.map((col) => (
                          <th key={col.key} className={thCls}>
                            {col.label}
                          </th>
                        ))}
                        {TABLE_COLUMNS.map((key) => (
                          <th key={key} className={thCls}>
                            {COLUMN_LABELS[key as MetricType] ?? key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-black divide-y divide-zinc-900">
                      {visible.map((j) => (
                        <tr key={j.journeyId} className="hover:bg-zinc-950/80 transition-colors group">
                          <td className="px-3 py-3 sticky left-0 z-10 bg-black group-hover:bg-zinc-950 transition-colors min-w-[320px] max-w-[480px]">
                            <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5">
                              {j.journeyId.slice(0, 8)}…
                            </div>
                            {renderStrip(j)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <TypeCell types={journeyPromotedTypes(j, display)} />
                          </td>
                          {/* promotion, asset campaign, content campaign, clicks, downstream, revenue (placeholders, same as JourneyAnalytics) */}
                          {JOURNEY_ANALYTICS_EXTRA.slice(1).map((c) => (
                            <td key={c.key} className={dashCls}>
                              —
                            </td>
                          ))}
                          {TABLE_COLUMNS.map((key) => (
                            <td key={key} className={dashCls}>
                              —
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <section ref={rootRef} className="flex flex-col gap-3" aria-label={labels.title}>
      {/* Title + context */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-white uppercase tracking-tight">{labels.title}</h3>
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">{labels.hint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowOwner((v) => !v)}
            className={`h-9 px-3 rounded-xl border text-[9px] font-black uppercase tracking-widest ${
              showOwner
                ? 'bg-zinc-700 border-zinc-600 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {showOwner ? labels.hideOwner : labels.showOwner}
          </button>

          <button
            type="button"
            onClick={() => {
              setArmed(true);
              setFullScreen(true);
            }}
            className="h-9 px-3 rounded-xl border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-300 hover:text-white flex items-center gap-1.5"
          >
            <Maximize2 size={13} />
            Full screen
          </button>

          <button
            type="button"
            onClick={() => {
              if (isDesktop) setPanelOpen((o) => !o);
              else setSheetOpen(true);
            }}
            className={`h-9 px-3 rounded-xl border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
              panelOpen && isDesktop
                ? 'bg-red-600 border-red-600 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
            }`}
          >
            <Filter size={13} />
            {labels.filters}
            {activeLocalFilters > 0 && <span className="opacity-70">({activeLocalFilters})</span>}
          </button>
        </div>
      </div>

      {/* Scope banner: which partners this list is for */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-zinc-950 border border-zinc-900 rounded-2xl">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">{labels.scopedTo}</span>
        {selectedIds.length === 0 ? (
          <span className="text-[11px] font-bold text-zinc-400">{labels.allPartners}</span>
        ) : (
          <>
            {selectedIds.map((id) => {
              const p = partnerById.get(id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-[11px] font-bold text-zinc-300"
                >
                  <span className="w-2 h-2 rounded-sm" style={{ background: p?.color ?? '#71717a' }} />
                  {p?.name ?? id}
                  <button
                    type="button"
                    onClick={() => onTogglePartner(id)}
                    aria-label={`${labels.removePartner} ${p?.name ?? id}`}
                    className="p-0.5 rounded text-zinc-500 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={onClearPartners}
              className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
            >
              {labels.clear}
            </button>
          </>
        )}
        <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-zinc-600">
          {labels.rangeLabel}
          {dataset?.truncated && <span className="text-amber-600"> · {labels.truncated}</span>}
        </span>
      </div>

      {/* Platform pills (same as JourneyAnalytics header row) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setPlatforms([])} className={pill(platforms.length === 0)}>
          {labels.allPlatforms}
          <span className="ml-1.5 text-[8px] opacity-70">{visible.length}</span>
        </button>
        {presentPlatforms.map((p) => {
          const cfg = PLATFORM_CONFIG[p as Platform];
          const active = platforms.includes(p);
          const color = cfg?.color ?? '#dc2626';
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p, platforms, setPlatforms)}
              style={active ? { backgroundColor: color, borderColor: color } : {}}
              className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                active ? 'text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
              }`}
            >
              {cfg?.icon ? <span className="mr-1 opacity-70">{cfg.icon}</span> : null}
              {cfg?.label ?? p}
            </button>
          );
        })}
      </div>

      {/* Desktop inline filter panel */}
      {isDesktop && panelOpen && (
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">{filtersBody}</div>
      )}

      {/* Mobile filter sheet — same LEGO JourneyAnalytics uses */}
            {!isDesktop && !fullScreen && (
        <AnalyticsMobileFilterSheet open={sheetOpen} onOpenChange={setSheetOpen}>
          {filtersBody}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="w-full py-3 rounded-xl bg-red-600 text-white text-[11px] font-black uppercase tracking-widest"
            >
              {labels.done} · {visible.length}
            </button>
          </div>
        </AnalyticsMobileFilterSheet>
      )}

      {/* Rows */}
      {(!armed || loading) && (
        <div className="py-16 text-center">
          <Loader2 className="animate-spin text-red-600 mx-auto" size={28} aria-hidden />
          <div className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mt-3">{labels.loading}</div>
        </div>
      )}

      {armed && !loading && error && (
        <div className="py-12 text-center text-[11px] font-black uppercase tracking-widest text-red-500">
          {error}
        </div>
      )}

      {armed && !loading && !error && visible.length === 0 && (
        <div className="py-12 text-center text-[11px] font-black uppercase tracking-widest text-zinc-600">
          {labels.empty}
        </div>
      )}

      {armed && !loading && !error && visible.length > 0 && (
        <>
          <div className="space-y-2">
            {shown.map((j) => (
              <div key={j.journeyId} className="rounded-xl border border-zinc-900 bg-zinc-950/80 px-2 py-1.5 overflow-x-auto">
                <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5 px-0.5">
                  Journey · {j.journeyId.slice(0, 8)}…
                </div>
                <JourneyStrip
                  steps={stepsForJourney(j, display)}
                  highlightVideoId={selectedVideoId}
                  onSelectVideo={(id: string) => setSelectedVideoId((p) => (p === id ? null : id))}
                  showContentOwner={showOwner}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 py-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">
              {labels.showing} {shown.length} {labels.of} {visible.length}
            </span>
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setRevealAll(true)}
                className="h-9 px-5 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-600"
              >
                {labels.showMore}
                <span className="ml-2 text-zinc-600 normal-case tracking-normal font-bold">({hidden})</span>
              </button>
            )}
          </div>
        </>
      )}
            {fullScreenView}
    </section>
  );
}
