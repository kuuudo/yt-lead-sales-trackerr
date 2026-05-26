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
//
// MIGRATION STATUS LEGEND
// ═══════════════════════
// 🟢 ENGINE-DRIVEN    — value comes directly from getAnalyticsEngine() output
// 🟡 LEGACY FALLBACK  — still computed manually; engine does not yet expose this
//
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../lib/hooks';
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
} from '../lib/analyticsEngine';

import {
  LayoutDashboard, TrendingUp, Target, Users, DollarSign,
  Activity, AlertCircle, CheckCircle2, ArrowRight, Video as VideoIcon,
  ShoppingCart,
} from 'lucide-react';
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
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardTest() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Raw data state ──────────────────────────────────────────────────────────
  const [loading, setLoading]                   = useState(true);
  const [videos, setVideos]                     = useState<Video[]>([]);
  const [campaigns, setCampaigns]               = useState<Campaign[]>([]);
  const [rawEvents, setRawEvents]               = useState<RawEvent[]>([]);
  const [stripePurchases, setStripePurchases]   = useState<StripePurchaseRow[]>([]);
  const [pixelPurchases, setPixelPurchases]     = useState<PixelPurchaseRow[]>([]);

  // ── Revenue source toggle ───────────────────────────────────────────────────
  // 🟢 ENGINE-DRIVEN: order is TOTAL → PIXEL → STRIPE, default = 'total'
  const [revenueView, setRevenueView] = useState<RevenueView>('total');

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
    if (user) fetchData();
  }, [user]);


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
        supabase.from('videos').select('*').eq('user_id', user?.id),
        supabase.from('campaigns').select('*').eq('user_id', user?.id),
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
  // Dashboard uses no date-range or goal filters — pass permissive defaults.
  // ─────────────────────────────────────────────────────────────────────────────
  const engineInput = useMemo((): AnalyticsEngineInput => ({
    videos:              videos as any,
    campaigns:           campaigns as CampaignMeta[],
    rawEvents,
    stripePurchases,
    pixelPurchases,
    // Dashboard has no date/goal/campaign filters — use permissive defaults
    dateRange:           'all',
    selectedCampaignId:  'all',
    selectedGoals:       [],
    selectedLeadMagnets: [],
    activeSource:        revenueView,
    includeEV:           true,
    sortConfig:          { key: 'total_revenue', direction: 'desc' },
  }), [videos, campaigns, rawEvents, stripePurchases, pixelPurchases, revenueView]);

  // 🟢 ENGINE-DRIVEN: sortedVideos and campaignTotals come entirely from the engine.
  const { sortedVideos, campaignTotals } = useMemo(
    () => getAnalyticsEngine(engineInput),
    [engineInput],
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
  // This replaces the legacy "Revenue Per Click" card.
  const totalDirectPurchases = campaignTotals.purchase_thankyou;

  // Opt-ins and call bookings from engine aggregates.
  const totalOptins    = campaignTotals.newsletter_thankyou;
  const totalCallBooks = campaignTotals.call_booking_thankyou;


  // ── Simulate Traffic ────────────────────────────────────────────────────────
  // 🟡 LEGACY FALLBACK: simulation logic unchanged from Dashboard.tsx.
  const simulateTraffic = async () => {
    if (videos.length === 0) {
      return showAlert('No Content', 'Please add at least one video before simulating traffic.', 'info');
    }
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

      if (sErr) {
        console.error('[DashboardTest] Supabase Session Insert Error:', sErr);
        throw new Error(`[Supabase Session Error] ${sErr.message}`);
      }

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
      console.error('[DashboardTest] Simulation Error:', err);
      showAlert('Simulation Failed', `An error occurred: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };


  // ── Status icon helper ──────────────────────────────────────────────────────
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':  return <CheckCircle2 size={12} className="text-green-500" />;
      case 'error':   return <AlertCircle  size={12} className="text-red-500" />;
      default:        return <Activity     size={12} className="text-zinc-500" />;
    }
  };


  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* Header */}
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-red-600 rounded-sm shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
            {t.dashboard.title}
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">
            Operational Revenue View · Engine
          </p>
        </div>
        <Link
          to="/analytics"
          className="bg-zinc-900 border border-zinc-800 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-800 transition-all"
        >
          Go To Analytics <ArrowRight size={14} />
        </Link>
      </header>


      {/* Metric Cards */}
      {/* 🟢 ENGINE-DRIVEN: all values from campaignTotals / engine output         */}
      {/* Revenue Per Click removed; Direct Purchase added.                        */}
      {/* Revenue source toggle order: TOTAL → PIXEL → STRIPE (default: TOTAL)    */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">

        {/* Revenue Source Toggle — TOTAL → PIXEL → STRIPE */}
        <div className="col-span-2 md:col-span-4 flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit mb-0">
          {(['total', 'pixel', 'stripe'] as RevenueView[]).map(v => (
            <button
              key={v}
              onClick={() => setRevenueView(v)}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                revenueView === v
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {v === 'total' ? 'Total' : v === 'pixel' ? 'Pixel' : 'Stripe'}
            </button>
          ))}
        </div>

        {/* Metric Card: Revenue */}
        {[
          {
            label:    t.dashboard.metrics.revenue,
            value:    `$${displayRevenue.toLocaleString()}`,
            sublabel: displayRevenueLabel,
            icon:     DollarSign,
            color:    'text-green-500',
          },
          {
            // ✅ NEW METRIC: Direct Purchase (replaces Revenue Per Click)
            label:    'Direct Purchase',
            value:    totalDirectPurchases,
            sublabel: undefined,
            icon:     ShoppingCart,
            color:    'text-blue-500',
          },
          {
            label:    t.dashboard.metrics.optins,
            value:    totalOptins,
            sublabel: undefined,
            icon:     Users,
            color:    'text-orange-500',
          },
          {
            label:    t.dashboard.metrics.calls,
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


      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Ranked Content List */}
        {/* 🟢 ENGINE-DRIVEN: sortedVideos from engine, revenue from selectDisplayRevenue */}
        <section className="lg:col-span-9 bento-card p-0 overflow-hidden">
          <div className="p-4 border-b border-zinc-900 bg-zinc-900/10 flex justify-between items-center">
            <h2 className="label-caps !text-white">{t.dashboard.topPerformers}</h2>
            <div className="flex gap-2">
              <span className="text-[10px] font-bold uppercase text-zinc-600">Metric:</span>
              <span className="text-[10px] font-bold uppercase text-red-500 underline decoration-red-900 underline-offset-4 cursor-pointer">Revenue</span>
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
                  <th className="px-6 py-4 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-6 py-8">
                        <div className="h-4 bg-zinc-900 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : sortedVideos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-600">
                        Secure campaign data to see rankings
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedVideos.map((row) => {
                    // 🟢 ENGINE-DRIVEN: revenue per row from engine metrics
                    const rowRevenue = selectDisplayRevenue(row as any, revenueView);
                    const videoGoals = Array.isArray(row.video.video_goal)
                      ? row.video.video_goal.join(', ')
                      : (row.video.video_goal ?? '');

                    return (
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
                                {row.title}
                              </p>
                              <div className="flex items-center gap-1.5">
                                {getStatusIcon((row.video as any).status ?? '')}
                                <span className="text-[9px] font-black uppercase text-zinc-600 tracking-tighter">
                                  {((row.video as any).status ?? '').replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-zinc-900 text-zinc-500 rounded border border-zinc-800">
                            {videoGoals}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-xs font-bold text-zinc-400">
                          {row.landing_page_view.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-center text-xs font-bold text-orange-500">
                          {row.newsletter_thankyou}
                        </td>
                        <td className="px-6 py-4 text-center text-xs font-bold text-blue-500">
                          {row.call_booking_thankyou}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="text-xs font-black text-white">
                            ${rowRevenue.toLocaleString()}
                          </div>
                          <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">
                            {row.revenue_mode_label}
                          </div>
                          {/* Direct Purchases per row (replaces per-row RPC) */}
                          <div className="text-[9px] font-bold text-green-500/50 uppercase tracking-tighter">
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


        {/* Tracking Health Sidebar */}
        <section className="lg:col-span-3 space-y-6">
          <div className="bento-card border-red-600/20 bg-red-600/5">
            <h3 className="label-caps !text-red-500 mb-4">{t.dashboard.health}</h3>
            <div className="space-y-4">
              {[
                { label: 'Active Links', value: videos.length,  icon: VideoIcon,    color: 'text-green-500' },
                { label: 'Broken Flows', value: 0,              icon: AlertCircle,  color: 'text-zinc-600'  },
                { label: 'Last Sync',    value: '2m ago',       icon: Activity,     color: 'text-red-500'   },
              ].map(h => (
                <div key={h.label} className="flex justify-between items-center text-[10px] font-bold uppercase">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <h.icon size={12} className={h.color} /> {h.label}
                  </div>
                  <span className="text-white">{h.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-red-600/10">
              <button
                onClick={simulateTraffic}
                disabled={loading}
                className="w-full h-8 text-[9px] font-black uppercase tracking-[0.2em] bg-red-600 text-white rounded-lg disabled:opacity-50"
              >
                {loading ? 'Simulating...' : 'Simulate Traffic'}
              </button>
            </div>
          </div>

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
            </div>
          </div>
        </section>
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
