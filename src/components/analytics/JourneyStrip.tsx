// ─────────────────────────────────────────────────────────────────────────────
// src/components/analytics/JourneyStrip.tsx
// Presentational ONLY. One journey = one horizontal strip.
// Optional: asset border, asset-scope badge, content-owner line.
// Campaign element nodes (optional) are presentation-only under each video tile.
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

/** Presentation-only: a campaign element linked from a video (not an observed path step). */
export type CampaignElementNode = {
  /** Stable key (redirect link id or element type). */
  id: string;
  /** sales_call | consultation | newsletter | landing_page */
  elementType: string;
  /** Display label, e.g. Sales Call */
  label: string;
  /** MY / SHARED when asset org is known; omit badge when unknown. */
  assetScope?: AssetScopeTag | null;
};

export type JourneyEndKey = 'sales_call' | 'purchase' | 'consultation' | 'newsletter' | 'other';
export type JourneyStripEnd = { key: JourneyEndKey; label: string };

const WEBMOOD_CELLS: { type: string; label: string }[] = [
  { type: 'sales_call', label: 'SALES' },
  { type: 'consultation', label: 'CONSULT' },
  { type: 'newsletter', label: 'NEWS' },
  { type: 'landing_page', label: 'PURCHASE' },
];

const ELEMENT_NODE_LABEL: Record<string, string> = {
  sales_call: 'Sales Call',
  consultation: 'Consult',
  newsletter: 'News',
  landing_page: 'Purchase',
};

/** Public helper so loaders can reuse the same labels as the strip. */
export function campaignElementNodeLabel(elementType: string): string {
  return ELEMENT_NODE_LABEL[elementType] ?? elementType.replace(/_/g, ' ');
}

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
  /**
   * Optional. One label per gap between adjacent steps (index i = gap between
   * step i and step i + 1). When absent, connectors render exactly as before.
   * text '—' = unresolved, '0' = resolved with no events, '…' = loading.
   */
  connectorLabels?: ReadonlyArray<JourneyConnectorLabel> | null;
  /**
   * Presentation-only. Campaign element nodes keyed by source video id.
   * Drawn under each video tile; never part of path.steps or connector gaps.
   * When absent or empty, markup matches the previous strip exactly.
   */
  elementNodesByVideo?: ReadonlyMap<string, ReadonlyArray<CampaignElementNode>> | null;
}

export type JourneyConnectorLabel = { text: string; title?: string };

function Arrow({ label }: { label?: JourneyConnectorLabel }) {
  if (!label) {
    return (
      <div className="flex items-center shrink-0 px-0.5 text-zinc-600" aria-hidden>
        <div className="w-3 h-px bg-zinc-700" />
        <ArrowRight size={11} className="-ml-0.5" />
      </div>
    );
  }
  const muted = label.text === '—' || label.text === '…';
  return (
    <div
      className="flex flex-col items-center justify-center shrink-0 px-1 min-w-[34px] text-zinc-600"
      title={label.title || undefined}
    >
      <span
        className={`text-[9px] font-black tabular-nums leading-none mb-0.5 ${
          muted ? 'text-zinc-600' : 'text-orange-400'
        }`}
      >
        {muted ? label.text : `×${label.text}`}
      </span>
      <div className="flex items-center" aria-hidden>
        <div className="w-3 h-px bg-zinc-700" />
        <ArrowRight size={11} className="-ml-0.5" />
      </div>
    </div>
  );
}

function ElementNodeCard({ node }: { node: CampaignElementNode }) {
  const scopeStyle = node.assetScope ? ASSET_SCOPE_STYLE[node.assetScope] : null;
  return (
    <div
      className="w-full rounded-md border border-dashed border-zinc-600 bg-zinc-950/90 px-1.5 py-1"
      title={`Linked campaign element · ${node.label}`}
      // Not clickable — presentation only; must not trigger video selection.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[8px] font-black uppercase tracking-widest text-orange-400/90 truncate leading-tight">
        {node.label}
      </div>
      <div className="flex items-center gap-1 mt-0.5 min-w-0">
        <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600 shrink-0">
          Element
        </span>
        {scopeStyle && (
          <span
            className={`shrink-0 inline-flex items-center px-1 py-px rounded border text-[7px] font-black uppercase tracking-widest ${scopeStyle.badge}`}
          >
            {scopeStyle.label}
          </span>
        )}
      </div>
    </div>
  );
}

export default function JourneyStrip({
  steps,
  end: _end,
  highlightVideoId,
  onSelectVideo,
  showContentOwner = false,
  connectorLabels,
  elementNodesByVideo,
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
        const elementNodes = elementNodesByVideo?.get(step.videoId) ?? [];

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
            {i > 0 && <Arrow label={connectorLabels?.[i - 1]} />}
            {/* Column: video tile + optional element nodes. Nodes sit outside
                the clickable tile so they never set selectedVideoId. */}
            <div className="shrink-0 flex flex-col items-stretch w-[112px]">
              <div
                ref={assignRef ? highlightRef : undefined}
                onClick={() => onSelectVideo?.(step.videoId)}
                title={step.title}
                className={`w-full rounded-lg border p-1.5 transition-colors ${
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
              {elementNodes.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  <div className="mx-auto w-px h-2 border-l border-dashed border-zinc-600" aria-hidden />
                  {elementNodes.map((node) => (
                    <ElementNodeCard key={node.id} node={node} />
                  ))}
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
