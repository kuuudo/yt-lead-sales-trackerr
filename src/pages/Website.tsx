import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import TestimonialCard from '../components/testimonial/TestimonialCard';
import {
  fetchWebsiteTestimonials,
  type PublicTestimonial,
} from '../services/testimonial/publicTestimonials';

/**
 * Clean VSTRK landing-page skeleton.
 * Full marketing sections come later; this only wires the reusable
 * testimonial strip (show_on_website = true).
 */
export default function Website() {
  const [items, setItems] = useState<PublicTestimonial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchWebsiteTestimonials(6);
        if (!cancelled) setItems(rows);
      } catch {
        // Silent fail for skeleton — landing can still render
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-16 pb-8">
      {/* Hero placeholder — replace with real landing copy later */}
      <section className="text-center max-w-3xl mx-auto pt-4">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-2 h-2 bg-red-600 rounded-sm shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
          <span className="text-sm font-black uppercase tracking-[0.2em] text-white">
            VS-Track
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
          Track what actually converts
        </h1>
        <p className="text-zinc-500 text-sm md:text-base mt-3 max-w-xl mx-auto">
          Landing page skeleton. Add product sections, pricing, and CTAs in a later phase.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="h-10 px-5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-red-600 text-white hover:bg-red-500 transition-colors flex items-center"
          >
            Get started
          </Link>
          <Link
            to="/testimonials"
            className="h-10 px-5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all flex items-center"
          >
            See testimonials
          </Link>
        </div>
      </section>

      {/* Reusable testimonial section */}
      <section className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-lg font-bold text-white">Loved by creators</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Selected feedback from the VS-Track community.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="text-red-600 animate-spin" size={28} />
          </div>
        )}

        {!loading && items.length === 0 && (
          <p className="text-center text-zinc-600 text-sm py-8">
            No website testimonials selected yet.
          </p>
        )}

        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((t) => (
              <TestimonialCard key={t.id} testimonial={t} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}