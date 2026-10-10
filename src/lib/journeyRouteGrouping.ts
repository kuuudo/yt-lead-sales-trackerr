// ─────────────────────────────────────────────────────────────────────────────
// journeyRouteGrouping.ts
//
// One displayed Journey row per identical ORDERED route.
//
// A journey_id is one observed session (events_journey.journey_id). Many
// sessions can walk the same route, so rows are grouped by route signature =
// ordered database videos.id values of path.steps (never YouTube ids).
//
// NOT merged here (deliberately): partial routes. [D], [C,D] and [A,B,C,D] stay
// separate rows, because different journey_ids may be different sessions and
// the data does not prove they belong to one longer route.
//
// Representative journey: the FIRST journey encountered for a route. Within one
// discoverJourneysForVideos batch that is the most recently written journey
// (discovery sorts newest-first). Across batches the order follows the batch
// order, not a global timestamp; DiscoveredJourney carries no timestamp, so no
// global "latest" is claimed. The choice is deterministic for the same data.
// All source journey ids are kept in memberJourneyIds.
// ─────────────────────────────────────────────────────────────────────────────

import type { DiscoveredJourney } from './journeyDiscovery';

export type RouteJourney = DiscoveredJourney & {
  /** Every journey_id merged into this row (representative first). */
  memberJourneyIds: string[];
};

export function routeSignature(journey: DiscoveredJourney): string {
  const steps = journey.path?.steps ?? [];
  // A path with no steps is never merged with anything.
  if (steps.length === 0) return `empty:${journey.journeyId}`;
  return steps.map((s) => s.videoId ?? '').join('>');
}

export function groupJourneysByRoute(journeys: DiscoveredJourney[]): RouteJourney[] {
  const byRoute = new Map<string, RouteJourney>();
  for (const j of journeys) {
    const sig = routeSignature(j);
    const existing = byRoute.get(sig);
    if (!existing) {
      byRoute.set(sig, { ...j, memberJourneyIds: [j.journeyId] });
      continue;
    }
    if (!existing.memberJourneyIds.includes(j.journeyId)) {
      existing.memberJourneyIds.push(j.journeyId);
    }
  }
  return Array.from(byRoute.values());
}