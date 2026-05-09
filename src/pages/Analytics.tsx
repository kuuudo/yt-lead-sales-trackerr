import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../lib/hooks';
import { supabase, Campaign, Video, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { 
  BarChart3, Calendar, Filter, ChevronDown, Check, 
  MousePointer2, DollarSign, Users, Phone, Briefcase, 
  TrendingUp, Activity, User, LayoutDashboard, Search,
  ArrowUpDown, Eye, ExternalLink, Loader2, Menu, X,
  ChevronLeft, ChevronRight, Info, AlertCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

type DateRange = '7days' | '28days' | '30days' | '3months' | '6months' | '12months';

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
  direct_offer_sales: 'Direct Offer Sales',
  estimated_call_revenue: 'Estimated Call Revenue',
  consultation_revenue: 'Consultation Revenue',
  total_revenue: 'Total Revenue',
  rpc: 'Revenue Per Click'
};

const METRIC_COLORS: Record<string, string> = {
  landing_page_view: '#3b82f6', // blue-500
  purchase_thankyou: '#22c55e', // green-500
  lead_magnet_click: '#6366f1', // indigo-500
  lead_magnet_thankyou: '#f59e0b', // amber-500
  newsletter_click: '#ec4899', // pink-500
  newsletter_thankyou: '#f97316', // orange-500
  call_booking_click: '#8b5cf6', // violet-500
  call_booking_thankyou: '#a855f7', // purple-500
  consultation_click: '#ef4444', // red-500
  consultation_thankyou: '#dc2626', // red-600
  direct_offer_sales: '#16a34a', // green-600
  estimated_call_revenue: '#2563eb', // blue-600
  consultation_revenue: '#9333ea', // purple-600
  total_revenue: '#dc2626', // red-600
  rpc: '#0ea5e9' // sky-500
};

export default function Analytics() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  // Filters from Search Params
  const [dateRange, setDateRange] = useState<DateRange>((searchParams.get('dr') as DateRange) || '28days');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(searchParams.get('goals')?.split(',').filter(Boolean) || []);
  const [selectedLeadMagnets, setSelectedLeadMagnets] = useState<string[]>(searchParams.get('lms')?.split(',').filter(Boolean) || []);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>(searchParams.get('vids')?.split(',').filter(Boolean) || []);
  const [warning, setWarning] = useState<string | null>(null);
  
  // UI State
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [granularity, setGranularity] = useState<'daily' | 'weekly'>('daily');
  const [showChart, setShowChart] = useState(true);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(true);
  const [isVideoSelectorOpen, setIsVideoSelectorOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'total_revenue', direction: 'desc' });

  // Sync state to search params
  useEffect(() => {
    const params: Record<string, string> = {};
    if (dateRange !== '28days') params.dr = dateRange;
    if (selectedGoals.length > 0) params.goals = selectedGoals.join(',');
    if (selectedLeadMagnets.length > 0) params.lms = selectedLeadMagnets.join(',');
    if (selectedVideoIds.length > 0) params.vids = selectedVideoIds.join(',');
    
    setSearchParams(params, { replace: true });
  }, [dateRange, selectedGoals, selectedLeadMagnets, selectedVideoIds]);

  useEffect(() => {
    if (warning) {
      const timer = setTimeout(() => setWarning(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [warning]);

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

      const { data: eData } = await supabase
        .from('events')
        .select('*')
        .in('video_id', vData?.map(v => v.id) || []);
      
      setEvents(eData || []);
    } catch (err) {
      console.error('Error fetching analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to filter by date range
  const dateFilteredEvents = useMemo(() => {
    let cutoff = new Date();
    switch(dateRange) {
      case '7days': cutoff.setDate(cutoff.getDate() - 7); break;
      case '28days': cutoff.setDate(cutoff.getDate() - 28); break;
      case '30days': cutoff.setDate(cutoff.getDate() - 30); break;
      case '3months': cutoff.setMonth(cutoff.getMonth() - 3); break;
      case '6months': cutoff.setMonth(cutoff.getMonth() - 6); break;
      case '12months': cutoff.setFullYear(cutoff.getFullYear() - 1); break;
      default: cutoff.setDate(cutoff.getDate() - 30);
    }
    return events.filter(e => new Date(e.created_at) >= cutoff);
  }, [events, dateRange]);

  // Derived filtered videos
  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
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
  }, [videos, selectedGoals, selectedLeadMagnets]);

  const videoIds = useMemo(() => filteredVideos.map(v => v.id), [filteredVideos]);

  // Deep metrics calculation
  const processedData = useMemo(() => {
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
        total_revenue: 0,
        rpc: 0
      };
    });

    const timelineMetrics: Record<string, any> = {};

    dateFilteredEvents.forEach(e => {
      if (!videoIds.includes(e.video_id)) return;
      const v = videoMetrics[e.video_id];
      if (v && v[e.event_type] !== undefined) {
        v[e.event_type]++;
      }

      const date = new Date(e.created_at);
      let key = date.toISOString().split('T')[0];
      
      if (granularity === 'weekly') {
        const day = date.getDay();
        const weekDate = new Date(date);
        weekDate.setDate(date.getDate() - day);
        key = weekDate.toISOString().split('T')[0];
      }

      if (!timelineMetrics[key]) {
        timelineMetrics[key] = { label: key, dateObj: date };
        // Initialize lines for selected videos
        if (selectedVideoIds.length > 0) {
          selectedVideoIds.forEach(vidId => { timelineMetrics[key][vidId] = 0; });
        } else {
          // If none selected, we can still show top 5 for "preview" or just zero?
          // User said: "If no videos selected, show flat zero lines for all videos (up to 5)"
          // Let's use the top 5 videos as placeholders if none selected, but set them to 0.
          filteredVideos.slice(0, 5).forEach(vid => { timelineMetrics[key][vid.id] = 0; });
        }
        Object.keys(METRIC_LABELS).forEach(m => { timelineMetrics[key][m] = 0; });
      }

      // Update aggregate timeline
      if (timelineMetrics[key][e.event_type] !== undefined) {
        timelineMetrics[key][e.event_type]++;
      }

      // Update per-video revenue in timeline ONLY if selected
      const camp = v?.campaign;
      if (camp) {
        let revenue = 0;
        if (e.event_type === 'purchase_thankyou') revenue = camp.offer_price || 0;
        if (e.event_type === 'consultation_thankyou') revenue = camp.consultation_fee || 0;
        
        if (revenue > 0) {
          timelineMetrics[key].total_revenue += revenue;
          if (timelineMetrics[key][e.video_id] !== undefined) {
            timelineMetrics[key][e.video_id] += revenue;
          }
          v.total_revenue += revenue;
          if (e.event_type === 'purchase_thankyou') v.direct_offer_sales += revenue;
          if (e.event_type === 'consultation_thankyou') v.consultation_revenue += revenue;
        }
      }
    });

    // Finalize per-video aggregated metrics
    Object.values(videoMetrics).forEach((v: any) => {
      const camp = v.campaign;
      if (camp) {
        v.estimated_call_revenue = v.call_booking_thankyou * ((camp.estimated_close_rate || 0) / 100) * (camp.offer_price || 0);
        v.rpc = v.landing_page_view > 0 ? (v.total_revenue / v.landing_page_view).toFixed(2) : '0.00';
      }
    });

    const sortedTimeline = Object.values(timelineMetrics).sort((a: any, b: any) => a.label.localeCompare(b.label));

    return {
      videos: Object.values(videoMetrics),
      timeline: sortedTimeline
    };
  }, [filteredVideos, dateFilteredEvents, campaigns, granularity, videoIds]);

  const summaryStats = useMemo(() => {
    const stats: Record<MetricType, number> = {} as any;
    Object.keys(METRIC_LABELS).forEach(m => stats[m as MetricType] = 0);

    const targetVideos = selectedVideoIds.length > 0 
      ? processedData.videos.filter(v => selectedVideoIds.includes(v.video.id))
      : processedData.videos;

    targetVideos.forEach(v => {
      Object.keys(METRIC_LABELS).forEach(m => {
        const key = m as MetricType;
        if (key === 'rpc') return;
        stats[key] += Number(v[key]) || 0;
      });
    });
    
    stats.rpc = stats.landing_page_view > 0 ? Number((stats.total_revenue / stats.landing_page_view).toFixed(2)) : 0;
    return stats;
  }, [processedData, selectedVideoIds]);

  const videosForChart = useMemo(() => {
    if (selectedVideoIds.length > 0) {
      return processedData.videos.filter(v => selectedVideoIds.includes(v.video.id));
    }
    // If none selected, return special entry for "Total Revenue"
    return [{ 
      video: { id: 'total_revenue' }, 
      title: 'Total Revenue' 
    } as any];
  }, [processedData.videos, selectedVideoIds]);

  const sortedVideos = useMemo(() => {
    const items = [...processedData.videos];
    items.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [processedData.videos, sortConfig]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-red-600" size={32} />
    </div>
  );

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden">
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-16 border-b border-zinc-900 bg-black flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-black text-white uppercase tracking-tight">Analytics Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
             <Link 
               to="/analytics/indepth" 
               className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:border-red-600/50 hover:bg-red-600/5 transition-all group"
             >
                <LayoutDashboard size={14} className="text-red-500 group-hover:scale-110 transition-transform" />
                In-Depth Analytics
             </Link>
             <Link to="/videos" className="hidden sm:flex px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all">
                My Videos
             </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 lg:px-8 py-8 space-y-12 pb-20 custom-scrollbar">
          {/* 1. Top Summary Cards */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Landing Page Clicks', value: summaryStats.landing_page_view, icon: MousePointer2, color: 'text-blue-500' },
              { label: 'Direct Purchases', value: summaryStats.purchase_thankyou, icon: DollarSign, color: 'text-green-500' },
              { label: 'Calls Booked', value: summaryStats.call_booking_thankyou, icon: Phone, color: 'text-purple-500' },
              { label: 'Newsletter Opt-ins', value: summaryStats.newsletter_thankyou, icon: Users, color: 'text-orange-500' },
              { label: 'Consultations Booked', value: summaryStats.consultation_thankyou, icon: Briefcase, color: 'text-red-500' },
            ].map(m => (
              <div key={m.label} className="bento-card p-5 flex flex-col justify-between min-h-[100px] hover:border-zinc-700 transition-colors">
                <span className="label-caps !text-[9px] !text-zinc-600 truncate">{m.label}</span>
                <div className="flex items-end justify-between mt-auto">
                  <span className="text-2xl font-black text-white">{m.value}</span>
                  <m.icon size={14} className={`${m.color} opacity-40 mb-1`} />
                </div>
              </div>
            ))}
          </section>

          {/* 2. Revenue Section */}
          <section className="bento-card p-10 bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 blur-[120px] rounded-full -mr-20 -mt-20 group-hover:bg-red-600/10 transition-colors" />
            <div className="relative z-10 space-y-6">
              <div>
                <span className="label-caps !text-red-600 mb-2 font-black text-[11px]">Total Revenue</span>
                <div className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl">
                  ${summaryStats.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-2">Aggregated Direct Offer Sales + Consultation Revenue</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-zinc-800/50">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Estimated Sales Call Revenue</span>
                  <div className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-zinc-400">$</span>{summaryStats.estimated_call_revenue.toLocaleString()}
                  </div>
                  <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Across all campaigns</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Revenue Per Click</span>
                  <div className="text-xl font-bold text-white">
                    <span className="text-zinc-400">$</span>{summaryStats.rpc}
                  </div>
                  <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Average from total clicks</p>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Detailed Breakdown & Timeline */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 bento-card p-0 overflow-hidden">
              <button 
                onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
                className="w-full flex justify-between items-center p-6 border-b border-zinc-900 overflow-hidden bg-zinc-950/20 hover:bg-zinc-950/40 transition-all group"
              >
                <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
                  <Activity size={14} className="text-red-600" /> Event Breakdown
                </h3>
                <ChevronDown 
                  size={16} 
                  className={`text-zinc-600 group-hover:text-white transition-transform duration-300 ${isBreakdownOpen ? 'rotate-180' : ''}`} 
                />
              </button>

              <AnimatePresence>
                {isBreakdownOpen && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    <div className="p-6">
                      <div className="relative mb-6">
                        <button 
                          onClick={() => setIsVideoSelectorOpen(!isVideoSelectorOpen)}
                          className="w-full flex items-center justify-between px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all shadow-sm group"
                        >
                          <span className="flex items-center gap-2">
                             <Filter size={12} className={selectedVideoIds.length > 0 ? "text-red-600" : "text-zinc-600"} />
                             {(selectedVideoIds.length === 0 || selectedVideoIds.length === videos.length) ? "All Videos" : `${selectedVideoIds.length} Videos Selected`}
                          </span>
                          <ChevronDown size={14} className={`transition-transform duration-200 ${isVideoSelectorOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {isVideoSelectorOpen && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute top-full left-0 w-full mt-2 bg-zinc-950 border border-zinc-900 rounded-2xl shadow-2xl z-50 p-2 max-h-64 overflow-y-auto custom-scrollbar"
                            >
                              <div className="p-2 border-b border-zinc-900 mb-2 flex justify-between items-center">
                                 <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Select Videos</span>
                                 <button 
                                   onClick={() => setSelectedVideoIds([])}
                                   className="text-[8px] font-black text-red-600 hover:text-red-500 uppercase tracking-widest transition-colors"
                                 >
                                   Clear All
                                 </button>
                              </div>
                              {videos.map(v => {
                                const isSelected = selectedVideoIds.includes(v.id);
                                return (
                                  <button
                                    key={v.id}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedVideoIds(prev => prev.filter(id => id !== v.id));
                                      } else {
                                        if (selectedVideoIds.length < 5) {
                                          setSelectedVideoIds(prev => [...prev, v.id]);
                                        } else {
                                          setWarning("Maximum 5 videos");
                                        }
                                      }
                                    }}
                                    className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all mb-1 last:mb-0 group ${isSelected ? 'bg-red-600/10 text-white' : 'hover:bg-zinc-900 text-zinc-500'}`}
                                  >
                                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${isSelected ? 'bg-red-600 border-red-600' : 'border-zinc-800 bg-zinc-900'}`}>
                                       {isSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className={`text-[9px] font-black uppercase truncate tracking-tight transition-colors ${isSelected ? 'text-white' : 'group-hover:text-zinc-300'}`}>{v.video_title}</p>
                                    </div>
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      
                      <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                        {[
                          { label: 'Landing Page Clicks', value: summaryStats.landing_page_view },
                          { label: 'Direct Purchases', value: summaryStats.purchase_thankyou },
                          { label: 'Lead Magnet Clicks', value: summaryStats.lead_magnet_click },
                          { label: 'Lead Magnet Opt-ins', value: summaryStats.lead_magnet_thankyou },
                          { label: 'Newsletter Clicks', value: summaryStats.newsletter_click },
                          { label: 'Newsletter Opt-ins', value: summaryStats.newsletter_thankyou },
                          { label: 'Call Booking Clicks', value: summaryStats.call_booking_click },
                          { label: 'Call Bookings Confirmed', value: summaryStats.call_booking_thankyou },
                          { label: 'Consultation Page Clicks', value: summaryStats.consultation_click },
                          { label: 'Consultation Purchases', value: summaryStats.consultation_thankyou },
                        ].map((stat, i, arr) => (
                          <div key={stat.label} className={`flex justify-between items-center py-2 ${i !== arr.length - 1 ? 'border-b border-zinc-900/30' : ''}`}>
                            <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider font-mono truncate mr-4">{stat.label}</span>
                            <span className="text-[12px] font-black text-white tabular-nums">{stat.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="lg:col-span-8 flex flex-col gap-6">
              <section className="bento-card p-8 flex flex-col w-full h-[500px]">
                <div className="flex justify-between items-center mb-10">
                  <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
                    <BarChart3 size={14} className="text-red-600" /> Revenue Timeline
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="flex bg-zinc-950 border border-zinc-900 rounded-xl p-1">
                      <button 
                        onClick={() => setGranularity('daily')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${granularity === 'daily' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-600'}`}
                      >
                        Daily
                      </button>
                      <button 
                        onClick={() => setGranularity('weekly')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${granularity === 'weekly' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-600'}`}
                      >
                        Weekly
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={processedData.timeline} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                      <XAxis 
                        dataKey="label" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#3f3f46', fontSize: 9, fontWeight: 'bold' }}
                        dy={10}
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#3f3f46', fontSize: 9, fontWeight: 'bold' }}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', border: '1px solid #18181b' }} 
                        itemStyle={{ fontSize: '10px', fontWeight: 'bold' }} 
                        labelStyle={{ color: '#71717a', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}
                        labelFormatter={(label) => new Date(label).toDateString()}
                      />
                      <Legend 
                        iconType="circle" 
                        wrapperStyle={{ paddingTop: '30px', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      />
                      {videosForChart.map((v, idx) => (
                        <Line 
                          key={v.video.id} 
                          type="monotone" 
                          dataKey={v.video.id} 
                          name={v.title || `Video ${idx + 1}`}
                          stroke={[
                            '#dc2626', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'
                          ][idx % 5]} 
                          strokeWidth={3} 
                          dot={false} 
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          </section>

          {/* 4. Video Selection Table & Filters */}
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <label className="label-caps !text-zinc-600">Date Range</label>
                <div className="relative">
                  <select 
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value as DateRange)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase text-zinc-400 tracking-widest outline-none focus:border-red-600 transition-all cursor-pointer hover:bg-zinc-800 appearance-none pr-10"
                  >
                    <option value="7days">Last 7 Days</option>
                    <option value="28days">Last 28 Days</option>
                    <option value="30days">Last 30 Days</option>
                    <option value="3months">Last 3 Months</option>
                    <option value="6months">Last 6 Months</option>
                    <option value="12months">Last 12 Months</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <label className="label-caps !text-zinc-600">Filter by Goal</label>
                <div className="relative group">
                   <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase text-zinc-400 tracking-widest min-h-[42px] flex items-center gap-2 flex-wrap overflow-hidden">
                      {selectedGoals.length === 0 ? "Select Goals" : `${selectedGoals.length} Goals Selected`}
                   </div>
                   <div className="absolute top-full left-0 w-full mt-1 bg-zinc-950 border border-zinc-900 rounded-xl p-2 hidden group-hover:block z-50">
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
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all mb-1 last:mb-0 ${
                            selectedGoals.includes(goal.id) ? 'bg-red-600 text-white' : 'hover:bg-zinc-900 text-zinc-500'
                          }`}
                        >
                          {goal.label}
                        </button>
                      ))}
                   </div>
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <label className="label-caps !text-zinc-600">Filter by Lead Magnet</label>
                <div className="relative group">
                   <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase text-zinc-400 tracking-widest min-h-[42px] flex items-center gap-2 flex-wrap overflow-hidden">
                      {selectedLeadMagnets.length === 0 ? "Select Lead Magnets" : `${selectedLeadMagnets.length} Selected`}
                   </div>
                   <div className="absolute top-full left-0 w-full mt-1 bg-zinc-950 border border-zinc-900 rounded-xl p-2 hidden group-hover:block z-50 max-h-64 overflow-y-auto custom-scrollbar">
                      {leadMagnets.map(lm => (
                        <button
                          key={lm.id}
                          onClick={() => {
                            setSelectedLeadMagnets(prev => 
                              prev.includes(lm.id) ? prev.filter(id => id !== lm.id) : [...prev, lm.id]
                            );
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all mb-1 last:mb-0 truncate ${
                            selectedLeadMagnets.includes(lm.id) ? 'bg-red-600 text-white' : 'hover:bg-zinc-900 text-zinc-500'
                          }`}
                        >
                          {lm.lead_magnet_name}
                        </button>
                      ))}
                   </div>
                </div>
              </div>

              <div className="flex items-center gap-4 h-[42px]">
                <button 
                  onClick={() => {
                    setSelectedGoals([]);
                    setSelectedLeadMagnets([]);
                    setSelectedVideoIds([]);
                    setDateRange('28days');
                  }}
                  className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-all"
                >
                  Reset All
                </button>
              </div>
            </div>

            <div className="bento-card overflow-hidden">
              <div className="p-6 border-b border-zinc-900 flex justify-between items-center">
                <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
                  Video Selection Table
                </h3>
                <div className="flex items-center gap-4">
                  {warning && (
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse flex items-center gap-2">
                       <AlertCircle size={12} /> {warning}
                    </span>
                  )}
                  <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                    {selectedVideoIds.length}/5 SELECTED
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead className="bg-zinc-950/50 sticky top-0 z-10">
                    <tr>
                      <th className="p-4 w-12 text-center">
                         <div className="flex items-center justify-center">
                           <input 
                             type="checkbox" 
                             checked={selectedVideoIds.length === Math.min(filteredVideos.length, 5) && filteredVideos.length > 0}
                             onChange={() => {
                               if (selectedVideoIds.length > 0) {
                                 setSelectedVideoIds([]);
                               } else {
                                 const toSelect = filteredVideos.slice(0, 5).map(v => v.id);
                                 setSelectedVideoIds(toSelect);
                                 if (filteredVideos.length > 5) {
                                   setWarning("Maximum 5 videos");
                                 }
                               }
                             }}
                             className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-red-600 focus:ring-0 cursor-pointer"
                           />
                         </div>
                      </th>
                      <th className="p-4 label-caps !text-zinc-600 !text-[9px] whitespace-nowrap min-w-[200px]">Video</th>
                      {[
                        { key: 'landing_page_view', label: 'Landing Page Clicks' },
                        { key: 'purchase_thankyou', label: 'Direct Purchases' },
                        { key: 'lead_magnet_click', label: 'Lead Magnet Clicks' },
                        { key: 'lead_magnet_thankyou', label: 'Lead Magnet Opt-ins' },
                        { key: 'newsletter_click', label: 'Newsletter Clicks' },
                        { key: 'newsletter_thankyou', label: 'Newsletter Opt-ins' },
                        { key: 'call_booking_click', label: 'Call Booking Clicks' },
                        { key: 'call_booking_thankyou', label: 'Call Bookings Confirmed' },
                        { key: 'consultation_click', label: 'Consultation Page Clicks' },
                        { key: 'consultation_thankyou', label: 'Consultation Purchases' }
                      ].map(col => (
                        <th 
                          key={col.key}
                          onClick={() => setSortConfig({
                            key: col.key,
                            direction: sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
                          })}
                          className="p-4 label-caps !text-zinc-600 !text-[9px] cursor-pointer hover:text-white transition-colors group whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                             {col.label}
                             <ArrowUpDown size={10} className={sortConfig.key === col.key ? 'text-red-600' : 'text-zinc-800 group-hover:text-zinc-600'} />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {sortedVideos.map(v => {
                      const isSelected = selectedVideoIds.includes(v.video.id);
                      return (
                        <tr 
                          key={v.video.id} 
                          className={`hover:bg-zinc-900/50 transition-colors ${isSelected ? 'bg-red-600/5' : ''}`}
                        >
                          <td className="p-4 w-12 text-center">
                             <div className="flex items-center justify-center">
                               <input 
                                 type="checkbox" 
                                 checked={isSelected}
                                 onChange={() => {
                                   if (isSelected) {
                                     setSelectedVideoIds(prev => prev.filter(id => id !== v.video.id));
                                   } else {
                                     if (selectedVideoIds.length < 5) {
                                       setSelectedVideoIds(prev => [...prev, v.video.id]);
                                     } else {
                                       setWarning("Maximum 5 videos");
                                     }
                                   }
                                 }}
                                 className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-red-600 focus:ring-0 cursor-pointer"
                               />
                             </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-3 group/vid">
                              <Link 
                                to={`/videos/${v.video.id}`}
                                className="w-12 h-8 rounded bg-zinc-900 border border-zinc-800 overflow-hidden flex-shrink-0 hover:border-zinc-500 transition-all group/vid-thumb"
                              >
                                <img src={v.video.thumbnail_url} className="w-full h-full object-cover group-hover/vid-thumb:scale-110 transition-all" />
                              </Link>
                              <div className="min-w-0">
                                 <Link 
                                   to={`/videos/${v.video.id}`}
                                   className="text-[10px] font-black text-white uppercase truncate tracking-tight hover:text-red-500 transition-all"
                                 >
                                   {v.title}
                                 </Link>
                                 <p className="text-[8px] font-bold text-zinc-600 uppercase mt-0.5">{v.campaign?.campaign_name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.landing_page_view}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.purchase_thankyou}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.lead_magnet_click}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.lead_magnet_thankyou}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.newsletter_click}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.newsletter_thankyou}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.call_booking_click}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.call_booking_thankyou}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.consultation_click}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.consultation_thankyou}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
