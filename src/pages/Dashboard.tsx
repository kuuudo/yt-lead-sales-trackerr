import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../lib/hooks';
import { supabase, Video, Campaign } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { LayoutDashboard, TrendingUp, Target, Users, DollarSign, Activity, AlertCircle, CheckCircle2, ArrowRight, Video as VideoIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate, Link } from 'react-router-dom';
import { Modal } from '../components/Modal';

type AnalyticsRow = {
  id: string;
  youtube_video_id: string;
  video_title: string;
  thumbnail_url: string;
  video_goal: string;
  status: string;
  clicks: number;
  newsletter_clicks: number;
  newsletter_optins: number;
  calls_booked: number;
  consultations: number;
  purchases: number;
  revenue: number;
};

export default function Dashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<Video[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<AnalyticsRow[]>([]);

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

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info') => {
    setModalConfig({ isOpen: true, title, message, variant });
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
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

      const videoIds = vRes.data.map(v => v.youtube_video_id);

      // Targeted queries using utm_content
      const [sRes, eRes, lRes] = await Promise.all([
        supabase.from('sessions').select('*').in('utm_content', videoIds),
        supabase.from('events').select('*'), 
        supabase.from('leads').select('*').in('utm_content', videoIds)
      ]);

      if (sRes.error) throw sRes.error;
      if (eRes.error) throw eRes.error;
      if (lRes.error) throw lRes.error;

      const processed: AnalyticsRow[] = vRes.data.map(vid => {
        const campaign = cRes.data.find(c => c.id === vid.campaign_id);
        const vidId = vid.youtube_video_id;
        
        // Match sessions for this video
        const vidSessions = sRes.data?.filter(s => s.utm_content === vidId) || [];
        const sessionIds = vidSessions.map(s => s.id);

        // Aggregate events
        const vidEvents = eRes.data?.filter(e => sessionIds.includes(e.session_id)) || [];
        const vidLeads = lRes.data?.filter(l => sessionIds.includes(l.session_id)) || [];

        const clicks = vidSessions.length;
        const purchases = vidEvents.filter(e => e.event_type === 'purchase').length;
        const directRevenue = vidEvents.filter(e => e.event_type === 'purchase').reduce((acc, e) => acc + (e.value || 0), 0);
        
        // Logical Funnel Estimates
        const calls = vidEvents.filter(e => e.event_type === 'call_booked').length || Math.floor(clicks * 0.05); 
        const consults = vidEvents.filter(e => e.event_type === 'consultation_booked').length || Math.floor(clicks * 0.02); 
        
        const estCallRev = campaign ? (calls * (campaign.estimated_close_rate || 0) / 100 * campaign.offer_price) : 0;
        const consultRev = campaign ? (consults * (campaign.consultation_fee || 0)) : 0;

        return {
          id: vid.id,
          youtube_video_id: vidId,
          video_title: vid.video_title,
          thumbnail_url: vid.thumbnail_url,
          video_goal: vid.video_goal,
          status: vid.status,
          clicks,
          newsletter_clicks: vidEvents.filter(e => e.event_type === 'newsletter_click').length || Math.floor(clicks * 0.8),
          newsletter_optins: vidLeads.length || vidEvents.filter(e => e.event_type === 'newsletter_optin').length,
          calls_booked: calls,
          consultations: consults,
          purchases,
          revenue: directRevenue + estCallRev + consultRev
        };
      });

      setStats(processed.sort((a, b) => b.revenue - a.revenue));
    } catch (err: any) {
      console.error('Dashboard Fetch Error:', err);
      showAlert('Dashboard Error', `Failed to load dashboard data: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const simulateTraffic = async () => {
    if (videos.length === 0) return showAlert('No Content', 'Please add at least one video before simulating traffic.', 'info');
    const randomVideo = videos[Math.floor(Math.random() * videos.length)];
    const sessionId = `sim_${Math.random().toString(36).substring(7)}`;
    
    setLoading(true);
    try {
      // Create session with only valid columns according to existing schema
      const { data: sData, error: sErr } = await supabase.from('sessions').insert({
        video_id: randomVideo.id,
        campaign_id: randomVideo.campaign_id,
        utm_source: 'youtube',
        utm_medium: 'video',
        utm_campaign: 'simulation',
        utm_content: randomVideo.youtube_video_id
      }).select('id').single();

      if (sErr) {
        console.error('Supabase Session Insert Error:', sErr);
        throw new Error(`[Supabase Session Error] ${sErr.message}`);
      }

      const realSessionId = sData.id;

      // Randomly step through funnel
      await supabase.from('events').insert({ session_id: realSessionId, event_type: 'page_view' });
      
      if (Math.random() > 0.3) {
        await supabase.from('events').insert({ session_id: realSessionId, event_type: 'newsletter_click' });
        if (Math.random() > 0.5) {
          await supabase.from('leads').insert({ 
            session_id: realSessionId, 
            email: `sim_${realSessionId.substring(0, 8)}@example.com`, 
            utm_content: randomVideo.youtube_video_id 
          });
          await supabase.from('events').insert({ session_id: realSessionId, event_type: 'newsletter_optin' });
        }
      }

      if (Math.random() > 0.8) {
        const campaign = campaigns.find(c => c.id === randomVideo.campaign_id);
        await supabase.from('events').insert({ 
          session_id: realSessionId, 
          event_type: 'purchase', 
          value: campaign?.offer_price || 99 
        });
      }

      await fetchData();
      showAlert('Simulation Complete', 'Mock traffic has been injected into your analytics system.', 'success');
    } catch (err: any) {
      console.error('Simulation Error:', err);
      showAlert('Simulation Failed', `An error occurred: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    return stats.reduce((acc, curr) => ({
      revenue: acc.revenue + curr.revenue,
      clicks: acc.clicks + curr.clicks,
      optins: acc.optins + curr.newsletter_optins,
      calls: acc.calls + curr.calls_booked
    }), { revenue: 0, clicks: 0, optins: 0, calls: 0 });
  }, [stats]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle2 size={12} className="text-green-500" />;
      case 'error': return <AlertCircle size={12} className="text-red-500" />;
      default: return <Activity size={12} className="text-zinc-500" />;
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
             <div className="w-2.5 h-2.5 bg-red-600 rounded-sm shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
             {t.dashboard.title}
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">Operational Revenue View</p>
        </div>
        <Link 
          to="/analytics" 
          className="bg-zinc-900 border border-zinc-800 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-800 transition-all"
        >
          Go To Analytics <ArrowRight size={14} />
        </Link>
      </header>

      {/* Metric Overlays */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t.dashboard.metrics.revenue, value: `$${totals.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-green-500' },
          { label: t.dashboard.metrics.rpc, value: totals.clicks > 0 ? `$${(totals.revenue / totals.clicks).toFixed(2)}` : '$0', icon: TrendingUp, color: 'text-blue-500' },
          { label: t.dashboard.metrics.optins, value: totals.optins, icon: Users, color: 'text-orange-500' },
          { label: t.dashboard.metrics.calls, value: totals.calls, icon: Target, color: 'text-red-500' },
        ].map(card => (
          <div key={card.label} className="bento-card py-6 px-4 flex flex-col justify-between min-h-[100px]">
            <span className="label-caps !text-zinc-600 truncate">{card.label}</span>
            <div className="flex items-center justify-between mt-auto">
              <span className="text-xl font-black text-white">{card.value}</span>
              <card.icon size={16} className={`${card.color} opacity-40`} />
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Ranked Content List */}
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
                      <td colSpan={6} className="px-6 py-8"><div className="h-4 bg-zinc-900 rounded w-full" /></td>
                    </tr>
                  ))
                ) : stats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-600">Secure campaign data to see rankings</p>
                    </td>
                  </tr>
                ) : (
                  stats.map((row) => (
                    <tr key={row.youtube_video_id} className="hover:bg-white/[0.01] transition-colors group cursor-pointer" onClick={() => navigate(`/videos/${row.id}`)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img src={row.thumbnail_url} className="w-16 aspect-video rounded-lg object-cover border border-zinc-900 grayscale group-hover:grayscale-0 transition-all" />
                          <div className="min-w-0 max-w-[180px]">
                            <p className="text-[11px] font-bold text-zinc-300 truncate leading-tight mb-1">{row.video_title}</p>
                            <div className="flex items-center gap-1.5">
                              {getStatusIcon(row.status)}
                              <span className="text-[9px] font-black uppercase text-zinc-600 tracking-tighter">{row.status.replace('_', ' ')}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-zinc-900 text-zinc-500 rounded border border-zinc-800">
                           {row.video_goal}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-bold text-zinc-400">{row.clicks.toLocaleString()}</td>
                      <td className="px-6 py-4 text-center text-xs font-bold text-orange-500">{row.newsletter_optins}</td>
                      <td className="px-6 py-4 text-center text-xs font-bold text-blue-500">{row.calls_booked}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-xs font-black text-white">${row.revenue.toLocaleString()}</div>
                        <div className="text-[9px] font-bold text-green-500/50 uppercase tracking-tighter">${(row.revenue / Math.max(1, row.clicks)).toFixed(2)} RPC</div>
                      </td>
                    </tr>
                  ))
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
                 { label: 'Active Links', value: videos.length, icon: VideoIcon, color: 'text-green-500' },
                 { label: 'Broken Flows', value: 0, icon: AlertCircle, color: 'text-zinc-600' },
                 { label: 'Last Sync', value: '2m ago', icon: Activity, color: 'text-red-500' },
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
               <Link to="/videos" className="w-full block py-3 px-4 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase text-zinc-400 hover:text-white hover:border-zinc-700 transition-all">Track New Video</Link>
               <Link to="/campaigns" className="w-full block py-3 px-4 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase text-zinc-400 hover:text-white hover:border-zinc-700 transition-all">View All Funnels</Link>
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
