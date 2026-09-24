// ─────────────────────────────────────────────────────────────────────────────
// assetAnalyticsColumns.ts
//
// Asset Analytics table column inventory, default visibility, and sort
// shortcut configuration. Reuses TABLE_COLUMNS / COLUMN_LABELS from
// analyticsEngine — does not redefine the shared metrics vocabulary.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { TABLE_COLUMNS, type MetricType } from '../../lib/analyticsEngine';
import type { AssetTypeTag, AssetAnalyticsRow } from './assetAnalyticsTypes';
import type { AssetAnalyticsTableRow } from '../../services/asset/getAssetAnalyticsRows';

/** Sort shortcuts — same set InDepthAnalytics exposes, minus dead unique_clicks. */
export const SORT_SHORTCUTS: { label: string; key: string }[] = [
  { label: 'Recently Added', key: 'asset_created_at' },
  { label: 'Revenue', key: 'total_revenue' },
  { label: 'Consultations', key: 'consultation_thankyou' },
  { label: 'Purchases', key: 'purchase_thankyou' },
  { label: 'Calls', key: 'call_booking_thankyou' },
  { label: 'Opt-ins', key: 'newsletter_thankyou' },
];

/** Asset-specific table columns beyond the shared TABLE_COLUMNS metrics. */
export const EXTRA_TABLE_COLUMNS: { key: string; label: string }[] = [
  { key: 'type', label: 'Type' },
  { key: 'promoting_content', label: 'Promoting Content' },
  { key: 'content_owner', label: 'Content Owner' },
  { key: 'asset_campaign', label: 'Asset Campaign' },
  { key: 'content_campaign', label: 'Content Campaign' },
  { key: 'asset_clicks', label: 'Asset Clicks' },
  { key: 'downstream', label: 'Downstream' },
];

/** Date columns — hidden by default (not spread into DEFAULT_VISIBLE). */
export const NEW_DATE_COLUMNS: { key: string; label: string }[] = [
  { key: 'asset_created_at', label: 'Asset Created At' },
  { key: 'content_created_at', label: 'Content Created At' },
];

/**
 * Default visible column keys.
 * NEW_DATE_COLUMNS intentionally omitted so those columns start hidden.
 */
export const DEFAULT_VISIBLE = new Set<string>([
  ...TABLE_COLUMNS,
  'promotion',
  ...EXTRA_TABLE_COLUMNS.map((c) => c.key),
]);

/** Map engine asset_type → UI badge taxonomy (local labels only). */
export function toAssetTypeTag(assetType: string): AssetTypeTag {
  if (assetType === 'campaign_element') return 'campaign_element';
  if (assetType === 'resource') return 'resource';
  if (assetType === 'video') return 'promotional_video';
  return 'content_video';
}

// ── Campaign Element TYPE cell = same text WebMood 2×2 as InDepthAnalytics ──
export const WEBMOOD_LINK_TYPES = ['sales_call', 'consultation', 'newsletter', 'landing_page'] as const;
export type WebmoodLinkType = (typeof WEBMOOD_LINK_TYPES)[number];
export const WEBMOOD_CELL_META: { type: WebmoodLinkType; label: string }[] = [
  { type: 'sales_call', label: 'SALES' },
  { type: 'consultation', label: 'CONSULT' },
  { type: 'newsletter', label: 'NEWS' },
  { type: 'landing_page', label: 'PURCHASE' },
];

/** Map campaign_element_assets.element_type → WebMood cell key. */
export function elementTypeToWebmood(elementType: string | null | undefined): WebmoodLinkType | null {
  if (!elementType) return null;
  const t = elementType.toLowerCase();
  if (t === 'sales_call' || t === 'sales') return 'sales_call';
  if (t === 'consultation' || t === 'consult') return 'consultation';
  if (t === 'newsletter' || t === 'news') return 'newsletter';
  if (t === 'landing_page' || t === 'landing' || t === 'purchase' || t === 'direct_purchase')
    return 'landing_page';
  return null;
}

export function WebmoodGrid({ activeTypes }: { activeTypes: Set<string> }) {
  return (
    <div
      className="grid grid-cols-2 gap-0.5 w-[88px] h-[44px] rounded-md overflow-hidden border border-zinc-800 bg-zinc-950 shrink-0"
      title="Campaign element position (orange = this asset's element type)"
    >
      {WEBMOOD_CELL_META.map(cell => {
        const on = activeTypes.has(cell.type);
        return (
          <div
            key={cell.type}
            className={
              on
                ? 'flex items-center justify-center text-[7px] font-black tracking-wider text-orange-400 bg-orange-500/20'
                : 'flex items-center justify-center text-[7px] font-black tracking-wider text-zinc-600 bg-zinc-900/80'
            }
          >
            {cell.label}
          </div>
        );
      })}
    </div>
  );
}

/** Zero-filled 14-column metrics bag; overlay AssetMetrics onto compatible keys. */
export function toTableMetrics(
  m: AssetAnalyticsTableRow['metrics'],
  full?: AssetAnalyticsTableRow['fullMetrics'],
): Record<MetricType, number | string> {
  const base = {} as Record<MetricType, number | string>;
  for (const key of TABLE_COLUMNS) {
    base[key as MetricType] = full ? ((full as any)[key] ?? 0) : 0;
  }
  // AssetMetrics is the 5-metric vocabulary from assetAnalyticsEngine.
  // Map into the shared table columns without inventing funnel breakdowns.
  if (!full && 'total_revenue' in base) base.total_revenue = m.revenue ?? 0;
  if ('unique_clicks' in base) base.unique_clicks = m.clicks ?? 0;
  return base;
}
/**
 * Pure sort for All Assets Analytics table rows.
 * Copied verbatim from AllAssetsAnalytics sortedRows useMemo (Phase 2 extract).
 * Preserves every special case, including intentional:
 *   key === 'asset_created_at' → promoting_video.created_at (Recently Added shortcut)
 */
export function sortAssetAnalyticsRows(
  rows: AssetAnalyticsRow[],
  sortConfig: { key: string; direction: 'asc' | 'desc' },
): AssetAnalyticsRow[] {
  const key = sortConfig.key;
  const dir = sortConfig.direction === 'asc' ? 1 : -1;
  if (key === 'asset_created_at') {
    return [...rows].sort((a, b) => {
      const at = a.promoting_video.created_at ? new Date(a.promoting_video.created_at).getTime() : 0;
      const bt = b.promoting_video.created_at ? new Date(b.promoting_video.created_at).getTime() : 0;
      if (at === bt) return 0;
      return at > bt ? dir : -dir;
    });
  }
  // New "Asset Created At" column — sorts by the ASSET's own created_at,
  // separate from the "asset_created_at" key above (which is actually the
  // "Recently Added" shortcut and intentionally sorts by content date —
  // left alone on purpose).
  if (key === 'asset_created_at_col') {
    return [...rows].sort((a, b) => {
      const at = a.asset.created_at ? new Date(a.asset.created_at).getTime() : 0;
      const bt = b.asset.created_at ? new Date(b.asset.created_at).getTime() : 0;
      if (at === bt) return 0;
      return at > bt ? dir : -dir;
    });
  }
  // New "Content Created At" column — same data as the "Recently Added"
  // shortcut above, just its own key so this column's header can sort
  // independently without relabeling that button.
  if (key === 'content_created_at_col') {
    return [...rows].sort((a, b) => {
      const at = a.promoting_video.created_at ? new Date(a.promoting_video.created_at).getTime() : 0;
      const bt = b.promoting_video.created_at ? new Date(b.promoting_video.created_at).getTime() : 0;
      if (at === bt) return 0;
      return at > bt ? dir : -dir;
    });
  }
  // asset_clicks lives on row.asset_clicks, not row.metrics (it's not a
  // MetricType key), so it needs the same kind of special case as
  // asset_created_at above rather than the generic metrics[key] branch.
  if (key === 'asset_clicks') {
    return [...rows].sort((a, b) => {
      const av = Number(a.asset_clicks ?? 0);
      const bv = Number(b.asset_clicks ?? 0);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }

  // Asset column — groups identical assets together. Sorted by asset
  // title (case-insensitive); ties broken by asset id so rows for the
  // same asset always land next to each other.
  if (key === 'asset') {
    return [...rows].sort((a, b) => {
      if (a.asset.id === b.asset.id) return 0;
      const at = (a.asset.title ?? '').toLowerCase();
      const bt = (b.asset.title ?? '').toLowerCase();
      if (at !== bt) return at > bt ? dir : -dir;
      return a.asset.id > b.asset.id ? dir : -dir;
    });
  }

  return [...rows].sort((a, b) => {
    const av = Number(a.metrics[key as MetricType] ?? 0);
    const bv = Number(b.metrics[key as MetricType] ?? 0);
    if (av === bv) return 0;
    return av > bv ? dir : -dir;
  });
}
