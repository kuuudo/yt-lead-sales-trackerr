import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Loader2, ChevronRight, ChevronDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  getTopMarketersAnalytics,
  rankTopMarketers,
  type MarketerRow,
  type TopMarketersMetric,
  type TopMarketersPreset,
} from '../services/promotion/getTopMarketersAnalytics';

// Independent design — deliberately not modeled on IndividualPromotionAnalytics.tsx
// or TopPromotions.tsx's row shape. A marketer row here is a GROUP (one or
// more promotions rolled up), so it needs an expand affordance that a flat
// promotion ranking doesn't.

const METRICS: { key: TopMarketersMetric; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'rpc', label: 'RPC' },
];

const PRESETS: { key: TopMarketersPreset; label: string }[] = [
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_12_months', label: 'Last 12 months' },
  { key: 'all_time', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

const INITIAL_VISIBLE = 5;

function formatMetric(value: number, metric: TopMarketersMetric): string {
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

interface TopMarketersProps {
  organizationId: string | null;
}

export default function TopMarketers({ organizationId }: TopMarketersProps) {
  const navigate = useNavigate();

  const [metric, setMetric] = useState<TopMarketersMetric>('revenue');
  const [preset, setPreset] = useState<TopMarketersPreset>('last_30_days');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInputValue(new Date()));

  const [rows, setRows] = useState<MarketerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    if (preset === 'custom') {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getTopMarketersAnalytics({
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
        if (!cancelled) setError(e?.message ?? 'Failed to load Top Marketers');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, preset, customStart, customEnd]);

  const ranked = useMemo(() => rankTopMarketers(rows, metric), [rows, metric]);
  const visible = ranked.slice(0, INITIAL_VISIBLE);
  const hasMore = ranked.length > INITIAL_VISIBLE;

  const toggleExpanded = (marketerId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(marketerId)) next.delete(marketerId);
      else next.add(marketerId);
      return next;
    });
  };

  if (!organizationId) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-red-500" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-300">
            Top Marketers
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={metric}
            onChange={e => setMetric(e.target.value as TopMarketersMetric)}
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
            onChange={e => setPreset(e.target.value as TopMarketersPreset)}
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
        <div className="text-zinc-600 text-xs text-center py-6">No marketer activity yet</div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="divide-y divide-zinc-800/70">
          {visible.map((row, i) => (
            <MarketerRankRow
              key={row.marketerId}
              rank={i + 1}
              row={row}
              metric={metric}
              expanded={expanded.has(row.marketerId)}
              onToggle={() => toggleExpanded(row.marketerId)}
              onPromotionClick={promotionId => navigate(`/marketplace/promotions/${promotionId}`)}
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
                  <Users size={16} className="text-red-500" /> Top Marketers
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
                  <MarketerRankRow
                    key={row.marketerId}
                    rank={i + 1}
                    row={row}
                    metric={metric}
                    expanded={expanded.has(row.marketerId)}
                    onToggle={() => toggleExpanded(row.marketerId)}
                    onPromotionClick={promotionId => {
                      setShowAll(false);
                      navigate(`/marketplace/promotions/${promotionId}`);
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

function MarketerRankRow({
  rank,
  row,
  metric,
  expanded,
  onToggle,
  onPromotionClick,
}: {
  rank: number;
  row: MarketerRow;
  metric: TopMarketersMetric;
  expanded: boolean;
  onToggle: () => void;
  onPromotionClick: (promotionId: string) => void;
}) {
  const hasMultiple = row.promotions.length > 1;

  return (
    <div className="py-2.5">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 text-left hover:bg-zinc-800/40 -mx-2 px-2 py-1 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-zinc-600 text-xs font-bold w-4 shrink-0 text-right">{rank}</span>
          <ChevronDown
            size={12}
            className={`shrink-0 text-zinc-600 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
          />
          <div className="min-w-0">
            <p className="text-zinc-200 text-sm font-semibold truncate">{row.marketerName}</p>
            <p className="text-zinc-500 text-[11px] truncate">
              {row.promotions.length} {row.promotions.length === 1 ? 'promotion' : 'promotions'}
            </p>
          </div>
        </div>
        <span className="text-white text-sm font-bold shrink-0">
          {formatMetric(row[metric], metric)}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-9 pt-1.5 pb-0.5 space-y-1">
              {row.promotions.map(p => (
                <button
                  key={p.promotionId}
                  onClick={() => onPromotionClick(p.promotionId)}
                  className="w-full flex items-center justify-between gap-2 text-left py-1 px-2 -mx-2 rounded-md hover:bg-zinc-800/40 transition-colors"
                >
                  <span className="text-zinc-400 text-xs truncate">{p.title}</span>
                  {hasMultiple && (
                    <span className="text-zinc-600 text-[11px] shrink-0">
                      {p.revenue.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
