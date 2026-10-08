// ─────────────────────────────────────────────────────────────────────────────
// JourneyAnalytics.tsx
//
// Journey list + selection highlight + AllAssets-style filters + Show Analytics
// shell. Real analytics table is still a later patch.
//
// Route: /analytics/journeys  or  /marketplace/campaigns/:campaignId/journeys
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

// Cap entry videos so discovery stays bounded.
const ENTRY_VIDEO_CAP = 80;

/** Map redirect/element type → WebMood cell key (same as assetAnalyticsColumns). */
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

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7days', label: 'Last 7 Days' },
  { value: '30days', label: 'Last 30 Days' },
  { value: '2months', label: 'Last 2 Months' },
  { value: '6months', label: 'Last 6 Months' },
  { value: '1year', label: 'Last Year' },
  { value: 'all', label: 'Lifetime' },
  { value: 'custom', label: 'Custom Range' },
];

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

// ── Campaign list ───────────────────────────────────────────────────────────

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

  if (error) {
    throw new Error(`Failed to load campaign videos: ${error.message}`);
  }
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

type VideoDisplay = {
  title: string;
  thumbnailUrl: string | null;
  platform: string | null;
  campaignId: string | null;
  createdAt: string | null;
  userId: string | null;
  /** WebMood keys this video promotes via redirect_links / campaign elements */
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
    if (error) {
      throw new Error(`Failed to load video display data: ${error.message}`);
    }
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
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    paramCampaignId ?? null,
  );

  // ── Filter state (AllAssets parity — UI + client filter on journeys) ─────
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [selectedAssetSource, setSelectedAssetSource] = useState<'all' | 'my' | 'shared' | 'assigned'>('all');
  const [hideArchivedContent, setHideArchivedContent] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    if (paramCampaignId) setSelectedCampaignId(paramCampaignId);
  }, [paramCampaignId]);

  useEffect(() => {
    if (selectedCampaignId) return;
    if (campaignOptions.length > 0) setSelectedCampaignId(campaignOptions[0].id);
  }, [campaignOptions, selectedCampaignId]);

  const currentCampaignName = useMemo(
    () => campaignOptions.find((c) => c.id === selectedCampaignId)?.campaign_name ?? null,
    [campaignOptions, selectedCampaignId],
  );

  // ── Journey load ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<DiscoveredJourney[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [excludedJourneys, setExcludedJourneys] = useState(0);
  const [entryVideoCount, setEntryVideoCount] = useState(0);
  const [videoDisplay, setVideoDisplay] = useState<Map<string, VideoDisplay>>(new Map());

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    if (!selectedCampaignId) {
      setLoading(false);
      setJourneys([]);
      setEntryVideoCount(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setJourneys([]);
    setSelectedVideoId(null);

    (async () => {
      try {
        const videoIds = await loadCampaignVideoIds(selectedCampaignId);
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
        // Also resolve structural links for step videos not in the entry set
        // so campaign-link grids light up on mid-path / terminal videos too.
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
  }, [selectedCampaignId]);

  // Platforms present in loaded video display (for pills)
  const presentPlatforms = useMemo(() => {
    const seen = new Set<string>();
    videoDisplay.forEach((v) => seen.add(v.platform ?? 'youtube'));
    return Array.from(seen).sort();
  }, [videoDisplay]);

  // Client-side journey filters (platform + date on step video created_at + selection)
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

    // Date filter: keep journeys that have at least one step video created in range.
    // discoverJourneysForVideos itself is not date-scoped; this is display-only.
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
    videoDisplay,
    dateRange,
    customRange,
  ]);

  const handleSelectVideo = useCallback((videoId: string) => {
    setSelectedVideoId((prev) => (prev === videoId ? null : videoId));
  }, []);

  const handleClearSelection = useCallback(() => setSelectedVideoId(null), []);

  const handleCampaignChange = (id: string) => {
    setSelectedCampaignId(id);
    if (paramCampaignId !== undefined) {
      navigate(`/marketplace/campaigns/${id}/journeys`, { replace: true });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Sticky top bar — Show Analytics always reachable */}
      <header className="shrink-0 sticky top-0 z-40 border-b border-zinc-900 bg-zinc-950/95 backdrop-blur px-3 lg:px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors shrink-0"
              aria-label="Back"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                Journey Map
              </div>
              <div className="text-xs font-bold truncate text-zinc-100 max-w-[200px] lg:max-w-[320px]">
                {currentCampaignName ?? (selectedCampaignId ? 'Loading…' : 'Select a campaign')}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <select
                value={selectedCampaignId ?? ''}
                onChange={(e) => handleCampaignChange(e.target.value)}
                className="appearance-none h-8 pl-2.5 pr-7 rounded-lg border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-300 hover:border-zinc-600 cursor-pointer max-w-[160px]"
              >
                {selectedCampaignId &&
                  !campaignOptions.some((c) => c.id === selectedCampaignId) && (
                    <option value={selectedCampaignId}>
                      {currentCampaignName ?? 'Untitled Campaign'}
                    </option>
                  )}
                {campaignOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaign_name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={11}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
              />
            </div>

            {/* Source: total / pixel / stripe */}
            <div className="flex h-8 rounded-lg border border-zinc-800 overflow-hidden">
              {(['total', 'pixel', 'stripe'] as RevenueView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setActiveSource(v)}
                  className={`px-2.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
                    activeSource === v
                      ? 'bg-zinc-700 text-white'
                      : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className={`h-8 px-2.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1 ${
                filtersOpen
                  ? 'border-zinc-600 bg-zinc-800 text-white'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              <Filter size={11} />
              Filters
            </button>

            {selectedVideoId && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="h-8 px-2.5 rounded-lg border border-red-600/40 bg-red-600/10 text-[9px] font-black uppercase tracking-widest text-red-400 hover:bg-red-600/20 transition-colors flex items-center gap-1"
              >
                Video selected
                <X size={11} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAnalytics((v) => !v)}
              className={`h-8 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 shrink-0 ${
                showAnalytics
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-white'
              }`}
            >
              <BarChart3 size={12} />
              {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[8px] font-bold text-zinc-600 uppercase tracking-widest">
          <span>
            Entry videos: <span className="text-zinc-400">{entryVideoCount}</span>
            {entryVideoCount >= ENTRY_VIDEO_CAP ? ' (capped)' : ''}
          </span>
          <span>
            Journeys: <span className="text-zinc-400">{journeys.length}</span>
            {selectedVideoId || selectedPlatforms.length > 0 || dateRange !== 'all' ? (
              <>
                {' '}
                · showing: <span className="text-zinc-300">{visibleJourneys.length}</span>
              </>
            ) : null}
          </span>
          {truncated && <span className="text-amber-600">Truncated (recency cap)</span>}
          {excludedJourneys > 0 && (
            <span className="text-zinc-600">{excludedJourneys} excluded</span>
          )}
          <span className="text-zinc-700">Source: {activeSource}</span>
        </div>
      </header>

      {/* Filter bar — AllAssets-style controls */}
      {filtersOpen && (
        <div className="shrink-0 border-b border-zinc-900 bg-black px-3 lg:px-5 py-3 space-y-3">
          {/* Row 1: Date + Campaign already in header; Asset Scope + Hide Archived */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[140px]">
              <label className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1">
                <Calendar size={10} /> Date Range
              </label>
              <select
                value={dateRange}
                onChange={(e) => {
                  const v = e.target.value as DateRange;
                  setDateRange(v);
                  if (v !== 'custom') setCustomRange(null);
                }}
                className="w-full h-8 bg-zinc-900 border border-zinc-800 rounded-lg px-2 text-[9px] font-bold uppercase tracking-widest text-zinc-300 outline-none focus:border-red-600"
              >
                {DATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {dateRange === 'custom' && (
              <div className="flex items-end gap-2">
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1 block">
                    From
                  </label>
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
                    className="h-8 bg-zinc-900 border border-zinc-800 rounded-lg px-2 text-[9px] text-zinc-300"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1 block">
                    To
                  </label>
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
                    className="h-8 bg-zinc-900 border border-zinc-800 rounded-lg px-2 text-[9px] text-zinc-300"
                  />
                </div>
              </div>
            )}

            <div className="min-w-[120px]">
              <label className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1 block">
                Asset Scope
              </label>
              <div className="flex h-8 rounded-lg border border-zinc-800 overflow-hidden">
                {SCOPE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setSelectedAssetSource(o.value)}
                    className={`px-2 text-[8px] font-black uppercase tracking-widest ${
                      selectedAssetSource === o.value
                        ? 'bg-red-600 text-white'
                        : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-1.5 h-8 px-2 rounded-lg border border-zinc-800 bg-zinc-900 cursor-pointer">
              <input
                type="checkbox"
                checked={hideArchivedContent}
                onChange={(e) => setHideArchivedContent(e.target.checked)}
                className="rounded border-zinc-700"
              />
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">
                Hide Archived Content
              </span>
            </label>
          </div>

          {/* Asset Type pills */}
          <div>
            <div className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">
              Asset Type
            </div>
            <div className="flex flex-wrap gap-1.5">
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
                    className={`h-7 px-2.5 rounded-lg border text-[8px] font-black uppercase tracking-widest ${
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

          {/* Platform pills */}
          <div>
            <div className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">
              Platform
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedPlatforms([])}
                className={`h-7 px-2.5 rounded-lg border text-[8px] font-black uppercase tracking-widest ${
                  selectedPlatforms.length === 0
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                All
              </button>
              {presentPlatforms.map((p) => {
                const cfg = PLATFORM_CONFIG[p as Platform];
                const label = cfg?.label ?? p;
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
                    className={`h-7 px-2.5 rounded-lg border text-[8px] font-black uppercase tracking-widest ${
                      active
                        ? 'text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                    }`}
                  >
                    {cfg?.icon ? <span className="mr-1 opacity-70">{cfg.icon}</span> : null}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[8px] text-zinc-700 leading-relaxed max-w-3xl">
            Platform + date filter the journey list client-side. Source / Asset Type / Asset Scope
            are wired for the upcoming analytics panel (same state as All Assets). Journey discovery
            itself remains campaign-entry + video-id based.
          </div>
        </div>
      )}

      {/* Body */}
      <div
        className={`flex-1 flex min-h-0 ${showAnalytics ? 'flex-col lg:flex-row' : 'flex-col'}`}
      >
        <div
          className={`flex-1 overflow-y-auto custom-scrollbar px-3 lg:px-5 py-3 ${
            showAnalytics ? 'lg:border-r lg:border-zinc-900 lg:max-w-[55%]' : ''
          }`}
        >
          {loading && (
            <div className="py-16 text-center">
              <Loader2 className="animate-spin text-red-600 mx-auto" size={28} aria-hidden />
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-3">
                Loading journeys…
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="py-16 text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-red-500">
                Failed to load journeys
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 max-w-md mx-auto">{error}</div>
            </div>
          )}

          {!loading && !error && !selectedCampaignId && (
            <div className="py-16 text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                No campaign selected
              </div>
            </div>
          )}

          {!loading && !error && selectedCampaignId && visibleJourneys.length === 0 && (
            <div className="py-16 text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                {selectedVideoId
                  ? 'No journeys contain this video'
                  : 'No journeys match the current filters'}
              </div>
              <div className="text-[10px] text-zinc-700 mt-2 max-w-md mx-auto">
                Clear selection or filters to see more journeys.
              </div>
              {(selectedVideoId || selectedPlatforms.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    handleClearSelection();
                    setSelectedPlatforms([]);
                  }}
                  className="mt-3 h-8 px-4 rounded-lg border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-300"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {!loading && !error && visibleJourneys.length > 0 && (
            <div className="space-y-2">
              {visibleJourneys.map((j) => {
                const steps = stepsForJourney(j, videoDisplay);
                return (
                  <div
                    key={j.journeyId}
                    className="rounded-xl border border-zinc-900 bg-zinc-950/80 px-2 py-1.5"
                  >
                    <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5 px-0.5">
                      Journey · {j.journeyId.slice(0, 8)}…
                    </div>
                    <JourneyStrip
                      steps={steps}
                      highlightVideoId={selectedVideoId}
                      onSelectVideo={handleSelectVideo}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showAnalytics && (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 lg:px-5 py-3 bg-zinc-950/50 lg:min-w-[45%]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  Analytics
                </div>
                <div className="text-xs font-bold text-zinc-300 mt-0.5">
                  Placeholder — table in next patch
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAnalytics(false)}
                className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white"
                aria-label="Hide analytics"
              >
                <X size={14} />
              </button>
            </div>
            <div className="rounded-xl border border-dashed border-zinc-800 bg-black/40 p-6 text-center">
              <BarChart3 className="mx-auto text-zinc-700 mb-2" size={24} />
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                All Assets–style horizontal table (not built yet)
              </div>
              <div className="text-[9px] text-zinc-700 mt-2 max-w-sm mx-auto leading-relaxed">
                Filters above (source={activeSource}, date={dateRange}, platforms=
                {selectedPlatforms.length || 'all'}) will drive the same dataset as All Assets
                when the table lands.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
