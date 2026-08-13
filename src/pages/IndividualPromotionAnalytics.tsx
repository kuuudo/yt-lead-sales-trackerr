/**
 * src/pages/IndividualPromotionAnalytics.tsx
 *
 * Analytics for ONE promotion — "how is THIS promotion performing?". Kept
 * deliberately separate from PromotionDetail.tsx, which remains the
 * management page (collaborators/assets/settings). This page is read-only
 * and adds nothing to that management surface.
 *
 * V1 scope (locked): KPI cards, performance over time, conversion
 * destinations, top assets, journey insights. All numbers come from
 * getPromotionAnalytics() -> computePromotionAnalytics(), which aggregates
 * directly by promotion_id — no cross-promotion mixing.
 *
 * Journey data is presented as EVIDENCE only ("appeared in conversion
 * journeys"), never as causal attribution ("this asset caused the sale").
 * See promotionAnalyticsEngine.ts's own header for the locked scope this
 * follows.
 *
 * Do NOT build All Promotions / All Assets / Individual Asset analytics
 * here — those are later, separate pages that may compare across
 * promotions; this page only ever looks at one.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  DollarSign,
  MousePointerClick,
  Target,
  Percent,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  getPromotionDetail,
  type PromotionDetailData,
} from '../services/promotion/getPromotionDetail';
import { getPromotionAnalytics } from '../services/promotion/getPromotionAnalytics';
import type { PromotionAnalyticsResult } from '../lib/promotionAnalyticsEngine';
import type { DateRange } from '../lib/analyticsEngine';

type ActiveSourceOption = 'stripe' | 'pixel' | 'total';

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7days', label: 'Last 7 Days' },
  { value: '30days', label: 'Last 30 Days' },
  { value: '2months', label: 'Last 2 Months' },
  { value: '6months', label: 'Last 6 Months' },
  { value: '1year', label: 'Last Year' },
  { value: 'thismonth', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

const SOURCE_OPTIONS: { value: ActiveSourceOption; label: string }[] = [
  { value: 'total', label: 'Total (Stripe + Pixel)' },
  { value: 'stripe', label: 'Stripe Only' },
  { value: 'pixel', label: 'Pixel Only' },
];

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export default function IndividualPromotionAnalytics() {
  const { id } = useParams<{ id: string }>();

  const [detail, setDetail] = useState<PromotionDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [activeSource, setActiveSource] = useState<ActiveSourceOption>('total');

  const [result, setResult] = useState<PromotionAnalyticsResult | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Promotion header info — reuses the same getPromotionDetail() service
  // PromotionDetail.tsx already calls, rather than a second resolver for
  // the same data.
  useEffect(() => {
    if (!id) return;
    (async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const data = await getPromotionDetail(id);
        if (!data) {
          setDetailError('Promotion not found.');
        } else {
          setDetail(data);
        }
      } catch (err: any) {
        setDetailError(err.message || 'Could not load this promotion.');
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [id]);

  // Analytics — refetches whenever the promotion, date range, or source
  // selection changes.
  useEffect(() => {
    if (!id) return;
    (async () => {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        const data = await getPromotionAnalytics({
          promotionId: id,
          dateRange,
          activeSource,
        });
        setResult(data);
      } catch (err: any) {
        setAnalyticsError(err.message || 'Could not load analytics for this promotion.');
      } finally {
        setAnalyticsLoading(false);
      }
    })();
  }, [id, dateRange, activeSource]);

  const kpiCards = useMemo(() => {
    if (!result) return [];
    const { kpis } = result;
    return [
      { label: 'Revenue', value: formatCurrency(kpis.revenue), icon: DollarSign },
      { label: 'Conversions', value: formatNumber(kpis.conversions), icon: Target },
      { label: 'Clicks', value: formatNumber(kpis.clicks), icon: MousePointerClick },
      { label: 'Conversion Rate', value: formatPercent(kpis.conversionRate), icon: Percent },
      { label: 'EPC', value: formatCurrency(kpis.epc), icon: TrendingUp },
    ];
  }, [result]);

  if (detailLoading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading...
      </div>
    );
  }

  if (detailError || !detail) {
    return <div className="text-red-500 text-sm">{detailError || 'Promotion not found.'}</div>;
  }

  const { promotion, assignment } = detail;

  return (
    <div className="space-y-6 max-w-6xl">
      <Link
        to={`/marketplace/promotions/${id}`}
        className="flex items-center gap-2 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest"
      >
        <ArrowLeft size={14} /> Back to Promotion
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">
            Promotion Analytics
          </p>
          <h1 className="text-2xl font-bold text-white">{assignment?.title ?? 'Promotion'}</h1>
          {promotion.status !== 'draft' && (
            <span className="inline-block mt-2 text-[9px] font-black uppercase text-zinc-500 tracking-widest">
              {promotion.status}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value as DateRange)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2"
          >
            {DATE_RANGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={activeSource}
            onChange={e => setActiveSource(e.target.value as ActiveSourceOption)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2"
          >
            {SOURCE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {analyticsError && (
        <div className="text-red-500 text-sm">{analyticsError}</div>
      )}

      {analyticsLoading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading analytics...
        </div>
      ) : !result ? null : (
        <>
          {/* ── SECTION 1 — KPI Cards ────────────────────────────────── */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {kpiCards.map(card => (
              <div
                key={card.label}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center gap-2 text-zinc-500">
                  <card.icon size={14} />
                  <p className="text-[9px] font-black uppercase tracking-widest">{card.label}</p>
                </div>
                <p className="text-xl font-bold text-white">{card.value}</p>
              </div>
            ))}
          </section>

          {/* ── SECTION 2 — Performance Over Time ───────────────────── */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-4">
              Performance Over Time
            </p>
            {result.timeSeries.length === 0 ? (
              <p className="text-sm text-zinc-500">No activity in this date range.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
                    <YAxis yAxisId="revenue" stroke="#71717a" fontSize={10} />
                    <YAxis yAxisId="conversions" orientation="right" stroke="#71717a" fontSize={10} />
                    <Tooltip
                      contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 12 }}
                      formatter={(value: number, name: string) =>
                        name === 'revenue' ? [formatCurrency(value), 'Revenue'] : [formatNumber(value), 'Conversions']
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line yAxisId="conversions" type="monotone" dataKey="conversions" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* ── SECTION 3 — Conversion Destinations ─────────────────── */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-4">
              Conversion Destinations
            </p>
            {result.destinations.length === 0 ? (
              <p className="text-sm text-zinc-500">No traffic in this date range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[9px] font-black uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
                      <th className="py-2 pr-4">Destination</th>
                      <th className="py-2 pr-4 text-right">Clicks</th>
                      <th className="py-2 pr-4 text-right">Conversions</th>
                      <th className="py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.destinations.map(d => (
                      <tr key={d.linkType} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-4 text-white capitalize">
                          {d.linkType.replace(/_/g, ' ')}
                          {d.linkType === 'unclassified' && (
                            <span className="ml-2 text-[9px] text-zinc-500 uppercase tracking-widest">
                              (not attributable in current data)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right text-zinc-300">{formatNumber(d.clicks)}</td>
                        <td className="py-2 pr-4 text-right text-zinc-300">{formatNumber(d.conversions)}</td>
                        <td className="py-2 text-right text-zinc-300">{formatCurrency(d.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── SECTION 4 — Top Assets ───────────────────────────────── */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-4">
              Top Assets
            </p>
            {result.topAssets.length === 0 ? (
              <p className="text-sm text-zinc-500">No asset activity in this date range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[9px] font-black uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
                      <th className="py-2 pr-4">Asset</th>
                      <th className="py-2 pr-4 text-right">Clicks</th>
                      <th className="py-2 pr-4 text-right">Conversions</th>
                      <th className="py-2 pr-4 text-right">Revenue</th>
                      <th className="py-2 text-right">Conv. Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.topAssets.map(a => (
                      <tr key={a.assetId} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-4 text-white">{a.displayName}</td>
                        <td className="py-2 pr-4 text-right text-zinc-300">{formatNumber(a.clicks)}</td>
                        <td className="py-2 pr-4 text-right text-zinc-300">{formatNumber(a.conversions)}</td>
                        <td className="py-2 pr-4 text-right text-zinc-300">{formatCurrency(a.revenue)}</td>
                        <td className="py-2 text-right text-zinc-300">{formatPercent(a.conversionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── SECTION 5 — Journey Insights ─────────────────────────── */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Conversion Journey Evidence
            </p>
            <p className="text-xs text-zinc-500 -mt-2">
              What we observed leading up to each conversion — not a claim about what caused it.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <Users size={16} className="text-zinc-500" />
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Journeys</p>
                  <p className="text-lg font-bold text-white">{formatNumber(result.journeyInsights.journeyCount)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <TrendingUp size={16} className="text-zinc-500" />
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Avg. Touchpoints</p>
                  <p className="text-lg font-bold text-white">{result.journeyInsights.averageTouchpoints}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MousePointerClick size={16} className="text-zinc-500" />
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                    Most Common First Touchpoint
                  </p>
                  <p className="text-sm font-bold text-white">
                    {result.journeyInsights.mostCommonFirstTouchpoint?.label ?? 'Not enough data'}
                  </p>
                </div>
              </div>
            </div>

            {result.journeyInsights.unresolvedDimensions.length > 0 && (
              <div className="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <span className="font-black uppercase tracking-widest text-zinc-400">Evidence gaps: </span>
                {result.journeyInsights.unresolvedDimensions.join(', ')}
              </div>
            )}

            {result.journeyInsights.sampleJourneys.length > 0 && (
              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  Representative Journeys
                </p>
                {result.journeyInsights.sampleJourneys.map(journey => (
                  <div
                    key={journey.purchase.id}
                    className="border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400"
                  >
                    <p className="text-zinc-300 mb-1">
                      {journey.purchase.source === 'stripe' ? 'Stripe' : 'Pixel'} conversion —{' '}
                      {formatCurrency(journey.purchase.amount)} on{' '}
                      {new Date(journey.purchase.created_at).toLocaleDateString()}
                    </p>
                    <p>
                      {journey.steps.length === 0
                        ? 'No prior touchpoints found in this session.'
                        : `${journey.steps.length} touchpoint${journey.steps.length === 1 ? '' : 's'} appeared in this conversion's session, in order:`}
                    </p>
                    {journey.steps.length > 0 && (
                      <ol className="mt-2 space-y-1 list-decimal list-inside">
                        {journey.steps.map(step => (
                          <li key={step.event_id}>
                            {step.event_type ?? 'event'}
                            {step.link_type ? ` · ${step.link_type}` : ''}
                            {step.asset_id ? ` · asset ${step.asset_id}` : ''}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
