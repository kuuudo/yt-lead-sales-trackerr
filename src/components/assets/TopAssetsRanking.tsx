/**
 * TopAssetsRanking — clean rebuild.
 * Snapshot-backed Asset Revenue ranking (same UX patterns as TopRankings).
 * Scope: My | Assigned. Shared omitted until conversion→shared asset path is proven.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Package, ChevronRight } from 'lucide-react';
import {
  getTopAssetsAnalytics,
  rankTopAssets,
  type TopAssetRow,
  type TopAssetsMetric,
  type TopAssetsPreset,
  type TopAssetsScope,
} from '../../services/promotion/getTopAssetsAnalytics';

const PRESETS: { key: TopAssetsPreset; label: string }[] = [
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'last_12_months', label: 'Last 12 months' },
  { key: 'all_time', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

const SCOPES: { key: TopAssetsScope; label: string }[] = [
  { key: 'my', label: 'My' },
  { key: 'assigned', label: 'Assigned' },
];

const INITIAL_VISIBLE = 5;

function formatRevenue(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface TopAssetsRankingProps {
  organizationId: string | null;
  onAssetClick?: (assetId: string) => void;
}

export default function TopAssetsRanking({ organizationId, onAssetClick }: TopAssetsRankingProps) {
  const navigate = useNavigate();

  const [metric] = useState<TopAssetsMetric>('revenue');
  const [preset, setPreset] = useState<TopAssetsPreset>('last_30_days');
  const [scope, setScope] = useState<TopAssetsScope>('my');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInputValue(new Date()));

  const [rows, setRows] = useState<TopAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefreshRef = useRef(false);

  useEffect(() => {
    const forceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;

    if (!organizationId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (preset === 'custom') {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        setRefreshing(false);
        return;
      }
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getTopAssetsAnalytics({
      organizationId,
      preset,
      scope,
      customRange:
        preset === 'custom'
          ? { start: new Date(customStart), end: new Date(customEnd) }
          : null,
      forceRefresh,
    })
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load Top Assets');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, preset, scope, customStart, customEnd, refreshKey]);

  const ranked = useMemo(() => rankTopAssets(rows, metric), [rows, metric]);
  const visible = showAll ? ranked : ranked.slice(0, INITIAL_VISIBLE);

  const handleClick = (assetId: string) => {
    if (onAssetClick) onAssetClick(assetId);
    else navigate(`/assets/${assetId}`);
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Package className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Rankings
            </div>
            <div className="text-sm font-bold text-zinc-100">Top Assets</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setScope(s.key)}
                className={
                  scope === s.key
                    ? 'px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide bg-zinc-100 text-zinc-950'
                    : 'px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                }
              >
                {s.label}
              </button>
            ))}
          </div>

          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as TopAssetsPreset)}
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
            disabled={loading || refreshing || !organizationId}
            onClick={() => {
              forceRefreshRef.current = true;
              setRefreshing(true);
              setRefreshKey((k) => k + 1);
            }}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] font-bold uppercase tracking-wide rounded-lg px-2 py-1.5 hover:border-zinc-600 disabled:opacity-50"
            title="Recompute this window from canonical conversions"
          >
            {refreshing ? 'Updating…' : 'Update'}
          </button>
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1.5"
          />
          <span className="text-zinc-600 text-xs">→</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1.5"
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10 text-zinc-500 gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wide">Loading rankings…</span>
        </div>
      )}

      {!loading && error && (
        <div className="text-sm text-red-400/90 py-6 text-center">{error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="text-sm text-zinc-500 py-8 text-center">
          No asset revenue in this window for <span className="text-zinc-300">{scope}</span> scope.
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <ul className="space-y-1.5">
          {visible.map((row, idx) => (
            <li key={row.assetId}>
              <button
                type="button"
                onClick={() => handleClick(row.assetId)}
                className="w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-zinc-800/60 transition-colors text-left group"
              >
                <span className="w-6 text-center text-[11px] font-black text-zinc-500 tabular-nums">
                  {row.rank || idx + 1}
                </span>
                {row.thumbnailUrl ? (
                  <img
                    src={row.thumbnailUrl}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover bg-zinc-800 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-zinc-600" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-100 truncate">{row.title}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">
                    {row.assetType || 'asset'} · {row.conversions} conversion
                    {row.conversions === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="text-sm font-bold text-zinc-100 tabular-nums shrink-0">
                  {formatRevenue(row.revenue)}
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && ranked.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full text-center text-[11px] font-bold uppercase tracking-wide text-zinc-400 hover:text-zinc-200 py-2"
        >
          {showAll ? 'Show less' : `Show all (${ranked.length})`}
        </button>
      )}
    </div>
  );
}
