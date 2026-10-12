/**
 * components/analytics/CampaignMapVideoAnalytics.tsx
 *
 * CampaignJourneyMap Phase 1 — month analytics view (presentation only).
 *
 *   Drawer  : one compact card per video of the clicked month node.
 *   Card    : Total Revenue / Clicks / Purchases (InDepthAnalytics mobile-card idea).
 *   Modal   : the full engine metric list (TABLE_COLUMNS + COLUMN_LABELS +
 *             formatCellValue — the same labels/order/formatting as InDepthAnalytics).
 *
 * No metric is computed here. Which videos = the month node (caller). Which
 * period of activity = the analytics date-range control below. They are separate.
 *
 * Definitions (verified against analyticsEngine.ts):
 *   - "Purchases"  = purchase_thankyou (what the InDepth mobile card shows).
 *   - "Clicks"     = the sum of the five engine click columns, i.e. exactly the
 *                    total the engine divides by for Revenue Per Click.
 *                    NOTE: InDepthAnalytics' mobile card reads key 'unique_clicks',
 *                    which does not exist in the engine (always 0) — NOT reused.
 *   - "Landing Page Clicks" (landing_page_view) is ONE of those five columns, not
 *     the same thing as Clicks. The engine has no separate "impressions" field.
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  COLUMN_LABELS,
  TABLE_COLUMNS,
  formatCellValue,
  type CustomDateRange,
  type DateRange,
  type MetricType,
  type ProcessedVideoRow,
} from '../../lib/analyticsEngine';


export type AnalyticsViewStatus = 'resolving' | 'loading' | 'ready' | 'error';

export const ANALYTICS_RANGE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'thismonth', label: 'This month' },
  { value: '7days', label: 'Last 7 days' },
  { value: '30days', label: 'Last 30 days' },
  { value: '2months', label: 'Last 2 months' },
  { value: '6months', label: 'Last 6 months' },
  { value: '1year', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
];

/** The engine's own Revenue-Per-Click denominator (sum of its five click columns). */
function engineTotalClicks(row: ProcessedVideoRow): number {
  return (
    row.landing_page_view +
    row.lead_magnet_click +
    row.newsletter_click +
    row.call_booking_click +
    row.consultation_click
  );
}

export function describeRange(range: DateRange, custom: CustomDateRange | null): string {
  if (range === 'custom') return custom ? `${String(custom.start)} → ${String(custom.end)}` : 'Custom range (incomplete)';
  return ANALYTICS_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? range;
}

/** Extra canvas height per video row while analytics cards are shown (8 gap + 68 card). */
export const ANALYTICS_CARD_ROW_EXTRA = 76
const CARD_H = 68

function palette(dark: boolean) {
  return dark
    ? { bg: '#1e293b', raised: '#0f172a', border: '#64748b', label: '#cbd5e1', value: '#f8fafc', money: '#4ade80', faint: '#94a3b8', warn: '#fbbf24', input: '#0f172a' }
    : { bg: '#f1f5f9', raised: '#ffffff', border: '#94a3b8', label: '#475569', value: '#0f172a', money: '#047857', faint: '#64748b', warn: '#b45309', input: '#ffffff' }
}

export type AnalyticsCardStatus = 'loading' | 'error' | 'ready' | 'incomplete'

/** Canvas-space cards (render inside the zoomed canvas div, so they scale with the map). */
export interface AnalyticsCardNode {
  partKey: string
  videoId: string
  x: number
  y: number
  w: number
  status: AnalyticsCardStatus
  row: ProcessedVideoRow | null
}

export function VideoAnalyticsCardsLayer({
  presentation, nodes, onOpen,
}: {
  presentation: 'campaign' | 'tree'
  nodes: AnalyticsCardNode[]
  onOpen: (partKey: string, videoId: string) => void
}) {
  const p = palette(presentation === 'tree')
  const line = (label: string, value: string, money?: boolean) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, lineHeight: '14px' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: p.label }}>{label}</span>
      <span style={{ fontSize: money ? 12.5 : 11.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: money ? p.money : p.value }}>{value}</span>
    </div>
  )
  return (
    <>
      {nodes.map((n) => {
        const row = n.row
        const ready = n.status === 'ready' && !!row
        const msg =
          n.status === 'loading' ? 'Loading analytics…'
          : n.status === 'error' ? 'Analytics unavailable'
          : n.status === 'incomplete' ? 'Pick a start and end date'
          : 'No analytics for this video'
        return (
          <div
            key={`vacard:${n.partKey}:${n.videoId}`}
            role="button"
            tabIndex={0}
            title={ready ? 'Open full analytics' : undefined}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => { if (ready) onOpen(n.partKey, n.videoId) }}
            style={{
              position: 'absolute', left: n.x, top: n.y, width: n.w, height: CARD_H, boxSizing: 'border-box',
              padding: '7px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
              borderRadius: 10, border: `1.5px solid ${p.border}`, background: p.bg,
              boxShadow: presentation === 'tree' ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(15,23,42,0.15)',
              cursor: ready ? 'pointer' : 'default',
            }}
          >
            {ready && row ? (
              <>
                {line('Total Revenue', formatCellValue('total_revenue', row), true)}
                {line('Clicks', engineTotalClicks(row).toLocaleString())}
                {line('Purchases', formatCellValue('purchase_thankyou', row))}
              </>
            ) : (
              <span style={{ fontSize: 11, color: p.faint, textAlign: 'center' }}>{msg}</span>
            )}
          </div>
        )
      })}
    </>
  )
}

export interface PartRange {
  range: DateRange
  start: string
  end: string
}
export const DEFAULT_PART_RANGE: PartRange = { range: 'all', start: '', end: '' }
export interface PartControl {
  key: string
  x: number
  y: number
}

/** Canvas-space: one button / period panel per month circle (Part), beside the circle. */
export function PartAnalyticsControls({
  presentation, parts, openKeys, ranges, notes, showRetry, onToggle, onRangeChange, onRetry,
}: {
  presentation: 'campaign' | 'tree'
  parts: PartControl[]
  openKeys: Set<string>
  ranges: Record<string, PartRange>
  notes: Record<string, string[]>
  showRetry: boolean
  onToggle: (key: string) => void
  onRangeChange: (key: string, patch: Partial<PartRange>) => void
  onRetry: () => void
}) {
  const dark = presentation === 'tree'
  const p = palette(dark)
  const field: React.CSSProperties = {
    background: p.input, color: p.value, border: `1px solid ${p.border}`, borderRadius: 8,
    fontSize: 12, padding: '5px 8px', colorScheme: dark ? 'dark' : 'light',
  }
  return (
    <>
      {parts.map((part) => {
        const open = openKeys.has(part.key)
        const pr = ranges[part.key] ?? DEFAULT_PART_RANGE
        return (
          <div
            key={`pactl:${part.key}`}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', left: part.x, top: part.y, zIndex: 3 }}
          >
            {!open ? (
              <button
                type="button"
                onClick={() => onToggle(part.key)}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                  whiteSpace: 'nowrap', border: '1px solid #3b82f6', background: '#2563eb', color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                }}
              >
                Show Analytics
              </button>
            ) : (
              <div
                style={{
                  width: 290, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '8px 10px', borderRadius: 10, border: `1px solid ${p.border}`, background: p.raised,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: p.label }}>Metrics period</span>
                  <select
                    value={pr.range}
                    onChange={(e) => onRangeChange(part.key, { range: e.target.value as DateRange })}
                    style={{ ...field, flex: 1, minWidth: 0 }}
                    aria-label="Analytics period"
                  >
                    {ANALYTICS_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => onToggle(part.key)}
                    aria-label="Close analytics"
                    title="Close analytics"
                    style={{ ...field, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '5px 8px' }}
                  >
                    ✕
                  </button>
                </div>
                {pr.range === 'custom' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="date" value={pr.start} max={pr.end || undefined} onChange={(e) => onRangeChange(part.key, { start: e.target.value })} style={{ ...field, flex: 1, minWidth: 0 }} aria-label="Start date" />
                    <input type="date" value={pr.end} min={pr.start || undefined} onChange={(e) => onRangeChange(part.key, { end: e.target.value })} style={{ ...field, flex: 1, minWidth: 0 }} aria-label="End date" />
                  </div>
                )}
                {showRetry && (
                  <button type="button" onClick={onRetry} style={{ ...field, cursor: 'pointer', fontWeight: 700 }}>Retry</button>
                )}
                {(notes[part.key] ?? []).map((t) => (
                  <div key={t} style={{ fontSize: 11, color: p.warn, lineHeight: 1.35 }}>{t}</div>
                ))}
                <div style={{ fontSize: 10.5, color: p.faint, lineHeight: 1.35 }}>
                  Figures cover activity in this period only.
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

export function VideoAnalyticsModal({
  presentation, row, periodLabel, onClose,
}: {
  presentation: 'campaign' | 'tree'
  row: ProcessedVideoRow
  periodLabel: string
  onClose: () => void
}) {
  const p = palette(presentation === 'tree')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const isolate = {
    onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onPointerMove: (e: React.SyntheticEvent) => e.stopPropagation(),
    onPointerUp: (e: React.SyntheticEvent) => e.stopPropagation(),
    onWheel: (e: React.SyntheticEvent) => e.stopPropagation(),
  }
  return createPortal(
    <div
      {...isolate}
      onClick={(e) => { e.stopPropagation(); onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
    >
      <div
        role="dialog"
        aria-label="Video analytics detail"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: p.raised, color: p.value, border: `1px solid ${p.border}`, borderRadius: 16, padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{row.video.video_title || `Video ${row.video.id.slice(0, 8)}…`}</div>
            <div style={{ fontSize: 11, color: p.faint, marginTop: 2 }}>
              Metrics period: <b style={{ color: p.label }}>{periodLabel}</b>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: p.input, color: p.value, border: `1px solid ${p.border}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ marginTop: 10, border: `1px solid ${p.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {(TABLE_COLUMNS as MetricType[]).map((key, i) => (
            <div
              key={key}
              style={{
                display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 12px', fontSize: 12.5,
                background: key === 'total_revenue' ? p.bg : 'transparent',
                borderTop: i === 0 ? 'none' : `1px solid ${p.border}`,
                fontWeight: key === 'total_revenue' ? 800 : 500,
              }}
            >
              <span style={{ color: p.label }}>{COLUMN_LABELS[key] ?? key}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCellValue(key, row)}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: p.faint, lineHeight: 1.45 }}>
          Total Revenue = Direct Offer Sales + Consultation Revenue + Estimated Call Revenue (engine definition). Revenue Per Click =
          Total Revenue ÷ all five click columns, and is $0 when there are no clicks. Revenue ownership follows the canonical attribution layer.
        </div>
      </div>
    </div>,
    document.body,
  )
}