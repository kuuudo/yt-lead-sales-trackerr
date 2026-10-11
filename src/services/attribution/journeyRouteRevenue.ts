/**
 * journeyRouteRevenue.ts
 *
 * Journey-linked formal Revenue only:
 *   applyCanonicalPurchaseOwners → TRUE START rows with journeyId ∈
 *   route.memberJourneyIds → processVideoMetrics on a synthetic bag.
 *
 * Direct / unresolved / uncounted / singleton routes are not assigned route $.
 * Click metrics are filled by journeyRouteClicks.ts (merge in the page).
 */

import {
  processVideoMetrics,
  emptyVideoMetrics,
  type PixelPurchaseRow,
  type StripePurchaseRow,
  type VideoMetricsResult,
  type RevenueView,
} from '../../lib/analyticsEngine';
import {
  applyCanonicalPurchaseOwners,
  type ApplyCanonicalOwnersInput,
} from './applyCanonicalPurchaseOwners';

export type RouteLike = {
  journeyId: string;
  memberJourneyIds?: string[] | null;
};

function isRealJourneyId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && !id.startsWith('singleton:');
}

function parseAmount(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

export async function computeJourneyRouteRevenueMetrics(opts: {
  routes: RouteLike[];
  stripePurchases: ApplyCanonicalOwnersInput['stripePurchases'];
  pixelPurchases: ApplyCanonicalOwnersInput['pixelPurchases'];
  activeSource: RevenueView;
  includeEV?: boolean;
}): Promise<Map<string, VideoMetricsResult>> {
  const out = new Map<string, VideoMetricsResult>();
  const { routes, activeSource, includeEV = true } = opts;

  for (const r of routes) {
    out.set(r.journeyId, emptyVideoMetrics('hybrid') as VideoMetricsResult);
  }

  if (opts.stripePurchases.length === 0 && opts.pixelPurchases.length === 0) {
    console.log('[journeyRouteRevenue] summary', {
      routes: routes.length,
      stripeIn: 0,
      pixelIn: 0,
      stripeByJourney: 0,
      pixelByJourney: 0,
      routesWithRevenue: 0,
    });
    return out;
  }

  const owned = await applyCanonicalPurchaseOwners({
    stripePurchases: opts.stripePurchases,
    pixelPurchases: opts.pixelPurchases,
  });

  const stripeByJourney = new Map<string, StripePurchaseRow[]>();
  const pixelByJourney = new Map<string, PixelPurchaseRow[]>();

  for (const p of owned.stripePurchases) {
    const owner = p._canonicalOwner;
    if (!owner?.journeyId || !owner.ownerVideoId) continue;
    if (
      owner.attributionReason !== 'true_start_upstream' &&
      owner.attributionReason !== 'true_start_path_root'
    ) {
      continue;
    }
    const amount = parseAmount(p.amount);
    if (!(amount > 0)) continue;
    const row: StripePurchaseRow = {
      video_id: owner.ownerVideoId,
      campaign_id: p.campaign_id ?? '',
      amount,
      revenue_type: (p.revenue_type as StripePurchaseRow['revenue_type']) ?? 'offer',
      session_id: p.session_id ?? null,
      redirect_link_id: p.redirect_link_id ?? null,
      redirect_link_token: p.redirect_link_token ?? p.token ?? null,
    };
    const list = stripeByJourney.get(owner.journeyId) ?? [];
    list.push(row);
    stripeByJourney.set(owner.journeyId, list);
  }

  for (const p of owned.pixelPurchases) {
    const owner = p._canonicalOwner;
    if (!owner?.journeyId || !owner.ownerVideoId) continue;
    if (
      owner.attributionReason !== 'true_start_upstream' &&
      owner.attributionReason !== 'true_start_path_root'
    ) {
      continue;
    }
    const row: PixelPurchaseRow = {
      video_id: owner.ownerVideoId,
      campaign_id: p.campaign_id ?? null,
      amount: parseAmount(p.amount),
      event_type: p.event_type ?? null,
      session_id: p.session_id ?? null,
    };
    const list = pixelByJourney.get(owner.journeyId) ?? [];
    list.push(row);
    pixelByJourney.set(owner.journeyId, list);
  }

  let routesWithRevenue = 0;

  for (const route of routes) {
    const members = (route.memberJourneyIds ?? []).filter(isRealJourneyId);
    if (members.length === 0) continue;

    const syntheticId = `route:${route.journeyId}`;
    const stripeBag: StripePurchaseRow[] = [];
    const pixelBag: PixelPurchaseRow[] = [];

    for (const jid of members) {
      for (const s of stripeByJourney.get(jid) ?? []) {
        stripeBag.push({ ...s, video_id: syntheticId });
      }
      for (const p of pixelByJourney.get(jid) ?? []) {
        pixelBag.push({ ...p, video_id: syntheticId });
      }
    }

    if (stripeBag.length === 0 && pixelBag.length === 0) continue;

    const metrics = processVideoMetrics({
      videoId: syntheticId,
      campaignId: null,
      activeSource,
      events: [],
      stripePurchases: activeSource === 'pixel' ? [] : stripeBag,
      pixelPurchases: activeSource === 'stripe' ? [] : pixelBag,
      includeEV,
    });

    out.set(route.journeyId, metrics);
    if ((metrics.total_revenue ?? 0) > 0) routesWithRevenue += 1;
  }

  // TEMP DIAGNOSTIC — counts only; remove after Revenue $0 diagnosis
  const memberIdSet = new Set<string>();
  for (const r of routes) {
    for (const id of r.memberJourneyIds ?? []) {
      if (isRealJourneyId(id)) memberIdSet.add(id);
    }
  }

  let trueStartStripeRows = 0;
  let trueStartStripeRowsMatched = 0;
  stripeByJourney.forEach((rows, jid) => {
    trueStartStripeRows += rows.length;
    if (memberIdSet.has(jid)) trueStartStripeRowsMatched += rows.length;
  });

  let trueStartPixelRows = 0;
  let trueStartPixelRowsMatched = 0;
  pixelByJourney.forEach((rows, jid) => {
    trueStartPixelRows += rows.length;
    if (memberIdSet.has(jid)) trueStartPixelRowsMatched += rows.length;
  });

  const trueStartJourneyKeySet = new Set<string>([
    ...stripeByJourney.keys(),
    ...pixelByJourney.keys(),
  ]);
  let journeyIdsMatchedToRoutes = 0;
  trueStartJourneyKeySet.forEach((jid) => {
    if (memberIdSet.has(jid)) journeyIdsMatchedToRoutes += 1;
  });

  console.log('[journeyRouteRevenue] qualify', {
    stripeIn: opts.stripePurchases.length,
    pixelIn: opts.pixelPurchases.length,
    trueStartJourneyKeysStripe: stripeByJourney.size,
    trueStartStripeRows,
    trueStartJourneyKeysPixel: pixelByJourney.size,
    trueStartPixelRows,
    memberJourneyIds: memberIdSet.size,
    journeyIdsMatchedToRoutes,
    trueStartStripeRowsMatched,
    trueStartPixelRowsMatched,
    routesWithRevenue,
  });

  return out;
}

/**
 * Merge journey-scoped click counts into engine metrics and recompute rpc
 * with the same click denominator as processVideoMetrics.
 */
export function mergeRouteClicksIntoMetrics(
  revenueByRoute: Map<string, VideoMetricsResult>,
  clicksByRoute: Map<
    string,
    {
      landing_page_view: number;
      lead_magnet_click: number;
      newsletter_click: number;
      call_booking_click: number;
      consultation_click: number;
    }
  >,
): Map<string, VideoMetricsResult> {
  const out = new Map<string, VideoMetricsResult>();
  const ids = new Set<string>([
    ...revenueByRoute.keys(),
    ...clicksByRoute.keys(),
  ]);

  for (const routeId of ids) {
    const rev =
      revenueByRoute.get(routeId) ??
      (emptyVideoMetrics('hybrid') as VideoMetricsResult);
    const c = clicksByRoute.get(routeId);
    const next = { ...rev };
    if (c) {
      next.landing_page_view = c.landing_page_view;
      next.lead_magnet_click = c.lead_magnet_click;
      next.newsletter_click = c.newsletter_click;
      next.call_booking_click = c.call_booking_click;
      next.consultation_click = c.consultation_click;
    }
    const clicks =
      next.landing_page_view +
      next.lead_magnet_click +
      next.newsletter_click +
      next.call_booking_click +
      next.consultation_click;
    next.rpc =
      clicks > 0 ? Number(((next.total_revenue ?? 0) / clicks).toFixed(2)) : 0;
    out.set(routeId, next);
  }
  return out;
}