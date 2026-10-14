/**
 * TopSponsors.tsx — Marketer-facing Sponsor Revenue view.
 *
 * Same underlying formal revenue as the sponsor org's Top Marketers row for
 * this user + period. Sponsors stay separate (Ali ≠ Sponsor B).
 * Default: first sponsor by sort order after load, not "All Sponsors".
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useViewing } from '../lib/ViewingContext';
import {
  getTopSponsorsAnalytics,
  rankTopSponsors,
  type SponsorRow,
  type TopSponsorsPreset,
} from '../services/promotion/getTopSponsorsAnalytics';

const METRICS: { key: 'revenue' | 'conversions' | 'clicks' | 'rpc'; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'rpc', label: 'RPC' },
];

const PRESETS: { key: TopSponsorsPreset; label: string }[] = [
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_12_months', label: 'Last 12 months' },
  { key: 'all_time', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

const INITIAL_VISIBLE = 5;

function formatMetric(value: number, metric: 'revenue' | 'conversions' | 'clicks' | 'rpc'): string {
  if (metric === 'revenue' || metric === 'rpc') {
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: metric === 'rpc' ? 2 : 0,
    });
  }
  return value.toLocaleString();
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function TopSponsors() {
  const [marketerUserId, setMarketerUserId] = useState<string | null>(null);
  const [metric, setMetric] = useState<'revenue' | 'conversions' | 'clicks' | 'rpc'>('revenue');
  const [preset, setPreset] = useState<TopSponsorsPreset>('last_30_days');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(new Date()));

  const [rows, setRows] = useState<SponsorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** Selected sponsor for focused view — never defaults to "all". */
  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(null);

  const { viewingMemberId, isReadOnly } = useViewing();

  useEffect(() => {
    // Clear anything loaded for a previous identity.
    setRows([]);
    setSelectedSponsorId(null);
    if (isReadOnly) {
      // Operator Mode: the viewed member's sponsors, never the operator's own. Null = fail closed.
      setMarketerUserId(viewingMemberId ?? null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setMarketerUserId(data.user?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isReadOnly, viewingMemberId]);

  const load = useCallback(
    async (forceRefresh: boolean) => {
      if (!marketerUserId) {
        setLoading(false);
        return;
      }
      if (forceRefresh && isReadOnly) return;
      if (preset === 'custom') {
        const start = new Date(customStart);
        const end = new Date(customEnd);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return;
      }

      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const result = await getTopSponsorsAnalytics({
          marketerUserId,
          preset,
          customRange:
            preset === 'custom'
              ? { start: new Date(customStart), end: new Date(customEnd) }
              : null,
          forceRefresh,
        });
        setRows(result);
        setSelectedSponsorId((prev) => {
          if (prev && result.some((r) => r.sponsorOrganizationId === prev)) return prev;
          return result[0]?.sponsorOrganizationId ?? null;
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load Top Sponsors');
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [marketerUserId, preset, customStart, customEnd],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const ranked = useMemo(() => rankTopSponsors(rows, metric), [rows, metric]);
  const focused = useMemo(() => {
    if (!selectedSponsorId) return ranked;
    const one = ranked.filter((r) => r.sponsorOrganizationId === selectedSponsorId);
    return one.length ? one : ranked;
  }, [ranked, selectedSponsorId]);

  const visible = showAll ? focused : focused.slice(0, INITIAL_VISIBLE);
  const hasMore = focused.length > INITIAL_VISIBLE;

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!marketerUserId && !loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8 text-zinc-500 text-xs">
        Sign in to view sponsor revenue.
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-amber-500" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-300">
            Top Sponsors
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSponsorId ?? ''}
            onChange={(e) => setSelectedSponsorId(e.target.value || null)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] font-bold uppercase tracking-wide rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-600 max-w-[200px]"
          >
            {rows.length === 0 ? (
              <option value="">No sponsors</option>
            ) : (
              rows.map((r) => (
                <option key={r.sponsorOrganizationId} value={r.sponsorOrganizationId}>
                  {r.sponsorName}
                </option>
              ))
            )}
          </select>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as typeof metric)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] font-bold uppercase tracking-wide rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-600"
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as TopSponsorsPreset)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] font-bold uppercase tracking-wide rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-600"
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={loading || refreshing || !marketerUserId}
            onClick={() => void load(true)}
            className="bg-zinc-950 border border-zinc-700 text-zinc-300 text-[10px] font-black uppercase tracking-widest rounded-lg px-3 py-1.5 hover:border-zinc-500 disabled:opacity-40"
          >
            {refreshing ? 'Updating…' : 'Update'}
          </button>
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="date"
            value={customStart}
            max={customEnd}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-600"
          />
          <span className="text-zinc-600 text-[11px]">to</span>
          <input
            type="date"
            value={customEnd}
            min={customStart}
            max={toDateInputValue(new Date())}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-600"
          />
        </div>
      )}

      {error && (
        <p className="text-red-400 text-[11px] mb-2">{error}</p>
      )}
      {(loading || refreshing) && (
        <p className="text-zinc-600 text-[11px] mb-2">Loading sponsor analytics…</p>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="text-zinc-600 text-[11px]">
          No sponsor relationships found for your account.
        </p>
      )}

      <ul className="space-y-1">
        {visible.map((r, idx) => {
          const open = expanded.has(r.sponsorOrganizationId);
          return (
            <li
              key={r.sponsorOrganizationId}
              className="border border-zinc-800/80 rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleExpanded(r.sponsorOrganizationId)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-zinc-800/40"
              >
                <span className="text-zinc-600 text-[10px] font-mono w-5">
                  {idx + 1}
                </span>
                {open ? (
                  <ChevronDown size={12} className="text-zinc-500 shrink-0" />
                ) : (
                  <ChevronRight size={12} className="text-zinc-500 shrink-0" />
                )}
                <span className="text-sm font-semibold text-zinc-200 truncate flex-1">
                  {r.sponsorName}
                </span>
                <span className="text-sm font-bold text-emerald-400 tabular-nums">
                  {formatMetric(r[metric], metric)}
                </span>
              </button>
              {open && r.promotions.length > 0 && (
                <ul className="border-t border-zinc-800 bg-zinc-950/50 px-3 py-2 space-y-1">
                  {r.promotions.map((p) => (
                    <li
                      key={p.promotionId}
                      className="flex justify-between gap-2 text-[11px] text-zinc-400"
                    >
                      <span className="truncate">{p.title}</span>
                      <span className="tabular-nums text-zinc-300 shrink-0">
                        {formatMetric(p.revenue, 'revenue')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {open && r.promotions.length === 0 && (
                <p className="border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-600">
                  No promotion breakdown for this period
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
        >
          Show all ({focused.length})
        </button>
      )}
    </div>
  );
}
