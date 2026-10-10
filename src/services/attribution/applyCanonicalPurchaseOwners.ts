/**
 * services/attribution/applyCanonicalPurchaseOwners.ts
 *
 * Phase 2 helper — apply resolveConversionOwners results onto purchase row
 * arrays BEFORE they enter processVideoMetrics / getAnalyticsEngine.
 *
 * Does NOT compute metrics. Does NOT merge Stripe and Pixel engines.
 * Only rewrites video_id (and optional asset_id) to the canonical owner
 * and drops uncounted / suppressed Pixel rows from formal revenue input.
 *
 * Use from: InDepthAnalytics, Dashboard, widgets, or any consumer that
 * currently groups revenue by purchase.video_id.
 */

import {
  resolveConversionOwners,
  type StripePurchaseOwnerInput,
  type PixelPurchaseOwnerInput,
  type ConversionOwnerResult,
} from './resolveConversionOwners';

export interface ApplyCanonicalOwnersInput {
  stripePurchases: StripePurchaseOwnerInput[];
  pixelPurchases: PixelPurchaseOwnerInput[];
}

export interface OwnedStripeRow extends StripePurchaseOwnerInput {
  /** Canonical video for revenue grouping; null if unresolved */
  video_id: string | null;
  /** Set when owner was applied */
  _canonicalOwner?: ConversionOwnerResult;
}

export interface OwnedPixelRow extends PixelPurchaseOwnerInput {
  video_id: string | null;
  _canonicalOwner?: ConversionOwnerResult;
}

export interface ApplyCanonicalOwnersResult {
  /** Stripe rows with video_id rewritten to canonical owner when available */
  stripePurchases: OwnedStripeRow[];
  /**
   * Pixel rows for formal revenue: uncounted + suppressed excluded;
   * video_id rewritten to canonical owner when available.
   */
  pixelPurchases: OwnedPixelRow[];
  /** Full resolver output for diagnostics / Marketer-Campaign later */
  ownersByKey: Map<string, ConversionOwnerResult>;
}

/**
 * Resolve canonical owners once, then produce purchase arrays safe to pass
 * into existing processVideoMetrics / getAnalyticsEngine pipelines.
 */
export async function applyCanonicalPurchaseOwners(
  input: ApplyCanonicalOwnersInput,
): Promise<ApplyCanonicalOwnersResult> {
  const resolved = await resolveConversionOwners({
    stripePurchases: input.stripePurchases,
    pixelPurchases: input.pixelPurchases,
  });

  const stripePurchases: OwnedStripeRow[] = input.stripePurchases.map((p) => {
    const owner = resolved.byKey.get(`stripe:${p.id}`);
    if (!owner || owner.attributionReason === 'unresolved' || !owner.ownerVideoId) {
      return { ...p, _canonicalOwner: owner };
    }
    return {
      ...p,
      video_id: owner.ownerVideoId,
      _canonicalOwner: owner,
    };
  });

  const pixelPurchases: OwnedPixelRow[] = [];
  for (const p of input.pixelPurchases) {
    if (resolved.uncountedPixelIds.has(p.id)) continue;
    if (resolved.suppressedPixelIds.has(p.id)) continue;
    const owner = resolved.byKey.get(`pixel:${p.id}`);
    if (!owner || owner.attributionReason === 'unresolved' || !owner.ownerVideoId) {
      pixelPurchases.push({ ...p, _canonicalOwner: owner });
      continue;
    }
    pixelPurchases.push({
      ...p,
      video_id: owner.ownerVideoId,
      _canonicalOwner: owner,
    });
  }

  return {
    stripePurchases,
    pixelPurchases,
    ownersByKey: resolved.byKey,
  };
}
