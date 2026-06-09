/**
 * src/components/analytics/widgets/KPIWidget.tsx
 *
 * Single-metric KPI card widget.
 *
 * Config fields (user-defined, stable):
 *   config.label      — display name, e.g. "Revenue"
 *   config.metric     — machine name, e.g. "revenue" (for future fetch pipeline)
 *   config.currency   — e.g. "USD" (optional)
 *   config.dateRange  — e.g. "30d"
 *
 * Data fields (machine-written, refreshed on fetch):
 *   data.value           — number
 *   data.delta           — percentage change (e.g. 8.3 = +8.3%)
 *   data.deltaDirection  — 'up' | 'down' | 'flat'
 *   data.fetchedAt       — ISO timestamp | null
 *
 * This demo widget renders mock data from data.value / data.delta.
 * The config/data separation means a future fetch pipeline can overwrite
 * data without touching config.
 */

import React from 'react'
import type { Widget } from '../store/useWorkspaceStore'

interface Props {
  widget: Widget
  onUpdate: (patch: Partial<Widget>) => void
}

export default function KPIWidget({ widget }: Props) {
  const config = widget.config
  const data = widget.data

  const label = (config.label as string) ?? 'Metric'
  const currency = (config.currency as string) ?? ''
  const value = typeof data.value === 'number' ? data.value : 0
  const delta = typeof data.delta === 'number' ? data.delta : null
  const deltaDir = (data.deltaDirection as string) ?? 'flat'

  const formatted = formatValue(value, currency)
  const deltaColor =
    deltaDir === 'up' ? '#34d399' : deltaDir === 'down' ? '#f87171' : '#666'
  const deltaIcon = deltaDir === 'up' ? '↑' : deltaDir === 'down' ? '↓' : '—'

  return (
    <div style={styles.root}>
      <span style={styles.label}>{label}</span>
      <span style={styles.value}>{formatted}</span>
      {delta !== null && (
        <span style={{ ...styles.delta, color: deltaColor }}>
          {deltaIcon} {Math.abs(delta).toFixed(1)}%
          <span style={styles.period}> vs prev period</span>
        </span>
      )}
    </div>
  )
}

function formatValue(value: number, currency: string): string {
  if (currency === 'USD' || currency === '$') {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
    return `$${value.toLocaleString()}`
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '12px 18px',
    gap: 6,
  },
  label: {
    fontSize: 11,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 500,
  },
  value: {
    fontSize: 32,
    fontWeight: 700,
    color: '#e8e8e8',
    letterSpacing: '-0.02em',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  delta: {
    fontSize: 12,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  period: {
    color: '#444',
    fontWeight: 400,
  },
}
