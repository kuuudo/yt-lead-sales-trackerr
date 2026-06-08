// ─────────────────────────────────────────────────────────────────────────────
// DashboardTest.tsx
//
// ENGINE-POWERED MIRROR of Dashboard.tsx.
// Route: /dashboard-test
//
// CHANGES vs previous version
// ════════════════════════════
//   1. Content identity rendering now uses renderContentIdentity() from
//      ../lib/videoFormatters — same source of truth as Videos.tsx.
//   2. Thumbnail fallback uses resolveThumbnail() from videoFormatters —
//      correct paths (/platform-thumbnails/), no more broken images.
//   3. Thumbnails: full color by default, w-28 (112px), hover scale+glow.
//   4. Goal column removed entirely.
//   5. Sort By control added to controls bar — wired to engineInput.sortConfig.
//   6. colSpan updated 7→6 throughout (Goal column removal).
//   7. Removed local resolveXTitle/resolveThreadsTitle/resolveRedditTitle/
//      resolveDisplayTitle — no duplicate parser logic remains.
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
  type MetricType,
} from '../lib/analyticsEngine';

import {
  Target, Users, DollarSign,
  Activity, AlertCircle, CheckCircle2, ArrowRight,
  ShoppingCart,
} from 'lucide-react';
import { PLATFORM_CONFIG } from '../lib/platformParser';

// Shared formatting — same source of truth as Videos.tsx
import {
  resolveThumbnail,
  renderContentIdentity,
} from '../lib/videoFormatters';

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
// Sort options — all keys are real fields on VideoMetricsResult / ProcessedVideoRow.
// The engine's sortConfig.key accepts any MetricType string.
// No analyticsEngine changes required.
// ─────────────────────────────────────────────────────────────────────────────
const SORT_OPTIONS: { value: MetricType; label: string }[] = [
  { value: 'total_revenue',        label: 'Revenue'           },
  { value: 'landing_page_view',    label: 'Clicks'            },
  { value: 'newsletter_thankyou',  label: 'Newsletter Opt-ins' },
  { value: 'call_booking_thankyou',label: 'Sales Calls'       },
  { value: 'consultation_thankyou',label: 'Consultations'     },
  { value: 'purchase_thankyou',    label: 'Purchases'         },
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

  // ── Filter + sort state ─────────────────────────────────────────────────────
  // revenueView and dateRange feed directly into engineInput (engine-driven).
  // sortKey feeds into engineInput.sortConfig (engine-driven).
  // selectedPlatform is a client-side post-filter (engine is platform-agnostic).
  const [revenueView,      setRevenueView]      = useState<RevenueView>('total');
  const [dateRange,        setDateRange]         = useState<DateRange>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFilter>('all');
  const [sortKey,          setSortKey]           = useState<MetricType>('total_revenue');

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

      const [stripeSessLookup, pixelSessLookup] = await Promise.all([
        buildSessionLookup(stripeRaw.map(r => ({ ...r, session_id: r.stripe_session_id }))),
        buildSessionLookup(pixelRaw),
      ]);

      const enrichedStripe = buildStripeFromPurchaseTypeTable(stripeRaw, stripeSessLookup);
      const enrichedPixel  = buildPixelPurchases(pixelRaw, pixelSessLookup);

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
  // sortKey now drives engineInput.sortConfig — the engine sorts before we slice.
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
    sortConfig:          { key: sortKey, direction: 'desc' },
  }), [videos, campaigns, rawEvents, stripePurchases, pixelPurchases, revenueView, dateRange, sortKey]);

  const { sortedVideos, campaignTotals } = useMemo(
    () => getAnalyticsEngine(engineInput),
    [engineInput],
  );

  // Platform post-filter — after engine sort, before 7-row slice
  const filteredVideos = useMemo(
    () => selectedPlatform === 'all'
      ? sortedVideos
      : sortedVideos.filter(r => r.video.platform === selectedPlatform),
    [sortedVideos, selectedPlatform],
  );


  // ── Derived display values ──────────────────────────────────────────────────
  const displayRevenue = useMemo(
    () => selectDisplayRevenue(campaignTotals as any, revenueView),
    [campaignTotals, revenueView],
  );

  const displayRevenueLabel = revenueView === 'stripe' ? 'Verified (Stripe)'
    : revenueView === 'pixel' ? 'Estimated (Pixel)'
    : 'Total (Hybrid)';

  const totalDirectPurchases = campaignTotals.purchase_thankyou;
  const totalOptins          = campaignTotals.newsletter_thankyou;
  const totalCallBooks       = campaignTotals.call_booking_thankyou;

  // Dynamic leaderboard header label — reflects active sort key
  const sortLabel = SORT_OPTIONS.find(o => o.value === sortKey)?.label ?? 'Revenue';


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
      <div className="flex flex-wrap items-center gap-3">

        {/* Revenue source */}
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

        <div className="w-px h-5 bg-zinc-800" />

        {/* Period */}
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

        <div className="w-px h-5 bg-zinc-800" />

        {/* Sort by */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Sort</span>
          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSortKey(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                  sortKey === opt.value ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

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
      <section className="bento-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-900/10 flex justify-between items-center">
          <h2 className="label-caps !text-white">Top Performing Content</h2>
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
            Sorted by {sortLabel}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-950/50 border-b border-zinc-900">
              <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                <th className="pl-4 pr-2 py-3 w-6">#</th>
                <th className="px-4 py-3">Content</th>
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
                    <td colSpan={6} className="px-6 py-6">
                      <div className="h-4 bg-zinc-900 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-600">
                      No content matches the current filters
                    </p>
                  </td>
                </tr>
              ) : (
                filteredVideos.slice(0, 7).map((row, idx) => {
                  const rowRevenue = selectDisplayRevenue(row, revenueView);
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

                      {/* Thumbnail + content identity */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">

                          {/* Thumbnail — full color, hover scale + glow */}
                          <div className="relative flex-shrink-0">
                            <img
                              src={resolveThumbnail(row.video)}
                              className="w-28 aspect-video rounded-lg object-cover border border-zinc-800 transition-all duration-200 hover:scale-105 hover:shadow-[0_0_14px_rgba(255,255,255,0.07)] hover:border-zinc-600"
                            />
                            {row.video.platform && (
                              <span className="absolute -top-1 -right-1 text-[6px] font-black uppercase tracking-wide px-1 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-400 leading-none">
                                {PLATFORM_CONFIG[row.video.platform]?.label ?? row.video.platform.toUpperCase()}
                              </span>
                            )}
                          </div>

                          {/* Content identity + status + added date */}
                          <div className="min-w-0 max-w-[220px]">
                            {/* Platform • identifier — same format as Videos.tsx */}
                            <p className="text-[11px] font-bold truncate leading-snug mb-1">
                              {renderContentIdentity(row.video)}
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
