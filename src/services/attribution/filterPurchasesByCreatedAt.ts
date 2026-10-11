/**
 * filterPurchasesByCreatedAt.ts
 *
 * Shared purchase date-window filter for Dashboard / InDepthAnalytics.
 * Ownership is resolved BEFORE this filter; this only decides which owned
 * purchases enter getAnalyticsEngine for the selected reporting period.
 *
 * Boundary semantics match analyticsEngine.getDateBounds + filterVideosByDateRange:
 *   • dateRange === 'all'  → keep every row (including missing created_at)
 *   • otherwise            → require valid created_at in [start, end] inclusive
 *                            (t >= start && t <= end); missing/invalid → exclude
 */

import {
  getDateBounds,
  type DateRange,
  type CustomDateRange,
} from '../../lib/analyticsEngine';

export type WithOptionalCreatedAt = {
  created_at?: string | null;
};

/**
 * Filter purchase rows by their own created_at using the same window as events/videos.
 */
export function filterPurchasesByCreatedAt<T extends WithOptionalCreatedAt>(
  rows: T[],
  dateRange: DateRange,
  customRange?: CustomDateRange | null,
): T[] {
  if (dateRange === 'all') return rows;

  const { start, end } = getDateBounds(dateRange, customRange);
  return rows.filter((row) => {
    if (!row.created_at) return false;
    const t = new Date(row.created_at);
    if (Number.isNaN(t.getTime())) return false;
    return t >= start && t <= end;
  });
}

/**
 * Stripe enrichment drops amount <= 0. Pre-filter the same way so a subsequent
 * batch buildStripeFromPurchases result aligns 1:1 with this list for attaching
 * created_at by index (no id on StripePurchaseRow).
 */
export function stripeRowsWithPositiveAmount<T extends { amount?: number | string | null }>(
  rows: T[],
): T[] {
  return rows.filter((p) => {
    const amt = parseFloat(String(p.amount ?? '0'));
    return Number.isFinite(amt) && amt > 0;
  });
}
