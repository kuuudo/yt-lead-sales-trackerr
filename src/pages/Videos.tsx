import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../lib/hooks';
import { supabase, Video, Campaign, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Link } from 'react-router-dom';
import { Youtube, Plus, Link2, Copy, Check, ExternalLink, Calendar, Target, AlertCircle, Loader2, BarChart3, ChevronDown, X, Edit2, Trash2,
  Music2, Camera, Linkedin, Twitter, AtSign, LayoutGrid, List,
  // Phase 2.5 additions
  Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw,
} from 'lucide-react';
import {
  type Platform,
  PLATFORM_CONFIG,
  detectPlatform,
  getPlatformInfo
} from '../lib/platformParser';
import {
  PLATFORM_THUMBNAILS,
  resolveThumbnail,
  getPlatformIcon,
  parseSubreddit,
  resolveRedditTitle,
  parseXUsername,
  parseXPostId,
  formatXDisplayId,
  resolveXTitle,
  parseThreadsUsername,
  parseThreadsPostId,
  resolveThreadsTitle,
  parseTikTokUsername,
  parseTikTokVideoId,
  formatTikTokDisplayId,
  parseLinkedInAuthor,
  parseLinkedInPostId,
  formatLinkedInDisplayId,
  parseTwitchVideoId,
  parseTwitchChannel,
  formatTwitchDisplayId,
  resolveInstagramType,
  resolveFacebookType,
} from '../lib/videoFormatters';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';
import { createRedirectLink } from '../lib/redirects';
import { useOrganization } from '../lib/useOrganization'

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

// ---------------------------------------------------------------------------
// Phase 2.5 Types
// ---------------------------------------------------------------------------

type ImportStatus = 'idle' | 'uploading' | 'success' | 'error';

interface ImportResult {
  batchId: string;
  totalRows: number;
  insertedRaw: number;
  skippedDuplicates: number;
  matched: number;
  unmapped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Phase 2.5: CSV Import Panel Component
// Fully isolated — does not touch any existing Videos state
// ---------------------------------------------------------------------------

function YouTubeImportPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErrorMessage('Only .csv files are supported. Export from YouTube Studio → Analytics → Advanced Mode → Export.');
      setStatus('error');
      return;
    }
    setSelectedFile(file);
    setStatus('idle');
    setResult(null);
    setErrorMessage('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const handleUpload = async () => {
    if (!selectedFile || !user) return;

    setStatus('uploading');
    setResult(null);
    setErrorMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please refresh and try again.');
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/youtube/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? `Server error: ${response.status}`);
      }

      setResult(data as ImportResult);
      setStatus('success');
      setSelectedFile(null);

    } catch (err: any) {
      console.error('[YouTubeImportPanel] Upload failed:', err);
      setErrorMessage(err.message ?? 'Upload failed. Please try again.');
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setErrorMessage('');
    setSelectedFile(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-black uppercase tracking-tight text-sm flex items-center gap-2">
              <BarChart3 size={16} className="text-red-500" />
              Import YouTube Analytics
            </h2>
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold mt-1">
              YouTube Studio → Analytics → Advanced Mode → Export
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(status === 'success' || status === 'error') && (
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-[10px] font-bold uppercase tracking-widest transition-colors"
              >
                <RefreshCw size={12} />
                New Upload
              </button>
            )}
            {/* 👇 ADD THIS */}
            <Link
              to="/unmapped-videos"
              className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              View Unmapped
            </Link>

            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X size={18} />
            
           
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Result Panel */}
        <AnimatePresence>
          {status === 'success' && result && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-4"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                <span className="text-green-400 text-[11px] font-black uppercase tracking-widest">
                  Import Complete
                </span>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total Rows',    value: result.totalRows,         color: 'text-zinc-300' },
                  { label: 'Stored Raw',    value: result.insertedRaw,       color: 'text-blue-400' },
                  { label: 'Matched',       value: result.matched,           color: 'text-green-400' },
                  { label: 'Dedup Skipped', value: result.skippedDuplicates, color: 'text-zinc-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-zinc-900 rounded-xl p-3 text-center">
                    <p className={`text-lg font-black ${color}`}>{value}</p>
                    <p className="text-zinc-600 text-[9px] uppercase tracking-widest font-bold mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Unmapped CTA */}
              {result.unmapped > 0 && (
                <div className="flex items-center justify-between bg-amber-950/30 border border-amber-900/50 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                    <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest">
                      {result.unmapped} video{result.unmapped !== 1 ? 's' : ''} need mapping
                    </span>
                  </div>
                  <Link
                    to="/unmapped-videos"
                    className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    Resolve <ArrowRight size={12} />
                  </Link>
                </div>
              )}

              {/* Import errors (non-fatal) */}
              {result.errors.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
                    {result.errors.length} row-level error{result.errors.length !== 1 ? 's' : ''} (non-fatal)
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-[10px] text-red-400 font-mono bg-red-950/20 rounded px-2 py-1">
                        {e}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <p className="text-zinc-600 text-[9px] font-mono">
                Batch ID: {result.batchId}
              </p>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3 bg-red-950/30 border border-red-900/50 rounded-xl p-4"
            >
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 text-[11px] font-black uppercase tracking-widest mb-1">
                  Import Failed
                </p>
                <p className="text-red-300/70 text-[10px] font-mono">{errorMessage}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drop Zone — only shown when not in success/uploading state */}
        {status !== 'success' && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${isDragging
                ? 'border-red-500 bg-red-950/20'
                : selectedFile
                  ? 'border-blue-700 bg-blue-950/10'
                  : 'border-zinc-800 bg-zinc-950/30 hover:border-zinc-600 hover:bg-zinc-900/30'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInputChange}
            />

            {selectedFile ? (
              <div className="space-y-2">
                <FileText size={24} className="text-blue-400 mx-auto" />
                <p className="text-blue-300 text-sm font-black">{selectedFile.name}</p>
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  {(selectedFile.size / 1024).toFixed(1)} KB — Ready to upload
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload
                  size={24}
                  className={`mx-auto transition-colors ${isDragging ? 'text-red-500' : 'text-zinc-600'}`}
                />
                <p className="text-zinc-400 text-[11px] font-black uppercase tracking-widest">
                  {isDragging ? 'Drop CSV here' : 'Drag & drop CSV or click to browse'}
                </p>
                <p className="text-zinc-600 text-[10px] font-bold">
                  YouTube Studio export (.csv only)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Upload Button */}
        {selectedFile && status !== 'uploading' && status !== 'success' && (
          <button
            onClick={handleUpload}
            className="w-full h-11 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
          >
            <Upload size={14} />
            Upload & Import
          </button>
        )}

        {/* Uploading state */}
        {status === 'uploading' && (
          <div className="flex items-center justify-center gap-3 py-4">
            <Loader2 size={18} className="text-red-500 animate-spin" />
            <span className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">
              Processing CSV…
            </span>
          </div>
        )}

        {/* How-to hint */}
        {status === 'idle' && !selectedFile && (
          <p className="text-zinc-700 text-[9px] font-bold uppercase tracking-widest text-center">
            YouTube Studio → Analytics → Advanced Mode → Export current view (.csv)
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// End Phase 2.5
// ---------------------------------------------------------------------------

export default function Videos() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [videos, setVideos] = useState<Video[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allLeadMagnets, setAllLeadMagnets] = useState<LeadMagnet[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedLinks, setSavedLinks] = useState<
    { token: string; link_type: string; label: string; lead_magnet_id?: string }[]
  >([]);
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    return (localStorage.getItem('videos_view_mode') as 'card' | 'list') ?? 'card';
  });

  useEffect(() => {
    localStorage.setItem('videos_view_mode', viewMode);
  }, [viewMode]);


  const [filters, setFilters] = useState({
    search: '',
    platform: 'all' as 'all' | Platform,
    goals: [] as string[],
    leadMagnets: [] as string[],
    dateRange: 'all',
    sortBy: 'newest'
  });

  const [formData, setFormData] = useState({
    url: '',
    platform: 'youtube' as Platform,
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
    if (user && organizationId) {
      fetchData();
    }
  }, [user, organizationId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('Fetching data for user:', user?.id);
      
      const { data: vData, error: vError } = await supabase
        .from('videos')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      console.log('Supabase Videos Response:', { data: vData, error: vError });
      
      const { data: cData, error: cError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', organizationId);

      if (vError) throw vError;
      if (cError) throw cError;

      if (vData) setVideos(vData);
      if (cData) {
        setCampaigns(cData);
        if (cData.length > 0) {
          setFormData(prev => ({ ...prev, campaign_id: prev.campaign_id || cData[0].id }));
          
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

    return {
      youtube_video_id: vidId,
      thumbnail_url: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
      video_title: 'YouTube Video ID: ' + vidId
    };
  };

  const handleGenerate = async () => {
    if (!formData.url) return showAlert('Information Needed', 'Please enter a content URL.', 'info');

    const detected = detectPlatform(formData.url);
    const platform = detected || formData.platform;

    setFetchingInfo(true);
    const info = await getPlatformInfo(formData.url, platform);
    setFetchingInfo(false);

    if (!info)
      return showAlert(
        'Invalid URL',
        `Could not parse this ${PLATFORM_CONFIG[platform].label} URL. Please check and try again.`,
        'danger'
      );

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
        user_id: user.id,
        organization_id: organizationId,
        // platform, platform_url, platform_post_id come from generated.video (via getPlatformInfo)
        // DO NOT override them here — that was causing all non-YouTube entries to save as 'youtube'
      };
      let error, data;

      if (editingVideoId) {
        const { data: updateData, error: updateError } = await supabase
          .from('videos').update(payload).eq('id', editingVideoId).select();
        error = updateError; data = updateData;
      } else {
        const { data: insertData, error: insertError } = await supabase
          .from('videos').insert([payload]).select();
        error = insertError; data = insertData;
      }

      if (error) throw new Error(error.message);

      if (data) {
        const savedVideo = data[0];
        const campaign = generated.campaign;
        const appBaseUrl = window.location.origin;

        if (campaign) {
          const redirectJobs: Array<[string, string, string]> = [
            ['landing_page', campaign.landing_page_url, '🏠 Landing Page'],
          ];
          if (campaign.newsletter_url) redirectJobs.push(['newsletter', campaign.newsletter_url, '📧 Newsletter']);
          if (campaign.sales_call_booking_url) redirectJobs.push(['sales_call', campaign.sales_call_booking_url, '📞 Sales Call']);
          if (campaign.consultation_booking_url) redirectJobs.push(['consultation', campaign.consultation_booking_url, '💼 Consultation']);
          // checkout link intentionally omitted — owned by campaign via Installation.tsx (video_id = null)
          if (campaign.purchase_thankyou_url) redirectJobs.push(['purchase_thankyou', campaign.purchase_thankyou_url, '✅ Purchase Thank You']);
          if (campaign.newsletter_thankyou_url) redirectJobs.push(['newsletter_thankyou', campaign.newsletter_thankyou_url, '✅ Newsletter Thank You']);

          await Promise.all(
            redirectJobs.map(([type, url]) =>
              createRedirectLink(savedVideo.id, savedVideo.campaign_id, type as any, url, appBaseUrl)
            )
          );

          if (generated.video.selected_lead_magnet_ids && generated.video.selected_lead_magnet_ids.length > 0) {
            const { data: lmData } = await supabase
              .from('lead_magnets')
              .select('*')
              .in('id', generated.video.selected_lead_magnet_ids);

            if (lmData) {
              await Promise.all(
                lmData.map((lm: any) =>
                  createRedirectLink(savedVideo.id, savedVideo.campaign_id, 'lead_magnet' as any, lm.lead_magnet_url, appBaseUrl, lm.id)
                )
              );
            }
          }

          if (editingVideoId && campaign) {
            const urlUpdates: Array<[string, string]> = [
              ['landing_page', campaign.landing_page_url],
            ];
            // checkout url update intentionally omitted — owned by campaign via Installation.tsx
            if (campaign.newsletter_url) urlUpdates.push(['newsletter', campaign.newsletter_url]);
            if (campaign.purchase_thankyou_url) urlUpdates.push(['purchase_thankyou', campaign.purchase_thankyou_url]);
            if (campaign.newsletter_thankyou_url) urlUpdates.push(['newsletter_thankyou', campaign.newsletter_thankyou_url]);
            if (campaign.sales_call_booking_url) urlUpdates.push(['sales_call', campaign.sales_call_booking_url]);
            if (campaign.consultation_booking_url) urlUpdates.push(['consultation', campaign.consultation_booking_url]);

            await Promise.all(
              urlUpdates.map(([type, url]) =>
                supabase
                  .from('redirect_links')
                  .update({ destination_url: url })
                  .eq('video_id', editingVideoId)
                  .eq('link_type', type)
              )
            );
          }

          const { data: allLinks } = await supabase
            .from('redirect_links')
            .select('token, link_type, destination_url, lead_magnet_id')
            .eq('video_id', savedVideo.id);

          let lmNames: Record<string, string> = {};
          if (generated.video.selected_lead_magnet_ids && generated.video.selected_lead_magnet_ids.length > 0) {
            const { data: lmData } = await supabase
              .from('lead_magnets')
              .select('id, lead_magnet_name')
              .in('id', generated.video.selected_lead_magnet_ids);
            if (lmData) lmData.forEach((lm: any) => { lmNames[lm.id] = lm.lead_magnet_name; });
          }

          if (allLinks) {
            setSavedLinks(allLinks.map((l: any) => ({
              ...l,
              label: getLinkLabel(l.link_type, lmNames, l.lead_magnet_id)
            })));
            setShowLinksModal(true);
          }
        }

        if (editingVideoId) {
          setVideos(videos.map(v => v.id === editingVideoId ? savedVideo : v));
        } else {
          setVideos([savedVideo, ...videos]);
        }
        setShowAdd(false);
        setEditingVideoId(null);
        setFormData({
          url: '',
          platform: 'youtube' as Platform,
          campaign_id: campaigns[0]?.id || '',
          objectives: ['sales'],
          hasLeadMagnet: false,
          selectedLeadMagnets: []
        });
      }
    } catch (err: any) {
      showAlert('Save Error', err.message || 'An unexpected error occurred.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const getLinkLabel = (linkType: string, lmNames: Record<string, string> = {}, leadMagnetId?: string) => {
    if (linkType === 'lead_magnet' && leadMagnetId && lmNames[leadMagnetId]) {
      return `📦 ${lmNames[leadMagnetId]}`;
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
    return labels[linkType] || linkType;
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

    if (filters.platform !== 'all') {
      result = result.filter(v => v.platform === filters.platform);
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(v => v.video_title.toLowerCase().includes(search));
    }

    if (filters.goals.length > 0) {
      result = result.filter(v => v.video_goal.some(g => filters.goals.includes(g)));
    }

    if (filters.leadMagnets.length > 0) {
      result = result.filter(v => {
        if (!v.selected_lead_magnet_ids) return false;
        return v.selected_lead_magnet_ids.some(id => filters.leadMagnets.includes(id));
      });
    }

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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportWizard(true)}
            className="flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            <Upload size={14} />
            Import YouTube Analytics
          </button>
          <button 
            onClick={() => {
              if (showAdd) {
                setEditingVideoId(null);
                setGenerated(null);
                setFormData({
                  url: '',
                  platform: 'youtube' as Platform,
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
        </div>
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
              <h2 className="text-xl font-black text-white uppercase tracking-tight">
                {editingVideoId ? 'Edit Tracked Video' : 'Track New Content'}
              </h2>
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
                    {/* Platform Selector */}
                    <div className="space-y-2">
                      <label className="label-caps">Platform</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(Object.keys(PLATFORM_CONFIG) as Platform[]).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() =>
                              setFormData(prev => ({ ...prev, platform: p, url: '' }))
                            }
                            className={`h-10 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                              formData.platform === p
                                ? 'border-red-600 bg-red-600/10 text-red-400'
                                : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-600'
                            }`}
                          >
                            {PLATFORM_CONFIG[p].label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* URL Input */}
                    <div className="space-y-1">
                      <label className="label-caps">
                        {PLATFORM_CONFIG[formData.platform].label} URL
                      </label>
                      <input
                        type="url"
                        value={formData.url}
                        onChange={e => {
                          const url = e.target.value;
                          const detected = detectPlatform(url);
                          setFormData(prev => ({
                            ...prev,
                            url,
                            platform: detected || prev.platform
                          }));
                        }}
                        placeholder={PLATFORM_CONFIG[formData.platform].placeholder}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm outline-none focus:border-red-600 transition-all font-mono text-zinc-400"
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

      {/* Platform Tabs */}
      {(() => {
        const presentPlatforms = Array.from(new Set(videos.map(v => v.platform).filter(Boolean))) as Platform[];
        const tabs: Array<'all' | Platform> = ['all', ...presentPlatforms];
        if (tabs.length <= 1) return null; // no tabs if only one platform
        return (
          <div className="flex flex-wrap gap-2">
            {tabs.map(p => {
              const isAll = p === 'all';
              const count = isAll ? videos.length : videos.filter(v => v.platform === p).length;
              const label = isAll ? 'All' : PLATFORM_CONFIG[p]?.label ?? p;
              const color = isAll ? null : PLATFORM_CONFIG[p]?.color;
              const active = filters.platform === p;
              return (
                <button
                  key={p}
                  onClick={() => setFilters(f => ({ ...f, platform: p }))}
                  className={`h-9 px-3.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                    active
                      ? 'border-transparent text-white'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                  }`}
                  style={active ? { backgroundColor: isAll ? '#dc2626' : color ?? '#dc2626', borderColor: 'transparent' } : {}}
                >
                  {!isAll && <span className="opacity-70">{PLATFORM_CONFIG[p]?.icon}</span>}
                  {label}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${active ? 'bg-black/20 text-white' : 'bg-zinc-900 text-zinc-600'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })()}

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
          <MultiSelectDropdown 
            label={t.filters.goal}
            options={(['sales', 'newsletter', 'calls', 'consult', 'viral'] as const).map(obj => ({
              value: obj,
              label: getObjectiveLabel(obj)
            }))}
            selected={filters.goals}
            onChange={values => setFilters({ ...filters, goals: values })}
          />

          <MultiSelectDropdown 
            label={t.filters.leadMagnet}
            options={allLeadMagnets.map(lm => ({
              value: lm.id,
              label: lm.lead_magnet_name
            }))}
            selected={filters.leadMagnets}
            onChange={values => setFilters({ ...filters, leadMagnets: values })}
          />

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

          <select 
            value={filters.sortBy}
            onChange={e => setFilters({ ...filters, sortBy: e.target.value })}
            className="h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-[10px] font-black uppercase text-zinc-400 outline-none focus:border-red-600 transition-all appearance-none cursor-pointer min-w-[140px]"
          >
            <option value="newest">{t.filters.sorting.newest}</option>
            <option value="oldest">{t.filters.sorting.oldest}</option>
            <option value="recentPublished">{t.filters.sorting.recentPublished}</option>
          </select>

          {(filters.search || filters.platform !== 'all' || filters.goals.length > 0 || filters.leadMagnets.length > 0 || filters.dateRange !== 'all') && (
            <button 
              onClick={() => setFilters({ search: '', platform: 'all', goals: [], leadMagnets: [], dateRange: 'all', sortBy: 'newest' })}
              className="h-11 w-11 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-600 hover:text-red-500 transition-all"
            >
              <X size={16} />
            </button>
          )}

          {/* View Mode Toggle */}
          <div className="flex h-11 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('card')}
              title="Card View"
              className={`w-11 flex items-center justify-center transition-all ${
                viewMode === 'card'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-600 hover:text-zinc-300'
              }`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List View"
              className={`w-11 flex items-center justify-center transition-all ${
                viewMode === 'list'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-600 hover:text-zinc-300'
              }`}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && (
        <div className="rounded-2xl overflow-hidden border border-zinc-900">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-zinc-900/60 border-b border-zinc-900" />
            ))
          ) : filteredVideos.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">{t.filters.noResults}</p>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="grid items-center bg-zinc-950 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900"
                style={{ gridTemplateColumns: '12rem 1fr 8rem 14rem 8rem' }}>
                <span>Platform</span>
                <span>Title</span>
                <span>Goal</span>
                <span>Campaign</span>
                <span>Added</span>
              </div>
              {filteredVideos.map((v, i) => {
                const isReddit = v.platform === 'reddit';
                const isX = v.platform === 'x';
                const isThreads = v.platform === 'threads';
                const isTikTok = v.platform === 'tiktok';
                const isInstagram = v.platform === 'instagram';
                const isFacebook = v.platform === 'facebook';
                const subreddit = isReddit ? parseSubreddit(v.platform_url) : null;
                const redditTitle = isReddit ? resolveRedditTitle(v.platform_url) : null;
                const xUsername = isX ? parseXUsername(v.platform_url) : null;
                const xPostId = isX ? parseXPostId(v.platform_url) : null;
                const xDisplayId = isX ? formatXDisplayId(xPostId) : null;
                const threadsUsername = isThreads ? parseThreadsUsername(v.platform_url) : null;
                const threadsPostId = isThreads ? parseThreadsPostId(v.platform_url) : null;
                const xTitle = isX ? resolveXTitle(v.video_title) : null;
                const threadsTitle = isThreads ? resolveThreadsTitle(v.video_title) : null;
                const tikTokUsername = isTikTok ? parseTikTokUsername(v.platform_url) : null;
                const tikTokVideoId = isTikTok ? parseTikTokVideoId(v.platform_url) : null;
                const tikTokDisplayId = isTikTok ? formatTikTokDisplayId(tikTokVideoId) : null;
                const isLinkedIn = v.platform === 'linkedin';
                const linkedInAuthor = isLinkedIn ? parseLinkedInAuthor(v.platform_url) : null;
                const linkedInPostId = isLinkedIn ? parseLinkedInPostId(v.platform_url) : null;
                const linkedInDisplayId = isLinkedIn ? formatLinkedInDisplayId(linkedInPostId) : null;
                const instagramType = isInstagram ? resolveInstagramType(v.platform_url) : null;
                const instagramDisplayId = isInstagram ? (v.platform_post_id?.slice(0, 8) ?? null) : null;
                const facebookType = isFacebook ? resolveFacebookType(v.platform_url) : null;
                const isTwitch = v.platform === 'twitch';
                const twitchVideoId = isTwitch ? parseTwitchVideoId(v.platform_url) : null;
                const twitchChannel = isTwitch ? parseTwitchChannel(v.platform_url) : null;
                const twitchDisplayId = isTwitch ? formatTwitchDisplayId(twitchVideoId) : null;
                const campaign = campaigns.find(c => c.id === v.campaign_id);

                const accountLabel = isReddit
                  ? (subreddit ? `r/${subreddit}` : 'Reddit')
                  : isX
                  ? (xUsername ? `@${xUsername}` : 'X')
                  : isThreads
                  ? (threadsUsername ? `@${threadsUsername}` : 'Threads')
                  : v.video_title; // YouTube: channel name not stored, show title in account col

                const titleLabel = isReddit
                  ? (redditTitle ?? v.video_title)
                  : isX
                  ? (xTitle ?? 'X Post')
                  : isThreads
                  ? (threadsTitle ?? 'Threads Post')
                  : v.video_title;

                const platformLabel = (v.platform ?? 'unknown').toUpperCase();
                const thumb = resolveThumbnail(v);

                return (
                  <motion.div
                    key={v.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className={`grid items-center px-6 py-4 border-b border-zinc-900 hover:bg-zinc-900/50 transition-colors group ${i % 2 === 0 ? 'bg-zinc-950/40' : 'bg-transparent'}`}
                    style={{ gridTemplateColumns: '12rem 1fr 8rem 14rem 8rem' }}
                  >
                    {/* Platform */}
                    <div className="min-w-0 pr-4">
                      {isReddit || isX || isThreads || isTikTok || isLinkedIn || isInstagram || isFacebook || isTwitch ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black truncate" style={{ color: 'rgba(255, 69, 0, 0.85)' }}>
                            {isReddit
                              ? (subreddit ? `r/${subreddit}` : 'Reddit')
                              : isX
                              ? (xUsername ? `@${xUsername}` : 'X')
                              : isThreads
                              ? (threadsUsername ? `@${threadsUsername}` : 'Threads')
                              : isLinkedIn
                              ? (linkedInAuthor ? `@${linkedInAuthor}` : 'LinkedIn')
                              : isInstagram
                              ? (instagramDisplayId ?? 'Instagram')
                              : isFacebook
                              ? (v.platform_post_id?.slice(0, 6) ?? 'Facebook')
                              : isTwitch
                              ? (twitchVideoId ? twitchDisplayId! : (twitchChannel ? `@${twitchChannel}` : 'Twitch'))
                              : (tikTokUsername ? `@${tikTokUsername}` : 'TikTok')}
                          </span>
                          <span className="shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-500">
                            {isReddit ? 'Reddit' : isX ? 'X' : isThreads ? 'Threads' : isLinkedIn ? 'LinkedIn' : isInstagram ? 'Instagram' : isFacebook ? 'Facebook' : isTwitch ? 'Twitch' : 'TikTok'}
                          </span>
                        </div>
                      ) : (
                        <>
                          
                          <div className="text-xs font-black text-zinc-300 leading-none"style={{ color: 'rgba(255, 69, 0, 0.85)' }}>
  {v.youtube_video_id?.slice(0, 8) ?? '—'}
  <span className="text-[10px] uppercase tracking-widest text-zinc-500 ml-2">
    {platformLabel}
  </span>
</div>
                        </>
                      )}
                    </div>

                    {/* Title */}
                    <Link to={`/videos/${v.id}`} className="min-w-0 pr-4">
                      <span className="text-sm font-bold hover:text-red-400 transition-colors truncate block">
                        {isReddit && subreddit
                          ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>{`r/${subreddit}`}</span><span className="text-zinc-600 mx-1">•</span><span className="text-zinc-200">{redditTitle ?? v.video_title}</span></>
                          : isX
                          ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>X Post</span><span className="text-zinc-600 mx-1">•</span><span className="text-zinc-200">{xUsername ? `${xUsername}/status/${xDisplayId}` : 'X'}</span></>
                          : isThreads
                          ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>Threads</span><span className="text-zinc-600 mx-1">•</span><span className="text-zinc-200">{threadsPostId ?? 'Post'}</span></>
                          : isTikTok
                          ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>TikTok</span><span className="text-zinc-600 mx-1">•</span><span className="text-zinc-200">{tikTokDisplayId ?? 'Video'}</span></>
                          : isLinkedIn
                          ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>LinkedIn</span><span className="text-zinc-600 mx-1">•</span><span className="text-zinc-200">{linkedInDisplayId ?? '—'}</span></>
                          : isInstagram
                          ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>Instagram {instagramType}</span><span className="text-zinc-600 mx-1">•</span><span className="text-zinc-200">{instagramDisplayId ?? '—'}</span></>
                          : isFacebook
                          ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>Facebook {facebookType}</span><span className="text-zinc-600 mx-1">•</span><span className="text-zinc-200">{v.platform_post_id?.slice(0, 6) ?? '—'}</span></>
                          : isTwitch
                          ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>Twitch</span><span className="text-zinc-600 mx-1">•</span><span className="text-zinc-200">{twitchVideoId ? twitchDisplayId! : (twitchChannel ?? '—')}</span></>
                          : <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>Youtube</span><span className="text-zinc-600 mx-1">•</span><span className="text-zinc-200">{v.video_title}</span></>
                        }
                      </span>
                    </Link>

                    {/* Goals */}
                    <div className="flex flex-wrap gap-1 pr-2">
                      {v.video_goal.slice(0, 2).map(goal => (
                        <span key={goal} className="text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-[9px] font-bold uppercase whitespace-nowrap">
                          {getObjectiveLabel(goal)}
                        </span>
                      ))}
                      {v.video_goal.length > 2 && (
                        <span className="text-zinc-600 text-[9px] font-bold">+{v.video_goal.length - 2}</span>
                      )}
                    </div>

                    {/* Campaign */}
                    <div className="min-w-0 pr-4">
                      <span className="text-xs font-bold text-zinc-500 truncate block">
                        {campaign?.campaign_name ?? '—'}
                      </span>
                    </div>

                    {/* Date */}
                    <span className="text-xs font-bold text-zinc-600 whitespace-nowrap">
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </motion.div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── CARD VIEW (existing, unchanged) ── */}
      {viewMode === 'card' && (
      <div
        className="grid grid-cols-1 gap-4 rounded-2xl transition-all"
        style={
          filters.platform === 'reddit'
            ? { background: 'radial-gradient(ellipse at top, rgba(255, 69, 0, 0.06) 0%, transparent 70%)' }
            : filters.platform === 'x'
            ? { background: 'radial-gradient(ellipse at top, rgba(255, 69, 0, 0.06) 0%, transparent 70%)' }
            : filters.platform === 'threads'
            ? { background: 'radial-gradient(ellipse at top, rgba(255, 69, 0, 0.06) 0%, transparent 70%)' }
            : undefined
        }
      >
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="bento-card h-24 animate-pulse" />)
        ) : filteredVideos.length === 0 ? (
          <div className="py-20 text-center border-2 border-dashed border-zinc-900 rounded-3xl">
            <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">{t.filters.noResults}</p>
          </div>
        ) : (
          filteredVideos.map((v, i) => {
            const isReddit = v.platform === 'reddit';
            const isX = v.platform === 'x';
            const isThreads = v.platform === 'threads';
            const isTikTok = v.platform === 'tiktok';
            const isInstagram = v.platform === 'instagram';
            const isFacebook = v.platform === 'facebook';
            const subreddit = isReddit ? parseSubreddit(v.platform_url) : null;
            const redditTitle = isReddit ? resolveRedditTitle(v.platform_url) : null;
            const xUsername = isX ? parseXUsername(v.platform_url) : null;
            const xPostId = isX ? parseXPostId(v.platform_url) : null;
            const xDisplayId = isX ? formatXDisplayId(xPostId) : null;
            const xTitle = isX ? resolveXTitle(v.video_title) : null;
            const threadsUsername = isThreads ? parseThreadsUsername(v.platform_url) : null;
            const threadsPostId = isThreads ? parseThreadsPostId(v.platform_url) : null;
            const threadsTitle = isThreads ? resolveThreadsTitle(v.video_title) : null;
            const tikTokUsername = isTikTok ? parseTikTokUsername(v.platform_url) : null;
            const tikTokVideoId = isTikTok ? parseTikTokVideoId(v.platform_url) : null;
            const tikTokDisplayId = isTikTok ? formatTikTokDisplayId(tikTokVideoId) : null;
            const isLinkedIn = v.platform === 'linkedin';
            const linkedInAuthor = isLinkedIn ? parseLinkedInAuthor(v.platform_url) : null;
            const linkedInPostId = isLinkedIn ? parseLinkedInPostId(v.platform_url) : null;
            const linkedInDisplayId = isLinkedIn ? formatLinkedInDisplayId(linkedInPostId) : null;
            const instagramType = isInstagram ? resolveInstagramType(v.platform_url) : null;
            const instagramDisplayId = isInstagram ? (v.platform_post_id?.slice(0, 8) ?? null) : null;
            const facebookType = isFacebook ? resolveFacebookType(v.platform_url) : null;
            const isTwitch = v.platform === 'twitch';
            const twitchVideoId = isTwitch ? parseTwitchVideoId(v.platform_url) : null;
            const twitchChannel = isTwitch ? parseTwitchChannel(v.platform_url) : null;
            const twitchDisplayId = isTwitch ? formatTwitchDisplayId(twitchVideoId) : null;

            const cardBorderStyle = isReddit || isX || isThreads || isTikTok || isLinkedIn || isInstagram || isFacebook || isTwitch
              ? { borderColor: 'rgba(255, 69, 0, 0.15)' }
              : undefined;

            return (
            <motion.div 
              key={v.id} 
              initial={{ opacity: 0, x: -10 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ delay: i * 0.05 }}
              className="bento-card flex flex-col md:flex-row gap-6 items-start md:items-center p-4 hover:border-zinc-800 transition-all"
              style={cardBorderStyle}
            >
              {isReddit || isX || isThreads || isTikTok || isLinkedIn || isInstagram || isFacebook || isTwitch ? (
                <Link to={`/videos/${v.id}`} className="relative group shrink-0">
                  <div className="relative shrink-0">
                    <img
                      src={resolveThumbnail(v)}
                      className="w-full md:w-40 aspect-video rounded-xl object-cover border border-zinc-900"
                    />
                    <span className="absolute -top-1 -right-1 text-[8px] font-black bg-zinc-800 border border-zinc-700 rounded px-1">
                      {(v.platform ?? 'unknown').toUpperCase()}
                    </span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                    <BarChart3 size={20} className="text-white" />
                  </div>
                </Link>
              ) : (
                <Link to={`/videos/${v.id}`} className="relative group shrink-0">
                  <div className="relative shrink-0">
                    <img
                      src={v.thumbnail_url}
                      className="w-full md:w-40 aspect-video rounded-xl object-cover border border-zinc-900"
                    />
                    <span className="absolute -top-1 -right-1 text-[8px] font-black bg-zinc-800 border border-zinc-700 rounded px-1">
                      {(v.platform ?? 'unknown').toUpperCase()}
                    </span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                    <BarChart3 size={20} className="text-white" />
                  </div>
                </Link>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <Link to={`/videos/${v.id}`} className="text-sm font-bold text-white hover:text-red-500 transition-colors truncate">
                    {isReddit && subreddit
                      ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>{`r/${subreddit}`}</span><span className="text-zinc-600 mx-1">•</span>{redditTitle ?? v.video_title}</>
                      : isX
                      ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>X Post</span><span className="text-zinc-600 mx-1">•</span><span>{xUsername ? `${xUsername}/status/${xDisplayId}` : 'X'}</span></>
                      : isThreads
                      ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>Threads</span><span className="text-zinc-600 mx-1">•</span><span>{threadsPostId ?? 'Post'}</span></>
                      : isTikTok
                      ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>TikTok</span><span className="text-zinc-600 mx-1">•</span><span>{tikTokDisplayId ?? 'Video'}</span></>
                      : isLinkedIn
                      ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>LinkedIn</span><span className="text-zinc-600 mx-1">•</span><span>{linkedInDisplayId ?? '—'}</span></>
                      : isInstagram
                      ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>Instagram {instagramType}</span><span className="text-zinc-600 mx-1">•</span><span>{instagramDisplayId ?? '—'}</span></>
                      : isFacebook
                      ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>Facebook {facebookType}</span><span className="text-zinc-600 mx-1">•</span><span>{v.platform_post_id?.slice(0, 8) ?? '—'}</span></>
                      : isTwitch
                      ? <><span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>Twitch</span><span className="text-zinc-600 mx-1">•</span><span>{twitchVideoId ? twitchDisplayId! : (twitchChannel ?? '—')}</span></>
                      : <>
                          <span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>YouTube</span><span className="text-zinc-600 mx-1">•</span><span>{v.video_title}</span>
                          
                        </>
                    }
                  </Link>
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
                      url: v.platform_url || `https://youtube.com/watch?v=${v.youtube_video_id}`,
                      campaign_id: v.campaign_id,
                      objectives: v.video_goal,
                      platform: (v.platform as Platform) || 'youtube',
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
          );})
        )}
      </div>
      )} {/* end card view */}

      {/* Links Modal */}
      {showLinksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-black uppercase tracking-tight text-lg">
                🎉 Video Saved!
              </h3>
              <button
                onClick={() => setShowLinksModal(false)}
                className="text-zinc-500 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">
              Copy these links and paste into your YouTube description — other links, go to Video Info to see the rest
            </p>

            <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {(() => {
                const PRIORITY_ORDER = ['landing_page', 'newsletter', 'consultation', 'sales_call', 'lead_magnet'];
                const priorityLinks = PRIORITY_ORDER.flatMap(type =>
                  savedLinks.filter(l => l.link_type === type)
                );
                return priorityLinks.map((l) => (
                  <div
                    key={l.token}
                    className="flex items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase text-zinc-400 mb-1">
                        {l.label}
                      </p>
                      <p className="font-mono text-[11px] text-blue-400 truncate">
                        {window.location.origin}/{l.token}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/${l.token}`);
                        setCopiedLink(l.token);
                        setTimeout(() => setCopiedLink(null), 2000);
                      }}
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-all"
                    >
                      {copiedLink === l.token ? (
                        <Check size={14} className="text-green-500" />
                      ) : (
                        <Copy size={14} className="text-zinc-400" />
                      )}
                    </button>
                  </div>
                ));
              })()}
            </div>

            <button
              onClick={() => setShowLinksModal(false)}
              className="w-full h-10 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Done
            </button>
          </motion.div>
        </div>
      )}

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
        onConfirm={modalConfig.onConfirm}
      />

      {/* Phase 2.5: YouTube Analytics Import Overlay */}
      {showImportWizard && (
        <YouTubeImportPanel onClose={() => setShowImportWizard(false)} />
      )}
    </div>
  );
}
