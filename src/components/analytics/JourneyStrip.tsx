// ─────────────────────────────────────────────────────────────────────────────
// src/components/analytics/JourneyStrip.tsx
// Presentational ONLY. One journey = one horizontal strip.
// Optional: asset border, asset-scope badge, content-owner line.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';

export type AssetScopeTag = 'my' | 'shared' | 'assigned';

export type JourneyStripStep = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  platform?: string | null;
  /** Campaign-link cells (sales_call | consultation | newsletter | landing_page). */
  promotedTypes?: ReadonlySet<string> | string[];
  /** True when this step is an Asset (has assets row). */
  isAsset?: boolean;
  /** Asset ownership scope — only meaningful when isAsset. */
  assetScope?: AssetScopeTag | null;
  /** Canonical content owner display name (videos.user_id → profiles). */
  contentOwnerName?: string | null;
};

export type JourneyEndKey = 'sales_call' | 'purchase' | 'consultation' | 'newsletter' | 'other';
export type JourneyStripEnd = { key: JourneyEndKey; label: string };

const WEBMOOD_CELLS: { type: string; label: string }[] = [
  { type: 'sales_call', label: 'SALES' },
  { type: 'consultation', label: 'CONSULT' },
  { type: 'newsletter', label: 'NEWS' },
  { type: 'landing_page', label: 'PURCHASE' },
];

/** Scope accent colors — distinct, VSTRK-toned status indicators (not decoration). */
export const ASSET_SCOPE_STYLE: Record<
  AssetScopeTag,
  { border: string; badge: string; label: string }
> = {
  my: {
    border: 'border-rose-500/70',
    badge: 'bg-rose-500/15 border-rose-500/40 text-rose-400',
    label: 'My',
  },
  shared: {
    border: 'border-violet-500/70',
    badge: 'bg-violet-500/15 border-violet-500/40 text-violet-400',
    label: 'Shared',
  },
  assigned: {
    border: 'border-cyan-500/70',
    badge: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400',
    label: 'Assigned',
  },
};

function StepCampaignLinks({ types }: { types?: ReadonlySet<string> | string[] }) {
  const active =
    types instanceof Set ? types : new Set(Array.isArray(types) ? types : []);
  return (
    <div
      className="grid grid-cols-2 gap-px w-full mt-1 rounded overflow-hidden border border-zinc-800 bg-zinc-950"
      title="Campaign links this video promotes"
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
  end?: JourneyStripEnd | null;
  highlightVideoId?: string | null;
  onSelectVideo?: (videoId: string) => void;
  /** When true, show content owner under each step title. */
  showContentOwner?: boolean;
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
  showContentOwner = false,
}: JourneyStripProps) {
  void _end;
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
  }, [highlightVideoId, steps]);

  let firstHighlightAssigned = false;

  return (
    <div className="flex items-center overflow-x-auto custom-scrollbar py-1">
      {steps.map((step, i) => {
        const highlighted = !!highlightVideoId && step.videoId === highlightVideoId;
        const assignRef = highlighted && !firstHighlightAssigned;
        if (assignRef) firstHighlightAssigned = true;

        const isAsset = !!step.isAsset;
        const scope = step.assetScope ?? null;
        const scopeStyle = scope ? ASSET_SCOPE_STYLE[scope] : null;

        // Selected ring stays independent of asset border.
        const borderClass = highlighted
          ? 'border-red-600 ring-2 ring-red-600/40 bg-red-600/10'
          : isAsset && scopeStyle
            ? `${scopeStyle.border} bg-zinc-950`
            : isAsset
              ? 'border-zinc-500 bg-zinc-950'
              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600';

        return (
          <React.Fragment key={`${step.videoId}-${i}`}>
            {i > 0 && <Arrow />}
            <div
              ref={assignRef ? highlightRef : undefined}
              onClick={() => onSelectVideo?.(step.videoId)}
              title={step.title}
              className={`shrink-0 w-[112px] rounded-lg border p-1.5 transition-colors ${
                onSelectVideo ? 'cursor-pointer' : ''
              } ${borderClass}`}
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
              <div className="flex items-center gap-1 mt-0.5 min-w-0">
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600 shrink-0">
                  {isAsset ? 'Asset' : 'Video'}
                </span>
                {isAsset && scopeStyle && (
                  <span
                    className={`shrink-0 inline-flex items-center px-1 py-px rounded border text-[7px] font-black uppercase tracking-widest ${scopeStyle.badge}`}
                  >
                    {scopeStyle.label}
                  </span>
                )}
              </div>
              {showContentOwner && step.contentOwnerName && (
                <div
                  className="mt-0.5 text-[8px] font-bold text-zinc-400 truncate"
                  title={step.contentOwnerName}
                >
                  {step.contentOwnerName}
                </div>
              )}
              <StepCampaignLinks types={step.promotedTypes} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
