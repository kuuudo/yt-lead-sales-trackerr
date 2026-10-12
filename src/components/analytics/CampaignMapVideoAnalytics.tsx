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

import React, { useEffect, useState } from 'react';
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
import { resolveThumbnail } from '../../lib/videoFormatters';

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

interface Props {
  presentation: 'campaign' | 'tree';
  monthLabel: string;
  status: AnalyticsViewStatus;
  error: string | null;
  /** Eligible videos for the month node (existing inclusion rules). */
  videoIds: string[];
  /** Own-asset month: assets that resolve to no video (listed for transparency). */
  assetsWithoutVideo: number;
  /** The month's existing video list is capped (a "show more" node exists) — not every video is shown. */
  listTruncated: boolean;
  /** null until metrics exist for the applied range. */
  rows: Map<string, ProcessedVideoRow> | null;
  missingVideoIds: string[];
  unresolvedStripe: number;
  unresolvedPixel: number;
  range: DateRange;
  customStart: string;
  customEnd: string;
  /** Applied custom range, or null when 'custom' is selected but incomplete/invalid. */
  appliedCustomRange: CustomDateRange | null;
  onRangeChange: (r: DateRange) => void;
  onCustomChange: (start: string, end: string) => void;
  onClose: () => void;
  onRetry: () => void;
}

export default function CampaignMapVideoAnalytics(props: Props) {
  const {
    presentation, monthLabel, status, error, videoIds, assetsWithoutVideo, listTruncated, rows, missingVideoIds,
    unresolvedStripe, unresolvedPixel, range, customStart, customEnd, appliedCustomRange,
    onRangeChange, onCustomChange, onClose, onRetry,
  } = props;
  const dark = presentation === 'tree';
  const c = dark
    ? { bg: '#0f0f0f', card: '#171717', border: '#262626', text: '#f5f5f5', sub: '#a3a3a3', faint: '#737373', input: '#0a0a0a' }
    : { bg: '#ffffff', card: '#f9fafb', border: '#e5e7eb', text: '#111827', sub: '#6b7280', faint: '#9ca3af', input: '#ffffff' };

  const [openVideoId, setOpenVideoId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openVideoId) setOpenVideoId(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openVideoId, onClose]);

  // Keep canvas pan/zoom handlers (React tree ancestors) from seeing events on these overlays.
  const isolate = {
    onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onPointerMove: (e: React.SyntheticEvent) => e.stopPropagation(),
    onPointerUp: (e: React.SyntheticEvent) => e.stopPropagation(),
    onWheel: (e: React.SyntheticEvent) => e.stopPropagation(),
    onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
  };

  const rangeIncomplete = range === 'custom' && !appliedCustomRange;
  const periodLabel = describeRange(range, appliedCustomRange);
  const unresolvedTotal = unresolvedStripe + unresolvedPixel;
  const openRow = openVideoId ? rows?.get(openVideoId) ?? null : null;

  const field: React.CSSProperties = {
    background: c.input, color: c.text, border: `1px solid ${c.border}`, borderRadius: 8,
    fontSize: 12, padding: '6px 8px', colorScheme: dark ? 'dark' : 'light',
  };

  const stat = (label: string, value: string, sub?: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
      <span style={{ color: c.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
        {label}{sub ? <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}> · {sub}</span> : null}
      </span>
      <span style={{ color: c.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );

  const body = () => {
    if (status === 'resolving' || status === 'loading') {
      return <Message color={c.sub}>{status === 'resolving' ? 'Finding this month’s videos…' : 'Loading analytics…'}</Message>;
    }
    if (status === 'error') {
      return (
        <Message color="#ef4444">
          Couldn’t load analytics{error ? `: ${error}` : '.'}
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={onRetry} style={{ ...field, cursor: 'pointer', fontWeight: 700 }}>Retry</button>
          </div>
        </Message>
      );
    }
    if (videoIds.length === 0) {
      return (
        <Message color={c.sub}>
          No eligible videos in {monthLabel}.
          {assetsWithoutVideo > 0 ? ` (${assetsWithoutVideo} asset${assetsWithoutVideo === 1 ? '' : 's'} here have no video.)` : ''}
        </Message>
      );
    }
    if (rangeIncomplete) return <Message color={c.sub}>Choose a start and end date (start must not be after end).</Message>;
    if (!rows) return <Message color={c.sub}>Loading analytics…</Message>;

    return (
      <>
        {unresolvedTotal > 0 && (
          <div style={{ fontSize: 11, color: '#d97706', border: '1px solid #d9770644', borderRadius: 8, padding: '6px 8px', marginBottom: 10 }}>
            {unresolvedTotal} purchase{unresolvedTotal === 1 ? '' : 's'} in this period could not be attributed to a video and are
            excluded from revenue.
          </div>
        )}
        {listTruncated && (
          <div style={{ fontSize: 11, color: '#d97706', border: '1px solid #d9770644', borderRadius: 8, padding: '6px 8px', marginBottom: 10 }}>
            This month’s video list is capped by the existing Structure panel, so some videos may not be shown.
          </div>
        )}
        {assetsWithoutVideo > 0 && (
          <div style={{ fontSize: 11, color: c.faint, marginBottom: 10 }}>
            {assetsWithoutVideo} asset{assetsWithoutVideo === 1 ? '' : 's'} in this month have no video and are not shown.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {videoIds.map((id) => {
            const row = rows.get(id);
            if (!row) {
              return (
                <div key={id} style={{ border: `1px dashed ${c.border}`, borderRadius: 12, padding: 12, fontSize: 12, color: c.faint }}>
                  Analytics unavailable for video {id.slice(0, 8)}…
                  {missingVideoIds.includes(id) ? ' (video not returned by the query)' : ''}
                </div>
              );
            }
            const thumb = resolveThumbnail(row.video as any) as string | null | undefined;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setOpenVideoId(id)}
                title="Open full analytics"
                style={{
                  textAlign: 'left', background: c.card, border: `1px solid ${c.border}`, borderRadius: 14,
                  padding: 12, cursor: 'pointer', color: c.text, display: 'block', width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  {thumb ? (
                    <img src={thumb} alt="" draggable={false} style={{ width: 56, height: 32, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                  ) : null}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.video.video_title || `Video ${id.slice(0, 8)}…`}
                    </div>
                    <div style={{ fontSize: 9.5, color: c.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(row.campaign as any)?.campaign_name ?? '—'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {stat('Total Revenue', formatCellValue('total_revenue', row))}
                  {stat('Clicks', engineTotalClicks(row).toLocaleString())}
                  {stat('Purchases', formatCellValue('purchase_thankyou', row))}
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  const drawer = (
    <div
      {...isolate}
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', zIndex: 2000,
        background: c.bg, borderLeft: `1px solid ${c.border}`, boxShadow: '-12px 0 32px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', color: c.text,
      }}
      role="dialog"
      aria-label={`${monthLabel} video analytics`}
    >
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${c.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{monthLabel} · Video analytics</div>
            <div style={{ fontSize: 11, color: c.faint }}>
              {videoIds.length} video{videoIds.length === 1 ? '' : 's'} created in this month
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close analytics" style={{ ...field, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: c.faint }}>Metrics period</span>
          <select value={range} onChange={(e) => onRangeChange(e.target.value as DateRange)} style={field} aria-label="Analytics period">
            {ANALYTICS_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {range === 'custom' && (
            <>
              <input type="date" value={customStart} max={customEnd || undefined} onChange={(e) => onCustomChange(e.target.value, customEnd)} style={field} aria-label="Start date" />
              <input type="date" value={customEnd} min={customStart || undefined} onChange={(e) => onCustomChange(customStart, e.target.value)} style={field} aria-label="End date" />
            </>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 10.5, color: c.faint }}>
          Videos are picked by the month node; figures cover activity in the selected metrics period only.
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>{body()}</div>
    </div>
  );

  const modal = openVideoId && openRow && (
    <div
      {...isolate}
      onClick={(e) => { e.stopPropagation(); setOpenVideoId(null); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
    >
      <div
        role="dialog"
        aria-label="Video analytics detail"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 16, padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{openRow.video.video_title || `Video ${openVideoId.slice(0, 8)}…`}</div>
            <div style={{ fontSize: 11, color: c.faint, marginTop: 2 }}>
              Metrics period: <b style={{ color: c.sub }}>{periodLabel}</b> · Video from {monthLabel}
            </div>
          </div>
          <button type="button" onClick={() => setOpenVideoId(null)} aria-label="Close" style={{ ...field, cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ marginTop: 10, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {(TABLE_COLUMNS as MetricType[]).map((key, i) => (
            <div
              key={key}
              style={{
                display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 12px', fontSize: 12.5,
                background: key === 'total_revenue' ? c.card : 'transparent',
                borderTop: i === 0 ? 'none' : `1px solid ${c.border}`,
                fontWeight: key === 'total_revenue' ? 800 : 500,
              }}
            >
              <span style={{ color: c.sub }}>{COLUMN_LABELS[key] ?? key}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCellValue(key, openRow)}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: c.faint, lineHeight: 1.45 }}>
          Total Revenue = Direct Offer Sales + Consultation Revenue + Estimated Call Revenue (engine definition). Revenue Per Click =
          Total Revenue ÷ all five click columns, and is $0 when there are no clicks. Revenue ownership follows the canonical attribution layer.
        </div>
      </div>
    </div>
  );

  return createPortal(<>{drawer}{modal}</>, document.body);
}

function Message({ children, color }: { children: React.ReactNode; color: string }) {
  return <div style={{ padding: '28px 8px', textAlign: 'center', fontSize: 12.5, color }}>{children}</div>;
}
