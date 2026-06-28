/**
 * UnmappedVideos.tsx
 *
 * Admin panel for resolving unmapped video_registry entries.
 *
 * Responsibilities (UI only):
 *   - List all video_registry rows where status = 'unmapped'
 *   - Allow user to:
 *       (A) Map to an existing internal video   → PATCH /api/youtube/resolve-mapping
 *       (B) Create a new video and auto-map     → POST  /api/youtube/create-and-map
 *       (C) Ignore (skip permanently)           → PATCH /api/youtube/resolve-mapping { action: 'ignore' }
 *
 * CONTRACT:
 *   - This component contains ZERO matching or ingestion logic
 *   - All backend operations triggered via API calls (or direct Supabase RPC)
 *   - After any action, the row is removed from this list
 *
 * Route: /unmapped-videos
 * Add to App.tsx: <Route path="/unmapped-videos" element={<PageWrapper><UnmappedVideos /></PageWrapper>} />
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Campaign, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
import { createVideo } from '../services/video/createVideo';
import {
  AlertTriangle, Check, X, Loader2, Search, Link2,
  Plus, ArrowLeft, RefreshCw, ExternalLink, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistryEntry {
  id: string;
  youtube_video_id: string | null;
  canonical_title: string;
  normalized_title: string;
  status: 'unmapped' | 'mapped' | 'ignored';
  match_method: string | null;
  match_score: number | null;
  created_at: string;
}

interface InternalVideo {
  id: string;
  video_title: string | null;
  youtube_video_id: string | null;
  platform_url: string | null;
  campaign_id: string | null;
  status: string;
}

type ActionType = 'map' | 'create' | 'ignore' | null;

interface RowAction {
  registryId: string;
  type: ActionType;
}

// ---------------------------------------------------------------------------
// Action: Map to Existing Video
// Shows a searchable dropdown of internal videos
// ---------------------------------------------------------------------------

function MapToExistingModal({
  entry,
  organizationId,
  onConfirm,
  onCancel,
}: {
  entry: RegistryEntry;
  organizationId: string;
  onConfirm: (internalVideoId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState('');
  const [videos, setVideos] = useState<InternalVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('videos')
        .select('id, video_title, youtube_video_id, platform_url, campaign_id, status')
        .eq('platform', 'youtube')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      setVideos(data ?? []);

      // Auto-select exact match by youtube_video_id (100% confidence only)
      if (entry.youtube_video_id) {
        const exactMatch = (data ?? []).find(
          v => v.youtube_video_id && v.youtube_video_id === entry.youtube_video_id
        );
        if (exactMatch) setSelectedId(exactMatch.id);
      }

      setLoadingVideos(false);
    };
    load();
  }, [organizationId, entry.youtube_video_id]);

  const filtered = videos
    .filter(v => {
      const q = search.toLowerCase();
      return (
        (v.video_title ?? '').toLowerCase().includes(q) ||
        (v.youtube_video_id ?? '').toLowerCase().includes(q)
      );
    })
    // Exact match always sorts to top
    .sort((a, b) => {
      const aExact = a.youtube_video_id === entry.youtube_video_id ? -1 : 0;
      const bExact = b.youtube_video_id === entry.youtube_video_id ? -1 : 0;
      return aExact - bExact;
    });

  const handleConfirm = async () => {
    if (!selectedId) return;
    setSaving(true);
    await onConfirm(selectedId);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-white font-black uppercase tracking-tight text-sm">Map to Existing Video</h3>
            <p className="text-zinc-500 text-[10px] mt-1 font-mono truncate max-w-xs">
              {entry.canonical_title}
            </p>
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or video ID…"
            className="w-full h-10 bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-600 transition-all font-mono"
          />
        </div>

        {/* Video List */}
        <div className="max-h-72 overflow-y-auto space-y-1.5 custom-scrollbar">
          {loadingVideos ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="text-zinc-600 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-zinc-600 text-[10px] font-bold uppercase text-center py-6">
              No videos found
            </p>
          ) : (
            filtered.map(v => {
              const isExact = !!(v.youtube_video_id && v.youtube_video_id === entry.youtube_video_id);
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    isExact
                      ? selectedId === v.id
                        ? 'bg-green-600/10 border-green-600/50 text-white'
                        : 'border-green-800/50 bg-green-950/20 text-zinc-400 hover:bg-green-900/20'
                      : selectedId === v.id
                        ? 'bg-red-600/10 border-red-600/50 text-white'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                    selectedId === v.id
                      ? isExact ? 'border-green-500 bg-green-500' : 'border-red-500 bg-red-500'
                      : 'border-zinc-700'
                  }`}>
                    {selectedId === v.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-bold truncate text-inherit">
                        {v.video_title ?? '(untitled)'}
                      </p>
                      {isExact && (
                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-green-900/50 border border-green-700/50 rounded text-[9px] font-black uppercase tracking-widest text-green-400">
                          <Check size={9} />
                          Exact Match
                        </span>
                      )}
                    </div>
                    {v.youtube_video_id && (
                      <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
                        {v.youtube_video_id}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 h-10 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId || saving}
            className="flex-1 h-10 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Confirm Mapping
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action: Import & Map — full video creation from registry analytics data
// ---------------------------------------------------------------------------

/**
 * ImportEntry encapsulates the analytics data already available from the registry.
 * Platform-agnostic by design: today YouTube, tomorrow TikTok/Instagram/LinkedIn.
 * To support a new platform, extend buildImportEntry() only — modal is unchanged.
 */
interface ImportEntry {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'linkedin';
  platformVideoId: string | null;
  title: string;
  importDate: string;
  prefillUrl: string | null;
}

function buildImportEntry(entry: RegistryEntry): ImportEntry {
  // Currently YouTube-only. Future platforms: add a branch here.
  const prefillUrl = entry.youtube_video_id
    ? `https://www.youtube.com/watch?v=${entry.youtube_video_id}`
    : null;
  return {
    platform: 'youtube',
    platformVideoId: entry.youtube_video_id,
    title: entry.canonical_title,
    importDate: entry.created_at,
    prefillUrl,
  };
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube:   'YouTube',
  tiktok:    'TikTok',
  instagram: 'Instagram',
  linkedin:  'LinkedIn',
};

const GOALS = ['sales', 'newsletter', 'calls', 'consult', 'viral'] as const;
const GOAL_LABELS: Record<string, string> = {
  sales: 'Sales', newsletter: 'Newsletter', calls: 'Sales Call',
  consult: 'Consultation', viral: 'Viral / Awareness',
};

function ImportVideoModal({
  entry,
  organizationId,
  userId,
  onConfirm,
  onCancel,
}: {
  entry: RegistryEntry;
  organizationId: string;
  userId: string;
  onConfirm: (savedVideoId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const importEntry = buildImportEntry(entry);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(['sales']);
  const [availableMagnets, setAvailableMagnets] = useState<LeadMagnet[]>([]);
  const [hasLeadMagnet, setHasLeadMagnet] = useState(false);
  const [selectedMagnetIds, setSelectedMagnetIds] = useState<string[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingMagnets, setLoadingMagnets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      const list = data ?? [];
      setCampaigns(list);
      if (list.length > 0) setSelectedCampaignId(list[0].id);
      setLoadingCampaigns(false);
    };
    load();
  }, [organizationId]);

  useEffect(() => {
    if (!selectedCampaignId) { setAvailableMagnets([]); return; }
    setLoadingMagnets(true);
    supabase
      .from('lead_magnets')
      .select('*')
      .eq('campaign_id', selectedCampaignId)
      .then(({ data }) => {
        const list = data ?? [];
        setAvailableMagnets(list);
        setSelectedMagnetIds(ids => ids.filter(id => list.some((m: LeadMagnet) => m.id === id)));
        setLoadingMagnets(false);
      });
  }, [selectedCampaignId]);

  const toggleGoal = (goal: string) => {
    setSelectedGoals(prev =>
      prev.includes(goal)
        ? (prev.length > 1 ? prev.filter(g => g !== goal) : prev)
        : [...prev, goal]
    );
  };

  const toggleMagnet = (id: string) => {
    setSelectedMagnetIds(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!selectedCampaignId) { setError('Please select a campaign.'); return; }
    setError(null);
    setSaving(true);
    try {
      const campaign = campaigns.find(c => c.id === selectedCampaignId);

      // Build thumbnail from video ID — no API call needed.
      // Registry data is already the source of truth.
      const thumbnailUrl = importEntry.platform === 'youtube' && importEntry.platformVideoId
        ? `https://img.youtube.com/vi/${importEntry.platformVideoId}/maxresdefault.jpg`
        : null;

      const { savedVideo } = await createVideo({
        payload: {
          platform:                 importEntry.platform as any,
          platform_url:             importEntry.prefillUrl ?? '',
          platform_post_id:         importEntry.platformVideoId ?? null,
          youtube_video_id:         importEntry.platform === 'youtube' ? importEntry.platformVideoId : null,
          video_title:              importEntry.title,
          thumbnail_url:            thumbnailUrl,
          campaign_id:              selectedCampaignId,
          video_goal:               selectedGoals as any,
          selected_lead_magnet_ids: hasLeadMagnet && selectedMagnetIds.length > 0 ? selectedMagnetIds : null,
          status:                   'no_data',
        },
        campaign,
        organizationId,
        userId,
      });

      // Delegate mapping + backfill to caller (handleMapToExisting)
      await onConfirm(savedVideo.id);
    } catch (err: any) {
      setError(err.message ?? 'An unexpected error occurred.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <h3 className="text-white font-black uppercase tracking-tight text-sm">Track New Content</h3>
            <p className="text-zinc-500 text-[10px] mt-1 font-bold uppercase tracking-widest">
              Import from analytics data
            </p>
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Analytics Info Panel — always visible so user knows which record they're importing */}
        <div className="mx-6 mb-4 p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
            Importing Analytics Record
          </p>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-red-600/20 border border-red-600/30 rounded text-[9px] font-black uppercase tracking-widest text-red-400">
              {PLATFORM_LABELS[importEntry.platform] ?? importEntry.platform}
            </span>
            {importEntry.platformVideoId && (
              <span className="text-[10px] font-mono text-zinc-600">
                {importEntry.platformVideoId}
              </span>
            )}
          </div>
          <p className="text-white text-[11px] font-bold leading-snug">
            {importEntry.title}
          </p>
          <p className="text-zinc-600 text-[9px] font-mono">
            Imported {new Date(importEntry.importDate).toLocaleDateString()}
          </p>
          {importEntry.prefillUrl && (
            <a
              href={importEntry.prefillUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-300 text-[9px] font-mono transition-colors"
            >
              <ExternalLink size={10} />
              {importEntry.prefillUrl}
            </a>
          )}
        </div>

        {/* Business fields — user fills in what the analytics record doesn't have */}
        <div className="px-6 pb-6 space-y-4">

          {/* Campaign */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
              Campaign
            </label>
            {loadingCampaigns ? (
              <div className="h-10 flex items-center">
                <Loader2 size={14} className="text-zinc-600 animate-spin" />
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-zinc-600 text-[10px] font-bold uppercase">
                No campaigns found — create one first.
              </p>
            ) : (
              <select
                value={selectedCampaignId}
                onChange={e => setSelectedCampaignId(e.target.value)}
                className="w-full h-10 bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 transition-all"
              >
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.campaign_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Goals */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
              Goals
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map(goal => (
                <button
                  key={goal}
                  onClick={() => toggleGoal(goal)}
                  className={`h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    selectedGoals.includes(goal)
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {GOAL_LABELS[goal]}
                </button>
              ))}
            </div>
          </div>

          {/* Lead Magnet */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={hasLeadMagnet}
                onChange={e => setHasLeadMagnet(e.target.checked)}
                className="accent-red-600"
              />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Include Lead Magnet
              </span>
            </label>
            {hasLeadMagnet && (
              <div className="space-y-1 pl-1">
                {loadingMagnets ? (
                  <Loader2 size={12} className="text-zinc-600 animate-spin" />
                ) : !selectedCampaignId ? (
                  <p className="text-zinc-600 text-[10px]">Select a campaign first.</p>
                ) : availableMagnets.length === 0 ? (
                  <p className="text-zinc-600 text-[10px]">No lead magnets in this campaign.</p>
                ) : (
                  availableMagnets.map(m => (
                    <button
                      key={m.id}
                      onClick={() => toggleMagnet(m.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-[10px] font-bold transition-all ${
                        selectedMagnetIds.includes(m.id)
                          ? 'bg-red-600/10 border-red-600/40 text-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <span className="truncate">{m.lead_magnet_name}</span>
                      {selectedMagnetIds.includes(m.id) && <Check size={11} className="text-red-500 shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-[10px] font-bold">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 h-10 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loadingCampaigns || campaigns.length === 0}
              className="flex-1 h-10 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Save & Map
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function UnmappedVideos() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<RowAction>({ registryId: '', type: null });
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Deep-link highlight (from VideoDetail \u201cReview & Map\u201d button)
  const [searchParams] = useSearchParams();
  const [highlightId, setHighlightId] = useState<string | null>(
    () => searchParams.get('highlight')
  );
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadEntries = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('video_registry')
      .select('id, youtube_video_id, canonical_title, normalized_title, status, match_method, match_score, created_at')
      .eq('status', 'unmapped')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[UnmappedVideos] Load error:', error);
      showToast('Failed to load unmapped videos', 'error');
    } else {
      setEntries(data ?? []);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Auto-scroll to highlighted row once entries are loaded
  useEffect(() => {
    if (!highlightId || loading) return;
    const el = rowRefs.current[highlightId];
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [highlightId, loading]);

  // ── Action: Map to Existing ───────────────────────────────────────────────

  const handleMapToExisting = async (registryId: string, internalVideoId: string) => {
    setProcessingId(registryId);
    try {
      // Update video_registry
      const { error: regError } = await supabase
        .from('video_registry')
        .update({
          internal_video_id: internalVideoId,
          status: 'mapped',
          match_method: 'manual',
          match_score: 1.0,
        })
        .eq('id', registryId);

      if (regError) throw regError;

      // Back-fill video_metrics via server endpoint (service role, bypasses RLS).
      // video_metrics must only be written server-side, consistent with the CSV import pipeline.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      console.log('[BACKFILL] Calling /api/youtube/backfill', { registryId, internalVideoId });

      const backfillRes = await fetch('/api/youtube/backfill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ registryId, internalVideoId }),
      });

      const backfillData = await backfillRes.json();
      console.log('[BACKFILL] Response:', backfillData);

      if (!backfillRes.ok) {
        throw new Error(`Backfill failed: ${backfillData.error ?? backfillRes.status}`);
      }

      setEntries(prev => prev.filter(e => e.id !== registryId));
      setActiveAction({ registryId: '', type: null });
      showToast('Video mapped successfully. Metrics backfilled.');
    } catch (err: any) {
      console.error('[UnmappedVideos] Map error:', err);
      showToast(`Mapping failed: ${err.message}`, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // ── Action: Ignore ───────────────────────────────────────────────────────

  const handleIgnore = async (registryId: string) => {
    setProcessingId(registryId);
    try {
      const { error } = await supabase
        .from('video_registry')
        .update({ status: 'ignored' })
        .eq('id', registryId);

      if (error) throw error;

      setEntries(prev => prev.filter(e => e.id !== registryId));
      showToast('Video ignored. It will not appear here again.');
    } catch (err: any) {
      showToast(`Ignore failed: ${err.message}`, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const activeEntry = entries.find(e => e.id === activeAction.registryId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link
              to="/videos"
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1 className="text-white font-black uppercase tracking-tight text-xl flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" />
              Unmapped Videos
            </h1>
          </div>
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold ml-7">
            {loading ? '…' : `${entries.length} video${entries.length !== 1 ? 's' : ''} need manual mapping`}
          </p>
        </div>
        <button
          onClick={loadEntries}
          disabled={loading}
          className="flex items-center gap-2 px-4 h-9 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-all disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* What does this mean? */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
          These videos were found in your YouTube CSV export but could not be automatically matched to a video in your VS-Track library.
          Raw analytics data for these videos is safely stored. Once mapped, historical metrics will be backfilled automatically.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="text-zinc-600 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <Check size={32} className="text-green-500" />
          <p className="text-white font-black uppercase tracking-tight">All videos are mapped!</p>
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
            No unmapped videos remaining.
          </p>
          <Link
            to="/videos"
            className="mt-2 flex items-center gap-2 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            <ArrowLeft size={12} /> Back to Videos
          </Link>
        </div>
      )}

      {/* Entry List */}
      {!loading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map(entry => (
            <motion.div
              key={entry.id}
              ref={(el: HTMLDivElement | null) => { rowRefs.current[entry.id] = el; }}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`bg-zinc-900 border rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 transition-colors duration-700 ${
                highlightId === entry.id
                  ? 'border-yellow-500/60 bg-yellow-500/5'
                  : 'border-zinc-800'
              }`}
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm truncate">
                  {entry.canonical_title}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  {entry.youtube_video_id && (
                    <span className="text-zinc-600 text-[10px] font-mono">
                      {entry.youtube_video_id}
                    </span>
                  )}
                  {!entry.youtube_video_id && (
                    <span className="text-amber-700 text-[9px] font-bold uppercase tracking-widest">
                      No video ID — title-only
                    </span>
                  )}
                  <span className="text-zinc-700 text-[9px]">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {processingId === entry.id ? (
                  <Loader2 size={16} className="text-zinc-500 animate-spin" />
                ) : (
                  <>
                    <button
                      onClick={() => { setHighlightId(null); setActiveAction({ registryId: entry.id, type: 'map' }); }}
                      className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-300 transition-all flex items-center gap-1.5"
                    >
                      <Link2 size={11} />
                      Map
                    </button>
                    <button
                      onClick={() => { setHighlightId(null); setActiveAction({ registryId: entry.id, type: 'create' }); }}
                      className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-300 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={11} />
                      Create
                    </button>
                    <button
                      onClick={() => { setHighlightId(null); handleIgnore(entry.id); }}
                      className="h-8 px-3 border border-zinc-800 hover:bg-zinc-900 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-all"
                    >
                      Ignore
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {activeAction.type === 'map' && activeEntry && (
          <MapToExistingModal
            key="map-modal"
            entry={activeEntry}
            organizationId={organizationId ?? ''}
            onConfirm={(internalVideoId) => handleMapToExisting(activeEntry.id, internalVideoId)}
            onCancel={() => setActiveAction({ registryId: '', type: null })}
          />
        )}
        {activeAction.type === 'create' && activeEntry && organizationId && user && (
          <ImportVideoModal
            key="create-modal"
            entry={activeEntry}
            organizationId={organizationId}
            userId={user.id}
            onConfirm={(savedVideoId) => handleMapToExisting(activeEntry.id, savedVideoId)}
            onCancel={() => setActiveAction({ registryId: '', type: null })}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-2xl ${
              toast.type === 'success'
                ? 'bg-green-900 border border-green-700 text-green-300'
                : 'bg-red-950 border border-red-800 text-red-300'
            }`}
          >
            {toast.type === 'success' ? <Check size={13} /> : <X size={13} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
