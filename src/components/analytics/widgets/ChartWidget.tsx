/**
 * src/components/analytics/widgets/ChartWidget.tsx
 *
 * Line/bar chart widget powered by recharts.
 *
 * Config fields (user-defined, stable):
 *   config.metric     — e.g. "revenue"
 *   config.chartType  — 'line' | 'bar'
 *   config.dateRange  — e.g. "30d"
 *
 * Data fields (machine-written):
 *   data.series       — Array<{ label: string; value: number }>
 *   data.fetchedAt    — ISO timestamp | null
 *
 * Demo widget: renders mock series from data.series.
 * Future: a fetch pipeline writes data.series on refresh without touching config.
 *
 * Wheel events are stopped from propagating to prevent canvas zoom
 * while hovering the chart.
 *
 * Dependencies:
 *   npm install recharts
 */

import React, { useCallback } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { Widget } from '../store/useWorkspaceStore'

interface DataPoint {
  label: string
  value: number
}

interface Props {
  widget: Widget
  onUpdate: (patch: Partial<Widget>) => void
}

export default function ChartWidget({ widget }: Props) {
  const config = widget.config
  const data = widget.data

  const chartType = (config.chartType as string) ?? 'line'
  const series = Array.isArray(data.series) ? (data.series as DataPoint[]) : []

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <div style={styles.root} onWheel={handleWheel}>
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'bar' ? (
          <BarChart data={series} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
            <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill="#6b7ff0" radius={[3, 3, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={series} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
            <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
            <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#6b7ff0"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#6b7ff0' }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={styles.tooltip}>
      <span style={styles.tooltipLabel}>{label}</span>
      <span style={styles.tooltipValue}>{payload[0].value.toLocaleString()}</span>
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_MARGIN = { top: 8, right: 16, bottom: 4, left: 0 }

const TICK_STYLE = {
  fontSize: 10,
  fill: '#555',
  fontFamily: 'inherit',
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    padding: '10px 4px 10px 0',
    boxSizing: 'border-box',
  },
  tooltip: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    padding: '6px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  tooltipLabel: {
    fontSize: 10,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: 600,
    color: '#e8e8e8',
    fontVariantNumeric: 'tabular-nums',
  },
}
