/**
 * src/components/analytics/widgets/JourneyAnalyticsWidget.tsx
 *
 * "Tree Analytics" widget for the Workspace canvas — compact view of the
 * JourneyAnalytics page (route rows + per-route clicks/revenue).
 *
 * ARCHITECTURE — reuses JourneyAnalytics.tsx, no second engine:
 *   1. loadJourneyDataset()        (exported by the page; same loader as the page
 *                                   and PartnerJourneySection)
 *   2. journeyAnalyticsPageCache   (same cache + same key as the page,
 *                                   same "never cache incomplete" rule)
 *   3. filterJourneys()            (exported by the page)
 *   4. useRouteRevenueMetrics()    (same metrics hook / attribution as the page)
 *   5. JourneyStrip + stepsForJourney()  (same strip renderer as the page)
 *
 * Config shape (widget.config) — persisted via onUpdate:
 *   dateRange:          DateRange     — default 'all' (page default)
 *   activeSource:       RevenueView   — default 'total'
 *   sortKey:            'longest' | MetricType — default 'longest' (page default)
 *   selectedPlatform:   string        — default 'all'
 *   selectedCampaignId: string        — default 'all'
 *
 * Page defaults are mirrored for everything not exposed here (no owner,
 * asset, promotion or creative filters).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useAuth }         from '../../../lib/auth'
import { useOrganization } from '../../../lib/useOrganization'
import { journeyAnalyticsPageCache } from '../../../lib/journeyAnalyticsPageCache'
import type { DiscoveredJourney } from '../../../lib/journeyDiscovery'
import {
  TABLE_COLUMNS,
  COLUMN_LABELS,
  type DateRange,
  type RevenueView,
  type MetricType,
} from '../../../lib/analyticsEngine'
import {
  loadJourneyDataset,
  filterJourneys,
  stepsForJourney,
  routeVideoStepCount,
  useCampaignOptions,
  journeyPromotedTypes,
  TypeCell,
  JOURNEY_ANALYTICS_EXTRA,
  type VideoDisplay,
} from '../../../pages/JourneyAnalytics'
import {
  formatRouteMetricCell,
  routeClickTotal,
  routeRevenueDisplay,
  useRouteRevenueMetrics,
} from '../useRouteRevenueMetrics'
import JourneyStrip from '../JourneyStrip'
import { flowConnectorLabels, useJourneyFlowCounts } from '../useJourneyFlowCounts'
import type { Widget } from '../store/useWorkspaceStore'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  widget:           Widget
  onUpdate?:        (patch: Partial<Widget>) => void
  analyticsResult?: unknown  // unused — data is loaded directly
}

// ─── Constants — values taken from JourneyAnalytics.tsx ──────────────────────

type SortKey = 'longest' | MetricType
type RouteOrder = 'default' | 'longest_first'

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7days',   label: '7d'  },
  { value: '30days',  label: '30d' },
  { value: '2months', label: '2M'  },
  { value: '6months', label: '6M'  },
  { value: '1year',   label: '1Y'  },
  { value: 'all',     label: 'All' },
]

const SOURCE_OPTIONS: { value: RevenueView; label: string }[] = [
  { value: 'total',  label: 'Total'  },
  { value: 'pixel',  label: 'Pixel'  },
  { value: 'stripe', label: 'Stripe' },
]

const SORT_OPTIONS: { value: SortKey; label: string; shortLabel: string }[] = [
  
  { value: 'total_revenue',         label: 'Revenue',       shortLabel: 'Rev'    },
  { value: 'consultation_thankyou', label: 'Consultations', shortLabel: 'Cons'   },
  { value: 'purchase_thankyou',     label: 'Purchases',     shortLabel: 'Purch'  },
  { value: 'call_booking_thankyou', label: 'Calls',         shortLabel: 'Calls'  },
  { value: 'newsletter_thankyou',   label: 'Opt-ins',       shortLabel: 'Optins' },
]

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YT', tiktok: 'TT', instagram: 'IG', linkedin: 'LI', x: 'X',
  threads: 'TH', facebook: 'FB', reddit: 'RD', twitch: 'TW',
}

const TOP_N = 10

type ColKey = (typeof TABLE_COLUMNS)[number]

// ─── Component ────────────────────────────────────────────────────────────────

export default function JourneyAnalyticsWidget({ widget, onUpdate }: Props) {
  const dateRange:          DateRange   = (widget.config?.dateRange          as DateRange)   ?? 'all'
  const activeSource:       RevenueView = (widget.config?.activeSource       as RevenueView) ?? 'total'
  const sortKey:            SortKey     = (widget.config?.sortKey            as SortKey)     ?? 'longest'
  const selectedPlatform:   string      = (widget.config?.selectedPlatform   as string)      ?? 'all'
  const selectedCampaignId: string      = (widget.config?.selectedCampaignId as string)      ?? 'all'
  const routeOrder:         RouteOrder  = (widget.config?.routeOrder         as RouteOrder)  ?? 'longest_first'
  const showAnalytics:      boolean     = (widget.config?.showAnalytics      as boolean)     ?? false
  const showContentOwner:   boolean     = (widget.config?.showContentOwner   as boolean)     ?? false
  const showJourneyFlow:    boolean     = (widget.config?.showJourneyFlow    as boolean)     ?? false

  // One atomic config patch helper — merges into existing config.
  const patchConfig = (patch: Record<string, unknown>) =>
    onUpdate?.({ config: { ...widget.config, ...patch } })

  const { user }           = useAuth()
  const { organizationId } = useOrganization()
  const viewerId           = user?.id ?? null
  const campaignOptions    = useCampaignOptions(viewerId)
  // Same key shape the page uses → the widget and the page share one cache entry.
  const cacheKey = organizationId && user?.id ? `${user.id}|${organizationId}` : null

  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [journeys, setJourneys]           = useState<DiscoveredJourney[]>([])
  const [truncated, setTruncated]         = useState(false)
  const [videoDisplay, setVideoDisplay]   = useState<Map<string, VideoDisplay>>(new Map())

  // ── Load — same flow as JourneyAnalytics' load effect ───────────────────────
  useEffect(() => {
    if (!organizationId || !cacheKey) return
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const hit = journeyAnalyticsPageCache.get(cacheKey)
        const ds = hit
          ? hit.data
          : await loadJourneyDataset(organizationId, organizationId, () => cancelled)
        if (cancelled || !ds) return
        if (!hit) {
          if (ds.incomplete) console.warn('[JourneyAnalyticsWidget] Result not cached (a sub-query failed silently)')
          else journeyAnalyticsPageCache.set(cacheKey, ds)
        }
        setJourneys(ds.journeys)
        setVideoDisplay(ds.videoDisplay)
        setTruncated(ds.truncated)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e))
          setJourneys([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [organizationId, cacheKey])

  // ── Route metrics — same hook + attribution as the page ─────────────────────
  const { routeMetrics, metricsLoading } = useRouteRevenueMetrics({
    orgId: organizationId ?? null,
    journeys,
    dateRange,
    customRange: null,
    activeSource,
  })

  const presentPlatforms = useMemo(() => {
    const seen = new Set<string>()
    videoDisplay.forEach(v => seen.add(v.platform ?? 'youtube'))
    return Array.from(seen).sort()
  }, [videoDisplay])

  // ── Filters (AND) — page's filterJourneys, unexposed filters at page defaults
  const visibleJourneys = useMemo(
    () =>
      filterJourneys(journeys, videoDisplay, {
        selectedVideoId:    null,
        platforms:          selectedPlatform === 'all' ? [] : [selectedPlatform],
        contentOwnerIds:    [],
        campaignId:         selectedCampaignId,
        contentCampaignIds: [],
        assetCampaignIds:   [],
        promotionIds:       [],
        assetTypes:         [],
        creativeScope:      null,
        viewerId,
        assetSource:        'all',
        dateRange,
        customRange:        null,
      }),
    [journeys, videoDisplay, selectedPlatform, selectedCampaignId, viewerId, dateRange],
  )

  // ── Sort — same rules as the page's displayedJourneys ───────────────────────
  const topJourneys = useMemo(() => {
    const indexed = visibleJourneys.map((j, index) => ({ j, index }))
    if (!showAnalytics || sortKey === 'longest') {
      if (routeOrder === 'default') return visibleJourneys.slice(0, TOP_N)
      return indexed
        .sort((a, b) =>
          routeVideoStepCount(b.j) - routeVideoStepCount(a.j) || a.index - b.index)
        .map(({ j }) => j)
        .slice(0, TOP_N)
    }
    const toNum = (j: DiscoveredJourney) => {
      const text = formatRouteMetricCell(sortKey as ColKey, routeMetrics.get(j.journeyId), false)
      const n = parseFloat(String(text).replace(/[^0-9.\-]/g, ''))
      return Number.isFinite(n) ? n : 0
    }
    return indexed
      .map(({ j, index }) => ({ j, index, v: toNum(j) }))
      .sort((a, b) =>
        b.v - a.v ||
        routeVideoStepCount(b.j) - routeVideoStepCount(a.j) ||
        a.index - b.index)
      .map(({ j }) => j)
      .slice(0, TOP_N)
  }, [visibleJourneys, sortKey, routeMetrics, showAnalytics, routeOrder])

  const { flowCounts, flowLoading } = useJourneyFlowCounts({
    enabled: showJourneyFlow,
    routes: topJourneys,
    videoAssets: videoDisplay,
    dateRange,
    customRange: null,
  })

  const sortOption = SORT_OPTIONS.find(o => o.value === sortKey)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>

      {/* Row 0: Toggles */}
      <div style={styles.toolbarRow}>
        <button
          style={{ ...styles.toggleBtn, ...(showContentOwner ? styles.toggleBtnActive : {}) }}
          onClick={() => patchConfig({ showContentOwner: !showContentOwner })}
        >
          {showContentOwner ? 'Hide Content Owner' : 'Show Content Owner'}
        </button>
        <button
          style={{ ...styles.toggleBtn, ...(showJourneyFlow ? styles.toggleBtnActive : {}) }}
          onClick={() => patchConfig({ showJourneyFlow: !showJourneyFlow })}
        >
          {showJourneyFlow ? 'Hide Journey Flow' : 'Show Journey Flow'}
        </button>
        <button
          style={{ ...styles.toggleBtn, ...(showAnalytics ? styles.toggleBtnHot : {}) }}
          onClick={() => patchConfig({ showAnalytics: !showAnalytics })}
        >
          {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
        </button>
      </div>

      {/* Row 1: Period + Source */}
      <div style={styles.toolbarRow}>
        <span style={styles.toolbarLabel}>Period</span>
        <div style={styles.pillGroup}>
          {DATE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={{ ...styles.pill, ...(dateRange === opt.value ? styles.pillActive : {}) }}
              onClick={() => patchConfig({ dateRange: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={styles.divider} />

        <span style={styles.toolbarLabel}>Source</span>
        <div style={styles.pillGroup}>
          {SOURCE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={{ ...styles.pill, ...(activeSource === opt.value ? styles.pillActive : {}) }}
              onClick={() => patchConfig({ activeSource: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2a: Order */}
      <div style={{ ...styles.toolbarRow, borderTopWidth: 0 }}>
        <span style={styles.toolbarLabel}>Order</span>
        <div style={styles.pillGroup}>
          <button
            style={{ ...styles.pill, ...(routeOrder === 'default' ? styles.pillActive : {}) }}
            onClick={() => patchConfig({ routeOrder: 'default' })}
          >
            Default order
          </button>
          <button
            style={{ ...styles.pill, ...(routeOrder === 'longest_first' ? styles.pillActive : {}) }}
            onClick={() => patchConfig({ routeOrder: 'longest_first' })}
          >
            Longest first
          </button>
        </div>
      </div>

      {/* Row 2b: Sort (Analytics only) */}
      {showAnalytics && (
      <div style={{ ...styles.toolbarRow, borderTopWidth: 0 }}>
        <span style={styles.toolbarLabel}>Sort</span>
        <div style={styles.pillGroup}>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={{ ...styles.pill, ...(sortKey === opt.value ? styles.pillActive : {}) }}
              onClick={() => patchConfig({ sortKey: sortKey === opt.value ? 'longest' : opt.value })}
              title={opt.label}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>
      </div>

      )}

      {/* Row 3: Campaign + Platform */}
      <div style={{ ...styles.toolbarRow, borderTopWidth: 0 }}>
        <span style={styles.toolbarLabel}>Campaign</span>
        <select
          style={styles.select}
          value={selectedCampaignId}
          onChange={e => patchConfig({ selectedCampaignId: e.target.value })}
        >
          <option value="all">All</option>
          {campaignOptions.map(c => (
            <option key={c.id} value={c.id}>{c.campaign_name}</option>
          ))}
        </select>

        <div style={styles.divider} />

        <span style={styles.toolbarLabel}>Platform</span>
        <div style={{ ...styles.pillGroup, flexWrap: 'wrap' as const }}>
          {['all', ...presentPlatforms].map(p => (
            <button
              key={p}
              style={{ ...styles.pill, ...(selectedPlatform === p ? styles.pillActive : {}) }}
              onClick={() => patchConfig({ selectedPlatform: p })}
            >
              {p === 'all' ? 'All' : (PLATFORM_LABELS[p] ?? p.toUpperCase().slice(0, 3))}
            </button>
          ))}
        </div>
      </div>

      {/* Context label */}
      <div style={styles.sortContext}>
        <span style={styles.sortContextText}>
          {showAnalytics && sortKey !== 'longest'
            ? `Ranked by ${sortOption?.label ?? sortKey}`
            : routeOrder === 'longest_first' ? 'Longest routes first' : 'Default order'}
          {!loading && ` · ${visibleJourneys.length} routes`}
          {truncated && ' · partial (discovery truncated)'}
        </span>
      </div>

      {/* List */}
      <div style={styles.list}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={styles.skeletonRow}>
              <div style={{ ...styles.skeleton, width: 120 }} />
              <div style={{ ...styles.skeleton, width: '100%', height: 36 }} />
            </div>
          ))
        ) : error ? (
          <div style={styles.empty}>{error}</div>
        ) : showAnalytics && topJourneys.length > 0 ? (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, ...styles.stickyCol, zIndex: 3, background: 'var(--color-zinc-950)' }}>
                  Journey Map
                </th>
                {JOURNEY_ANALYTICS_EXTRA.map(col => (
                  <th key={col.key} style={styles.th}>{col.label}</th>
                ))}
                {TABLE_COLUMNS.map(key => (
                  <th key={key} style={styles.th}>
                    <button
                      style={styles.thBtn}
                      onClick={() => patchConfig({ sortKey: sortKey === key ? 'longest' : key })}
                    >
                      {COLUMN_LABELS[key as MetricType] ?? key}
                      {sortKey === key ? ' ▼' : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topJourneys.map(j => {
                const steps = routeVideoStepCount(j)
                return (
                  <tr key={j.journeyId}>
                    <td style={{ ...styles.td, ...styles.stickyCol, minWidth: 320, maxWidth: 480 }}>
                      <div style={styles.routeHeader}>
                        <span>{j.journeyId.slice(0, 8)}…</span>
                        <span>{steps === 1 ? '1 video' : `${steps} videos`}</span>
                      </div>
                      <JourneyStrip
                        steps={stepsForJourney(j, videoDisplay)}
                        highlightVideoId={null}
                        onSelectVideo={() => {}}
                        showContentOwner={showContentOwner}
                        connectorLabels={showJourneyFlow ? flowConnectorLabels(j, flowCounts, flowLoading) : undefined}
                      />
                    </td>
                    <td style={styles.td}>
                      <TypeCell types={journeyPromotedTypes(j, videoDisplay)} />
                    </td>
                    {JOURNEY_ANALYTICS_EXTRA.slice(1).map(c => (
                      <td key={c.key} style={{ ...styles.td, ...styles.tdNum, color: 'var(--color-zinc-600)' }}>—</td>
                    ))}
                    {TABLE_COLUMNS.map(key => (
                      <td key={key} style={{ ...styles.td, ...styles.tdNum }}>
                        {formatRouteMetricCell(key as ColKey, routeMetrics.get(j.journeyId), metricsLoading)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : topJourneys.length === 0 ? (
          <div style={styles.empty}>No routes match filters</div>
        ) : (
          topJourneys.map(j => {
            const m     = routeMetrics.get(j.journeyId)
            const rev   = routeRevenueDisplay(m, metricsLoading)
            const steps = routeVideoStepCount(j)
            return (
              <div key={j.journeyId} style={styles.routeCard}>
                <div style={{ ...styles.routeHeader, display: showAnalytics ? 'flex' : 'none' }}>
                  <span>{steps === 1 ? '1 video' : `${steps} videos`}</span>
                  <span>{metricsLoading ? '…' : `${routeClickTotal(m).toLocaleString()} clicks`}</span>
                  <span style={{ color: rev.hasRevenue ? '#34d399' : 'var(--color-zinc-600)' }}>
                    Revenue {rev.text}
                  </span>
                  {sortKey !== 'longest' && sortKey !== 'total_revenue' && (
                    <span style={{ color: 'var(--color-zinc-400)' }}>
                      {sortOption?.shortLabel}: {metricsLoading
                        ? '…'
                        : formatRouteMetricCell(sortKey as ColKey, m, false)}
                    </span>
                  )}
                </div>
                <div style={styles.stripWrap}>
                  <JourneyStrip
                    steps={stepsForJourney(j, videoDisplay)}
                    highlightVideoId={null}
                    onSelectVideo={() => {}}
                    showContentOwner={showContentOwner}
                    connectorLabels={showJourneyFlow ? flowConnectorLabels(j, flowCounts, flowLoading) : undefined}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--color-zinc-900)', overflow: 'hidden', fontFamily: 'inherit',
  },
  toolbarRow: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
    padding: '5px 10px', borderBottom: '1px solid var(--color-zinc-800)', flexShrink: 0,
  },
  toolbarLabel: {
    fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--color-zinc-600)', flexShrink: 0,
  },
  divider: { width: 1, height: 14, background: 'var(--color-zinc-800)', flexShrink: 0 },
  pillGroup: {
    display: 'flex', gap: 2, padding: 2, background: 'var(--color-zinc-950)',
    borderRadius: 8, border: '1px solid var(--color-zinc-800)',
  },
  pill: {
    background: 'transparent', border: 'none', borderRadius: 6,
    padding: '3px 6px', fontSize: 9, fontWeight: 800, color: 'var(--color-zinc-500)',
    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  pillActive: { background: 'var(--color-zinc-700)', color: 'var(--color-white)' },
  select: {
    background: 'var(--color-zinc-950)', color: 'var(--color-zinc-300)', border: '1px solid var(--color-zinc-800)',
    borderRadius: 6, fontSize: 10, padding: '3px 6px', maxWidth: 160,
    colorScheme: 'dark',
  },
    toggleBtn: {
    background: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: 8,
    padding: '4px 8px', fontSize: 9, fontWeight: 800, color: 'var(--color-zinc-400)',
    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em',
  },
  toggleBtnActive: { background: 'var(--color-zinc-700)', color: 'var(--color-white)' },
  toggleBtnHot:    { background: '#dc2626', borderColor: '#dc2626', color: '#ffffff' },
  table: { borderCollapse: 'collapse', minWidth: '100%', width: 'max-content' },
  th: {
    position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-zinc-950)',
    padding: '8px 10px', textAlign: 'left', fontSize: 8, fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-zinc-600)',
    borderBottom: '1px solid var(--color-zinc-800)', whiteSpace: 'nowrap',
  },
  thBtn: {
    background: 'transparent', border: 'none', padding: 0, font: 'inherit',
    color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer',
  },
  td: { padding: '6px 10px', borderBottom: '1px solid var(--color-zinc-800)', whiteSpace: 'nowrap', verticalAlign: 'middle' },
  tdNum: { fontSize: 11, fontWeight: 700, color: 'var(--color-zinc-400)', fontVariantNumeric: 'tabular-nums' },
  stickyCol: { position: 'sticky', left: 0, background: 'var(--color-zinc-950)', zIndex: 1 },
  sortContext: { padding: '4px 12px', flexShrink: 0 },
  sortContextText: {
    fontSize: 8, fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--color-zinc-700)',
  },
  list: { flex: 1, overflowY: 'auto', padding: '4px 8px', colorScheme: 'dark' },
  routeCard: {
    border: '1px solid var(--color-zinc-800)', background: 'var(--color-zinc-900)', borderRadius: 10,
    padding: '6px 8px', marginBottom: 6,
  },
  routeHeader: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
    fontSize: 8, fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--color-zinc-600)', marginBottom: 4,
  },
  stripWrap: { overflowX: 'auto' },
  skeletonRow: { padding: '6px 4px', display: 'flex', flexDirection: 'column', gap: 6 },
  skeleton: { height: 10, borderRadius: 4, background: 'var(--color-zinc-800)' },
  empty: { padding: 20, fontSize: 11, color: 'var(--color-zinc-600)', textAlign: 'center' },
}
