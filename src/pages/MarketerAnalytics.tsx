/**
 * src/pages/MarketerAnalytics.tsx
 *
 * ONE page for both "All Marketers" and "Specific Marketer" — see
 * getMarketerAnalytics.ts for the full scope-resolution chain this page is
 * built on:
 *
 *   Marketer (accepted assignment_collaborator)
 *     ↓ getTopMarketersAnalytics()            [marketer identity + "All Marketers" ranking]
 *   Promotion(s) that marketer is assigned to  [MarketerRow.promotions]
 *     ↓ resolvePromotionAssetIds()             [promotion → assignment → assignment_assets]
 *   Scoped asset pool
 *     ↓ resolveAssetType.ts vocabulary + getPromotionalVideoAssetIds()
 *   4 content-type tables (Campaign Elements / Promotional Videos / Resources / Content Videos)
 *
 * A marketer's content is NEVER "every asset they own" — see the file
 * header of getMarketerAnalytics.ts for the locked scope rule.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  TrendingUp,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Image as ImageIcon,
} from 'lucide-react';
import { useEffectiveIdentity } from '../lib/useEffectiveIdentity';
import { useViewing } from '../lib/ViewingContext';
import type { DateRange } from '../lib/analyticsEngine';
import type { ActiveSource } from '../lib/assetAnalyticsEngine';
import {
  getMarketersForOrg,
  getMarketerContentAnalytics,
  rankTopMarketers,
  type MarketerRow,
  type TopMarketersMetric,
  type MarketerContentAnalyticsResult,
  type PromotionalVideoRow,
  type ContentAssetRow,
} from '../services/promotion/getMarketerAnalytics';
import type { CampaignElementMetricRow } from '../lib/campaignElementAnalyticsEngine';
import {
  resolveThumbnail,
  resolveAssetThumbnail,
  resolveElementThumbnail,
  getElementTypeLabel,
  RESOURCE_TYPE_LABELS,
  type ResourceType,
  type CampaignElementType,
} from '../lib/videoFormatters';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';

// ── Shared date-range control — identical set/order to TopAssetsRanking.tsx
// and every other engine on this page. Not a new date system. ─────────────
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

type Mode = 'all' | 'specific';
type AssetTab = 'campaign_element' | 'promotional_video' | 'resource' | 'content_video';

const ASSET_TABS: { key: AssetTab; label: string }[] = [
  { key: 'campaign_element', label: 'Campaign Elements' },
  { key: 'promotional_video', label: 'Promotional Videos' },
  { key: 'resource', label: 'Resources' },
  { key: 'content_video', label: 'Content Videos' },
];

const RANK_METRICS: { key: TopMarketersMetric; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'rpc', label: 'RPC' },
];

const INITIAL_VISIBLE = 5;

function currency(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function wholeCurrency(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

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

export default function MarketerAnalytics() {
  const navigate = useNavigate();
  const { organizationId: orgId, isReadOnly } = useEffectiveIdentity();
  const { viewingOrgId } = useViewing();
  const organizationId = isReadOnly ? viewingOrgId : orgId;

  const [mode, setMode] = useState<Mode>('all');

  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeSource, setActiveSource] = useState<ActiveSource>('total');

  const customRange = useMemo(() => {
    if (dateRange !== 'custom' || !customStart || !customEnd) return null;
    return { start: customStart, end: customEnd };
  }, [dateRange, customStart, customEnd]);

  // ── Marketers — powers both "All Marketers" ranking and the Specific
  // Marketer dropdown + its promotion list. One fetch, reused everywhere. ──
  const [marketers, setMarketers] = useState<MarketerRow[]>([]);
  const [marketersLoading, setMarketersLoading] = useState(true);
  const [marketersError, setMarketersError] = useState<string | null>(null);
  const [rankMetric, setRankMetric] = useState<TopMarketersMetric>('revenue');
  const [showAllMarketers, setShowAllMarketers] = useState(false);
  const [expandedMarketerId, setExpandedMarketerId] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setMarketersLoading(false);
      return;
    }
    if (dateRange === 'custom' && !customRange) return;

    let cancelled = false;
    setMarketersLoading(true);
    setMarketersError(null);
    getMarketersForOrg(organizationId, dateRange, customRange)
      .then(rows => {
        if (!cancelled) setMarketers(rows);
      })
      .catch(err => {
        if (!cancelled) setMarketersError(err?.message ?? 'Failed to load marketers');
      })
      .finally(() => {
        if (!cancelled) setMarketersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, dateRange, customRange]);

  const rankedMarketers = useMemo(() => rankTopMarketers(marketers, rankMetric), [marketers, rankMetric]);

  // ── Specific Marketer mode ──────────────────────────────────────────────
  const [selectedMarketerId, setSelectedMarketerId] = useState<string>('');
  const [selectedPromotionId, setSelectedPromotionId] = useState<string>('all');

  const selectedMarketer = marketers.find(m => m.marketerId === selectedMarketerId) ?? null;

  // Default to the first marketer once the list loads, in specific mode.
  useEffect(() => {
    if (mode === 'specific' && !selectedMarketerId && marketers.length > 0) {
      setSelectedMarketerId(marketers[0].marketerId);
    }
  }, [mode, marketers, selectedMarketerId]);

  useEffect(() => {
    setSelectedPromotionId('all');
  }, [selectedMarketerId]);

  const scopedPromotionIds = useMemo(() => {
    if (!selectedMarketer) return [];
    return selectedPromotionId === 'all'
      ? selectedMarketer.promotions.map(p => p.promotionId)
      : [selectedPromotionId];
  }, [selectedMarketer, selectedPromotionId]);

  // ── Content analytics for the resolved marketer/promotion scope ────────
  const [content, setContent] = useState<MarketerContentAnalyticsResult | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [assetTab, setAssetTab] = useState<AssetTab>('campaign_element');
  const [platformTab, setPlatformTab] = useState<string>('all');

  useEffect(() => {
    if (mode !== 'specific' || !organizationId || scopedPromotionIds.length === 0) {
      setContent(null);
      return;
    }
    if (dateRange === 'custom' && !customRange) return;

    let cancelled = false;
    setContentLoading(true);
    setContentError(null);
    getMarketerContentAnalytics({
      organizationId,
      promotionIds: scopedPromotionIds,
      dateRange,
      customRange,
      activeSource,
    })
      .then(result => {
        if (!cancelled) setContent(result);
      })
      .catch(err => {
        if (!cancelled) setContentError(err?.message ?? 'Failed to load content analytics');
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, organizationId, scopedPromotionIds.join(','), dateRange, customRange, activeSource]);

  useEffect(() => {
    setPlatformTab('all');
  }, [content]);

  // Platform filter narrows displayed rows only — never expands scope
  // (item 12). Applied client-side to already-scoped data.
  const filterByPlatform = <T extends { platform: string | null }>(rows: T[]): T[] =>
    platformTab === 'all' ? rows : rows.filter(r => r.platform === platformTab);

  const visibleCampaignElements = content?.campaignElements ?? [];
  const visiblePromotionalVideos = content ? filterByPlatform<PromotionalVideoRow>(content.promotionalVideos) : [];
  const visibleResources = content ? filterByPlatform<ContentAssetRow>(content.resources) : [];
  const visibleContentVideos = content ? filterByPlatform<ContentAssetRow>(content.contentVideos) : [];

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <Loader2 className="animate-spin text-zinc-600" size={24} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate('/marketplace')}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-[11px] font-bold uppercase tracking-widest mb-4 transition-colors"
        >
          <ArrowLeft size={12} />
          Marketplace
        </button>

        <div className="flex items-center gap-3 mb-1">
          <span className="w-2 h-2 rounded-full bg-red-600" />
          <h1 className="text-2xl font-bold">Marketer Analytics</h1>
        </div>
        <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest mb-6">
          What each marketer is actually promoting — and how it's performing
        </p>

        {/* ── Mode selector ────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 mb-4 w-fit">
          <button
            onClick={() => setMode('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${
              mode === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Users size={12} className={mode === 'all' ? 'text-red-500' : ''} />
            All Marketers
          </button>
          <button
            onClick={() => setMode('specific')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${
              mode === 'specific' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <TrendingUp size={12} className={mode === 'specific' ? 'text-red-500' : ''} />
            Specific Marketer
          </button>
        </div>

        {/* ── Shared date range / source controls ─────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative">
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value as DateRange)}
              className="appearance-none bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-black uppercase tracking-widest rounded-lg pl-3 pr-7 py-1.5"
            >
              {DATE_RANGE_ORDER.map(dr => (
                <option key={dr} value={dr}>
                  {DATE_RANGE_LABELS[dr]}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600" />
          </div>
          {dateRange === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={e => setCustomStart(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1.5"
              />
              <span className="text-zinc-600 text-[11px]">to</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={e => setCustomEnd(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] rounded-lg px-2 py-1.5"
              />
            </>
          )}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
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

        {mode === 'all' ? (
          <AllMarketersTable
            loading={marketersLoading}
            error={marketersError}
            ranked={rankedMarketers}
            rankMetric={rankMetric}
            setRankMetric={setRankMetric}
            showAll={showAllMarketers}
            setShowAll={setShowAllMarketers}
            expandedMarketerId={expandedMarketerId}
            setExpandedMarketerId={setExpandedMarketerId}
            onDrillIn={id => {
              setSelectedMarketerId(id);
              setMode('specific');
            }}
          />
        ) : (
          <>
            {/* ── Marketer + Promotion selectors ─────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <div className="relative">
                <select
                  value={selectedMarketerId}
                  onChange={e => setSelectedMarketerId(e.target.value)}
                  disabled={marketersLoading || marketers.length === 0}
                  className="appearance-none bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-bold rounded-lg pl-3 pr-8 py-2 disabled:opacity-50"
                >
                  {marketers.length === 0 && <option value="">No marketers yet</option>}
                  {marketers.map(m => (
                    <option key={m.marketerId} value={m.marketerId}>
                      {m.marketerName}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              </div>

              {selectedMarketer && selectedMarketer.promotions.length > 0 && (
                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 flex-wrap">
                  <button
                    onClick={() => setSelectedPromotionId('all')}
                    className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-md transition-all ${
                      selectedPromotionId === 'all' ? 'bg-red-600 text-white' : 'text-zinc-500 hover:text-white'
                    }`}
                  >
                    All Promotions
                  </button>
                  {selectedMarketer.promotions.map(p => (
                    <button
                      key={p.promotionId}
                      onClick={() => setSelectedPromotionId(p.promotionId)}
                      className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-md transition-all truncate max-w-[160px] ${
                        selectedPromotionId === p.promotionId ? 'bg-red-600 text-white' : 'text-zinc-500 hover:text-white'
                      }`}
                      title={p.title}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {marketersLoading && (
              <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                <Loader2 className="animate-spin" size={16} /> Loading marketers…
              </div>
            )}

            {!marketersLoading && marketers.length === 0 && (
              <div className="text-zinc-600 text-sm border border-dashed border-zinc-800 rounded-xl p-8 text-center">
                No marketer activity yet for this date range.
              </div>
            )}

            {selectedMarketer && (
              <>
                {/* ── Asset-type tabs ─────────────────────────────────── */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {ASSET_TABS.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setAssetTab(tab.key)}
                      className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                        assetTab === tab.key ? 'bg-red-600 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white'
                      }`}
                    >
                      {tab.label}
                      {content && (
                        <span className="ml-1.5 opacity-70">
                          ({tab.key === 'campaign_element'
                            ? content.campaignElements.length
                            : tab.key === 'promotional_video'
                              ? content.promotionalVideos.length
                              : tab.key === 'resource'
                                ? content.resources.length
                                : content.contentVideos.length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* ── Platform tabs — real values found in scope only ──── */}
                {content && content.platforms.length > 0 && assetTab !== 'campaign_element' && (
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    <button
                      onClick={() => setPlatformTab('all')}
                      className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-all ${
                        platformTab === 'all' ? 'bg-zinc-800 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white'
                      }`}
                    >
                      All
                    </button>
                    {content.platforms.map(p => (
                      <button
                        key={p}
                        onClick={() => setPlatformTab(p)}
                        className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md transition-all ${
                          platformTab === p ? 'bg-zinc-800 text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}

                {contentLoading && (
                  <div className="flex items-center gap-2 text-zinc-500 text-sm py-6">
                    <Loader2 className="animate-spin" size={16} /> Loading content…
                  </div>
                )}
                {contentError && (
                  <div className="text-red-500 text-sm border border-red-900 bg-red-950/30 rounded-lg p-4 mb-4">
                    {contentError}
                  </div>
                )}

                {!contentLoading && !contentError && content && (
                  <>
                    {assetTab === 'campaign_element' && <CampaignElementTable rows={visibleCampaignElements} />}
                    {assetTab === 'promotional_video' && <PromotionalVideoTable rows={visiblePromotionalVideos} />}
                    {assetTab === 'resource' && <ResourceTable rows={visibleResources} />}
                    {assetTab === 'content_video' && <ContentVideoTable rows={visibleContentVideos} />}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// All Marketers ranking table
// ═════════════════════════════════════════════════════════════════════════

function AllMarketersTable({
  loading,
  error,
  ranked,
  rankMetric,
  setRankMetric,
  showAll,
  setShowAll,
  expandedMarketerId,
  setExpandedMarketerId,
  onDrillIn,
}: {
  loading: boolean;
  error: string | null;
  ranked: MarketerRow[];
  rankMetric: TopMarketersMetric;
  setRankMetric: (m: TopMarketersMetric) => void;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  expandedMarketerId: string | null;
  setExpandedMarketerId: (id: string | null) => void;
  onDrillIn: (marketerId: string) => void;
}) {
  const visible = showAll ? ranked : ranked.slice(0, INITIAL_VISIBLE);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-black uppercase tracking-widest text-white">Marketer Ranking</h2>
        <div className="relative">
          <select
            value={rankMetric}
            onChange={e => setRankMetric(e.target.value as TopMarketersMetric)}
            className="appearance-none bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px] font-black uppercase tracking-widest rounded-lg pl-3 pr-7 py-1.5"
          >
            {RANK_METRICS.map(m => (
              <option key={m.key} value={m.key}>
                Rank by: {m.label}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600" />
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-xs py-4">
          <Loader2 size={14} className="animate-spin" /> Loading marketers...
        </div>
      )}
      {error && <div className="text-red-500 text-xs py-2">{error}</div>}
      {!loading && !error && ranked.length === 0 && (
        <div className="text-zinc-600 text-xs py-4 text-center">No marketer activity yet.</div>
      )}

      {!loading && !error && ranked.length > 0 && (
        <>
          <div className="grid grid-cols-[1.6fr_0.6fr_0.7fr_0.7fr_0.8fr_0.8fr_0.7fr] gap-2 px-2 pb-2 text-[9px] font-black uppercase tracking-widest text-zinc-600">
            <span>Marketer</span>
            <span className="text-right">Promos</span>
            <span className="text-right">Clicks</span>
            <span className="text-right">Sessions</span>
            <span className="text-right">Conv.</span>
            <span className="text-right">Revenue</span>
            <span className="text-right">RPC</span>
          </div>
          <div className="divide-y divide-zinc-800/70">
            {visible.map(row => (
              <div key={row.marketerId}>
                <button
                  onClick={() => setExpandedMarketerId(expandedMarketerId === row.marketerId ? null : row.marketerId)}
                  className="w-full grid grid-cols-[1.6fr_0.6fr_0.7fr_0.7fr_0.8fr_0.8fr_0.7fr] gap-2 items-center px-2 py-2.5 text-left hover:bg-zinc-800/40 rounded-lg transition-colors"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <ChevronDown
                      size={11}
                      className={`shrink-0 text-zinc-600 transition-transform ${
                        expandedMarketerId === row.marketerId ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                    <span className="text-zinc-200 text-xs font-semibold truncate">{row.marketerName}</span>
                  </span>
                  <span className="text-right text-zinc-400 text-xs">{row.promotions.length}</span>
                  <span className="text-right text-zinc-400 text-xs">{row.clicks.toLocaleString()}</span>
                  <span className="text-right text-zinc-400 text-xs">{row.sessions.toLocaleString()}</span>
                  <span className="text-right text-zinc-400 text-xs">{row.conversions.toLocaleString()}</span>
                  <span className="text-right text-white text-xs font-bold">{wholeCurrency(row.revenue)}</span>
                  <span className="text-right text-zinc-400 text-xs">{currency(row.rpc)}</span>
                </button>

                {expandedMarketerId === row.marketerId && (
                  <div className="pl-6 pb-2 space-y-1">
                    {row.promotions.map(p => (
                      <div key={p.promotionId} className="flex items-center justify-between gap-2 py-1 px-2 -mx-2 rounded-md hover:bg-zinc-800/40">
                        <span className="text-zinc-400 text-xs truncate">{p.title}</span>
                        <span className="text-zinc-600 text-[11px] shrink-0">{wholeCurrency(p.revenue)}</span>
                      </div>
                    ))}
                    <button
                      onClick={() => onDrillIn(row.marketerId)}
                      className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 pt-1 px-2"
                    >
                      View marketer content
                      <ChevronRight size={11} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {!showAll && ranked.length > INITIAL_VISIBLE && (
            <div className="flex justify-end mt-2">
              <button
                onClick={() => setShowAll(true)}
                className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
              >
                View all ({ranked.length})
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Content tables
// ═════════════════════════════════════════════════════════════════════════

function Thumb({ row }: { row: AssetLibraryRow }) {
  const src = resolveRowThumbnail(row);
  return (
    <div className="w-11 h-8 overflow-hidden rounded-md border border-zinc-800 flex-shrink-0 bg-zinc-950 flex items-center justify-center">
      {src ? <img src={src} className="w-full h-full object-cover" /> : <ImageIcon size={12} className="text-zinc-700" />}
    </div>
  );
}

function EmptyTable({ label }: { label: string }) {
  return (
    <div className="text-zinc-600 text-xs border border-dashed border-zinc-800 rounded-xl p-8 text-center">
      {label}
    </div>
  );
}

const CE_COLUMNS: { key: keyof CampaignElementMetricRow; label: string; kind: 'int' | 'currency' }[] = [
  { key: 'landing_page_view', label: 'Landing Page Clicks', kind: 'int' },
  { key: 'purchase_thankyou', label: 'Direct Purchases', kind: 'int' },
  { key: 'lead_magnet_click', label: 'Lead Magnet Clicks', kind: 'int' },
  { key: 'newsletter_click', label: 'Newsletter Clicks', kind: 'int' },
  { key: 'newsletter_thankyou', label: 'Newsletter Opt-ins', kind: 'int' },
  { key: 'call_booking_click', label: 'Call Booking Clicks', kind: 'int' },
  { key: 'call_booking_thankyou', label: 'Call Bookings Confirmed', kind: 'int' },
  { key: 'consultation_click', label: 'Consultation Page Clicks', kind: 'int' },
  { key: 'consultation_thankyou', label: 'Consultation Purchases', kind: 'int' },
  { key: 'direct_offer_revenue', label: 'Direct Offer Sales', kind: 'currency' },
  { key: 'estimated_call_revenue', label: 'Estimated Call Revenue', kind: 'currency' },
  { key: 'consultation_revenue', label: 'Consultation Revenue', kind: 'currency' },
  { key: 'total_revenue', label: 'Total Revenue', kind: 'currency' },
  { key: 'rpc', label: 'RPC', kind: 'currency' },
];

function CampaignElementTable({ rows }: { rows: CampaignElementMetricRow[] }) {
  if (rows.length === 0) return <EmptyTable label="No campaign elements in this scope yet." />;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <table className="w-full text-xs min-w-[1400px]">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 sticky left-0 bg-zinc-900">
              Content
            </th>
            {CE_COLUMNS.map(col => (
              <th key={col.key} className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {rows.map(row => (
            <tr key={row.assetId} className="hover:bg-zinc-800/30">
              <td className="px-3 py-2.5 font-semibold text-zinc-200 truncate max-w-[200px] sticky left-0 bg-zinc-900">
                {row.displayName}
              </td>
              {CE_COLUMNS.map(col => (
                <td key={col.key} className="text-right px-3 py-2.5 text-zinc-300 whitespace-nowrap">
                  {col.kind === 'currency' ? currency(row[col.key] as number) : (row[col.key] as number).toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-zinc-600 px-3 py-2 border-t border-zinc-800">
        Newsletter Opt-ins, Call Bookings Confirmed, and Estimated Call Revenue are sourced only from pixel
        purchases, which this schema doesn't tie to a specific asset — so they read 0 per row even when
        non-zero for the promotion overall.
      </p>
    </div>
  );
}

function PromotionalVideoTable({ rows }: { rows: PromotionalVideoRow[] }) {
  if (rows.length === 0) return <EmptyTable label="No promotional videos in this scope yet." />;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Content</th>
            <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Platform</th>
            <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Promotes</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Clicks</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Sessions</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Conv.</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Revenue</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">RPC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-zinc-800/30">
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Thumb row={row} />
                  <span className="font-semibold text-zinc-200 truncate max-w-[220px]">{row.video_title || 'Untitled'}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-zinc-400">{row.platform ?? '—'}</td>
              <td className="px-3 py-2.5 text-zinc-400">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-zinc-950 border border-zinc-800 rounded-md px-1.5 py-0.5">
                  → {row.promotesLabel}
                </span>
              </td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{row.metrics.clicks.toLocaleString()}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{row.metrics.sessions.toLocaleString()}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{row.metrics.conversions.toLocaleString()}</td>
              <td className="text-right px-3 py-2.5 text-white font-bold">{currency(row.metrics.revenue)}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{currency(row.metrics.rpc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResourceTable({ rows }: { rows: ContentAssetRow[] }) {
  if (rows.length === 0) return <EmptyTable label="No resources in this scope yet." />;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Resource</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Clicks</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Sessions</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Conv.</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Revenue</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">RPC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-zinc-800/30">
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Thumb row={row} />
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-200 truncate max-w-[220px]">{row.video_title || 'Untitled'}</p>
                    <p className="text-[9px] uppercase text-zinc-600 tracking-wide">{typeLabelForRow(row)}</p>
                  </div>
                </div>
              </td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{row.metrics.clicks.toLocaleString()}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{row.metrics.sessions.toLocaleString()}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{row.metrics.conversions.toLocaleString()}</td>
              <td className="text-right px-3 py-2.5 text-white font-bold">{currency(row.metrics.revenue)}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{currency(row.metrics.rpc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContentVideoTable({ rows }: { rows: ContentAssetRow[] }) {
  if (rows.length === 0) return <EmptyTable label="No content videos in this scope yet." />;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Video</th>
            <th className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Platform</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Clicks</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Sessions</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Conv.</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Revenue</th>
            <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">RPC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-zinc-800/30">
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Thumb row={row} />
                  <span className="font-semibold text-zinc-200 truncate max-w-[220px]">{row.video_title || 'Untitled'}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-zinc-400">{row.platform ?? '—'}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{row.metrics.clicks.toLocaleString()}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{row.metrics.sessions.toLocaleString()}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{row.metrics.conversions.toLocaleString()}</td>
              <td className="text-right px-3 py-2.5 text-white font-bold">{currency(row.metrics.revenue)}</td>
              <td className="text-right px-3 py-2.5 text-zinc-300">{currency(row.metrics.rpc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
