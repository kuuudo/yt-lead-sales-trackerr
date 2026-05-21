import { normalizeEventType } from '../lib/analyticsConfig';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, Campaign, Video, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  applyRevenue,
  finalizeMetrics,
  type StripePurchaseRow,
  type PixelPurchaseRow,
} from '../lib/analyticsConfig';
import { 
  BarChart3, Calendar, Filter, ChevronLeft, 
  MousePointer2, DollarSign, Users, Phone, Briefcase, 
  Activity, User, ArrowUpDown, ExternalLink, Loader2, Menu, X,
  AlertCircle
} from 'lucide-react';

type DateRange = '7days' | '30days' | '2months' | '6months' | '1year' | 'all';

type MetricType = 
  | 'landing_page_view' 
  | 'purchase_thankyou' 
  | 'lead_magnet_click' 
  | 'lead_magnet_thankyou' 
  | 'newsletter_click' 
  | 'newsletter_thankyou' 
  | 'call_booking_click' 
  | 'call_booking_thankyou' 
  | 'consultation_click' 
  | 'consultation_thankyou'
  | 'direct_offer_sales'
  | 'estimated_call_revenue'
  | 'consultation_revenue'
  | 'total_revenue'
  | 'rpc';

const METRIC_LABELS: Record<MetricType, string> = {
  landing_page_view: 'Landing Page Clicks',
  purchase_thankyou: 'Direct Purchases',
  lead_magnet_click: 'Lead Magnet Clicks',
  lead_magnet_thankyou: 'Lead Magnet Opt-ins',
  newsletter_click: 'Newsletter Clicks',
  newsletter_thankyou: 'Newsletter Opt-ins',
  call_booking_click: 'Call Booking Clicks',
  call_booking_thankyou: 'Call Bookings Confirmed',
  consultation_click: 'Consultation Page Clicks',
  consultation_thankyou: 'Consultation Purchases',
  direct_offer_sales: 'Direct Offer Sales ($)',
  estimated_call_revenue: 'Estimated Call Revenue ($)',
  consultation_revenue: 'Consultation Revenue ($)',
  total_revenue: 'Total Revenue ($)',
  rpc: 'Revenue Per Click ($)'
};

export default function InDepthAnalytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [stripePurchases, setStripePurchases] = useState<any[]>([]);
  const [pixelPurchases,  setPixelPurchases]  = useState<any[]>([]);

  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedLeadMagnets, setSelectedLeadMagnets] = useState<string[]>([]);
  
  // UI State
  type RevenueView = 'stripe' | 'pixel' | 'total';
  const [revenueView, setRevenueView] = useState<RevenueView>('stripe');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'total_revenue', direction: 'desc' });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: cData } = await supabase.from('campaigns').select('*').eq('user_id', user?.id);
      const { data: vData } = await supabase.from('videos').select('*').eq('user_id', user?.id);
      const { data: lmData } = await supabase.from('lead_magnets').select('*');
      
      setCampaigns(cData || []);
      setVideos(vData || []);
      setLeadMagnets(lmData || []);

      if (vData && vData.length > 0) {
        const videoIds = vData.map((v: any) => v.id);
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

  videoIds.length
    ? supabase
        .from('stripe_purchases')
        .select('video_id, campaign_id, amount, session_id')
        .in('video_id', videoIds)
    : Promise.resolve({ data: [] as any }),

  campaignIds.length
    ? supabase
        .from('pixel_purchases')
        .select('video_id, campaign_id, amount, event_type, session_id')
        .in('campaign_id', campaignIds)
    : Promise.resolve({ data: [] as any }),
]);

        // Normalize session-resolved events
        const sessionResolvedEvents = (eViaSessionData.data || []).map((e: any) => ({
          video_id:    e.sessions?.video_id    ?? null,
          campaign_id: e.sessions?.campaign_id ?? null,
          event_type:  e.event_type,
          created_at:  e.created_at,
        })).filter((e: any) => e.video_id !== null);

        const allEvents = [...(eDirectData.data || []), ...sessionResolvedEvents];

        // Enrich pixel_purchases with null video_id via sessions
        const pixelRaw = ppData.data || [];
        const nullPixelSessionIds = pixelRaw.filter((p: any) => !p.video_id && p.session_id).map((p: any) => p.session_id);
        let pixelSessLookup: Record<string, { video_id: string; campaign_id: string }> = {};
        if (nullPixelSessionIds.length > 0) {
          const { data: sData } = await supabase.from('sessions').select('id, video_id, campaign_id').in('id', nullPixelSessionIds);
          (sData || []).forEach((s: any) => { if (s.video_id) pixelSessLookup[s.id] = { video_id: s.video_id, campaign_id: s.campaign_id }; });
        }
        const enrichedPixel = pixelRaw.map((p: any) => (!p.video_id && p.session_id && pixelSessLookup[p.session_id]) ? { ...p, ...pixelSessLookup[p.session_id] } : p);

        // Enrich stripe_purchases with null video_id via sessions
        const stripeRaw = spData.data || [];
        const nullStripeSessionIds = stripeRaw.filter((p: any) => !p.video_id && p.session_id).map((p: any) => p.session_id);
        let stripeSessLookup: Record<string, { video_id: string; campaign_id: string }> = {};
        if (nullStripeSessionIds.length > 0) {
          const { data: sData } = await supabase.from('sessions').select('id, video_id, campaign_id').in('id', nullStripeSessionIds);
          (sData || []).forEach((s: any) => { if (s.video_id) stripeSessLookup[s.id] = { video_id: s.video_id, campaign_id: s.campaign_id }; });
        }
        const enrichedStripe = stripeRaw.map((p: any) => {
          // Resolve video_id/campaign_id from session if missing
          const resolved = (!p.video_id && p.session_id && stripeSessLookup[p.session_id])
            ? { ...p, ...stripeSessLookup[p.session_id] }
            : p;
          // Derive 'type' from campaign: stripe_purchases has no type column in DB,
          // so we reconstruct it from has_paid_consultation + consultation_fee
          const campaign = (cData || []).find((c: any) => c.id === resolved.campaign_id);
          const isConsultation =
            campaign?.has_paid_consultation &&
            campaign?.consultation_fee != null &&
            Number(resolved.amount) === Number(campaign.consultation_fee);
          // Normalize cents → dollars if amount looks like cents (> 500 implies > $5.00 in cents)
          const normalizedAmount = resolved.amount > 500 ? resolved.amount / 100 : resolved.amount;
          return {
            ...resolved,
            amount: normalizedAmount,
            type: isConsultation ? 'consultation' : 'direct',
          };
        });

        console.log('[InDepthAnalytics] events direct:', eDirectData.data?.length ?? 0, '| via session:', sessionResolvedEvents.length, '| total:', allEvents.length);
        console.log('[InDepthAnalytics] pixel_purchases enriched:', enrichedPixel.length, '| stripe_purchases enriched:', enrichedStripe.length);

        setEvents(allEvents);
        setStripePurchases(enrichedStripe);
        setPixelPurchases(enrichedPixel);
      }
    } catch (err) {
      console.error('Error fetching in-depth analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  const dateFilteredEvents = useMemo(() => {
    let cutoff = new Date();
    switch(dateRange) {
      case '7days': cutoff.setDate(cutoff.getDate() - 7); break;
      case '30days': cutoff.setDate(cutoff.getDate() - 30); break;
      case '2months': cutoff.setMonth(cutoff.getMonth() - 2); break;
      case '6months': cutoff.setMonth(cutoff.getMonth() - 6); break;
      case '1year': cutoff.setFullYear(cutoff.getFullYear() - 1); break;
      case 'all': cutoff = new Date(0); break;
      default: cutoff.setDate(cutoff.getDate() - 30);
    }
    return events.filter(e => new Date(e.created_at) >= cutoff);
  }, [events, dateRange]);

  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      if (selectedCampaignId !== 'all' && v.campaign_id !== selectedCampaignId) return false;
      if (selectedGoals.length > 0) {
        const hasMatch = v.video_goal.some(goal => selectedGoals.includes(goal));
        if (!hasMatch) return false;
      }
      if (selectedLeadMagnets.length > 0) {
        if (!v.selected_lead_magnet_ids) return false;
        const hasMatch = v.selected_lead_magnet_ids.some(id => selectedLeadMagnets.includes(id));
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [videos, selectedCampaignId, selectedGoals, selectedLeadMagnets]);

  const videoIds = useMemo(() =>
  filteredVideos
    .map(v => v.id)
    .filter(Boolean),
[filteredVideos]);

  const processedVideos = useMemo(() => {
    const videoMetrics: Record<string, any> = {};

    filteredVideos.forEach(v => {
      const camp = campaigns.find(c => c.id === v.campaign_id);
      videoMetrics[v.id] = {
        video: v,
        campaign: camp,
        title: v.video_title,
        landing_page_view: 0,
        purchase_thankyou: 0,
        lead_magnet_click: 0,
        lead_magnet_thankyou: 0,
        newsletter_click: 0,
        newsletter_thankyou: 0,
        call_booking_click: 0,
        call_booking_thankyou: 0,
        consultation_click: 0,
        consultation_thankyou: 0,
        direct_offer_sales: 0,
        estimated_call_revenue: 0,
        consultation_revenue: 0,
        stripe_revenue: 0,
        pixel_revenue: 0,
        total_revenue: 0,
        rpc: 0,
        // revenue_mode required by applyRevenue — derive from campaign or default hybrid
        revenue_mode: (camp as any)?.revenue_mode === 'stripe' ? 'stripe'
          : (camp as any)?.revenue_mode === 'pixel' ? 'pixel'
          : 'hybrid',
        revenue_mode_label: (camp as any)?.revenue_mode === 'stripe' ? 'Verified (Stripe)'
          : (camp as any)?.revenue_mode === 'pixel' ? 'Estimated (Pixel)'
          : 'Total (Hybrid)',
      };
    });

dateFilteredEvents.forEach(e => {
  if (!videoIds.includes(e.video_id)) return;

  const v = videoMetrics[e.video_id];
  if (!v) return;

  const canonical = normalizeEventType(e.event_type);

  if (canonical && v[canonical] !== undefined) {
    v[canonical]++;
  }
});

    // After event counts loop, apply revenue per video:
    filteredVideos.forEach(v => {
      const m = videoMetrics[v.id];
      const campaign = campaigns.find(c => c.id === v.campaign_id);

      // All rows now enriched with video_id from sessions
      const vidPixelPurchases = pixelPurchases.filter((p: any) => p.video_id === v.id);
      const vidStripePurchases = stripePurchases.filter((p: any) => p.video_id === v.id);

      console.log(`[InDepthAnalytics] video="${v.video_title}" mode=${m.revenue_mode} stripeRows=${vidStripePurchases.length} pixelRows=${vidPixelPurchases.length}`);

      applyRevenue(m, vidStripePurchases as StripePurchaseRow[], vidPixelPurchases as PixelPurchaseRow[]);
      finalizeMetrics(m, campaign);

      console.log(`[InDepthAnalytics] video="${v.video_title}" => stripe=${m.stripe_revenue} pixel=${m.pixel_revenue} total=${m.total_revenue} rpc=${m.rpc}`);
    });

    return Object.values(videoMetrics).map((v: any) => {
      const camp = v.campaign;
      if (camp) {
        const rpcVal = v.landing_page_view > 0 ? (v.total_revenue / v.landing_page_view) : 0;
        v.rpc = rpcVal.toFixed(2);
      }
      return v;
    });
  }, [filteredVideos, dateFilteredEvents, stripePurchases, pixelPurchases, campaigns, videoIds]);

  const sortedVideos = useMemo(() => {
    const items = [...processedVideos];
    items.sort((a, b) => {
      const key = sortConfig.key;
      const aVal = a[key];
      const bVal = b[key];
      
      const aNum = typeof aVal === 'string' ? parseFloat(aVal) : aVal;
      const bNum = typeof bVal === 'string' ? parseFloat(bVal) : bVal;

      if (aNum < bNum) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aNum > bNum) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [processedVideos, sortConfig]);

  // Computed campaign revenue — never stored in DB, always derived from video metrics
  const campaignRevenue = (campaignId: string) =>
    processedVideos
      .filter((v: any) => v.video?.campaign_id === campaignId)
      .reduce((sum: number, v: any) => sum + (v.total_revenue || 0), 0);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <Loader2 className="animate-spin text-red-600" size={32} />
    </div>
  );

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      {/* Sidebar */}
      <aside className={`w-80 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0 transition-all duration-300 ${isSidebarOpen ? 'ml-0' : '-ml-80'} lg:relative z-50`}>
        <div className="flex items-center justify-between p-6 border-b border-zinc-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
              <User size={16} className="text-zinc-500" />
            </div>
            <div className="truncate">
              <h3 className="text-xs font-black text-white truncate max-w-[150px]">{user?.email?.split('@')[0]}</h3>
              <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest leading-none">Creator Studio</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-zinc-500 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar space-y-8">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">Date Range</label>
            <div className="relative">
              <select 
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
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

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">Campaign</label>
            <div className="relative">
              <select 
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
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

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">Filter by Goal</label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'sales', label: 'Direct Sales' },
                { id: 'newsletter', label: 'Newsletter' },
                { id: 'calls', label: 'Sales Calls' },
                { id: 'consult', label: 'Paid Consult' },
                { id: 'viral', label: 'Awareness' }
              ].map(goal => (
                <button
                  key={goal.id}
                  onClick={() => {
                    setSelectedGoals(prev => 
                      prev.includes(goal.id) ? prev.filter(g => g !== goal.id) : [...prev, goal.id]
                    );
                  }}
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

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">Filter by Lead Magnet</label>
            <div className="space-y-1.5 overflow-y-auto pr-2 custom-scrollbar">
              {leadMagnets.filter(lm => selectedCampaignId === 'all' || lm.campaign_id === selectedCampaignId).map(lm => (
                <button
                  key={lm.id}
                  onClick={() => {
                    setSelectedLeadMagnets(prev => 
                      prev.includes(lm.id) ? prev.filter(id => id !== lm.id) : [...prev, lm.id]
                    );
                  }}
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
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">
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
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">In-Depth Analytics</h2>
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">Exhaustive performance data for all videos</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
              {(['stripe', 'pixel', 'total'] as RevenueView[]).map(v => (
                <button
                  key={v}
                  onClick={() => setRevenueView(v)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    revenueView === v ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-900 rounded-xl">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{sortedVideos.length} Videos Loaded</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-x-auto custom-scrollbar">
          <div className="inline-block min-w-full align-middle h-full overflow-y-auto">
            <table className="min-w-full divide-y divide-zinc-900 border-collapse">
              <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
                <tr>
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[300px] sticky left-0 z-30">
                    Video
                  </th>
                  {(Object.keys(METRIC_LABELS) as MetricType[]).map(key => (
                    <th 
                      key={key}
                      onClick={() => setSortConfig({ 
                        key, 
                        direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc' 
                      })}
                      className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 cursor-pointer hover:text-white transition-colors group bg-zinc-950 min-w-[180px]"
                    >
                      <div className="flex items-center gap-2">
                        {METRIC_LABELS[key]}
                        <ArrowUpDown size={10} className={sortConfig.key === key ? 'text-red-500' : 'text-zinc-800 group-hover:text-zinc-600'} />
                      </div>
                    </th>
                  ))}
                  <th className="px-6 py-5 border-b border-zinc-900 bg-zinc-950"></th>
                </tr>
              </thead>
              <tbody className="bg-black divide-y divide-zinc-900">
                {sortedVideos.map((v) => (
                  <tr key={v.video.id} className="hover:bg-zinc-950 transition-colors group">
                    <td className="px-6 py-5 whitespace-nowrap sticky left-0 z-10 bg-black group-hover:bg-zinc-950 transition-colors">
                      <div className="flex items-center gap-4">
                        <img 
                          src={v.video.thumbnail_url} 
                          className="w-16 h-9 object-cover rounded border border-zinc-800" 
                        />
                        <div className="max-w-[200px]">
                          <div className="text-xs font-black text-white truncate">{v.title || 'Untitled Video'}</div>
                          <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                            {v.campaign?.campaign_name || 'Individual Video'}
                          </div>
                        </div>
                      </div>
                    </td>
                    {(Object.keys(METRIC_LABELS) as MetricType[]).map(key => (
                      <td key={key} className="px-6 py-5 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                        {key === 'total_revenue' ? (
                          <div>
                            <div>${((revenueView === 'stripe'
                              ? (v.stripe_revenue ?? v.total_revenue)
                              : revenueView === 'pixel'
                              ? (v.pixel_revenue ?? v.total_revenue)
                              : v.total_revenue) || 0).toLocaleString()}</div>
                            <div className="text-[8px] text-zinc-600 uppercase tracking-widest mt-0.5">
                              {v.revenue_mode_label ?? 'Stripe'}
                            </div>
                          </div>
                        ) : (
                          <>
                            {key.includes('revenue') || key === 'rpc' ? '$' : ''}
                            {key === 'rpc' ? v[key] : (v[key] || 0).toLocaleString()}
                          </>
                        )}
                      </td>
                    ))}
                    <td className="px-6 py-5 whitespace-nowrap text-right">
                      <button 
                        onClick={() => navigate(`/videos/${v.video.id}`)}
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
                <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">No matching videos found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
