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

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
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
      setLoadingVideos(false);
    };
    load();
  }, [organizationId]);

  const filtered = videos.filter(v => {
    const q = search.toLowerCase();
    return (
      (v.video_title ?? '').toLowerCase().includes(q) ||
      (v.youtube_video_id ?? '').toLowerCase().includes(q)
    );
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
            filtered.map(v => (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  selectedId === v.id
                    ? 'bg-red-600/10 border-red-600/50 text-white'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                  selectedId === v.id ? 'border-red-500 bg-red-500' : 'border-zinc-700'
                }`}>
                  {selectedId === v.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold truncate text-inherit">
                    {v.video_title ?? '(untitled)'}
                  </p>
                  {v.youtube_video_id && (
                    <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
                      {v.youtube_video_id}
                    </p>
                  )}
                </div>
              </button>
            ))
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
// Action: Create New Video
// Minimal form to create a stub video entry and auto-map
// ---------------------------------------------------------------------------

function CreateAndMapModal({
  entry,
  onConfirm,
  onCancel,
}: {
  entry: RegistryEntry;
  onConfirm: (title: string, youtubeUrl: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(entry.canonical_title);
  const [url, setUrl] = useState(
    entry.youtube_video_id
      ? `https://www.youtube.com/watch?v=${entry.youtube_video_id}`
      : ''
  );
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onConfirm(title.trim(), url.trim());
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-white font-black uppercase tracking-tight text-sm">Create & Map New Video</h3>
            <p className="text-zinc-500 text-[10px] mt-1 font-bold uppercase tracking-widest">
              A stub video entry will be created and linked
            </p>
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
              Video Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full h-10 bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-[11px] text-zinc-300 outline-none focus:border-zinc-600 transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">
              YouTube URL (optional)
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              className="w-full h-10 bg-zinc-950 border border-zinc-800 rounded-xl px-4 text-[11px] font-mono text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-zinc-600 transition-all"
            />
          </div>
        </div>

        <p className="text-zinc-600 text-[10px] font-bold">
          Note: The new video will be created without a campaign. You can assign it a campaign later in the Videos page.
        </p>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 h-10 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!title.trim() || saving}
            className="flex-1 h-10 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create & Map
          </button>
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

      // Back-fill video_metrics for all raw rows linked to this registry entry
      // that don't yet have a metrics row
      const { data: rawRows } = await supabase
        .from('youtube_import_rows')
        .select('*')
        .eq('video_registry_id', registryId);

      if (rawRows && rawRows.length > 0) {
        const metricsRows = rawRows.map(row => ({
          video_registry_id: registryId,
          internal_video_id: internalVideoId,
          organization_id: row.organization_id,
          platform: 'youtube',
          date: row.date,
          views: row.views,
          likes: row.likes,
          comments: row.comments,
          watch_time: row.watch_time,
          impressions: row.impressions,
          ctr: row.ctr,
          import_batch_id: row.import_batch_id,
        }));

        await supabase
          .from('video_metrics')
          .upsert(metricsRows, { onConflict: 'video_registry_id,date', ignoreDuplicates: true });
      } else {
      // 🔥 ADD THIS BLOCK (STUB METRICS)
        await supabase
          .from('video_metrics')
          .insert({
            video_registry_id: registryId,
            internal_video_id: internalVideoId,
            organization_id: organizationId, // IMPORTANT: use org from outer scope
            platform: 'youtube',
            date: new Date().toISOString().split('T')[0],
            views: 0,
            likes: 0,
            comments: 0,
            watch_time: 0,
            impressions: 0,
            ctr: 0,
          });
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

  // ── Action: Create & Map ─────────────────────────────────────────────────

  const handleCreateAndMap = async (registryId: string, title: string, youtubeUrl: string) => {
    // Guard: organizationId and user must be present before any write
    if (!organizationId) {
      showToast('Create failed: missing organization context', 'error');
      return;
    }
    if (!user?.id) {
      showToast('Create failed: not authenticated', 'error');
      return;
    }

    setProcessingId(registryId);
    try {
      // 1. Get registry entry for youtube_video_id
      const entry = entries.find(e => e.id === registryId);
      if (!entry) throw new Error('Registry entry not found');

      // 2. Extract video ID from URL if provided, fall back to registry's youtube_video_id
      const videoIdFromUrl = youtubeUrl
        ? youtubeUrl.match(/[?&]v=([0-9A-Za-z_-]{11})/)?.[1] ?? null
        : entry.youtube_video_id;

      // 3. Create video in videos table
      // organization_id is required for RLS — this was the root cause of the previous failure
      const { data: newVideo, error: insertError } = await supabase
        .from('videos')
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          video_title: title,
          platform: 'youtube',
          youtube_video_id: videoIdFromUrl,
          platform_url: youtubeUrl || (videoIdFromUrl ? `https://www.youtube.com/watch?v=${videoIdFromUrl}` : null),
          platform_post_id: videoIdFromUrl,
          status: 'no_data',
          video_goal: [],
        })
        .select('id')
        .single();

      if (insertError || !newVideo) throw insertError ?? new Error('Insert failed');

      // 4. Map the registry entry + backfill metrics
      await handleMapToExisting(registryId, newVideo.id);

      setActiveAction({ registryId: '', type: null });
    } catch (err: any) {
      console.error('[UnmappedVideos] Create+map error:', err);
      showToast(`Create & map failed: ${err.message}`, 'error');
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
  // Renderr
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
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4"
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
                      onClick={() => setActiveAction({ registryId: entry.id, type: 'map' })}
                      className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-300 transition-all flex items-center gap-1.5"
                    >
                      <Link2 size={11} />
                      Map
                    </button>
                    <button
                      onClick={() => setActiveAction({ registryId: entry.id, type: 'create' })}
                      className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-300 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={11} />
                      Create
                    </button>
                    <button
                      onClick={() => handleIgnore(entry.id)}
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
        {activeAction.type === 'create' && activeEntry && (
          <CreateAndMapModal
            key="create-modal"
            entry={activeEntry}
            onConfirm={(title, url) => handleCreateAndMap(activeEntry.id, title, url)}
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
