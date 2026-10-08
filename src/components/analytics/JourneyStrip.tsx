// ─────────────────────────────────────────────────────────────────────────────
// src/components/analytics/JourneyStrip.tsx
//
// Presentational ONLY. One journey = one horizontal strip, left → right:
//   [Video A] → [Video B] → [Video C]
// Takes already-ordered steps (from DiscoveredJourney.path.steps).
// Optional per-step Campaign Links (WebMood 2×2) light up when that video
// promotes a campaign link / campaign-element asset.
// Long journeys scroll horizontally; nodes never shrink.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';

export type JourneyStripStep = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  platform?: string | null;
  /**
   * Which campaign-link cells to light up for this video
   * (sales_call | consultation | newsletter | landing_page).
   * Empty / missing = promote nothing → all cells dim.
   */
  promotedTypes?: ReadonlySet<string> | string[];
};

export type JourneyEndKey = 'sales_call' | 'purchase' | 'consultation' | 'newsletter' | 'other';

export type JourneyStripEnd = {
  key: JourneyEndKey;
  label: string;
};

const WEBMOOD_CELLS: { type: string; label: string }[] = [
  { type: 'sales_call', label: 'SALES' },
  { type: 'consultation', label: 'CONSULT' },
  { type: 'newsletter', label: 'NEWS' },
  { type: 'landing_page', label: 'PURCHASE' },
];

function StepCampaignLinks({ types }: { types?: ReadonlySet<string> | string[] }) {
  const active =
    types instanceof Set
      ? types
      : new Set(Array.isArray(types) ? types : []);
  return (
    <div
      className="grid grid-cols-2 gap-px w-full mt-1.5 rounded overflow-hidden border border-zinc-800 bg-zinc-950"
      title="Campaign links this video promotes (orange = active)"
    >
      {WEBMOOD_CELLS.map((cell) => {
        const on = active.has(cell.type);
        return (
          <div
            key={cell.type}
            className={
              on
                ? 'flex items-center justify-center text-[6px] font-black tracking-wider text-orange-400 bg-orange-500/20 py-0.5'
                : 'flex items-center justify-center text-[6px] font-black tracking-wider text-zinc-600 bg-zinc-900/80 py-0.5'
            }
          >
            {cell.label}
          </div>
        );
      })}
    </div>
  );
}

export interface JourneyStripProps {
  steps: JourneyStripStep[];
  /** @deprecated Outcome end pills removed — use per-step promotedTypes instead. Kept optional for back-compat. */
  end?: JourneyStripEnd | null;
  /** Every step whose videoId matches is highlighted; the full journey stays visible. */
  highlightVideoId?: string | null;
  onSelectVideo?: (videoId: string) => void;
}

function Arrow() {
  return (
    <div className="flex items-center shrink-0 px-0.5 text-zinc-600" aria-hidden>
      <div className="w-3 h-px bg-zinc-700" />
      <ArrowRight size={11} className="-ml-0.5" />
    </div>
  );
}

export default function JourneyStrip({
  steps,
  end: _end,
  highlightVideoId,
  onSelectVideo,
}: JourneyStripProps) {
  // Outcome end pills intentionally unused — campaign links grid on each step replaces them.
  void _end;

  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [highlightVideoId, steps]);

  let firstHighlightAssigned = false;

  return (
    <div className="flex items-center overflow-x-auto custom-scrollbar py-1">
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
              className={`shrink-0 w-[112px] rounded-lg border p-1.5 transition-colors ${
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
                className="w-full h-[52px] object-cover rounded-md border border-zinc-800 bg-zinc-900"
                onError={(e) => {
                  const t = e.currentTarget;
                  t.onerror = null;
                  t.src = `https://placehold.co/112x52/18181b/52525b?text=${encodeURIComponent(
                    (step.platform ?? 'video').toUpperCase(),
                  )}`;
                }}
              />
              <div className="mt-1 text-[10px] font-bold truncate leading-snug text-zinc-200">
                {step.title}
              </div>
              <div className="text-[8px] font-black uppercase tracking-widest mt-0.5 text-zinc-600">
                Video
              </div>
              <StepCampaignLinks types={step.promotedTypes} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
