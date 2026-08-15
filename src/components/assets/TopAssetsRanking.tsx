/**
 * src/components/assets/TopAssetsRanking.tsx
 *
 * "Top Assets" ranking section for Assets.tsx. Four tabs — Campaign
 * Elements, Promotional Videos, Resources, Content Videos — each ranked by
 * a user-selectable metric (Revenue / Clicks / Sessions / Conversions /
 * RPC), sourced entirely from assetAnalyticsEngine.ts via the batched
 * getAssetAnalyticsBatch() service. No second attribution system, no new
 * thumbnail system — thumbnails reuse the exact resolver branch Assets.tsx
 * already uses in fromMyRow().
 *
 * Classification:
 *   - Campaign Elements = asset_type 'campaign_element'
 *   - Resources         = asset_type 'resource'
 *   - Videos            = asset_type 'video', split into:
 *       Promotional Videos = video asset ids returned by
 *         getPromotionalVideoAssetIds() (redirect_links.asset_id = the
 *         video's own asset id)
 *       Content Videos      = every other video asset
 *
 * Analytics are batch-fetched ONCE per (dateRange, activeSource,
 * candidate-id-set) change — covers all four tabs — so switching tabs or
 * the rank-by metric afterward is instant, no refetch.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Loader2, TrendingUp } from 'lucide-react';
import {
  resolveThumbnail,
  resolveAssetThumbnail,
  resolveElementThumbnail,
  getElementTypeLabel,
  RESOURCE_TYPE_LABELS,
  type ResourceType,
  type CampaignElementType,
} from '../../lib/videoFormatters';
import type { AssetLibraryRow } from '../../services/asset/listAssetsByOrganization';
import {
  getAssetAnalyticsBatch,
  getPromotionalVideoAssetIds,
} from '../../services/asset/getAssetAnalyticsBatch';
import type { AssetMetrics, ActiveSource } from '../../lib/assetAnalyticsEngine';
import type { DateRange } from '../../lib/assetAnalyticsEngine';

type RankingCategory = 'campaign_element' | 'promotional_video' | 'resource' | 'content_video';
type RankMetric = 'revenue' | 'clicks' | 'sessions' | 'conversions' | 'rpc';

const CATEGORY_LABELS: Record<RankingCategory, string> = {
  campaign_element: 'Campaign Elements',
  promotional_video: 'Promotional Videos',
  resource: 'Resources',
  content_video: 'Content Videos',
};

const RANK_METRIC_LABELS: Record<RankMetric, string> = {
  revenue: 'Revenue',
  clicks: 'Clicks',
  sessions: 'Sessions',
  conversions: 'Conversions',
  rpc: 'RPC',
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  '7days': 'Last 7 Days',
  '30days': 'Last 30 Days',
  thismonth: 'This Month',
  '2months': 'Last 2 Months',
  '6months': 'Last 6 Months',
  '1year': 'Last Year',
  all: 'All Time',
  custom: 'Custom',
};

const DATE_RANGE_ORDER: DateRange[] = ['7days', '30days', 'thismonth', '2months', '6months', '1year', 'all', 'custom'];

const INITIAL_VISIBLE = 5;

function resolveRowThumbnail(row: AssetLibraryRow): string | null {
  if (row.asset_type === 'campaign_element') {
    return resolveElementThumbnail(row.element_type as CampaignElementType);
  }
  if (row.resource_type) {
    return resolveAssetThumbnail({
      thumbnail_url: row.thumbnail_url,
      resource_type: row.resource_type,
      platform: row.platform,
    });
  }
  return resolveThumbnail(row);
}

function typeLabelForRow(row: AssetLibraryRow): string {
  if (row.asset_type === 'campaign_element') {
    return getElementTypeLabel(row.element_type as CampaignElementType);
  }
  if (row.resource_type) {
    return RESOURCE_TYPE_LABELS[row.resource_type as ResourceType] ?? row.resource_type;
  }
  return row.platform ?? 'Video';
}

const EMPTY_METRICS: AssetMetrics = { clicks: 0, sessions: 0, conversions: 0, revenue: 0, rpc: 0 };

interface TopAssetsRankingProps {
  organizationId: string;
  /** Org-owned asset rows Assets.tsx already fetched via listAssetsByOrganization — reused as-is, no refetch. */
  rows: AssetLibraryRow[];
}

export default function TopAssetsRanking({ organizationId, rows }: TopAssetsRankingProps) {
  const [activeCategory, setActiveCategory] = useState<RankingCategory>('campaign_element');
  const [rankMetric, setRankMetric] = useState<RankMetric>('revenue');
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeSource, setActiveSource] = useState<ActiveSource>('total');
  const [expanded, setExpanded] = useState(false);

  const [promotionalVideoIds, setPromotionalVideoIds] = useState<Set<string>>(new Set());
  const [metricsMap, setMetricsMap] = useState<Map<string, AssetMetrics>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const campaignElementRows = useMemo(() => rows.filter(r => r.asset_type === 'campaign_element'), [rows]);
  const resourceRows = useMemo(() => rows.filter(r => r.asset_type === 'resource'), [rows]);
  const videoRows = useMemo(() => rows.filter(r => r.asset_type === 'video'), [rows]);

  const videoIdsKey = useMemo(() => videoRows.map(r => r.id).sort().join(','), [videoRows]);

  // Classify videos into Promotional vs Content — refetched only when the
  // set of video asset ids actually changes, not on every render.
  useEffect(() => {
    if (!organizationId || videoRows.length === 0) {
      setPromotionalVideoIds(new Set());
      return;
    }
    let cancelled = false;
    getPromotionalVideoAssetIds(organizationId, videoRows.map(r => r.id))
      .then(ids => {
        if (!cancelled) setPromotionalVideoIds(ids);
      })
      .catch(() => {
        if (!cancelled) setPromotionalVideoIds(new Set());
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, videoIdsKey]);

  const promotionalVideoRows = useMemo(
    () => videoRows.filter(r => promotionalVideoIds.has(r.id)),
    [videoRows, promotionalVideoIds],
  );
  const contentVideoRows = useMemo(
    () => videoRows.filter(r => !promotionalVideoIds.has(r.id)),
    [videoRows, promotionalVideoIds],
  );

  const rowsByCategory: Record<RankingCategory, AssetLibraryRow[]> = {
    campaign_element: campaignElementRows,
    promotional_video: promotionalVideoRows,
    resource: resourceRows,
    content_video: contentVideoRows,
  };

  const allCandidateIds = useMemo(
    () => rows.filter(r => r.asset_type !== undefined).map(r => r.id),
    [rows],
  );
  const candidateIdsKey = useMemo(() => [...allCandidateIds].sort().join(','), [allCandidateIds]);

  const assetTypeById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rows) map[r.id] = r.asset_type;
    return map;
  }, [rows]);

  const customRange = useMemo(() => {
    if (dateRange !== 'custom' || !customStart || !customEnd) return null;
    return { start: customStart, end: customEnd };
  }, [dateRange, customStart, customEnd]);

  // Single batched fetch covering all four tabs — refetches only when the
  // date range, source, or candidate asset set changes. Tab/metric
  // switches afterward are instant.
  useEffect(() => {
    if (!organizationId || allCandidateIds.length === 0) {
      setMetricsMap(new Map());
      return;
    }
    if (dateRange === 'custom' && !customRange) return; // wait for both custom dates

    let cancelled = false;
    setLoading(true);
    setError(null);
    getAssetAnalyticsBatch({
      assetIds: allCandidateIds,
      assetTypeById,
      organizationId,
      dateRange,
      customRange,
      activeSource,
    })
      .then(map => {
        if (!cancelled) setMetricsMap(map);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Could not load asset rankings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, candidateIdsKey, dateRange, customRange, activeSource]);

  useEffect(() => {
    setExpanded(false);
  }, [activeCategory]);

  const sortedCategoryRows = useMemo(() => {
    const categoryRows = rowsByCategory[activeCategory];
    return [...categoryRows].sort((a, b) => {
      const ma = metricsMap.get(a.id) ?? EMPTY_METRICS;
      const mb = metricsMap.get(b.id) ?? EMPTY_METRICS;
      return mb[rankMetric] - ma[rankMetric];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, metricsMap, rankMetric, campaignElementRows, promotionalVideoRows, resourceRows, contentVideoRows]);

  const visibleRows = expanded ? sortedCategoryRows : sortedCategoryRows.slice(0, INITIAL_VISIBLE);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-red-600" />
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Top Assets</h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Rank by */}
          <div className="relative">
            <select
              value={rankMetric}
              onChange={e => setRankMetric(e.target.value as RankMetric)}
              className="appearance-none bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px] font-black uppercase tracking-widest rounded-lg pl-3 pr-7 py-1.5"
            >
              {(Object.keys(RANK_METRIC_LABELS) as RankMetric[]).map(m => (
                <option key={m} value={m}>
                  Rank by: {RANK_METRIC_LABELS[m]}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600" />
          </div>

          {/* Date range */}
          <div className="relative">
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value as DateRange)}
              className="appearance-none bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px] font-black uppercase tracking-widest rounded-lg pl-3 pr-7 py-1.5"
            >
              {DATE_RANGE_ORDER.map(dr => (
                <option key={dr} value={dr}>
                  {DATE_RANGE_LABELS[dr]}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600" />
          </div>

          {/* Active source */}
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
            {(['stripe', 'pixel', 'total'] as ActiveSource[]).map(src => (
              <button
                key={src}
                onClick={() => setActiveSource(src)}
                className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md transition-all ${
                  activeSource === src ? 'bg-red-600 text-white' : 'text-zinc-500 hover:text-white'
                }`}
              >
                {src}
              </button>
            ))}
          </div>
        </div>
      </div>

      {dateRange === 'custom' && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
          />
          <span className="text-zinc-600 text-xs">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2 py-1.5"
          />
        </div>
      )}

      {/* Category tabs */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {(Object.keys(CATEGORY_LABELS) as RankingCategory[]).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
              activeCategory === cat ? 'bg-red-600 text-white' : 'bg-zinc-950 text-zinc-500 hover:text-white'
            }`}
          >
            {CATEGORY_LABELS[cat]} ({rowsByCategory[cat].length})
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-xs py-4">
          <Loader2 size={14} className="animate-spin" /> Loading rankings...
        </div>
      )}

      {error && <div className="text-red-500 text-xs py-2">{error}</div>}

      {!loading && !error && sortedCategoryRows.length === 0 && (
        <p className="text-zinc-600 text-xs py-4">No {CATEGORY_LABELS[activeCategory].toLowerCase()} yet.</p>
      )}

      {!loading && !error && sortedCategoryRows.length > 0 && (
        <div className="space-y-1">
          {visibleRows.map(row => {
            const m = metricsMap.get(row.id) ?? EMPTY_METRICS;
            return (
              <Link
                key={row.id}
                to={`/assets/${row.id}`}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-950 transition-all"
              >
                <div className="w-12 h-8 overflow-hidden rounded-md border border-zinc-800 flex-shrink-0">
                  <img src={resolveRowThumbnail(row) ?? undefined} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{row.video_title || 'Untitled'}</p>
                  <p className="text-[9px] font-bold uppercase text-zinc-500 tracking-wide">{typeLabelForRow(row)}</p>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
                  <div>
                    <p className="text-[9px] uppercase text-zinc-600 tracking-widest">Clicks</p>
                    <p className="text-xs font-bold text-zinc-200">{m.clicks}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-zinc-600 tracking-widest">Sessions</p>
                    <p className="text-xs font-bold text-zinc-200">{m.sessions}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-zinc-600 tracking-widest">Conv.</p>
                    <p className="text-xs font-bold text-zinc-200">{m.conversions}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-zinc-600 tracking-widest">Revenue</p>
                    <p className="text-xs font-bold text-white">${m.revenue.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase text-zinc-600 tracking-widest">RPC</p>
                    <p className="text-xs font-bold text-zinc-200">${m.rpc.toFixed(2)}</p>
                  </div>
                </div>
              </Link>
            );
          })}

          {sortedCategoryRows.length > INITIAL_VISIBLE && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-full text-center text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white py-2"
            >
              {expanded ? 'Show less' : `View all (${sortedCategoryRows.length}) →`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
