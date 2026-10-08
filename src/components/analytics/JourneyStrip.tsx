// ─────────────────────────────────────────────────────────────────────────────
// src/components/analytics/JourneyStrip.tsx
//
// Presentational ONLY. One journey = one horizontal strip, left → right:
//   [Video A] → [Video B] → [Video C] → [outcome]
// Takes already-ordered steps (from DiscoveredJourney.path.steps) and an
// optional resolved outcome. No data fetching, no attribution, no merging.
// Long journeys scroll horizontally inside the strip; nodes never shrink.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';

export type JourneyStripStep = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  platform?: string | null;
};

export type JourneyEndKey = 'sales_call' | 'purchase' | 'consultation' | 'newsletter' | 'other';

export type JourneyStripEnd = {
  key: JourneyEndKey;
  label: string;
};

// Same accent colors CampaignJourneyMap uses for its four outcomes.
const END_STYLE: Record<JourneyEndKey, { color: string; icon: string }> = {
  sales_call: { color: '#6366f1', icon: '📞' },
  purchase: { color: '#ea580c', icon: '💰' },
  consultation: { color: '#10b981', icon: '🗓️' },
  newsletter: { color: '#0ea5e9', icon: '✉️' },
  other: { color: '#a1a1aa', icon: '●' },
};

export interface JourneyStripProps {
  steps: JourneyStripStep[];
  end?: JourneyStripEnd | null;
  /** Every step whose videoId matches is highlighted; the full journey stays visible. */
  highlightVideoId?: string | null;
  onSelectVideo?: (videoId: string) => void;
}

function Arrow() {
  return (
    <div className="flex items-center shrink-0 px-1 text-zinc-600" aria-hidden>
      <div className="w-5 h-px bg-zinc-700" />
      <ArrowRight size={14} className="-ml-1" />
    </div>
  );
}

export default function JourneyStrip({ steps, end, highlightVideoId, onSelectVideo }: JourneyStripProps) {
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Long journey: bring the highlighted step into view inside THIS strip only
  // (block: 'nearest' so the page itself never jumps).
  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [highlightVideoId, steps]);

  let firstHighlightAssigned = false;

  return (
    <div className="flex items-center overflow-x-auto custom-scrollbar py-2">
      {steps.map((step, i) => {
        const highlighted = !!highlightVideoId && step.videoId === highlightVideoId;
        const assignRef = highlighted && !firstHighlightAssigned;
        if (assignRef) firstHighlightAssigned = true;
        return (
          <React.Fragment key={`${step.videoId}-${i}`}>
            {i > 0 && <Arrow />}
            <div
              ref={assignRef ? highlightRef : undefined}
              onClick={() => onSelectVideo?.(step.videoId)}
              title={step.title}
              className={`shrink-0 w-[168px] rounded-xl border p-2 transition-colors ${
                onSelectVideo ? 'cursor-pointer' : ''
              } ${
                highlighted
                  ? 'border-red-600 bg-red-600/10 ring-2 ring-red-600/40'
                  : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
              }`}
            >
              <img
                src={step.thumbnailUrl ?? ''}
                alt=""
                className="w-full h-[84px] object-cover rounded-lg border border-zinc-800 bg-zinc-900"
                onError={(e) => {
                  const t = e.currentTarget;
                  t.onerror = null;
                  t.src = `https://placehold.co/160x90/18181b/52525b?text=${encodeURIComponent(
                    (step.platform ?? 'video').toUpperCase(),
                  )}`;
                }}
              />
              <div className="mt-2 text-xs font-bold truncate leading-snug text-zinc-200">{step.title}</div>
              <div className="text-[9px] font-black uppercase tracking-widest mt-0.5 text-zinc-600">Video</div>
            </div>
          </React.Fragment>
        );
      })}

      {end && (
        <>
          <Arrow />
          <div
            title={`${end.label} — end of observed path`}
            className="shrink-0 w-[132px] rounded-xl border p-3 flex flex-col items-center justify-center text-center"
            style={{
              borderColor: `${END_STYLE[end.key].color}66`,
              background: `${END_STYLE[end.key].color}14`,
              minHeight: 118,
            }}
          >
            <div className="text-2xl leading-none">{END_STYLE[end.key].icon}</div>
            <div
              className="mt-2 text-[10px] font-black uppercase tracking-widest"
              style={{ color: END_STYLE[end.key].color }}
            >
              {end.label}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
