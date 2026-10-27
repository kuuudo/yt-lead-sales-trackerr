/**
 * src/components/analytics/widgets/AllAssetsAnalyticsWidget.tsx
 *
 * Compact "Top Assets" leaderboard widget for the Workspace canvas.
 *
 * ARCHITECTURE — reuses AllAssetsAnalytics.tsx, no second engine:
 *   1. useAssetAnalyticsRows()   (exported from the page — loading, enrichment, cache)
 *   2. filterByPlatform()        (analytics-lego/assetAnalyticsFilters)
 *   3. sortAssetAnalyticsRows()  (analytics-lego/assetAnalyticsColumns)
 *   4. Render top N (asset × promoting video) rows
 *
 * Cache: the hook uses allAssetsAnalyticsPageCache, shared with the page.
 * No widget-specific cache file is needed.
 *
 * Config shape (widget.config) — persisted via onUpdate:
 *   dateRange:        DateRange     — default '30days' (page default)
 *   activeSource:     RevenueView   — default 'total'
 *   sortKey:          MetricType    — default 'total_revenue'
 *   selectedPlatform: string        — default 'all'
 *
 * Page defaults are mirrored: no archive hiding, no asset/creative scope filter.
 */

import React, { useMemo } from 'react'
import { useAssetAnalyticsRows } from '../../../pages/AllAssetsAnalytics'
import { sortAssetAnalyticsRows } from '../../../pages/analytics-lego/assetAnalyticsColumns'
import { filterByPlatform } from '../../../pages/analytics-lego/assetAnalyticsFilters'
import {
  ASSET_TYPE_LABELS,
  type AssetTypeTag,
} from '../../../pages/analytics-lego/assetAnalyticsTypes'
import type { DateRange, RevenueView, MetricType } from '../../../lib/analyticsEngine'
import type { Widget } from '../store/useWorkspaceStore'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  widget:           Widget
  onUpdate?:        (patch: Partial<Widget>) => void
  analyticsResult?: unknown  // unused — the hook fetches directly
}

// ─── Constants — values taken from AllAssetsAnalytics.tsx ────────────────────

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

// Same metric set as the page's SORT_SHORTCUTS (minus "Recently Added").
const SORT_OPTIONS: { value: MetricType; label: string; shortLabel: string }[] = [
  { value: 'total_revenue',         label: 'Revenue',       shortLabel: 'Rev'    },
  { value: 'consultation_thankyou', label: 'Consultations', shortLabel: 'Cons'   },
  { value: 'purchase_thankyou',     label: 'Purchases',     shortLabel: 'Purch'  },
  { value: 'call_booking_thankyou', label: 'Calls',         shortLabel: 'Calls'  },
  { value: 'newsletter_thankyou',   label: 'Opt-ins',       shortLabel: 'Optins' },
]

const PLATFORM_OPTIONS = [
  { value: 'all',       label: 'All' },
  { value: 'youtube',   label: 'YT'  },
  { value: 'tiktok',    label: 'TT'  },
  { value: 'instagram', label: 'IG'  },
  { value: 'linkedin',  label: 'LI'  },
  { value: 'x',         label: 'X'   },
  { value: 'threads',   label: 'TH'  },
  { value: 'facebook',  label: 'FB'  },
  { value: 'reddit',    label: 'RD'  },
  { value: 'twitch',    label: 'TW'  },
] as const

const METRIC_COLORS: Partial<Record<MetricType, string>> = {
  total_revenue:         '#34d399',
  consultation_thankyou: '#a78bfa',
  purchase_thankyou:     '#34d399',
  call_booking_thankyou: '#60a5fa',
  newsletter_thankyou:   '#fb923c',
}

// Inline equivalents of ASSET_TYPE_COLORS (those are Tailwind class strings).
const TYPE_COLORS: Record<AssetTypeTag, string> = {
  campaign_element:  '#a78bfa',
  promotional_video: '#60a5fa',
  resource:          '#fbbf24',
  content_video:     '#34d399',
}

const TOP_N = 10

function rankColor(rank: number): string {
  if (rank === 1) return '#FBBF24'
  if (rank === 2) return '#9CA3AF'
  if (rank === 3) return '#B45309'
  return 'var(--color-zinc-700)'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AllAssetsAnalyticsWidget({ widget, onUpdate }: Props) {
  const dateRange:        DateRange   = (widget.config?.dateRange        as DateRange)   ?? '30days'
  const activeSource:     RevenueView = (widget.config?.activeSource     as RevenueView) ?? 'total'
  const sortKey:          MetricType  = (widget.config?.sortKey          as MetricType)  ?? 'total_revenue'
  const selectedPlatform: string      = (widget.config?.selectedPlatform as string)      ?? 'all'

  // One atomic config patch helper — merges into existing config.
  const patchConfig = (patch: Record<string, unknown>) =>
    onUpdate?.({ config: { ...widget.config, ...patch } })

  // Same hook the full page uses: fetch + enrichment + shared page cache.
  const { rows, loading, error } = useAssetAnalyticsRows({
    dateRange,
    customRange: null,
    activeSource,
    isReadOnly: false,
  })

  const topRows = useMemo(() => {
    const platformRows =
      selectedPlatform === 'all'
        ? rows
        : filterByPlatform(rows, [selectedPlatform] as string[])
    return sortAssetAnalyticsRows(platformRows, { key: sortKey, direction: 'desc' }).slice(0, TOP_N)
  }, [rows, selectedPlatform, sortKey])

  const sortOption  = SORT_OPTIONS.find(o => o.value === sortKey)
  const metricColor = METRIC_COLORS[sortKey] ?? 'var(--color-zinc-400)'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>

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

      {/* Row 2: Sort */}
      <div style={{ ...styles.toolbarRow, borderTopWidth: 0 }}>
        <span style={styles.toolbarLabel}>Sort</span>
        <div style={styles.pillGroup}>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={{ ...styles.pill, ...(sortKey === opt.value ? styles.pillActive : {}) }}
              onClick={() => patchConfig({ sortKey: opt.value })}
              title={opt.label}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Row 3: Platform */}
      <div style={{ ...styles.toolbarRow, borderTopWidth: 0 }}>
        <span style={styles.toolbarLabel}>Platform</span>
        <div style={{ ...styles.pillGroup, flexWrap: 'wrap' as const }}>
          {PLATFORM_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={{ ...styles.pill, ...(selectedPlatform === opt.value ? styles.pillActive : {}) }}
              onClick={() => patchConfig({ selectedPlatform: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sort context label */}
      <div style={styles.sortContext}>
        <span style={styles.sortContextText}>
          Ranked by {sortOption?.label ?? sortKey}
          {selectedPlatform !== 'all' && ` · ${selectedPlatform.toUpperCase()}`}
        </span>
      </div>

      {/* List */}
      <div style={styles.list}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={styles.skeletonRow}>
              <div style={{ ...styles.skeleton, width: 20 }} />
              <div style={{ ...styles.skeleton, width: 40, flexShrink: 0 }} />
              <div style={{ ...styles.skeleton, flex: 1 }} />
              <div style={{ ...styles.skeleton, width: 52 }} />
            </div>
          ))
        ) : error ? (
          <div style={styles.empty}>{error}</div>
        ) : topRows.length === 0 ? (
          <div style={styles.empty}>No assets match filters</div>
        ) : (
          topRows.map((row, idx) => {
            const rank   = idx + 1
            const raw    = Number(row.metrics[sortKey] ?? 0)
            const value  = sortKey === 'total_revenue'
              ? `$${raw.toLocaleString()}`
              : raw.toLocaleString()
            const typeColor = TYPE_COLORS[row.asset.asset_type] ?? 'var(--color-zinc-400)'

            return (
              <div key={`${row.asset.id}::${row.promoting_video.id}`} style={styles.row}>
                <span style={{ ...styles.rank, color: rankColor(rank) }}>#{rank}</span>

                <img
                  src={row.asset.thumbnail_url}
                  style={styles.thumb}
                  alt=""
                  onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                />

                <div style={styles.textCol}>
                  <div style={styles.titleLine}>
                    <span style={styles.title}>{row.asset.title ?? 'Untitled asset'}</span>
                    <span style={{ ...styles.typeBadge, color: typeColor, borderColor: typeColor }}>
                      {ASSET_TYPE_LABELS[row.asset.asset_type]}
                    </span>
                  </div>
                  <div style={styles.subLine}>
                    via {row.promoting_video.title ?? 'Untitled video'}
                  </div>
                </div>

                <span style={{ ...styles.metricValue, color: metricColor }}>{value}</span>
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
  sortContext: { padding: '4px 12px', flexShrink: 0 },
  sortContextText: {
    fontSize: 8, fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--color-zinc-700)',
  },
  list: { flex: 1, overflowY: 'auto', padding: '2px 0', colorScheme: 'dark' },
  row: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 10px', borderBottom: '1px solid var(--color-zinc-800)', minHeight: 40,
  },
  rank: { width: 26, fontSize: 10, fontWeight: 800, flexShrink: 0 },
  thumb: {
    width: 40, height: 28, objectFit: 'cover', borderRadius: 4,
    border: '1px solid var(--color-zinc-800)', flexShrink: 0, background: 'var(--color-zinc-950)',
  },
  textCol: { flex: 1, minWidth: 0 },
  titleLine: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  title: {
    fontSize: 11, fontWeight: 700, color: 'var(--color-zinc-200)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  typeBadge: {
    fontSize: 7, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
    border: '1px solid', borderRadius: 999, padding: '1px 5px', flexShrink: 0,
  },
  subLine: {
    fontSize: 9, color: 'var(--color-zinc-600)', marginTop: 2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  metricValue: {
    fontSize: 12, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
  },
  skeletonRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 10px', borderBottom: '1px solid var(--color-zinc-800)', minHeight: 40,
  },
  skeleton: { height: 12, borderRadius: 4, background: 'var(--color-zinc-800)' },
  empty: { padding: 20, fontSize: 11, color: 'var(--color-zinc-600)', textAlign: 'center' },
}
