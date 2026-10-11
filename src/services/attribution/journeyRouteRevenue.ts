/**
 * Journey route Revenue — journey-linked conversions only.
 *
 * A conversion is attributed to a route group only when
 * resolveConversionOwners assigned a TRUE START journeyId that appears in
 * that route's memberJourneyIds. Direct/no-journey conversions are excluded
 * (no invented join). Click metrics are not computed here.
 */

import {
  processVideoMetrics,
  type PixelPurchaseRow,
  type StripePurchaseRow,
  type VideoMetricsResult,
  type RevenueView,
  emptyVideoMetrics,
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
  return !!id && !id.startsWith('singleton:');
}

/**
 * Build per-route metrics using processVideoMetrics on the bag of purchases
 * whose canonical owner.journeyId is in the route's memberJourneyIds.
 */
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
    return out;
  }

  const owned = await applyCanonicalPurchaseOwners({
    stripePurchases: opts.stripePurchases,
    pixelPurchases: opts.pixelPurchases,
  });

  // index formal owners by journeyId
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
    const row: StripePurchaseRow = {
      video_id: owner.ownerVideoId,
      campaign_id: p.campaign_id ?? '',
      amount: typeof p.amount === 'number' ? p.amount : parseFloat(String(p.amount ?? '0')),
      revenue_type: (p.revenue_type as StripePurchaseRow['revenue_type']) ?? 'offer',
      session_id: p.session_id ?? null,
      redirect_link_id: p.redirect_link_id ?? null,
      redirect_link_token: p.redirect_link_token ?? p.token ?? null,
    };
    if (!(row.amount > 0)) continue;
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
      amount: typeof p.amount === 'number' ? p.amount : parseFloat(String(p.amount ?? '0')),
      event_type: p.event_type ?? null,
      session_id: p.session_id ?? null,
    };
    const list = pixelByJourney.get(owner.journeyId) ?? [];
    list.push(row);
    pixelByJourney.set(owner.journeyId, list);
  }

  for (const route of routes) {
    const members = (route.memberJourneyIds ?? []).filter(isRealJourneyId);
    if (members.length === 0) continue;

    const stripeBag: StripePurchaseRow[] = [];
    const pixelBag: PixelPurchaseRow[] = [];
    const syntheticId = `route:${route.journeyId}`;

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
      events: [],
      stripePurchases: activeSource === 'pixel' ? [] : stripeBag,
      pixelPurchases: activeSource === 'stripe' ? [] : pixelBag,
      activeSource,
      includeEV,
    });

    out.set(route.journeyId, metrics);
  }

  return out;
}