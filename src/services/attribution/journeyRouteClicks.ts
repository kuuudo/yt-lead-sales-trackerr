/**
 * journeyRouteClicks.ts
 *
 * Journey-scoped click counts using events_journey.event_ids → events.
 * Does NOT attribute by path video_id (would double-count shared videos).
 *
 * An event is counted on a route only if its id appears in the union of
 * event_ids for that route's real memberJourneyIds (excludes singleton:*).
 *
 * Click type mapping reuses analyticsEngine CLICK_EVENT_MAP (same strings).
 * Opt-in / thank-you counts from pixel_purchases remain in the Revenue path.
 */

import { supabase } from '../../lib/supabase';
import {
  CLICK_EVENT_MAP,
  getDateBounds,
  type DateRange,
  type CustomDateRange,
} from '../../lib/analyticsEngine';
import { chunkArray } from './resolveJourneyStart';

export type RouteLike = {
  journeyId: string;
  memberJourneyIds?: string[] | null;
};

export type JourneyClickMetrics = {
  landing_page_view: number;
  lead_magnet_click: number;
  newsletter_click: number;
  call_booking_click: number;
  consultation_click: number;
};

function emptyClicks(): JourneyClickMetrics {
  return {
    landing_page_view: 0,
    lead_magnet_click: 0,
    newsletter_click: 0,
    call_booking_click: 0,
    consultation_click: 0,
  };
}

function isRealJourneyId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && !id.startsWith('singleton:');
}

function countClicksByType(eventTypes: string[]): JourneyClickMetrics {
  const m = emptyClicks();
  for (const [metricKey, rawTypes] of Object.entries(CLICK_EVENT_MAP)) {
    const set = new Set(rawTypes);
    const n = eventTypes.filter((t) => set.has(t)).length;
    (m as Record<string, number>)[metricKey] = n;
  }
  return m;
}

/**
 * For each route, load member journeys' event_ids, fetch events (optional date
 * window on events.created_at), count with CLICK_EVENT_MAP.
 */
export async function computeJourneyRouteClickMetrics(opts: {
  routes: RouteLike[];
  dateRange: DateRange;
  customRange?: CustomDateRange | null;
}): Promise<Map<string, JourneyClickMetrics>> {
  const out = new Map<string, JourneyClickMetrics>();
  for (const r of opts.routes) {
    out.set(r.journeyId, emptyClicks());
  }

  const allMemberIds = Array.from(
    new Set(
      opts.routes.flatMap((r) => (r.memberJourneyIds ?? []).filter(isRealJourneyId)),
    ),
  );
  if (allMemberIds.length === 0) {
    console.log('[journeyRouteClicks] no real member journey ids');
    return out;
  }

  // journey_id → event_ids[]
  const eventIdsByJourney = new Map<string, string[]>();
  for (const batch of chunkArray(allMemberIds, 80)) {
    const { data, error } = await supabase
      .from('events_journey')
      .select('journey_id, event_ids')
      .in('journey_id', batch);
    if (error) {
      console.error('[journeyRouteClicks] events_journey query failed:', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const jid = row.journey_id as string;
      const raw = row.event_ids;
      let ids: string[] = [];
      if (Array.isArray(raw)) {
        ids = raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
      } else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            ids = parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
          }
        } catch {
          /* ignore */
        }
      }
      if (ids.length === 0) continue;
      const prev = eventIdsByJourney.get(jid) ?? [];
      // Multiple events_journey rows per journey_id: prefer union (historical rows).
      // Canonical path display uses latest row elsewhere; for clicks, union avoids
      // dropping events that only appear on older rows.
      const merged = Array.from(new Set([...prev, ...ids]));
      eventIdsByJourney.set(jid, merged);
    }
  }

  const allEventIds = Array.from(
    new Set(Array.from(eventIdsByJourney.values()).flat()),
  );
  if (allEventIds.length === 0) {
    console.log('[journeyRouteClicks] no event_ids on member journeys');
    return out;
  }

  const eventTypeById = new Map<string, string>();
  const { start, end } = getDateBounds(opts.dateRange, opts.customRange);
  const applyDate = opts.dateRange !== 'all';

  for (const batch of chunkArray(allEventIds, 150)) {
    let q = supabase.from('events').select('id, event_type, created_at').in('id', batch);
    // Date filter applied in JS so we still get types if created_at format varies
    const { data, error } = await q;
    if (error) {
      console.error('[journeyRouteClicks] events query failed:', error.message);
      continue;
    }
    for (const e of data ?? []) {
      const id = e.id as string;
      const et = (e.event_type as string) ?? '';
      if (applyDate) {
        const ca = e.created_at as string | null;
        if (!ca) continue;
        const t = new Date(ca);
        if (Number.isNaN(t.getTime()) || t < start || t > end) continue;
      }
      eventTypeById.set(id, et);
    }
  }

  for (const route of opts.routes) {
    const members = (route.memberJourneyIds ?? []).filter(isRealJourneyId);
    if (members.length === 0) continue;

    const idSet = new Set<string>();
    for (const jid of members) {
      for (const eid of eventIdsByJourney.get(jid) ?? []) {
        idSet.add(eid);
      }
    }

    const types: string[] = [];
    for (const eid of idSet) {
      const t = eventTypeById.get(eid);
      if (t) types.push(t);
    }
    out.set(route.journeyId, countClicksByType(types));
  }

  let routesWithClicks = 0;
  out.forEach((m) => {
    const n =
      m.landing_page_view +
      m.lead_magnet_click +
      m.newsletter_click +
      m.call_booking_click +
      m.consultation_click;
    if (n > 0) routesWithClicks += 1;
  });
  console.log('[journeyRouteClicks] summary', {
    memberJourneys: allMemberIds.length,
    distinctEventIds: allEventIds.length,
    eventsLoaded: eventTypeById.size,
    routesWithClicks,
  });

  return out;
}
