// ─────────────────────────────────────────────────────────────────────────────
// InDepthAnalyticsTest.tsx  (UI-upgraded)
//
// ENGINE-POWERED MIRROR of InDepthAnalytics.tsx.
// Route: /analytics/indepth-test
//
// UI CHANGES vs previous version
// ════════════════════════════════
// 1. Content identity cell — resolveThumbnail() + renderContentIdentity()
//    from videoFormatters.tsx. Identical to Dashboard leaderboard + Videos list.
// 2. Platform filter pills — multi-select, derives from live sortedVideos data.
//    Uses PLATFORM_CONFIG from platformParser for labels/colors.
// 3. COLUMNS toggle — dropdown to show/hide individual columns.
//    Core TABLE_COLUMNS default ON. 4 conversion rate columns default OFF.
// 4. 4 conversion rate columns — Newsletter Opt-in Rate, Call Booking Rate,
//    Consultation Rate, Purchase Rate. Same rate() formula as VideoDetail.tsx.
// 5. Quick sort buttons — Revenue, Consultations, Purchases, Calls, Clicks,
//    Opt-ins. Map to existing sortConfig keys.
//
// PARITY CONTRACT (unchanged)
// ═══════════════════════════
// All metric computation is still 100% engine-driven. Zero analytics logic
// was added or modified. Engine inputs/outputs are identical.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, Campaign, Video, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';

import {
  getAnalyticsEngine,
  buildStripeFromPurchaseTypeTable,
  buildPixelPurchases,
  flattenSessionEvents,
  mergeEventSources,
  handleSortToggle,
  formatCellValue,
  getDateBounds,
  TABLE_COLUMNS,
  COLUMN_LABELS,
  type AnalyticsEngineInput,
  type RawEvent,
  type StripePurchaseRow,
  type PixelPurchaseRow,
  type StripePurchaseTypeRow,
  type DateRange,
  type CustomDateRange,
  type RevenueView,
  type MetricType,
  type CampaignMeta,
} from '../lib/analyticsEngine';

// ── Shared platform helpers ───────────────────────────────────────────────────
import {
  resolveThumbnail,
  renderContentIdentity,
} from '../lib/videoFormatters';

import {
  PLATFORM_CONFIG,
  type Platform,
} from '../lib/platformParser';

import {
  BarChart3, Calendar, Filter, ChevronLeft,
  MousePointer2, DollarSign, Users, Phone, Briefcase,
  Activity, User, ArrowUpDown, ExternalLink, Loader2, X,
  Columns, Check, ChevronDown,
} from 'lucide-react';


// ─────────────────────────────────────────────────────────────────────────────
// Conversion rate columns
// Computed from fields already present on ProcessedVideoRow (VideoMetricsResult).
// Same rate() formula as VideoDetail.tsx lines 471-472. No engine changes.
// ─────────────────────────────────────────────────────────────────────────────

const convRate = (conversions: number, clicks: number): string => {
  if (!clicks || clicks <= 0) return '—';
  return `${((conversions / clicks) * 100).toFixed(1)}%`;
};

type ConversionRateKey =
  | 'newsletter_optin_rate'
  | 'call_booking_rate'
  | 'consultation_rate'
  | 'purchase_rate';

const CONVERSION_RATE_COLUMNS: ConversionRateKey[] = [
  'newsletter_optin_rate',
  'call_booking_rate',
  'consultation_rate',
  'purchase_rate',
];

const CONVERSION_RATE_LABELS: Record<ConversionRateKey, string> = {
  newsletter_optin_rate: 'Newsletter Opt-in Rate',
  call_booking_rate:     'Call Booking Rate',
  consultation_rate:     'Consultation Rate',
  purchase_rate:         'Purchase Rate',
};

function getConversionRate(key: ConversionRateKey, row: any): string {
  switch (key) {
    case 'newsletter_optin_rate':
      return convRate(row.newsletter_thankyou ?? 0, row.newsletter_click ?? 0);
    case 'call_booking_rate':
      return convRate(row.call_booking_thankyou ?? 0, row.call_booking_click ?? 0);
    case 'consultation_rate':
      return convRate(row.consultation_thankyou ?? 0, row.consultation_click ?? 0);
    case 'purchase_rate':
      return convRate(row.purchase_thankyou ?? 0, row.landing_page_view ?? 0);
    default:
      return '—';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick sort shortcuts
// ─────────────────────────────────────────────────────────────────────────────

const SORT_SHORTCUTS: { label: string; key: string }[] = [
  { label: 'Revenue',       key: 'total_revenue' },
  { label: 'Consultations', key: 'consultation_thankyou' },
  { label: 'Purchases',     key: 'purchase_thankyou' },
  { label: 'Calls',         key: 'call_booking_thankyou' },
  { label: 'Clicks',        key: 'unique_clicks' },
  { label: 'Opt-ins',       key: 'newsletter_thankyou' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Default column visibility
// TABLE_COLUMNS (engine) — all ON by default
// CONVERSION_RATE_COLUMNS — all OFF by default
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_VISIBLE = new Set<string>([
  ...TABLE_COLUMNS,
]);


// ─────────────────────────────────────────────────────────────────────────────
// 🟡 LEGACY FALLBACK: buildSessionLookup (unchanged from previous version)
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
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function InDepthAnalyticsTest() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Raw data state (unchanged) ───────────────────────────────────────────
  const [loading, setLoading]                 = useState(true);
  const [campaigns, setCampaigns]             = useState<Campaign[]>([]);
  const [videos, setVideos]                   = useState<Video[]>([]);
  const [leadMagnets, setLeadMagnets]         = useState<LeadMagnet[]>([]);
  const [rawEvents, setRawEvents]             = useState<RawEvent[]>([]);
  const [stripePurchases, setStripePurchases] = useState<StripePurchaseRow[]>([]);
  const [pixelPurchases, setPixelPurchases]   = useState<PixelPurchaseRow[]>([]);

  // ── Filter state (unchanged) ─────────────────────────────────────────────
  const [dateRange, setDateRange]                     = useState<DateRange>('30days');
  // Custom date range — only populated/used when dateRange === 'custom'.
  const [customRange, setCustomRange]                 = useState<CustomDateRange | null>(null);
  const [selectedCampaignId, setSelectedCampaignId]   = useState<string>('all');
  const [selectedGoals, setSelectedGoals]             = useState<string[]>([]);
  const [selectedLeadMagnets, setSelectedLeadMagnets] = useState<string[]>([]);

  // ── UI state (unchanged) ─────────────────────────────────────────────────
  const [activeSource, setActiveSource]   = useState<RevenueView>('total');
  const [includeEV, setIncludeEV]         = useState<boolean>(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sortConfig, setSortConfig]       = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total_revenue',
    direction: 'desc',
  });

  // ── New UI state ─────────────────────────────────────────────────────────
  // Platform filter: [] means "All"
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));
  // Columns dropdown open
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  // Close columns dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (user) fetchData();
  }, [user?.id]);


  // ── Data fetching (unchanged) ────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: cData } = await supabase.from('campaigns').select('*').eq('user_id', user?.id);
      const { data: vData } = await supabase.from('videos').select('*').eq('user_id', user?.id);
      const { data: lmData } = await supabase.from('lead_magnets').select('*');

      setCampaigns(cData || []);
      setVideos(vData || []);
      setLeadMagnets(lmData || []);

      if (!vData || vData.length === 0) return;

      const videoIds    = vData.map((v: any) => v.id);
      const campaignIds = vData.map((v: any) => v.campaign_id).filter(Boolean);

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
    } catch (err) {
      console.error('[InDepthAnalytics] fetchData error:', err);
    } finally {
      setLoading(false);
    }
  };


  // ── Engine input (unchanged) ─────────────────────────────────────────────
  const engineInput = useMemo((): AnalyticsEngineInput => ({
    videos:              videos as AnalyticsEngineInput['videos'],
    campaigns:           campaigns as CampaignMeta[],
    rawEvents,
    stripePurchases,
    pixelPurchases,
    dateRange,
    customRange,
    selectedCampaignId,
    selectedGoals,
    selectedLeadMagnets,
    activeSource,
    includeEV,
    sortConfig,
  }), [
    videos, campaigns, rawEvents, stripePurchases, pixelPurchases,
    dateRange, customRange, selectedCampaignId, selectedGoals, selectedLeadMagnets,
    activeSource, includeEV, sortConfig,
  ]);

  const engineResult  = useMemo(() => getAnalyticsEngine(engineInput), [engineInput]);
  const engineSorted  = engineResult.sortedVideos;

  // ── In-range indicator bounds (UI-only — does NOT filter rows) ───────────
  // Reuses the same start/end window the engine applies to events, purely to
  // visually flag which videos were uploaded within the selected dateRange.
  const dateRangeBounds = useMemo(() => getDateBounds(dateRange, customRange), [dateRange, customRange]);

  // ── Platform filter (applied after engine, pure UI) ──────────────────────
  const sortedVideos = useMemo(() => {
    if (selectedPlatforms.length === 0) return engineSorted;
    return engineSorted.filter(row =>
      selectedPlatforms.includes(row.video.platform ?? 'youtube'),
    );
  }, [engineSorted, selectedPlatforms]);

  // Derive present platforms from full engine output (not filtered)
  const presentPlatforms = useMemo(() => {
    const seen = new Set<string>();
    engineSorted.forEach(row => seen.add(row.video.platform ?? 'youtube'));
    return Array.from(seen).sort();
  }, [engineSorted]);

  // ── Sort handler (unchanged) ─────────────────────────────────────────────
  const handleSort = (key: string) => {
    setSortConfig(prev => handleSortToggle(prev, key));
  };

  // ── Column toggle helpers ────────────────────────────────────────────────
  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allColumnKeys = [...TABLE_COLUMNS, ...CONVERSION_RATE_COLUMNS];


  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="animate-spin text-red-600" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">

      {/* ── Sidebar (unchanged) ─────────────────────────────────────────── */}
      <aside
        className={`w-80 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0 transition-all duration-300 ${
          isSidebarOpen ? 'ml-0' : '-ml-80'
        } lg:relative z-50`}
      >
        <div className="flex items-center justify-between p-6 border-b border-zinc-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
              <User size={16} className="text-zinc-500" />
            </div>
            <div className="truncate">
              <h3 className="text-xs font-black text-white truncate max-w-[150px]">
                {user?.email?.split('@')[0]}
              </h3>
              <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest leading-none">
                Creator Studio
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 text-zinc-500 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar space-y-8">

          {/* Date range */}
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

            {/* Custom range pickers — only shown when dateRange === 'custom' */}
            {dateRange === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1.5 block">
                    Start
                  </label>
                  <input
                    type="date"
                    value={typeof customRange?.start === 'string' ? customRange.start : ''}
                    max={typeof customRange?.end === 'string' ? customRange.end : undefined}
                    onChange={e => {
                      const start = e.target.value;
                      setCustomRange(prev => ({
                        start,
                        end: (typeof prev?.end === 'string' && prev.end) || start,
                      }));
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-red-600 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1.5 block">
                    End
                  </label>
                  <input
                    type="date"
                    value={typeof customRange?.end === 'string' ? customRange.end : ''}
                    min={typeof customRange?.start === 'string' ? customRange.start : undefined}
                    onChange={e => {
                      const end = e.target.value;
                      setCustomRange(prev => ({
                        start: (typeof prev?.start === 'string' && prev.start) || end,
                        end,
                      }));
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-red-600 [color-scheme:dark]"
                  />
                </div>
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
                onChange={e => setSelectedCampaignId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer truncate pr-10"
              >
                <option value="all">All Campaigns</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.campaign_name}</option>
                ))}
              </select>
              <Briefcase size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            </div>
          </div>

          {/* Goal filter */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Filter by Goal
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'sales',      label: 'Direct Sales' },
                { id: 'newsletter', label: 'Newsletter' },
                { id: 'calls',      label: 'Sales Calls' },
                { id: 'consult',    label: 'Paid Consult' },
                { id: 'viral',      label: 'Awareness' },
              ].map(goal => (
                <button
                  key={goal.id}
                  onClick={() =>
                    setSelectedGoals(prev =>
                      prev.includes(goal.id)
                        ? prev.filter(g => g !== goal.id)
                        : [...prev, goal.id],
                    )
                  }
                  className={`px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${
                    selectedGoals.includes(goal.id)
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  {goal.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lead magnet filter */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Filter by Lead Magnet
            </label>
            <div className="space-y-1.5 overflow-y-auto pr-2 custom-scrollbar">
              {leadMagnets
                .filter(lm => selectedCampaignId === 'all' || lm.campaign_id === selectedCampaignId)
                .map(lm => (
                  <button
                    key={lm.id}
                    onClick={() =>
                      setSelectedLeadMagnets(prev =>
                        prev.includes(lm.id)
                          ? prev.filter(id => id !== lm.id)
                          : [...prev, lm.id],
                      )
                    }
                    className={`w-full text-left p-2 rounded-lg text-[9px] font-bold uppercase truncate transition-all ${
                      selectedLeadMagnets.includes(lm.id)
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {lm.lead_magnet_name}
                  </button>
                ))}
            </div>
          </div>

          {/* EV toggle */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Est. Call Revenue (EV)
            </label>
            <button
              onClick={() => setIncludeEV(v => !v)}
              className={`w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                includeEV
                  ? 'bg-zinc-700 border-zinc-600 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
              }`}
            >
              {includeEV ? 'EV Included' : 'EV Excluded'}
            </button>
          </div>

        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="bg-zinc-950 border-b border-zinc-900 px-8 shrink-0">

          {/* Top row: nav + title + source toggle + counters */}
          <div className="h-20 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={() => navigate(-1)}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all flex items-center gap-2 cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all hidden lg:flex"
              >
                <Filter size={20} />
              </button>
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                  In-Depth Analytics
                </h2>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                  Exhaustive performance data for all videos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Source toggle */}
              <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                {(['total', 'pixel', 'stripe'] as RevenueView[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setActiveSource(v)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      activeSource === v ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* COLUMNS dropdown */}
              <div className="relative" ref={columnsRef}>
                <button
                  onClick={() => setColumnsOpen(o => !o)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                    columnsOpen
                      ? 'bg-zinc-800 border-zinc-700 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Columns size={13} />
                  Columns
                  <ChevronDown size={11} className={`transition-transform ${columnsOpen ? 'rotate-180' : ''}`} />
                </button>

                {columnsOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    {/* Core metrics group */}
                    <div className="px-4 pt-4 pb-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-2">
                        Core Metrics
                      </p>
                      <div className="space-y-0.5">
                        {TABLE_COLUMNS.map(key => (
                          <button
                            key={key}
                            onClick={() => toggleColumn(key)}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                              visibleColumns.has(key)
                                ? 'bg-red-600 border-red-600'
                                : 'border-zinc-700 bg-zinc-950'
                            }`}>
                              {visibleColumns.has(key) && <Check size={9} className="text-white" />}
                            </div>
                            <span className="text-[10px] font-bold text-zinc-300 truncate">
                              {COLUMN_LABELS[key as MetricType]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Conversion rates group */}
                    <div className="px-4 pt-2 pb-4 border-t border-zinc-800 mt-1">
                      <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-2 mt-2">
                        Conversion Rates
                      </p>
                      <div className="space-y-0.5">
                        {CONVERSION_RATE_COLUMNS.map(key => (
                          <button
                            key={key}
                            onClick={() => toggleColumn(key)}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                              visibleColumns.has(key)
                                ? 'bg-red-600 border-red-600'
                                : 'border-zinc-700 bg-zinc-950'
                            }`}>
                              {visibleColumns.has(key) && <Check size={9} className="text-white" />}
                            </div>
                            <span className="text-[10px] font-bold text-zinc-300 truncate">
                              {CONVERSION_RATE_LABELS[key]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Video count */}
              <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-900 rounded-xl">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  {sortedVideos.length} Videos
                </span>
              </div>
            </div>
          </div>

          {/* Second row: platform filter + quick sort */}
          <div className="pb-4 flex flex-wrap items-center justify-between gap-3">

            {/* Platform filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* "All" pill */}
              <button
                onClick={() => setSelectedPlatforms([])}
                className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                  selectedPlatforms.length === 0
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                All
                <span className={`ml-1.5 text-[8px] px-1 py-0.5 rounded font-black ${
                  selectedPlatforms.length === 0 ? 'bg-black/20 text-white' : 'bg-zinc-800 text-zinc-600'
                }`}>
                  {engineSorted.length}
                </span>
              </button>

              {presentPlatforms.map(p => {
                const cfg    = PLATFORM_CONFIG[p as Platform];
                const label  = cfg?.label ?? p;
                const color  = cfg?.color ?? '#dc2626';
                const active = selectedPlatforms.includes(p);
                const count  = engineSorted.filter(r => (r.video.platform ?? 'youtube') === p).length;
                return (
                  <button
                    key={p}
                    onClick={() =>
                      setSelectedPlatforms(prev =>
                        prev.includes(p)
                          ? prev.filter(x => x !== p)
                          : [...prev, p],
                      )
                    }
                    style={active ? { backgroundColor: color, borderColor: color } : {}}
                    className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                      active
                        ? 'text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {cfg?.icon && <span className="opacity-70 text-[10px]">{cfg.icon}</span>}
                    {label}
                    <span className={`text-[8px] px-1 py-0.5 rounded font-black ${
                      active ? 'bg-black/20 text-white' : 'bg-zinc-800 text-zinc-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick sort buttons */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-700 mr-1">
                Sort
              </span>
              {SORT_SHORTCUTS.map(s => {
                const active = sortConfig.key === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSortConfig({ key: s.key, direction: 'desc' })}
                    className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                      active
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

          </div>
        </header>

        {/* ── Table ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-x-auto custom-scrollbar">
          <div className="inline-block min-w-full align-middle h-full overflow-y-auto">
            <table className="min-w-full divide-y divide-zinc-900 border-collapse">
              <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
                <tr>
                  {/* Sticky content identity header */}
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[300px] sticky left-0 z-30">
                    Content
                  </th>

                  {/* Engine columns — conditionally rendered */}
                  {TABLE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 cursor-pointer hover:text-white transition-colors group bg-zinc-950 min-w-[160px]"
                    >
                      <div className="flex items-center gap-2">
                        {COLUMN_LABELS[key as MetricType]}
                        <ArrowUpDown
                          size={10}
                          className={
                            sortConfig.key === key
                              ? 'text-red-500'
                              : 'text-zinc-800 group-hover:text-zinc-600'
                          }
                        />
                      </div>
                    </th>
                  ))}

                  {/* Conversion rate columns — conditionally rendered */}
                  {CONVERSION_RATE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => (
                    <th
                      key={key}
                      className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-zinc-900 bg-zinc-950 min-w-[160px]"
                    >
                      <div className="flex items-center gap-2">
                        {CONVERSION_RATE_LABELS[key]}
                        {/* Conversion rate columns are not sortable — no engine sort key */}
                      </div>
                    </th>
                  ))}

                  <th className="px-6 py-5 border-b border-zinc-900 bg-zinc-950" />
                </tr>
              </thead>

              <tbody className="bg-black divide-y divide-zinc-900">
                {sortedVideos.map(row => {
                  // UI-only indicator: was this video uploaded within the
                  // currently selected dateRange window? Does NOT affect
                  // which rows render or how metrics are computed.
                  const createdAt = row.video.created_at;
                  const inRange = dateRange !== 'all' && !!createdAt &&
                    new Date(createdAt) >= dateRangeBounds.start &&
                    new Date(createdAt) <= dateRangeBounds.end;

                  return (
                  <tr
                    key={row.video.id}
                    className={`hover:bg-zinc-950 transition-colors group ${
                      inRange ? 'bg-emerald-500/[0.04] border-l-2 border-l-emerald-500/50' : ''
                    }`}
                  >

                    {/* ── Content identity cell ────────────────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 z-10 bg-black group-hover:bg-zinc-950 transition-colors">
                      <div className="flex items-center gap-3">
                        {/* Thumbnail via shared resolveThumbnail() */}
                        <img
                          src={resolveThumbnail(row.video)}
                          className="w-16 h-9 object-cover rounded-lg border border-zinc-800 shrink-0"
                          alt=""
                          onError={e => {
                            // Final safety net: if the resolved URL itself 404s, show placeholder
                            const t = e.currentTarget;
                            t.onerror = null;
                            t.src = `https://placehold.co/64x36/18181b/52525b?text=${encodeURIComponent(
                              (row.video.platform ?? 'post').toUpperCase(),
                            )}`;
                          }}
                        />
                        {/* Platform identity via shared renderContentIdentity() */}
                        <div className="max-w-[220px] min-w-0">
                          <div className="text-xs font-bold truncate leading-snug flex items-center gap-1.5">
                            <span className="truncate">{renderContentIdentity(row.video)}</span>
                            {inRange && (
                              <span
                                title="Uploaded within selected period"
                                className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[8px] font-black uppercase tracking-widest text-emerald-400"
                              >
                                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                                In range
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5 truncate">
                            {(row.campaign as any)?.campaign_name || 'Individual Video'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* ── Engine metric cells (unchanged logic) ────────── */}
                    {TABLE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => (
                      <td
                        key={key}
                        className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums"
                      >
                        {key === 'total_revenue' ? (
                          <div>
                            <div>{formatCellValue(key, row)}</div>
                            <div className="text-[8px] text-zinc-600 uppercase tracking-widest mt-0.5">
                              {row.revenue_mode_label}
                            </div>
                          </div>
                        ) : (
                          formatCellValue(key, row)
                        )}
                      </td>
                    ))}

                    {/* ── Conversion rate cells ────────────────────────── */}
                    {CONVERSION_RATE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => (
                      <td
                        key={key}
                        className="px-6 py-4 whitespace-nowrap text-sm font-bold tabular-nums"
                      >
                        <span className={
                          getConversionRate(key, row) === '—'
                            ? 'text-zinc-700'
                            : 'text-emerald-400'
                        }>
                          {getConversionRate(key, row)}
                        </span>
                      </td>
                    ))}

                    {/* ── Nav cell ─────────────────────────────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => navigate(`/videos/${row.video.id}`)}
                        className="p-2 border border-zinc-800 rounded-xl text-zinc-600 hover:text-white hover:border-zinc-700 transition-all"
                      >
                        <ExternalLink size={14} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>

            {sortedVideos.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 bg-black">
                <BarChart3 size={40} className="text-zinc-800 mb-4" />
                <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">
                  No matching videos found
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

