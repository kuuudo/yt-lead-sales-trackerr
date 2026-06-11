/**
 * src/components/analytics/widgets/LineChartWidget.tsx
 *
 * Pure visualization widget — renders analyticsResult.chartData as an SVG
 * line chart.
 *
 * Rules:
 *  - NO business logic. All data comes pre-computed via analyticsResult.
 *  - NO external chart libraries.
 *  - Reads only: analyticsResult.chartData  (Array<{ label, value }>)
 *  - Gracefully handles null / empty data.
 */

import React, { useMemo } from 'react'
import type { Widget } from '../store/useWorkspaceStore'
import type { AnalyticsResult } from '../types/analytics'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  widget: Widget
  analyticsResult: AnalyticsResult | null
  onUpdate: (patch: Partial<Widget>) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PADDING = { top: 16, right: 16, bottom: 28, left: 44 }
const LINE_COLOR   = '#6b7ff0'
const AREA_COLOR   = 'rgba(107,127,240,0.12)'
const GRID_COLOR   = '#1e1e1e'
const LABEL_COLOR  = '#555'
const DOT_RADIUS   = 3
const DOT_HOVER_R  = 5
const GRID_LINES   = 4

// ─── Component ────────────────────────────────────────────────────────────────

export default function LineChartWidget({ widget, analyticsResult }: Props) {
  const data = analyticsResult?.chartData ?? []

  // ── Derived geometry ──────────────────────────────────────────────────────
  const { points, polyline, area, yTicks, xLabels, svgW, svgH } = useMemo(() => {
    const svgW = widget.width
    const svgH = widget.height - 32   // subtract header height
    const innerW = svgW - PADDING.left - PADDING.right
    const innerH = svgH - PADDING.top - PADDING.bottom

    if (data.length === 0) {
      return { points: [], polyline: '', area: '', yTicks: [], xLabels: [], svgW, svgH }
    }

    const values = data.map((d) => d.value)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const valRange = maxVal - minVal || 1   // guard against flat line

    // Map data → SVG coordinates
    const points = data.map((d, i) => {
      const x = PADDING.left + (i / (data.length - 1 || 1)) * innerW
      const y = PADDING.top  + (1 - (d.value - minVal) / valRange) * innerH
      return { x, y, label: d.label, value: d.value }
    })

    const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')

    // Closed area path for the fill under the line
    const firstX = points[0].x
    const lastX  = points[points.length - 1].x
    const baseY  = PADDING.top + innerH
    const area   = `M${firstX},${baseY} ` +
                   points.map((p) => `L${p.x},${p.y}`).join(' ') +
                   ` L${lastX},${baseY} Z`

    // Y-axis tick labels
    const yTicks = Array.from({ length: GRID_LINES + 1 }, (_, i) => {
      const ratio = i / GRID_LINES
      const y     = PADDING.top + (1 - ratio) * innerH
      const value = minVal + ratio * valRange
      return { y, label: formatValue(value) }
    })

    // X-axis labels — show up to 6 evenly spaced to avoid overlap
    const maxLabels = Math.min(6, data.length)
    const step      = Math.max(1, Math.floor(data.length / maxLabels))
    const xLabels   = points.filter((_, i) => i % step === 0 || i === data.length - 1)

    return { points, polyline, area, yTicks, xLabels, svgW, svgH }
  }, [data, widget.width, widget.height])

  // ── Empty state ───────────────────────────────────────────────────────────
  if (data.length === 0) {
    return (
      <div style={styles.empty}>
        No data available
      </div>
    )
  }

  // ── SVG chart ─────────────────────────────────────────────────────────────
  return (
    <svg
      width={svgW}
      height={svgH}
      style={styles.svg}
      aria-label="Line chart"
    >
      {/* Horizontal grid lines */}
      {yTicks.map((tick, i) => (
        <line
          key={i}
          x1={PADDING.left}
          x2={svgW - PADDING.right}
          y1={tick.y}
          y2={tick.y}
          stroke={GRID_COLOR}
          strokeWidth={1}
        />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((tick, i) => (
        <text
          key={i}
          x={PADDING.left - 6}
          y={tick.y + 4}
          textAnchor="end"
          style={{ ...styles.axisLabel }}
        >
          {tick.label}
        </text>
      ))}

      {/* X-axis labels */}
      {xLabels.map((pt, i) => (
        <text
          key={i}
          x={pt.x}
          y={svgH - PADDING.bottom + 16}
          textAnchor="middle"
          style={{ ...styles.axisLabel }}
        >
          {pt.label}
        </text>
      ))}

      {/* Area fill */}
      <path d={area} fill={AREA_COLOR} />

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data point dots */}
      {points.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r={DOT_RADIUS}
          fill={LINE_COLOR}
          stroke="#141414"
          strokeWidth={1.5}
        >
          <title>{`${pt.label}: ${formatValue(pt.value)}`}</title>
        </circle>
      ))}
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compact number formatter: 1200 → "1.2k", 1200000 → "1.2M" */
function formatValue(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000)     return `${(value / 1_000).toFixed(1)}k`
  return value.toFixed(value % 1 === 0 ? 0 : 1)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  svg: {
    display: 'block',
    overflow: 'visible',
  },
  axisLabel: {
    fontSize: 10,
    fill: LABEL_COLOR,
    fontFamily: 'inherit',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: 12,
    color: '#444',
  },
}
