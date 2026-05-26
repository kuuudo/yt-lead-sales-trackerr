// ─────────────────────────────────────────────────────────────────────────────
// DashboardTest.tsx
// CLEAN EXECUTIVE ENGINE DASHBOARD (4 KPI VERSION)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../lib/hooks';
import { supabase, Video, Campaign } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  Target,
  Users,
  DollarSign,
  Activity,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShoppingCart,
  ChevronDown,
} from 'lucide-react';

import { useNavigate, Link } from 'react-router-dom';
import { Modal } from '../components/Modal';

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
    if (s.video_id) {
      lookup[s.id] = {
        video_id: s.video_id,
        campaign_id: s.campaign_id,
      };
    }
  });

  return lookup;
}

export default function DashboardTest() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  const [videos, setVideos] = useState<Video[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [stripePurchases, setStripePurchases] = useState<StripePurchaseRow[]>([]);
  const [pixelPurchases, setPixelPurchases] = useState<PixelPurchaseRow[]>([]);

  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');

  const [sortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  }>({
    key: 'total_revenue',
    direction: 'desc',
  });

  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info' as 'info' | 'danger' | 'success',
    onConfirm: undefined as (() => void) | undefined,
  });

  const showAlert = (
    title: string,
    message: string,
    variant: 'info' | 'danger' | 'success' = 'info',
  ) => {
   setModalConfig({
  isOpen: true,
  title,
  message,
  variant,
  onConfirm: undefined,
});
};

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);

    try {
      const { data: cData } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user?.id);

      const { data: vData } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', user?.id);

      setCampaigns(cData || []);
      setVideos(vData || []);

      if (!vData || vData.length === 0) {
        setLoading(false);
        return;
      }

      const videoIds = vData.map((v: any) => v.id);
      const campaignIds = vData
        .map((v: any) => v.campaign_id)
        .filter(Boolean);

      const [eDirectData, eViaSessionData, spData, ppData] =
        await Promise.all([
          supabase
            .from('events')
            .select('video_id, campaign_id, event_type, created_at')
            .in('video_id', videoIds),

          supabase
            .from('events')
            .select(
              'event_type, created_at, sessions!inner(video_id, campaign_id)',
            )
            .is('video_id', null)
            .in('sessions.video_id', videoIds),

          (() => {
            const q = supabase
              .from('stripe_purchase_type')
              .select(
                'video_id, campaign_id, amount, stripe_session_id, payment_type',
              );

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
                .select(
                  'video_id, campaign_id, amount, event_type, session_id',
                )
                .in('campaign_id', campaignIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

      const sessionResolvedEvents = flattenSessionEvents(
        (eViaSessionData.data as any[]) || [],
      );

      const allEvents = mergeEventSources(
        eDirectData.data || [],
        sessionResolvedEvents,
      );

      const stripeRaw: StripePurchaseTypeRow[] = (
        spData.data || []
      ).map((r: any) => ({
        video_id: r.video_id,
        campaign_id: r.campaign_id,
        amount: r.amount,
        stripe_session_id: r.stripe_session_id ?? null,
        payment_type: r.payment_type ?? null,
      }));

      const pixelRaw = ppData.data || [];

      const [stripeSessLookup, pixelSessLookup] = await Promise.all([
        buildSessionLookup(
          stripeRaw.map((r) => ({
            ...r,
            session_id: r.stripe_session_id,
          })),
        ),
        buildSessionLookup(pixelRaw),
      ]);

      const enrichedStripe = buildStripeFromPurchaseTypeTable(
        stripeRaw,
        stripeSessLookup,
      );

      const enrichedPixel = buildPixelPurchases(
        pixelRaw,
        pixelSessLookup,
      );

      setRawEvents(allEvents);
      setStripePurchases(enrichedStripe);
      setPixelPurchases(enrichedPixel);
    } catch (err: any) {
      console.error(err);

      showAlert(
        'Dashboard Error',
        `Failed to load dashboard data: ${err.message}`,
        'danger',
      );
    } finally {
      setLoading(false);
    }
  };

  const simulateTraffic = async () => {
    if (videos.length === 0) {
      return showAlert(
        'No Content',
        'Please add videos before simulating traffic.',
        'info',
      );
    }

    const randomVideo =
      videos[Math.floor(Math.random() * videos.length)];

    setLoading(true);

    try {
      const { data: sData, error: sErr } = await supabase
        .from('sessions')
        .insert({
          video_id: randomVideo.id,
          campaign_id: randomVideo.campaign_id,
          utm_source: 'youtube',
          utm_medium: 'video',
          utm_campaign: 'simulation',
          utm_content: randomVideo.youtube_video_id,
        })
        .select('id')
        .single();

      if (sErr) throw sErr;

      const sessionId = sData.id;

      await supabase.from('events').insert({
        session_id: sessionId,
        event_type: 'page_view',
      });

      await fetchData();

      showAlert(
        'Simulation Complete',
        'Mock traffic has been injected.',
        'success',
      );
    } catch (err: any) {
      console.error(err);

      showAlert(
        'Simulation Failed',
        err.message,
        'danger',
      );
    } finally {
      setLoading(false);
    }
  };

  const engineInput = useMemo(
    (): AnalyticsEngineInput => ({
      videos: videos as AnalyticsEngineInput['videos'],
      campaigns: campaigns as CampaignMeta[],
      rawEvents,
      stripePurchases,
      pixelPurchases,
      dateRange: 'all',
      selectedCampaignId,
      selectedGoals: [],
      selectedLeadMagnets: [],
      activeSource,
      includeEV: true,
      sortConfig,
    }),
    [
      videos,
      campaigns,
      rawEvents,
      stripePurchases,
      pixelPurchases,
      selectedCampaignId,
      activeSource,
      sortConfig,
    ],
  );

  const engineResult = useMemo(
    () => getAnalyticsEngine(engineInput),
    [engineInput],
  );

  const sortedVideos = engineResult.sortedVideos;
  const totals = engineResult.campaignTotals;

  const displayRevenue =
    activeSource === 'stripe'
      ? totals.stripe_revenue
      : activeSource === 'pixel'
        ? totals.pixel_revenue
        : totals.total_revenue;

  const displayRevenueLabel =
    activeSource === 'stripe'
      ? 'Verified (Stripe)'
      : activeSource === 'pixel'
        ? 'Estimated (Pixel)'
        : 'Total (Hybrid)';

  const rowRevenue = (row: typeof sortedVideos[0]): number =>
    activeSource === 'stripe'
      ? row.stripe_revenue
      : activeSource === 'pixel'
        ? row.pixel_revenue
        : row.total_revenue;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <CheckCircle2
            size={12}
            className="text-green-500"
          />
        );

      case 'error':
        return (
          <AlertCircle
            size={12}
            className="text-red-500"
          />
        );

      default:
        return (
          <Activity
            size={12}
            className="text-zinc-500"
          />
        );
    }
  };

  const SOURCE_ORDER: {
    value: RevenueView;
    label: string;
  }[] = [
    { value: 'total', label: 'Total' },
    { value: 'pixel', label: 'Pixel' },
    { value: 'stripe', label: 'Stripe' },
  ];

  return (
    <div className="space-y-8">

      {/* HEADER */}
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">

        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-red-600 rounded-sm shadow-[0_0_15px_rgba(220,38,38,0.5)]" />

            {t.dashboard.title}

            <span className="text-[10px] font-black uppercase tracking-widest text-red-500/70 border border-red-500/30 rounded px-2 py-0.5">
              ENGINE
            </span>
          </h1>

          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-2">
            Operational Revenue View
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">

          {/* SOURCE TOGGLE */}
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

          {/* CAMPAIGN FILTER */}
          <div className="relative">
            <select
              value={selectedCampaignId}
              onChange={(e) =>
                setSelectedCampaignId(e.target.value)
              }
              className="appearance-none bg-zinc-900 border border-zinc-800 text-zinc-400 text-[9px] font-black uppercase tracking-widest px-3 py-2 pr-7 rounded-xl cursor-pointer hover:border-zinc-700 transition-all focus:outline-none"
            >
              <option value="all">
                All Campaigns
              </option>

              {campaigns.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                >
                  {c.campaign_name || c.id}
                </option>
              ))}
            </select>

            <ChevronDown
              size={10}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
            />
          </div>

          {/* GO TO ANALYTICS */}
          <Link
            to="/analytics"
            className="bg-zinc-900 border border-zinc-800 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-800 transition-all"
          >
            Go To Analytics
            <ArrowRight size={14} />
          </Link>

        </div>
      </header>

      {/* KPI CARDS — NOW ONLY 4 */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {[
          {
            label: 'Total Revenue',
            value: `$${displayRevenue.toLocaleString()}`,
            sublabel: displayRevenueLabel,
            icon: DollarSign,
            color: 'text-green-500',
          },
          {
            label: 'Direct Purchase',
            value: totals.purchase_thankyou,
            icon: ShoppingCart,
            color: 'text-emerald-400',
          },
          {
            label: 'Newsletter Opt-ins',
            value: totals.newsletter_thankyou,
            icon: Users,
            color: 'text-orange-500',
          },
          {
            label: 'Sales Calls',
            value: totals.call_booking_thankyou,
            icon: Target,
            color: 'text-red-500',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bento-card py-6 px-5 flex flex-col justify-between min-h-[110px]"
          >
            <span className="label-caps !text-zinc-600 truncate">
              {card.label}
            </span>

            <div className="flex items-center justify-between mt-auto">
              <div>
                <div className="text-white text-2xl font-black">
                  {card.value}
                </div>

                {card.sublabel && (
                  <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">
                    {card.sublabel}
                  </div>
                )}
              </div>

              <card.icon
                size={18}
                className={`${card.color} opacity-40`}
              />
            </div>
          </div>
        ))}
      </section>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* TABLE */}
        <section className="lg:col-span-9 bento-card p-0 overflow-hidden">

          <div className="p-5 border-b border-zinc-900 bg-zinc-900/10 flex justify-between items-center">
            <h2 className="label-caps !text-white">
              Top 10 Videos
            </h2>

            <div className="text-[10px] font-bold uppercase text-zinc-600">
              {displayRevenueLabel}
            </div>
          </div>

          <div className="overflow-x-auto">

            <table className="w-full text-left">

              <thead className="bg-zinc-950/50 border-b border-zinc-900">
                <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  <th className="px-6 py-4">Video</th>
                  <th className="px-6 py-4 text-center">Clicks</th>
                  <th className="px-6 py-4 text-center">Opt-ins</th>
                  <th className="px-6 py-4 text-center">Direct</th>
                  <th className="px-6 py-4 text-right">Revenue</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-900/50">

                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr
                      key={i}
                      className="animate-pulse"
                    >
                      <td
                        colSpan={5}
                        className="px-6 py-8"
                      >
                        <div className="h-4 bg-zinc-900 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : (
                  sortedVideos
                    .slice(0, 10)
                    .map((row) => (
                      <tr
                        key={row.video.id}
                        onClick={() =>
                          navigate(`/videos/${row.video.id}`)
                        }
                        className="hover:bg-white/[0.01] transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">

                          <div className="flex items-center gap-4">

                            <img
                              src={row.video.thumbnail_url}
                              className="w-16 aspect-video rounded-lg object-cover border border-zinc-900"
                            />

                            <div className="min-w-0 max-w-[180px]">

                              <p className="text-[11px] font-bold text-zinc-300 truncate leading-tight mb-1">
                                {row.video.video_title}
                              </p>

                              <div className="flex items-center gap-1.5">
                                {getStatusIcon(
                                  (row.video as any).status ?? 'active',
                                )}

                                <span className="text-[9px] font-black uppercase text-zinc-600">
                                  {(
                                    (row.video as any).status ??
                                    'active'
                                  ).replace('_', ' ')}
                                </span>
                              </div>

                            </div>

                          </div>

                        </td>

                        <td className="px-6 py-4 text-center text-xs font-bold text-zinc-400">
                          {row.landing_page_view.toLocaleString()}
                        </td>

                        <td className="px-6 py-4 text-center text-xs font-bold text-orange-500">
                          {row.newsletter_thankyou}
                        </td>

                        <td className="px-6 py-4 text-center text-xs font-bold text-emerald-400">
                          {row.purchase_thankyou}
                        </td>

                        <td className="px-6 py-4 text-right">

                          <div className="text-xs font-black text-white">
                            $
                            {rowRevenue(row).toLocaleString()}
                          </div>

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

        {/* SIDEBAR */}
        <section className="lg:col-span-3 space-y-6">

          {/* CONVERSIONS */}
          <div className="bento-card">

            <p className="label-caps mb-4">
              Conversion Summary
            </p>

            <div className="space-y-4">

              {[
                {
                  label: 'Direct Purchases',
                  value: totals.purchase_thankyou,
                  color: 'text-emerald-400',
                },
                {
                  label: 'Sales Calls',
                  value: totals.call_booking_thankyou,
                  color: 'text-blue-400',
                },
                {
                  label: 'Newsletter Opt-ins',
                  value: totals.newsletter_thankyou,
                  color: 'text-orange-400',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex justify-between items-center text-[10px] font-bold uppercase"
                >
                  <span className="text-zinc-500">
                    {item.label}
                  </span>

                  <span className={`${item.color} font-black`}>
                    {item.value}
                  </span>
                </div>
              ))}

            </div>

          </div>

          {/* HEALTH */}
          <div className="bento-card border-red-600/20 bg-red-600/5">

            <h3 className="label-caps !text-red-500 mb-4">
              Tracking Health
            </h3>

            <div className="space-y-4">

              {[
                {
                  label: 'Active Videos',
                  value: videos.length,
                  color: 'text-green-500',
                },
                {
                  label: 'Events',
                  value: engineResult.debug.rowCounts.rawEvents,
                  color: 'text-zinc-400',
                },
                {
                  label: 'Stripe Rows',
                  value:
                    engineResult.debug.rowCounts
                      .stripePurchases,
                  color: 'text-zinc-400',
                },
                {
                  label: 'Pixel Rows',
                  value:
                    engineResult.debug.rowCounts
                      .pixelPurchases,
                  color: 'text-zinc-400',
                },
              ].map((h) => (
                <div
                  key={h.label}
                  className="flex justify-between items-center text-[10px] font-bold uppercase"
                >
                  <span className="text-zinc-500">
                    {h.label}
                  </span>

                  <span className={`${h.color} font-black`}>
                    {h.value}
                  </span>
                </div>
              ))}

            </div>

            <div className="mt-6 pt-4 border-t border-red-600/10">

              <button
                onClick={simulateTraffic}
                disabled={loading}
                className="w-full h-9 text-[9px] font-black uppercase tracking-[0.2em] bg-red-600 text-white rounded-lg disabled:opacity-50 hover:bg-red-700 transition-colors"
              >
                {loading
                  ? 'Simulating...'
                  : 'Simulate Traffic'}
              </button>

            </div>

          </div>

          {/* QUICK ACTIONS */}
          <div className="bento-card border-blue-500/10">

            <p className="label-caps mb-4">
              Quick Actions
            </p>

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
                View Funnels
              </Link>

              <Link
                to="/dashboard"
                className="w-full block py-3 px-4 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-all"
              >
                ← Legacy Dashboard
              </Link>

            </div>

          </div>

        </section>

      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() =>
          setModalConfig({
            ...modalConfig,
            isOpen: false,
          })
        }
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
        onConfirm={modalConfig.onConfirm}
      />
    </div>
  );
}