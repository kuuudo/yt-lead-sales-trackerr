// ─────────────────────────────────────────────────────────────────────────────
// chartScale.ts
// Pure, dependency-free helpers for adaptive chart scaling. No React, no data
// access, no analytics: presentation only. Values are NEVER modified; these
// helpers only decide where a value is drawn and how it is labelled.
// ─────────────────────────────────────────────────────────────────────────────

export type ScaleType = 'linear' | 'log';
export type ScaleMode = 'auto' | ScaleType;
export type MetricKind = 'currency' | 'count';

/** A nonzero bar is never drawn thinner than this (visual aid only). */
export const MIN_BAR_PX = 4;
/**
 * Log is recommended only when, on a linear axis, the smallest positive series
 * would be drawn thinner than the minimum visible size (same as MIN_BAR_PX).
 */
export const MIN_VISIBLE_PX = MIN_BAR_PX;

/** Finite number or null. Handles null / undefined / NaN / Infinity / strings. */
export function cleanValue(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function cleanAll(values: ReadonlyArray<unknown>): number[] {
  const out: number[] = [];
  for (const v of values) {
    const c = cleanValue(v);
    if (c !== null) out.push(c);
  }
  return out;
}

function minMax(vals: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of vals) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

// ── Ticks ───────────────────────────────────────────────────────────────────

function niceNum(x: number, round: boolean): number {
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

/** "Nice" linear ticks covering [min, max]. Returns the widened domain too. */
export function niceTicks(min: number, max: number, targetCount: number) {
  const count = Math.max(2, Math.floor(targetCount));
  if (!(max > min)) {
    max = min + 1;
  }
  const range = niceNum(max - min, false);
  const step = niceNum(range / (count - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin, i = 0; v <= niceMax + step / 2 && i < 200; v += step, i++) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return { ticks, niceMin: Number(niceMin.toPrecision(12)), niceMax: Number(niceMax.toPrecision(12)) };
}

// ── Axis model ──────────────────────────────────────────────────────────────

export interface AxisModel {
  /** The scale actually used (log falls back to linear if it is not valid). */
  type: ScaleType;
  domain: [number, number];
  ticks: number[];
  /** Maps a value to 0..1 along the axis. Zero/negative on log → 0 (floor). */
  toUnit: (v: number) => number;
  /** Log only: true when zeros are present and sit on the axis floor. */
  hasZeroFloor: boolean;
}

/**
 * Builds an axis from the CURRENTLY VISIBLE values.
 * - Linear: zero baseline, headroom above the max (and below a negative min).
 * - Log: only valid when no value is negative. Domain starts one decade below
 *   the smallest positive value so the smallest value is not on the floor.
 *   Zeros are drawn on the floor (never as a real log value).
 */
export function buildAxis(
  values: ReadonlyArray<unknown>,
  opts: { type: ScaleType; targetTicks: number },
): AxisModel {
  const vals = cleanAll(values);
  const hasNegative = vals.some((v) => v < 0);
  const positives = vals.filter((v) => v > 0);

  if (opts.type === 'log' && !hasNegative && positives.length > 0) {
    const [minP, maxP] = minMax(positives);
    const loExp = Math.floor(Math.log10(minP)) - 1;
    let hiExp = Math.ceil(Math.log10(maxP * 1.15));
    if (hiExp <= loExp + 1) hiExp = loExp + 2;
    const decades = hiExp - loExp;
    const maxTicks = Math.max(3, Math.floor(opts.targetTicks));
    const stepExp = Math.max(1, Math.ceil(decades / (maxTicks - 1)));
    const ticks: number[] = [];
    for (let e = loExp; e <= hiExp; e += stepExp) ticks.push(Math.pow(10, e));
    return {
      type: 'log',
      domain: [Math.pow(10, loExp), Math.pow(10, hiExp)],
      ticks,
      toUnit: (v) =>
        v > 0 ? Math.min(1, Math.max(0, (Math.log10(v) - loExp) / decades)) : 0,
      hasZeroFloor: vals.some((v) => v === 0),
    };
  }

  let min = 0;
  let max = 0;
  if (vals.length > 0) {
    const [lo, hi] = minMax(vals);
    min = Math.min(0, lo);
    max = Math.max(0, hi);
  }
  if (min === 0 && max === 0) max = 1;
  const span = max - min;
  if (max > 0) max += span * 0.06;
  if (min < 0) min -= span * 0.06;
  const { ticks, niceMin, niceMax } = niceTicks(min, max, opts.targetTicks);
  const size = niceMax - niceMin || 1;
  return {
    type: 'linear',
    domain: [niceMin, niceMax],
    ticks,
    toUnit: (v) => (v - niceMin) / size,
    hasZeroFloor: false,
  };
}

// ── Recommendation ──────────────────────────────────────────────────────────

export type ScaleReason = 'negative' | 'single' | 'comparable' | 'hidden';

export interface ScaleRecommendation {
  type: ScaleType;
  reason: ScaleReason;
  /** log10(largest peak / smallest positive peak). */
  spreadDecades: number;
  /** Index of a series >= 20x the next-largest one, else null. */
  dominantIndex: number | null;
  /** Height in px the smallest positive series would have on a LINEAR axis. */
  smallestLinearPx: number | null;
}

/**
 * Decides linear vs log from what the user would actually SEE.
 * `peaks` = one number per visible series (its largest value, or its total for
 * bar charts). Log is recommended only when, on a linear axis, the smallest
 * positive series would be drawn under MIN_VISIBLE_PX. Never with negatives.
 */
export function recommendScale(
  peaks: ReadonlyArray<unknown>,
  opts: { plotPx: number; hasNegative: boolean; minVisiblePx?: number },
): ScaleRecommendation {
  const minVis = opts.minVisiblePx ?? MIN_VISIBLE_PX;
  const pos = peaks
    .map((v, i) => ({ v: cleanValue(v), i }))
    .filter((x): x is { v: number; i: number } => x.v !== null && x.v > 0);

  const base = { spreadDecades: 0, dominantIndex: null as number | null, smallestLinearPx: null as number | null };
  if (opts.hasNegative) return { type: 'linear', reason: 'negative', ...base };
  if (pos.length < 2) return { type: 'linear', reason: 'single', ...base };

  const sorted = [...pos].sort((a, b) => b.v - a.v);
  const max = sorted[0].v;
  const min = sorted[sorted.length - 1].v;
  const smallestLinearPx = (min / max) * opts.plotPx;
  const spreadDecades = Math.log10(max / min);
  const dominantIndex = max / sorted[1].v >= 20 ? sorted[0].i : null;
  return {
    type: smallestLinearPx < minVis ? 'log' : 'linear',
    reason: smallestLinearPx < minVis ? 'hidden' : 'comparable',
    spreadDecades,
    dominantIndex,
    smallestLinearPx,
  };
}

export function resolveScale(mode: ScaleMode, rec: ScaleRecommendation): { type: ScaleType; auto: boolean } {
  return mode === 'auto' ? { type: rec.type, auto: true } : { type: mode, auto: false };
}

// ── Small-value visibility ──────────────────────────────────────────────────

/**
 * Pixel length for a bar. A positive value is never drawn shorter than minPx;
 * `inflated` tells the UI to mark the bar so it is not mistaken for true size.
 */
export function barLength(unit: number, isPositive: boolean, trackPx: number, minPx = MIN_BAR_PX) {
  if (!isPositive) return { px: 0, inflated: false };
  const raw = Math.max(0, unit) * trackPx;
  return { px: Math.max(raw, minPx), inflated: raw < minPx };
}

// ── Formatting ──────────────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', options);
    fmtCache.set(key, f);
  }
  return f;
}

/** Axis labels: $1K, $1.5M, $100M, 12K ... */
export function formatCompact(v: number, kind: MetricKind, currency = 'USD'): string {
  return kind === 'currency'
    ? nf(`cc-${currency}`, { style: 'currency', currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v)
    : nf('nc', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

/** Tooltips / value labels: the exact original value, never abbreviated. */
export function formatExact(v: number, kind: MetricKind, currency = 'USD'): string {
  return kind === 'currency'
    ? nf(`ce-${currency}`, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
    : nf(Number.isInteger(v) ? 'ne0' : 'ne2', { maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);
}

/** Up to `max` evenly spaced indices from 0..n-1 (always includes both ends). */
export function pickEvenly(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n <= max || max < 2) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < max; i++) out.add(Math.round((i * (n - 1)) / (max - 1)));
  return [...out];
}
