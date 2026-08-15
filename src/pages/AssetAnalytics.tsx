/**
 * src/pages/AssetAnalytics.tsx
 *
 * Individual Asset Analytics — VALIDATION SURFACE, not a polished
 * dashboard. Purpose: let a human compare every number the engine produces
 * against the database, for one asset at a time, across all three asset
 * types (campaign_element / video / resource).
 *
 * Deliberately NOT modeled on IndividualPromotionAnalytics.tsx — built
 * directly from AssetAnalyticsResult (assetAnalyticsEngine.ts) instead:
 *
 *   metrics            -> Core Metrics (clicks/sessions/conversions/revenue/rpc)
 *   classification     -> Asset Type / Provenance + non-fatal warnings
 *   relationships[]    -> Promoting Sources -> Asset (one row per video_id,
 *                          + a "No resolvable source" bucket, never dropped)
 *   journeyGraph        -> nodes/edges + raw sampleJourneys (never collapsed)
 *   debug.rowCounts     -> Debug / Evidence block, always visible in this pass
 *
 * organization_id is NOT part of AssetAnalyticsResult's output (only
 * assetId/activeSource/dateRange/rowCounts live in `debug`), even though
 * it's the engine's scope boundary (decision #4). getAssetIdentity.ts is a
 * small, independent, display-only fetch added specifically to surface it
 * here — it does not feed into or duplicate any engine logic.
 *
 * activeSource / includeEV / dateRange are exposed as live controls (not
 * hardcoded) because every number on this page changes with them — that's
 * the whole point of a validation pass: re-run the same asset under
 * stripe-only / pixel-only / total and confirm the deltas make sense
 * against the DB.
 *
 * A raw-JSON dump of the full AssetAnalyticsResult is included at the
 * bottom, collapsed by default — the fastest way to diff against a direct
 * DB query when a displayed number looks wrong.
 *
 * Explicitly NOT built here: charts, colored trend indicators, polished
 * empty states beyond "no data for this window," or any All-Assets rollup.
 * This is a single-asset diagnostic page only.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { getAssetAnalytics } from '../services/asset/getAssetAnalytics';
import type { GetAssetAnalyticsParams } from '../services/asset/getAssetAnalytics';
import { getAssetIdentity } from '../services/asset/getAssetIdentity';
import type { AssetIdentity } from '../services/asset/getAssetIdentity';
import type {
  AssetAnalyticsResult,
  ActiveSource,
  AssetJourneyNode,
} from '../lib/assetAnalyticsEngine';
import type { DateRange, CustomDateRange } from '../lib/analyticsEngine';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: '7days', label: '7 Days' },
  { value: '30days', label: '30 Days' },
  { value: 'thismonth', label: 'This Month' },
  { value: '2months', label: '2 Months' },
  { value: '6months', label: '6 Months' },
  { value: '1year', label: '1 Year' },
  { value: 'custom', label: 'Custom' },
];

const ACTIVE_SOURCE_OPTIONS: { value: ActiveSource; label: string }[] = [
  { value: 'total', label: 'Total (Stripe + Pixel)' },
  { value: 'stripe', label: 'Stripe Only' },
  { value: 'pixel', label: 'Pixel Only' },
];

function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nodeLabel(n: AssetJourneyNode): string {
  return `[${n.kind}] ${n.label}`;
}

export default function AssetAnalytics() {
  const { id } = useParams<{ id: string }>();

  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [activeSource, setActiveSource] = useState<ActiveSource>('total');
  const [includeEV, setIncludeEV] = useState<boolean>(true);

  const [identity, setIdentity] = useState<AssetIdentity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const [result, setResult] = useState<AssetAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showRawJson, setShowRawJson] = useState(false);
  const [showSampleJourneys, setShowSampleJourneys] = useState(false);

  useEffect(() => {
    if (!id) return;

    // 'custom' with no range picked yet — wait for both dates rather than
    // firing a query getDateBounds() would silently resolve to 'all' anyway
    // (fail-open per analyticsEngine.ts), which would be confusing on a
    // validation page specifically built to make date-window behavior
    // legible.
    if (dateRange === 'custom' && !customRange) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setIdentityError(null);

      const params: GetAssetAnalyticsParams = {
        assetId: id,
        dateRange,
        customRange,
        activeSource,
        includeEV,
      };

      const [identityOutcome, analyticsOutcome] = await Promise.all([
        getAssetIdentity(id).then(
          data => ({ ok: true as const, data }),
          err => ({ ok: false as const, err }),
        ),
        getAssetAnalytics(params).then(
          data => ({ ok: true as const, data }),
          err => ({ ok: false as const, err }),
        ),
      ]);

      if (cancelled) return;

      // Identity failure is display-only — the metrics below still matter
      // even if we can't show org id / created date. Never block the page.
      if (!identityOutcome.ok) {
        setIdentityError(identityOutcome.err?.message ?? 'Could not load asset identity.');
      } else {
        setIdentity(identityOutcome.data);
      }

      if (!analyticsOutcome.ok) {
        setError(analyticsOutcome.err?.message ?? 'Could not load asset analytics.');
        setResult(null);
      } else {
        setResult(analyticsOutcome.data);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, dateRange, customRange, activeSource, includeEV]);

  if (!id) {
    return <div className="text-red-500 text-sm">No asset id in route.</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        to={`/assets/${id}`}
        className="flex items-center gap-2 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest"
      >
        <ArrowLeft size={14} /> Back to Asset
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          Asset Analytics <span className="text-zinc-600 text-sm font-normal">(diagnostic)</span>
        </h1>
        <p className="text-xs text-zinc-500 mt-1 font-mono break-all">{id}</p>
      </div>

      {/* ── Controls — every number below is a function of these three ─── */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Date Range</p>
          <div className="flex flex-wrap gap-2">
            {DATE_RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${
                  dateRange === opt.value
                    ? 'bg-white text-zinc-950 border-white'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-3 mt-3">
              <input
                type="date"
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white"
                onChange={e =>
                  setCustomRange(prev => ({ start: e.target.value, end: prev?.end ?? e.target.value }))
                }
              />
              <span className="text-zinc-600 text-xs">to</span>
              <input
                type="date"
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white"
                onChange={e =>
                  setCustomRange(prev => ({ start: prev?.start ?? e.target.value, end: e.target.value }))
                }
              />
              {!customRange && (
                <span className="text-[10px] text-amber-500 uppercase tracking-widest font-black">
                  Pick both dates
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Active Source</p>
          <div className="flex flex-wrap gap-2">
            {ACTIVE_SOURCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setActiveSource(opt.value)}
                className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${
                  activeSource === opt.value
                    ? 'bg-white text-zinc-950 border-white'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={includeEV}
            onChange={e => setIncludeEV(e.target.checked)}
            className="w-4 h-4 rounded accent-white"
          />
          Include Estimated Call Revenue (EV)
        </label>
      </section>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading analytics...
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && result && (
        <>
          {/* ── 1. Asset Identity / Type ────────────────────────────────── */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
              Asset Identity
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Asset Type (assetType input)" value={result.classification.provenance.type} />
              <Field
                label="Raw asset_type (from assets row)"
                value={identity?.assetType ?? (identityError ? 'unavailable' : '—')}
              />
              <Field
                label="Campaign IDs"
                value={
                  result.classification.provenance.campaignIds.length > 0
                    ? result.classification.provenance.campaignIds.join(', ')
                    : '(none)'
                }
              />
              <Field
                label="Created"
                value={identity ? new Date(identity.createdAt).toLocaleString() : identityError ? 'unavailable' : '—'}
              />
            </div>
            {identityError && (
              <p className="text-[10px] text-amber-500 mt-3">
                Identity lookup failed ({identityError}) — metrics below are still from the engine and unaffected.
              </p>
            )}
            {result.classification.warnings.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {result.classification.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5"
                  >
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── 2-6. Core Metrics ────────────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
              Core Metrics ({activeSource})
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MetricCard label="Clicks" value={result.metrics.clicks.toLocaleString()} />
              <MetricCard label="Sessions" value={result.metrics.sessions.toLocaleString()} />
              <MetricCard label="Conversions" value={result.metrics.conversions.toLocaleString()} />
              <MetricCard label="Revenue" value={formatCurrency(result.metrics.revenue)} />
              <MetricCard label="RPC" value={formatCurrency(result.metrics.rpc)} />
            </div>
          </section>

          {/* ── 7-8. Promoting Sources -> Asset + per-source metrics ──────── */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
              Promoting Sources → Asset ({result.relationships.length} row{result.relationships.length === 1 ? '' : 's'})
            </p>
            {result.relationships.length === 0 ? (
              <p className="text-sm text-zinc-500">No relationship rows for this window.</p>
            ) : (
              <div className="overflow-x-auto border border-zinc-800 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-900 border-b border-zinc-800">
                      <th className="text-left px-4 py-2.5">Promoting Video ID</th>
                      <th className="text-right px-4 py-2.5">Clicks</th>
                      <th className="text-right px-4 py-2.5">Sessions</th>
                      <th className="text-right px-4 py-2.5">Conversions</th>
                      <th className="text-right px-4 py-2.5">Revenue</th>
                      <th className="text-right px-4 py-2.5">RPC</th>
                      <th className="text-left px-4 py-2.5">Redirect Link Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.relationships.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b border-zinc-900 last:border-0 ${
                          row.promotingSourceId === null ? 'bg-amber-500/5' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">
                          {row.promotingSourceId ?? (
                            <span className="text-amber-500 font-sans font-bold uppercase text-[10px] tracking-widest">
                              No resolvable source
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-white">{row.metrics.clicks}</td>
                        <td className="px-4 py-2.5 text-right text-white">{row.metrics.sessions}</td>
                        <td className="px-4 py-2.5 text-right text-white">{row.metrics.conversions}</td>
                        <td className="px-4 py-2.5 text-right text-white">{formatCurrency(row.metrics.revenue)}</td>
                        <td className="px-4 py-2.5 text-right text-white">{formatCurrency(row.metrics.rpc)}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-zinc-500 max-w-xs truncate">
                          {row.redirectLinkIds.length > 0 ? row.redirectLinkIds.join(', ') : '(none)'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── 9. Journey / dynamic journey graph ─────────────────────────
              Rendered as evidence tables, not a graphical canvas — this
              pass prioritizes exact evidence (node kinds, edge counts, raw
              sample journeys) over visual polish. */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
              Journey Graph — {result.journeyGraph.nodes.length} node
              {result.journeyGraph.nodes.length === 1 ? '' : 's'}, {result.journeyGraph.edges.length} edge
              {result.journeyGraph.edges.length === 1 ? '' : 's'}
            </p>

            {result.journeyGraph.nodes.length === 0 ? (
              <p className="text-sm text-zinc-500">No journey evidence for this window (no conversions, or journeyContext empty).</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Nodes</p>
                  <div className="flex flex-wrap gap-2">
                    {result.journeyGraph.nodes.map((n, i) => (
                      <span
                        key={i}
                        className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border ${
                          n.kind === 'destination'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                            : n.kind === 'asset'
                            ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                        }`}
                      >
                        {nodeLabel(n)}
                      </span>
                    ))}
                  </div>
                </div>

                {result.journeyGraph.edges.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Edges</p>
                    <div className="overflow-x-auto border border-zinc-800 rounded-xl">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-900 border-b border-zinc-800">
                            <th className="text-left px-4 py-2.5">From</th>
                            <th className="text-left px-4 py-2.5">To</th>
                            <th className="text-right px-4 py-2.5">Evidence (event ids)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.journeyGraph.edges.map((e, i) => (
                            <tr key={i} className="border-b border-zinc-900 last:border-0">
                              <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{nodeLabel(e.from)}</td>
                              <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">{nodeLabel(e.to)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-[10px] text-zinc-500">
                                {e.evidenceStepIds.length}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowSampleJourneys(v => !v)}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
                >
                  {showSampleJourneys ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Sample Journeys ({result.journeyGraph.sampleJourneys.length}, raw)
                </button>
                {showSampleJourneys && (
                  <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[10px] text-zinc-400 overflow-x-auto max-h-96 overflow-y-auto">
                    {JSON.stringify(result.journeyGraph.sampleJourneys, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </section>

          {/* ── 10. Debug / Evidence — always visible in this validation pass,
              per explicit instruction not to hide diagnostics yet. ────────── */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
              Debug / Evidence
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Field label="Asset ID" value={result.debug.assetId} mono />
              <Field label="Organization ID" value={identity?.organizationId ?? (identityError ? 'unavailable' : '—')} mono />
              <Field label="Active Source" value={result.debug.activeSource} />
              <Field label="Date Range" value={result.debug.dateRange} />
              <Field label="Events (scoped)" value={result.debug.rowCounts.events} />
              <Field label="Sessions" value={result.metrics.sessions} />
              <Field label="Redirect Links" value={result.debug.rowCounts.redirectLinks} />
              <Field label="Stripe Purchases" value={result.debug.rowCounts.stripePurchases} />
              <Field label="Pixel Purchases" value={result.debug.rowCounts.pixelPurchases} />
              <Field label="Conversions" value={result.debug.rowCounts.conversions} />
            </div>

            <button
              onClick={() => setShowRawJson(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white mt-4"
            >
              {showRawJson ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Raw AssetAnalyticsResult (JSON)
            </button>
            {showRawJson && (
              <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[10px] text-zinc-400 overflow-x-auto max-h-[32rem] overflow-y-auto mt-2">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </section>
        </>
      )}

      {!loading && !result && !error && (
        <p className="text-sm text-zinc-500">No data.</p>
      )}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-0.5">{label}</p>
      <p className={`text-sm text-white ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}
