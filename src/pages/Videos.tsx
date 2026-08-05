import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../lib/hooks';
import { supabase, Video, Campaign, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { PromotedAssetCategory } from '../services/redirect/getPromotedAssetDisplay';
import {
  CATEGORY_LABEL,
  getRedirectLinksDisplay,
  getVideoPromotionBadges,
  buildTrackingLinkUrl,
  type RedirectLinksDisplayGroups,
  type VideoPromotionBadgeMap,
} from '../services/redirect/getPromotedAssetDisplay';
import { Youtube, Plus, Link2, Copy, Check, ExternalLink, Calendar, Target, AlertCircle, Loader2, BarChart3, ChevronDown, X, Edit2, Archive, ArchiveRestore,
  Music2, Camera, Linkedin, Twitter, AtSign, LayoutGrid, List,
  // Phase 2.5 additions
  Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw,
  HelpCircle, BookmarkPlus, Info,
} from 'lucide-react';
import { addToLibrary } from '../services/asset/addToLibrary';
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
import { useOrganization } from '../lib/useOrganization';
import { useOrganization } from '../lib/useOrganization';
import { videosPageCache } from '../lib/videosPageCache';
import { createVideo } from '../services/video/createVideo';
import { generateAssetRedirectLinks } from '../services/asset/generateAssetRedirectLinks';
import { PromotedAssetPicker, type PromotedAssetRow } from '../components/PromotedAssetPicker';
import { listVerifiedBrandedDomains, type VerifiedDomainOption } from '../services/domain/brandedDomains';
import {
  resolvePromotionContextForAsset,
  toPromotionContext,
  type PromotionContextOption,
} from '../services/asset/resolvePromotionContextForAsset';

import type { PromotionContext } from '../services/asset/resolvePromotionContextForAsset';
import { listAssignmentTrackingDomains } from '../services/assignment/getAssignmentDetail';
import { categorizeAsset } from '../services/redirect/getPromotedAssetDisplay';
import { resolveAssetType } from '../services/asset/resolveAssetType';
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest 
             bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 
             rounded-lg text-zinc-300 hover:text-white transition-all active:scale-[0.97]"
            
            >
              View Unmapped
            </Link>

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
  <div className="flex flex-col items-center justify-center gap-3 py-6">
    <Loader2
      size={22}
      className="text-red-500 animate-spin"
    />

    <span className="text-zinc-300 text-[11px] font-black uppercase tracking-widest">
      Processing your YouTube Analytics...
    </span>

    <p className="text-zinc-500 text-[10px] text-center max-w-xs leading-relaxed">
      Uploading your CSV, validating data, matching videos, and importing analytics.
      <br />
      Large exports may take up to a minute. Please keep this window open.
    </p>
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
  const [promotionBadges, setPromotionBadges] =
  useState<VideoPromotionBadgeMap>(new Map());
  // Asset Library status per row (keyed by asset_id) — powers the "+ Asset"
  // action badge that replaces the NO DATA status badge when the video's
  // asset hasn't been added to the library yet. See handleAddToLibraryInList.
  const [libraryStatus, setLibraryStatus] = useState<Map<string, boolean>>(new Map());
  const [addingLibraryId, setAddingLibraryId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allLeadMagnets, setAllLeadMagnets] = useState<LeadMagnet[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);

  // Promoted Asset (optional) — UI-only per locked scope: this selection is
  // never sent to createVideo() and nothing is persisted from it yet.
  // Wiring it into a real video -> asset relationship is separate, later work.
  const [promotionContextByAssetId, setPromotionContextByAssetId] =
  useState<Map<string, PromotionContextOption[]>>(new Map());
const [chosenPromotionByAssetId, setChosenPromotionByAssetId] =
  useState<Map<string, PromotionContext>>(new Map());
const [resolvingPromotionContext, setResolvingPromotionContext] = useState(false);
const hasBlockingPromotionIssue = Array.from(promotionContextByAssetId.entries()).some(
    ([assetId, options]) =>
      options.length === 0 || (options.length > 1 && !chosenPromotionByAssetId.has(assetId))
  );
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [promotedAssets, setPromotedAssets] = useState<PromotedAssetRow[]>([]);
  const [verifiedDomains, setVerifiedDomains] = useState<VerifiedDomainOption[]>([]);
  const [selectedTrackingDomainId, setSelectedTrackingDomainId] = useState<string | null>(null);
  // Shared Domains, cached by assignmentId (not assetId) — multiple
  // promoted assets can resolve to the same Assignment, so this avoids
  // calling listAssignmentTrackingDomains() more than once per Assignment.
  const [sharedDomainsByAssignmentId, setSharedDomainsByAssignmentId] =
    useState<Map<string, VerifiedDomainOption[]>>(new Map());
  // The actual per-asset choice — this is what ends up on
  // SelectedPromotedAsset.trackingDomainId at generate time. Either a
  // "Your Domains" id or a "Shared Domains" id; the field doesn't care
  // which source it came from.
  const [selectedAssetDomainByAssetId, setSelectedAssetDomainByAssetId] =
    useState<Map<string, string | null>>(new Map());
  // Auto-open import modal when navigated here with ?openImport=true
  // (e.g. from VideoDetail "Import Analytics" button)
  useEffect(() => {
    if (!organizationId) return;
    listVerifiedBrandedDomains(organizationId).then(setVerifiedDomains);
  }, [organizationId]);
// Resolves the assignmentId for each promoted asset that currently has
  // one (same derivation the generate handler already does — see
  // handleGenerate's assetsWithContext), then fetches Shared Domains for
  // any newly-seen assignmentId, deduped by the cache above.
  useEffect(() => {
    const assignmentIdsToFetch = new Set<string>();

    for (const asset of promotedAssets) {
      const options = promotionContextByAssetId.get(asset.asset_id);
      if (!options) continue;

      const ctx =
        options.length === 1
          ? toPromotionContext(options[0])
          : chosenPromotionByAssetId.get(asset.asset_id);

      if (!ctx) continue;
      if (!sharedDomainsByAssignmentId.has(ctx.assignmentId)) {
        assignmentIdsToFetch.add(ctx.assignmentId);
      }
    }

    if (assignmentIdsToFetch.size === 0) return;

    Promise.all(
      Array.from(assignmentIdsToFetch).map(id =>
        listAssignmentTrackingDomains(id).then(domains => [id, domains] as const)
      )
    ).then(entries => {
      setSharedDomainsByAssignmentId(prev => {
        const next = new Map(prev);
        for (const [id, domains] of entries) next.set(id, domains);
        return next;
      });
    });
  }, [promotedAssets, promotionContextByAssetId, chosenPromotionByAssetId, sharedDomainsByAssignmentId]);

  // Small helper — resolves which assignmentId (if any) currently applies
  // to a given promoted asset. Same logic as the effect above and the
  // generate handler; pulled out so the render block below doesn't
  // duplicate it a third time.
  function resolvedAssignmentIdForAsset(assetId: string): string | null {
    const options = promotionContextByAssetId.get(assetId);
    if (!options) return null;
    const ctx =
      options.length === 1
        ? toPromotionContext(options[0])
        : chosenPromotionByAssetId.get(assetId);
    return ctx?.assignmentId ?? null;
  }
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('openImport') === 'true') {
      setShowImportWizard(true);
      // Clean the param so back-navigation doesn't re-trigger
      setSearchParams(prev => { prev.delete('openImport'); return prev; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedDisplayGroups, setSavedDisplayGroups] = useState<RedirectLinksDisplayGroups>({ campaignLinks: [], assets: [] });
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [archivingVideoId, setArchivingVideoId] = useState<string | null>(null);

  // Archived videos modal state
  const [showArchivedVideos, setShowArchivedVideos] = useState(false);
  const [archivedVideos, setArchivedVideos] = useState<Video[]>([]);
  const [archivedVideosLoading, setArchivedVideosLoading] = useState(false);
  const [selectedArchivedVideoIds, setSelectedArchivedVideoIds] = useState<string[]>([]);
  const [restoringVideos, setRestoringVideos] = useState(false);

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

  const showConfirm = (title: string, message: string, onConfirm: () => void, variant: 'info' | 'danger' | 'success' = 'danger') => {
    setModalConfig({ isOpen: true, title, message, variant, onConfirm });
  };

  const [availableLeadMagnets, setAvailableLeadMagnets] = useState<LeadMagnet[]>([]);
  const [loadingMagnets, setLoadingMagnets] = useState(false);
  const [generated, setGenerated] = useState<{ link: string, video: Partial<Video>, campaign?: Campaign } | null>(null);

  // "ONLY PROMOTE ASSET" — existing System Campaign, one per organization,
  // already seeded in the DB (see product decision doc). We resolve it from
  // the `campaigns` array that's already fetched for the Campaign dropdown —
  // no extra query. Assets imported directly (no natural campaign) attach to
  // this campaign purely so they retain a campaign_id for attribution.
  const onlyPromoteAssetCampaign = campaigns.find(c => c.campaign_name === 'ONLY PROMOTE ASSET');
  const [useOnlyPromoteAsset, setUseOnlyPromoteAsset] = useState(false);
  // Remembers the manually-selected campaign so unchecking restores it
  // instead of clearing the field.
  const [previousCampaignId, setPreviousCampaignId] = useState('');

  const handleToggleOnlyPromoteAsset = (checked: boolean) => {
    if (checked) {
      if (!onlyPromoteAssetCampaign) {
        showAlert(
          'Campaign Not Found',
          'The "ONLY PROMOTE ASSET" campaign has not been set up for this organization yet. Please contact support.',
          'info'
        );
        return;
      }
      setPreviousCampaignId(formData.campaign_id);
      setUseOnlyPromoteAsset(true);
      setFormData(prev => ({ ...prev, campaign_id: onlyPromoteAssetCampaign.id }));
    } else {
      setUseOnlyPromoteAsset(false);
      setFormData(prev => ({ ...prev, campaign_id: previousCampaignId || campaigns[0]?.id || '' }));
    }
  };

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
      const cached = videosPageCache.get(organizationId);
      if (cached) {
        console.log('[Videos] Cache hit', new Date(cached.cachedAt).toLocaleTimeString());
        setVideos(cached.data.videos);
        setCampaigns(cached.data.campaigns);
        setAllLeadMagnets(cached.data.allLeadMagnets);
        setLoading(false);
        if (cached.data.campaigns.length > 0) {
          setFormData(prev => ({ ...prev, campaign_id: prev.campaign_id || cached.data.campaigns[0].id }));
        }
        return;
      }
      console.log('[Videos] Cache miss — fetching from Supabase');
      fetchData();
    }
  }, [user?.id, organizationId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('Fetching data for user:', user?.id);
      
      const { data: vData, error: vError } = await supabase
        .from('videos')
        .select('*')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      console.log('Supabase Videos Response:', { data: vData, error: vError });
      
      const { data: cData, error: cError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', organizationId);

      if (vError) throw vError;
      if (cError) throw cError;

      if (vData) {
  setVideos(vData);

  if (organizationId && user && vData.length > 0) {
    getVideoPromotionBadges({
      videoIds: vData.map(v => v.id),
      viewerOrganizationId: organizationId,
      viewerUserId: user.id,
    })
      .then(setPromotionBadges)
      .catch((err: any) =>
        console.error('[Videos] getVideoPromotionBadges failed:', err)
      );

    // NEW: batch-load Asset Library status for the "no data" badge swap
    const assetIds = [...new Set(vData.map(v => v.asset_id).filter(Boolean))];
    if (assetIds.length > 0) {
      supabase.from('assets').select('id, added_to_library_at').in('id', assetIds)
        .then(({ data }) => {
          if (data) setLibraryStatus(new Map(data.map(a => [a.id, !!a.added_to_library_at])));
        });
    }
  }
}
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
          if (organizationId) {
            videosPageCache.set(organizationId, { videos: vData || [], campaigns: cData, allLeadMagnets: lmData || [] });
            console.log('[Videos] Cache updated');
          }
        } else if (organizationId) {
          videosPageCache.set(organizationId, { videos: vData || [], campaigns: cData, allLeadMagnets: [] });
          console.log('[Videos] Cache updated');
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

      // ── Edit path: kept inline until updateVideo() is extracted ──────────
      if (editingVideoId) {
        const payload = {
          ...generated.video,
          user_id: user.id,
          organization_id: organizationId,
          // platform, platform_url, platform_post_id come from generated.video (via getPlatformInfo)
          // DO NOT override them here — that was causing all non-YouTube entries to save as 'youtube'
        };
        const { data: updateData, error: updateError } = await supabase
          .from('videos').update(payload).eq('id', editingVideoId).select();
        if (updateError) throw new Error(updateError.message);

        const savedVideo = updateData?.[0];
        if (savedVideo && generated.campaign) {
          const campaign = generated.campaign;
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

          if (organizationId && user) {
            const groups = await getRedirectLinksDisplay({
              videoId: savedVideo.id,
              viewerOrganizationId: organizationId,
              viewerUserId: user.id,
            });
            setSavedDisplayGroups(groups);
            setShowLinksModal(true);
          }
          setVideos(videos.map(v => v.id === editingVideoId ? savedVideo : v));
        }

      // ── Create path: delegated to createVideo() service ─────────────────
      } else {
        const { savedVideo } = await createVideo({
          payload: {
            platform:                 generated.video.platform!,
            platform_url:             generated.video.platform_url!,
            platform_post_id:         generated.video.platform_post_id ?? null,
            youtube_video_id:         generated.video.youtube_video_id ?? null,
            video_title:              generated.video.video_title!,
            thumbnail_url:            generated.video.thumbnail_url ?? null,
            campaign_id:              generated.video.campaign_id!,
            video_goal:               generated.video.video_goal ?? [],
            selected_lead_magnet_ids: generated.video.selected_lead_magnet_ids ?? null,
            status:                   'no_data',
          },
          campaign:       generated.campaign,
          organizationId: organizationId!,
          userId:         user.id,
          trackingDomainId: selectedTrackingDomainId,
        });
          // ── Sibling pipeline: Asset Redirect generation ──────────────────
          // Runs AFTER createVideo() succeeds, entirely independent of it.
          // Asset-driven (each asset's own campaign), not video-campaign-driven.
          // Promotion/Assignment are not involved. See generateAssetRedirectLinks.ts.
          
  if (promotedAssets.length > 0) {
  const assetsWithContext = promotedAssets.map(asset => {
    const options = promotionContextByAssetId.get(asset.asset_id);
    const promotionContext: PromotionContext | undefined = !options
      ? undefined
      : options.length === 1
        ? toPromotionContext(options[0])
        : chosenPromotionByAssetId.get(asset.asset_id);

    return {
      asset_id: asset.asset_id,
      promotionContext,
      trackingDomainId: selectedAssetDomainByAssetId.get(asset.asset_id) ?? null,
    };
  });
console.log(
  "DEBUG assetsWithContext",
  assetsWithContext
);
  await generateAssetRedirectLinks({
    videoId: savedVideo.id,
    selectedAssets: assetsWithContext,
  });
}


        // UI: query links back and show the links modal (UI concern — stays here)
        if (generated.campaign) {
          if (organizationId && user) {
            const groups = await getRedirectLinksDisplay({
              videoId: savedVideo.id,
              viewerOrganizationId: organizationId,
              viewerUserId: user.id,
            });
            setSavedDisplayGroups(groups);
            setShowLinksModal(true);
          }
        }

        setVideos([savedVideo, ...videos]);
      }

      // Common cleanup
      setShowAdd(false);
      setEditingVideoId(null);
      setFormData({
        url: '',
        platform: 'youtube' as Platform,
        campaign_id: campaigns[0]?.id || '',
        objectives: ['sales'],
        hasLeadMagnet: false,
        selectedLeadMagnets: [],
      });
      setPromotedAssets(null);
      setPromotionContextByAssetId(new Map());
      setChosenPromotionByAssetId(new Map());
      setSelectedAssetDomainByAssetId(new Map());
      setSelectedTrackingDomainId(null);
      setUseOnlyPromoteAsset(false);
      setPreviousCampaignId('');

    } catch (err: any) {
      showAlert('Save Error', err.message || 'An unexpected error occurred.', 'danger');
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

  // Mirrors VideoDetail.tsx's handleAddToLibrary, scoped to a single row
  // in the list so multiple rows can each track their own loading state.
  const handleAddToLibraryInList = async (v: Video, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!v.asset_id) return;
    setAddingLibraryId(v.id);
    try {
      await addToLibrary(v.asset_id);
      setLibraryStatus(prev => new Map(prev).set(v.asset_id!, true));
    } catch (err: any) {
      showAlert('Error', err.message || 'Could not add to library.', 'danger');
    } finally {
      setAddingLibraryId(null);
    }
  };

  const getObjectiveLabel = (obj: 'newsletter' | 'calls' | 'consult' | 'sales' | 'viral') => {
    return (t.videos.objectives as any)[obj] || obj;
  };

  // Archive is only ever triggered by an explicit user click on the Archive
  // button below — there is no automatic/time-based archiving anywhere.
  // This is fully independent of deleted_at / deleteVideo(), which remain
  // untouched internal system logic.
  const handleArchiveVideo = (v: Video) => {
    showConfirm(
      'Archive Video?',
      'Archived videos will be hidden from your active content library. You can restore them anytime.',
      async () => {
        setArchivingVideoId(v.id);
        try {
          const { error } = await supabase
            .from('videos')
            .update({ archived_at: new Date().toISOString() })
            .eq('id', v.id);
          if (error) throw error;
          setVideos(prev => prev.filter(vid => vid.id !== v.id));
        } catch (err: any) {
          showAlert('Archive Failed', err.message || 'Could not archive the video.', 'danger');
        } finally {
          setArchivingVideoId(null);
        }
      },
      'info'
    );
  };

  const fetchArchivedVideos = async () => {
    if (!organizationId) return;
    setArchivedVideosLoading(true);
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });
      if (error) throw error;
      setArchivedVideos(data || []);
    } catch (err: any) {
      showAlert('Fetch Error', `Failed to fetch archived videos: ${err.message}`, 'danger');
    } finally {
      setArchivedVideosLoading(false);
    }
  };

  const openArchivedVideosModal = () => {
    setSelectedArchivedVideoIds([]);
    setShowArchivedVideos(true);
    fetchArchivedVideos();
  };

  const toggleArchivedVideoSelection = (id: string) => {
    setSelectedArchivedVideoIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleRestoreSelectedVideos = async () => {
    if (selectedArchivedVideoIds.length === 0) return;
    setRestoringVideos(true);
    try {
      const { error } = await supabase
        .from('videos')
        .update({ archived_at: null })
        .in('id', selectedArchivedVideoIds);
      if (error) throw error;
      setArchivedVideos(prev => prev.filter(v => !selectedArchivedVideoIds.includes(v.id)));
      setSelectedArchivedVideoIds([]);
      fetchData();
    } catch (err: any) {
      showAlert('Restore Failed', err.message, 'danger');
    } finally {
      setRestoringVideos(false);
    }
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
                setPromotedAssets(null);
                setUseOnlyPromoteAsset(false);
                setPreviousCampaignId('');
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
                          disabled={useOnlyPromoteAsset}
                          className={`w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-[11px] font-bold uppercase outline-none focus:border-red-600 appearance-none ${
                            useOnlyPromoteAsset ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
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

                    {/* Promoted Asset (Optional) — UI only, per locked scope.
                        Not sent to createVideo(), not persisted. Same
                        "needs a Campaign first" gating pattern as Lead
                        Magnet above — NOTE: this gate is a UX consistency
                        choice, not a data dependency (Option B: Asset is
                        Library-scoped, not Campaign-scoped, so nothing
                        here actually reads campaign_id). */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <label className="label-caps">Tracking Type</label>
                        <div className="relative group/tip">
                          <HelpCircle size={13} className="text-zinc-600 hover:text-zinc-400 cursor-help transition-colors" />
                          <div className="hidden group-hover/tip:block absolute left-0 top-5 z-20 w-64 p-3 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
                            <p className="text-[10px] leading-relaxed text-zinc-400 normal-case font-medium">
                              Use asset only when you just want to track traffic and performance for this asset, with no campaign goals like newsletter signups, sales calls, landing pages, or conversions. If you want to promote both campaigns and assets together, keep asset + campaign objective.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label
                          className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-all ${
                            !useOnlyPromoteAsset
                              ? 'border-red-600 bg-red-600/10'
                              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
                          }`}
                        >
                          <input
                            type="radio"
                            name="trackingType"
                            checked={!useOnlyPromoteAsset}
                            onChange={() => handleToggleOnlyPromoteAsset(false)}
                            className="w-3.5 h-3.5 accent-red-600 cursor-pointer"
                          />
                          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-300">
                            Asset + Campaign Objective
                          </span>
                        </label>
                        <label
                          className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-all ${
                            useOnlyPromoteAsset
                              ? 'border-red-600 bg-red-600/10'
                              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
                          }`}
                        >
                          <input
                            type="radio"
                            name="trackingType"
                            checked={useOnlyPromoteAsset}
                            onChange={() => handleToggleOnlyPromoteAsset(true)}
                            className="w-3.5 h-3.5 accent-red-600 cursor-pointer"
                          />
                          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-300">
                            Asset Only
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="label-caps">
                        Promoted Asset <span className="normal-case text-zinc-600">(optional)</span>
                      </label>
                      {!formData.campaign_id ? (
                        <p className="text-[10px] text-zinc-600 italic">{t.videos.selectCampaignFirst}</p>
                      ) : promotedAssets.length > 0 ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-900 bg-zinc-900/30">
                            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-white truncate max-w-[220px]">
                              <Check size={14} className="text-emerald-500 shrink-0" />
                              {promotedAssets.map(a => a.display_name).join(', ')}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAssetPicker(true)}
                              className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white shrink-0"
                            >
                              Change
                            </button>
                          </div>

                          {promotedAssets.map(asset => {
                            const assignmentId = resolvedAssignmentIdForAsset(asset.asset_id);
                            const sharedDomains = assignmentId
                              ? sharedDomainsByAssignmentId.get(assignmentId) ?? []
                              : [];
                            const currentValue = selectedAssetDomainByAssetId.get(asset.asset_id) ?? '';

                            if (verifiedDomains.length === 0 && sharedDomains.length === 0) return null;

                            return (
                              <div key={asset.asset_id} className="pl-1 space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 truncate">
                                  {asset.display_name} — Tracking Domain
                                </p>
                                <select
                                  value={currentValue}
                                  onChange={e => {
                                    const next = new Map(selectedAssetDomainByAssetId);
                                    next.set(asset.asset_id, e.target.value || null);
                                    setSelectedAssetDomainByAssetId(next);
                                  }}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-red-600"
                                >
                                  <option value="">vstrk.com</option>
                                  {verifiedDomains.length > 0 && (
                                    <optgroup label="Your Domains">
                                      {verifiedDomains.map(d => (
                                        <option key={d.id} value={d.id}>{d.hostname}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {sharedDomains.length > 0 && (
                                    <optgroup label="Shared Domains">
                                      {sharedDomains.map(d => (
                                        <option key={d.id} value={d.id}>{d.hostname}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAssetPicker(true)}
                          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 rounded-xl px-4 py-3 transition-all"
                        >
                          <Plus size={14} /> Select Asset
                        </button>
                      )}
                    </div>

                   <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <label className="label-caps">
                          Tracking Domain
                        </label>
                        {verifiedDomains.length === 0 && (
                          <div className="relative group/tip py-2">
  <Info
    size={13}
    className="text-zinc-600 hover:text-zinc-400 cursor-help transition-colors"
  />

  <div className="hidden group-hover/tip:block absolute left-0 top-6 z-20 w-64">
    <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
      <p className="text-[10px] leading-relaxed text-zinc-400 normal-case font-medium">
        Create branded tracking links using your own domain (e.g. go.company.com) instead of vstrk.com. You can set this up in Campaigns or below.
      </p>

      <Link
        to="/settings/tracking-domains"
        className="mt-2 inline-block text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400"
      >
        Set up a tracking domain →
      </Link>
    </div>
  </div>
</div>
                        )}
                      </div>
                      <select
                        value={selectedTrackingDomainId ?? ''}
                        onChange={(e) => setSelectedTrackingDomainId(e.target.value || null)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-100 focus:outline-none focus:border-red-600"
                      >
                        <option value="">vstrk.com</option>
                        {verifiedDomains.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.hostname}
                          </option>
                        ))}
                      </select>
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

                {showAssetPicker && organizationId && (
                  <PromotedAssetPicker
                    organizationId={organizationId}
                    initialSelectedAssetIds={promotedAssets.map(a => a.asset_id)}
                    onClose={() => setShowAssetPicker(false)}
                    onSelect={async assets => {
  setPromotedAssets(assets);
  setShowAssetPicker(false);

  if (!organizationId || !user) return;
  setResolvingPromotionContext(true);
  try {
    const entries = await Promise.all(
      assets.map(async (asset) => {
        const typeInfo = await resolveAssetType(asset.asset_id);
        const isShared =
          !!typeInfo &&
          categorizeAsset({
            assetOrganizationId: typeInfo.organizationId,
            viewerOrganizationId: organizationId,
            isAssignedOut: false,
          }) === 'shared';
        if (!isShared) return [asset.asset_id, null] as const;

        const options = await resolvePromotionContextForAsset(asset.asset_id, user.id);
        return [asset.asset_id, options] as const;
      })
    );

    const next = new Map(promotionContextByAssetId);
    for (const [assetId, options] of entries) {
      if (options === null) next.delete(assetId);
      else next.set(assetId, options);
    }
    setPromotionContextByAssetId(next);
  } finally {
    setResolvingPromotionContext(false);
  }
}}
                  />
                )}
{promotionContextByAssetId.size > 0 && (
  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-4">
    <p className="label-caps !text-zinc-500">Confirm Promotion Context</p>
    {Array.from(promotionContextByAssetId.entries()).map(([assetId, options]) => {
      const asset = promotedAssets.find(a => a.asset_id === assetId);
      if (!asset) return null;

      if (options.length === 0) {
        return (
          <p key={assetId} className="text-xs text-red-500">
            "{asset.display_name}" is a shared asset with no active Promotion.
            Ask the assignment sponsor to start one before tracking this asset.
          </p>
        );
      }

      if (options.length === 1) return null;

      const chosen = chosenPromotionByAssetId.get(assetId);
      return (
        <div key={assetId} className="space-y-2">
          <p className="text-xs text-zinc-300">
            "{asset.display_name}" is used in multiple collaborations. Select which Promotion to track:
          </p>
          {options.map(opt => (
            <button
              key={opt.promotionId}
              type="button"
              onClick={() =>
                setChosenPromotionByAssetId(new Map(chosenPromotionByAssetId).set(assetId, toPromotionContext(opt)))
              }
              className={`w-full text-left text-xs px-3 py-2 rounded-lg border ${
                chosen?.promotionId === opt.promotionId
                  ? 'border-red-600 bg-red-950/30 text-white'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {opt.assignmentTitle} — shared by {opt.sharedByName}
            </button>
          ))}
        </div>
      );
    })}
  </div>
)}
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
                        disabled={saving || hasBlockingPromotionIssue}
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

          <button
            onClick={openArchivedVideosModal}
            title="Archived Videos"
            className="h-11 flex items-center gap-2 px-4 bg-zinc-950 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all"
          >
            <Archive size={15} /> Archived
          </button>
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
                  {v.status === 'no_data' && v.asset_id && !libraryStatus.get(v.asset_id) ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleAddToLibraryInList(v, e)}
                        disabled={addingLibraryId === v.id}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors disabled:opacity-50"
                      >
                        {addingLibraryId === v.id && (
                          <Loader2 size={10} className="animate-spin" />
                        )}
                        + Asset
                      </button>
                      <div className="relative group/libtip">
                        <HelpCircle size={12} className="text-zinc-600 hover:text-zinc-400 cursor-help transition-colors" />
                        <div className="hidden group-hover/libtip:block absolute left-0 top-5 z-20 w-56 p-3 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
                          <p className="text-[10px] leading-relaxed text-zinc-400 normal-case font-medium">
                            Add this content to your Asset Library. Once it's been added, it becomes reusable, shareable, and trackable across your campaigns and promotions.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : v.status !== 'no_data' ? (
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${getStatusColor(v.status)}`}>
                      {v.status.replace('_', ' ')}
                    </span>
                  ) : null}
                </div>
               <div className="flex flex-wrap gap-4 items-center text-[10px] font-bold uppercase text-zinc-500">
  
  {/* === Asset Promotion Badges === */}
  {(() => {
    const badges = promotionBadges.get(v.id) || {};
    const categories: PromotedAssetCategory[] = ['library', 'shared', 'assigned'];

    return categories.map(cat => {
  const count = badges[cat];
  if (!count) return null;

  const info = CATEGORY_LABEL[cat];

  return (
    <div key={cat} className="flex items-center gap-1.5">
      <span>{info.icon}</span>
      <span>{info.label}</span>
      {count > 1 && <span className="text-zinc-400">x{count}</span>}
    </div>
  );
});
  })()}

  {/* Goals */}
  <div className="flex flex-wrap items-center gap-1.5 min-w-[120px]">
    <Target size={12} className="text-red-500" /> 
    Goals: 
    <div className="flex gap-1">
      {v.video_goal.map(goal => (
        <span 
          key={goal} 
          className="text-zinc-300 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-[8px]"
        >
          {getObjectiveLabel(goal)}
        </span>
      ))}
    </div>
  </div>

  {/* Added Date */}
  <div className="flex items-center gap-1.5">
    <Calendar size={12} className="text-zinc-600" /> 
    Added: <span className="text-zinc-600">{new Date(v.created_at).toLocaleDateString()}</span>
  </div>
</div>
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <button 
                  onClick={async () => {
                    const { data: linkData } = await supabase
                      .from('redirect_links')
                      .select('token, tracking_hostname')
                      .eq('video_id', v.id)
                      .eq('link_type', 'landing_page')
                      .single();

                    const link = linkData
                      ? buildTrackingLinkUrl(linkData.token, linkData.tracking_hostname ?? null)
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
                    const editingOnlyPromoteAsset =
                      !!onlyPromoteAssetCampaign && v.campaign_id === onlyPromoteAssetCampaign.id;
                    setUseOnlyPromoteAsset(editingOnlyPromoteAsset);
                    setPreviousCampaignId(editingOnlyPromoteAsset ? '' : v.campaign_id);
                    setEditingVideoId(v.id);
                    setShowAdd(true);
                  }}
                  className="h-10 px-4 rounded-xl border border-zinc-800 hover:bg-zinc-900 transition-all text-zinc-500 hover:text-white"
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleArchiveVideo(v);
                  }}
                  disabled={archivingVideoId === v.id}
                  className="h-10 px-4 rounded-xl border border-zinc-800 hover:bg-zinc-900 transition-all text-zinc-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Archive"
                >
                  {archivingVideoId === v.id ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
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

            <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar">
              {savedDisplayGroups.campaignLinks.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">Campaign Links</p>
                  <div className="space-y-2">
                    {savedDisplayGroups.campaignLinks.map((link) => (
                      <div key={link.key} className="flex items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase text-zinc-400 mb-1">{link.icon} {link.label}</p>
                          <p className="font-mono text-[11px] text-blue-400 truncate">{buildTrackingLinkUrl(link.token, link.trackingHostname)}</p>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(buildTrackingLinkUrl(link.token, link.trackingHostname));
                            setCopiedLink(link.token);
                            setTimeout(() => setCopiedLink(null), 2000);
                          }}
                          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-all"
                        >
                          {copiedLink === link.token ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-zinc-400" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {savedDisplayGroups.assets.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">Assets</p>
                  {(['library', 'shared', 'assigned'] as const).map((cat) => {
                    const rowsForCategory = savedDisplayGroups.assets.filter(a => a.category === cat);
                    if (rowsForCategory.length === 0) return null;
                    return (
                      <div key={cat} className="mb-2">
                        <p className="text-[9px] font-bold text-zinc-600 mb-1">{CATEGORY_LABEL[cat].label}s</p>
                        <div className="space-y-2">
                          {rowsForCategory.map((asset) => (
                            <div key={asset.key} className="flex items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black uppercase text-zinc-400 mb-1">{CATEGORY_LABEL[asset.category].icon} {asset.title}</p>
                                <p className="font-mono text-[11px] text-blue-400 truncate">{buildTrackingLinkUrl(asset.token, asset.trackingHostname)}</p>
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(buildTrackingLinkUrl(asset.token, asset.trackingHostname));
                                  setCopiedLink(asset.token);
                                  setTimeout(() => setCopiedLink(null), 2000);
                                }}
                                className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border border-zinc-700 hover:bg-zinc-800 transition-all"
                              >
                                {copiedLink === asset.token ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-zinc-400" />}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* Archived videos modal */}
      <AnimatePresence>
        {showArchivedVideos && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowArchivedVideos(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Archive size={16} className="text-zinc-500" /> Archived Videos
                </h2>
                <button
                  onClick={() => setShowArchivedVideos(false)}
                  className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
                {archivedVideosLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-11 rounded-xl bg-zinc-900/50 animate-pulse" />
                  ))
                ) : archivedVideos.length === 0 ? (
                  <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest text-center py-10">
                    No archived videos
                  </p>
                ) : (
                  archivedVideos.map(v => (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-all group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedArchivedVideoIds.includes(v.id)}
                        onChange={() => toggleArchivedVideoSelection(v.id)}
                        className="w-4 h-4 rounded accent-white shrink-0"
                      />
                      <Link
                        to={`/videos/${v.id}`}
                        onClick={() => setShowArchivedVideos(false)}
                        className="text-sm text-zinc-200 flex-1 truncate hover:text-white"
                      >
                        {v.video_title}
                      </Link>
                    </div>
                  ))
                )}
              </div>

              <button
                disabled={selectedArchivedVideoIds.length === 0 || restoringVideos}
                onClick={handleRestoreSelectedVideos}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {restoringVideos ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={14} />}
                Restore Selected{selectedArchivedVideoIds.length > 0 ? ` (${selectedArchivedVideoIds.length})` : ''}
              </button>
            </motion.div>
          </motion.div>
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

      {/* Phase 2.5: YouTube Analytics Import Overlay */}
      {showImportWizard && (
        <YouTubeImportPanel onClose={() => setShowImportWizard(false)} />
      )}
    </div>
  );
}