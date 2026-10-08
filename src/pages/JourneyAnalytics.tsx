// ─────────────────────────────────────────────────────────────────────────────
// JourneyAnalytics.tsx
//
// Full-screen shell (same as AllAssetsAnalytics).
// Left filter sidebar — hidden by default, Filter button opens it.
// Journey list = rows. Show Analytics expands metric columns to the RIGHT
// of the Journey Map column (ONE wide table, not a side panel).
//
// Route: /analytics/journey
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronDown,
  Loader2,
  BarChart3,
  X,
  Calendar,
  Filter,
  Briefcase,
  Megaphone,
  User,
  Check,
} from 'lucide-react';

import { Campaign, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useViewing } from '../lib/ViewingContext';
import { resolveThumbnail } from '../lib/videoFormatters';
import {
  getDateBounds,
  TABLE_COLUMNS,
  COLUMN_LABELS,
  type DateRange,
  type CustomDateRange,
  type RevenueView,
  type MetricType,
} from '../lib/analyticsEngine';
import {
  PLATFORM_CONFIG,
  type Platform,
} from '../lib/platformParser';
import {
  discoverJourneysForVideos,
  type DiscoveredJourney,
} from '../lib/journeyDiscovery';
import {
  resolveStructuralLinksForVideos,
  type StructuralLink,
} from '../services/journey/journeyDownstreamResolver';

import JourneyStrip, {
  type JourneyStripStep,
} from '../components/analytics/JourneyStrip';

const ENTRY_VIDEO_CAP = 80;

/** Identity + analytics columns shown when Show Analytics is on (no Asset / Promoting Content / Content Owner). */
const JOURNEY_ANALYTICS_EXTRA = [
  { key: 'type', label: 'Type' },
  { key: 'promotion', label: 'Promotion' },
  { key: 'asset_campaign', label: 'Asset Campaign' },
  { key: 'content_campaign', label: 'Content Campaign' },
  { key: 'asset_clicks', label: 'Asset Clicks' },
  { key: 'downstream', label: 'Downstream' },
  { key: 'total_revenue_front', label: 'Total Revenue ($)' },
] as const;

function elementTypeToWebmood(elementType: string | null | undefined): string | null {
  if (!elementType) return null;
  const t = elementType.toLowerCase();
  if (t === 'sales_call' || t === 'sales') return 'sales_call';
  if (t === 'consultation' || t === 'consult') return 'consultation';
  if (t === 'newsletter' || t === 'news') return 'newsletter';
  if (t === 'landing_page' || t === 'landing' || t === 'purchase' || t === 'direct_purchase')
    return 'landing_page';
  return null;
}

const ASSET_TYPE_OPTIONS = [
  { value: 'campaign_element', label: 'Campaign Element' },
  { value: 'promotional_video', label: 'Promotional Video' },
  { value: 'resource', label: 'Resource' },
  { value: 'content_video', label: 'Content Video' },
] as const;

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'my', label: 'My' },
  { value: 'shared', label: 'Shared' },
  { value: 'assigned', label: 'Assigned' },
] as const;

function useCampaignOptions(viewerId: string | null): Campaign[] {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', viewerId)
      .then(({ data }) => {
        if (!cancelled) setCampaigns(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId]);
  return campaigns;
}

type PromotionOption = { id: string; name: string };

function usePromotionOptions(viewerId: string | null): PromotionOption[] {
  const [promos, setPromos] = useState<PromotionOption[]>([]);
  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    (async () => {
      // Prefer promotions owned by viewer; fall back to any the viewer can read.
      const { data, error } = await supabase
        .from('promotions')
        .select('id, title, name')
        .limit(200);
      if (error || cancelled) {
        if (error) console.warn('[JourneyAnalytics] promotions load', error.message);
        return;
      }
      const list = ((data ?? []) as any[]).map((p) => ({
        id: p.id as string,
        name: (p.title as string) || (p.name as string) || p.id,
      }));
      if (!cancelled) setPromos(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerId]);
  return promos;
}

async function loadCampaignVideoIds(campaignId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('videos')
    .select('id')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(ENTRY_VIDEO_CAP);
  if (error) throw new Error(`Failed to load campaign videos: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

async function loadEntryVideoIds(
  campaignId: string,
  ownedCampaignIds: string[],
): Promise<string[]> {
  if (campaignId !== 'all') return loadCampaignVideoIds(campaignId);
  const ids = ownedCampaignIds.slice(0, 20);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('videos')
    .select('id')
    .in('campaign_id', ids)
    .order('created_at', { ascending: false })
    .limit(ENTRY_VIDEO_CAP);
  if (error) throw new Error(`Failed to load videos: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

type VideoDisplay = {
  title: string;
  thumbnailUrl: string | null;
  platform: string | null;
  campaignId: string | null;
  createdAt: string | null;
  userId: string | null;
  promotedTypes: Set<string>;
};

async function loadVideoDisplayMap(videoIds: string[]): Promise<Map<string, VideoDisplay>> {
  const map = new Map<string, VideoDisplay>();
  const ids = Array.from(new Set(videoIds.filter(Boolean)));
  if (ids.length === 0) return map;
  const CHUNK = 80;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('videos').select('*').in('id', slice);
    if (error) throw new Error(`Failed to load video display data: ${error.message}`);
    for (const v of (data ?? []) as any[]) {
      map.set(v.id, {
        title: (v.video_title as string) || 'Untitled video',
        thumbnailUrl: resolveThumbnail(v) ?? null,
        platform: (v.platform as string | null) ?? null,
        campaignId: (v.campaign_id as string | null) ?? null,
        createdAt: (v.created_at as string | null) ?? null,
        userId: (v.user_id as string | null) ?? null,
        promotedTypes: new Set(),
      });
    }
  }
  return map;
}

function applyPromotedTypes(
  display: Map<string, VideoDisplay>,
  links: StructuralLink[],
): Map<string, VideoDisplay> {
  const next = new Map(display);
  for (const link of links) {
    if (link.resolution === 'legacy') continue;
    const key = elementTypeToWebmood(link.elementType);
    if (!key) continue;
    const existing = next.get(link.videoId);
    if (!existing) {
      next.set(link.videoId, {
        title: `Video ${link.videoId.slice(0, 8)}…`,
        thumbnailUrl: null,
        platform: null,
        campaignId: link.ownerCampaignId ?? null,
        createdAt: null,
        userId: null,
        promotedTypes: new Set([key]),
      });
      continue;
    }
    const types = new Set(existing.promotedTypes);
    types.add(key);
    next.set(link.videoId, { ...existing, promotedTypes: types });
  }
  return next;
}

function stepsForJourney(
  journey: DiscoveredJourney,
  display: Map<string, VideoDisplay>,
): JourneyStripStep[] {
  return (journey.path?.steps ?? []).map((s) => {
    const d = display.get(s.videoId);
    return {
      videoId: s.videoId,
      title: d?.title ?? `Video ${s.videoId.slice(0, 8)}…`,
      thumbnailUrl: d?.thumbnailUrl ?? null,
      platform: d?.platform ?? null,
      promotedTypes: d?.promotedTypes ?? new Set(),
    };
  });
}

/** Aggregate WebMood types across all steps in a journey (for Type column). */
function journeyPromotedTypes(
  journey: DiscoveredJourney,
  display: Map<string, VideoDisplay>,
): Set<string> {
  const out = new Set<string>();
  for (const s of journey.path?.steps ?? []) {
    const t = display.get(s.videoId)?.promotedTypes;
    t?.forEach((k) => out.add(k));
  }
  return out;
}

const WEBMOOD_CELLS = [
  { type: 'sales_call', label: 'SALES' },
  { type: 'consultation', label: 'CONSULT' },
  { type: 'newsletter', label: 'NEWS' },
  { type: 'landing_page', label: 'PURCHASE' },
] as const;

function TypeCell({ types }: { types: Set<string> }) {
  return (
    <div className="grid grid-cols-2 gap-px w-[88px] h-[44px] rounded-md overflow-hidden border border-zinc-800 bg-zinc-950 shrink-0">
      {WEBMOOD_CELLS.map((cell) => {
        const on = types.has(cell.type);
        return (
          <div
            key={cell.type}
            className={
              on
                ? 'flex items-center justify-center text-[7px] font-black tracking-wider text-orange-400 bg-orange-500/20'
                : 'flex items-center justify-center text-[7px] font-black tracking-wider text-zinc-600 bg-zinc-900/80'
            }
          >
            {cell.label}
          </div>
        );
      })}
    </div>
  );
}

// ── Multi-select panel helper ───────────────────────────────────────────────

function FilterMultiPanel({
  open,
  onClose,
  panelRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, panelRef]);
  if (!open) return null;
  return (
    <div className="absolute left-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-96 overflow-y-auto">
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function JourneyAnalytics() {
  const navigate = useNavigate();
  const { campaignId: paramCampaignId } = useParams<{ campaignId?: string }>();
  const { user } = useAuth();
  const { viewingMemberId, isReadOnly } = useViewing();
  const effectiveViewerId = isReadOnly ? viewingMemberId : (user?.id ?? null);

  const campaignOptions = useCampaignOptions(effectiveViewerId);
  const promotionOptions = usePromotionOptions(effectiveViewerId);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    paramCampaignId ?? 'all',
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [selectedAssetSource, setSelectedAssetSource] = useState<
    'all' | 'my' | 'shared' | 'assigned'
  >('all');
  const [selectedContentOwnerId, setSelectedContentOwnerId] = useState<string>('all');
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<string[]>([]);
  const [selectedAssetCampaignIds, setSelectedAssetCampaignIds] = useState<string[]>([]);
  const [selectedContentCampaignIds, setSelectedContentCampaignIds] = useState<string[]>([]);
  const [hideArchivedAsset, setHideArchivedAsset] = useState(false);
  const [hideArchivedContent, setHideArchivedContent] = useState(false);
  const [hideArchivedCampaign, setHideArchivedCampaign] = useState(false);
  const [hideArchivedPromotion, setHideArchivedPromotion] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Dropdown open state
  const [assetCampaignOpen, setAssetCampaignOpen] = useState(false);
  const [contentCampaignOpen, setContentCampaignOpen] = useState(false);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const assetCampaignRef = useRef<HTMLDivElement>(null);
  const contentCampaignRef = useRef<HTMLDivElement>(null);
  const promotionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paramCampaignId) setSelectedCampaignId(paramCampaignId);
  }, [paramCampaignId]);

  // ── Journey load ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<DiscoveredJourney[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [excludedJourneys, setExcludedJourneys] = useState(0);
  const [entryVideoCount, setEntryVideoCount] = useState(0);
  const [videoDisplay, setVideoDisplay] = useState<Map<string, VideoDisplay>>(new Map());

  const ownedCampaignIds = useMemo(
    () => campaignOptions.map((c) => c.id),
    [campaignOptions],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setJourneys([]);
    setSelectedVideoId(null);

    (async () => {
      try {
        const videoIds = await loadEntryVideoIds(selectedCampaignId, ownedCampaignIds);
        if (cancelled) return;
        setEntryVideoCount(videoIds.length);

        if (videoIds.length === 0) {
          setJourneys([]);
          setVideoDisplay(new Map());
          setTruncated(false);
          setExcludedJourneys(0);
          return;
        }

        const [discovery, structuralLinks] = await Promise.all([
          discoverJourneysForVideos(videoIds),
          resolveStructuralLinksForVideos(videoIds).catch((e) => {
            console.warn('[JourneyAnalytics] structural resolution failed', e);
            return [] as StructuralLink[];
          }),
        ]);
        if (cancelled) return;

        const stepVideoIds = discovery.journeys.flatMap((j) =>
          (j.path?.steps ?? []).map((s) => s.videoId),
        );
        const extraIds = stepVideoIds.filter((id) => !videoIds.includes(id));
        let allLinks = structuralLinks;
        if (extraIds.length > 0) {
          const extraLinks = await resolveStructuralLinksForVideos(extraIds).catch(
            () => [] as StructuralLink[],
          );
          allLinks = [...structuralLinks, ...extraLinks];
        }

        let display = await loadVideoDisplayMap([...videoIds, ...stepVideoIds]);
        if (cancelled) return;
        display = applyPromotedTypes(display, allLinks);

        setJourneys(discovery.journeys);
        setTruncated(discovery.truncated);
        setExcludedJourneys(discovery.excludedJourneys);
        setVideoDisplay(display);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
          setJourneys([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCampaignId, ownedCampaignIds.join(',')]);

  const presentPlatforms = useMemo(() => {
    const seen = new Set<string>();
    videoDisplay.forEach((v) => seen.add(v.platform ?? 'youtube'));
    return Array.from(seen).sort();
  }, [videoDisplay]);

  const contentMarketers = useMemo(() => {
    const byId = new Map<string, string>();
    videoDisplay.forEach((v) => {
      if (!v.userId) return;
      if (!byId.has(v.userId)) byId.set(v.userId, v.userId.slice(0, 8));
    });
    return Array.from(byId.entries()).map(([id, label]) => ({ id, label }));
  }, [videoDisplay]);

  const visibleJourneys = useMemo(() => {
    let list = journeys;

    if (selectedVideoId) {
      list = list.filter((j) =>
        (j.path?.steps ?? []).some((s) => s.videoId === selectedVideoId),
      );
    }

    if (selectedPlatforms.length > 0) {
      list = list.filter((j) =>
        (j.path?.steps ?? []).some((s) => {
          const p = videoDisplay.get(s.videoId)?.platform ?? 'youtube';
          return selectedPlatforms.includes(p);
        }),
      );
    }

    if (selectedContentOwnerId !== 'all') {
      list = list.filter((j) =>
        (j.path?.steps ?? []).some(
          (s) => videoDisplay.get(s.videoId)?.userId === selectedContentOwnerId,
        ),
      );
    }

    if (selectedContentCampaignIds.length > 0) {
      list = list.filter((j) =>
        (j.path?.steps ?? []).some((s) => {
          const cid = videoDisplay.get(s.videoId)?.campaignId;
          return cid != null && selectedContentCampaignIds.includes(cid);
        }),
      );
    }

    if (dateRange !== 'all') {
      const { start, end } = getDateBounds(dateRange, customRange);
      list = list.filter((j) =>
        (j.path?.steps ?? []).some((s) => {
          const created = videoDisplay.get(s.videoId)?.createdAt;
          if (!created) return false;
          const t = new Date(created);
          return t >= start && t <= end;
        }),
      );
    }

    return list;
  }, [
    journeys,
    selectedVideoId,
    selectedPlatforms,
    selectedContentOwnerId,
    selectedContentCampaignIds,
    videoDisplay,
    dateRange,
    customRange,
  ]);

  const handleSelectVideo = useCallback((videoId: string) => {
    setSelectedVideoId((prev) => (prev === videoId ? null : videoId));
  }, []);

  const toggleId = (id: string, list: string[], set: (v: string[]) => void) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const sidebarFilters = (
    <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar space-y-8">
      {/* Date Range */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Date Range
        </label>
        <div className="relative">
          <select
            value={dateRange}
            onChange={(e) => {
              const v = e.target.value as DateRange;
              setDateRange(v);
              if (v !== 'custom') setCustomRange(null);
            }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer text-zinc-300"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="2months">Last 2 Months</option>
            <option value="6months">Last 6 Months</option>
            <option value="1year">Last Year</option>
            <option value="all">Lifetime</option>
            <option value="custom">Custom Range</option>
          </select>
          <Calendar
            size={12}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
          />
        </div>
        {dateRange === 'custom' && (
          <div className="mt-2 space-y-2">
            <input
              type="date"
              value={
                customRange?.start
                  ? typeof customRange.start === 'string'
                    ? customRange.start.slice(0, 10)
                    : customRange.start.toISOString().slice(0, 10)
                  : ''
              }
              onChange={(e) =>
                setCustomRange((prev) => ({
                  start: e.target.value,
                  end: prev?.end ?? e.target.value,
                }))
              }
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] text-zinc-300"
            />
            <input
              type="date"
              value={
                customRange?.end
                  ? typeof customRange.end === 'string'
                    ? customRange.end.slice(0, 10)
                    : customRange.end.toISOString().slice(0, 10)
                  : ''
              }
              onChange={(e) =>
                setCustomRange((prev) => ({
                  start: prev?.start ?? e.target.value,
                  end: e.target.value,
                }))
              }
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] text-zinc-300"
            />
          </div>
        )}
      </div>

      {/* Campaign */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Campaign
        </label>
        <div className="relative">
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer text-zinc-300"
          >
            <option value="all">All Campaigns</option>
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaign_name}
              </option>
            ))}
          </select>
          <Briefcase
            size={12}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
          />
        </div>
      </div>

      {/* Asset Campaign — working multi-select panel */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Asset Campaign
        </label>
        <div className="relative" ref={assetCampaignRef}>
          <button
            type="button"
            onClick={() => {
              setAssetCampaignOpen((o) => !o);
              setContentCampaignOpen(false);
              setPromotionOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all truncate ${
              assetCampaignOpen
                ? 'bg-zinc-800 border-zinc-700 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              <Briefcase size={12} className="shrink-0 text-zinc-600" />
              <span className="truncate">
                {selectedAssetCampaignIds.length === 0
                  ? 'All Asset Campaigns'
                  : `${selectedAssetCampaignIds.length} Selected`}
              </span>
            </span>
            <ChevronDown
              size={11}
              className={`shrink-0 transition-transform ${assetCampaignOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <FilterMultiPanel
            open={assetCampaignOpen}
            onClose={() => setAssetCampaignOpen(false)}
            panelRef={assetCampaignRef}
          >
            <button
              type="button"
              onClick={() => setSelectedAssetCampaignIds([])}
              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 border-b border-zinc-800"
            >
              {selectedAssetCampaignIds.length === 0 ? (
                <Check size={11} className="shrink-0 text-red-500" />
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              All Asset Campaigns
            </button>
            {campaignOptions.map((c) => {
              const on = selectedAssetCampaignIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    toggleId(c.id, selectedAssetCampaignIds, setSelectedAssetCampaignIds)
                  }
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 truncate"
                >
                  {on ? (
                    <Check size={11} className="shrink-0 text-red-500" />
                  ) : (
                    <span className="w-[11px] shrink-0" />
                  )}
                  <span className="truncate">{c.campaign_name}</span>
                </button>
              );
            })}
          </FilterMultiPanel>
        </div>
      </div>

      {/* Content Campaign — working multi-select */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Content Campaign
        </label>
        <div className="relative" ref={contentCampaignRef}>
          <button
            type="button"
            onClick={() => {
              setContentCampaignOpen((o) => !o);
              setAssetCampaignOpen(false);
              setPromotionOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all truncate ${
              contentCampaignOpen
                ? 'bg-zinc-800 border-zinc-700 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              <Briefcase size={12} className="shrink-0 text-zinc-600" />
              <span className="truncate">
                {selectedContentCampaignIds.length === 0
                  ? 'All Content Campaigns'
                  : `${selectedContentCampaignIds.length} Selected`}
              </span>
            </span>
            <ChevronDown
              size={11}
              className={`shrink-0 transition-transform ${contentCampaignOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <FilterMultiPanel
            open={contentCampaignOpen}
            onClose={() => setContentCampaignOpen(false)}
            panelRef={contentCampaignRef}
          >
            <button
              type="button"
              onClick={() => setSelectedContentCampaignIds([])}
              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 border-b border-zinc-800"
            >
              {selectedContentCampaignIds.length === 0 ? (
                <Check size={11} className="shrink-0 text-red-500" />
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              All Content Campaigns
            </button>
            {campaignOptions.map((c) => {
              const on = selectedContentCampaignIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    toggleId(c.id, selectedContentCampaignIds, setSelectedContentCampaignIds)
                  }
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 truncate"
                >
                  {on ? (
                    <Check size={11} className="shrink-0 text-red-500" />
                  ) : (
                    <span className="w-[11px] shrink-0" />
                  )}
                  <span className="truncate">{c.campaign_name}</span>
                </button>
              );
            })}
          </FilterMultiPanel>
        </div>
      </div>

      {/* Promotion — working multi-select */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Promotion
        </label>
        <div className="relative" ref={promotionRef}>
          <button
            type="button"
            onClick={() => {
              setPromotionOpen((o) => !o);
              setAssetCampaignOpen(false);
              setContentCampaignOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all truncate ${
              promotionOpen
                ? 'bg-zinc-800 border-zinc-700 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              <Megaphone size={12} className="shrink-0 text-zinc-600" />
              <span className="truncate">
                {selectedPromotionIds.length === 0
                  ? 'All Promotions'
                  : `${selectedPromotionIds.length} Selected`}
              </span>
            </span>
            <ChevronDown
              size={11}
              className={`shrink-0 transition-transform ${promotionOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <FilterMultiPanel
            open={promotionOpen}
            onClose={() => setPromotionOpen(false)}
            panelRef={promotionRef}
          >
            <button
              type="button"
              onClick={() => setSelectedPromotionIds([])}
              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 border-b border-zinc-800"
            >
              {selectedPromotionIds.length === 0 ? (
                <Check size={11} className="shrink-0 text-red-500" />
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              All Promotions
            </button>
            {promotionOptions.length === 0 && (
              <div className="px-4 py-3 text-[10px] text-zinc-600">No promotions loaded</div>
            )}
            {promotionOptions.map((p) => {
              const on = selectedPromotionIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleId(p.id, selectedPromotionIds, setSelectedPromotionIds)}
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 truncate"
                >
                  {on ? (
                    <Check size={11} className="shrink-0 text-red-500" />
                  ) : (
                    <span className="w-[11px] shrink-0" />
                  )}
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </FilterMultiPanel>
        </div>
      </div>

      {/* Content Marketer */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Content Marketer
        </label>
        <div className="relative">
          <select
            value={selectedContentOwnerId}
            onChange={(e) => setSelectedContentOwnerId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer text-zinc-300"
          >
            <option value="all">All Content Marketers</option>
            {contentMarketers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <User
            size={12}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
          />
        </div>
      </div>

      {/* Asset Type — toggles (state kept for upcoming metrics wiring) */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Asset Type
        </label>
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPE_OPTIONS.map((o) => {
            const active = selectedAssetTypes.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() =>
                  setSelectedAssetTypes((prev) =>
                    prev.includes(o.value)
                      ? prev.filter((x) => x !== o.value)
                      : [...prev, o.value],
                  )
                }
                className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${
                  active
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Asset Scope */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Asset Scope
        </label>
        <div className="flex gap-1.5">
          {SCOPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setSelectedAssetSource(o.value)}
              className={`flex-1 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                selectedAssetSource === o.value
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hide Archived */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Hide Archived
        </label>
        <div className="space-y-2">
          {(
            [
              { key: 'asset', label: 'Asset', value: hideArchivedAsset, set: setHideArchivedAsset },
              {
                key: 'content',
                label: 'Content',
                value: hideArchivedContent,
                set: setHideArchivedContent,
              },
              {
                key: 'campaign',
                label: 'Campaign',
                value: hideArchivedCampaign,
                set: setHideArchivedCampaign,
              },
              {
                key: 'promotion',
                label: 'Promotion',
                value: hideArchivedPromotion,
                set: setHideArchivedPromotion,
              },
            ] as const
          ).map((row) => (
            <label
              key={row.key}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={row.value}
                onChange={(e) => row.set(e.target.checked)}
                className="rounded border-zinc-700"
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                {row.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Render journey row content ────────────────────────────────────────────
  const renderJourneyStrip = (j: DiscoveredJourney) => (
    <JourneyStrip
      steps={stepsForJourney(j, videoDisplay)}
      highlightVideoId={selectedVideoId}
      onSelectVideo={handleSelectVideo}
    />
  );

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'flex' : 'hidden'
        } w-80 bg-zinc-950 border-r border-zinc-900 flex-col shrink-0 fixed inset-y-0 left-0 z-50 lg:static`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Filters
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
            aria-label="Close filters"
          >
            <X size={16} />
          </button>
        </div>
        {sidebarFilters}
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="shrink-0 border-b border-zinc-900 bg-zinc-950 px-4 lg:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all"
                aria-label="Back"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                title="Sidebar filters"
                onClick={() => setSidebarOpen((o) => !o)}
                className={`p-3 border rounded-2xl transition-all ${
                  sidebarOpen
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <Filter size={20} />
              </button>
              <div className="min-w-0">
                <h2 className="text-xl lg:text-2xl font-black text-white uppercase tracking-tight">
                  Journey Analytics
                </h2>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
                  One row = one journey · Show Analytics expands columns
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
                      activeSource === v
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {selectedVideoId && (
                <button
                  type="button"
                  onClick={() => setSelectedVideoId(null)}
                  className="h-9 px-3 rounded-xl border border-red-600/40 bg-red-600/10 text-[9px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5"
                >
                  Video selected
                  <X size={12} />
                </button>
              )}

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
              <button
                type="button"
                onClick={() => setSelectedPlatforms([])}
                className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                  selectedPlatforms.length === 0
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                All
                <span className="ml-1.5 text-[8px] opacity-70">{journeys.length}</span>
              </button>
              {presentPlatforms.map((p) => {
                const cfg = PLATFORM_CONFIG[p as Platform];
                const active = selectedPlatforms.includes(p);
                const color = cfg?.color ?? '#dc2626';
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setSelectedPlatforms((prev) =>
                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                      )
                    }
                    style={active ? { backgroundColor: color, borderColor: color } : {}}
                    className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                      active
                        ? 'text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                    }`}
                  >
                    {cfg?.icon ? <span className="mr-1 opacity-70">{cfg.icon}</span> : null}
                    {cfg?.label ?? p}
                  </button>
                );
              })}
            </div>
            <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
              Entry {entryVideoCount}
              {entryVideoCount >= ENTRY_VIDEO_CAP ? ' (capped)' : ''} · Journeys {journeys.length}
              {(selectedVideoId ||
                selectedPlatforms.length > 0 ||
                dateRange !== 'all' ||
                selectedContentCampaignIds.length > 0) && (
                <> · Showing {visibleJourneys.length}</>
              )}
              {truncated && <span className="text-amber-600"> · Truncated</span>}
              {excludedJourneys > 0 && (
                <span className="text-zinc-600"> · {excludedJourneys} excluded</span>
              )}
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {loading && (
            <div className="py-20 text-center">
              <Loader2 className="animate-spin text-red-600 mx-auto" size={32} aria-hidden />
              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mt-4">
                Loading journeys…
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="py-20 text-center">
              <div className="text-[11px] font-black uppercase tracking-widest text-red-500">
                Failed to load journeys
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 max-w-md mx-auto">{error}</div>
            </div>
          )}

          {!loading && !error && visibleJourneys.length === 0 && (
            <div className="py-20 text-center">
              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                No journeys match the current filters
              </div>
            </div>
          )}

          {/* COLLAPSED: journey list only */}
          {!loading && !error && visibleJourneys.length > 0 && !showAnalytics && (
            <div className="px-4 lg:px-6 py-4 space-y-2">
              {visibleJourneys.map((j) => (
                <div
                  key={j.journeyId}
                  className="rounded-xl border border-zinc-900 bg-zinc-950/80 px-2 py-1.5"
                >
                  <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5 px-0.5">
                    Journey · {j.journeyId.slice(0, 8)}…
                  </div>
                  {renderJourneyStrip(j)}
                </div>
              ))}
            </div>
          )}

          {/* EXPANDED: one wide table — Journey Map is first column */}
          {!loading && !error && visibleJourneys.length > 0 && showAnalytics && (
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-zinc-900 border-collapse">
                <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
                  <tr>
                    <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[320px] sticky left-0 z-30">
                      Journey Map
                    </th>
                    {JOURNEY_ANALYTICS_EXTRA.map((col) => (
                      <th
                        key={col.key}
                        className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                    {TABLE_COLUMNS.map((key) => (
                      <th
                        key={key}
                        className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap"
                      >
                        {COLUMN_LABELS[key as MetricType] ?? key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-black divide-y divide-zinc-900">
                  {visibleJourneys.map((j) => {
                    const types = journeyPromotedTypes(j, videoDisplay);
                    return (
                      <tr
                        key={j.journeyId}
                        className="hover:bg-zinc-950/80 transition-colors group"
                      >
                        {/* Journey Map — sticky first column */}
                        <td className="px-3 py-3 sticky left-0 z-10 bg-black group-hover:bg-zinc-950 transition-colors min-w-[320px] max-w-[480px]">
                          <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5">
                            {j.journeyId.slice(0, 8)}…
                          </div>
                          {renderJourneyStrip(j)}
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <TypeCell types={types} />
                        </td>

                        {/* Promotion / Asset Campaign / Content Campaign / Asset Clicks / Downstream / Total Revenue front — placeholders */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600">—</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600">—</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600">—</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600 tabular-nums">
                          —
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600">—</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600 tabular-nums">
                          —
                        </td>

                        {/* Engine metric columns — placeholder zeros */}
                        {TABLE_COLUMNS.map((key) => (
                          <td
                            key={key}
                            className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600 tabular-nums"
                          >
                            —
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
