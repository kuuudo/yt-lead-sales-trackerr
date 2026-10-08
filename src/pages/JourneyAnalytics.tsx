// ─────────────────────────────────────────────────────────────────────────────
// JourneyAnalytics.tsx
//
// FIRST PATCH ONLY — journey list + selection highlight + Show Analytics shell.
//
// Route (suggested): /analytics/journeys  or  /marketplace/campaigns/:campaignId/journeys
//
// WHAT THIS FILE IS RIGHT NOW
// ════════════════════════════
// - Discover journeys for a campaign-scoped video set
// - List every journey as its own horizontal JourneyStrip
// - Selected video → every matching full journey, with that step highlighted
// - Show Analytics toggles a placeholder panel (real table is a later patch)
//
// EXPLICITLY NOT IN THIS PATCH
// ════════════════════════════
// Analytics table, attribution, TRUE START, Pixel/Stripe journey filtering,
// revenue formulas, row grain, buildJourneyGraph list merging.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronDown,
  Loader2,
  BarChart3,
  X,
} from 'lucide-react';

import { Campaign, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useViewing } from '../lib/ViewingContext';
import { resolveThumbnail } from '../lib/videoFormatters';
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
  type JourneyStripEnd,
  type JourneyEndKey,
} from '../components/analytics/JourneyStrip';

// ── Outcome mapping (same element_type → outcome idea as CampaignJourneyMap) ─
// JourneyStrip uses 'purchase' where the map uses 'direct_purchase'.
const ELEMENT_TO_STRIP_END: Record<string, { key: JourneyEndKey; label: string }> = {
  sales_call: { key: 'sales_call', label: 'Sales Call' },
  landing_page: { key: 'purchase', label: 'Direct Purchase' },
  consultation: { key: 'consultation', label: 'Consultation' },
  newsletter: { key: 'newsletter', label: 'Newsletter' },
};

// Cap entry videos so discovery stays bounded even on large campaigns.
const ENTRY_VIDEO_CAP = 80;

// ── Campaign list (same pattern as CampaignJourneyMap / AllAssetsAnalytics) ──

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

/** Campaign-scoped video ids — smallest bounded entry set for discovery. */
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
};

async function loadVideoDisplayMap(videoIds: string[]): Promise<Map<string, VideoDisplay>> {
  const map = new Map<string, VideoDisplay>();
  const ids = Array.from(new Set(videoIds.filter(Boolean)));
  if (ids.length === 0) return map;

  // Chunk to avoid oversized .in() lists
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
      });
    }
  }
  return map;
}

/** Prefer observed structural link on the terminal video; else omit end. */
function endForJourney(
  journey: DiscoveredJourney,
  structuralByVideo: Map<string, StructuralLink[]>,
): JourneyStripEnd | null {
  const steps = journey.path?.steps ?? [];
  if (steps.length === 0) return null;
  const last = steps[steps.length - 1];
  const links = structuralByVideo.get(last.videoId) ?? [];
  // Prefer asset-resolved, then validated, then any non-legacy
  const ranked = [...links].sort((a, b) => {
    const rank = (r: StructuralLink['resolution']) =>
      r === 'asset' ? 0 : r === 'link_type_validated' ? 1 : 2;
    return rank(a.resolution) - rank(b.resolution);
  });
  for (const link of ranked) {
    if (link.resolution === 'legacy') continue;
    const mapped = ELEMENT_TO_STRIP_END[link.elementType];
    if (mapped) return mapped;
  }
  return null;
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

  // Sync route param → local selection
  useEffect(() => {
    if (paramCampaignId) setSelectedCampaignId(paramCampaignId);
  }, [paramCampaignId]);

  // Default to first owned campaign when route has no campaignId
  useEffect(() => {
    if (selectedCampaignId) return;
    if (campaignOptions.length > 0) {
      setSelectedCampaignId(campaignOptions[0].id);
    }
  }, [campaignOptions, selectedCampaignId]);

  const currentCampaignName = useMemo(
    () => campaignOptions.find((c) => c.id === selectedCampaignId)?.campaign_name ?? null,
    [campaignOptions, selectedCampaignId],
  );

  // ── Journey load state ────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<DiscoveredJourney[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [excludedJourneys, setExcludedJourneys] = useState(0);
  const [entryVideoCount, setEntryVideoCount] = useState(0);
  const [videoDisplay, setVideoDisplay] = useState<Map<string, VideoDisplay>>(new Map());
  const [structuralByVideo, setStructuralByVideo] = useState<Map<string, StructuralLink[]>>(
    new Map(),
  );

  // ── Selection + analytics shell ───────────────────────────────────────────
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
          setStructuralByVideo(new Map());
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
        const display = await loadVideoDisplayMap([...videoIds, ...stepVideoIds]);
        if (cancelled) return;

        const byVideo = new Map<string, StructuralLink[]>();
        for (const link of structuralLinks) {
          const list = byVideo.get(link.videoId) ?? [];
          list.push(link);
          byVideo.set(link.videoId, list);
        }

        setJourneys(discovery.journeys);
        setTruncated(discovery.truncated);
        setExcludedJourneys(discovery.excludedJourneys);
        setVideoDisplay(display);
        setStructuralByVideo(byVideo);
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

  const visibleJourneys = useMemo(() => {
    if (!selectedVideoId) return journeys;
    return journeys.filter((j) =>
      (j.path?.steps ?? []).some((s) => s.videoId === selectedVideoId),
    );
  }, [journeys, selectedVideoId]);

  const handleSelectVideo = useCallback((videoId: string) => {
    setSelectedVideoId((prev) => (prev === videoId ? null : videoId));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedVideoId(null);
  }, []);

  const handleCampaignChange = (id: string) => {
    setSelectedCampaignId(id);
    // Keep URL in sync when route supports :campaignId
    if (paramCampaignId !== undefined) {
      navigate(`/marketplace/campaigns/${id}/journeys`, { replace: true });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header — same visual language as AllAssetsAnalytics */}
      <header className="shrink-0 border-b border-zinc-900 bg-zinc-950 px-4 lg:px-6 py-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors shrink-0"
              aria-label="Back"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Journey Map
              </div>
              <div className="text-sm font-bold truncate text-zinc-100">
                {currentCampaignName ?? (selectedCampaignId ? 'Loading…' : 'Select a campaign')}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Campaign switcher */}
            <div className="relative">
              <select
                value={selectedCampaignId ?? ''}
                onChange={(e) => handleCampaignChange(e.target.value)}
                className="appearance-none h-8 pl-3 pr-8 rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:border-zinc-600 cursor-pointer max-w-[200px]"
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
                size={12}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
              />
            </div>

            {/* Selection chip */}
            {selectedVideoId && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="h-8 px-3 rounded-lg border border-red-600/40 bg-red-600/10 text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-600/20 transition-colors flex items-center gap-1.5"
              >
                Video selected
                <X size={12} />
              </button>
            )}

            {/* Show Analytics — same interaction pattern as filter toggles in AllAssets */}
            <button
              type="button"
              onClick={() => setShowAnalytics((v) => !v)}
              className={`h-8 px-3 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                showAnalytics
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
              }`}
            >
              <BarChart3 size={12} />
              {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
            </button>
          </div>
        </div>

        {/* Meta line */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
          <span>
            Entry videos: <span className="text-zinc-400">{entryVideoCount}</span>
            {entryVideoCount >= ENTRY_VIDEO_CAP ? ' (capped)' : ''}
          </span>
          <span>
            Journeys: <span className="text-zinc-400">{journeys.length}</span>
            {selectedVideoId ? (
              <>
                {' '}
                · matching:{' '}
                <span className="text-zinc-300">{visibleJourneys.length}</span>
              </>
            ) : null}
          </span>
          {truncated && <span className="text-amber-600">Truncated (recency cap)</span>}
          {excludedJourneys > 0 && (
            <span className="text-zinc-600">{excludedJourneys} excluded</span>
          )}
        </div>
      </header>

      {/* Body: Journey Map (+ optional analytics placeholder) */}
      <div className={`flex-1 flex min-h-0 ${showAnalytics ? 'flex-col lg:flex-row' : 'flex-col'}`}>
        {/* ── Journey Map ─────────────────────────────────────────────────── */}
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
              <div className="text-[10px] text-zinc-600 mt-2 max-w-md mx-auto">
                Discovering paths for this campaign&apos;s videos.
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

          {!loading && !error && !selectedCampaignId && (
            <div className="py-20 text-center">
              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                No campaign selected
              </div>
              <div className="text-[10px] text-zinc-700 mt-2 max-w-md mx-auto">
                Pick a campaign above to load its journeys.
              </div>
            </div>
          )}

          {!loading && !error && selectedCampaignId && visibleJourneys.length === 0 && (
            <div className="py-20 text-center">
              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                {selectedVideoId
                  ? 'No journeys contain this video'
                  : 'No journeys in this campaign yet'}
              </div>
              <div className="text-[10px] text-zinc-700 mt-2 max-w-md mx-auto">
                {selectedVideoId
                  ? 'Clear the selection to see all discovered journeys, or pick another video.'
                  : 'Nothing matched the campaign entry videos. If the spinner is gone, this view is empty — not still loading.'}
              </div>
              {selectedVideoId && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="mt-4 h-8 px-4 rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-600"
                >
                  Clear selection
                </button>
              )}
            </div>
          )}

          {!loading && !error && visibleJourneys.length > 0 && (
            <div className="space-y-4">
              {visibleJourneys.map((j) => {
                const steps = stepsForJourney(j, videoDisplay);
                const end = endForJourney(j, structuralByVideo);
                return (
                  <div
                    key={j.journeyId}
                    className="rounded-2xl border border-zinc-900 bg-zinc-950/80 px-3 py-2"
                  >
                    <div className="text-[8px] font-black uppercase tracking-widest text-zinc-700 mb-1 px-1">
                      Journey · {j.journeyId.slice(0, 8)}…
                    </div>
                    <JourneyStrip
                      steps={steps}
                      end={end}
                      highlightVideoId={selectedVideoId}
                      onSelectVideo={handleSelectVideo}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Analytics placeholder panel (table comes in a later patch) ──── */}
        {showAnalytics && (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 lg:px-6 py-4 bg-zinc-950/50 lg:min-w-[45%]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Analytics
                </div>
                <div className="text-xs font-bold text-zinc-300 mt-0.5">
                  Placeholder — table lands in the next patch
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
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-black/40 p-8 text-center">
              <BarChart3 className="mx-auto text-zinc-700 mb-3" size={28} />
              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                All Assets–style table (not built yet)
              </div>
              <div className="text-[10px] text-zinc-700 mt-2 max-w-sm mx-auto leading-relaxed">
                Promotion, campaigns, asset clicks, downstream, revenue, and the shared
                engine columns will appear here as a normal horizontal table — same
                orientation as All Assets Analytics. Journey Map stays visible on the
                left.
              </div>
              {selectedVideoId && (
                <div className="mt-4 text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                  Context video: {selectedVideoId.slice(0, 8)}…
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
