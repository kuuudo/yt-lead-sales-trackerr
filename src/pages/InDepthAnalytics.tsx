// ─────────────────────────────────────────────────────────────────────────────
// InDepthAnalyticsTest.tsx
//
// ENGINE-POWERED MIRROR of InDepthAnalytics.tsx.
// Route: /analytics/indepth-test
//
// PURPOSE
// ═══════
// Exact behavioral clone of InDepthAnalytics.tsx where all metric computation
// is delegated to getAnalyticsEngine() from analyticsEngine.ts.
// UI is 100% identical — zero visual or UX changes.
// Use for side-by-side parity comparison with /analytics/indepth.
//
// MIGRATION STATUS LEGEND
// ═══════════════════════
// 🟢 ENGINE-DRIVEN    — value comes directly from getAnalyticsEngine() output
// 🟡 LEGACY FALLBACK  — still computed manually; engine does not yet expose this
// 🔴 MISMATCH / GAP   — known divergence or risk area requiring attention
//
// PARITY CONTRACT
// ═══════════════
// Given identical raw data (same Supabase rows) and identical filter state,
// InDepthAnalytics.tsx and InDepthAnalyticsTest.tsx MUST produce:
//   • identical sortedVideos array (same rows, same order, same metric values)
//   • identical table rendering
//   • identical UI behavior (sidebar, toggles, sorting, navigation)
//
// ARCHITECTURE
// ════════════
// Legacy system (InDepthAnalytics.tsx):
//   fetchData() → rawEvents/stripePurchases/pixelPurchases state
//   → useMemo: dateFilteredEvents
//   → useMemo: filteredVideos (campaign/goal/lead-magnet filters)
//   → useMemo: processedVideos (processVideoMetrics per video)
//   → useMemo: sortedVideos (sort by sortConfig)
//   → render table
//
// Engine system (this file):
//   fetchData() → identical raw data → identical enrichment helpers
//   → getAnalyticsEngine(engineInput) handles ALL of the above in one call
//   → sortedVideos = engine.sortedVideos
//   → render table (unchanged)
//
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, Campaign, Video, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// 🟢 ENGINE-DRIVEN — all computation types and helpers come from analyticsEngine.ts
import {
  getAnalyticsEngine,
  buildStripeFromPurchaseTypeTable,
  buildPixelPurchases,
  flattenSessionEvents,
  mergeEventSources,
  handleSortToggle,
  formatCellValue,
  TABLE_COLUMNS,
  COLUMN_LABELS,
  type AnalyticsEngineInput,
  type RawEvent,
  type StripePurchaseRow,
  type PixelPurchaseRow,
  type StripePurchaseTypeRow,
  type DateRange,
  type RevenueView,
  type MetricType,
  type CampaignMeta,
} from '../lib/analyticsEngine';

import {
  BarChart3, Calendar, Filter, ChevronLeft,
  MousePointer2, DollarSign, Users, Phone, Briefcase,
  Activity, User, ArrowUpDown, ExternalLink, Loader2, X,
} from 'lucide-react';


// ─────────────────────────────────────────────────────────────────────────────
// 🟡 LEGACY FALLBACK: buildSessionLookup
//
// WHY: analyticsEngine.ts exposes buildStripeFromPurchaseTypeTable() and
// buildPixelPurchases() which ACCEPT a pre-built sessionLookup Record, but
// does NOT expose the async session-lookup fetch helper itself (it is a
// purely async Supabase operation that does not belong in a deterministic
// engine).  The fetch logic here is verbatim from InDepthAnalytics lines
// 165-181 and must remain here until a separate data-layer module takes over.
//
// MIGRATION PATH: Extract into a shared fetchSessionLookup(rows, supabase)
// utility in the data-layer (e.g. analyticsDataLayer.ts) and import it here
// and from InDepthAnalytics.
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

  // ── Raw data state ──────────────────────────────────────────────────────────
  // 🟡 LEGACY FALLBACK: Raw state shape is identical to InDepthAnalytics.tsx.
  // These are still populated by the same Supabase queries (verbatim fetch
  // logic). The engine ingests them as inputs — it does not own the fetch.
  const [loading, setLoading]               = useState(true);
  const [campaigns, setCampaigns]           = useState<Campaign[]>([]);
  const [videos, setVideos]                 = useState<Video[]>([]);
  const [leadMagnets, setLeadMagnets]       = useState<LeadMagnet[]>([]);
  const [rawEvents, setRawEvents]           = useState<RawEvent[]>([]);
  const [stripePurchases, setStripePurchases] = useState<StripePurchaseRow[]>([]);
  const [pixelPurchases, setPixelPurchases]   = useState<PixelPurchaseRow[]>([]);

  // ── Filter state ────────────────────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: All filter state is passed verbatim into AnalyticsEngineInput.
  // The engine's filteredVideos / dateFilteredEvents steps consume these directly.
  const [dateRange, setDateRange]                   = useState<DateRange>('30days');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [selectedGoals, setSelectedGoals]           = useState<string[]>([]);
  const [selectedLeadMagnets, setSelectedLeadMagnets] = useState<string[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: activeSource and includeEV are passed into AnalyticsEngineInput.
  // 🟡 LEGACY FALLBACK: isSidebarOpen is pure UI — not an engine concern.
  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [includeEV, setIncludeEV]       = useState<boolean>(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // 🟢 ENGINE-DRIVEN: sortConfig is passed into AnalyticsEngineInput and consumed
  // by the engine's sort step (Step 5 in getAnalyticsEngine).
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total_revenue',
    direction: 'desc',
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);


  // ── Data fetching ───────────────────────────────────────────────────────────
  //
  // 🟡 LEGACY FALLBACK: The fetch logic below is verbatim from InDepthAnalytics
  // lines 96-248. The Supabase queries, session-join resolution, stripe enrichment,
  // and pixel enrichment are all identical.
  //
  // 🟢 ENGINE-DRIVEN TRANSITION POINTS:
  //   • buildStripeFromPurchaseTypeTable() — replaces the inline map/filter at
  //     InDepthAnalytics lines 210-226. Engine helper is used directly.
  //   • buildPixelPurchases() — replaces the inline enrichPixelPurchases call at
  //     InDepthAnalytics line 233. Engine helper is used directly.
  //   • flattenSessionEvents() / mergeEventSources() — replace the inline event
  //     flattening at InDepthAnalytics lines 150-162.
  //
  // MIGRATION GAP: The fetch queries themselves, Promise.all parallelism, and
  // buildSessionLookup() are NOT yet in the engine. They remain here until a
  // shared data-layer module is extracted.
  // ─────────────────────────────────────────────────────────────────────────────
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

      // Fetch events + purchases in parallel.
      // NOTE: stripe_purchase_type is the authoritative table — it has payment_type column.
      //       stripe_purchases does NOT have payment_type and is NOT used here.
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

        // Fetch from stripe_purchase_type — this table HAS payment_type column.
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
// ── TEMPORARY DIAGNOSTIC LOGGING — remove after investigation ────────────
console.group('[DIAG] pixel_purchases fetch');

console.log('[DIAG] videoIds (' + videoIds.length + '):', videoIds);
console.log('[DIAG] campaignIds (' + campaignIds.length + '):', campaignIds);
console.log('[DIAG] ppData.data.length:', ppData.data?.length ?? 'NULL (ppData.data is null)');
console.log('[DIAG] ppData.data first 5 rows:', (ppData.data || []).slice(0, 5));

// Cross-check: which pixel_purchase rows in ppData match campaignIds?
const ppMatchingCampaign = (ppData.data || []).filter(
  (r: any) => campaignIds.includes(r.campaign_id)
);
const ppMatchingVideo = (ppData.data || []).filter(
  (r: any) => videoIds.includes(r.video_id)
);
console.log('[DIAG] ppData rows matching campaignIds:', ppMatchingCampaign.length);
console.log('[DIAG] ppData rows matching videoIds:', ppMatchingVideo.length);

// Also verify what the query actually used
console.log('[DIAG] query branch taken:', campaignIds.length ? '.in(campaign_id)' : 'Promise.resolve([]) — campaignIds was EMPTY');

// Show campaign_ids actually present on ppData rows (vs what we queried)
const ppCampaignIdsReturned = [...new Set((ppData.data || []).map((r: any) => r.campaign_id))];
const ppVideoIdsReturned    = [...new Set((ppData.data || []).map((r: any) => r.video_id))];
console.log('[DIAG] distinct campaign_ids on returned rows:', ppCampaignIdsReturned);
console.log('[DIAG] distinct video_ids on returned rows:', ppVideoIdsReturned);

// Supabase error if any
if ((ppData as any).error) {
  console.error('[DIAG] ppData Supabase error:', (ppData as any).error);
}

console.groupEnd();
// ── END TEMPORARY DIAGNOSTIC LOGGING ─────────────────────────────────────
      // 🟢 ENGINE-DRIVEN: flattenSessionEvents() + mergeEventSources() replace
      // the inline event flattening from InDepthAnalytics lines 150-162.
      //
      // Cast to `any[]` here: Supabase's !inner join infers `sessions` as an
      // array ({ video_id, campaign_id }[]) because the join can theoretically
      // return multiple rows per event.  flattenSessionEvents() treats `sessions`
      // as a single object | null (the Supabase runtime always returns a single
      // related row for a to-one join, but the TS type is array).  The cast is
      // safe — flattenSessionEvents accesses `e.sessions?.video_id` which works
      // on both the array-of-one and the object shapes at runtime.
      const sessionResolvedEvents = flattenSessionEvents(eViaSessionData.data as any[] || []);
      const allEvents = mergeEventSources(eDirectData.data || [], sessionResolvedEvents);

      // 🟡 LEGACY FALLBACK: buildSessionLookup is not yet in the engine (async Supabase op).
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

      // 🟢 ENGINE-DRIVEN: buildStripeFromPurchaseTypeTable() replaces the inline
      // stripe enrichment at InDepthAnalytics lines 186-226. Identical rules:
      //   • Exclude payment_type='test'
      //   • Coerce amount via parseFloat(String(…))
      //   • Resolve missing video_id/campaign_id via session lookup
      //   • Drop rows where amount <= 0
      //   • revenue_type: 'consultation' if payment_type='consultation', else 'offer'
      const enrichedStripe = buildStripeFromPurchaseTypeTable(stripeRaw, stripeSessLookup);

      // 🟢 ENGINE-DRIVEN: buildPixelPurchases() replaces the inline pixel enrichment
      // at InDepthAnalytics lines 229-233. Coerces amounts + enrichPixelPurchases().
      const enrichedPixel = buildPixelPurchases(pixelRaw, pixelSessLookup);

      console.log('[InDepthAnalyticsTest] events direct:', eDirectData.data?.length ?? 0,
        '| via session:', sessionResolvedEvents.length,
        '| total:', allEvents.length);
      console.log('[InDepthAnalyticsTest] stripe enriched:', enrichedStripe.length,
        '| pixel enriched:', enrichedPixel.length);

      setRawEvents(allEvents);
      setStripePurchases(enrichedStripe);
      setPixelPurchases(enrichedPixel);
    } catch (err) {
      console.error('[InDepthAnalyticsTest] fetchData error:', err);
    } finally {
      setLoading(false);
    }
  };


  // ── Engine input ──────────────────────────────────────────────────────────────
  //
  // 🟢 ENGINE-DRIVEN: Assembles the AnalyticsEngineInput from current state.
  // This replaces ALL of the following useMemo blocks in InDepthAnalytics.tsx:
  //   • dateFilteredEvents  (filterEventsByDate)
  //   • filteredVideos      (campaign/goal/lead-magnet filter)
  //   • processedVideos     (processVideoMetrics per video)
  //   • sortedVideos        (sort by sortConfig)
  //
  // getAnalyticsEngine() runs all four steps deterministically and returns
  // sortedVideos with identical metric values and row order.
  // ─────────────────────────────────────────────────────────────────────────────
  const engineInput = useMemo((): AnalyticsEngineInput => ({
    videos:              videos as AnalyticsEngineInput['videos'],
    campaigns:           campaigns as CampaignMeta[],
    rawEvents,
    stripePurchases,
    pixelPurchases,
    dateRange,
    selectedCampaignId,
    selectedGoals,
    selectedLeadMagnets,
    activeSource,
    includeEV,
    sortConfig,
  }), [
    videos, campaigns, rawEvents, stripePurchases, pixelPurchases,
    dateRange, selectedCampaignId, selectedGoals, selectedLeadMagnets,
    activeSource, includeEV, sortConfig,
  ]);

  // 🟢 ENGINE-DRIVEN: Single engine call — replaces four useMemo blocks.
  const engineResult = useMemo(() => getAnalyticsEngine(engineInput), [engineInput]);

  // 🟢 ENGINE-DRIVEN: sortedVideos is the engine's primary output.
  // Direct replacement for InDepthAnalytics's sortedVideos useMemo.
  const sortedVideos = engineResult.sortedVideos;


  // ── Sort handler ──────────────────────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: handleSortToggle() from analyticsEngine.ts is the exact
  // logic from InDepthAnalytics lines 330-335. Passed into setSortConfig.
  const handleSort = (key: string) => {
    setSortConfig(prev => handleSortToggle(prev, key));
  };


  // ── Cell formatter ────────────────────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: formatCellValue() from analyticsEngine.ts is the verbatim
  // implementation from InDepthAnalytics lines 340-347.
  // Signature: (key: MetricType, row: ProcessedVideoRow) => string


  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="animate-spin text-red-600" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      {/*
       * 🟡 LEGACY FALLBACK: Sidebar filter UI is pure render logic.
       * All filter state (dateRange, selectedCampaignId, selectedGoals,
       * selectedLeadMagnets, includeEV) flows into engineInput → engine.
       * The sidebar itself has no migration dependency.
       */}
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
                onChange={e => setDateRange(e.target.value as DateRange)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="2months">Last 2 Months</option>
                <option value="6months">Last 6 Months</option>
                <option value="1year">Last Year</option>
                <option value="all">Lifetime</option>
              </select>
              <Calendar size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            </div>
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

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">

        {/* Header */}
        <header className="h-20 bg-zinc-950 border-b border-zinc-900 flex items-center justify-between px-8 shrink-0">
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

          <div className="flex items-center gap-4">
            {/* Data source toggle — controls ALL metrics globally */}
            {/* 🟢 ENGINE-DRIVEN: activeSource feeds directly into AnalyticsEngineInput */}
            <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
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
            <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-900 rounded-xl">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                {/* 🟢 ENGINE-DRIVEN: sortedVideos.length from engine output */}
                {sortedVideos.length} Videos Loaded
              </span>
            </div>
          </div>
        </header>

        {/* Table */}
        {/*
         * 🟢 ENGINE-DRIVEN: sortedVideos, formatCellValue, TABLE_COLUMNS, COLUMN_LABELS
         * all come from analyticsEngine.ts. Row order and metric values are
         * 100% engine-owned — this block is pure rendering.
         *
         * 🟡 LEGACY FALLBACK: row.video.thumbnail_url, row.title, row.campaign
         * are passed through from the raw Video/Campaign objects stored in state.
         * The engine preserves them in ProcessedVideoRow.video — no migration gap.
         */}
        <div className="flex-1 overflow-x-auto custom-scrollbar">
          <div className="inline-block min-w-full align-middle h-full overflow-y-auto">
            <table className="min-w-full divide-y divide-zinc-900 border-collapse">
              <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
                <tr>
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[300px] sticky left-0 z-30">
                    Video
                  </th>
                  {TABLE_COLUMNS.map(key => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 cursor-pointer hover:text-white transition-colors group bg-zinc-950 min-w-[180px]"
                    >
                      <div className="flex items-center gap-2">
                        {COLUMN_LABELS[key]}
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
                  <th className="px-6 py-5 border-b border-zinc-900 bg-zinc-950" />
                </tr>
              </thead>

              <tbody className="bg-black divide-y divide-zinc-900">
                {sortedVideos.map(row => (
                  <tr key={row.video.id} className="hover:bg-zinc-950 transition-colors group">
                    {/* Sticky video cell */}
                    <td className="px-6 py-5 whitespace-nowrap sticky left-0 z-10 bg-black group-hover:bg-zinc-950 transition-colors">
                      <div className="flex items-center gap-4">
                        <img
                          src={row.video.thumbnail_url}
                          className="w-16 h-9 object-cover rounded border border-zinc-800"
                          alt=""
                        />
                        <div className="max-w-[200px]">
                          <div className="text-xs font-black text-white truncate">
                            {row.title || 'Untitled Video'}
                          </div>
                          <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                            {(row.campaign as any)?.campaign_name || 'Individual Video'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Metric cells — 🟢 ENGINE-DRIVEN via formatCellValue() */}
                    {TABLE_COLUMNS.map(key => (
                      <td
                        key={key}
                        className="px-6 py-5 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums"
                      >
                        {key === 'total_revenue' ? (
                          <div>
                            <div>{formatCellValue(key, row)}</div>
                            {/* 🟢 ENGINE-DRIVEN: revenue_mode_label from VideoMetrics */}
                            <div className="text-[8px] text-zinc-600 uppercase tracking-widest mt-0.5">
                              {row.revenue_mode_label}
                            </div>
                          </div>
                        ) : (
                          formatCellValue(key, row)
                        )}
                      </td>
                    ))}

                    {/* Nav cell */}
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <button
                        onClick={() => navigate(`/videos/${row.video.id}`)}
                        className="p-2 border border-zinc-800 rounded-xl text-zinc-600 hover:text-white hover:border-zinc-700 transition-all"
                      >
                        <ExternalLink size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
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
