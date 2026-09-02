// ─────────────────────────────────────────────────────────────────────────────
// assetAnalyticsColumns.ts
//
// Asset Analytics table column inventory, default visibility, and sort
// shortcut configuration. Reuses TABLE_COLUMNS / COLUMN_LABELS from
// analyticsEngine — does not redefine the shared metrics vocabulary.
// ─────────────────────────────────────────────────────────────────────────────

import { TABLE_COLUMNS } from '../../lib/analyticsEngine';

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
