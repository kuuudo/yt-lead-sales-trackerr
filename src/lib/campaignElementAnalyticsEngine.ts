// ─────────────────────────────────────────────────────────────────────────────
// src/lib/campaignElementAnalyticsEngine.ts
//
// PURPOSE: Per-asset granular click/revenue breakdown for Campaign Element
// assets (asset_type = 'campaign_element') inside the Marketer Analytics
// Campaign Elements table (content/video = ROW, metrics = COLUMNS).
//
// This is a GENUINE missing primitive, not a duplicate of an existing one:
//   - assetAnalyticsEngine.ts's computeAssetAnalytics() (via
//     getAssetAnalyticsBatch.ts) already computes per-asset metrics, but
//     only the 5 aggregate fields { clicks, sessions, conversions, revenue,
//     rpc } — see TopAssetsRanking.tsx's EMPTY_METRICS. It does not break
//     clicks down by funnel step (landing page / lead magnet / newsletter /
//     call booking / consultation) or revenue by type (offer / consultation
//     / estimated call) PER ASSET.
//   - promotionAnalyticsEngine.ts computes that exact breakdown, but only
//     aggregated across an ENTIRE promotion (computeCoreMetrics) — never
//     broken out per individual asset/row.
//
// This file does not reinvent either calculation. It reuses, verbatim:
//   - CLICK_EVENT_MAP            (analyticsEngine.ts — exact event_type → click metric mapping)
//   - mapLinkTypeToRevenueType   (analyticsEngine.ts — link_type → offer/consultation/sales_call/newsletter)
// and mirrors the exact per-purchase attribution promotionAnalyticsEngine.ts's
// computeTopAssets() already uses (resolve a purchase's redirect_link via
// redirect_link_id, falling back to redirect_link_token, then read THAT
// link's own asset_id) — just keyed by asset_id → { click-type breakdown,
// revenue-type breakdown } instead of asset_id → { clicks, revenue } totals.
//
// SCHEMA LIMITATION THIS FILE MAKES VISIBLE (not one it introduces):
// pixel_purchases carries no redirect_link_id / redirect_link_token / asset_id
// in this schema — promotionAnalyticsEngine.ts's computeTopAssets() already
// documents this and excludes pixel from its own per-asset revenue for the
// same reason. Per analyticsEngine.ts's processVideoMetrics(), newsletter
// opt-ins (newsletter_thankyou), confirmed call bookings
// (call_booking_thankyou), and estimated call revenue
// (estimated_call_revenue) are ALL pixel-sourced only. Consequently those
// three columns are always 0 at the per-asset grain here, even when they are
// non-zero at the Promotion level — there is no per-purchase evidence that
// would let this file (or any file) attribute a pixel row to one specific
// asset. The UI should note this rather than hide it.
// ─────────────────────────────────────────────────────────────────────────────

import { CLICK_EVENT_MAP, mapLinkTypeToRevenueType } from './analyticsEngine';

export type ActiveSource = 'stripe' | 'pixel' | 'total';

export interface CampaignElementEventRow {
  event_type: string | null;
  asset_id: string | null;
}

export interface CampaignElementRedirectLinkRow {
  id: string;
  token: string | null;
  link_type: string | null;
  asset_id: string | null;
}

export interface CampaignElementStripePurchaseRow {
  amount: number | string | null;
  redirect_link_id?: string | null;
  redirect_link_token?: string | null;
}

export interface CampaignElementMetricRow {
  assetId: string;
  displayName: string;

  // ── Clicks (events table, asset_id direct column — always available
  // regardless of activeSource, same rule as computeClickMetrics()) ────────
  landing_page_view: number; // "Landing Page Clicks"
  lead_magnet_click: number; // "Lead Magnet Clicks"
  newsletter_click: number; // "Newsletter Clicks"
  call_booking_click: number; // "Call Booking Clicks"
  consultation_click: number; // "Consultation Page Clicks"
  totalClicks: number;

  // ── Conversions ───────────────────────────────────────────────────────
  purchase_thankyou: number; // "Direct Purchases" (Stripe revenue_type = 'offer')
  consultation_thankyou: number; // "Consultation Purchases" (Stripe revenue_type = 'consultation')
  newsletter_thankyou: number; // "Newsletter Opt-ins" — pixel-only, see file header; always 0 here
  call_booking_thankyou: number; // "Call Bookings Confirmed" — pixel-only, see file header; always 0 here

  // ── Revenue ───────────────────────────────────────────────────────────
  direct_offer_revenue: number; // "Direct Offer Sales"
  consultation_revenue: number; // "Consultation Revenue"
  estimated_call_revenue: number; // pixel-only, see file header; always 0 here
  total_revenue: number; // direct_offer_revenue + consultation_revenue + estimated_call_revenue
  rpc: number; // total_revenue / totalClicks
}

export interface ComputeCampaignElementBreakdownParams {
  /** Every Campaign Element asset id in the current marketer/promotion scope — one output row per id, even if it has zero activity. */
  assetIds: string[];
  displayNameByAssetId: Record<string, string>;
  /** Already asset_id-scoped + date-bounded by the caller (see getMarketerAnalytics.ts). */
  events: CampaignElementEventRow[];
  /** Redirect links owned by these assets (asset_id IN assetIds) — mirrors getAssetAnalyticsBatch.ts step 1. */
  redirectLinks: CampaignElementRedirectLinkRow[];
  /** Raw stripe_purchases rows already resolved via token+session bridge by the caller (see getMarketerAnalytics.ts) — NOT pre-enriched. */
  stripePurchases: CampaignElementStripePurchaseRow[];
  activeSource: ActiveSource;
}

/**
 * computeCampaignElementBreakdown
 *
 * Pure, deterministic. Given already-scoped raw rows, returns one row per
 * asset with the full 14-column breakdown item 8 of the spec calls for.
 */
export function computeCampaignElementBreakdown({
  assetIds,
  displayNameByAssetId,
  events,
  redirectLinks,
  stripePurchases,
  activeSource,
}: ComputeCampaignElementBreakdownParams): CampaignElementMetricRow[] {
  const redirectLinkById = new Map(redirectLinks.map(r => [r.id, r]));
  const redirectLinkByToken = new Map(redirectLinks.map(r => [r.token, r]));

  interface Acc {
    landing_page_view: number;
    lead_magnet_click: number;
    newsletter_click: number;
    call_booking_click: number;
    consultation_click: number;
    purchase_thankyou: number;
    consultation_thankyou: number;
    newsletter_thankyou: number;
    call_booking_thankyou: number;
    direct_offer_revenue: number;
    consultation_revenue: number;
    estimated_call_revenue: number;
  }
  const emptyAcc = (): Acc => ({
    landing_page_view: 0,
    lead_magnet_click: 0,
    newsletter_click: 0,
    call_booking_click: 0,
    consultation_click: 0,
    purchase_thankyou: 0,
    consultation_thankyou: 0,
    newsletter_thankyou: 0,
    call_booking_thankyou: 0,
    direct_offer_revenue: 0,
    consultation_revenue: 0,
    estimated_call_revenue: 0,
  });

  const byAsset = new Map<string, Acc>();
  for (const id of assetIds) byAsset.set(id, emptyAcc());

  // ── Clicks — identical mapping to computeClickMetrics() in
  // promotionAnalyticsEngine.ts, just grouped by asset_id instead of
  // summed promotion-wide. Always computed regardless of activeSource,
  // same as the rest of the codebase (click metrics are events-table-only
  // and independent of stripe/pixel selection). ──────────────────────────
  for (const [metricKey, rawTypes] of Object.entries(CLICK_EVENT_MAP)) {
    const typeSet = new Set(rawTypes);
    for (const e of events) {
      if (!e.asset_id) continue;
      const acc = byAsset.get(e.asset_id);
      if (!acc) continue; // outside this table's scope
      if (e.event_type && typeSet.has(e.event_type)) {
        (acc as unknown as Record<string, number>)[metricKey] += 1;
      }
    }
  }

  // ── Stripe revenue/conversions — attributed via the purchase's own
  // redirect_link (id, falling back to token), then THAT link's asset_id.
  // Same resolution computeTopAssets() already uses. Pixel is intentionally
  // excluded — see file header. ───────────────────────────────────────────
  if (activeSource !== 'pixel') {
    for (const p of stripePurchases) {
      const amt = parseFloat(String(p.amount ?? '0'));
      if (amt <= 0) continue;

      const linkRow =
        (p.redirect_link_id && redirectLinkById.get(p.redirect_link_id)) ||
        (p.redirect_link_token && redirectLinkByToken.get(p.redirect_link_token)) ||
        null;
      if (!linkRow?.asset_id) continue;

      const acc = byAsset.get(linkRow.asset_id);
      if (!acc) continue; // purchase attributes to an asset outside this table's scope

      const revenueType = mapLinkTypeToRevenueType(linkRow.link_type);
      if (revenueType === 'offer') {
        acc.direct_offer_revenue += amt;
        acc.purchase_thankyou += 1;
      } else if (revenueType === 'consultation') {
        acc.consultation_revenue += amt;
        acc.consultation_thankyou += 1;
      }
      // 'sales_call' / 'newsletter' revenue_type purchases are a real part
      // of the classification vocabulary but — same as processVideoMetrics()
      // in analyticsEngine.ts — are not wired into a revenue bucket today;
      // no behavior is being changed here, just mirrored.
    }
  }

  return assetIds.map(assetId => {
    const acc = byAsset.get(assetId)!;
    const totalClicks =
      acc.landing_page_view +
      acc.lead_magnet_click +
      acc.newsletter_click +
      acc.call_booking_click +
      acc.consultation_click;
    const total_revenue = acc.direct_offer_revenue + acc.consultation_revenue + acc.estimated_call_revenue;

    return {
      assetId,
      displayName: displayNameByAssetId[assetId] ?? assetId,
      ...acc,
      totalClicks,
      total_revenue,
      rpc: totalClicks > 0 ? Number((total_revenue / totalClicks).toFixed(2)) : 0,
    };
  });
}
