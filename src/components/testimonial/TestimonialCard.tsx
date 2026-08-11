import React from 'react';
import { ImagePlus, MessageSquareText } from 'lucide-react';
import TestimonialStars from './TestimonialStars';
import type { PublicTestimonial } from '../../services/testimonial/publicTestimonials';

type Props = {
  testimonial: PublicTestimonial;
  /** Slightly denser layout for the website section */
  compact?: boolean;
};

export default function TestimonialCard({ testimonial: t, compact = false }: Props) {
  return (
    <article
      className={`bento-card flex flex-col h-full ${
        compact ? 'p-4 md:p-5' : 'p-5 md:p-6'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        {t.signedAvatarUrl ? (
          <img
            src={t.signedAvatarUrl}
            alt={`${t.name}'s avatar`}
            className="w-11 h-11 rounded-full object-cover border border-zinc-800 shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-zinc-950 border border-zinc-900 flex items-center justify-center text-zinc-600 shrink-0">
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

      <div className="mb-3">
        <TestimonialStars value={t.rating} readOnly size={compact ? 14 : 16} />
      </div>

      <p
        className={`text-zinc-300 leading-relaxed flex-1 flex items-start gap-2 ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        <MessageSquareText
          size={compact ? 12 : 14}
          className="text-zinc-600 mt-0.5 shrink-0"
        />
        <span>{t.content}</span>
      </p>

      {t.signedVideoUrl && (
        <video
          src={t.signedVideoUrl}
          controls
          playsInline
          className="mt-4 w-full rounded-lg bg-black aspect-video"
        />
      )}
    </article>
  );
}