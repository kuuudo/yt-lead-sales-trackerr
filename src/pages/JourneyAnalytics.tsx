// ─────────────────────────────────────────────────────────────────────────────
// JourneyAnalytics.tsx
//
// Layout mirrors AllAssetsAnalytics:
//   fixed inset-0 full-screen shell (sits above app nav, same as All Assets)
//   left filter sidebar — HIDDEN by default, opened via Filter button
//   main area: journey strips + optional analytics placeholder
//
// Route: /analytics/journey
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';

import { Campaign, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useViewing } from '../lib/ViewingContext';
import { resolveThumbnail } from '../lib/videoFormatters';
import {
  getDateBounds,
  type DateRange,
  type CustomDateRange,
  type RevenueView,
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

/** When campaign is "all", use videos from all owned campaigns (still capped). */
async function loadEntryVideoIds(
  campaignId: string,
  ownedCampaignIds: string[],
): Promise<string[]> {
  if (campaignId !== 'all') return loadCampaignVideoIds(campaignId);
  const ids = ownedCampaignIds.slice(0, 20); // bound campaign fan-out
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

// ─────────────────────────────────────────────────────────────────────────────

export default function JourneyAnalytics() {
  const navigate = useNavigate();
  const { campaignId: paramCampaignId } = useParams<{ campaignId?: string }>();
  const { user } = useAuth();
  const { viewingMemberId, isReadOnly } = useViewing();
  const effectiveViewerId = isReadOnly ? viewingMemberId : (user?.id ?? null);

  const campaignOptions = useCampaignOptions(effectiveViewerId);

  // ── Filters (same vocabulary as AllAssetsAnalytics) ───────────────────────
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
  const [hideArchivedAsset, setHideArchivedAsset] = useState(false);
  const [hideArchivedContent, setHideArchivedContent] = useState(false);
  const [hideArchivedCampaign, setHideArchivedCampaign] = useState(false);
  const [hideArchivedPromotion, setHideArchivedPromotion] = useState(false);

  // Sidebar: HIDDEN by default (user request). Filter button opens it.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

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
    videoDisplay,
    dateRange,
    customRange,
  ]);

  const handleSelectVideo = useCallback((videoId: string) => {
    setSelectedVideoId((prev) => (prev === videoId ? null : videoId));
  }, []);

  // ── Sidebar filter block (exact control set / order as AllAssets) ─────────
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
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer"
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

      {/* Asset Campaign — shell (full multi-select lands with analytics table) */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Asset Campaign
        </label>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-[10px] font-bold uppercase tracking-widest text-zinc-400"
        >
          <span className="flex items-center gap-2 truncate">
            <Briefcase size={12} className="shrink-0 text-zinc-600" />
            All Asset Campaigns
          </span>
          <ChevronDown size={11} className="shrink-0" />
        </button>
      </div>

      {/* Content Campaign — shell */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Content Campaign
        </label>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-[10px] font-bold uppercase tracking-widest text-zinc-400"
        >
          <span className="flex items-center gap-2 truncate">
            <Briefcase size={12} className="shrink-0 text-zinc-600" />
            All Content Campaigns
          </span>
          <ChevronDown size={11} className="shrink-0" />
        </button>
      </div>

      {/* Promotion — shell */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Promotion
        </label>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-[10px] font-bold uppercase tracking-widest text-zinc-400"
        >
          <span className="flex items-center gap-2 truncate">
            <Megaphone size={12} className="shrink-0 text-zinc-600" />
            All Promotions
          </span>
          <ChevronDown size={11} className="shrink-0" />
        </button>
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
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer"
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

      {/* Asset Type */}
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

  // ── Shell: same fixed full-screen pattern as AllAssetsAnalytics ───────────
  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      {/* ── Left filter sidebar — hidden until Filter button ─────────────── */}
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

      {/* Mobile backdrop when sidebar open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header — always visible, not under app nav (shell is z-100 full screen) */}
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
                  Horizontal paths · campaign links per video
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* total / pixel / stripe */}
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

          {/* Platform pills + meta (same row pattern as All Assets) */}
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
              {entryVideoCount >= ENTRY_VIDEO_CAP ? ' (capped)' : ''} · Journeys{' '}
              {journeys.length}
              {(selectedVideoId || selectedPlatforms.length > 0 || dateRange !== 'all') && (
                <> · Showing {visibleJourneys.length}</>
              )}
              {truncated && <span className="text-amber-600"> · Truncated</span>}
            </div>
          </div>
        </header>

        {/* Body: journeys (+ analytics panel) */}
        <div
          className={`flex-1 flex min-h-0 ${showAnalytics ? 'flex-col lg:flex-row' : 'flex-col'}`}
        >
          <div
            className={`flex-1 overflow-y-auto custom-scrollbar px-4 lg:px-6 py-4 ${
              showAnalytics ? 'lg:border-r lg:border-zinc-900 lg:max-w-[55%]' : ''
            }`}
          >
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
                <div className="text-[10px] text-zinc-700 mt-2 max-w-md mx-auto">
                  Open filters (funnel icon) or clear platform / video selection.
                </div>
              </div>
            )}

            {!loading && !error && visibleJourneys.length > 0 && (
              <div className="space-y-2">
                {visibleJourneys.map((j) => (
                  <div
                    key={j.journeyId}
                    className="rounded-xl border border-zinc-900 bg-zinc-950/80 px-2 py-1.5"
                  >
                    <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5 px-0.5">
                      Journey · {j.journeyId.slice(0, 8)}…
                    </div>
                    <JourneyStrip
                      steps={stepsForJourney(j, videoDisplay)}
                      highlightVideoId={selectedVideoId}
                      onSelectVideo={handleSelectVideo}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {showAnalytics && (
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 lg:px-6 py-4 bg-zinc-950/40 lg:min-w-[45%]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Analytics
                  </div>
                  <div className="text-xs font-bold text-zinc-300 mt-0.5">
                    Placeholder — table in next patch
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAnalytics(false)}
                  className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-black/40 p-8 text-center">
                <BarChart3 className="mx-auto text-zinc-700 mb-3" size={28} />
                <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                  All Assets–style horizontal table
                </div>
                <div className="text-[10px] text-zinc-700 mt-2 max-w-sm mx-auto leading-relaxed">
                  Same filter state drives this panel when the table is built (source=
                  {activeSource}, date={dateRange}).
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
