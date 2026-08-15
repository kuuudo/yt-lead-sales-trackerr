// ─────────────────────────────────────────────────────────────────────────────
// assetAnalyticsEngine.ts
//
// PURPOSE: Asset-level analytics (shared across the three asset types:
// campaign_element, video, resource). Scope is resolved by direct asset_id
// column match — unlike promotionAnalyticsEngine.ts, this engine never
// routes through a video-id pool:
//
//   Asset → redirect_links (asset_id = assetId, organization-bounded)
//     → token[]    → stripe_purchases.redirect_link_token
//     → events (asset_id = assetId, date-bounded)
//         → session_id[] → pixel_purchases.session_id
//                        → stripe_purchases.session_id (checkout-link bridge)
//
// redirect_links.promotion_id is NEVER read here — Promotion/Assignment
// ownership is explicitly out of scope for this engine (decision #4).
// assets.organization_id is the ONLY scope boundary. Unlike promotion_id in
// the sibling engine (secondary/inclusive-of-null disambiguation), an
// organization_id mismatch here is a hard exclude — see scopeToAsset().
//
// What this file reuses from analyticsEngine.ts (protected, unmodified):
//   - CLICK_EVENT_MAP, buildRedirectLinkLookup, buildStripeFromPurchases,
//     buildPixelPurchases, DateRange / CustomDateRange / getDateBounds
// What this file reuses from journeyAnalyticsEngine.ts (protected, unmodified):
//   - buildPurchaseJourney + its row/output types (JourneyEvent,
//     JourneyRedirectLinkRow, CampaignElementAssetRow, Journey, JourneyStep)
//   - The journey-insights aggregation pattern is DUPLICATED locally here
//     (not imported/shared with promotionAnalyticsEngine.ts) per decision #2 —
//     small (~30 lines), and keeping the two engines uncoupled was an
//     explicit choice, not an oversight.
//
// What this file explicitly does NOT do (decision #4):
//   - resolve Promotion / Assignment / operator / collaborator ownership
//   - assign performance credit or "cause" a conversion to any one source
//   - do any UI formatting/coloring/labeling — node labels below are
//     generic placeholders; real display names are the service/UI layer's job
//   - batch/list-level rollup across many assets (V1 is single-asset only)
//   - automatic recursion through video→asset→video chains (opt-in at the
//     caller level only — see resolveAssetIdForVideo in getAssetAnalytics.ts)
// ─────────────────────────────────────────────────────────────────────────────

import {
  CLICK_EVENT_MAP,
  buildRedirectLinkLookup,
  buildStripeFromPurchases,
  buildPixelPurchases,
  getDateBounds,
  type DateRange,
  type CustomDateRange,
} from './analyticsEngine';

import {
  buildPurchaseJourney,
  type CanonicalConversionRow,
  type JourneyEvent,
  type JourneyRedirectLinkRow,
  type JourneyStep,
  type CampaignElementAssetRow,
  type Journey,
} from './journeyAnalyticsEngine';

// ═════════════════════════════════════════════════════════════════════════════
// INPUT ROW TYPES
//
// Reuse the same table shapes journeyAnalyticsEngine.ts already defines,
// rather than redefining a parallel set that could drift out of sync — same
// approach promotionAnalyticsEngine.ts takes.
// ═════════════════════════════════════════════════════════════════════════════

/** events row — identical shape to journeyAnalyticsEngine.ts's JourneyEvent. */
export type AssetEventRow = JourneyEvent;

/** redirect_links row — identical shape to journeyAnalyticsEngine.ts's JourneyRedirectLinkRow. */
export type AssetRedirectLinkRow = JourneyRedirectLinkRow;

export interface AssetStripePurchaseRow {
  id: string;
  promotion_id: string | null;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  amount: number | string | null;
  created_at: string;
  redirect_link_id?: string | null;
  redirect_link_token?: string | null;
  organization_id?: string | null;
}

export interface AssetPixelPurchaseRow {
  id: string;
  promotion_id: string | null;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  amount: number | string | null;
  created_at: string;
  event_type: string | null;
  organization_id?: string | null;
}

export type ActiveSource = 'stripe' | 'pixel' | 'total';

/**
 * AssetVideoRow — minimal shape needed from `videos` for provenance
 * resolution (§3). Per Assets.tsx's own documented gap, there is no
 * confirmed UNIQUE constraint on videos.asset_id — resolved defensively as
 * an array everywhere below, never assumed 1:1.
 */
export interface AssetVideoRow {
  id: string;
  asset_id: string;
  campaign_id: string | null;
}

/**
 * AssetResourceRow — minimal shape needed from `asset_resources`.
 * Deliberately has NO campaign_id field: the table has no such column
 * (confirmed schema gap). Provenance for a resource asset is always
 * 'unknown' — never guessed.
 */
export interface AssetResourceRow {
  id: string;
  asset_id: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// ASSET TYPE / PROVENANCE
//
// assets.asset_type is the authoritative discriminator (§3 of the design).
// NOTE: supabase.ts's `Asset` type currently only declares
// `asset_type: 'video'`. Per confirmed decision, that is treated as
// stale/incomplete — this engine widens the type LOCALLY rather than
// touching supabase.ts.
// ═════════════════════════════════════════════════════════════════════════════

export type AssetProvenanceType = 'campaign_element' | 'video' | 'resource' | 'unknown';

export interface AssetProvenance {
  type: AssetProvenanceType;
  /**
   * campaign_id(s) resolvable for this asset. Can legitimately be more than
   * one for a campaign_element asset (composite key, per
   * journeyAnalyticsEngine.ts §6). Always [] for 'resource' (no schema path)
   * and for 'unknown'.
   */
  campaignIds: string[];
}

export interface AssetClassification {
  provenance: AssetProvenance;
  /** Non-fatal notices — e.g. more than one videos row for one asset_id. Never thrown; always surfaced for the caller to decide what to do with. */
  warnings: string[];
}

/**
 * classifyAsset
 *
 * Resolves which provenance join applies for this asset and runs it
 * defensively (array results, never assumed unique). Never falls back to
 * resource_type or presence/absence of rows to infer asset_type — the
 * asset's own asset_type column is authoritative (§3).
 */
export function classifyAsset(
  asset: { id: string; asset_type: string },
  campaignElementAssets: CampaignElementAssetRow[],
  videos: AssetVideoRow[],
  resources: AssetResourceRow[],
): AssetClassification {
  const warnings: string[] = [];

  switch (asset.asset_type) {
    case 'campaign_element': {
      const matches = campaignElementAssets.filter(r => r.asset_id === asset.id);
      if (matches.length > 1) {
        warnings.push(
          `Asset ${asset.id}: ${matches.length} campaign_element_assets rows matched — resolving all, none assumed primary (per journeyAnalyticsEngine.ts §6).`,
        );
      }
      return {
        provenance: { type: 'campaign_element', campaignIds: matches.map(m => m.campaign_id) },
        warnings,
      };
    }
    case 'video': {
      const matches = videos.filter(v => v.asset_id === asset.id);
      if (matches.length > 1) {
        warnings.push(
          `Asset ${asset.id}: ${matches.length} videos rows reference this asset_id — no confirmed UNIQUE constraint; resolved defensively.`,
        );
      }
      const campaignIds = matches.map(v => v.campaign_id).filter((c): c is string => !!c);
      return { provenance: { type: 'video', campaignIds }, warnings };
    }
    case 'resource': {
      const matches = resources.filter(r => r.asset_id === asset.id);
      if (matches.length > 1) {
        warnings.push(`Asset ${asset.id}: ${matches.length} asset_resources rows reference this asset_id.`);
      }
      // asset_resources has no campaign_id column — always 'unknown', never guessed.
      return { provenance: { type: 'resource', campaignIds: [] }, warnings };
    }
    default:
      warnings.push(`Asset ${asset.id}: unrecognized asset_type "${asset.asset_type}" — explicit unresolved state.`);
      return { provenance: { type: 'unknown', campaignIds: [] }, warnings };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// OUTPUT TYPES
// ═════════════════════════════════════════════════════════════════════════════

/** The simplified 5-metric vocabulary (§4) — deliberately narrower than the Promotion/Video dashboards. */
export interface AssetMetrics {
  clicks: number;
  sessions: number;
  conversions: number;
  /** direct_offer + consultation (+ estimated_call_revenue, per includeEV — decision #1: included by default). */
  revenue: number;
  /** revenue / clicks. 0 if clicks is 0. */
  rpc: number;
}

export interface AssetRelationshipRow {
  assetId: string;
  /** event.video_id — null bucket = events/purchases with no resolvable promoting source (kept, never dropped). */
  promotingSourceId: string | null;
  promotingSourceType: 'video';
  /** Evidence — which redirect_links (touched by this edge's events) express this relationship. */
  redirectLinkIds: string[];
  metrics: AssetMetrics;
}

export interface AssetJourneyNode {
  kind: 'video' | 'asset' | 'destination';
  id: string | null;
  /** Generic placeholder label (e.g. "Video {id}"). Real display names are resolved by the service/UI layer, never invented here. */
  label: string;
}

export interface AssetJourneyEdge {
  from: AssetJourneyNode;
  to: AssetJourneyNode;
  /** JourneyStep.event_id(s) this edge is derived from — evidence, not inference. */
  evidenceStepIds: string[];
}

export interface AssetJourneyGraph {
  nodes: AssetJourneyNode[];
  edges: AssetJourneyEdge[];
  /** Raw, unmodified Journey objects — never collapsed. */
  sampleJourneys: Journey[];
}

export interface AssetAnalyticsResult {
  metrics: AssetMetrics;
  classification: AssetClassification;
  relationships: AssetRelationshipRow[];
  journeyGraph: AssetJourneyGraph;
  debug: {
    assetId: string;
    activeSource: ActiveSource;
    dateRange: DateRange;
    rowCounts: {
      events: number;
      stripePurchases: number;
      pixelPurchases: number;
      redirectLinks: number;
      conversions: number;
    };
  };
}

export interface AssetJourneyContext {
  /** ALL events sharing a session_id with one of this asset's conversions — NOT asset-filtered, same rule as PromotionJourneyContext. */
  events: AssetEventRow[];
  redirectLinks: AssetRedirectLinkRow[];
  campaignElementAssets: CampaignElementAssetRow[];
}

export interface AssetAnalyticsEngineInput {
  assetId: string;
  /** The scope boundary for this engine (decision #4) — never a Promotion/Assignment resolution. */
  organizationId: string;
  assetType: string;
  dateRange: DateRange;
  customRange?: CustomDateRange | null;
  activeSource: ActiveSource;
  includeEV?: boolean;

  /**
   * Candidate rows: the caller (getAssetAnalytics.ts) fetches these via
   * `WHERE asset_id = assetId` (redirect_links, events) plus the token/
   * session bridge for purchases — NOT via a promotion/assignment
   * resolution. This engine defensively re-narrows via scopeToAsset() below
   * so a caller mistake can't silently contaminate this asset's numbers.
   */
  events: AssetEventRow[];
  stripePurchases: AssetStripePurchaseRow[];
  pixelPurchases: AssetPixelPurchaseRow[];
  redirectLinks: AssetRedirectLinkRow[];
  campaignElementAssets: CampaignElementAssetRow[];
  videos: AssetVideoRow[];
  resources: AssetResourceRow[];

  /** Journey evidence context. Session-scoped, NOT asset-filtered. Optional: if omitted, journeyGraph is returned empty rather than throwing. */
  journeyContext?: AssetJourneyContext;
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFENSIVE SCOPING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * scopeToAsset
 *
 * Re-filters every input array to this asset's actual scope, even though
 * the caller is expected to have already done this via its own WHERE
 * clause. Two things happen here that don't in promotionAnalyticsEngine.ts's
 * scopeToPromotion():
 *   1. Identity match is asset_id directly (no video-id-pool indirection).
 *   2. organization_id is a HARD exclude on mismatch (not secondary/
 *      inclusive-of-null disambiguation) — it IS the scope boundary here
 *      (decision #4), the same way promotion_id was for the sibling engine.
 */
function scopeToAsset(input: AssetAnalyticsEngineInput) {
  const { assetId, organizationId } = input;

  const redirectLinks = input.redirectLinks.filter(
    r => r.asset_id === assetId && (r.organization_id == null || r.organization_id === organizationId),
  );
  const validTokens = new Set(redirectLinks.map(r => r.token).filter((t): t is string => !!t));

  // Direct asset_id column match — no video-id-pool indirection (§2 of the design doc).
  const events = input.events.filter(
    e => e.asset_id === assetId && (e.organization_id == null || e.organization_id === organizationId),
  );

  const validSessionIds = new Set(events.map(e => e.session_id).filter((s): s is string => !!s));

  // Stripe: token match (this asset's own redirect_links) OR session bridge
  // through this asset's own events. Checkout-type redirect_links carry
  // asset_id = NULL and are therefore never in `redirectLinks` above —
  // without the session bridge every purchase through a checkout link would
  // be silently dropped here, the exact bug class fixed in Promotion
  // Analytics (see file header / getPromotionAnalytics.ts §3).
  const stripePurchases = input.stripePurchases.filter(
    p =>
      ((p.redirect_link_token != null && validTokens.has(p.redirect_link_token)) ||
        (p.session_id != null && validSessionIds.has(p.session_id))) &&
      (p.organization_id == null || p.organization_id === organizationId),
  );

  const pixelPurchases = input.pixelPurchases.filter(
    p =>
      p.session_id != null &&
      validSessionIds.has(p.session_id) &&
      (p.organization_id == null || p.organization_id === organizationId),
  );

  return { events, stripePurchases, pixelPurchases, redirectLinks };
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED METRICS CALCULATION
//
// Mirrors promotionAnalyticsEngine.ts's computeCoreMetrics() STRIPE / PIXEL /
// TOTAL branch logic exactly (same formulas, same source-isolation rules per
// activeSource) — reusable for both the asset's overall totals AND each
// per-relationship group in computeRelationships() below, since both are
// just "some subset of asset-scoped events/purchases in, AssetMetrics out."
// ═════════════════════════════════════════════════════════════════════════════

function computeAssetMetrics(
  events: AssetEventRow[],
  stripePurchases: AssetStripePurchaseRow[],
  pixelPurchases: AssetPixelPurchaseRow[],
  activeSource: ActiveSource,
  includeEV: boolean,
  redirectLinkTokenToLinkType: Record<string, string | null>,
): AssetMetrics {
  const CLICK_EVENT_TYPES = new Set(Object.values(CLICK_EVENT_MAP).flat());
  const clicks = events.filter(e => e.event_type != null && CLICK_EVENT_TYPES.has(e.event_type)).length;
  const sessions = new Set(events.map(e => e.session_id).filter((s): s is string => !!s)).size;

  const enrichedStripe = activeSource === 'pixel'
    ? []
    : buildStripeFromPurchases(
        stripePurchases.map(p => ({
          video_id: p.video_id,
          campaign_id: p.campaign_id,
          amount: p.amount,
          session_id: p.session_id,
          redirect_link_id: p.redirect_link_id ?? null,
          redirect_link_token: p.redirect_link_token ?? null,
        })),
        redirectLinkTokenToLinkType,
        {},
      );

  const enrichedPixel = activeSource === 'stripe'
    ? []
    : buildPixelPurchases(
        pixelPurchases.map(p => ({
          video_id: p.video_id,
          campaign_id: p.campaign_id,
          amount: p.amount,
          event_type: p.event_type,
          session_id: p.session_id,
        })),
        {},
      );

  let direct_offer_revenue = 0;
  let consultation_revenue = 0;
  let estimated_call_revenue = 0;
  let purchase_thankyou = 0;
  let consultation_thankyou = 0;

  if (activeSource === 'stripe') {
    for (const p of enrichedStripe) {
      if (p.revenue_type === 'offer') {
        direct_offer_revenue += p.amount;
        purchase_thankyou++;
      }
      if (p.revenue_type === 'consultation') {
        consultation_revenue += p.amount;
        consultation_thankyou++;
      }
    }
  } else if (activeSource === 'pixel') {
    for (const p of enrichedPixel) {
      const amt = p.amount ?? 0;
      switch (p.event_type) {
        case 'purchase':
          direct_offer_revenue += amt;
          purchase_thankyou++;
          break;
        case 'consultation':
          consultation_revenue += amt;
          consultation_thankyou++;
          break;
        case 'sales_call':
          if (includeEV) estimated_call_revenue += amt;
          break;
        default:
          break;
      }
    }
  } else {
    // total: stripe + pixel, cross-source deduped by session_id (pixel
    // skipped if its session_id already appears in stripe) — same rule as
    // analyticsEngine's processVideoMetrics TOTAL mode / the sibling engine.
    for (const p of enrichedPixel) {
      switch (p.event_type) {
        case 'purchase': purchase_thankyou++; break;
        case 'consultation': consultation_thankyou++; break;
        default: break;
      }
    }
    for (const p of enrichedStripe) {
      if (p.revenue_type === 'offer') {
        direct_offer_revenue += p.amount;
        purchase_thankyou++;
      }
      if (p.revenue_type === 'consultation') {
        consultation_revenue += p.amount;
        consultation_thankyou++;
      }
    }
    const stripeSessionIds = new Set(
      enrichedStripe.map(p => p.session_id).filter((s): s is string => !!s),
    );
    for (const p of enrichedPixel) {
      if (p.session_id && stripeSessionIds.has(p.session_id)) continue;
      const amt = p.amount ?? 0;
      if (p.event_type === 'purchase' && amt > 0) direct_offer_revenue += amt;
      if (p.event_type === 'consultation' && amt > 0) consultation_revenue += amt;
      if (p.event_type === 'sales_call' && amt > 0 && includeEV) estimated_call_revenue += amt;
    }
  }

  // Decision #1: EV included in the primary revenue metric by default —
  // estimated_call_revenue is already gated by includeEV at accumulation
  // time above, so this sum is safe unconditionally (same pattern as the
  // sibling engine's total_revenue).
  const revenue = Number((direct_offer_revenue + consultation_revenue + estimated_call_revenue).toFixed(2));
  const conversions = purchase_thankyou + consultation_thankyou;
  const rpc = clicks > 0 ? Number((revenue / clicks).toFixed(2)) : 0;

  return { clicks, sessions, conversions, revenue, rpc };
}

// ═════════════════════════════════════════════════════════════════════════════
// RELATIONSHIPS — "Video A / B / C → Asset G" (§5). One row per distinct
// event.video_id observed against this asset, plus one `promotingSourceId:
// null` bucket for events/purchases with no resolvable source.
//
// Conversions are grouped by the purchase's OWN video_id when present, else
// by its resolved redirect_link.video_id — per §2's note that a purchase's
// video_id (or its link's) is more reliable than re-deriving attribution
// from anything else, and per journeyAnalyticsEngine.ts's own documented
// warning that a purchase's redirect_link_id can diverge from the session's
// actual redirect link (so this is evidence, not a causal claim).
// ═════════════════════════════════════════════════════════════════════════════

const NO_SOURCE_KEY = '__none__';

function resolvePurchaseVideoId(
  purchase: { video_id: string | null; redirect_link_id?: string | null; redirect_link_token?: string | null },
  redirectLinkById: Map<string, AssetRedirectLinkRow>,
  redirectLinkByToken: Map<string, AssetRedirectLinkRow>,
): string | null {
  if (purchase.video_id) return purchase.video_id;
  const link =
    (purchase.redirect_link_id && redirectLinkById.get(purchase.redirect_link_id)) ||
    (purchase.redirect_link_token && redirectLinkByToken.get(purchase.redirect_link_token)) ||
    null;
  return link?.video_id ?? null;
}

function computeRelationships(
  assetId: string,
  scopedEvents: AssetEventRow[],
  scopedStripe: AssetStripePurchaseRow[],
  scopedPixel: AssetPixelPurchaseRow[],
  scopedRedirectLinks: AssetRedirectLinkRow[],
  activeSource: ActiveSource,
  includeEV: boolean,
  redirectLinkTokenToLinkType: Record<string, string | null>,
): AssetRelationshipRow[] {
  const redirectLinkById = new Map(scopedRedirectLinks.map(r => [r.id, r]));
  const redirectLinkByToken = new Map(scopedRedirectLinks.map(r => [r.token, r]));
  const key = (v: string | null) => v ?? NO_SOURCE_KEY;

  const eventsByVideo = new Map<string, AssetEventRow[]>();
  for (const e of scopedEvents) {
    const k = key(e.video_id);
    (eventsByVideo.get(k) ?? eventsByVideo.set(k, []).get(k)!).push(e);
  }

  const stripeByVideo = new Map<string, AssetStripePurchaseRow[]>();
  for (const p of scopedStripe) {
    const k = key(resolvePurchaseVideoId(p, redirectLinkById, redirectLinkByToken));
    (stripeByVideo.get(k) ?? stripeByVideo.set(k, []).get(k)!).push(p);
  }

  const pixelByVideo = new Map<string, AssetPixelPurchaseRow[]>();
  for (const p of scopedPixel) {
    // pixel_purchases carries no redirect_link_id/token in this schema — its
    // own video_id (if any) is the only resolvable source, else null bucket.
    const k = key(p.video_id);
    (pixelByVideo.get(k) ?? pixelByVideo.set(k, []).get(k)!).push(p);
  }

  const videoKeys = new Set<string>([
    ...eventsByVideo.keys(),
    ...stripeByVideo.keys(),
    ...pixelByVideo.keys(),
  ]);

  const rows: AssetRelationshipRow[] = [];
  for (const k of videoKeys) {
    const vEvents = eventsByVideo.get(k) ?? [];
    const vStripe = stripeByVideo.get(k) ?? [];
    const vPixel = pixelByVideo.get(k) ?? [];
    const metrics = computeAssetMetrics(vEvents, vStripe, vPixel, activeSource, includeEV, redirectLinkTokenToLinkType);
    const redirectLinkIds = Array.from(
      new Set(vEvents.map(e => e.redirect_link_id).filter((id): id is string => !!id)),
    );
    rows.push({
      assetId,
      promotingSourceId: k === NO_SOURCE_KEY ? null : k,
      promotingSourceType: 'video',
      redirectLinkIds,
      metrics,
    });
  }

  return rows.sort((a, b) => b.metrics.revenue - a.metrics.revenue || b.metrics.clicks - a.metrics.clicks);
}

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY GRAPH — §6. Duplicated locally from the aggregation pattern
// promotionAnalyticsEngine.ts's computeJourneyInsights() already uses
// (decision #2) — buildPurchaseJourney is called once per conversion,
// journeyAnalyticsEngine.ts itself is never modified.
//
// buildAssetJourneyGraph folds each journey's consecutive steps into edges
// purely from whatever evidence exists — no fixed video→asset→landing→
// checkout→purchase schema baked in, so journeys of any length render
// correctly without special-casing (dynamic graph, not a hardcoded funnel).
// ═════════════════════════════════════════════════════════════════════════════

function toCanonicalConversionRow(
  p: AssetStripePurchaseRow | AssetPixelPurchaseRow,
  source: 'stripe' | 'pixel',
): CanonicalConversionRow {
  return {
    id: p.id,
    source,
    amount: p.amount,
    created_at: p.created_at,
    session_id: p.session_id,
    video_id: p.video_id,
    campaign_id: p.campaign_id,
    promotion_id: p.promotion_id,
    organization_id: p.organization_id ?? null,
    redirect_link_id: 'redirect_link_id' in p ? p.redirect_link_id ?? null : null,
    redirect_link_token: 'redirect_link_token' in p ? p.redirect_link_token ?? null : null,
  };
}

function nodeForStep(step: JourneyStep): AssetJourneyNode {
  if (step.asset_id) return { kind: 'asset', id: step.asset_id, label: `Asset ${step.asset_id}` };
  if (step.video_id) return { kind: 'video', id: step.video_id, label: `Video ${step.video_id}` };
  const destLabel = step.link_type ?? step.redirectLink?.link_type ?? 'unknown';
  return { kind: 'destination', id: null, label: destLabel };
}

function nodeKey(n: AssetJourneyNode): string {
  return `${n.kind}:${n.id ?? n.label}`;
}

export function buildAssetJourneyGraph(journeys: Journey[]): AssetJourneyGraph {
  const nodesByKey = new Map<string, AssetJourneyNode>();
  const edgesByKey = new Map<string, AssetJourneyEdge>();

  const getOrAddNode = (n: AssetJourneyNode): AssetJourneyNode => {
    const k = nodeKey(n);
    if (!nodesByKey.has(k)) nodesByKey.set(k, n);
    return nodesByKey.get(k)!;
  };

  for (const j of journeys) {
    if (j.steps.length === 0) continue;
    if (j.steps.length === 1) {
      // Single-step journey — still register the lone node so it isn't
      // silently dropped, even though it produces no edge.
      getOrAddNode(nodeForStep(j.steps[0]));
      continue;
    }
    for (let i = 0; i < j.steps.length - 1; i++) {
      const fromStep = j.steps[i];
      const toStep = j.steps[i + 1];
      const fromNode = getOrAddNode(nodeForStep(fromStep));
      const toNode = getOrAddNode(nodeForStep(toStep));
      const ek = `${nodeKey(fromNode)}->${nodeKey(toNode)}`;
      if (!edgesByKey.has(ek)) {
        edgesByKey.set(ek, { from: fromNode, to: toNode, evidenceStepIds: [] });
      }
      const edge = edgesByKey.get(ek)!;
      edge.evidenceStepIds.push(fromStep.event_id, toStep.event_id);
    }
  }

  // Dedupe evidenceStepIds per edge (a step can be both the "to" of one hop
  // and the "from" of the next, and can legitimately appear across journeys).
  const edges = Array.from(edgesByKey.values()).map(e => ({
    ...e,
    evidenceStepIds: Array.from(new Set(e.evidenceStepIds)),
  }));

  return {
    nodes: Array.from(nodesByKey.values()),
    edges,
    sampleJourneys: journeys.filter(j => j.steps.length > 0).slice(0, 5),
  };
}

function computeJourneys(
  stripePurchases: AssetStripePurchaseRow[],
  pixelPurchases: AssetPixelPurchaseRow[],
  activeSource: ActiveSource,
  journeyContext: AssetJourneyContext | undefined,
): Journey[] {
  if (!journeyContext) return [];

  const conversions: CanonicalConversionRow[] = [
    ...(activeSource !== 'pixel' ? stripePurchases.map(p => toCanonicalConversionRow(p, 'stripe')) : []),
    ...(activeSource !== 'stripe' ? pixelPurchases.map(p => toCanonicalConversionRow(p, 'pixel')) : []),
  ];
  if (conversions.length === 0) return [];

  return conversions.map(c =>
    buildPurchaseJourney(c, journeyContext.events, journeyContext.redirectLinks, journeyContext.campaignElementAssets),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═════════════════════════════════════════════════════════════════════════════

export function computeAssetAnalytics(input: AssetAnalyticsEngineInput): AssetAnalyticsResult {
  const { assetId, assetType, dateRange, activeSource, includeEV = true } = input;

  const scoped = scopeToAsset(input);
  const redirectLinkTokenToLinkType = buildRedirectLinkLookup(
    scoped.redirectLinks.map(r => ({ token: r.token, link_type: r.link_type })),
  );

  const metrics = computeAssetMetrics(
    scoped.events,
    scoped.stripePurchases,
    scoped.pixelPurchases,
    activeSource,
    includeEV,
    redirectLinkTokenToLinkType,
  );

  const classification = classifyAsset(
    { id: assetId, asset_type: assetType },
    input.campaignElementAssets,
    input.videos,
    input.resources,
  );

  const relationships = computeRelationships(
    assetId,
    scoped.events,
    scoped.stripePurchases,
    scoped.pixelPurchases,
    scoped.redirectLinks,
    activeSource,
    includeEV,
    redirectLinkTokenToLinkType,
  );

  const journeys = computeJourneys(scoped.stripePurchases, scoped.pixelPurchases, activeSource, input.journeyContext);
  const journeyGraph = buildAssetJourneyGraph(journeys);

  return {
    metrics,
    classification,
    relationships,
    journeyGraph,
    debug: {
      assetId,
      activeSource,
      dateRange,
      rowCounts: {
        events: scoped.events.length,
        stripePurchases: scoped.stripePurchases.length,
        pixelPurchases: scoped.pixelPurchases.length,
        redirectLinks: scoped.redirectLinks.length,
        conversions: metrics.conversions,
      },
    },
  };
}

// Re-exported so getAssetAnalytics.ts (and any future caller) can build
// dateBounds without a second import of analyticsEngine.ts's internals.
export { getDateBounds };
export type { DateRange, CustomDateRange };
