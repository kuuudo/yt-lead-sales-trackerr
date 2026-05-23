// ─────────────────────────────────────────────────────────────────────────────
// InDepthAnalytics.tsx
// All metric computation delegated to analyticsProcessor.ts.
// This file: fetch → enrich → filter → render only.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, Campaign, Video, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  METRIC_LABELS,
  type MetricType,
  type PixelPurchaseRow,
} from '../lib/analyticsConfig';
import {
  processVideoMetrics,
  enrichStripePurchases,
  enrichPixelPurchases,
  filterEventsByDate,
  type DateRange,
  type RevenueView,
  type RawEvent,
  type CampaignMeta,
} from '../lib/analyticsProcessor';
import {
  BarChart3, Calendar, Filter, ChevronLeft,
  MousePointer2, DollarSign, Users, Phone, Briefcase,
  Activity, User, ArrowUpDown, ExternalLink, Loader2, X,
} from 'lucide-react';

// ── Column keys shown in the table ───────────────────────────────────────────
// Mirrors the original METRIC_LABELS keys, using the canonical MetricType set.
// 'direct_offer_sales' from the old local type maps to 'direct_offer_revenue'.
const TABLE_COLUMNS: MetricType[] = [
  'landing_page_view',
  'purchase_thankyou',
  'lead_magnet_click',
  'newsletter_click',
  'newsletter_thankyou',
  'call_booking_click',
  'call_booking_thankyou',
  'consultation_click',
  'consultation_thankyou',
  'direct_offer_revenue',
  'estimated_call_revenue',
  'consultation_revenue',
  'total_revenue',
  'rpc',
];

// Column display labels — keep original wording where it differed from config.
const COLUMN_LABELS: Record<MetricType, string> = {
  ...METRIC_LABELS,
  direct_offer_revenue:    'Direct Offer Sales ($)',
  estimated_call_revenue:  'Estimated Call Revenue ($)',
  consultation_revenue:    'Consultation Revenue ($)',
  total_revenue:           'Total Revenue ($)',
  rpc:                     'Revenue Per Click ($)',
};

export default function InDepthAnalytics() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Raw data ────────────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(true);
  const [campaigns, setCampaigns]           = useState<Campaign[]>([]);
  const [videos, setVideos]                 = useState<Video[]>([]);
  const [leadMagnets, setLeadMagnets]       = useState<LeadMagnet[]>([]);
  const [rawEvents, setRawEvents]           = useState<RawEvent[]>([]);
  const [stripePurchases, setStripePurchases] = useState<ReturnType<typeof enrichStripePurchases>>([]);
  const [pixelPurchases, setPixelPurchases]   = useState<PixelPurchaseRow[]>([]);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [dateRange, setDateRange]                   = useState<DateRange>('30days');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [selectedGoals, setSelectedGoals]           = useState<string[]>([]);
  const [selectedLeadMagnets, setSelectedLeadMagnets] = useState<string[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [includeEV, setIncludeEV]       = useState<boolean>(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total_revenue',
    direction: 'desc',
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  // ── Data fetching ────────────────────────────────────────────────────────────
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

      // Fetch events + purchases in parallel
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

        supabase
          .from('stripe_purchases')
          .select('video_id, campaign_id, amount, session_id')
          .in('video_id', videoIds),

        campaignIds.length
          ? supabase
              .from('pixel_purchases')
              .select('video_id, campaign_id, amount, event_type, session_id')
              .in('campaign_id', campaignIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // Flatten session-resolved events
      const sessionResolvedEvents: RawEvent[] = (eViaSessionData.data || [])
        .map((e: any) => ({
          video_id:    e.sessions?.video_id    ?? null,
          campaign_id: e.sessions?.campaign_id ?? null,
          event_type:  e.event_type,
          created_at:  e.created_at,
        }))
        .filter((e: RawEvent) => e.video_id !== null);

      const allEvents: RawEvent[] = [
        ...(eDirectData.data || []),
        ...sessionResolvedEvents,
      ];

      // ── Session lookup for null video_id rows ──────────────────────────────
      const buildSessionLookup = async (
        rows: any[],
      ): Promise<Record<string, { video_id: string; campaign_id: string }>> => {
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
      };

      const stripeRaw = spData.data || [];
      const pixelRaw  = ppData.data || [];

      const [stripeSessLookup, pixelSessLookup] = await Promise.all([
        buildSessionLookup(stripeRaw),
        buildSessionLookup(pixelRaw),
      ]);

      // Enrich via processor helpers (no type derivation duplication)
      const enrichedStripe = enrichStripePurchases(stripeRaw, stripeSessLookup, cData || []);
      const enrichedPixel  = enrichPixelPurchases(pixelRaw, pixelSessLookup);

      console.log('[InDepthAnalytics] events direct:', eDirectData.data?.length ?? 0,
        '| via session:', sessionResolvedEvents.length,
        '| total:', allEvents.length);
      console.log('[InDepthAnalytics] stripe enriched:', enrichedStripe.length,
        '| pixel enriched:', enrichedPixel.length);

      setRawEvents(allEvents);
      setStripePurchases(enrichedStripe);
      setPixelPurchases(enrichedPixel);
    } catch (err) {
      console.error('[InDepthAnalytics] fetchData error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Date-filtered events ─────────────────────────────────────────────────────
  const dateFilteredEvents = useMemo(
    () => filterEventsByDate(rawEvents, dateRange),
    [rawEvents, dateRange],
  );

  // ── Video filter (campaign / goal / lead magnet) ─────────────────────────────
  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      if (selectedCampaignId !== 'all' && v.campaign_id !== selectedCampaignId) return false;
      if (selectedGoals.length > 0) {
        const hasMatch = v.video_goal.some((g: string) => selectedGoals.includes(g));
        if (!hasMatch) return false;
      }
      if (selectedLeadMagnets.length > 0) {
        if (!v.selected_lead_magnet_ids) return false;
        const hasMatch = v.selected_lead_magnet_ids.some((id: string) =>
          selectedLeadMagnets.includes(id),
        );
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [videos, selectedCampaignId, selectedGoals, selectedLeadMagnets]);

  // ── Metric computation — delegated entirely to analyticsProcessor ─────────────
  const processedVideos = useMemo(() => {
    return filteredVideos.map(v => {
      const campaign = campaigns.find(c => c.id === v.campaign_id) as CampaignMeta | undefined;

      // Derive source-filtered purchases based on activeSource
      const sourceStripe = activeSource === 'pixel'
        ? []
        : stripePurchases;
      const sourcePixel = activeSource === 'stripe'
        ? []
        : pixelPurchases;

      const metrics = processVideoMetrics({
        videoId:         v.id,
        campaignId:      v.campaign_id ?? null,
        campaign,
        events:          dateFilteredEvents,
        stripePurchases: sourceStripe,
        pixelPurchases:  sourcePixel,
        includeEV,
      });

      return {
        video:    v,
        campaign: campaign ?? null,
        title:    v.video_title,
        ...metrics,
      };
    });
  }, [filteredVideos, dateFilteredEvents, stripePurchases, pixelPurchases, campaigns, includeEV, activeSource]);

  // ── Sort ──────────────────────────────────────────────────────────────────────
  const sortedVideos = useMemo(() => {
    const items = [...processedVideos];
    items.sort((a, b) => {
      const aVal = (a as any)[sortConfig.key];
      const bVal = (b as any)[sortConfig.key];
      const aNum = typeof aVal === 'string' ? parseFloat(aVal) : (aVal ?? 0);
      const bNum = typeof bVal === 'string' ? parseFloat(bVal) : (bVal ?? 0);
      if (aNum < bNum) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aNum > bNum) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [processedVideos, sortConfig]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const isRevenueCol = (key: MetricType) =>
    key.includes('revenue') || key === 'rpc';

  const formatCellValue = (key: MetricType, row: (typeof sortedVideos)[number]): string => {
    if (key === 'total_revenue') {
      return `$${(row.total_revenue || 0).toLocaleString()}`;
    }
    if (key === 'rpc') return `$${row.rpc ?? 0}`;
    if (isRevenueCol(key)) return `$${((row as any)[key] || 0).toLocaleString()}`;
    return ((row as any)[key] || 0).toLocaleString();
  };

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

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
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
                { id: 'sales',    label: 'Direct Sales' },
                { id: 'newsletter', label: 'Newsletter' },
                { id: 'calls',    label: 'Sales Calls' },
                { id: 'consult',  label: 'Paid Consult' },
                { id: 'viral',    label: 'Awareness' },
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

      {/* ── Main content ───────────────────────────────────────────────────── */}
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
                {sortedVideos.length} Videos Loaded
              </span>
            </div>
          </div>
        </header>

        {/* Table */}
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
                            {row.campaign?.campaign_name || 'Individual Video'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Metric cells */}
                    {TABLE_COLUMNS.map(key => (
                      <td
                        key={key}
                        className="px-6 py-5 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums"
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
