// ─────────────────────────────────────────────────────────────────────────────
// PartnerChart.tsx
// Presentation-only chart for Partner Analytics. Dependency-free SVG/HTML so it
// does not compete with whatever chart library the app already uses.
//   view="trend"  : one line/area per selected partner over time
//   view="totals" : one horizontal bar per selected partner (range total)
// All scaling decisions live in lib/chartScale.ts. Values are never altered;
// tooltips and value labels always show the exact original number.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  barLength,
  buildAxis,
  cleanValue,
  formatCompact,
  formatExact,
  pickEvenly,
  recommendScale,
  resolveScale,
  type MetricKind,
  type ScaleMode,
} from '../../lib/chartScale';

export type ChartSeries = {
  id: string;
  name: string;
  color: string;
  values: (number | null)[];
  /** Range total (used by the totals view). null = not available. */
  total: number | null;
};

export type ChartText = {
  empty: string;
  noData: string;
  linearBadge: string;
  logBadge: string;
  autoSuffix: string;
  logNote: string;
  zeroNote: string;
  hatchNote: string;
  forcedLinearHint: string; // {name}
  logUnavailable: string;
  noValue: string;
};

export type PartnerChartProps = {
  view: 'trend' | 'totals';
  metric: MetricKind;
  labels: string[];
  fullLabels: string[];
  series: ChartSeries[];
  scaleMode: ScaleMode;
  height?: number;
  /** Width used before the first measurement (and for server rendering). */
  initialWidth?: number;
  text: ChartText;
};

const M_TOP = 12;
const M_BOTTOM = 28;
const M_RIGHT = 16;

function useElementWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function peakOf(values: (number | null)[]): number | null {
  let p: number | null = null;
  for (const v of values) {
    const c = cleanValue(v);
    if (c !== null && (p === null || c > p)) p = c;
  }
  return p;
}

/** Splits a series into runs of consecutive non-null points (null = gap). */
function runs(values: (number | null)[]): Array<Array<{ i: number; v: number }>> {
  const out: Array<Array<{ i: number; v: number }>> = [];
  let cur: Array<{ i: number; v: number }> = [];
  values.forEach((raw, i) => {
    const v = cleanValue(raw);
    if (v === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push({ i, v });
  });
  if (cur.length) out.push(cur);
  return out;
}

export default function PartnerChart({
  view,
  metric,
  labels,
  fullLabels,
  series,
  scaleMode,
  height = 280,
  initialWidth = 800,
  text,
}: PartnerChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(initialWidth);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const narrow = width < 520;
  const plotH = Math.max(80, height - M_TOP - M_BOTTOM);
  const trackPx = Math.max(80, width - (narrow ? 224 : 300));
  const plotPx = view === 'trend' ? plotH : trackPx;

  // Scale is derived ONLY from the currently visible (selected) series.
  const model = useMemo(() => {
    const allVals: Array<number | null> =
      view === 'trend' ? series.flatMap((s) => s.values) : series.map((s) => s.total);
    const peaks = view === 'trend' ? series.map((s) => peakOf(s.values)) : series.map((s) => s.total);
    const hasNegative = allVals.some((v) => {
      const c = cleanValue(v);
      return c !== null && c < 0;
    });
    const hasData = allVals.some((v) => cleanValue(v) !== null);
    const rec = recommendScale(peaks, { plotPx, hasNegative });
    const resolved = resolveScale(scaleMode, rec);
    const targetTicks =
      view === 'trend'
        ? Math.min(8, Math.max(3, Math.floor(plotH / 44) + 1))
        : Math.min(6, Math.max(3, Math.floor(trackPx / 90) + 1));
    const axis = buildAxis(allVals, { type: resolved.type, targetTicks });
    return { rec, resolved, axis, hasData, hasNegative };
  }, [series, view, plotPx, plotH, trackPx, scaleMode]);

  const { rec, resolved, axis, hasData, hasNegative } = model;

  if (series.length === 0 || !hasData) {
    return (
      <div
        ref={ref}
        className="flex items-center justify-center text-center px-6 text-[10px] font-bold uppercase tracking-widest text-zinc-600 border border-dashed border-zinc-900 rounded-xl"
        style={{ height }}
      >
        {series.length === 0 ? text.empty : text.noData}
      </div>
    );
  }

  // ── Scale disclosure (always visible) ─────────────────────────────────────
  const notes: string[] = [];
  if (axis.type === 'log') notes.push(text.logNote);
  if (axis.type === 'log' && axis.hasZeroFloor) notes.push(text.zeroNote);
  if (scaleMode === 'log' && hasNegative) notes.push(text.logUnavailable);
  if (scaleMode === 'linear' && rec.type === 'log' && !hasNegative) {
    const dom = rec.dominantIndex !== null ? series[rec.dominantIndex]?.name : series[0]?.name;
    notes.push(text.forcedLinearHint.replace('{name}', dom ?? ''));
  }

  const tickLabels = axis.ticks.map((t) => formatCompact(t, metric));

  let body: React.ReactNode;
  let anyInflated = false;

  if (view === 'totals') {
    body = (
      <div role="img" aria-label="Totals by partner">
        {series.map((s) => {
          const total = cleanValue(s.total);
          const positive = total !== null && total > 0;
          const unit = total !== null ? axis.toUnit(total) : 0;
          const bar = barLength(unit, positive, trackPx);
          if (bar.inflated) anyInflated = true;
          const exact = total === null ? text.noValue : formatExact(total, metric);
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 h-10 group"
              title={`${s.name}: ${exact}`}
            >
              <div className="w-28 sm:w-36 shrink-0 flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="text-xs font-bold text-zinc-300 truncate">{s.name}</span>
              </div>
              <div className="relative flex-1 h-full flex items-center">
                {axis.ticks.map((t, i) => (
                  <span
                    key={i}
                    className="absolute top-0 bottom-0 w-px bg-zinc-900"
                    style={{ left: `${axis.toUnit(t) * 100}%` }}
                  />
                ))}
                {bar.px > 0 && (
                  <span
                    className="relative h-5 rounded-sm group-hover:brightness-125 transition"
                    style={{
                      width: `max(${unit * 100}%, 4px)`,
                      background: bar.inflated
                        ? `repeating-linear-gradient(45deg, ${s.color}, ${s.color} 2px, transparent 2px, transparent 4px)`
                        : s.color,
                      outline: bar.inflated ? `1px dashed ${s.color}` : undefined,
                      outlineOffset: bar.inflated ? 1 : undefined,
                    }}
                  />
                )}
              </div>
              <div className="w-28 sm:w-40 shrink-0 text-right text-[10px] sm:text-xs font-bold text-zinc-300 tabular-nums">
                {exact}
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-3 h-6 mt-1">
          <div className="w-28 sm:w-36 shrink-0" />
          <div className="relative flex-1 h-full">
            {axis.ticks.map((t, i) => (
              <span
                key={i}
                className="absolute top-0 text-[9px] font-bold text-zinc-600 -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${axis.toUnit(t) * 100}%` }}
              >
                {tickLabels[i]}
              </span>
            ))}
          </div>
          <div className="w-28 sm:w-40 shrink-0" />
        </div>
      </div>
    );
  } else {
    const n = labels.length;
    const left = Math.max(44, Math.max(...tickLabels.map((l) => l.length)) * 6.6 + 14);
    const plotW = Math.max(40, width - left - M_RIGHT);
    const xAt = (i: number) => (n <= 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW);
    const yAt = (v: number) => M_TOP + plotH * (1 - axis.toUnit(v));
    const baseY = axis.type === 'log' ? M_TOP + plotH : yAt(0);
    const xTicks = pickEvenly(n, Math.max(2, Math.floor(plotW / 72)));

    const hover = hoverIdx !== null && hoverIdx < n ? hoverIdx : null;
    const tipRows =
      hover === null
        ? []
        : series
            .map((s) => ({ s, v: cleanValue(s.values[hover]) }))
            .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
    const tipLeft =
      hover === null ? 0 : xAt(hover) + 200 > width ? Math.max(0, xAt(hover) - 204) : xAt(hover) + 12;

    body = (
      <div className="relative">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Trend by partner"
          className="block max-w-full"
        >
          {axis.ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={left}
                x2={left + plotW}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke={t === 0 && axis.type === 'linear' ? '#52525b' : '#18181b'}
                strokeWidth={1}
              />
              <text x={left - 8} y={yAt(t) + 3} textAnchor="end" fontSize={10} fill="#71717a" fontWeight={700}>
                {tickLabels[i]}
              </text>
            </g>
          ))}
          {xTicks.map((i, k) => (
            <text
              key={i}
              x={xAt(i)}
              y={height - 8}
              textAnchor={n > 1 && k === 0 ? 'start' : n > 1 && k === xTicks.length - 1 ? 'end' : 'middle'}
              fontSize={10}
              fill="#71717a"
              fontWeight={700}
            >
              {labels[i]}
            </text>
          ))}
          {series.map((s) =>
            runs(s.values).map((run, ri) => {
              if (run.length === 1) {
                return <circle key={`${s.id}-${ri}`} cx={xAt(run[0].i)} cy={yAt(run[0].v)} r={3} fill={s.color} />;
              }
              const pts = run.map((p) => `${xAt(p.i)},${yAt(p.v)}`);
              const line = `M${pts.join(' L')}`;
              const area = `${line} L${xAt(run[run.length - 1].i)},${baseY} L${xAt(run[0].i)},${baseY} Z`;
              return (
                <g key={`${s.id}-${ri}`}>
                  <path d={area} fill={s.color} fillOpacity={0.1} />
                  <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {run.length <= 15 &&
                    run.map((p) => <circle key={p.i} cx={xAt(p.i)} cy={yAt(p.v)} r={2.5} fill={s.color} />)}
                </g>
              );
            }),
          )}
          {hover !== null && (
            <>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={M_TOP} y2={M_TOP + plotH} stroke="#52525b" strokeWidth={1} />
              {series.map((s) => {
                const v = cleanValue(s.values[hover]);
                return v === null ? null : (
                  <circle key={s.id} cx={xAt(hover)} cy={yAt(v)} r={4} fill={s.color} stroke="#09090b" strokeWidth={1.5} />
                );
              })}
            </>
          )}
          <rect
            x={left}
            y={M_TOP}
            width={plotW}
            height={plotH}
            fill="transparent"
            style={{ touchAction: 'pan-y' }}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const f = r.width > 0 ? (e.clientX - r.left) / r.width : 0;
              setHoverIdx(n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(f * (n - 1)))));
            }}
            onPointerLeave={() => setHoverIdx(null)}
          />
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 w-48 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl p-3"
            style={{ left: tipLeft, top: 8 }}
          >
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">
              {fullLabels[hover] ?? labels[hover]}
            </div>
            {tipRows.map(({ s, v }) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-[11px] leading-5">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="truncate text-zinc-400">{s.name}</span>
                </span>
                <span className="font-bold text-white tabular-nums">
                  {v === null ? text.noValue : formatExact(v, metric)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === 'totals' && anyInflated) notes.push(text.hatchNote);

  return (
    <div ref={ref} className="w-full min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <span
          className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${
            axis.type === 'log'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
          }`}
        >
          {axis.type === 'log' ? text.logBadge : text.linearBadge}
          {resolved.auto ? ` · ${text.autoSuffix}` : ''}
        </span>
        {notes.map((n, i) => (
          <span key={i} className="text-[10px] font-bold text-zinc-600">
            {n}
          </span>
        ))}
      </div>
      {body}
    </div>
  );
}
