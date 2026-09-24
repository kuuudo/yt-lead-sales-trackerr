// ─────────────────────────────────────────────────────────────────────────────
// src/components/analytics/DownstreamPreview.tsx
//
// The "Downstream" table cell for one analytics row (AnalyticsTest today,
// AllAssetsAnalytics later — it only needs { videoId, assetId }).
//
// Interaction
//   Desktop (hover-capable pointer):
//     hover  → compact preview opens
//     click  → pins it open (click again to unpin)
//     click outside / Escape / close button → dismiss
//   Mobile / touch (no hover):
//     tap → preview opens (bottom sheet)
//     tap outside / Escape / close button → dismiss
//
// Data is loaded lazily on first open (lib/downstreamForRow.ts) and cached.
// The popover is portaled to <body> with fixed positioning so the table's
// overflow-x scroll container and sticky column can't clip it.
//
// React synthetic events bubble through portals to React ancestors, so the
// button AND the popover stop click propagation — otherwise interacting with
// them would toggle the parent <tr>'s row selection.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Loader2, X } from 'lucide-react';
import {
  edgeKey,
  loadDownstreamForRow,
  type DownstreamResult,
} from '../../lib/downstreamForRow';

type Mode = 'closed' | 'hover' | 'pinned';
type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: DownstreamResult };

const HOVER_QUERY = '(hover: hover) and (pointer: fine)';
const HOVER_CLOSE_DELAY_MS = 150;

function useCanHover(): boolean {
  const [canHover, setCanHover] = useState<boolean>(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(HOVER_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(HOVER_QUERY);
    const onChange = () => setCanHover(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return canHover;
}

type Pos = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

function ArrowWithCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-zinc-500 shrink-0">
      <ArrowRight size={12} />
      <span className="text-[9px] font-black tabular-nums text-zinc-400">×{count}</span>
    </span>
  );
}

function PreviewBody({ state }: { state: LoadState }) {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-zinc-500">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-[10px] font-black uppercase tracking-widest">Loading downstream…</span>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="py-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-red-500">
          Could not load downstream
        </div>
        <div className="text-[10px] text-zinc-500 mt-1 break-words">{state.message}</div>
      </div>
    );
  }

  const r = state.result;
  if (r.paths.length === 0) {
    return (
      <div className="py-4 text-[10px] font-black uppercase tracking-widest text-zinc-600">
        No observed downstream for this row yet
        {r.excludedJourneys > 0 && (
          <div className="mt-1 normal-case tracking-normal font-medium text-zinc-600">
            {r.excludedJourneys} matched journey(s) no longer include this step in their latest snapshot.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {r.paths.map((path) => {
        const lastStep = path.steps[path.steps.length - 1];
        const end = path.endNodeId ? r.endNodes[path.endNodeId] : null;
        return (
          <div
            key={path.key}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-lg border border-zinc-900 bg-black/40 p-2"
          >
            {path.steps.map((step, i) => (
              <React.Fragment key={`${step.videoId}-${i}`}>
                {i > 0 && (
                  <ArrowWithCount
                    count={r.edgeCounts[edgeKey(path.steps[i - 1].videoId, step.videoId)] ?? 1}
                  />
                )}
                <span
                  title={step.title}
                  className={`max-w-[150px] truncate px-2 py-1 rounded-md border text-[10px] font-bold ${
                    i === 0
                      ? 'border-red-600/50 bg-red-600/10 text-white'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                  }`}
                >
                  {step.title}
                </span>
              </React.Fragment>
            ))}
            {end && (
              <>
                <ArrowWithCount count={r.endEdgeCounts[edgeKey(lastStep.videoId, end.id)] ?? 1} />
                <span
                  title={`${end.label} — end of observed path`}
                  className="px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] font-bold"
                >
                  {end.label}
                </span>
              </>
            )}
          </div>
        );
      })}

      <div className="text-[9px] text-zinc-600 leading-relaxed">
        Numbers count observed transitions across {r.journeyTotal} journey
        {r.journeyTotal === 1 ? '' : 's'} (all time). The highlighted step is this row.
        {r.truncated && ' Showing the most recent journeys only.'}
        {r.excludedJourneys > 0 &&
          ` ${r.excludedJourneys} matched journey(s) omitted (latest snapshot no longer includes this step).`}
        {r.endResolutionFailed && ' End-of-path destinations could not be resolved.'}
      </div>
    </div>
  );
}

export interface DownstreamPreviewProps {
  videoId: string;
  assetId: string;
}

export default function DownstreamPreview({ videoId, assetId }: DownstreamPreviewProps) {
  const canHover = useCanHover();
  const [mode, setMode] = useState<Mode>('closed');
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [pos, setPos] = useState<Pos | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestedRef = useRef(false);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const ensureLoaded = useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    setState({ status: 'loading' });
    loadDownstreamForRow(videoId, assetId)
      .then((result) => setState({ status: 'ready', result }))
      .catch((err: any) => {
        requestedRef.current = false; // allow retry on next open
        setState({ status: 'error', message: err?.message ?? String(err) });
      });
  }, [videoId, assetId]);

  // A different row identity (table reload) → forget any previous load.
  useEffect(() => {
    requestedRef.current = false;
    setState({ status: 'idle' });
    setMode('closed');
  }, [videoId, assetId]);

  useEffect(() => () => clearCloseTimer(), []);

  const close = useCallback(() => {
    clearCloseTimer();
    setMode('closed');
  }, []);

  // Desktop positioning (fixed, clamped to viewport, flips above if needed).
  const reposition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(440, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const below = spaceBelow >= 240 || spaceBelow >= spaceAbove;
    setPos({
      left,
      width,
      top: below ? r.bottom + 6 : undefined,
      bottom: below ? undefined : window.innerHeight - r.top + 6,
      maxHeight: Math.max(160, Math.min(480, below ? spaceBelow : spaceAbove)),
    });
  }, []);

  useLayoutEffect(() => {
    if (mode === 'closed' || !canHover) return;
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [mode, canHover, reposition]);

  // Click outside / Escape → dismiss (works for hover-open and pinned).
  useEffect(() => {
    if (mode === 'closed') return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (btnRef.current?.contains(t) || popRef.current?.contains(t))) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mode, close]);

  const onEnter = () => {
    if (!canHover) return;
    clearCloseTimer();
    setMode((m) => (m === 'closed' ? 'hover' : m));
    ensureLoaded();
  };

  const onLeave = () => {
    if (!canHover) return;
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      setMode((m) => (m === 'hover' ? 'closed' : m));
    }, HOVER_CLOSE_DELAY_MS);
  };

  const onButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't toggle the parent <tr> selection
    clearCloseTimer();
    ensureLoaded();
    setMode((m) => {
      if (canHover) return m === 'pinned' ? 'closed' : 'pinned';
      return m === 'closed' ? 'pinned' : 'closed';
    });
  };

  const pathCount = state.status === 'ready' ? state.result.paths.length : null;
  const label = pathCount && pathCount > 1 ? `Downstream (${pathCount})` : 'Downstream';

  const header = (
    <div className="flex items-center justify-between gap-3 mb-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
        Downstream{mode === 'pinned' || !canHover ? '' : ' · click to keep open'}
      </div>
      {(mode === 'pinned' || !canHover) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          aria-label="Close"
          className="text-zinc-500 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );

  const popoverInner = (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Downstream preview"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={canHover ? clearCloseTimer : undefined}
      onMouseLeave={canHover ? onLeave : undefined}
      className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl text-white overflow-y-auto"
      style={
        canHover
          ? {
              position: 'fixed',
              zIndex: 10000,
              left: pos?.left ?? 8,
              width: pos?.width ?? 440,
              top: pos?.top,
              bottom: pos?.bottom,
              maxHeight: pos?.maxHeight ?? 400,
            }
          : {
              position: 'fixed',
              zIndex: 10000,
              left: 8,
              right: 8,
              bottom: 8,
              maxHeight: '75vh',
            }
      }
    >
      {header}
      <PreviewBody state={state} />
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onButtonClick}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        aria-haspopup="dialog"
        aria-expanded={mode !== 'closed'}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
          mode === 'pinned'
            ? 'border-red-600 text-white bg-red-600/10'
            : 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600'
        }`}
      >
        {label}
      </button>

      {mode !== 'closed' &&
        typeof document !== 'undefined' &&
        createPortal(
          canHover ? (
            popoverInner
          ) : (
            <>
              <div
                className="fixed inset-0 z-[9999] bg-black/50"
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                }}
              />
              {popoverInner}
            </>
          ),
          document.body,
        )}
    </>
  );
}
