/**
 * src/services/promotion/getTopMarketersAnalytics.ts
 *
 * Batch/ranking layer for the Marketplace "Top Marketers" card.
 *
 * Conceptually:
 *
 *   promotions (org-scoped)
 *     ↓  computePromotionAnalytics() per promotion, reused as-is
 *   PromotionLevelMetrics[]            (one row per promotion)
 *     ↓  group by marketerId
 *   sum(clicks), sum(sessions), sum(conversions), sum(revenue)
 *     ↓  rpc = Σrevenue / Σclicks   (NEVER an average of per-promotion rpc)
 *   MarketerRow[]
 *     ↓  rankTopMarketers()
 *
 * All of the promotion-level fetching, org isolation, and attribution logic
 * is done by getPromotionLevelMetricsForOrg() in getTopPromotionsAnalytics.ts
 * — this file adds ZERO new queries against events/redirect_links/
 * stripe_purchases/pixel_purchases. It only groups an already-computed,
 * already-org-scoped array. promotionAnalyticsEngine.ts and
 * getPromotionAnalytics.ts are untouched.
 *
 * MARKETER IDENTITY (confirmed, not guessed):
 *   promotions.assignment_collaborator_id
 *     → assignment_collaborators.id → assignment_collaborators.user_id
 *       → profiles.id → profiles.full_name ?? profiles.email
 *
 * This is the ACCEPTED collaborator on the assignment (e.g. Webmood) — never
 * promotions.owner_user_id (the assignment creator, e.g. Ali). That
 * resolution already happens once inside getPromotionLevelMetricsForOrg();
 * this file just reads the marketerId it attaches to each row.
 *
 * Promotions with no resolvable marketer (assignment_collaborator_id is
 * null, or the collaborator/profile row can't be found) are grouped under
 * marketerId = null and excluded from the ranking — there's no name to show
 * and no identity to aggregate under, so surfacing them would either invent
 * a name or silently misattribute revenue to the wrong person.
 */

import {
  getPromotionLevelMetricsForOrg,
  type GetTopPromotionsAnalyticsParams,
  type TopPromotionsPreset,
} from './getTopPromotionsAnalytics';

export type TopMarketersMetric = 'revenue' | 'clicks' | 'sessions' | 'conversions' | 'rpc';
export type { TopPromotionsPreset as TopMarketersPreset };

export interface MarketerPromotion {
  promotionId: string;
  title: string;
  revenue: number;
}

export interface MarketerRow {
  marketerId: string;
  marketerName: string;
  promotions: MarketerPromotion[];
  clicks: number;
  sessions: number;
  conversions: number;
  revenue: number;
  rpc: number;
}

export type GetTopMarketersAnalyticsParams = GetTopPromotionsAnalyticsParams;

/**
 * getTopMarketersAnalytics
 *
 * Aggregation happens FIRST (sum every metric across a marketer's
 * promotions), ranking happens SECOND (rankTopMarketers, called separately
 * by the component so re-ranking on metric change doesn't refetch).
 */
export async function getTopMarketersAnalytics(
  params: GetTopMarketersAnalyticsParams,
): Promise<MarketerRow[]> {
  const promotionRows = await getPromotionLevelMetricsForOrg(params);

  const byMarketer = new Map<string, MarketerRow>();

  for (const row of promotionRows) {
    // No resolvable marketer identity — see file header. Not included in
    // the ranking rather than guessed or attributed to the wrong person.
    if (!row.marketerId) continue;

    const marketerName = row.marketerName ?? 'Unknown marketer';
    const existing = byMarketer.get(row.marketerId);

    if (existing) {
      existing.clicks += row.clicks;
      existing.sessions += row.sessions;
      existing.conversions += row.conversions;
      existing.revenue += row.revenue;
      existing.promotions.push({ promotionId: row.promotionId, title: row.title, revenue: row.revenue });
    } else {
      byMarketer.set(row.marketerId, {
        marketerId: row.marketerId,
        marketerName,
        promotions: [{ promotionId: row.promotionId, title: row.title, revenue: row.revenue }],
        clicks: row.clicks,
        sessions: row.sessions,
        conversions: row.conversions,
        revenue: row.revenue,
        rpc: 0, // computed below, once totals are final
      });
    }
  }

  const rows = Array.from(byMarketer.values()).map(m => ({
    ...m,
    // Σrevenue / Σclicks — never an average of each promotion's own rpc.
    rpc: m.clicks > 0 ? Number((m.revenue / m.clicks).toFixed(2)) : 0,
    // Highest-revenue promotion first within the expandable list.
    promotions: [...m.promotions].sort((a, b) => b.revenue - a.revenue),
  }));

  return rows;
}

/**
 * rankTopMarketers — pure, non-mutating descending sort by metric.
 * Ties break by revenue, then marketerId, for a stable/deterministic order.
 */
export function rankTopMarketers(rows: MarketerRow[], metric: TopMarketersMetric): MarketerRow[] {
  return [...rows].sort((a, b) => {
    const diff = b[metric] - a[metric];
    if (diff !== 0) return diff;
    if (metric !== 'revenue') {
      const revDiff = b.revenue - a.revenue;
      if (revDiff !== 0) return revDiff;
    }
    return a.marketerId.localeCompare(b.marketerId);
  });
}
