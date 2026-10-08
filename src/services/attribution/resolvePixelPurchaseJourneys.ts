/**
 * services/attribution/resolvePixelPurchaseJourneys.ts
 *
 * pixel_purchases.event_id
 *   → getJourneysForEvent(event_id)
 *   → distinct journey_id
 *   → resolveJourneyStarts()
 *   → TRUE START
 *
 * Event-id bridge only. Purchases without event_id are never resolved here
 * and keep Scenario 1 behaviour. No heuristics.
 *
 * If one event_id maps to no journeys, it is unresolved.
 * If one event_id maps to multiple distinct journeys, it is ambiguous.
 *
 * Any failure returns an empty map (legacy behaviour kept).
 */

import {
  fetchRowsByIn,
  resolveJourneyStarts,
  type JourneyStartResolution,
} from './resolveJourneyStart';

import { getJourneysForEvent } from '../../lib/journey';

export type PixelPurchaseJourneyStatus =
  | 'resolved'
  | 'no_event_id'
  | 'no_events_journey'
  | 'ambiguous_journey';

export interface PixelPurchaseJourneyInput {
  id: string;
  event_id: string | null;
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
   const withEventId: PixelPurchaseJourneyInput[] = [];

for (const p of purchases) {
  if (!p.event_id) {
    out.set(p.id, base(p.id, 'no_event_id'));
  } else {
    withEventId.push(p);
  }
}

if (withEventId.length === 0) return out;

const journeyIds = new Set<string>();

for (const p of withEventId) {
  const eventId = p.event_id as string;

  // event_id → distinct journey_id
  // Uses the existing getJourneysForEvent semantics.
const result = await getJourneysForEvent(eventId);

const journeyIdsForEvent = [
  ...new Set(
    result.journeys.map((j) => j.journeyId),
  ),
];

  if (journeyIdsForEvent.length === 0) {
    out.set(p.id, base(p.id, 'no_events_journey'));
    continue;
  }

  if (journeyIdsForEvent.length > 1) {
    out.set(p.id, base(p.id, 'ambiguous_journey'));
    continue;
  }

  const journeyId = journeyIdsForEvent[0];

  const r = base(p.id, 'resolved');
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