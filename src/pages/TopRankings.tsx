import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Users, Building2, Loader2, ChevronRight, ChevronDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import {
  getTopPromotionsAnalytics,
  rankTopPromotions,
  type TopPromotionRow,
} from '../services/promotion/getTopPromotionsAnalytics';
import {
  getTopMarketersAnalytics,
  rankTopMarketers,
  type MarketerRow,
} from '../services/promotion/getTopMarketersAnalytics';
import {
  getTopSponsorsAnalytics,
  rankTopSponsors,
  type SponsorRow,
} from '../services/promotion/getTopSponsorsAnalytics';

// Combined shell for ranking cards. Owns tab state + shared metric/date filters.
// Top Sponsors reuses the same formal revenue as Top Marketers (sponsor-org view).

type RankingTab = 'promotions' | 'marketers' | 'sponsors';
type Metric = 'revenue' | 'clicks' | 'sessions' | 'conversions' | 'rpc';
type Preset = 'last_7_days' | 'last_30_days' | 'this_month' | 'last_12_months' | 'all_time' | 'custom';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'rpc', label: 'RPC' },
];

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'last_12_months', label: 'Last 12 months' },
  { key: 'all_time', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

const INITIAL_VISIBLE = 5;

function formatMetric(value: number, metric: Metric): string {
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

interface TopRankingsProps {
  organizationId: string | null;
}


export default function TopRankings({ organizationId }: TopRankingsProps) {
  const { viewingMemberId, isReadOnly } = useViewing();
  const navigate = useNavigate();


  const [tab, setTab] = useState<RankingTab>('promotions');
  const [metric, setMetric] = useState<Metric>('revenue');
  const [preset, setPreset] = useState<Preset>('last_30_days');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInputValue(new Date()));

  const [promotionRows, setPromotionRows] = useState<TopPromotionRow[]>([]);
  const [marketerRows, setMarketerRows] = useState<MarketerRow[]>([]);
  const [sponsorRows, setSponsorRows] = useState<SponsorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefreshRef = useRef(false);

  useEffect(() => {
    const forceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;

    if (preset === 'custom') {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        setRefreshing(false);
        return;
      }
    }

    // Promotions / Marketers need org; Sponsors uses logged-in marketer user id.
    if (tab !== 'sponsors' && !organizationId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const customRange =
      preset === 'custom' ? { start: new Date(customStart), end: new Date(customEnd) } : null;

    const run = async () => {
      if (tab === 'promotions') {
        const r = await getTopPromotionsAnalytics({
          organizationId: organizationId!,
          preset,
          customRange,
          forceRefresh,
        });
        if (!cancelled) setPromotionRows(r);
        return;
      }
      if (tab === 'marketers') {
        const r = await getTopMarketersAnalytics({
          organizationId: organizationId!,
          preset,
          customRange,
          forceRefresh,
        });
        if (!cancelled) setMarketerRows(r);
        return;
      }
      // sponsors
      let marketerUserId: string | null | undefined;
      if (isReadOnly) {
        // Operator Mode: the viewed member's sponsors, never the operator's own.
        marketerUserId = viewingMemberId;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        marketerUserId = auth.user?.id;
      }
      if (!marketerUserId) {
        if (!cancelled) {
          setSponsorRows([]);
          setError('Sign in to view sponsor revenue');
        }
        return;
      }
      const r = await getTopSponsorsAnalytics({
        marketerUserId,
        preset,
        customRange,
        forceRefresh,
      });
      if (!cancelled) setSponsorRows(r);
    };

    run()
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load rankings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, tab, preset, customStart, customEnd, refreshKey, isReadOnly, viewingMemberId]);

  const rankedPromotions = useMemo(
    () => rankTopPromotions(promotionRows, metric),
    [promotionRows, metric],
  );
  const rankedMarketers = useMemo(
    () => rankTopMarketers(marketerRows, metric),
    [marketerRows, metric],
  );
  const rankedSponsors = useMemo(() => {
    const m =
      metric === 'sessions' ? 'revenue' : (metric as 'revenue' | 'clicks' | 'conversions' | 'rpc');
    return rankTopSponsors(sponsorRows, m);
  }, [sponsorRows, metric]);

  const ranked =
    tab === 'promotions' ? rankedPromotions : tab === 'marketers' ? rankedMarketers : rankedSponsors;
  const visible = ranked.slice(0, INITIAL_VISIBLE);
  const hasMore = ranked.length > INITIAL_VISIBLE;

  const switchTab = (next: RankingTab) => {
    if (next === tab) return;
    setTab(next);
    setShowAll(false);
    setExpanded(new Set());
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Sponsors tab can render without org; other tabs need org
  if (tab !== 'sponsors' && !organizationId) return null;

  const emptyLabel =
    tab === 'promotions'
      ? 'No promotion activity yet'
      : tab === 'marketers'
        ? 'No marketer activity yet'
        : 'No sponsor relationships yet';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 overflow-x-auto">
          <button
            onClick={() => switchTab('promotions')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${
              tab === 'promotions' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <TrendingUp size={12} className={tab === 'promotions' ? 'text-red-500' : ''} />
            Top Promotions
          </button>
          <button
            onClick={() => switchTab('marketers')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${
              tab === 'marketers' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Users size={12} className={tab === 'marketers' ? 'text-red-500' : ''} />
            Top Marketers
          </button>
          <button
            onClick={() => switchTab('sponsors')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${
              tab === 'sponsors' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Building2 size={12} className={tab === 'sponsors' ? 'text-amber-500' : ''} />
            Top Sponsors
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={metric}
            hidden
            onChange={(e) => setMetric(e.target.value as Metric)}
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
            onChange={(e) => setPreset(e.target.value as Preset)}
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
            disabled={loading || refreshing || (tab !== 'sponsors' && !organizationId)}
            onClick={() => {
              forceRefreshRef.current = true;
              setRefreshing(true);
              setRefreshKey((k) => k + 1);
            }}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px] font-bold uppercase tracking-wide rounded-lg px-2 py-1.5 hover:border-zinc-600 disabled:opacity-50"
            title="Recompute from canonical conversions"
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
        <div className="text-zinc-600 text-xs text-center py-6">{emptyLabel}</div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="divide-y divide-zinc-800/70">
          {tab === 'promotions' &&
            (visible as TopPromotionRow[]).map((row, i) => (
              <PromotionRankRow
                key={row.promotionId}
                rank={i + 1}
                row={row}
                metric={metric}
                onClick={() => navigate(`/marketplace/promotions/${row.promotionId}`)}
              />
            ))}
          {tab === 'marketers' &&
            (visible as MarketerRow[]).map((row, i) => (
              <MarketerRankRow
                key={row.marketerId}
                rank={i + 1}
                row={row}
                metric={metric}
                expanded={expanded.has(row.marketerId)}
                onToggle={() => toggleExpanded(row.marketerId)}
                onPromotionClick={(id) => navigate(`/marketplace/promotions/${id}`)}
              />
            ))}
          {tab === 'sponsors' &&
            (visible as SponsorRow[]).map((row, i) => (
              <SponsorRankRow
                key={row.sponsorOrganizationId}
                rank={i + 1}
                row={row}
                metric={metric}
                expanded={expanded.has(row.sponsorOrganizationId)}
                onToggle={() => toggleExpanded(row.sponsorOrganizationId)}
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
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  {tab === 'promotions' && <TrendingUp size={16} className="text-red-500" />}
                  {tab === 'marketers' && <Users size={16} className="text-red-500" />}
                  {tab === 'sponsors' && <Building2 size={16} className="text-amber-500" />}
                  {tab === 'promotions'
                    ? 'Top Promotions'
                    : tab === 'marketers'
                      ? 'Top Marketers'
                      : 'Top Sponsors'}
                </h2>
                <button
                  onClick={() => setShowAll(false)}
                  className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto -mx-2 px-2 divide-y divide-zinc-800/70">
                {tab === 'promotions' &&
                  rankedPromotions.map((row, i) => (
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
                {tab === 'marketers' &&
                  rankedMarketers.map((row, i) => (
                    <MarketerRankRow
                      key={row.marketerId}
                      rank={i + 1}
                      row={row}
                      metric={metric}
                      expanded={expanded.has(row.marketerId)}
                      onToggle={() => toggleExpanded(row.marketerId)}
                      onPromotionClick={(id) => {
                        setShowAll(false);
                        navigate(`/marketplace/promotions/${id}`);
                      }}
                    />
                  ))}
                {tab === 'sponsors' &&
                  rankedSponsors.map((row, i) => (
                    <SponsorRankRow
                      key={row.sponsorOrganizationId}
                      rank={i + 1}
                      row={row}
                      metric={metric}
                      expanded={expanded.has(row.sponsorOrganizationId)}
                      onToggle={() => toggleExpanded(row.sponsorOrganizationId)}
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
  metric: Metric;
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
          {row.marketer && <p className="text-zinc-500 text-[11px] truncate">{row.marketer}</p>}
        </div>
      </div>
      <span className="text-white text-sm font-bold shrink-0">
        {formatMetric(row[metric], metric)}
      </span>
    </button>
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
  metric: Metric;
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
              {row.promotions.map((p) => (
                <button
                  key={p.promotionId}
                  onClick={() => onPromotionClick(p.promotionId)}
                  className="w-full flex items-center justify-between gap-2 text-left py-1 px-2 -mx-2 rounded-md hover:bg-zinc-800/40 transition-colors"
                >
                  <span className="text-zinc-400 text-xs truncate">{p.title}</span>
                  {hasMultiple && (
                    <span className="text-zinc-600 text-[11px] shrink-0">
                      {p.revenue.toLocaleString(undefined, {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                      })}
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

function SponsorRankRow({
  rank,
  row,
  metric,
  expanded,
  onToggle,
}: {
  rank: number;
  row: SponsorRow;
  metric: Metric;
  expanded: boolean;
  onToggle: () => void;
}) {
  const value =
    metric === 'sessions'
      ? row.revenue
      : metric === 'clicks'
        ? row.clicks
        : metric === 'conversions'
          ? row.conversions
          : metric === 'rpc'
            ? row.rpc
            : row.revenue;
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
            <p className="text-zinc-200 text-sm font-semibold truncate">{row.sponsorName}</p>
            <p className="text-zinc-500 text-[11px] truncate">
              {row.promotions.length} {row.promotions.length === 1 ? 'promotion' : 'promotions'}
            </p>
          </div>
        </div>
        <span className="text-white text-sm font-bold shrink-0">
          {formatMetric(value, metric === 'sessions' ? 'revenue' : metric)}
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
              {row.promotions.length === 0 && (
                <p className="text-zinc-600 text-[11px] px-2">No promotion breakdown</p>
              )}
              {row.promotions.map((p) => (
                <div
                  key={p.promotionId}
                  className="w-full flex items-center justify-between gap-2 py-1 px-2 -mx-2"
                >
                  <span className="text-zinc-400 text-xs truncate">{p.title}</span>
                  {hasMultiple && (
                    <span className="text-zinc-600 text-[11px] shrink-0">
                      {p.revenue.toLocaleString(undefined, {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
