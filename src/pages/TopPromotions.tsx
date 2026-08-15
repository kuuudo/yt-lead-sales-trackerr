import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Loader2, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  getTopPromotionsAnalytics,
  rankTopPromotions,
  type TopPromotionRow,
  type TopPromotionsMetric,
  type TopPromotionsPreset,
} from '../../services/promotion/getTopPromotionsAnalytics';

// Not the journey-diagnostic UI from IndividualPromotionAnalytics.tsx on
// purpose — this is a compact ranking card for the Marketplace landing
// view, not a per-promotion analytics page. No journey graph here.

const METRICS: { key: TopPromotionsMetric; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'rpc', label: 'RPC' },
];

const PRESETS: { key: TopPromotionsPreset; label: string }[] = [
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_12_months', label: 'Last 12 months' },
  { key: 'all_time', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

const INITIAL_VISIBLE = 5;

function formatMetric(value: number, metric: TopPromotionsMetric): string {
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

interface TopPromotionsProps {
  organizationId: string | null;
}

export default function TopPromotions({ organizationId }: TopPromotionsProps) {
  const navigate = useNavigate();

  const [metric, setMetric] = useState<TopPromotionsMetric>('revenue');
  const [preset, setPreset] = useState<TopPromotionsPreset>('last_30_days');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInputValue(new Date()));

  const [rows, setRows] = useState<TopPromotionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    // Custom range: wait for a valid start <= end before fetching, rather
    // than firing a request on every keystroke in the date inputs.
    if (preset === 'custom') {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getTopPromotionsAnalytics({
      organizationId,
      preset,
      customRange:
        preset === 'custom'
          ? { start: new Date(customStart), end: new Date(customEnd) }
          : null,
    })
      .then(result => {
        if (!cancelled) setRows(result);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load Top Promotions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, preset, customStart, customEnd]);

  const ranked = useMemo(() => rankTopPromotions(rows, metric), [rows, metric]);
  const visible = ranked.slice(0, INITIAL_VISIBLE);
  const hasMore = ranked.length > INITIAL_VISIBLE;

  if (!organizationId) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      {/* Header row — title + compact metric/date controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-red-500" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-300">
            Top Promotions
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={metric}
            onChange={e => setMetric(e.target.value as TopPromotionsMetric)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] font-bold uppercase tracking-wide rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-600"
          >
            {METRICS.map(m => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={preset}
            onChange={e => setPreset(e.target.value as TopPromotionsPreset)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] font-bold uppercase tracking-wide rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-600"
          >
            {PRESETS.map(p => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="date"
            value={customStart}
            max={customEnd}
            onChange={e => setCustomStart(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-600"
          />
          <span className="text-zinc-600 text-[11px]">to</span>
          <input
            type="date"
            value={customEnd}
            min={customStart}
            max={toDateInputValue(new Date())}
            onChange={e => setCustomEnd(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-600"
          />
        </div>
      )}

      {/* Body — compact, capped at 5 rows so the rest of Marketplace stays visible below */}
      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-xs py-6 justify-center">
          <Loader2 className="animate-spin" size={14} /> Loading…
        </div>
      )}

      {!loading && error && (
        <div className="text-red-500 text-xs border border-red-900 bg-red-950/30 rounded-lg p-3">
          {error}
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="text-zinc-600 text-xs text-center py-6">No promotion activity yet</div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="divide-y divide-zinc-800/70">
          {visible.map((row, i) => (
            <PromotionRankRow
              key={row.promotionId}
              rank={i + 1}
              row={row}
              metric={metric}
              onClick={() => navigate(`/marketplace/promotions/${row.promotionId}`)}
            />
          ))}
        </div>
      )}

      {!loading && !error && hasMore && (
        <div className="flex justify-end mt-2">
          <button
            onClick={() => setShowAll(true)}
            className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
          >
            View more
            <ChevronRight size={12} />
          </button>
        </div>
      )}

      <AnimatePresence>
        {showAll && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowAll(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingUp size={16} className="text-red-500" /> Top Promotions
                </h2>
                <button
                  onClick={() => setShowAll(false)}
                  className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto -mx-2 px-2 divide-y divide-zinc-800/70">
                {ranked.map((row, i) => (
                  <PromotionRankRow
                    key={row.promotionId}
                    rank={i + 1}
                    row={row}
                    metric={metric}
                    onClick={() => {
                      setShowAll(false);
                      navigate(`/marketplace/promotions/${row.promotionId}`);
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PromotionRankRow({
  rank,
  row,
  metric,
  onClick,
}: {
  rank: number;
  row: TopPromotionRow;
  metric: TopPromotionsMetric;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-zinc-800/40 -mx-2 px-2 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-zinc-600 text-xs font-bold w-4 shrink-0 text-right">{rank}</span>
        <div className="min-w-0">
          <p className="text-zinc-200 text-sm font-semibold truncate">{row.title}</p>
          {row.marketer && (
            <p className="text-zinc-500 text-[11px] truncate">{row.marketer}</p>
          )}
        </div>
      </div>
      <span className="text-white text-sm font-bold shrink-0">
        {formatMetric(row[metric], metric)}
      </span>
    </button>
  );
}
