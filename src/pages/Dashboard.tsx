// ─────────────────────────────────────────────────────────────────────────────
// DashboardTest.tsx
//
// ENGINE-POWERED MIRROR of Dashboard.tsx.
// Route: /dashboard-test
//
// PURPOSE
// ═══════
// Exact behavioral clone of Dashboard.tsx where all metric computation is
// delegated to getAnalyticsEngine() from analyticsEngine.ts.
// UI layout is preserved — same clean, uncluttered format as Dashboard.tsx.
//
// CHANGES vs Dashboard.tsx
// ════════════════════════
//   1. ALL metric computation comes from getAnalyticsEngine() — no duplicate logic.
//   2. Revenue Source toggle order: TOTAL → PIXEL → STRIPE (default: TOTAL).
//   3. "Revenue Per Click" metric card removed.
//   4. "Direct Purchase" metric card added (purchase_thankyou from engine).
//   5. Fetch pattern upgraded to match InDepthAnalyticsTest.tsx
//      (stripe_purchase_type table + enrichment helpers from engine).
//   6. Tracking Health sidebar removed (developer metrics, not executive metrics).
//   7. simulateTraffic removed along with Tracking Health.
//   8. Controls bar added: Revenue source + Date range + Platform filter.
//   9. Leaderboard is now full-width with rank numbers, larger thumbnails,
//      Added date, and elevated Revenue column styling.
//  10. Quick Actions demoted to slim inline strip below leaderboard.
//
// MIGRATION STATUS LEGEND
// ═══════════════════════
// 🟢 ENGINE-DRIVEN    — value comes directly from getAnalyticsEngine() output
// 🟡 LEGACY FALLBACK  — still computed manually; engine does not yet expose this
//
// ─────────────────────────────────────────────────────────────────────────────

import { useOrganization } from '../lib/useOrganization'
import React, { useState, useEffect, useMemo } from 'react';
import { supabase, Video, Campaign } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// 🟢 ENGINE-DRIVEN — all computation comes from analyticsEngine.ts
import {
  getAnalyticsEngine,
  buildStripeFromPurchaseTypeTable,
  buildPixelPurchases,
  flattenSessionEvents,
  mergeEventSources,
  selectDisplayRevenue,
  type AnalyticsEngineInput,
  type RawEvent,
  type StripePurchaseRow,
  type PixelPurchaseRow,
  type StripePurchaseTypeRow,
  type RevenueView,
  type CampaignMeta,
  type DateRange,
} from '../lib/analyticsEngine';

import {
  Target, Users, DollarSign,
  Activity, AlertCircle, CheckCircle2, ArrowRight,
  ShoppingCart,
} from 'lucide-react';
import { PLATFORM_CONFIG } from '../lib/platformParser';
import { motion } from 'motion/react';
import { useNavigate, Link } from 'react-router-dom';
import { Modal } from '../components/Modal';


// ─────────────────────────────────────────────────────────────────────────────
// 🟡 LEGACY FALLBACK: buildSessionLookup
// Not yet in the engine (async Supabase op). Verbatim from InDepthAnalyticsTest.
// ─────────────────────────────────────────────────────────────────────────────
async function buildSessionLookup(
  rows: any[],
): Promise<Record<string, { video_id: string; campaign_id: string }>> {
  const missingIds = rows
    .filter((p: any) => !p.video_id && p.session_id)
    .map((p: any) => p.session_id);
  if (!missingIds.length) return {};
  const { data: sData } = await supabase
    .from('sessions')
    .select('id, video_id, campaign_id')
    .in('id', missingIds);
  const lookup: Record<string, { video_id: string; campaign_id: string }> = {};
  (sData || []).forEach((s: any) => {
    if (s.video_id) lookup[s.id] = { video_id: s.video_id, campaign_id: s.campaign_id };
  });
  return lookup;
}


// ─────────────────────────────────────────────────────────────────────────────
// Platform thumbnail fallbacks — mirrors Videos.tsx PLATFORM_THUMBNAILS.
// Used when thumbnail_url is null or empty for a given video row.
// YouTube is intentionally absent: YouTube always provides a thumbnail URL.
// ─────────────────────────────────────────────────────────────────────────────
const PLATFORM_THUMBNAILS: Record<string, string> = {
  threads:   '/thumbnails/threads-default.png',
  reddit:    '/thumbnails/reddit-default.png',
  x:         '/thumbnails/x-default.png',
  tiktok:    '/thumbnails/tiktok-default.png',
  linkedin:  '/thumbnails/linkedin-default.png',
  instagram: '/thumbnails/instagram-default.png',
  facebook:  '/thumbnails/facebook-default.png',
  twitch:    '/thumbnails/twitch-default.png',
};

function resolveThumbnail(video: { thumbnail_url?: string | null; platform?: string | null }): string {
  if (video.thumbnail_url) return video.thumbnail_url;
  const platform = video.platform ?? '';
  if (PLATFORM_THUMBNAILS[platform]) return PLATFORM_THUMBNAILS[platform];
  return `https://placehold.co/160x90/18181b/52525b?text=${encodeURIComponent(platform || 'video')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform-specific title resolution — mirrors Videos.tsx resolver functions.
// Corrects raw video_title values for platforms that store placeholders or
// where the meaningful display title must be derived from platform_url.
// ─────────────────────────────────────────────────────────────────────────────
function resolveXTitle(videoTitle: string | undefined): string {
  const t = (videoTitle ?? '').trim();
  if (!t || /^x\s+post(\s+\d+)?$/i.test(t) || /^\d+$/.test(t)) return 'X Post';
  return t;
}

function resolveThreadsTitle(videoTitle: string | undefined): string {
  const t = (videoTitle ?? '').trim();
  if (!t || /^threads\s+post(\s+\S+)?$/i.test(t)) return 'Threads Post';
  return t;
}

function resolveRedditTitle(platformUrl: string | null | undefined, fallback: string | undefined): string {
  if (platformUrl) {
    const match = platformUrl.match(/\/comments\/[^/]+\/([^/]+)/);
    if (match && match[1]) {
      const slug = match[1].replace(/_/g, ' ');
      return slug.charAt(0).toUpperCase() + slug.slice(1);
    }
  }
  return fallback ?? 'Reddit Post';
}

function resolveDisplayTitle(
  platform: string | null | undefined,
  videoTitle: string | undefined,
  platformUrl: string | null | undefined,
): string {
  switch (platform) {
    case 'x':       return resolveXTitle(videoTitle);
    case 'threads': return resolveThreadsTitle(videoTitle);
    case 'reddit':  return resolveRedditTitle(platformUrl, videoTitle);
    default:        return videoTitle ?? '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date formatting helper for "Added:" display
// ─────────────────────────────────────────────────────────────────────────────
function formatAddedDate(createdAt: string | null | undefined): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform filter config — all 9 supported platforms
// ─────────────────────────────────────────────────────────────────────────────
const PLATFORM_FILTERS = [
  { value: 'all',       label: 'All'  },
  { value: 'youtube',   label: 'YT'   },
  { value: 'tiktok',    label: 'TT'   },
  { value: 'instagram', label: 'IG'   },
  { value: 'linkedin',  label: 'LI'   },
  { value: 'x',         label: 'X'    },
  { value: 'threads',   label: 'TH'   },
  { value: 'facebook',  label: 'FB'   },
  { value: 'reddit',    label: 'RD'   },
  { value: 'twitch',    label: 'TW'   },
] as const;

type PlatformFilter = typeof PLATFORM_FILTERS[number]['value'];

// ─────────────────────────────────────────────────────────────────────────────
// Date range options
// ─────────────────────────────────────────────────────────────────────────────
const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all',   label: 'All time'   },
  { value: '7d',    label: '7 days'     },
  { value: '30d',   label: '30 days'    },
  { value: 'month', label: 'This month' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Rank color helper
// ─────────────────────────────────────────────────────────────────────────────
function rankColor(rank: number): string {
  if (rank === 1) return 'text-amber-400';
  if (rank === 2) return 'text-zinc-400';
  if (rank === 3) return 'text-amber-700';
  return 'text-zinc-700';
}


// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardTest() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  // ── Raw data state ──────────────────────────────────────────────────────────
  const [loading, setLoading]                   = useState(true);
  const [videos, setVideos]                     = useState<Video[]>([]);
  const [campaigns, setCampaigns]               = useState<Campaign[]>([]);
  const [rawEvents, setRawEvents]               = useState<RawEvent[]>([]);
  const [stripePurchases, setStripePurchases]   = useState<StripePurchaseRow[]>([]);
  const [pixelPurchases, setPixelPurchases]     = useState<PixelPurchaseRow[]>([]);

  // ── Filter state ────────────────────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: revenueView and dateRange feed directly into engineInput.
  // selectedPlatform is a client-side post-filter on sortedVideos (engine is
  // platform-agnostic by design — no platform field in AnalyticsEngineInput).
  const [revenueView,      setRevenueView]      = useState<RevenueView>('total');
  const [dateRange,        setDateRange]         = useState<DateRange>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFilter>('all');

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'info' | 'danger' | 'success';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info',
  });

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info') => {
    setModalConfig({ isOpen: true, title, message, variant });
  };

  useEffect(() => {
    if (user && organizationId) fetchData();
  }, [user, organizationId]);


  // ── Data fetching ───────────────────────────────────────────────────────────
  // 🟡 LEGACY FALLBACK: fetch queries and Promise.all parallelism are not yet
  // in the engine. Pattern is verbatim from InDepthAnalyticsTest.tsx.
  // 🟢 ENGINE-DRIVEN TRANSITION POINTS: buildStripeFromPurchaseTypeTable(),
  //    buildPixelPurchases(), flattenSessionEvents(), mergeEventSources().
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const [vRes, cRes] = await Promise.all([
        supabase.from('videos').select('*').eq('organization_id', organizationId),
        supabase.from('campaigns').select('*').eq('organization_id', organizationId),
      ]);

      if (vRes.error) throw vRes.error;
      if (cRes.error) throw cRes.error;
      if (!vRes.data || !cRes.data) return;

      setVideos(vRes.data);
      setCampaigns(cRes.data);

      if (vRes.data.length === 0) return;

      const videoIds    = vRes.data.map((v: any) => v.id);
      const campaignIds = vRes.data.map((v: any) => v.campaign_id).filter(Boolean);

      const [eDirectData, eViaSessionData, spData, ppData] = await Promise.all([
        supabase
          .from('events')
          .select('video_id, campaign_id, event_type, created_at')
          .in('video_id', videoIds),

        supabase
          .from('events')
          .select('event_type, created_at, sessions!inner(video_id, campaign_id)')
          .is('video_id', null)
          .in('sessions.video_id', videoIds),

        // stripe_purchase_type has the payment_type column — authoritative table.
        (() => {
          const q = supabase
            .from('stripe_purchase_type')
            .select('video_id, campaign_id, amount, stripe_session_id, payment_type');
          if (campaignIds.length) {
            return q.or(
              `video_id.in.(${videoIds.join(',')}),campaign_id.in.(${campaignIds.join(',')})`,
            );
          }
          return q.in('video_id', videoIds);
        })(),

        campaignIds.length
          ? supabase
              .from('pixel_purchases')
              .select('video_id, campaign_id, amount, event_type, session_id')
              .in('campaign_id', campaignIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // 🟢 ENGINE-DRIVEN: flattenSessionEvents() + mergeEventSources()
      const sessionResolvedEvents = flattenSessionEvents(eViaSessionData.data as any[] || []);
      const allEvents = mergeEventSources(eDirectData.data || [], sessionResolvedEvents);

      const stripeRaw: StripePurchaseTypeRow[] = (spData.data || []).map((r: any) => ({
        video_id:          r.video_id,
        campaign_id:       r.campaign_id,
        amount:            r.amount,
        stripe_session_id: r.stripe_session_id ?? null,
        payment_type:      r.payment_type ?? null,
      }));
      const pixelRaw = ppData.data || [];

      // 🟡 LEGACY FALLBACK: buildSessionLookup is not yet in the engine.
      const [stripeSessLookup, pixelSessLookup] = await Promise.all([
        buildSessionLookup(stripeRaw.map(r => ({ ...r, session_id: r.stripe_session_id }))),
        buildSessionLookup(pixelRaw),
      ]);

      // 🟢 ENGINE-DRIVEN: enrichment helpers from analyticsEngine.ts
      const enrichedStripe = buildStripeFromPurchaseTypeTable(stripeRaw, stripeSessLookup);
      const enrichedPixel  = buildPixelPurchases(pixelRaw, pixelSessLookup);

      console.log('[DashboardTest] events direct:', eDirectData.data?.length ?? 0,
        '| via session:', sessionResolvedEvents.length,
        '| total:', allEvents.length);
      console.log('[DashboardTest] stripe enriched:', enrichedStripe.length,
        '| pixel enriched:', enrichedPixel.length);

      setRawEvents(allEvents);
      setStripePurchases(enrichedStripe);
      setPixelPurchases(enrichedPixel);
    } catch (err: any) {
      console.error('[DashboardTest] Fetch Error:', err);
      showAlert('Dashboard Error', `Failed to load dashboard data: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };


  // ── Engine orchestration ────────────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: ALL metric computation lives here, via getAnalyticsEngine().
  // dateRange is now live state — reacts to the Period filter in the controls bar.
  // selectedPlatform is applied as a post-filter on sortedVideos below (engine
  // is platform-agnostic; no platform field exists in AnalyticsEngineInput).
  // ─────────────────────────────────────────────────────────────────────────────
  const engineInput = useMemo((): AnalyticsEngineInput => ({
    videos:              videos as any,
    campaigns:           campaigns as CampaignMeta[],
    rawEvents,
    stripePurchases,
    pixelPurchases,
    dateRange,
    selectedCampaignId:  'all',
    selectedGoals:       [],
    selectedLeadMagnets: [],
    activeSource:        revenueView,
    includeEV:           true,
    sortConfig:          { key: 'total_revenue', direction: 'desc' },
  }), [videos, campaigns, rawEvents, stripePurchases, pixelPurchases, revenueView, dateRange]);

  // 🟢 ENGINE-DRIVEN: sortedVideos and campaignTotals come entirely from the engine.
  const { sortedVideos, campaignTotals } = useMemo(
    () => getAnalyticsEngine(engineInput),
    [engineInput],
  );

  // Platform post-filter — applied after engine sort, before the 7-row slice.
  // Engine sorts by total_revenue desc, so the top 7 within the selected
  // platform are always the correct top performers for that platform.
  const filteredVideos = useMemo(
    () => selectedPlatform === 'all'
      ? sortedVideos
      : sortedVideos.filter(r => r.video.platform === selectedPlatform),
    [sortedVideos, selectedPlatform],
  );


  // ── Derived display values ──────────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: all values read from campaignTotals (engine output).

  // Revenue displayed depends on the source toggle — selectDisplayRevenue is an engine helper.
  const displayRevenue = useMemo(
    () => selectDisplayRevenue(campaignTotals as any, revenueView),
    [campaignTotals, revenueView],
  );

  const displayRevenueLabel = revenueView === 'stripe' ? 'Verified (Stripe)'
    : revenueView === 'pixel' ? 'Estimated (Pixel)'
    : 'Total (Hybrid)';

  // Direct Purchases: total purchase_thankyou count across all videos (from engine).
  const totalDirectPurchases = campaignTotals.purchase_thankyou;

  // Opt-ins and call bookings from engine aggregates.
  const totalOptins    = campaignTotals.newsletter_thankyou;
  const totalCallBooks = campaignTotals.call_booking_thankyou;


  // ── Status icon helper ──────────────────────────────────────────────────────
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':  return <CheckCircle2 size={10} className="text-green-500" />;
      case 'error':   return <AlertCircle  size={10} className="text-red-500" />;
      default:        return <Activity     size={10} className="text-zinc-600" />;
    }
  };


  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1200px] mx-auto px-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-end pt-2">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-red-600 rounded-sm shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
            Revenue Intelligence
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">
            Operational Revenue View
          </p>
        </div>
        <Link
          to="/analytics"
          className="bg-zinc-900 border border-zinc-800 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-800 transition-all"
        >
          Go To Analytics <ArrowRight size={14} />
        </Link>
      </header>


      {/* ── Controls bar ───────────────────────────────────────────────────── */}
      {/* Revenue source + Period + Platform — unified filter strip            */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Revenue source toggle */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          {(['total', 'pixel', 'stripe'] as RevenueView[]).map(v => (
            <button
              key={v}
              onClick={() => setRevenueView(v)}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                revenueView === v ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {v === 'total' ? 'Total' : v === 'pixel' ? 'Pixel' : 'Stripe'}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-800" />

        {/* Period picker */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Period</span>
          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            {DATE_RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                  dateRange === opt.value ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-800" />

        {/* Platform filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Platform</span>
          <div className="flex flex-wrap gap-1">
            {PLATFORM_FILTERS.map(p => (
              <button
                key={p.value}
                onClick={() => setSelectedPlatform(p.value)}
                className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border transition-all ${
                  selectedPlatform === p.value
                    ? 'bg-zinc-700 border-zinc-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>


      {/* ── Metric Cards ───────────────────────────────────────────────────── */}
      {/* 🟢 ENGINE-DRIVEN: all values from campaignTotals / engine output     */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label:    'Total Revenue',
            value:    `$${displayRevenue.toLocaleString()}`,
            sublabel: displayRevenueLabel,
            icon:     DollarSign,
            color:    'text-green-500',
          },
          {
            label:    'Direct Purchase',
            value:    totalDirectPurchases,
            sublabel: undefined,
            icon:     ShoppingCart,
            color:    'text-blue-500',
          },
          {
            label:    'Newsletter Opt-ins',
            value:    totalOptins,
            sublabel: undefined,
            icon:     Users,
            color:    'text-orange-500',
          },
          {
            label:    'Sales Calls',
            value:    totalCallBooks,
            sublabel: undefined,
            icon:     Target,
            color:    'text-red-500',
          },
        ].map(card => (
          <div
            key={card.label}
            className="bento-card py-6 px-4 flex flex-col justify-between min-h-[100px]"
          >
            <span className="label-caps !text-zinc-600 truncate">{card.label}</span>
            <div className="flex items-center justify-between mt-auto">
              <div className="flex flex-col">
                <span className="text-white text-xl font-black">{card.value}</span>
                {'sublabel' in card && card.sublabel && (
                  <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-0.5 block">
                    {card.sublabel}
                  </span>
                )}
              </div>
              <card.icon size={16} className={`${card.color} opacity-40`} />
            </div>
          </div>
        ))}
      </section>


      {/* ── Top Performing Content — full-width leaderboard ────────────────── */}
      {/* 🟢 ENGINE-DRIVEN: filteredVideos from engine → platform post-filter  */}
      <section className="bento-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-900/10 flex justify-between items-center">
          <h2 className="label-caps !text-white">Top Performing Content</h2>
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
            Sorted by Revenue
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-950/50 border-b border-zinc-900">
              <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                <th className="pl-4 pr-2 py-3 w-6">#</th>
                <th className="px-4 py-3">Content</th>
                <th className="px-4 py-3">Goal</th>
                <th className="px-4 py-3 text-center">Clicks</th>
                <th className="px-4 py-3 text-center">Opt-ins</th>
                <th className="px-4 py-3 text-center">Calls</th>
                <th className="px-4 py-3 text-right">Revenue ↓</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/50">
              {loading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-6 py-6">
                      <div className="h-4 bg-zinc-900 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-600">
                      No content matches the current filters
                    </p>
                  </td>
                </tr>
              ) : (
                filteredVideos.slice(0, 7).map((row, idx) => {
                  // 🟢 ENGINE-DRIVEN: revenue per row from engine metrics
                  const rowRevenue = selectDisplayRevenue(row, revenueView);
                  const videoGoals = Array.isArray(row.video.video_goal)
                    ? row.video.video_goal.join(', ')
                    : (row.video.video_goal ?? '');
                  const rank       = idx + 1;
                  const addedDate  = formatAddedDate(row.video.created_at);

                  return (
                    <tr
                      key={row.video.id}
                      className="hover:bg-white/[0.015] transition-colors group cursor-pointer"
                      onClick={() => navigate(`/videos/${row.video.id}`)}
                    >

                      {/* Rank */}
                      <td className="pl-5 pr-2 py-4">
                        <span className={`text-[10px] font-black tabular-nums ${rankColor(rank)}`}>
                          #{rank}
                        </span>
                      </td>

                      {/* Thumbnail + title */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* Thumbnail with platform badge */}
                          <div className="relative flex-shrink-0">
                            <img
                              src={resolveThumbnail(row.video)}
                              className="w-20 aspect-video rounded-lg object-cover border border-zinc-800 grayscale group-hover:grayscale-0 transition-all duration-300"
                            />
                            {row.video.platform && (
                              <span className="absolute -top-1 -right-1 text-[6px] font-black uppercase tracking-wide px-1 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-400 leading-none">
                                {PLATFORM_CONFIG[row.video.platform]?.label ?? row.video.platform.toUpperCase()}
                              </span>
                            )}
                          </div>

                          {/* Title + status + added date */}
                          <div className="min-w-0 max-w-[200px]">
                            <p className="text-[11px] font-bold text-zinc-200 truncate leading-snug mb-1">
                              {resolveDisplayTitle(row.video.platform, row.title, row.video.platform_url)}
                            </p>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {getStatusIcon(row.video.status ?? '')}
                              <span className="text-[8px] font-black uppercase text-zinc-600 tracking-tighter">
                                {(row.video.status ?? '').replace('_', ' ')}
                              </span>
                            </div>
                            {addedDate && (
                              <p className="text-[8px] font-bold text-zinc-700 tracking-tight">
                                Added: {addedDate}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Goal */}
                      <td className="px-4 py-3">
                        {videoGoals ? (
                          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 bg-zinc-900 text-zinc-500 rounded border border-zinc-800 whitespace-nowrap">
                            {videoGoals}
                          </span>
                        ) : null}
                      </td>

                      {/* Clicks */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] font-bold text-zinc-500 tabular-nums">
                          {row.landing_page_view.toLocaleString()}
                        </span>
                      </td>

                      {/* Opt-ins */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] font-bold text-orange-500 tabular-nums">
                          {row.newsletter_thankyou.toLocaleString()}
                        </span>
                      </td>

                      {/* Calls */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] font-bold text-blue-500 tabular-nums">
                          {row.call_booking_thankyou.toLocaleString()}
                        </span>
                      </td>

                      {/* Revenue — primary metric, visually dominant */}
                      <td className="px-4 py-3 text-right">
                        <div className="text-sm font-black text-white tabular-nums">
                          ${rowRevenue.toLocaleString()}
                        </div>
                        <div className="text-[8px] font-bold text-zinc-700 uppercase tracking-tighter mt-0.5">
                          {row.revenue_mode_label}
                        </div>
                        <div className="text-[8px] font-bold text-green-500/40 uppercase tracking-tighter">
                          {row.purchase_thankyou} Direct
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>


      {/* ── Quick Actions — slim inline strip ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 pb-4">
        <Link
          to="/videos"
          className="flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white hover:border-zinc-700 transition-all group"
        >
          Track New Video
          <ArrowRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
        </Link>
        <Link
          to="/campaigns"
          className="flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white hover:border-zinc-700 transition-all group"
        >
          View All Funnels
          <ArrowRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
        </Link>
      </div>


      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
        onConfirm={modalConfig.onConfirm}
      />
    </div>
  );
}
