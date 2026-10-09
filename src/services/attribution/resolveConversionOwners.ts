/**
 * services/attribution/resolveConversionOwners.ts
 *
 * Phase 1 — Canonical Revenue / Conversion ownership layer.
 *
 * One conversion → at most one Video Owner (and optional Asset Owner).
 * Ownership is computed independently of activeSource, page, identity, and
 * date filters. Callers apply scope/filters AFTER this function returns.
 *
 * Reuses (does not reimplement):
 *   resolveStripePurchaseJourneys → resolveJourneyStarts (TRUE START)
 *   resolvePixelPurchaseJourneys  → resolveJourneyStarts (TRUE START)
 *
 * Locked Video Owner rules are implemented here. Marketer / Campaign
 * ownership are deferred to later phases; this layer exposes the link IDs
 * needed to resolve them without re-deriving ownership.
 */

import { supabase } from '../../lib/supabase';
import {
  resolveStripePurchaseJourneys,
  type StripePurchaseJourneyInput,
  type StripePurchaseJourneyResolution,
} from './resolveStripePurchaseJourneys';
import {
  resolvePixelPurchaseJourneys,
  type PixelPurchaseJourneyInput,
  type PixelPurchaseJourneyResolution,
} from './resolvePixelPurchaseJourneys';
import { fetchRowsByIn, chunkArray } from './resolveJourneyStart';

// ── Public types ────────────────────────────────────────────────────────────

export type AttributionReason =
  | 'true_start_upstream'
  | 'true_start_path_root'
  | 'direct'
  | 'unresolved'
  | 'uncounted';

export type ConversionSource = 'stripe' | 'pixel';

export interface ConversionOwnerResult {
  source: ConversionSource;
  sourceRecordId: string;
  /** pixel_purchases.conversion_id or stripe equivalent when present */
  conversionId: string | null;
  conversionType: string | null;
  amount: number;
  occurredAt: string;
  ownerVideoId: string | null;
  ownerAssetId: string | null;
  /** TRUE START redirect link — Marketer attribution source (Phase 3) */
  startRedirectLinkId: string | null;
  /** Last conversion-entry redirect link — Campaign attribution source (Phase 4) */
  lastEntryRedirectLinkId: string | null;
  journeyId: string | null;
  attributionReason: AttributionReason;
  sessionId: string | null;
  /** Pixel event_id or Stripe-resolved checkout event id — cross-source dedup key */
  eventId: string | null;
  /**
   * When this record is suppressed because a Stripe twin with the same
   * verified event trace is preferred as the financial record.
   * Formal revenue consumers should skip rows where suppressedByStripeId is set.
   */
  suppressedByStripeId: string | null;
}

export interface StripePurchaseOwnerInput {
  id: string;
  session_id: string | null;
  token: string | null;
  video_id: string | null;
  campaign_id?: string | null;
  amount: number | string | null;
  created_at: string;
  redirect_link_id?: string | null;
  redirect_link_token?: string | null;
  organization_id?: string | null;
  conversion_id?: string | null;
  revenue_type?: string | null;
}

export interface PixelPurchaseOwnerInput {
  id: string;
  event_id: string | null;
  session_id: string | null;
  video_id: string | null;
  campaign_id?: string | null;
  amount: number | string | null;
  event_type: string | null;
  created_at: string;
  asset_id?: string | null;
  conversion_id?: string | null;
  events_journey_id?: string | null;
  organization_id?: string | null;
  promotion_id?: string | null;
}

export interface ResolveConversionOwnersInput {
  stripePurchases: StripePurchaseOwnerInput[];
  pixelPurchases: PixelPurchaseOwnerInput[];
}

export interface ResolveConversionOwnersResult {
  /** key = `${source}:${sourceRecordId}` */
  byKey: Map<string, ConversionOwnerResult>;
  /**
   * Convenience maps for existing AllAssets consumers (Layer 3 owner override).
   * Only entries with a resolved ownerVideoId + ownerAssetId are included.
   * Uncounted / unresolved / suppressed rows are omitted.
   */
  stripeOwnerByPurchaseId: Map<string, { videoId: string; assetId: string }>;
  pixelOwnerByPurchaseId: Map<string, { videoId: string; assetId: string }>;
  /** Pixel purchase ids classified as uncounted (exclude from formal revenue). */
  uncountedPixelIds: Set<string>;
  /** Pixel purchase ids suppressed because a Stripe twin is the financial record. */
  suppressedPixelIds: Set<string>;
}

export function conversionOwnerKey(source: ConversionSource, id: string): string {
  return `${source}:${id}`;
}

// ── Internal helpers ────────────────────────────────────────────────────────

type EventLite = {
  id: string;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  redirect_link_id: string | null;
  asset_id: string | null;
  event_type: string | null;
  created_at: string;
};

type LinkLite = {
  id: string;
  token: string | null;
  video_id: string | null;
  asset_id: string | null;
  link_type: string | null;
  campaign_id: string | null;
  promotion_id: string | null;
};

function parseAmount(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function reasonFromStartStatus(
  status: string | undefined,
): 'true_start_upstream' | 'true_start_path_root' | null {
  if (status === 'resolved_with_upstream_hop') return 'true_start_upstream';
  if (status === 'resolved_path_only') return 'true_start_path_root';
  return null;
}

async function fetchEventsByIds(ids: string[]): Promise<Map<string, EventLite>> {
  const out = new Map<string, EventLite>();
  if (ids.length === 0) return out;
  const rows = await fetchRowsByIn<EventLite>(
    'events',
    'id, session_id, video_id, campaign_id, redirect_link_id, asset_id, event_type, created_at',
    'id',
    ids,
  );
  for (const r of rows) out.set(r.id, r);
  return out;
}

async function fetchLinksByIds(ids: string[]): Promise<Map<string, LinkLite>> {
  const out = new Map<string, LinkLite>();
  if (ids.length === 0) return out;
  const rows = await fetchRowsByIn<LinkLite>(
    'redirect_links',
    'id, token, video_id, asset_id, link_type, campaign_id, promotion_id',
    'id',
    ids,
  );
  for (const r of rows) out.set(r.id, r);
  return out;
}

async function fetchLinksByTokens(tokens: string[]): Promise<Map<string, LinkLite>> {
  const out = new Map<string, LinkLite>();
  const distinct = Array.from(new Set(tokens.filter(Boolean)));
  if (distinct.length === 0) return out;
  for (const batch of chunkArray(distinct, 150)) {
    const { data, error } = await supabase
      .from('redirect_links')
      .select('id, token, video_id, asset_id, link_type, campaign_id, promotion_id')
      .in('token', batch);
    if (error) {
      console.error('[resolveConversionOwners] redirect_links by token failed:', error.message);
      continue;
    }
    for (const r of (data ?? []) as LinkLite[]) {
      if (r.token) out.set(r.token, r);
    }
  }
  return out;
}

// ── Core ────────────────────────────────────────────────────────────────────

/**
 * resolveConversionOwners
 *
 * Pure ownership decision for every Stripe + Pixel purchase row supplied.
 * Does NOT apply date, org, identity, or activeSource filters.
 */
export async function resolveConversionOwners(
  input: ResolveConversionOwnersInput,
): Promise<ResolveConversionOwnersResult> {
  const byKey = new Map<string, ConversionOwnerResult>();
  const stripeOwnerByPurchaseId = new Map<string, { videoId: string; assetId: string }>();
  const pixelOwnerByPurchaseId = new Map<string, { videoId: string; assetId: string }>();
  const uncountedPixelIds = new Set<string>();
  const suppressedPixelIds = new Set<string>();

  const stripePurchases = input.stripePurchases ?? [];
  const pixelPurchases = input.pixelPurchases ?? [];

  // ── 1. Journey resolution (existing resolvers, unchanged) ───────────────
  let stripeJourney = new Map<string, StripePurchaseJourneyResolution>();
  let pixelJourney = new Map<string, PixelPurchaseJourneyResolution>();

  try {
    const stripeInput: StripePurchaseJourneyInput[] = stripePurchases.map((p) => ({
      id: p.id,
      session_id: p.session_id ?? null,
      token: p.token ?? null,
      created_at: p.created_at,
    }));
    stripeJourney = await resolveStripePurchaseJourneys(stripeInput);
  } catch (err) {
    console.error('[resolveConversionOwners] resolveStripePurchaseJourneys failed:', err);
  }

  try {
    const pixelInput: PixelPurchaseJourneyInput[] = pixelPurchases.map((p) => ({
      id: p.id,
      event_id: p.event_id ?? null,
    }));
    pixelJourney = await resolvePixelPurchaseJourneys(pixelInput);
  } catch (err) {
    console.error('[resolveConversionOwners] resolvePixelPurchaseJourneys failed:', err);
  }

  // ── 2. Batch evidence for direct-entry / last-entry links ───────────────
  const pixelEventIds = pixelPurchases
    .map((p) => p.event_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  // Stripe checkout event ids (when Layer 1 resolved them)
  const stripeCheckoutEventIds: string[] = [];
  stripeJourney.forEach((r) => {
    if (r.checkoutEventId) stripeCheckoutEventIds.push(r.checkoutEventId);
  });

  const allEventIds = Array.from(new Set([...pixelEventIds, ...stripeCheckoutEventIds]));
  const eventById = await fetchEventsByIds(allEventIds);

  // Link ids we may need: event.redirect_link_id, purchase.redirect_link_id,
  // startRedirectLinkId from journey resolutions
  const linkIds: string[] = [];
  eventById.forEach((e) => {
    if (e.redirect_link_id) linkIds.push(e.redirect_link_id);
  });
  for (const p of stripePurchases) {
    if (p.redirect_link_id) linkIds.push(p.redirect_link_id);
  }
  stripeJourney.forEach((r) => {
    if (r.start?.startRedirectLinkId) linkIds.push(r.start.startRedirectLinkId);
  });
  pixelJourney.forEach((r) => {
    if (r.start?.startRedirectLinkId) linkIds.push(r.start.startRedirectLinkId);
  });

  const linkById = await fetchLinksByIds(linkIds);

  // Stripe token → link (direct-entry fallback when no journey)
  const stripeTokens = stripePurchases
    .map((p) => p.token ?? p.redirect_link_token ?? null)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
  const linkByToken = await fetchLinksByTokens(stripeTokens);

  // ── 3. Stripe ownership ─────────────────────────────────────────────────
  // Cross-source dedup key: only a shared *conversion* event_id is comparable.
  // Stripe checkoutEventId is a checkout event, NOT a pixel conversion event —
  // it must not be treated as interchangeable with pixel_purchases.event_id.
  // Until Stripe rows expose a real conversion event_id (or a verified shared
  // event trace), stripeIdByEventId stays empty and suppressed stays 0.
  // Do not invent matches from session_id or amount.
  const stripeIdByEventId = new Map<string, string>();

  for (const p of stripePurchases) {
    const amount = parseAmount(p.amount);
    const journey = stripeJourney.get(p.id);
    const startReason = reasonFromStartStatus(journey?.start?.status);

    let ownerVideoId: string | null = null;
    let ownerAssetId: string | null = null;
    let startRedirectLinkId: string | null = null;
    let lastEntryRedirectLinkId: string | null = null;
    let journeyId: string | null = null;
    let attributionReason: AttributionReason = 'unresolved';
    let eventId: string | null = journey?.checkoutEventId ?? null;

    // Last-entry link: prefer checkout event's redirect_link_id, else purchase fields
    if (eventId) {
      const checkoutEv = eventById.get(eventId);
      if (checkoutEv?.redirect_link_id) {
        lastEntryRedirectLinkId = checkoutEv.redirect_link_id;
      }
    }
    if (!lastEntryRedirectLinkId && p.redirect_link_id) {
      lastEntryRedirectLinkId = p.redirect_link_id;
    }

    if (
      journey?.status === 'resolved' &&
      journey.startVideoId &&
      startReason
    ) {
      // TRUE START
      ownerVideoId = journey.startVideoId;
      ownerAssetId = journey.startAssetId ?? null;
      startRedirectLinkId = journey.start?.startRedirectLinkId ?? null;
      journeyId = journey.journeyId;
      attributionReason = startReason;
    } else {
      // Direct-entry fallback via token / tracking chain
      const token = p.token ?? p.redirect_link_token ?? null;
      const tokenLink = token ? linkByToken.get(token) ?? null : null;
      const purchaseLink = p.redirect_link_id
        ? linkById.get(p.redirect_link_id) ?? null
        : null;
      const chainLink = tokenLink ?? purchaseLink;

      if (chainLink?.video_id) {
        // Prefer tracking-chain video over purchase.video_id when they conflict
        ownerVideoId = chainLink.video_id;
        ownerAssetId = chainLink.asset_id ?? null;
        if (!lastEntryRedirectLinkId) lastEntryRedirectLinkId = chainLink.id;
        attributionReason = 'direct';
      } else if (p.video_id) {
        ownerVideoId = p.video_id;
        ownerAssetId = null;
        attributionReason = 'direct';
      } else {
        // Keep in total revenue, no video owner
        attributionReason = 'unresolved';
      }
    }

    // Intentionally do NOT register checkoutEventId into stripeIdByEventId.
    // checkout event ≠ pixel conversion event; registering it would create
    // false non-matches or (worse) false suppressions if IDs ever collided.

    const result: ConversionOwnerResult = {
      source: 'stripe',
      sourceRecordId: p.id,
      conversionId: p.conversion_id ?? null,
      conversionType: p.revenue_type ?? null,
      amount,
      occurredAt: p.created_at,
      ownerVideoId,
      ownerAssetId,
      startRedirectLinkId,
      lastEntryRedirectLinkId,
      journeyId,
      attributionReason,
      sessionId: p.session_id ?? null,
      eventId,
      suppressedByStripeId: null,
    };
    byKey.set(conversionOwnerKey('stripe', p.id), result);

    if (ownerVideoId && ownerAssetId && attributionReason !== 'unresolved') {
      stripeOwnerByPurchaseId.set(p.id, { videoId: ownerVideoId, assetId: ownerAssetId });
    }
  }

  // ── 4. Pixel ownership ──────────────────────────────────────────────────
  for (const p of pixelPurchases) {
    const amount = parseAmount(p.amount);
    const journey = pixelJourney.get(p.id);
    const startReason = reasonFromStartStatus(journey?.start?.status);

    let ownerVideoId: string | null = null;
    let ownerAssetId: string | null = null;
    let startRedirectLinkId: string | null = null;
    let lastEntryRedirectLinkId: string | null = null;
    let journeyId: string | null = null;
    let attributionReason: AttributionReason = 'unresolved';
    let eventId: string | null = p.event_id ?? null;
    let suppressedByStripeId: string | null = null;

    // Cross-source dedup: same verified event_id → prefer Stripe as financial record
    if (eventId && stripeIdByEventId.has(eventId)) {
      suppressedByStripeId = stripeIdByEventId.get(eventId) ?? null;
      // Still record ownership for evidence, but mark suppressed
      if (
        journey?.status === 'resolved' &&
        journey.startVideoId &&
        startReason
      ) {
        ownerVideoId = journey.startVideoId;
        ownerAssetId = journey.startAssetId ?? null;
        startRedirectLinkId = journey.start?.startRedirectLinkId ?? null;
        journeyId = journey.journeyId;
        attributionReason = startReason;
      } else {
        attributionReason = 'direct';
        ownerVideoId = p.video_id ?? null;
        ownerAssetId = p.asset_id ?? null;
      }
      suppressedPixelIds.add(p.id);
      const result: ConversionOwnerResult = {
        source: 'pixel',
        sourceRecordId: p.id,
        conversionId: p.conversion_id ?? null,
        conversionType: p.event_type ?? null,
        amount,
        occurredAt: p.created_at,
        ownerVideoId,
        ownerAssetId,
        startRedirectLinkId,
        lastEntryRedirectLinkId,
        journeyId,
        attributionReason,
        sessionId: p.session_id ?? null,
        eventId,
        suppressedByStripeId,
      };
      byKey.set(conversionOwnerKey('pixel', p.id), result);
      continue;
    }

    if (
      journey?.status === 'resolved' &&
      journey.startVideoId &&
      startReason
    ) {
      // TRUE START
      ownerVideoId = journey.startVideoId;
      ownerAssetId = journey.startAssetId ?? null;
      startRedirectLinkId = journey.start?.startRedirectLinkId ?? null;
      journeyId = journey.journeyId;
      attributionReason = startReason;

      // last-entry from pixel event when available
      if (eventId) {
        const ev = eventById.get(eventId);
        if (ev?.redirect_link_id) lastEntryRedirectLinkId = ev.redirect_link_id;
      }
    } else if (!eventId) {
      // No event_id → count; use pixel video_id if present
      if (p.video_id) {
        ownerVideoId = p.video_id;
        ownerAssetId = p.asset_id ?? null;
        attributionReason = 'direct';
      } else {
        attributionReason = 'unresolved';
      }
    } else {
      // Has event_id — look up events row
      const ev = eventById.get(eventId);
      if (!ev) {
        // event_id exists but no matching events row → uncounted
        attributionReason = 'uncounted';
        uncountedPixelIds.add(p.id);
      } else {
        lastEntryRedirectLinkId = ev.redirect_link_id ?? null;
        if (ev.redirect_link_id) {
          const link = linkById.get(ev.redirect_link_id);
          if (link?.video_id) {
            // Prefer tracking-chain video over purchase.video_id
            ownerVideoId = link.video_id;
            ownerAssetId = link.asset_id ?? null;
            attributionReason = 'direct';
          } else if (p.video_id) {
            // Link missing or has no video — count with purchase video_id
            ownerVideoId = p.video_id;
            ownerAssetId = p.asset_id ?? null;
            attributionReason = 'direct';
          } else {
            attributionReason = 'unresolved';
          }
        } else if (p.video_id) {
          // events row exists, no redirect_link_id — count with purchase video_id
          ownerVideoId = p.video_id;
          ownerAssetId = p.asset_id ?? null;
          attributionReason = 'direct';
        } else if (ev.video_id) {
          ownerVideoId = ev.video_id;
          ownerAssetId = ev.asset_id ?? null;
          attributionReason = 'direct';
        } else {
          attributionReason = 'unresolved';
        }
      }
    }

    const result: ConversionOwnerResult = {
      source: 'pixel',
      sourceRecordId: p.id,
      conversionId: p.conversion_id ?? null,
      conversionType: p.event_type ?? null,
      amount,
      occurredAt: p.created_at,
      ownerVideoId,
      ownerAssetId,
      startRedirectLinkId,
      lastEntryRedirectLinkId,
      journeyId,
      attributionReason,
      sessionId: p.session_id ?? null,
      eventId,
      suppressedByStripeId,
    };
    byKey.set(conversionOwnerKey('pixel', p.id), result);

    if (
      ownerVideoId &&
      ownerAssetId &&
      attributionReason !== 'unresolved' &&
      attributionReason !== 'uncounted' &&
      !suppressedByStripeId
    ) {
      pixelOwnerByPurchaseId.set(p.id, { videoId: ownerVideoId, assetId: ownerAssetId });
    }
  }

  // Reason breakdown — required for Phase 1.5 validation.
  // stripeOwners/pixelOwners only count rows with BOTH video+asset; they do
  // NOT equal "TRUE START succeeded". Always read reasons.* for that.
  const reasonCounts = {
    stripe: {
      true_start_upstream: 0,
      true_start_path_root: 0,
      direct: 0,
      unresolved: 0,
      uncounted: 0,
    },
    pixel: {
      true_start_upstream: 0,
      true_start_path_root: 0,
      direct: 0,
      unresolved: 0,
      uncounted: 0,
    },
  };
  byKey.forEach((r) => {
    const bucket = r.source === 'stripe' ? reasonCounts.stripe : reasonCounts.pixel;
    bucket[r.attributionReason] += 1;
  });

  console.log('[resolveConversionOwners] summary', {
    stripe: stripePurchases.length,
    pixel: pixelPurchases.length,
    stripeOwners: stripeOwnerByPurchaseId.size,
    pixelOwners: pixelOwnerByPurchaseId.size,
    uncounted: uncountedPixelIds.size,
    suppressed: suppressedPixelIds.size,
    reasons: reasonCounts,
  });

  // Compact per-record lines for browser validation (ids only, no invention).
  byKey.forEach((r) => {
    console.log('[resolveConversionOwners] record', {
      key: conversionOwnerKey(r.source, r.sourceRecordId),
      reason: r.attributionReason,
      ownerVideoId: r.ownerVideoId,
      ownerAssetId: r.ownerAssetId,
      journeyId: r.journeyId,
      eventId: r.eventId,
      startRedirectLinkId: r.startRedirectLinkId,
      lastEntryRedirectLinkId: r.lastEntryRedirectLinkId,
      suppressedByStripeId: r.suppressedByStripeId,
      formalRevenue: r.attributionReason !== 'uncounted' && !r.suppressedByStripeId,
    });
  });

  return {
    byKey,
    stripeOwnerByPurchaseId,
    pixelOwnerByPurchaseId,
    uncountedPixelIds,
    suppressedPixelIds,
  };
}
