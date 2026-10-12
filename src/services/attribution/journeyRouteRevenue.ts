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

/** Legacy fallback: only purchases created BEFORE this instant may use Video D → longest route. */
const LEGACY_FALLBACK_BEFORE_MS = Date.parse('2026-09-06T00:00:00+00:00');

export type RouteLike = {
  journeyId: string;
  memberJourneyIds?: string[] | null;
  path?: { steps?: Array<{ videoId?: string | null }> | null } | null;
};

function isRealJourneyId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && !id.startsWith('singleton:');
}

function parseAmount(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function routeLastVideoId(r: RouteLike): string | null {
  const steps = r.path?.steps ?? [];
  return steps.length > 0 ? steps[steps.length - 1]?.videoId ?? null : null;
}
function routeStepCount(r: RouteLike): number {
  return r.path?.steps?.length ?? 0;
}
function routeSignature(r: RouteLike): string {
  return (r.path?.steps ?? []).map((s) => s?.videoId ?? '').join('>');
}
/** Longest route; ties → smaller route signature (stable, independent of discovery order). */
function pickLongestRoute(cands: RouteLike[]): RouteLike {
  return [...cands].sort((a, b) => {
    const d = routeStepCount(b) - routeStepCount(a);
    if (d !== 0) return d;
    const sa = routeSignature(a);
    const sb = routeSignature(b);
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a.journeyId < b.journeyId ? -1 : a.journeyId > b.journeyId ? 1 : 0;
  })[0];
}
function isLegacyEligible(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t < LEGACY_FALLBACK_BEFORE_MS;
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
    const memberIdSetEarly = new Set<string>();

    for (const r of routes) {
      for (const id of r.memberJourneyIds ?? []) {
        if (isRealJourneyId(id)) memberIdSetEarly.add(id);
      }
    }

    console.log('[journeyRouteRevenue] qualify', {
      stripeIn: 0,
      pixelIn: 0,
      trueStartJourneyKeysStripe: 0,
      trueStartStripeRows: 0,
      trueStartJourneyKeysPixel: 0,
      trueStartPixelRows: 0,
      memberJourneyIds: memberIdSetEarly.size,
      journeyIdsMatchedToRoutes: 0,
      trueStartStripeRowsMatched: 0,
      trueStartPixelRowsMatched: 0,
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

  // ── LEGACY FALLBACK START (display-only; Video D → longest route) ──────────
  const routesByLastVideo = new Map<string, RouteLike[]>();
  for (const r of routes) {
    const last = routeLastVideoId(r);
    if (!last) continue;
    const list = routesByLastVideo.get(last) ?? [];
    list.push(r);
    routesByLastVideo.set(last, list);
  }
  const fbStripeByRoute = new Map<string, StripePurchaseRow[]>();
  const fbPixelByRoute = new Map<string, PixelPurchaseRow[]>();
  const fbSessionRoute = new Map<string, string>();
  const fb = {
    eligible: 0, noCreatedAt: 0, afterCutoff: 0, noVideoD: 0, noRoute: 0,
    assigned: 0, multiCandidate: 0, ties: 0, crossRouteTwins: 0,
    revenueEligible: 0, revenueAssigned: 0,
  };
  const fbExplain: unknown[] = [];

  const pickRoute = (videoD: string, purchaseId: string, amount: number) => {
    const cands = routesByLastVideo.get(videoD) ?? [];
    if (cands.length === 0) return null;
    const best = pickLongestRoute(cands);
    if (cands.length > 1) fb.multiCandidate += 1;
    if (cands.filter((c) => routeStepCount(c) === routeStepCount(best)).length > 1) fb.ties += 1;
    if (fbExplain.length < 5) {
      fbExplain.push({
        purchase: purchaseId.slice(0, 8),
        videoD: videoD.slice(0, 8),
        candidates: cands.map((c) => `${c.journeyId.slice(0, 8)}:${routeStepCount(c)}`),
        selected: best.journeyId.slice(0, 8),
        amount,
      });
    }
    return best;
  };

  for (const p of owned.stripePurchases) {
    const owner = p._canonicalOwner;
    if (!owner) continue;
    if (owner.attributionReason === 'true_start_upstream' || owner.attributionReason === 'true_start_path_root') continue;
    if (owner.attributionReason !== 'direct' && owner.attributionReason !== 'unresolved') continue;
    const amount = parseAmount(p.amount);
    if (!(amount > 0)) continue;
    if (!p.created_at || !Number.isFinite(Date.parse(p.created_at))) { fb.noCreatedAt += 1; continue; }
    if (!isLegacyEligible(p.created_at)) { fb.afterCutoff += 1; continue; }
    fb.eligible += 1;
    fb.revenueEligible += amount;
    if (owner.attributionReason !== 'direct' || !owner.ownerVideoId) { fb.noVideoD += 1; continue; }
    const route = pickRoute(owner.ownerVideoId, p.id, amount);
    if (!route) { fb.noRoute += 1; continue; }
    const row: StripePurchaseRow = {
      video_id: owner.ownerVideoId,
      campaign_id: p.campaign_id ?? '',
      amount,
      revenue_type: (p.revenue_type as StripePurchaseRow['revenue_type']) ?? 'offer',
      session_id: p.session_id ?? null,
      redirect_link_id: p.redirect_link_id ?? null,
      redirect_link_token: p.redirect_link_token ?? p.token ?? null,
    };
    const list = fbStripeByRoute.get(route.journeyId) ?? [];
    list.push(row);
    fbStripeByRoute.set(route.journeyId, list);
    if (p.session_id) fbSessionRoute.set(p.session_id, route.journeyId);
    fb.assigned += 1;
    fb.revenueAssigned += amount;
  }

  for (const p of owned.pixelPurchases) {
    const owner = p._canonicalOwner;
    if (!owner) continue;
    if (owner.attributionReason === 'true_start_upstream' || owner.attributionReason === 'true_start_path_root') continue;
    if (owner.attributionReason !== 'direct' && owner.attributionReason !== 'unresolved') continue;
    const amount = parseAmount(p.amount);
    if (!p.created_at || !Number.isFinite(Date.parse(p.created_at))) { fb.noCreatedAt += 1; continue; }
    if (!isLegacyEligible(p.created_at)) { fb.afterCutoff += 1; continue; }
    fb.eligible += 1;
    fb.revenueEligible += amount;
    if (owner.attributionReason !== 'direct' || !owner.ownerVideoId) { fb.noVideoD += 1; continue; }
    const route = pickRoute(owner.ownerVideoId, p.id, amount);
    if (!route) { fb.noRoute += 1; continue; }
    const row: PixelPurchaseRow = {
      video_id: owner.ownerVideoId,
      campaign_id: p.campaign_id ?? null,
      amount,
      event_type: p.event_type ?? null,
      session_id: p.session_id ?? null,
    };
    const list = fbPixelByRoute.get(route.journeyId) ?? [];
    list.push(row);
    fbPixelByRoute.set(route.journeyId, list);
    if (p.session_id && fbSessionRoute.has(p.session_id) && fbSessionRoute.get(p.session_id) !== route.journeyId) {
      fb.crossRouteTwins += 1;
    }
    fb.assigned += 1;
    fb.revenueAssigned += amount;
  }
  // ── LEGACY FALLBACK END ───────────────────────────────────────────────────

  let routeRevenueSum = 0;
  let routesWithRevenue = 0;

  for (const route of routes) {
    const members = (route.memberJourneyIds ?? []).filter(isRealJourneyId);
    if (
      members.length === 0 &&
      !fbStripeByRoute.has(route.journeyId) &&
      !fbPixelByRoute.has(route.journeyId)
    ) continue;

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

    for (const s of fbStripeByRoute.get(route.journeyId) ?? []) {
      stripeBag.push({ ...s, video_id: syntheticId });
    }
    for (const p of fbPixelByRoute.get(route.journeyId) ?? []) {
      pixelBag.push({ ...p, video_id: syntheticId });
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
    routeRevenueSum += metrics.total_revenue ?? 0;
    if ((metrics.total_revenue ?? 0) > 0) routesWithRevenue += 1;
  }
console.log('[DIAG owner]', {
  stripeKeys: Array.from(stripeByJourney.keys()),
  pixelKeys: Array.from(pixelByJourney.keys()),
  hasTarget: stripeByJourney.has('3fac8ee5-32de-484c-a219-010eb36d304a'),
});
  // TEMP DIAG legacy-fallback START
  console.log('[legacy-fallback]', {
    stripe: owned.stripePurchases.length,
    pixel: owned.pixelPurchases.length,
    trueStartRows:
      Array.from(stripeByJourney.values()).reduce((n, l) => n + l.length, 0) +
      Array.from(pixelByJourney.values()).reduce((n, l) => n + l.length, 0),
    ...fb,
    routeRevenueSum,
  });
  console.log('[legacy-fallback] explain', fbExplain);
  // TEMP DIAG legacy-fallback END
  console.log('[journeyRouteRevenue] summary', {
    routes: routes.length,
    stripeIn: opts.stripePurchases.length,
    pixelIn: opts.pixelPurchases.length,
    stripeByJourney: stripeByJourney.size,
    pixelByJourney: pixelByJourney.size,
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