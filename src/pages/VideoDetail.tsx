import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/hooks';
import { supabase, Video, Campaign, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { 
  ArrowLeft, Youtube, DollarSign, Users, Activity, 
  TrendingUp, MousePointer2, Phone, Briefcase, 
  ExternalLink, BarChart3, Clock, Edit2, Trash2, Save, X, Loader2, Check, Link2, Plus, Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Modal } from '../components/Modal';
import { createRedirectLink, RedirectLinkType } from '../lib/redirects';

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [video, setVideo] = useState<Video | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  
  // UI State
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [timeRange, setTimeRange] = useState('7days');
  const [availableCampaignLeadMagnets, setAvailableCampaignLeadMagnets] = useState<LeadMagnet[]>([]);
  const [copiedLinkToken, setCopiedLinkToken] = useState<string | null>(null);

  // All redirect links for this video
  const [redirectLinks, setRedirectLinks] = useState<any[]>([]);
  const [allLeadMagnetNames, setAllLeadMagnetNames] = useState<Record<string, string>>({});

  // Extra link form state
  const [showAddLink, setShowAddLink] = useState(false);
  const [extraLinkType, setExtraLinkType] = useState<RedirectLinkType>('landing_page');
  const [extraLinkUrl, setExtraLinkUrl] = useState('');
  const [extraLinkLeadMagnetId, setExtraLinkLeadMagnetId] = useState('');
  const [savingExtraLink, setSavingExtraLink] = useState(false);
  const [deletingLinkToken, setDeletingLinkToken] = useState<string | null>(null);

  // Edit Form State
  const [editForm, setEditForm] = useState({
    campaign_id: '',
    video_goal: [] as string[],
    has_lead_magnet: false,
    selected_lead_magnet_ids: [] as string[]
  });

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
    variant: 'info'
  });

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info', onConfirm?: () => void) => {
    setModalConfig({ isOpen: true, title, message, variant, onConfirm });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({ isOpen: true, title, message, variant: 'danger', onConfirm });
  };

  useEffect(() => {
    if (user && id) fetchData();
  }, [user, id]);

  const fetchData = async () => {
    try {
      const { data: vData, error: vErr } = await supabase.from('videos').select('*').eq('id', id).single();
      if (vErr) throw vErr;
      setVideo(vData);
      
      setEditForm({
        campaign_id: vData.campaign_id,
        video_goal: vData.video_goal,
        has_lead_magnet: !!(vData.selected_lead_magnet_ids && vData.selected_lead_magnet_ids.length > 0),
        selected_lead_magnet_ids: vData.selected_lead_magnet_ids || []
      });

      const { data: cData } = await supabase.from('campaigns').select('*').eq('id', vData.campaign_id).single();
      setCampaign(cData);

      if (vData.selected_lead_magnet_ids && vData.selected_lead_magnet_ids.length > 0) {
        const { data: lmData } = await supabase
          .from('lead_magnets')
          .select('*')
          .in('id', vData.selected_lead_magnet_ids);
        setLeadMagnets(lmData || []);
      }

      const { data: campaignLms } = await supabase
        .from('lead_magnets')
        .select('*')
        .eq('campaign_id', vData.campaign_id);
      setAvailableCampaignLeadMagnets(campaignLms || []);

      // Fetch all redirect links for this video
      const { data: linksData } = await supabase
        .from('redirect_links')
        .select('token, link_type, destination_url, lead_magnet_id, created_at')
        .eq('video_id', id)
        .order('created_at', { ascending: true });
      setRedirectLinks(linksData || []);

      // Build lead magnet name lookup for all campaign lead magnets
      if (campaignLms && campaignLms.length > 0) {
        const nameMap: Record<string, string> = {};
        campaignLms.forEach((lm: any) => { nameMap[lm.id] = lm.lead_magnet_name; });
        setAllLeadMagnetNames(nameMap);
      }

      const { data: eData } = await supabase
        .from('events')
        .select('*')
        .eq('video_id', id);
      setEvents(eData || []);

    } catch (err: any) {
      console.error('Error fetching video detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const getLinkLabel = (linkType: string, leadMagnetId?: string, dupIndex?: number) => {
    const suffix = dupIndex && dupIndex > 1 ? ` ${dupIndex}` : '';
    if (linkType === 'lead_magnet' && leadMagnetId && allLeadMagnetNames[leadMagnetId]) {
      return `📦 ${allLeadMagnetNames[leadMagnetId]}${suffix}`;
    }
    const labels: Record<string, string> = {
      landing_page: '🏠 Landing Page',
      newsletter: '📧 Newsletter',
      newsletter_thankyou: '✅ Newsletter Thank You',
      checkout: '🛒 Checkout',
      purchase_thankyou: '✅ Purchase Thank You',
      sales_call: '📞 Sales Call',
      sales_call_thankyou: '✅ Sales Call Thank You',
      consultation: '💼 Consultation',
      consultation_thankyou: '✅ Consultation Thank You',
      lead_magnet: '📦 Lead Magnet',
    };
    return (labels[linkType] || linkType) + suffix;
  };

  const LINKS_ORDER = [
    'landing_page', 'checkout', 'newsletter',
    'consultation', 'sales_call', 'lead_magnet'
  ];

  const sortedLinks = [...redirectLinks].sort((a, b) => {
    const ai = LINKS_ORDER.indexOf(a.link_type);
    const bi = LINKS_ORDER.indexOf(b.link_type);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // A link is "extra" if created more than 2 minutes after the video was saved
  const isExtraLink = (link: any) => {
    if (!video) return false;
    const videoSavedAt = new Date(video.created_at).getTime();
    const linkCreatedAt = new Date(link.created_at).getTime();
    return linkCreatedAt - videoSavedAt > 2 * 60 * 1000;
  };

  const handleAddExtraLink = async () => {
    if (!video || !campaign) return;
    setSavingExtraLink(true);
    try {
      const appBaseUrl = window.location.origin;
      const urlToUse = extraLinkType === 'lead_magnet'
        ? availableCampaignLeadMagnets.find(lm => lm.id === extraLinkLeadMagnetId)?.lead_magnet_url || ''
        : extraLinkUrl;

      if (!urlToUse) {
        showAlert('URL Required', 'Please enter a destination URL.', 'info');
        return;
      }

      const leadMagnetId = extraLinkType === 'lead_magnet' ? extraLinkLeadMagnetId : undefined;
      await createRedirectLink(video.id, video.campaign_id, extraLinkType, urlToUse, appBaseUrl, leadMagnetId, true);

      // Refresh links
      const { data: linksData } = await supabase
        .from('redirect_links')
        .select('token, link_type, destination_url, lead_magnet_id, created_at')
        .eq('video_id', video.id)
        .order('created_at', { ascending: true });
      setRedirectLinks(linksData || []);

      setShowAddLink(false);
      setExtraLinkUrl('');
      setExtraLinkLeadMagnetId('');
      setExtraLinkType('landing_page');
    } catch (err: any) {
      showAlert('Error', err.message || 'Could not create link.', 'danger');
    } finally {
      setSavingExtraLink(false);
    }
  };

  const handleDeleteExtraLink = async (token: string) => {
    setDeletingLinkToken(token);
    try {
      const { error } = await supabase.from('redirect_links').delete().eq('token', token);
      if (error) throw error;
      setRedirectLinks(prev => prev.filter(l => l.token !== token));
    } catch (err: any) {
      showAlert('Error', err.message || 'Could not delete link.', 'danger');
    } finally {
      setDeletingLinkToken(null);
    }
  };

  const handleDelete = async () => {
    showConfirm(
      'Delete Video',
      'Are you sure you want to permanently delete this video? This action cannot be undone.',
      async () => {
        setDeleting(true);
        console.log(`[DEBUG] Initiating Supabase DELETE for video ID: ${id}`);
        
        try {
          const response = await supabase.from('videos').delete().eq('id', id);
          console.log('[DEBUG] Full Supabase response:', response);
          
          const { error, status } = response;
          
          if (error) {
            console.error('[DEBUG] Supabase Delete Error:', error);
            showAlert('Delete Failed', `Could not delete the video. Error: ${error.message}`, 'danger');
            return;
          }
          
          console.log('[DEBUG] Video deleted successfully, redirecting...');
          showAlert(
            'Deleted Successfully', 
            'The video has been removed. You will be redirected back to the videos list.', 
            'success',
            () => navigate('/videos')
          );
        } catch (err: any) {
          console.error('[DEBUG] Error in handleDelete:', err);
          showAlert('Unexpected Error', `An error occurred while deleting: ${err?.message || 'Unknown error'}`, 'danger');
        } finally {
          setDeleting(false);
        }
      }
    );
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      const payload = {
        campaign_id: editForm.campaign_id,
        video_goal: editForm.video_goal,
        selected_lead_magnet_ids: editForm.has_lead_magnet ? editForm.selected_lead_magnet_ids : null
      };

      const { error } = await supabase.from('videos').update(payload).eq('id', id);
      if (error) throw error;
      
      setShowEdit(false);
      await fetchData();
      showAlert('Changes Saved', 'Video tracking settings have been updated successfully.', 'success');
    } catch (err: any) {
      console.error('Error updating video:', err);
      showAlert('Update Failed', `Could not update video: ${err.message || 'Unknown error'}`, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const metrics = useMemo(() => {
    if (!video || !campaign) return null;
    
    const websiteClicks = events.filter(e => e.event_type === 'landing_page_view').length;
    const lmClicks = events.filter(e => e.event_type === 'lead_magnet_click').length;
    const lmOptins = events.filter(e => e.event_type === 'lead_magnet_thankyou').length;
    const newsletterClicks = events.filter(e => e.event_type === 'newsletter_click').length;
    const newsletterOptins = events.filter(e => e.event_type === 'newsletter_thankyou').length;
    const directPurchases = events.filter(e => e.event_type === 'purchase_thankyou').length;
    const directOfferSales = directPurchases * (campaign.offer_price || 0);
    const callClicks = events.filter(e => e.event_type === 'call_booking_click').length;
    const callBookingsConfirmed = events.filter(e => e.event_type === 'call_booking_thankyou').length;
    const estimatedCallRevenue = callBookingsConfirmed * ((campaign.estimated_close_rate || 0) / 100) * (campaign.offer_price || 0);
    const consultClicks = events.filter(e => e.event_type === 'consultation_click').length;
    const consultPurchases = events.filter(e => e.event_type === 'consultation_thankyou').length;
    const consultationRevenue = consultPurchases * (campaign.consultation_fee || 0);
    
    // Total Revenue = Direct Offer Sales + Consultation Revenue
    const totalRevenue = directOfferSales + consultationRevenue;

    let days = 7;
    if (timeRange === '30days') days = 30;
    if (timeRange === '2months') days = 60;
    if (timeRange === '6months') days = 180;
    if (timeRange === '1year') days = 365;

    const timelineData = Array.from({ length: days }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const dayEvents = events.filter(e => new Date(e.created_at).toDateString() === d.toDateString());
      const dayPurchases = dayEvents.filter(e => e.event_type === 'purchase_thankyou').length;
      const dayConsultationPurchases = dayEvents.filter(e => e.event_type === 'consultation_thankyou').length;
      const dayRev = (dayPurchases * (campaign.offer_price || 0)) + (dayConsultationPurchases * (campaign.consultation_fee || 0));
      return { name: dateStr, revenue: dayRev };
    });

    const lastConversion = events.length > 0 
      ? new Date(Math.max(...events.map(e => new Date(e.created_at).getTime()))).toLocaleString()
      : 'No data';

    return {
      websiteClicks,
      lmClicks,
      lmOptins,
      newsletterClicks,
      newsletterOptins,
      directPurchases,
      directOfferSales,
      callClicks,
      callBookingsConfirmed,
      estimatedCallRevenue,
      consultClicks,
      consultPurchases,
      consultationRevenue,
      totalRevenue,
      rpc: websiteClicks > 0 ? (totalRevenue / websiteClicks).toFixed(2) : '0.00',
      timeline: timelineData,
      lastConversion
    };
  }, [video, campaign, events, timeRange]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Activity className="animate-spin text-red-600" size={32} />
    </div>
  );

  if (!video) return (
    <div className="text-center py-20">
      <h2 className="text-white font-bold">Video not found</h2>
      <Link to="/videos" className="text-red-500 text-xs uppercase font-bold mt-4 inline-block">Back to list</Link>
    </div>
  );

  return (
    <div className="space-y-12 pb-20">
      <header className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div className="flex gap-6 items-center">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-4">
            <div className="group relative w-16 h-10 overflow-hidden rounded-lg border border-zinc-800">
              <img src={video.thumbnail_url} className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white leading-tight">{video.video_title}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[9px] font-black uppercase text-red-600 tracking-widest">{campaign?.campaign_name}</span>
                <span className="w-1 h-1 bg-zinc-800 rounded-full" />
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{new Date(video.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setShowEdit(true)}
            className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-all"
            title="Edit Video"
          >
            <Edit2 size={20} />
          </button>
          <button 
            onClick={handleDelete}
            disabled={deleting}
            className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-red-500 transition-all disabled:opacity-50"
            title="Delete Video"
          >
            {deleting ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
          </button>
          <a 
            href={`https://youtube.com/watch?v=${video.youtube_video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 bg-white text-zinc-950 rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center"
          >
            <ExternalLink size={20} />
          </a>
        </div>
      </header>

      {/* 1. Top Summary Cards */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Landing Page Clicks', value: metrics?.websiteClicks, icon: MousePointer2, color: 'text-blue-500' },
          { label: 'Direct Purchases', value: metrics?.directPurchases, icon: DollarSign, color: 'text-green-500' },
          { label: 'Calls Booked', value: metrics?.callBookingsConfirmed, icon: Phone, color: 'text-purple-500' },
          { label: 'Newsletter Opt-ins', value: metrics?.newsletterOptins, icon: Users, color: 'text-orange-500' },
          { label: 'Consultations Booked', value: metrics?.consultPurchases, icon: Briefcase, color: 'text-red-500' },
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
            <span className="label-caps !text-red-600 mb-2 font-black">Total Revenue</span>
            <div className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl">
              ${metrics?.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-2">Direct Offer Sales + Consultation Revenue</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-zinc-800/50">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Estimated Sales Call Revenue</span>
              <div className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-zinc-400">$</span>{metrics?.estimatedCallRevenue.toLocaleString()}
              </div>
              <p className="text-[9px] text-zinc-600 font-bold uppercase">Based on {campaign?.estimated_close_rate}% close rate</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Revenue Per Click</span>
              <div className="text-xl font-bold text-white">
                <span className="text-zinc-400">$</span>{metrics?.rpc}
              </div>
              <p className="text-[9px] text-zinc-600 font-bold uppercase">Calculated from Landing Page Clicks</p>
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Breakdown & Timeline */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 bento-card p-8">
          <h3 className="label-caps !text-white mb-8 flex items-center gap-2 font-black uppercase tracking-widest">
            <Activity size={14} className="text-red-600" /> Event Breakdown
          </h3>
          <div className="space-y-4">
            {[
              { label: 'Landing Page Clicks', value: metrics?.websiteClicks },
              { label: 'Direct Purchases', value: metrics?.directPurchases },
              { label: 'Lead Magnet Clicks', value: metrics?.lmClicks },
              { label: 'Lead Magnet Opt-ins', value: metrics?.lmOptins },
              { label: 'Newsletter Clicks', value: metrics?.newsletterClicks },
              { label: 'Newsletter Opt-ins', value: metrics?.newsletterOptins },
              { label: 'Call Booking Clicks', value: metrics?.callClicks },
              { label: 'Call Bookings Confirmed', value: metrics?.callBookingsConfirmed },
              { label: 'Consultation Page Clicks', value: metrics?.consultClicks },
              { label: 'Consultation Purchases', value: metrics?.consultPurchases },
            ].map((stat, i, arr) => (
              <div key={stat.label} className={`flex justify-between items-center py-3 ${i !== arr.length - 1 ? 'border-b border-zinc-800/50' : ''}`}>
                <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider font-mono">{stat.label}</span>
                <span className="text-sm font-black text-white tabular-nums">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="bento-card p-8 min-h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-10">
              <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
                <BarChart3 size={14} className="text-red-600" /> Revenue Timeline
              </h3>
              <select 
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-zinc-400 tracking-widest outline-none focus:border-red-600 transition-all cursor-pointer hover:bg-zinc-900"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="2months">Last 2 Months</option>
                <option value="6months">Last 6 Months</option>
                <option value="1year">Last Year</option>
              </select>
            </div>
            <div className="flex-1 w-full min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics?.timeline}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#3f3f46', fontSize: 9, fontWeight: 'bold' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#3f3f46', fontSize: 9, fontWeight: 'bold' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', border: '1px solid #18181b' }} 
                    itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }} 
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#dc2626" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="bento-card p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-zinc-600" />
              <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">Last Conversion Activity</span>
            </div>
            <span className="text-[10px] font-black text-white uppercase">{metrics?.lastConversion}</span>
          </div>
        </div>
      </section>

      {/* Tracking Links Section */}
      <section className="bento-card p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
            <Link2 size={14} className="text-red-600" /> Tracking Links
          </h3>
          <button
            onClick={() => setShowAddLink(!showAddLink)}
            className="flex items-center gap-2 h-9 px-4 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all"
          >
            <Plus size={14} /> Add Link
          </button>
        </div>

        {/* Add Extra Link Form */}
        <AnimatePresence>
          {showAddLink && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-5 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-4"
            >
              <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Generate New Tracking Link</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="label-caps">Link Type</label>
                  <select
                    value={extraLinkType}
                    onChange={e => {
                      setExtraLinkType(e.target.value as RedirectLinkType);
                      setExtraLinkUrl('');
                      setExtraLinkLeadMagnetId('');
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold uppercase outline-none focus:border-red-600 appearance-none"
                  >
                    <option value="landing_page">🏠 Landing Page</option>
                    <option value="newsletter">📧 Newsletter</option>
                    <option value="checkout">🛒 Checkout</option>
                    <option value="consultation">💼 Consultation</option>
                    <option value="sales_call">📞 Sales Call</option>
                    <option value="lead_magnet">📦 Lead Magnet</option>
                  </select>
                </div>

                {extraLinkType === 'lead_magnet' ? (
                  <div className="space-y-1">
                    <label className="label-caps">Select Lead Magnet</label>
                    {availableCampaignLeadMagnets.length === 0 ? (
                      <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                        <p className="text-[10px] text-zinc-500 font-bold">No lead magnets found.</p>
                        <a href="/campaigns" className="text-[10px] text-red-500 font-bold underline mt-1 inline-block">
                          Go to Campaign to add one first →
                        </a>
                      </div>
                    ) : (
                      <select
                        value={extraLinkLeadMagnetId}
                        onChange={e => setExtraLinkLeadMagnetId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold uppercase outline-none focus:border-red-600 appearance-none"
                      >
                        <option value="">Select lead magnet...</option>
                        {availableCampaignLeadMagnets.map(lm => (
                          <option key={lm.id} value={lm.id}>{lm.lead_magnet_name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="label-caps">Destination URL</label>
                    <input
                      value={extraLinkUrl}
                      onChange={e => setExtraLinkUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm font-mono text-zinc-400 outline-none focus:border-red-600 transition-all"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowAddLink(false); setExtraLinkUrl(''); setExtraLinkLeadMagnetId(''); }}
                  className="flex-1 h-10 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddExtraLink}
                  disabled={savingExtraLink || (extraLinkType === 'lead_magnet' ? !extraLinkLeadMagnetId : !extraLinkUrl)}
                  className="flex-1 h-10 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {savingExtraLink ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Generate</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* All Links List */}
        <div className="space-y-2">
          {sortedLinks.length === 0 ? (
            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest text-center py-6">No tracking links found</p>
          ) : (() => {
            // Only show these link types to the user
            const VISIBLE_LINK_TYPES = ['landing_page', 'newsletter', 'consultation', 'sales_call', 'lead_magnet'];
            // Track how many of each type we've seen to compute dupIndex
            const typeCounters: Record<string, number> = {};
            return sortedLinks.filter(l => VISIBLE_LINK_TYPES.includes(l.link_type)).map(l => {
              const key = l.link_type === 'lead_magnet' ? `lead_magnet_${l.lead_magnet_id}` : l.link_type;
              typeCounters[key] = (typeCounters[key] || 0) + 1;
              const dupIndex = typeCounters[key];
              const isExtra = isExtraLink(l);
              return (
                <div
                  key={l.token}
                  className="flex items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase text-zinc-400 mb-1">
                      {getLinkLabel(l.link_type, l.lead_magnet_id, dupIndex)}
                      {isExtra && (
                        <span className="ml-2 text-[8px] text-amber-500 border border-amber-500/30 rounded px-1 py-0.5">UPDATED</span>
                      )}
                    </p>
                    <p className="font-mono text-[11px] text-blue-400 truncate">
                      {window.location.origin}/{l.token}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/${l.token}`);
                        setCopiedLinkToken(l.token);
                        setTimeout(() => setCopiedLinkToken(null), 2000);
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-all"
                    >
                      {copiedLinkToken === l.token ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} className="text-zinc-400" />
                      )}
                    </button>
                    {isExtra && (
                      <button
                        onClick={() => handleDeleteExtraLink(l.token)}
                        disabled={deletingLinkToken === l.token}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-zinc-800 hover:bg-zinc-900 hover:border-red-500/50 text-zinc-600 hover:text-red-500 transition-all disabled:opacity-40"
                      >
                        {deletingLinkToken === l.token ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </section>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEdit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEdit(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Edit Tracked Video</h2>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-1">Update tracking parameters</p>
                </div>
                <button onClick={() => setShowEdit(false)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                  <X size={20} className="text-zinc-500" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-1">
                  <label className="label-caps">Campaign</label>
                  <select 
                    value={editForm.campaign_id}
                    onChange={e => setEditForm({ ...editForm, campaign_id: e.target.value })}
                    disabled
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-bold uppercase outline-none focus:border-red-600 appearance-none opacity-50 cursor-not-allowed"
                  >
                    <option value={campaign?.id}>{campaign?.campaign_name}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="label-caps">Goals / Objectives</label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(['newsletter', 'calls', 'consult', 'sales', 'viral'] as const).map(obj => (
                      <button
                        key={obj}
                        type="button"
                        onClick={() => {
                          const newObj = editForm.video_goal.includes(obj)
                            ? editForm.video_goal.filter(o => o !== obj)
                            : [...editForm.video_goal, obj];
                          if (newObj.length > 0) setEditForm({ ...editForm, video_goal: newObj });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                          editForm.video_goal.includes(obj)
                            ? 'bg-red-600 border-red-600 text-white'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                        }`}
                      >
                        {(t.videos.objectives as any)[obj] || obj}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        checked={editForm.has_lead_magnet}
                        onChange={e => setEditForm({ ...editForm, has_lead_magnet: e.target.checked })}
                        className="peer appearance-none w-5 h-5 border border-zinc-800 rounded bg-zinc-950 checked:bg-red-600"
                      />
                      <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 group-hover:text-zinc-200">
                      Video uses lead magnets
                    </span>
                  </label>

                  {editForm.has_lead_magnet && (
                    <div className="space-y-2 p-4 bg-zinc-950/50 border border-zinc-800 rounded-2xl overflow-hidden">
                      <label className="label-caps !text-zinc-600">Select Active Lead Magnets</label>
                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        {availableCampaignLeadMagnets.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              const newSelected = editForm.selected_lead_magnet_ids.includes(m.id)
                                ? editForm.selected_lead_magnet_ids.filter(id => id !== m.id)
                                : [...editForm.selected_lead_magnet_ids, m.id];
                              setEditForm({ ...editForm, selected_lead_magnet_ids: newSelected });
                            }}
                            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                              editForm.selected_lead_magnet_ids.includes(m.id)
                                ? 'bg-zinc-900 border-red-600/50 text-white'
                                : 'bg-zinc-950 border-zinc-900 text-zinc-500 hover:border-zinc-800'
                            }`}
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wide truncate">{m.lead_magnet_name}</span>
                            {editForm.selected_lead_magnet_ids.includes(m.id) && <Check size={14} className="text-red-500" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-6">
                  <button 
                    onClick={() => setShowEdit(false)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-400 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleUpdate}
                    disabled={saving}
                    className="flex-1 bg-white text-zinc-950 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Save Changes</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
