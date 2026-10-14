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
import NoteWidget       from './NoteWidget'
import KPIWidget        from './KPIWidget'
import ChartWidget      from './ChartWidget'
import RectangleWidget  from './RectangleWidget'
import CircleWidget     from './CircleWidget'
import ArrowWidget      from './ArrowWidget'
import TextWidget       from './TextWidget'
import LineChartWidget  from './LineChartWidget'
import DashboardWidget  from './DashboardWidget'
import InDepthAnalyticsWidget from './InDepthAnalyticsWidget'
import AllAssetsAnalyticsWidget from './AllAssetsAnalyticsWidget'
import JourneyAnalyticsWidget from './JourneyAnalyticsWidget'
import PartnerAnalyticsWidget from './PartnerAnalyticsWidget'
import CampaignStructureMapWidget from './CampaignStructureMapWidget'
import CampaignJourneyMapWidget from './CampaignJourneyMapWidget'
import type { Widget } from '../store/useWorkspaceStore'
import type { AnalyticsResult } from '../types/analytics'

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Maps widget type strings → React components.
 * Each component receives the full Widget object as its only prop.
 */
export const WIDGET_REGISTRY: Record<
  string,
  React.ComponentType<{
    widget: Widget
    analyticsResult?: AnalyticsResult | null
    onUpdate: (patch: Partial<Widget>) => void
    selected?: boolean
  }>
> = {
  note:       NoteWidget,
  kpi:        KPIWidget,
  chart:      ChartWidget,
  rectangle:  RectangleWidget,
  circle:     CircleWidget,
  arrow:      ArrowWidget,
  text:       TextWidget,
  line_chart: LineChartWidget,
  dashboard:  DashboardWidget,
  indepth_analytics: InDepthAnalyticsWidget,
  top_assets: AllAssetsAnalyticsWidget,
  journey_analytics: JourneyAnalyticsWidget,
  partner_analytics: PartnerAnalyticsWidget,
  campaign_structure_map: CampaignStructureMapWidget,
  campaign_journey_map: CampaignJourneyMapWidget,
}

// ─── Display Labels ───────────────────────────────────────────────────────────

/**
 * Human-readable labels shown when widget.title is null.
 * Also used in the toolbar button labels.
 */
export const TYPE_LABELS: Record<string, string> = {
  note:       'Note',
  kpi:        'KPI',
  chart:      'Chart',
  rectangle:  'Rectangle',
  circle:     'Circle',
  arrow:      'Arrow',
  text:       'Text',
  line_chart: 'Line Chart',
  dashboard:  'Top Content',
  indepth_analytics: 'In-Depth Analytics',
  top_assets: 'Top Assets',
  journey_analytics: 'Analytic',
  partner_analytics: 'Partner Analytics',
  campaign_structure_map: 'Structure Map',
  campaign_journey_map: 'Journey Map',
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

  // ── Shape widgets ──────────────────────────────────────────────────────────

  rectangle: {
    width: 200,
    height: 120,
    category: 'shapes',
    title: null,
    config: {
      fillColor:    'transparent',
      strokeColor:  '#9ca3af',
      strokeWidth:  2,
      opacity:      1,
      cornerRadius: 8,
    },
    data: {},
  },

  circle: {
    width: 120,
    height: 120,
    category: 'shapes',
    title: null,
    config: {
      fillColor:   'transparent',
      strokeColor: '#9ca3af',
      strokeWidth: 2,
      opacity:     1,
    },
    data: {},
  },

  arrow: {
    width: 200,
    height: 40,
    category: 'shapes',
    title: null,
    config: {
      fillColor: '#FACC15',
      rotation:  0,
      headSize:  0.35,
      opacity:   1,
    },
    data: {},
  },

  text: {
    width: 240,
    height: 80,
    category: 'text',
    title: null,
    config: {
      text:       'New Text',
      color:      '#000000',
      fontSize:   24,
      fontWeight: 'bold',
      align:      'left',
    },
    data: {},
  },

  line_chart: {
    width: 480,
    height: 300,
    category: 'revenue',
    title: null,
    config: {
      dateRange:           '30d',
      activeSource:        'combined',
      selectedCampaignId:  null,
      selectedGoals:       [],
      selectedLeadMagnets: [],
      selectedVideoIds:    [],
      includeEV:           false,
    },
    data: {},
  },

  // ── Analytics widgets ──────────────────────────────────────────────────────

  dashboard: {
    width:    500,
    height:   320,
    category: 'analytics',
    title:    null,
    config: {
      dateRange:          '30days',
      selectedCampaignId: 'all',
    },
    data: {},
  },
  top_assets: {
    width: 560,
    height: 380,
    category: 'assets',
    title: null,
    config: {
      dateRange: '30days',
      activeSource: 'total',
      sortKey: 'total_revenue',
      selectedPlatform: 'all',
    },
    data: {},
  },
  journey_analytics: {
    width: 620,
    height: 420,
    category: 'analytics',
    title: null,
    config: {
      dateRange: 'all',
      activeSource: 'total',
      sortKey: 'longest',
      selectedPlatform: 'all',
      selectedCampaignId: 'all',
    },
    data: {},
  },
  partner_analytics: {
    width: 760,
    height: 720,
    category: 'collab',
    title: null,
    config: {
      mode: 'marketers',
      preset: 'last_30_days',
      customStart: null,
      customEnd: null,
      selectedIds: null,
      view: 'totals',
      scaleMode: 'auto',
      chartHidden: false,
    },
    data: {},
  },
  indepth_analytics: {
    width: 700,
    height: 420,
    category: 'analytics',
    title: null,
    config: {
      dateRange: '30days',
      selectedCampaignId: 'all',
    },
    data: {},
  },

  // Full map UIs — generous defaults so legend, zoom, filters, and nodes remain usable.
  // Slightly different sizes so consecutive spawns are easier to tell apart.
  campaign_structure_map: {
    width: 720,
    height: 520,
    category: 'analytics',
    title: null,
    config: {
      // Reserved for a future prop-driven campaign id; tree mode currently
      // selects the first available campaign internally.
      selectedCampaignId: null,
    },
    data: {},
  },
  campaign_journey_map: {
    width: 780,
    height: 560,
    category: 'analytics',
    title: null,
    config: {
      selectedCampaignId: null,
    },
    data: {},
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
  { type: 'note',      label: 'Note',        icon: '📝' },
  { type: 'kpi',       label: 'KPI',         icon: '📊' },
  { type: 'chart',     label: 'Chart',       icon: '📈' },
  { type: 'rectangle', label: 'Rect',        icon: '▭'  },
  { type: 'circle',    label: 'Circle',      icon: '○'  },
  { type: 'arrow',     label: 'Arrow',       icon: '→'  },
  { type: 'text',      label: 'Text',        icon: 'T'  },
  { type: 'line_chart',label: 'Line Chart',  icon: '📉' },
  { type: 'dashboard', label: 'Top Content', icon: '🏆' },
  { type: 'indepth_analytics', label: 'In-Depth', icon: '📋' },
  { type: 'top_assets', label: 'Top Assets', icon: '📦' },
  { type: 'journey_analytics', label: 'Analytic', icon: '📶' },
  { type: 'partner_analytics', label: 'Partner', icon: '🤝' },
  { type: 'campaign_structure_map', label: 'Structure Map', icon: '🗂' },
  { type: 'campaign_journey_map', label: 'Journey Map', icon: '🕸' },
]
