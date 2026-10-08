/**
 * services/attribution/resolvePixelPurchaseEventId.ts
 *
 * FUTURE PROTECTION ONLY — recover a missing pixel_purchases.event_id.
 *
 * NORMAL PATH (unchanged elsewhere):
 *   event_id present → resolvePixelPurchaseJourneys → getJourneysForEvent → TRUE START
 *
 * RECOVERY PATH (this file):
 *   event_id === null → deterministic strategies → exactly one safe events.id → return it
 *   ambiguous / unsafe → null
 *
 * Never overwrites an existing event_id.
 * Never creates events rows.
 * Never uses events_journey_id as the Scenario 2 attribution bridge
 *   (Strategy 2 only reconstructs a missing event_id from a single-event journey row).
 */

import { supabase } from '../../lib/supabase';

export type PixelPurchaseEventIdResolveInput = {
  /** When updating an existing row, exclude this id from "already assigned" checks. */
  purchaseId?: string | null;
  event_id: string | null;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  promotion_id: string | null;
  asset_id: string | null;
  event_type: string | null;
  /** ISO timestamp; required for time-window strategies. */
  created_at: string | null;
  events_journey_id: string | null;
};

const WINDOW_SECONDS: Record<string, number> = {
  newsletter: 20,
  consultation: 60,
  sales_call: 120,
};

const PURCHASE_CHECKOUT_MAX_SECONDS = 10 * 60;

function windowSecondsForType(eventType: string | null): number | null {
  if (!eventType) return null;
  return WINDOW_SECONDS[eventType] ?? null;
}

function absDiffSeconds(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 1000;
}

/** NULL-safe equality (SQL IS NOT DISTINCT FROM). */
function notDistinctFrom(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}

async function isEventUnassigned(
  eventId: string,
  excludePurchaseId?: string | null,
): Promise<boolean> {
  let q = supabase
    .from('pixel_purchases')
    .select('id')
    .eq('event_id', eventId)
    .limit(1);

  if (excludePurchaseId) {
    q = q.neq('id', excludePurchaseId);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[resolvePixelPurchaseEventId] occupancy check failed:', error.message);
    return false;
  }
  return !data || data.length === 0;
}

async function eventExists(eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle();
  if (error) {
    console.error('[resolvePixelPurchaseEventId] event exists check failed:', error.message);
    return false;
  }
  return !!data?.id;
}

type EventCandidate = {
  id: string;
  session_id: string | null;
  video_id: string | null;
  campaign_id: string | null;
  promotion_id: string | null;
  asset_id: string | null;
  event_type: string | null;
  created_at: string;
};

/**
 * Returns a recovered events.id or null.
 * Does not write to the database.
 */
export async function resolvePixelPurchaseEventId(
  input: PixelPurchaseEventIdResolveInput,
): Promise<string | null> {
  // ── Strategy 1: existing event_id — never overwrite ─────────────────────
  if (typeof input.event_id === 'string' && input.event_id.length > 0) {
    return input.event_id;
  }

  const purchaseAt = input.created_at;
  const sessionId = input.session_id;
  const eventType = input.event_type;

  // ── Strategy 2: single-event events_journey_id (recovery only) ──────────
  if (typeof input.events_journey_id === 'string' && input.events_journey_id.length > 0) {
    const recovered = await strategySingleEventJourney(
      input.events_journey_id,
      input.purchaseId,
    );
    if (recovered) return recovered;
  }

  // Strategies 3–5 need session + created_at
  if (!sessionId || !purchaseAt) {
    return null;
  }

  // ── Strategy 3: session + same event_type + hard window ─────────────────
  if (eventType && eventType !== 'purchase') {
    const maxSec = windowSecondsForType(eventType);
    if (maxSec != null) {
      const recovered = await strategySessionTypeWindow({
        sessionId,
        eventType,
        purchaseAt,
        maxSeconds: maxSec,
        purchaseId: input.purchaseId,
      });
      if (recovered) return recovered;
    }
  }

  // ── Strategy 4: purchase → prior checkout (≤10 min, before purchase) ───
  if (eventType === 'purchase') {
    const recovered = await strategyPurchasePriorCheckout({
      sessionId,
      purchaseAt,
      videoId: input.video_id,
      campaignId: input.campaign_id,
      purchaseId: input.purchaseId,
    });
    if (recovered) return recovered;
  }

  // ── Strategy 5: strong identity + hard window (non-purchase types) ──────
  if (eventType && eventType !== 'purchase') {
    const maxSec = windowSecondsForType(eventType);
    if (maxSec != null) {
      const recovered = await strategyStrongIdentity({
        sessionId,
        eventType,
        purchaseAt,
        maxSeconds: maxSec,
        videoId: input.video_id,
        campaignId: input.campaign_id,
        promotionId: input.promotion_id,
        assetId: input.asset_id,
        purchaseId: input.purchaseId,
      });
      if (recovered) return recovered;
    }
  }

  return null;
}

// ── Strategy implementations ───────────────────────────────────────────────

async function strategySingleEventJourney(
  eventsJourneyId: string,
  purchaseId?: string | null,
): Promise<string | null> {
  const { data: row, error } = await supabase
    .from('events_journey')
    .select('event_ids')
    .eq('id', eventsJourneyId)
    .maybeSingle();

  if (error || !row) return null;

  const ids = row.event_ids;
  if (!Array.isArray(ids) || ids.length !== 1) return null;

  const eventId = ids[0];
  if (typeof eventId !== 'string' || !eventId) return null;

  if (!(await eventExists(eventId))) return null;
  if (!(await isEventUnassigned(eventId, purchaseId))) return null;

  return eventId;
}

async function strategySessionTypeWindow(args: {
  sessionId: string;
  eventType: string;
  purchaseAt: string;
  maxSeconds: number;
  purchaseId?: string | null;
}): Promise<string | null> {
  const { sessionId, eventType, purchaseAt, maxSeconds, purchaseId } = args;

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, session_id, video_id, campaign_id, promotion_id, asset_id, event_type, created_at',
    )
    .eq('session_id', sessionId)
    .eq('event_type', eventType);

  if (error || !data) return null;

  const candidates: EventCandidate[] = [];
  for (const row of data as EventCandidate[]) {
if (!row.created_at) continue;
// Event must occur at or before purchase; then hard window on that lag.
if (new Date(row.created_at).getTime() > new Date(purchaseAt).getTime()) continue;
if (absDiffSeconds(row.created_at, purchaseAt) > maxSeconds) continue;
    if (!(await isEventUnassigned(row.id, purchaseId))) continue;
    candidates.push(row);
  }

  if (candidates.length !== 1) return null;
  return candidates[0].id;
}

async function strategyPurchasePriorCheckout(args: {
  sessionId: string;
  purchaseAt: string;
  videoId: string | null;
  campaignId: string | null;
  purchaseId?: string | null;
}): Promise<string | null> {
  const { sessionId, purchaseAt, videoId, campaignId, purchaseId } = args;
  const purchaseMs = new Date(purchaseAt).getTime();
  const minMs = purchaseMs - PURCHASE_CHECKOUT_MAX_SECONDS * 1000;

  let q = supabase
    .from('events')
    .select(
      'id, session_id, video_id, campaign_id, promotion_id, asset_id, event_type, created_at',
    )
    .eq('session_id', sessionId)
    .eq('event_type', 'checkout')
    .lte('created_at', purchaseAt)
    .gte('created_at', new Date(minMs).toISOString());

  if (videoId) q = q.eq('video_id', videoId);
  if (campaignId) q = q.eq('campaign_id', campaignId);

  const { data, error } = await q;
  if (error || !data) return null;

  const candidates: EventCandidate[] = [];
  for (const row of data as EventCandidate[]) {
    if (!(await isEventUnassigned(row.id, purchaseId))) continue;
    candidates.push(row);
  }

  if (candidates.length !== 1) return null;
  return candidates[0].id;
}

async function strategyStrongIdentity(args: {
  sessionId: string;
  eventType: string;
  purchaseAt: string;
  maxSeconds: number;
  videoId: string | null;
  campaignId: string | null;
  promotionId: string | null;
  assetId: string | null;
  purchaseId?: string | null;
}): Promise<string | null> {
  const {
    sessionId,
    eventType,
    purchaseAt,
    maxSeconds,
    videoId,
    campaignId,
    promotionId,
    assetId,
    purchaseId,
  } = args;

  // Need at least one identity field beyond session+type (else Strategy 3 covers it)
  if (!videoId && !campaignId && !promotionId && !assetId) {
    return null;
  }

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, session_id, video_id, campaign_id, promotion_id, asset_id, event_type, created_at',
    )
    .eq('session_id', sessionId)
    .eq('event_type', eventType);

  if (error || !data) return null;

  const candidates: EventCandidate[] = [];
  for (const row of data as EventCandidate[]) {
    if (!row.created_at) continue;
    // Event must occur at or before purchase; then hard window on that lag.
    if (new Date(row.created_at).getTime() > new Date(purchaseAt).getTime()) continue;
    if (absDiffSeconds(row.created_at, purchaseAt) > maxSeconds) continue;
    if (!notDistinctFrom(row.video_id, videoId)) continue;
    if (!notDistinctFrom(row.campaign_id, campaignId)) continue;
    if (!notDistinctFrom(row.promotion_id, promotionId)) continue;
    if (!notDistinctFrom(row.asset_id, assetId)) continue;
    if (!(await isEventUnassigned(row.id, purchaseId))) continue;
    candidates.push(row);
  }

  if (candidates.length !== 1) return null;
  return candidates[0].id;
}

// FUTURE RECOVERY STRATEGIES — intentionally disabled.
// These may be enabled later only if a real production case requires them.
// Do not enable proactively; ambiguous attribution must remain NULL.
//
// - session + type + nearest within window when multiple candidates exist
//   (currently: multiple → null, never pick nearest among many)
// - purchase → prior landing_page when no unique checkout
// - promotion_id + asset_id without matching event_type
// - org-scoped matching
// - same-day / 5–15–60 minute generic windows
// - getJourneysForSessionId-based recovery (session spans too wide)
// - writing events_journey_id as Scenario 2 bridge
// - synthesizing events rows to populate event_id