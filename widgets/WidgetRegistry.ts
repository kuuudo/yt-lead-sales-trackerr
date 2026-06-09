/**
 * src/components/analytics/widgets/WidgetRegistry.ts
 *
 * Centralised widget registry.
 *
 * To add a new widget type:
 *  1. Create the component (e.g. FunnelWidget.tsx)
 *  2. Import it here
 *  3. Add an entry to WIDGET_REGISTRY
 *  4. Add default dimensions/config to WIDGET_DEFAULTS
 *  5. Add a display label to TYPE_LABELS
 *
 * The canvas, drag, resize, toolbar, and save systems require zero changes.
 */

import React from 'react'
import NoteWidget from './NoteWidget'
import KPIWidget from './KPIWidget'
import ChartWidget from './ChartWidget'
import type { Widget } from '../store/useWorkspaceStore'

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Maps widget type strings → React components.
 * Each component receives the full Widget object as its only prop.
 */
export const WIDGET_REGISTRY: Record<
  string,
  React.ComponentType<{ widget: Widget; onUpdate: (patch: Partial<Widget>) => void }>
> = {
  note: NoteWidget,
  kpi: KPIWidget,
  chart: ChartWidget,
  // ─── Future widget types ───────────────────────────────────────────────
  // revenue_trend:  RevenueTrendWidget,
  // funnel:         FunnelWidget,
  // heatmap:        HeatmapWidget,
  // topic_intel:    TopicIntelWidget,
  // platform_risk:  PlatformRiskWidget,
  // cohort:         CohortWidget,
  // lead_quality:   LeadQualityWidget,
  // top_content:    TopContentWidget,
}

// ─── Display Labels ───────────────────────────────────────────────────────────

/**
 * Human-readable labels shown when widget.title is null.
 * Also used in the toolbar button labels.
 */
export const TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  kpi: 'KPI',
  chart: 'Chart',
  // Future:
  // revenue_trend:  'Revenue Trend',
  // funnel:         'Funnel',
  // heatmap:        'Heatmap',
  // topic_intel:    'Topic Intelligence',
  // platform_risk:  'Platform Risk',
  // cohort:         'Cohort Analysis',
  // lead_quality:   'Lead Quality',
  // top_content:    'Top Content',
}

// ─── Default Dimensions & Config ──────────────────────────────────────────────

/**
 * Default canvas-space dimensions and initial config for each widget type.
 * These are applied when a new widget is spawned from the toolbar.
 *
 * All sizes are in canvas-space units (pixels at scale=1).
 */
export interface WidgetDefaults {
  width: number
  height: number
  category?: string
  config: Record<string, unknown>
  data: Record<string, unknown>
  title: string | null
}

export const WIDGET_DEFAULTS: Record<string, WidgetDefaults> = {
  note: {
    width: 280,
    height: 200,
    category: 'notes',
    title: null,
    config: {},
    data: { text: '' },
  },
  kpi: {
    width: 220,
    height: 140,
    category: 'revenue',
    title: null,
    config: {
      metric: 'revenue',
      label: 'Revenue',
      currency: 'USD',
      dateRange: '30d',
    },
    data: {
      value: 12450,
      delta: 8.3,
      deltaDirection: 'up',
      fetchedAt: null,
    },
  },
  chart: {
    width: 420,
    height: 280,
    category: 'revenue',
    title: null,
    config: {
      metric: 'revenue',
      chartType: 'line',
      dateRange: '30d',
    },
    data: {
      series: [
        { label: 'Jan', value: 4200 },
        { label: 'Feb', value: 5100 },
        { label: 'Mar', value: 4750 },
        { label: 'Apr', value: 6300 },
        { label: 'May', value: 5900 },
        { label: 'Jun', value: 7200 },
      ],
      fetchedAt: null,
    },
  },
}

// ─── Toolbar Item Definitions ─────────────────────────────────────────────────

/**
 * Ordered list of items shown in the WorkspaceToolbar.
 * Controls which widget types users can spawn.
 */
export interface ToolbarItem {
  type: string
  label: string
  icon: string   // single emoji or icon char — swap for an icon component if desired
}

export const TOOLBAR_ITEMS: ToolbarItem[] = [
  { type: 'note',  label: 'Note',  icon: '📝' },
  { type: 'kpi',   label: 'KPI',   icon: '📊' },
  { type: 'chart', label: 'Chart', icon: '📈' },
  // Future toolbar items follow the same pattern — no core code changes needed
]
