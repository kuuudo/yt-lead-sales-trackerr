import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2,
  ShieldAlert,
  Globe,
  MessageSquareText,
  RotateCcw,
  Ban,
  ImagePlus,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { Testimonial } from '../lib/supabase';
import TestimonialStars from '../components/testimonial/TestimonialStars';
import {
  ADMIN_EMAIL,
  fetchAllTestimonials,
  getSignedMediaUrl,
  sendToTestimonials,
  removeFromTestimonials,
  sendToWebsite,
  removeFromWebsite,
  rejectTestimonial,
  resetToPending,
} from '../services/testimonial/adminTestimonials';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

type MediaUrls = { avatar?: string; video?: string };

// Distinct from `submitting` on the LeaveTestimonialModal form — this is
// "which row currently has a moderation action in flight", so we can
// disable just that row's buttons instead of the whole page.
type RowAction = 'testimonials' | 'website' | 'reject' | 'reset';

const STATUS_STYLES: Record<Testimonial['status'], string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  approved: 'bg-green-500/10 text-green-400 border-green-500/30',
  rejected: 'bg-zinc-800 text-zinc-500 border-zinc-700',
};

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function AdminTestimonials() {
  const { user, loading: authLoading } = useAuth();

  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, MediaUrls>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowActionInFlight, setRowActionInFlight] = useState<Record<string, RowAction | undefined>>({});

  const isAdmin = !!user?.email && user.email === ADMIN_EMAIL;

  const loadTestimonials = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchAllTestimonials();
      setTestimonials(rows);

      // Resolve signed URLs for any avatar/video paths. Best-effort per
      // row — one bad/expired path shouldn't block the rest of the inbox.
      const entries = await Promise.all(
        rows.map(async (t) => {
          const urls: MediaUrls = {};
          await Promise.all([
            t.avatar_url
              ? getSignedMediaUrl(t.avatar_url)
                  .then((url) => (urls.avatar = url))
                  .catch(() => {})
              : Promise.resolve(),
            t.video_url
              ? getSignedMediaUrl(t.video_url)
                  .then((url) => (urls.video = url))
                  .catch(() => {})
              : Promise.resolve(),
          ]);
          return [t.id, urls] as const;
        })
      );
      setMediaUrls(Object.fromEntries(entries));
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load testimonials.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadTestimonials();
  }, [isAdmin, loadTestimonials]);

  const runRowAction = async (
    id: string,
    action: RowAction,
    fn: () => Promise<Testimonial>
  ) => {
    setRowActionInFlight((prev) => ({ ...prev, [id]: action }));
    setRowError((prev) => ({ ...prev, [id]: '' }));
    try {
      const updated = await fn();
      setTestimonials((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err: any) {
      setRowError((prev) => ({ ...prev, [id]: err?.message || 'Action failed. Please try again.' }));
    } finally {
      setRowActionInFlight((prev) => ({ ...prev, [id]: undefined }));
    }
  };

  if (authLoading || (isAdmin && loading)) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="text-red-600 animate-spin" size={32} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-24">
        <ShieldAlert className="text-amber-500" size={32} />
        <h1 className="text-lg font-bold text-white">Not authorized</h1>
        <p className="text-zinc-500 text-sm max-w-xs">
          This page is restricted to the VSTRK admin account.
        </p>
        <Link
          to="/dashboard"
          className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const visible = testimonials.filter((t) => filter === 'all' || t.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold text-white">Testimonial Inbox</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Review submissions and control what appears on /testimonials and /website.
        </p>
      </header>

      <div className="flex items-center gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest border transition-all ${
              filter === key
                ? 'bg-white text-zinc-950 border-white'
                : 'bg-zinc-900/50 text-zinc-500 border-zinc-800 hover:text-zinc-300'
            }`}
          >
            {label}
            {key !== 'all' && (
              <span className="ml-1.5 opacity-60">
                {testimonials.filter((t) => t.status === key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="bento-card p-4 text-sm text-red-500">
          {loadError}
          <button
            type="button"
            onClick={loadTestimonials}
            className="ml-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {!loadError && visible.length === 0 && (
        <div className="bento-card p-8 text-center text-zinc-500 text-sm">
          No testimonials in this view.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {visible.map((t) => {
          const urls = mediaUrls[t.id] || {};
          const actionInFlight = rowActionInFlight[t.id];
          const err = rowError[t.id];

          return (
            <div key={t.id} className="bento-card p-5 md:p-6">
              <div className="flex flex-col md:flex-row gap-5">
                {/* Left: identity + media */}
                <div className="flex md:flex-col items-center md:items-start gap-3 md:w-40 shrink-0">
                  {urls.avatar ? (
                    <img
                      src={urls.avatar}
                      alt={`${t.name}'s avatar`}
                      className="w-12 h-12 rounded-full object-cover border border-zinc-800"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-950 border border-zinc-900 flex items-center justify-center text-zinc-600">
                      <ImagePlus size={16} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{t.name}</p>
                    {(t.role || t.company) && (
                      <p className="text-zinc-500 text-xs truncate">
                        {[t.role, t.company].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Middle: content */}
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <TestimonialStars value={t.rating} readOnly size={16} />
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 ${STATUS_STYLES[t.status]}`}
                    >
                      {t.status}
                    </span>
                    <span className="text-zinc-600 text-[10px] uppercase tracking-widest">
                      {formatDate(t.created_at)}
                    </span>
                  </div>

                  <p className="text-zinc-300 text-sm leading-relaxed flex items-start gap-2">
                    <MessageSquareText size={14} className="text-zinc-600 mt-0.5 shrink-0" />
                    <span>{t.content}</span>
                  </p>

                  {urls.video && (
                    <video
                      src={urls.video}
                      controls
                      playsInline
                      className="mt-1 w-full max-w-xs rounded-lg bg-black aspect-video"
                    />
                  )}

                  {err && <p className="text-red-500 text-[10px] font-bold uppercase">{err}</p>}
                </div>

                {/* Right: moderation controls */}
                <div className="flex md:flex-col gap-2 md:w-48 shrink-0">
                  <button
                    type="button"
                    disabled={!!actionInFlight}
                    onClick={() =>
                      runRowAction(
                        t.id,
                        'testimonials',
                        t.show_on_testimonials
                          ? () => removeFromTestimonials(t.id)
                          : () => sendToTestimonials(t.id)
                      )
                    }
                    className={`flex-1 h-10 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                      t.show_on_testimonials
                        ? 'bg-red-600 border-red-600 text-white hover:bg-red-500'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    {actionInFlight === 'testimonials' ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : (
                      <MessageSquareText size={13} />
                    )}
                    {t.show_on_testimonials ? 'On Testimonials' : 'Send to Testimonials'}
                  </button>

                  <button
                    type="button"
                    disabled={!!actionInFlight}
                    onClick={() =>
                      runRowAction(
                        t.id,
                        'website',
                        t.show_on_website ? () => removeFromWebsite(t.id) : () => sendToWebsite(t.id)
                      )
                    }
                    className={`flex-1 h-10 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                      t.show_on_website
                        ? 'bg-red-600 border-red-600 text-white hover:bg-red-500'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    {actionInFlight === 'website' ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : (
                      <Globe size={13} />
                    )}
                    {t.show_on_website ? 'On Website' : 'Send to Website'}
                  </button>

                  {t.status === 'rejected' ? (
                    <button
                      type="button"
                      disabled={!!actionInFlight}
                      onClick={() => runRowAction(t.id, 'reset', () => resetToPending(t.id))}
                      className="flex-1 h-9 rounded-lg text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      {actionInFlight === 'reset' ? (
                        <Loader2 className="animate-spin" size={13} />
                      ) : (
                        <RotateCcw size={13} />
                      )}
                      Reset to Pending
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!!actionInFlight}
                      onClick={() => runRowAction(t.id, 'reject', () => rejectTestimonial(t.id))}
                      className="flex-1 h-9 rounded-lg text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-red-500 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      {actionInFlight === 'reject' ? (
                        <Loader2 className="animate-spin" size={13} />
                      ) : (
                        <Ban size={13} />
                      )}
                      Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
