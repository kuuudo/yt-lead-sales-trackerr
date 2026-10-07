/**
 * services/attribution/resolvePixelPurchaseJourneys.ts
 *
 * pixel_purchases.events_journey_id → events_journey.id → journey_id
 *   → resolveJourneyStarts() → TRUE START
 *
 * Exact-key bridge only. Purchases without events_journey_id (all legacy rows)
 * are never resolved here and keep Scenario 1 behaviour. No heuristics.
 * Any failure returns an empty map (legacy behaviour kept).
 */

import {
  fetchRowsByIn,
  resolveJourneyStarts,
  type JourneyStartResolution,
} from './resolveJourneyStart';

export type PixelPurchaseJourneyStatus =
  | 'resolved'
  | 'no_events_journey_id'
  | 'events_journey_not_found';

export interface PixelPurchaseJourneyInput {
  id: string;
  events_journey_id: string | null;
}

export interface PixelPurchaseJourneyResolution {
  purchaseId: string;
  status: PixelPurchaseJourneyStatus;
  eventsJourneyId: string | null;
  journeyId: string | null;
  start: JourneyStartResolution | null;
  startVideoId: string | null;
  startAssetId: string | null;
}

export async function resolvePixelPurchaseJourneys(
  purchases: PixelPurchaseJourneyInput[],
): Promise<Map<string, PixelPurchaseJourneyResolution>> {
  const out = new Map<string, PixelPurchaseJourneyResolution>();
  if (purchases.length === 0) return out;

  const base = (
    purchaseId: string,
    status: PixelPurchaseJourneyStatus,
    eventsJourneyId: string | null = null,
  ): PixelPurchaseJourneyResolution => ({
    purchaseId,
    status,
    eventsJourneyId,
    journeyId: null,
    start: null,
    startVideoId: null,
    startAssetId: null,
  });

  try {
    const withId: PixelPurchaseJourneyInput[] = [];
    for (const p of purchases) {
      if (!p.events_journey_id) out.set(p.id, base(p.id, 'no_events_journey_id'));
      else withId.push(p);
    }
    if (withId.length === 0) return out;

    // events_journey.id → journey_id (primary-key lookup, exact)
    const ejRows = await fetchRowsByIn<{ id: string; journey_id: string }>(
      'events_journey',
      'id, journey_id',
      'id',
      withId.map((p) => p.events_journey_id as string),
    );
    const journeyByEj = new Map(ejRows.map((r) => [r.id, r.journey_id] as const));

    const journeyIds = new Set<string>();
    for (const p of withId) {
      const ejId = p.events_journey_id as string;
      const journeyId = journeyByEj.get(ejId);
      if (!journeyId) {
        out.set(p.id, base(p.id, 'events_journey_not_found', ejId));
        continue;
      }
      const r = base(p.id, 'resolved', ejId);
      r.journeyId = journeyId;
      out.set(p.id, r);
      journeyIds.add(journeyId);
    }

    // Reuse the verified Layer 2 resolver as-is
    if (journeyIds.size > 0) {
      const starts = await resolveJourneyStarts(Array.from(journeyIds));
      out.forEach((r) => {
        if (r.status !== 'resolved' || !r.journeyId) return;
        const s = starts.get(r.journeyId) ?? null;
        r.start = s;
        r.startVideoId = s?.startVideoId ?? null;
        r.startAssetId = s?.startAssetId ?? null;
      });
    }
  } catch (err) {
    console.error('[resolvePixelPurchaseJourneys] failed (legacy behaviour kept):', err);
    return new Map();
  }

  return out;
}