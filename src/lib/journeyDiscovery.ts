// ─────────────────────────────────────────────────────────────────────────────
// journeyDiscovery.ts
//
// PURPOSE: Discover every journey_id observed for a given Promotion, entering
// from `events_journey` via `redirect_links.promotion_id` — NOT via
// `pixel_purchases` / `stripe_purchases`. This is the fix for the data-loss
// problem: journeys that never converted must still be discoverable.
//
// Consumes journey.ts (getJourneyById) for canonical per-journey_id
// resolution. Does NOT reimplement or union historical events_journey rows —
// that decision (latest-row = canonical) stays owned by journey.ts.
//
// KNOWN LIMITATION (documented, not silently swallowed):
// Discovery here keys off the row-level `events_journey.redirect_link_id`
// belonging to one of this promotion's redirect_links. A journey_id whose
// ONLY connection to this promotion is a downstream asset appearing
// mid-path — with no redirect_link_id on that specific events_journey row —
// will NOT be discovered by this first version. Revisit if/when a
// jsonb-path search over journey_snapshot[].asset_id is needed; not
// attempted here to avoid guessing at query capabilities that weren't
// confirmed against the actual schema.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';
import { getJourneyById, type JourneyPath } from './journey';

export type DiscoveredJourney = {
  journeyId: string;
  path: JourneyPath;
};

type RedirectLinkIdRow = { id: string };
type EventsJourneyIdRow = { journey_id: string };

export async function discoverPromotionJourneys(
  promotionId: string,
): Promise<DiscoveredJourney[]> {
  // Step 1: every redirect_link that belongs to this promotion.
  const { data: redirectLinks, error: rlError } = await supabase
    .from('redirect_links')
    .select('id')
    .eq('promotion_id', promotionId);

  if (rlError) {
    throw new Error(
      `journeyDiscovery.ts discoverPromotionJourneys: redirect_links query failed — ${rlError.message}`,
    );
  }

  const redirectLinkIds = ((redirectLinks ?? []) as RedirectLinkIdRow[]).map((r) => r.id);
  if (redirectLinkIds.length === 0) {
    return [];
  }

  // Step 2: events_journey rows touched by one of those redirect_links.
  // This is the discovery entry point — deliberately NOT
  // pixel_purchases / stripe_purchases, so non-converting journeys surface
  // here too.
  const { data: journeyRows, error: ejError } = await supabase
    .from('events_journey')
    .select('journey_id')
    .in('redirect_link_id', redirectLinkIds);

  if (ejError) {
    throw new Error(
      `journeyDiscovery.ts discoverPromotionJourneys: events_journey query failed — ${ejError.message}`,
    );
  }

  const journeyIds = Array.from(
    new Set(((journeyRows ?? []) as EventsJourneyIdRow[]).map((r) => r.journey_id)),
  );

  // Step 3: resolve each journey_id to its canonical (latest-row) path via
  // the existing journey.ts logic. Do not union historical rows here.
  const discovered: DiscoveredJourney[] = [];
  for (const journeyId of journeyIds) {
    const result = await getJourneyById(journeyId);
    if (result.found) {
      discovered.push({ journeyId, path: result.journey });
    }
  }

  return discovered;
}
