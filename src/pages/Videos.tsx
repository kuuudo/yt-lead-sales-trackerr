import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../lib/hooks';
import { supabase, Video, Campaign, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Youtube, Plus, Link2, Copy, Check, ExternalLink, Calendar, Target, AlertCircle, Loader2, BarChart3, ChevronDown, X, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';
import { createRedirectLink } from '../lib/redirects';

type VideoStatus = Video['status'];

interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

function MultiSelectDropdown({ label, options, selected, onChange, placeholder }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-4 flex items-center justify-between gap-2 text-[10px] font-black uppercase text-zinc-400 outline-none focus:border-red-600 transition-all cursor-pointer min-w-[160px] max-w-[200px]"
      >
        <span className="truncate">
          {selected.length === 0 
            ? label 
            : `${label} (${selected.length})`}
        </span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-50 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="max-h-60 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {options.length === 0 ? (
                <div className="p-3 text-[10px] text-zinc-500 uppercase font-bold text-center">No options available</div>
              ) : (
                options.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      const newSelected = selected.includes(opt.value)
                        ? selected.filter(v => v !== opt.value)
                        : [...selected, opt.value];
                      onChange(newSelected);
                    }}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-left transition-all ${
                      selected.includes(opt.value)
                        ? 'bg-red-600/10 text-red-500'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                      selected.includes(opt.value)
                        ? 'bg-red-600 border-red-600'
                        : 'border-zinc-700 bg-zinc-950'
                    }`}>
                      {selected.includes(opt.value) && <Check size={10} className="text-white" />}
                    </div>
                    <span className="flex-1 truncate">{opt.label}</span>
                  </button>
                ))
              )}
            </div>
            {selected.length > 0 && (
              <div className="p-2 border-t border-zinc-800 bg-zinc-950/50">
                <button
                  onClick={() => onChange([])}
                  className="w-full py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-red-500 transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Videos() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [videos, setVideos] = useState<Video[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allLeadMagnets, setAllLeadMagnets] = useState<LeadMagnet[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  // Filter State
  const [filters, setFilters] = useState({
    search: '',
    goals: [] as string[],
    leadMagnets: [] as string[],
    dateRange: 'all',
    sortBy: 'newest'
  });

  const [formData, setFormData] = useState({
    url: '',
    campaign_id: '',
    objectives: ['sales'] as Video['video_goal'],
    hasLeadMagnet: false,
    selectedLeadMagnets: [] as string[]
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

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info') => {
    setModalConfig({ isOpen: true, title, message, variant, onConfirm: undefined });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({ isOpen: true, title, message, variant: 'danger', onConfirm });
  };

  const [availableLeadMagnets, setAvailableLeadMagnets] = useState<LeadMagnet[]>([]);
  const [loadingMagnets, setLoadingMagnets] = useState(false);
  const [generated, setGenerated] = useState<{ link: string, video: Partial<Video>, campaign?: Campaign } | null>(null);

  useEffect(() => {
    if (formData.campaign_id) {
      fetchLeadMagnets(formData.campaign_id);
    } else {
      setAvailableLeadMagnets([]);
    }
  }, [formData.campaign_id]);

  const fetchLeadMagnets = async (campaignId: string) => {
    setLoadingMagnets(true);
    try {
      const { data, error } = await supabase
        .from('lead_magnets')
        .select('*')
        .eq('campaign_id', campaignId);
      
      if (error) throw error;
      setAvailableLeadMagnets(data || []);
      // Reset selected magnets if they don't belong to the new campaign
      setFormData(prev => ({ 
        ...prev, 
        selectedLeadMagnets: prev.selectedLeadMagnets.filter(id => data?.some(m => m.id === id))
      }));
    } catch (err) {
      console.error('Error fetching lead magnets:', err);
    } finally {
      setLoadingMagnets(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('Fetching data for user:', user?.id);
      
      const { data: vData, error: vError } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      console.log('Supabase Videos Response:', { data: vData, error: vError });
      
      const { data: cData, error: cError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user?.id);

      if (vError) throw vError;
      if (cError) throw cError;

      if (vData) setVideos(vData);
      if (cData) {
        setCampaigns(cData);
        if (cData.length > 0) {
          setFormData(prev => ({ ...prev, campaign_id: prev.campaign_id || cData[0].id }));
          
          // Fetch all lead magnets for all user campaigns
          const campaignIds = cData.map(c => c.id);
          const { data: lmData, error: lmError } = await supabase
            .from('lead_magnets')
            .select('*')
            .in('campaign_id', campaignIds);
          
          if (lmError) console.error('Error fetching all lead magnets:', lmError);
          if (lmData) setAllLeadMagnets(lmData);
        }
      }
    } catch (err: any) {
      console.error('Error fetching video data:', err);
    } finally {
      setLoading(false);
    }
  };

  const [fetchingInfo, setFetchingInfo] = useState(false);

  const getYTInfo = async (url: string) => {
    const vidId = url.match(/(?:\/|v=)([0-9A-Za-z_-]{11})/)?.[1];
    if (!vidId) return null;
    
    try {
      // Use YouTube oEmbed API to get real title and high-res thumbnail
      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vidId}&format=json`);
      if (response.ok) {
        const data = await response.json();
        return {
          youtube_video_id: vidId,
          thumbnail_url: data.thumbnail_url || `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
          video_title: data.title || ('YouTube Video ID: ' + vidId)
        };
      }
    } catch (err) {
      console.error('Error fetching YouTube oEmbed:', err);
    }

    // Fallback if oEmbed fails
    return {
      youtube_video_id: vidId,
      thumbnail_url: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
      video_title: 'YouTube Video ID: ' + vidId
    };
  };

  const handleGenerate = async () => {
    if (!formData.url) return showAlert('Information Needed', 'Please enter a YouTube URL to continue.', 'info');
    
    setFetchingInfo(true);
    const info = await getYTInfo(formData.url);
    setFetchingInfo(false);

    if (!info) return showAlert('Invalid URL', 'The YouTube URL provided is not valid. Please check and try again.', 'danger');

    const campaign = campaigns.find(c => c.id === formData.campaign_id);
    if (!campaign) return showAlert('Campaign Selection', 'Please select a campaign first.', 'info');

    setGenerated({
      link: '[saved-after-clicking-save]',
      video: {
        ...info,
        campaign_id: formData.campaign_id,
        video_goal: formData.objectives,
        selected_lead_magnet_ids: formData.hasLeadMagnet ? formData.selectedLeadMagnets : null,
        status: 'no_data'
      },
      campaign,
    });
  };

  const handleSave = async () => {
    if (!generated || !user) return;
    setSaving(true);
    try {
      const payload = {
        ...generated.video,
        user_id: user.id
      };
      
      let error;
      let data;
      
      if (editingVideoId) {
        const { data: updateData, error: updateError } = await supabase
          .from('videos')
          .update(payload)
          .eq('id', editingVideoId)
          .select();
        error = updateError;
        data = updateData;
      } else {
        const { data: insertData, error: insertError } = await supabase
          .from('videos')
          .insert([payload])
          .select();
        error = insertError;
        data = insertData;
      }

      if (error) {
        console.error('Supabase Video Save Error:', error);
        throw new Error(error.message);
      }
      
      if (data) {
        const savedVideo = data[0];
        const campaign = generated.campaign;
        const appBaseUrl = window.location.origin;

        if (campaign) {
          const redirectJobs: Array<[string, string]> = [
            ['landing_page', campaign.landing_page_url],
          ];
          if (campaign.checkout_url) redirectJobs.push(['checkout', campaign.checkout_url]);
          if (campaign.purchase_thankyou_url) redirectJobs.push(['purchase_thankyou', campaign.purchase_thankyou_url]);
          if (campaign.newsletter_url) redirectJobs.push(['newsletter', campaign.newsletter_url]);
          if (campaign.newsletter_thankyou_url) redirectJobs.push(['newsletter_thankyou', campaign.newsletter_thankyou_url]);
          if (campaign.sales_call_booking_url) redirectJobs.push(['sales_call', campaign.sales_call_booking_url]);
          if (campaign.sales_call_thankyou_url) redirectJobs.push(['sales_call_thankyou', campaign.sales_call_thankyou_url]);
          if (campaign.consultation_booking_url) redirectJobs.push(['consultation', campaign.consultation_booking_url]);
          if (campaign.consultation_thankyou_url) redirectJobs.push(['consultation_thankyou', campaign.consultation_thankyou_url]);

          await Promise.all(
            redirectJobs.map(([type, url]) =>
              createRedirectLink(savedVideo.id, savedVideo.campaign_id, type as any, url, appBaseUrl)
            )
          );
        }

        const { data: linkData } = await supabase
          .from('redirect_links')
          .select('token')
          .eq('video_id', savedVideo.id)
          .eq('link_type', 'landing_page')
          .single();

        const finalLink = linkData ? `${appBaseUrl}/${linkData.token}` : null;

        if (editingVideoId) {
          setVideos(videos.map(v => v.id === editingVideoId ? savedVideo : v));
        } else {
          setVideos([savedVideo, ...videos]);
        }
        setShowAdd(false);
        setEditingVideoId(null);
        setFormData({ 
          url: '', 
          campaign_id: campaigns[0]?.id || '', 
          objectives: ['sales'],
          hasLeadMagnet: false,
          selectedLeadMagnets: []
        });

        if (finalLink) {
          showAlert(
            '🎉 Video Saved!',
            `Your tracking link is ready — copy it and paste into your YouTube description:\n\n${finalLink}`,
            'success'
          );
        }
      }
    } catch (err: any) {
      showAlert('Save Error', err.message || 'An unexpected error occurred while saving.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: VideoStatus) => {
    switch (status) {
      case 'active': return 'text-green-500 bg-green-500/10';
      case 'error': return 'text-red-500 bg-red-500/10';
      case 'installed': return 'text-blue-500 bg-blue-500/10';
      case 'missing': return 'text-orange-500 bg-orange-500/10';
      default: return 'text-zinc-500 bg-zinc-500/10';
    }
  };

  const getObjectiveLabel = (obj: 'newsletter' | 'calls' | 'consult' | 'sales' | 'viral') => {
    return (t.videos.objectives as any)[obj] || obj;
  };

  const filteredVideos = React.useMemo(() => {
    let result = [...videos];

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(v => v.video_title.toLowerCase().includes(search));
    }

    // Goal filter
    if (filters.goals.length > 0) {
      result = result.filter(v => v.video_goal.some(g => filters.goals.includes(g)));
    }

    // Lead Magnet filter
    if (filters.leadMagnets.length > 0) {
      result = result.filter(v => {
        if (!v.selected_lead_magnet_ids) return false;
        return v.selected_lead_magnet_ids.some(id => filters.leadMagnets.includes(id));
      });
    }

    // Date filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const ranges: Record<string, number> = {
        last7: 7,
        last30: 30,
        last3m: 90,
        last6m: 180,
        last12m: 365
      };

      if (ranges[filters.dateRange]) {
        const threshold = new Date(now.setDate(now.getDate() - ranges[filters.dateRange]));
        result = result.filter(v => new Date(v.created_at) >= threshold);
      }
    }

    // Sort
    result.sort((a, b) => {
      if (filters.sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (filters.sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (filters.sortBy === 'recentPublished' && a.published_at && b.published_at) {
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      }
      return 0;
    });

    return result;
  }, [videos, filters]);

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Youtube className="text-red-600" size={28} /> {t.videos.title}
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">Manage your tracked content</p>
        </div>
        <button 
          onClick={() => {
            if (showAdd) {
              setEditingVideoId(null);
              setGenerated(null);
              setFormData({ 
                url: '', 
                campaign_id: campaigns[0]?.id || '', 
                objectives: ['sales'],
                hasLeadMagnet: false,
                selectedLeadMagnets: []
              });
            }
            setShowAdd(!showAdd);
          }} 
          className="flex items-center gap-2 bg-white hover:bg-zinc-200 text-zinc-950 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
        >
          {showAdd ? 'Cancel' : <><Plus size={16} /> {t.videos.add}</>}
        </button>
      </header>

      <AnimatePresence>
        {showAdd && (
          <motion.section 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.95 }}
            className="bento-card border-zinc-800"
          >
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-black text-white uppercase tracking-tight">{editingVideoId ? 'Edit Tracked Video' : 'Track New Video'}</h2>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-4">No campaigns created yet</p>
                <a href="/campaigns" className="text-red-500 text-[10px] uppercase font-bold underline">Create a campaign first</a>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-1">
                    <label className="label-caps">YouTube URL</label>
                    <input 
                      value={formData.url}
                      onChange={e => setFormData({ ...formData, url: e.target.value })}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-4 text-sm outline-none focus:border-red-600 transition-all font-mono text-zinc-400"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="label-caps">Campaign</label>
                      <select 
                        value={formData.campaign_id}
                        onChange={e => setFormData({ ...formData, campaign_id: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-[11px] font-bold uppercase outline-none focus:border-red-600 appearance-none"
                      >
                        <option value="">Select a campaign</option>
                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="label-caps">Goals / Objectives</label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(['sales', 'newsletter', 'calls', 'consult', 'viral'] as const).map(obj => (
                          <button
                            key={obj}
                            type="button"
                            onClick={() => {
                              const newObj = formData.objectives.includes(obj as any)
                                ? formData.objectives.filter(o => o !== (obj as any))
                                : [...formData.objectives, obj as any];
                              if (newObj.length > 0) setFormData({ ...formData, objectives: newObj });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                              formData.objectives.includes(obj as any)
                                ? 'bg-red-600 border-red-600 text-white shadow-[0_0_10px_rgba(220,38,38,0.3)]'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                            }`}
                          >
                            {getObjectiveLabel(obj as any)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2 border-t border-zinc-900">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input 
                          type="checkbox" 
                          checked={formData.hasLeadMagnet}
                          onChange={e => setFormData({ ...formData, hasLeadMagnet: e.target.checked })}
                          className="peer appearance-none w-5 h-5 border border-zinc-800 rounded bg-zinc-950 checked:bg-red-600 checked:border-red-600 transition-all cursor-pointer"
                        />
                        <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 group-hover:text-zinc-200 transition-colors">
                        {t.videos.hasLeadMagnet}
                      </span>
                    </label>

                    {formData.hasLeadMagnet && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2 p-4 bg-zinc-950/50 border border-zinc-900 rounded-2xl"
                      >
                        <label className="label-caps !text-zinc-600">{t.videos.selectLeadMagnets}</label>
                        {!formData.campaign_id ? (
                          <p className="text-[10px] text-zinc-600 italic">{t.videos.selectCampaignFirst}</p>
                        ) : loadingMagnets ? (
                          <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                            <Loader2 size={12} className="animate-spin" /> Loading...
                          </div>
                        ) : availableLeadMagnets.length === 0 ? (
                          <p className="text-[10px] text-zinc-600 italic">{t.videos.noLeadMagnetsFound}</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {availableLeadMagnets.map(m => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  const newSelected = formData.selectedLeadMagnets.includes(m.id)
                                    ? formData.selectedLeadMagnets.filter(id => id !== m.id)
                                    : [...formData.selectedLeadMagnets, m.id];
                                  setFormData({ ...formData, selectedLeadMagnets: newSelected });
                                }}
                                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                                  formData.selectedLeadMagnets.includes(m.id)
                                    ? 'bg-zinc-900 border-red-600/50 text-white'
                                    : 'bg-zinc-900/30 border-zinc-900 text-zinc-500 hover:border-zinc-800'
                                }`}
                              >
                                <span className="text-[10px] font-bold uppercase tracking-wide truncate max-w-[200px]">{m.lead_magnet_name}</span>
                                {formData.selectedLeadMagnets.includes(m.id) && <Check size={14} className="text-red-500" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                  <button 
                    onClick={handleGenerate}
                    disabled={fetchingInfo}
                    className="w-full bg-zinc-100 text-zinc-950 h-14 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl flex items-center justify-center gap-2"
                  >
                    {fetchingInfo ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Fetching Video Info...
                      </>
                    ) : (
                      'Generate Tracking Link'
                    )}
                  </button>
                </div>

                <div className="flex flex-col">
                  {generated ? (
                    <div className="flex-1 space-y-4">
                      <p className="label-caps !text-zinc-500">Preview & Save</p>
                      <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 flex gap-4 items-center">
                        <img src={generated.video.thumbnail_url} className="w-24 aspect-video rounded-lg object-cover" />
                        <div>
                          <p className="text-xs font-bold text-white line-clamp-2">{generated.video.video_title}</p>
                          <p className="text-[10px] text-zinc-600 mt-1 font-mono uppercase">{generated.video.youtube_video_id}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[9px] font-bold uppercase text-zinc-600 tracking-widest">Copy this URL to your description</p>
                        <div className="relative group">
                          <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 pr-12 font-mono text-[10px] text-blue-400 break-all leading-relaxed">
                            {generated.link}
                          </div>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(generated.link);
                              setCopied('generated');
                              setTimeout(() => setCopied(null), 2000);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                          >
                            {copied === 'generated' ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                          </button>
                        </div>
                      </div>
                      <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="mt-auto w-full bg-red-600 text-white h-12 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        {saving ? <Loader2 className="animate-spin" size={16} /> : (editingVideoId ? 'Update Video' : 'Save To My List')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 border-2 border-dashed border-zinc-900 rounded-3xl flex flex-col items-center justify-center text-center p-8 grayscale opacity-30">
                      <Link2 size={32} className="mb-4 text-zinc-600" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Generated link will appear here</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
      
      {/* Filter Bar */}
      <section className="bento-card bg-zinc-900/40 p-4 border-zinc-900/50 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <input 
            type="text"
            placeholder={t.filters.search}
            value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })}
            className="w-full h-11 bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 text-xs font-bold text-white outline-none focus:border-red-600 transition-all"
          />
          <BarChart3 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Goal Select */}
          <MultiSelectDropdown 
            label={t.filters.goal}
            options={(['sales', 'newsletter', 'calls', 'consult', 'viral'] as const).map(obj => ({
              value: obj,
              label: getObjectiveLabel(obj)
            }))}
            selected={filters.goals}
            onChange={values => setFilters({ ...filters, goals: values })}
          />

          {/* Lead Magnet Select */}
          <MultiSelectDropdown 
            label={t.filters.leadMagnet}
            options={allLeadMagnets.map(lm => ({
              value: lm.id,
              label: lm.lead_magnet_name
            }))}
            selected={filters.leadMagnets}
            onChange={values => setFilters({ ...filters, leadMagnets: values })}
          />

          {/* Date Range Select */}
          <select 
            value={filters.dateRange}
            onChange={e => setFilters({ ...filters, dateRange: e.target.value })}
            className="h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-[10px] font-black uppercase text-zinc-400 outline-none focus:border-red-600 transition-all appearance-none cursor-pointer min-w-[140px]"
          >
            <option value="all">{t.filters.ranges.all}</option>
            <option value="last7">{t.filters.ranges.last7}</option>
            <option value="last30">{t.filters.ranges.last30}</option>
            <option value="last3m">{t.filters.ranges.last3m}</option>
            <option value="last6m">{t.filters.ranges.last6m}</option>
            <option value="last12m">{t.filters.ranges.last12m}</option>
          </select>

          {/* Sort Select */}
          <select 
            value={filters.sortBy}
            onChange={e => setFilters({ ...filters, sortBy: e.target.value })}
            className="h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-[10px] font-black uppercase text-zinc-400 outline-none focus:border-red-600 transition-all appearance-none cursor-pointer min-w-[140px]"
          >
            <option value="newest">{t.filters.sorting.newest}</option>
            <option value="oldest">{t.filters.sorting.oldest}</option>
            <option value="recentPublished">{t.filters.sorting.recentPublished}</option>
          </select>

          {(filters.search || filters.goals.length > 0 || filters.leadMagnets.length > 0 || filters.dateRange !== 'all') && (
            <button 
              onClick={() => setFilters({ search: '', goals: [], leadMagnets: [], dateRange: 'all', sortBy: 'newest' })}
              className="h-11 w-11 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-600 hover:text-red-500 transition-all"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="bento-card h-24 animate-pulse" />)
        ) : filteredVideos.length === 0 ? (
          <div className="py-20 text-center border-2 border-dashed border-zinc-900 rounded-3xl">
             <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">{t.filters.noResults}</p>
          </div>
        ) : (
          filteredVideos.map((v, i) => (
            <motion.div 
              key={v.id} 
              initial={{ opacity: 0, x: -10 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ delay: i * 0.05 }}
              className="bento-card flex flex-col md:flex-row gap-6 items-start md:items-center p-4 hover:border-zinc-800 transition-all"
            >
               <Link to={`/videos/${v.id}`} className="relative group shrink-0">
                <img src={v.thumbnail_url} className="w-full md:w-40 aspect-video rounded-xl object-cover border border-zinc-900" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                  <BarChart3 size={20} className="text-white" />
                </div>
              </Link>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                   <Link to={`/videos/${v.id}`} className="text-sm font-bold text-white hover:text-red-500 transition-colors truncate">{v.video_title}</Link>
                   <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${getStatusColor(v.status)}`}>
                     {v.status.replace('_', ' ')}
                   </span>
                </div>
                  <div className="flex flex-wrap gap-4 items-center text-[10px] font-bold uppercase text-zinc-500">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-[120px]">
                    <Target size={12} className="text-red-500" /> Goals: 
                    <div className="flex gap-1">
                      {v.video_goal.map(goal => (
                        <span key={goal} className="text-zinc-300 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-[8px]">
                          {getObjectiveLabel(goal)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-zinc-600" /> Added: <span className="text-zinc-600">{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <button 
                  onClick={async () => {
                    const { data: linkData } = await supabase
                      .from('redirect_links')
                      .select('token')
                      .eq('video_id', v.id)
                      .eq('link_type', 'landing_page')
                      .single();

                    const link = linkData
                      ? `${window.location.origin}/${linkData.token}`
                      : (() => {
                          const campaign = campaigns.find(c => c.id === v.campaign_id);
                          if (!campaign) return '';
                          const slug = campaign.campaign_name.toLowerCase().replace(/\s+/g, '_');
                          return `${campaign.landing_page_url}${campaign.landing_page_url.includes('?') ? '&' : '?'}utm_source=youtube&utm_medium=video&utm_campaign=${encodeURIComponent(slug)}&utm_content=${v.youtube_video_id}`;
                        })();

                    if (link) {
                      navigator.clipboard.writeText(link);
                      setCopied(v.id);
                      setTimeout(() => setCopied(null), 2000);
                    }
                  }}
                  className="flex-1 md:flex-none h-10 px-4 rounded-xl border border-zinc-800 hover:bg-zinc-900 transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  {copied === v.id ? <><Check size={14} className="text-green-500" /> Copied</> : <><Link2 size={14} /> Link</>}
                </button>
                <button 
                  onClick={() => {
                    setFormData({
                      url: `https://youtube.com/watch?v=${v.youtube_video_id}`,
                      campaign_id: v.campaign_id,
                      objectives: v.video_goal,
                      hasLeadMagnet: !!(v.selected_lead_magnet_ids && v.selected_lead_magnet_ids.length > 0),
                      selectedLeadMagnets: v.selected_lead_magnet_ids || []
                    });
                    setEditingVideoId(v.id);
                    setShowAdd(true);
                  }}
                  className="h-10 px-4 rounded-xl border border-zinc-800 hover:bg-zinc-900 transition-all text-zinc-500 hover:text-white"
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    showConfirm(
                      'Confirm Deletion',
                      'Are you sure you want to delete this video? This cannot be undone.',
                      async () => {
                        setDeletingVideoId(v.id);
                        console.log(`[DEBUG] Initiating Supabase DELETE for video ID: ${v.id}`);
                        
                        try {
                          const response = await supabase.from('videos').delete().eq('id', v.id);
                          console.log('[DEBUG] Supabase full response:', response);
                          
                          const { error, count, status } = response;

                          if (error) {
                            console.error('[DEBUG] Supabase Delete Error:', error);
                            showAlert('Delete Failed', `Could not delete the video. Error: ${error.message}`, 'danger');
                          } else {
                            console.log('[DEBUG] Delete successful. Status:', status, 'Count:', count);
                            showAlert('Video Deleted', 'The video has been successfully removed from your list.', 'success');
                            setVideos(prev => prev.filter(vid => vid.id !== v.id));
                          }
                        } catch (err: any) {
                          console.error('[DEBUG] Catch Delete Error:', err);
                          showAlert('Unexpected Error', `An error occurred during deletion: ${err?.message || 'Unknown error'}`, 'danger');
                        } finally {
                          setDeletingVideoId(null);
                        }
                      }
                    );
                  }}
                  disabled={deletingVideoId === v.id}
                  className="h-10 px-4 rounded-xl border border-zinc-800 hover:bg-zinc-900 transition-all text-zinc-500 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete"
                >
                  {deletingVideoId === v.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>
            </motion.div>
          ))
        )}
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
