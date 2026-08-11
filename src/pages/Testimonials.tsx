import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageSquareQuote } from 'lucide-react';
import TestimonialCard from '../components/testimonial/TestimonialCard';
import {
  fetchPublicTestimonials,
  type PublicTestimonial,
} from '../services/testimonial/publicTestimonials';

export default function Testimonials() {
  const [items, setItems] = useState<PublicTestimonial[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (pageIndex: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }

    try {
      const { items: next, hasMore: more } = await fetchPublicTestimonials(pageIndex);
      setItems((prev) => (append ? [...prev, ...next] : next));
      setHasMore(more);
      setPage(pageIndex);
    } catch (err: any) {
      setError(err?.message || 'Failed to load testimonials.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPage(0, false);
  }, [loadPage]);

  return (
    <div className="flex flex-col gap-8">
      <header className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-600/10 border border-red-600/30 mb-4">
          <MessageSquareQuote className="text-red-500" size={22} />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
          What people say about VS-Track
        </h1>
        <p className="text-zinc-500 text-sm mt-2">
          Real feedback from creators and teams using VS-Track.
        </p>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="text-red-600 animate-spin" size={32} />
        </div>
      )}

      {!loading && error && (
        <div className="bento-card p-6 text-center">
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <button
            type="button"
            onClick={() => loadPage(0, false)}
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="bento-card p-10 text-center text-zinc-500 text-sm">
          No public testimonials yet. Check back soon.
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {items.map((t) => (
              <TestimonialCard key={t.id} testimonial={t} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => loadPage(page + 1, true)}
                className="h-11 px-8 rounded-lg text-[10px] font-black uppercase tracking-widest border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:text-white hover:border-zinc-700 transition-all disabled:opacity-40 flex items-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Loading…
                  </>
                ) : (
                  'Load More'
                )}
              </button>
            </div>
          )}
        </>
      )}

      <footer className="text-center pt-4 border-t border-zinc-900/50">
        <p className="text-zinc-600 text-xs">
          Want to share your experience?{' '}
          <Link
            to="/dashboard"
            className="text-zinc-400 hover:text-white transition-colors underline underline-offset-2"
          >
            Sign in
          </Link>{' '}
          and leave a testimonial from the app.
        </p>
      </footer>
    </div>
  );
}