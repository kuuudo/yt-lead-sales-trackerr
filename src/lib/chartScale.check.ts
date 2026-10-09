// Run: npx tsx src/lib/chartScale.check.ts
import assert from 'node:assert/strict';
import {
  barLength, buildAxis, formatCompact, formatExact, pickEvenly,
  recommendScale, resolveScale, MIN_BAR_PX,
} from './chartScale';

let pass = 0;
const ok = (name: string, fn: () => void) => { fn(); pass++; console.log('PASS', name); };
const PLOT = 220;                        // trend plot height used by the page
const finite = (a: ReadonlyArray<number>) => a.every(Number.isFinite);
const axisFor = (vals: any[], type: 'linear' | 'log' = 'linear') => buildAxis(vals, { type, targetTicks: 6 });
const recFor = (peaks: any[]) =>
  recommendScale(peaks, { plotPx: PLOT, hasNegative: peaks.some((p) => typeof p === 'number' && p < 0) });

ok('A small values 0,1,2,5,10', () => {
  const v = [0, 1, 2, 5, 10];
  const ax = axisFor(v);
  assert.equal(ax.type, 'linear');
  assert.equal(ax.ticks[0], 0);
  assert.ok(ax.domain[1] > 10, 'headroom above max');
  assert.ok(finite(ax.ticks));
  assert.ok(barLength(ax.toUnit(1), true, 400).px >= MIN_BAR_PX);
  assert.equal(barLength(ax.toUnit(0), false, 400).px, 0);
});

ok('B moderate 100..5000', () => {
  const v = [100, 250, 500, 1000, 5000];
  assert.equal(recFor(v).type, 'linear');
  const ax = axisFor(v);
  assert.ok(ax.domain[1] > 5000);
  assert.ok(ax.toUnit(100) * 400 >= MIN_BAR_PX);
});

ok('C extreme disparity: linear hides, log reveals', () => {
  const v = [100, 250, 500, 2000, 100_000_000];
  const lin = axisFor(v, 'linear');
  assert.ok(lin.toUnit(100) * PLOT < 1, 'linear: $100 < 1px (the bug)');
  const rec = recFor(v);
  assert.equal(rec.type, 'log');
  assert.equal(resolveScale('auto', rec).type, 'log');
  const log = axisFor(v, 'log');
  const units = v.map((x) => log.toUnit(x));
  for (let i = 1; i < units.length; i++) assert.ok(units[i] > units[i - 1], 'strictly increasing');
  assert.ok(units[0] * PLOT > 8, 'log: $100 clearly visible');
  assert.ok(log.domain[1] >= 100_000_000 * 1.15 - 1, 'headroom above max');
  assert.equal(formatCompact(100_000_000, 'currency'), '$100M');
});

ok('D large revenue', () => {
  const v = [1_000_000, 25_000_000, 100_000_000];
  const ax = axisFor(v, resolveScale('auto', recFor(v)).type);
  assert.ok(finite(ax.ticks) && ax.ticks.length >= 3);
  assert.equal(formatCompact(1_000_000, 'currency'), '$1M');
  assert.equal(formatCompact(25_000_000, 'currency'), '$25M');
  assert.equal(formatExact(100_000_000, 'currency'), '$100,000,000.00');
});

ok('E zero / null / missing / empty', () => {
  for (const v of [[], [null, undefined, NaN, Infinity], [0, 0, 0]]) {
    const ax = axisFor(v as any[]);
    assert.equal(ax.type, 'linear');
    assert.ok(finite(ax.ticks) && finite(ax.domain));
    assert.ok(Number.isFinite(ax.toUnit(0)));
    assert.equal(recFor(v as any[]).type, 'linear');
  }
  assert.equal(axisFor([null, 0, 5, undefined]).ticks[0], 0);
  assert.equal(pickEvenly(0, 5).length, 0);
});

ok('F negative + positive', () => {
  const v = [-500, -10, 0, 100, 10_000];
  const rec = recFor(v);
  assert.equal(rec.type, 'linear'); assert.equal(rec.reason, 'negative');
  const ax = axisFor(v, 'log');                       // log request must fall back
  assert.equal(ax.type, 'linear');
  assert.ok(ax.domain[0] < -500 && ax.domain[1] > 10_000);
  const u = v.map(ax.toUnit);
  for (let i = 1; i < u.length; i++) assert.ok(u[i] > u[i - 1]);
  assert.ok(ax.toUnit(0) > 0 && ax.toUnit(0) < 1, 'zero baseline inside axis');
});

ok('G partner comparison, sequential selection', () => {
  const A = 100, B = 100_000_000, C = 25_000;
  const r1 = recFor([A]);                              // only A
  assert.equal(r1.type, 'linear');
  const r2 = recFor([A, B]);                           // A + B
  assert.equal(r2.type, 'log'); assert.equal(r2.dominantIndex, 1);
  const r3 = recFor([A, B, C]);                        // A + B + C
  assert.equal(r3.type, 'log');
  const d1 = axisFor([A], 'linear').domain, d3 = axisFor([A, B, C], 'log').domain;
  assert.notDeepEqual(d1, d3, 'domain recomputed from full selection');
  const ax = axisFor([A, B, C], 'log');
  const [ua, uc, ub] = [A, C, B].map(ax.toUnit);
  assert.ok(ua > 0 && ua < uc && uc < ub && ub < 1, 'all three visible and ordered');
  const back = recFor([B, C]);                         // deselect A
  assert.equal(back.type, 'log');
  assert.equal(recFor([C]).type, 'linear');            // deselect more → recomputed
  assert.equal(formatExact(A, 'currency'), '$100.00'); // tooltip is the true value
});

ok('log zero floor + inflated bar marker', () => {
  const ax = axisFor([0, 100, 100_000_000], 'log');
  assert.equal(ax.hasZeroFloor, true);
  assert.equal(ax.toUnit(0), 0);
  assert.ok(ax.toUnit(100) > 0);
  const tiny = barLength(0.0001, true, 500);
  assert.equal(tiny.inflated, true); assert.equal(tiny.px, MIN_BAR_PX);
  assert.equal(barLength(0.5, true, 500).inflated, false);
});

ok('formatting', () => {
  assert.equal(formatCompact(1000, 'currency'), '$1K');
  assert.equal(formatCompact(1_500_000, 'currency'), '$1.5M');
  assert.equal(formatCompact(1_200_000, 'count'), '1.2M');
  assert.equal(formatExact(1_200_000, 'count'), '1,200,000');
  assert.equal(formatExact(42, 'count'), '42');
});

console.log(`\n${pass} groups passed`);
