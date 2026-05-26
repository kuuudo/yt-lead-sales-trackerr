// ─────────────────────────────────────────────────────────────────────────────
// DashboardTest.tsx
//
// ENGINE-POWERED MIRROR of Dashboard.tsx.
// Route: /dashboard-test
//
// PURPOSE
// ═══════
// Engine-powered clone of Dashboard.tsx where ALL metric computation is
// delegated to getAnalyticsEngine() from analyticsEngine.ts.
// Used for side-by-side parity comparison with /dashboard.
//
// MIGRATION STATUS LEGEND
// ═══════════════════════
// 🟢 ENGINE-DRIVEN    — value comes directly from getAnalyticsEngine() output
// 🟡 LEGACY FALLBACK  — still outside engine scope (async Supabase ops, UI-only)
// 🔴 MISMATCH / TODO  — known divergence or risk area requiring attention
//
// UI DELTA vs Dashboard.tsx (intentional — not parity breaks)
// ═══════════════════════════════════════════════════════════
// ❌ REMOVED:  "Revenue Per Click" metric card
// ✅ ADDED:    "Direct Purchase"           → engine: campaignTotals.purchase_thankyou
// ✅ ADDED:    "Paid Consultation Booked"  → engine: campaignTotals.consultation_thankyou
// ✅ ADDED:    Campaign filter dropdown    → selectedCampaignId → engine input
// ✅ CHANGED:  Source toggle order fixed   → TOTAL → PIXEL → STRIPE (was STRIPE → PIXEL → TOTAL)
// ✅ CHANGED:  Source toggle default       → 'total' (was 'stripe')
//
// PARITY CONTRACT (for identical filter state)
// ════════════════════════════════════════════
// Given identical raw data and activeSource + selectedCampaignId, the engine
// output MUST match what Dashboard.tsx's legacy processVideoMetrics() would
// compute for the same source / campaign scope.
//
// ARCHITECTURE
// ════════════
// Legacy (Dashboard.tsx):
//   fetchData() → stats[]  (per-video AnalyticsRow via processVideoMetrics)
//   → useMemo totals
//   → render
//
// Engine (this file):
//   fetchData() → rawEvents / stripePurchases / pixelPurchases / videos / campaigns
//   → getAnalyticsEngine(engineInput)
//   → engineResult.sortedVideos  (per-video rows)
//   → engineResult.campaignTotals (aggregate — replaces useMemo totals)
//   → render
//
// FETCH NOTES
// ═══════════
// Dashboard.tsx fetches from stripe_purchases (NO payment_type column).
// InDepthAnalyticsTest fetches from stripe_purchase_type (HAS payment_type).
// 🔴 MISMATCH: DashboardTest adopts the stripe_purchase_type table (engine pattern)
//    for correct revenue_type classification. Parity with legacy Dashboard revenue
//    numbers may differ when payment_type classification diverges.
//    Add a console.warn() note to surface this during validation.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../lib/hooks';
import { supabase, Video, Campaign } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  LayoutDashboard, TrendingUp, Target, Users, DollarSign,
  Activity, AlertCircle, CheckCircle2, ArrowRight, Video as VideoIcon,
  ShoppingCart, Briefcase, ChevronDown,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate, Link } from 'react-router-dom';
import { Modal } from '../components/Modal';

// 🟢 ENGINE-DRIVEN — all metric computation, types, and helpers
import {
  getAnalyticsEngine,
  buildStripeFromPurchaseTypeTable,
  buildPixelPurchases,
  flattenSessionEvents,
  mergeEventSources,
  type AnalyticsEngineInput,
  type RawEvent,
  type StripePurchaseRow,
  type PixelPurchaseRow,
  type StripePurchaseTypeRow,
  type RevenueView,
  type CampaignMeta,
} from '../lib/analyticsEngine';


// ─────────────────────────────────────────────────────────────────────────────
// 🟡 LEGACY FALLBACK: buildSessionLookup
//
// Async Supabase fetch — not in the engine (same rationale as InDepthAnalyticsTest).
// Verbatim copy from InDepthAnalyticsTest lines 94-110.
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

export default function DashboardTest() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Raw data state ────────────────────────────────────────────────────────
  // 🟡 LEGACY FALLBACK: Supabase fetch owns these — engine ingests them as input.
  const [loading, setLoading]                   = useState(true);
  const [videos, setVideos]                     = useState<Video[]>([]);
  const [campaigns, setCampaigns]               = useState<Campaign[]>([]);
  const [rawEvents, setRawEvents]               = useState<RawEvent[]>([]);
  const [stripePurchases, setStripePurchases]   = useState<StripePurchaseRow[]>([]);
  const [pixelPurchases, setPixelPurchases]     = useState<PixelPurchaseRow[]>([]);

  // ── Filter / UI state ─────────────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: All of these feed directly into AnalyticsEngineInput.

  // Source toggle — TOTAL → PIXEL → STRIPE order, default: 'total'
  const [activeSource, setActiveSource]               = useState<RevenueView>('total');

  // Campaign filter — 'all' or a specific campaign id
  const [selectedCampaignId, setSelectedCampaignId]   = useState<string>('all');

  // Sort: dashboard default is revenue descending (matches legacy Dashboard sort)
  const [sortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total_revenue',
    direction: 'desc',
  });

  // ── Modal state ───────────────────────────────────────────────────────────
  // 🟡 LEGACY FALLBACK: Pure UI — not an engine concern.
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

  const showAlert = (
    title: string,
    message: string,
    variant: 'info' | 'danger' | 'success' = 'info',
  ) => {
    setModalConfig({ isOpen: true, title, message, variant });
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);


  // ── Data fetching ───────────────────────────────────────────────────────────
  //
  // 🟡 LEGACY FALLBACK: Supabase queries.
  // 🟢 ENGINE-DRIVEN TRANSITION POINTS:
  //   • buildStripeFromPurchaseTypeTable() — engine helper for stripe enrichment
  //   • buildPixelPurchases()             — engine helper for pixel enrichment
  //   • flattenSessionEvents()            — engine helper for session-joined events
  //   • mergeEventSources()              — engine helper to merge event arrays
  //
  // 🔴 MISMATCH NOTE: Dashboard.tsx fetches from 'stripe_purchases' (no payment_type).
  //    DashboardTest uses 'stripe_purchase_type' (has payment_type) — matching the
  //    InDepthAnalyticsTest pattern. Revenue classification accuracy is HIGHER here
  //    but totals may diverge from legacy Dashboard when payment_type differs.
  //    Check console for [DashboardTest] stripe enriched count during validation.
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: cData } = await supabase.from('campaigns').select('*').eq('user_id', user?.id);
      const { data: vData } = await supabase.from('videos').select('*').eq('user_id', user?.id);

      setCampaigns(cData || []);
      setVideos(vData || []);

      if (!vData || vData.length === 0) {
        setLoading(false);
        return;
      }

      const videoIds    = vData.map((v: any) => v.id);
      const campaignIds = vData.map((v: any) => v.campaign_id).filter(Boolean);

      // Fetch events + purchases in parallel — identical pattern to InDepthAnalyticsTest.
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

        // 🔴 MISMATCH vs Dashboard.tsx: Using stripe_purchase_type (has payment_type)
        //    instead of stripe_purchases (no payment_type). See fetch note above.
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

      // 🟡 LEGACY FALLBACK: buildSessionLookup is async Supabase — not in engine.
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

      // 🟢 ENGINE-DRIVEN: buildStripeFromPurchaseTypeTable()
      const enrichedStripe = buildStripeFromPurchaseTypeTable(stripeRaw, stripeSessLookup);

      // 🟢 ENGINE-DRIVEN: buildPixelPurchases()
      const enrichedPixel = buildPixelPurchases(pixelRaw, pixelSessLookup);

      console.log('[DashboardTest] events direct:', eDirectData.data?.length ?? 0,
        '| via session:', sessionResolvedEvents.length,
        '| total:', allEvents.length);
      console.log('[DashboardTest] stripe enriched:', enrichedStripe.length,
        '| pixel enriched:', enrichedPixel.length);

      setRawEvents(allEvents);
      setStripePurchases(enrichedStripe);
      setPixelPurchases(enrichedPixel);
    } catch (err: any) {
      console.error('[DashboardTest] fetchData error:', err);
      showAlert('Dashboard Error', `Failed to load dashboard data: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };


  // ── Simulate Traffic ────────────────────────────────────────────────────────
  // 🟡 LEGACY FALLBACK: Verbatim from Dashboard.tsx. Pure side-effect, not engine.
  const simulateTraffic = async () => {
    if (videos.length === 0)
      return showAlert('No Content', 'Please add at least one video before simulating traffic.', 'info');

    const randomVideo = videos[Math.floor(Math.random() * videos.length)];
    setLoading(true);
    try {
      const { data: sData, error: sErr } = await supabase.from('sessions').insert({
        video_id:     randomVideo.id,
        campaign_id:  randomVideo.campaign_id,
        utm_source:   'youtube',
        utm_medium:   'video',
        utm_campaign: 'simulation',
        utm_content:  randomVideo.youtube_video_id,
      }).select('id').single();

      if (sErr) throw new Error(`[Supabase Session Error] ${sErr.message}`);

      const realSessionId = sData.id;

      await supabase.from('events').insert({ session_id: realSessionId, event_type: 'page_view' });

      if (Math.random() > 0.3) {
        await supabase.from('events').insert({ session_id: realSessionId, event_type: 'newsletter_click' });
        if (Math.random() > 0.5) {
          await supabase.from('leads').insert({
            session_id:  realSessionId,
            email:       `sim_${realSessionId.substring(0, 8)}@example.com`,
            utm_content: randomVideo.youtube_video_id,
          });
          await supabase.from('events').insert({ session_id: realSessionId, event_type: 'newsletter_optin' });
        }
      }

      if (Math.random() > 0.8) {
        const campaign = campaigns.find(c => c.id === randomVideo.campaign_id);
        await supabase.from('events').insert({
          session_id: realSessionId,
          event_type: 'purchase',
          value:      (campaign as any)?.offer_price || 99,
        });
      }

      await fetchData();
      showAlert('Simulation Complete', 'Mock traffic has been injected into your analytics system.', 'success');
    } catch (err: any) {
      console.error('[DashboardTest] simulateTraffic error:', err);
      showAlert('Simulation Failed', `An error occurred: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };


  // ── Engine input ──────────────────────────────────────────────────────────────
  //
  // 🟢 ENGINE-DRIVEN: Assembles AnalyticsEngineInput from current state.
  //
  // Dashboard-specific mappings:
  //   • dateRange = 'all'         — Dashboard shows all-time totals (no date filter UI)
  //   • selectedGoals = []        — Dashboard has no goal filter
  //   • selectedLeadMagnets = []  — Dashboard has no lead magnet filter
  //   • includeEV = true          — Dashboard includes estimated call revenue
  //   • selectedCampaignId        — NEW: campaign filter (new feature for DashboardTest)
  //   • activeSource              — SOURCE TOGGLE: total | pixel | stripe
  // ─────────────────────────────────────────────────────────────────────────────
  const engineInput = useMemo((): AnalyticsEngineInput => ({
    videos:              videos as AnalyticsEngineInput['videos'],
    campaigns:           campaigns as CampaignMeta[],
    rawEvents,
    stripePurchases,
    pixelPurchases,
    dateRange:           'all',          // Dashboard = all-time view
    selectedCampaignId,
    selectedGoals:       [],
    selectedLeadMagnets: [],
    activeSource,
    includeEV:           true,
    sortConfig,
  }), [
    videos, campaigns, rawEvents, stripePurchases, pixelPurchases,
    selectedCampaignId, activeSource, sortConfig,
  ]);

  // 🟢 ENGINE-DRIVEN: Single engine call — replaces all legacy useMemo computation.
  const engineResult  = useMemo(() => getAnalyticsEngine(engineInput), [engineInput]);
  const sortedVideos  = engineResult.sortedVideos;       // per-video rows, sorted
  const totals        = engineResult.campaignTotals;     // 🟢 replaces legacy useMemo totals


  // ── Display revenue (source-aware) ────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: campaignTotals already contains stripe/pixel/total_revenue
  // broken out. Select the correct one based on activeSource toggle.
  const displayRevenue = activeSource === 'stripe' ? totals.stripe_revenue
    : activeSource === 'pixel'  ? totals.pixel_revenue
    : totals.total_revenue;

  const displayRevenueLabel = activeSource === 'stripe' ? 'Verified (Stripe)'
    : activeSource === 'pixel'  ? 'Estimated (Pixel)'
    : 'Total (Hybrid)';


  // ── Helpers ───────────────────────────────────────────────────────────────────
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle2 size={12} className="text-green-500" />;
      case 'error':  return <AlertCircle  size={12} className="text-red-500" />;
      default:       return <Activity     size={12} className="text-zinc-500" />;
    }
  };

  // Source-aware per-row revenue
  const rowRevenue = (row: typeof sortedVideos[0]): number =>
    activeSource === 'stripe' ? row.stripe_revenue
    : activeSource === 'pixel'  ? row.pixel_revenue
    : row.total_revenue;


  // ── Source toggle order ────────────────────────────────────────────────────────
  // TOTAL → PIXEL → STRIPE  (fixed order per spec)
  const SOURCE_ORDER: { value: RevenueView; label: string }[] = [
    { value: 'total',  label: 'Total'  },
    { value: 'pixel',  label: 'Pixel'  },
    { value: 'stripe', label: 'Stripe' },
  ];


  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-red-600 rounded-sm shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
            {t.dashboard.title}
            <span className="text-[10px] font-black uppercase tracking-widest text-red-500/70 border border-red-500/30 rounded px-2 py-0.5 ml-1">
              ENGINE
            </span>
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">
            Engine-Powered Revenue View
          </p>
        </div>
        <Link
          to="/analytics"
          className="bg-zinc-900 border border-zinc-800 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-800 transition-all"
        >
          Go To Analytics <ArrowRight size={14} />
        </Link>
      </header>


      {/* ── Filters Bar ─────────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-3">

        {/* Source Toggle: TOTAL → PIXEL → STRIPE */}
        {/* 🟢 ENGINE-DRIVEN: activeSource → AnalyticsEngineInput.activeSource */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          {SOURCE_ORDER.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setActiveSource(value)}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                activeSource === value
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Campaign Filter */}
        {/* 🟢 ENGINE-DRIVEN: selectedCampaignId → AnalyticsEngineInput.selectedCampaignId */}
        <div className="relative">
          <select
            value={selectedCampaignId}
            onChange={e => setSelectedCampaignId(e.target.value)}
            className="appearance-none bg-zinc-900 border border-zinc-800 text-zinc-400 text-[9px] font-black uppercase tracking-widest px-3 py-2 pr-7 rounded-xl cursor-pointer hover:border-zinc-700 transition-all focus:outline-none focus:border-zinc-600"
          >
            <option value="all">All Campaigns</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>
                {(c as any).name || c.id}
              </option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
        </div>

        {/* Source label badge */}
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
          Showing: <span className="text-zinc-400">{displayRevenueLabel}</span>
        </span>
      </section>


      {/* ── Metric Cards ─────────────────────────────────────────────────────── */}
      {/*
        METRIC CARD DELTA vs Dashboard.tsx:
          ❌ REMOVED: "Revenue Per Click"  (rpc card)
          ✅ ADDED:   "Direct Purchase"    (purchase_thankyou)
          ✅ ADDED:   "Paid Consultation Booked" (consultation_thankyou)
        All values: 🟢 ENGINE-DRIVEN via engineResult.campaignTotals
      */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label:    t.dashboard.metrics.revenue,
            value:    `$${displayRevenue.toLocaleString()}`,
            sublabel: displayRevenueLabel,
            icon:     DollarSign,
            color:    'text-green-500',
            // 🟢 ENGINE-DRIVEN: campaignTotals.stripe/pixel/total_revenue
          },
          {
            label:    'Direct Purchase',
            value:    totals.purchase_thankyou,
            sublabel: undefined,
            icon:     ShoppingCart,
            color:    'text-emerald-400',
            // 🟢 ENGINE-DRIVEN: campaignTotals.purchase_thankyou
            // ✅ NEW METRIC — replaces "Revenue Per Click"
          },
          {
            label:    t.dashboard.metrics.optins,
            value:    totals.newsletter_thankyou,
            sublabel: undefined,
            icon:     Users,
            color:    'text-orange-500',
            // 🟢 ENGINE-DRIVEN: campaignTotals.newsletter_thankyou
          },
          {
            label:    t.dashboard.metrics.calls,
            value:    totals.call_booking_thankyou,
            sublabel: undefined,
            icon:     Target,
            color:    'text-red-500',
            // 🟢 ENGINE-DRIVEN: campaignTotals.call_booking_thankyou
          },
          {
            label:    'Paid Consultation Booked',
            value:    totals.consultation_thankyou,
            sublabel: undefined,
            icon:     Briefcase,
            color:    'text-purple-400',
            // 🟢 ENGINE-DRIVEN: campaignTotals.consultation_thankyou
            // ✅ NEW METRIC
          },
          {
            label:    'Landing Clicks',
            value:    totals.landing_page_view.toLocaleString(),
            sublabel: undefined,
            icon:     TrendingUp,
            color:    'text-blue-500',
            // 🟢 ENGINE-DRIVEN: campaignTotals.landing_page_view
          },
          {
            label:    'Consultation Revenue',
            value:    `$${totals.consultation_revenue.toLocaleString()}`,
            sublabel: undefined,
            icon:     DollarSign,
            color:    'text-purple-500',
            // 🟢 ENGINE-DRIVEN: campaignTotals.consultation_revenue
          },
          {
            label:    'Est. Call Revenue',
            value:    `$${totals.estimated_call_revenue.toLocaleString()}`,
            sublabel: 'EV Projection',
            icon:     Activity,
            color:    'text-zinc-500',
            // 🟢 ENGINE-DRIVEN: campaignTotals.estimated_call_revenue
          },
        ].map(card => (
          <div key={card.label} className="bento-card py-6 px-4 flex flex-col justify-between min-h-[100px]">
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


      {/* ── Main Grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* ── Ranked Content Table ─────────────────────────────────────────── */}
        <section className="lg:col-span-9 bento-card p-0 overflow-hidden">
          <div className="p-4 border-b border-zinc-900 bg-zinc-900/10 flex justify-between items-center">
            <h2 className="label-caps !text-white">{t.dashboard.topPerformers}</h2>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] font-bold uppercase text-zinc-600">Source:</span>
              <span className="text-[10px] font-bold uppercase text-red-500 underline decoration-red-900 underline-offset-4">
                {displayRevenueLabel}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-zinc-950/50 border-b border-zinc-900">
                <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  <th className="px-6 py-4">Video</th>
                  <th className="px-6 py-4">Goal</th>
                  <th className="px-6 py-4 text-center">Clicks</th>
                  <th className="px-6 py-4 text-center">Opt-ins</th>
                  <th className="px-6 py-4 text-center">Calls</th>
                  <th className="px-6 py-4 text-center">Direct</th>
                  <th className="px-6 py-4 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-6 py-8">
                        <div className="h-4 bg-zinc-900 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : sortedVideos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-600">
                        Secure campaign data to see rankings
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedVideos.map(row => (
                    <tr
                      key={row.video.id}
                      className="hover:bg-white/[0.01] transition-colors group cursor-pointer"
                      onClick={() => navigate(`/videos/${row.video.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img
                            src={row.video.thumbnail_url}
                            className="w-16 aspect-video rounded-lg object-cover border border-zinc-900 grayscale group-hover:grayscale-0 transition-all"
                          />
                          <div className="min-w-0 max-w-[180px]">
                            <p className="text-[11px] font-bold text-zinc-300 truncate leading-tight mb-1">
                              {row.video.video_title}
                            </p>
                            <div className="flex items-center gap-1.5">
                              {getStatusIcon((row.video as any).status ?? 'active')}
                              <span className="text-[9px] font-black uppercase text-zinc-600 tracking-tighter">
                                {((row.video as any).status ?? 'active').replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-zinc-900 text-zinc-500 rounded border border-zinc-800">
                          {Array.isArray(row.video.video_goal)
                            ? row.video.video_goal.join(', ')
                            : (row.video.video_goal ?? '—')}
                        </span>
                      </td>

                      {/* 🟢 ENGINE-DRIVEN per-row metrics */}
                      <td className="px-6 py-4 text-center text-xs font-bold text-zinc-400">
                        {row.landing_page_view.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-bold text-orange-500">
                        {row.newsletter_thankyou}
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-bold text-blue-500">
                        {row.call_booking_thankyou}
                      </td>
                      {/* ✅ NEW COLUMN: Direct Purchase count per video */}
                      <td className="px-6 py-4 text-center text-xs font-bold text-emerald-400">
                        {row.purchase_thankyou}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-xs font-black text-white">
                          ${rowRevenue(row).toLocaleString()}
                        </div>
                        <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">
                          {row.revenue_mode_label}
                        </div>
                        {/* RPC sub-label kept in table only (card removed per spec) */}
                        <div className="text-[9px] font-bold text-green-500/50 uppercase tracking-tighter">
                          ${row.rpc} RPC
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>


        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <section className="lg:col-span-3 space-y-6">

          {/* Tracking Health */}
          {/* 🟡 LEGACY FALLBACK: health stats are UI-only / Supabase-direct, not engine */}
          <div className="bento-card border-red-600/20 bg-red-600/5">
            <h3 className="label-caps !text-red-500 mb-4">{t.dashboard.health}</h3>
            <div className="space-y-4">
              {[
                { label: 'Active Links',  value: videos.length, icon: VideoIcon,    color: 'text-green-500' },
                { label: 'Broken Flows',  value: 0,             icon: AlertCircle,  color: 'text-zinc-600'  },
                { label: 'Last Sync',     value: '2m ago',      icon: Activity,     color: 'text-red-500'   },
              ].map(h => (
                <div key={h.label} className="flex justify-between items-center text-[10px] font-bold uppercase">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <h.icon size={12} className={h.color} /> {h.label}
                  </div>
                  <span className="text-white">{h.value}</span>
                </div>
              ))}
            </div>

            {/* Engine debug panel — new in DashboardTest */}
            <div className="mt-4 pt-4 border-t border-red-600/10 space-y-1">
              <p className="text-[8px] font-black uppercase text-zinc-700 tracking-widest mb-2">Engine Debug</p>
              {[
                { label: 'Raw Events',   value: engineResult.debug.rowCounts.rawEvents },
                { label: 'Stripe Rows',  value: engineResult.debug.rowCounts.stripePurchases },
                { label: 'Pixel Rows',   value: engineResult.debug.rowCounts.pixelPurchases },
                { label: 'Videos',       value: engineResult.debug.rowCounts.filteredVideos },
              ].map(d => (
                <div key={d.label} className="flex justify-between text-[8px] font-bold uppercase text-zinc-700">
                  <span>{d.label}</span>
                  <span className="text-zinc-500">{d.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-red-600/10">
              <button
                onClick={simulateTraffic}
                disabled={loading}
                className="w-full h-8 text-[9px] font-black uppercase tracking-[0.2em] bg-red-600 text-white rounded-lg disabled:opacity-50"
              >
                {loading ? 'Simulating...' : 'Simulate Traffic'}
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          {/* 🟡 LEGACY FALLBACK: Pure navigation — not engine concern */}
          <div className="bento-card border-blue-500/10">
            <p className="label-caps mb-4">Quick Actions</p>
            <div className="space-y-2">
              <Link
                to="/videos"
                className="w-full block py-3 px-4 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
              >
                Track New Video
              </Link>
              <Link
                to="/campaigns"
                className="w-full block py-3 px-4 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
              >
                View All Funnels
              </Link>
              <Link
                to="/dashboard"
                className="w-full block py-3 px-4 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
              >
                ← Legacy Dashboard
              </Link>
            </div>
          </div>

          {/* New Metrics Summary Card */}
          {/* 🟢 ENGINE-DRIVEN: All values from campaignTotals */}
          <div className="bento-card border-emerald-500/10 bg-emerald-500/5">
            <p className="label-caps !text-emerald-500 mb-4">Conversion Breakdown</p>
            <div className="space-y-3">
              {[
                { label: 'Direct Purchases',        value: totals.purchase_thankyou,      color: 'text-emerald-400' },
                { label: 'Paid Consultations',       value: totals.consultation_thankyou,  color: 'text-purple-400'  },
                { label: 'Call Bookings',            value: totals.call_booking_thankyou,  color: 'text-blue-400'    },
                { label: 'Newsletter Opt-ins',       value: totals.newsletter_thankyou,    color: 'text-orange-400'  },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center text-[10px] font-bold uppercase">
                  <span className="text-zinc-500">{item.label}</span>
                  <span className={`${item.color} font-black`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

        </section>
      </div>


      {/* ── Modal ─────────────────────────────────────────────────────────────── */}
      {/* 🟡 LEGACY FALLBACK: Modal is pure UI — verbatim from Dashboard.tsx */}
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
