// ─────────────────────────────────────────────────────────────────────────────
// assetAnalyticsColumns.ts
//
// Asset Analytics table column inventory, default visibility, and sort
// shortcut configuration. Reuses TABLE_COLUMNS / COLUMN_LABELS from
// analyticsEngine — does not redefine the shared metrics vocabulary.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { TABLE_COLUMNS, type MetricType } from '../../lib/analyticsEngine';
import type { AssetTypeTag } from './assetAnalyticsTypes';
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