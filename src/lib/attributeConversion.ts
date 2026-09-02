// ─────────────────────────────────────────────────────────────────────────────
// attributeConversion.ts
//
// PHASE 2 — testable attribution hypothesis (NOT final production law).
// Pure classifier: conversion evidence → exactly one destination.
//
// Does NOT modify journeyAnalyticsEngine / analyticsEngine / assetAnalyticsEngine.
// Does NOT invent first-touch across the full journey.
// Prefer UNKNOWN over forced Asset/Content.
// ─────────────────────────────────────────────────────────────────────────────

export type AttributionDestination = 'asset' | 'content' | 'unknown';

export type ConversionSource = 'stripe' | 'pixel';

/**
 * Evidence assembled by the caller from real rows (purchases + resolved
 * redirect_link-by-token + optional session event facts).
 * The classifier does not query the database.
 */
export interface ConversionEvidence {
  source: ConversionSource;
  conversionId: string;
  amount: number;
  sessionId: string | null;
  videoId: string | null;
  /** Stripe: redirect_link_token on the purchase (may be null on legacy rows). */
  redirectLinkToken: string | null;
  /**
   * Resolved via redirect_links.token === redirectLinkToken.
   * NOT via purchase.redirect_link_id (not a join key).
   */
  redirectLinkAssetId: string | null;
  redirectLinkVideoId: string | null;
  /**
   * Pixel path: distinct non-null asset_id values observed on events in this
   * session (same session_id as the purchase). Empty if unknown / not loaded.
   */
  sessionEventAssetIds: string[];
  /** Distinct non-null video_id values on events in this session. */
  sessionEventVideoIds: string[];
}

export interface AttributionResult {
  destination: AttributionDestination;
  reason: string;
  assetId: string | null;
  videoId: string | null;
  conversionId: string;
  source: ConversionSource;
  amount: number;
  sessionId: string | null;
  redirectLinkToken: string | null;
}

/**
 * attributeConversion
 *
 * Conservative Phase 2 rules (hypothesis):
 *
 * STRIPE
 *   1. Token resolves to a redirect_link with asset_id
 *      → ASSET (conversion passed through an asset-linked redirect)
 *   2. Token resolves to a redirect_link with video_id only (no asset_id)
 *      → CONTENT
 *   3. Otherwise → UNKNOWN
 *
 * PIXEL
 *   1. Session events share exactly one distinct asset_id
 *      → ASSET (session is asset-consistent; not full journey first-touch)
 *   2. No asset_id on session events, but video evidence exists
 *      (purchase.video_id or session event video_ids)
 *      → CONTENT
 *   3. Otherwise → UNKNOWN
 *
 * Explicitly NOT used:
 *   - "any asset anywhere in a long journey"
 *   - purchase.redirect_link_id as a join key
 *   - cross-session stitching
 */
export function attributeConversion(evidence: ConversionEvidence): AttributionResult {
  const base = {
    conversionId: evidence.conversionId,
    source: evidence.source,
    amount: evidence.amount,
    sessionId: evidence.sessionId,
    redirectLinkToken: evidence.redirectLinkToken,
  };

  if (evidence.source === 'stripe') {
    if (evidence.redirectLinkAssetId) {
      return {
        ...base,
        destination: 'asset',
        reason: 'stripe_redirect_token_link_has_asset_id',
        assetId: evidence.redirectLinkAssetId,
        videoId: evidence.redirectLinkVideoId ?? evidence.videoId,
      };
    }
    if (evidence.redirectLinkVideoId || evidence.videoId) {
      return {
        ...base,
        destination: 'content',
        reason: evidence.redirectLinkToken
          ? 'stripe_redirect_token_link_video_only'
          : 'stripe_purchase_video_id_without_asset_link',
        assetId: null,
        videoId: evidence.redirectLinkVideoId ?? evidence.videoId,
      };
    }
    return {
      ...base,
      destination: 'unknown',
      reason: 'stripe_insufficient_redirect_or_video_evidence',
      assetId: null,
      videoId: null,
    };
  }

  // pixel
  const distinctAssets = Array.from(
    new Set(evidence.sessionEventAssetIds.filter(Boolean)),
  );
  if (distinctAssets.length === 1) {
    return {
      ...base,
      destination: 'asset',
      reason: 'pixel_session_events_single_asset_id',
      assetId: distinctAssets[0],
      videoId: evidence.videoId,
    };
  }
  if (distinctAssets.length > 1) {
    return {
      ...base,
      destination: 'unknown',
      reason: 'pixel_session_events_multiple_asset_ids',
      assetId: null,
      videoId: evidence.videoId,
    };
  }

  const hasVideo =
    !!evidence.videoId || evidence.sessionEventVideoIds.some(Boolean);
  if (hasVideo) {
    return {
      ...base,
      destination: 'content',
      reason: 'pixel_session_video_evidence_without_asset',
      assetId: null,
      videoId: evidence.videoId ?? evidence.sessionEventVideoIds.find(Boolean) ?? null,
    };
  }

  return {
    ...base,
    destination: 'unknown',
    reason: 'pixel_insufficient_session_evidence',
    assetId: null,
    videoId: null,
  };
}

/** Stable conversion key for exclusivity / overlap checks. */
export function conversionKey(source: ConversionSource, conversionId: string): string {
  return `${source}:${conversionId}`;
}
