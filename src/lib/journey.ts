// ─────────────────────────────────────────────────────────────────────────────
// journey.ts
//
// PURPOSE: Promotion-agnostic reconstruction of "what observed journey does
// this journey_id / event_id / session_id lead to" from `events_journey`.
//
// This is a NEW, separate data layer. It is NOT a replacement for, and does
// NOT import from or get imported by, `journeyAnalyticsEngine.ts`. That file
// remains the purchase attribution / evidence-verification engine (proving
// which events belong to a specific conversion). This file answers a
// different, narrower question: "what does events_journey say happened,"
// with no attribution-grade verification attached.
//
// CANONICAL RULE (confirmed against real production data, journey_id
// 4eb94870-4578-437e-b113-01ff50d028f2, 2026-09-12):
//   For a given journey_id, the LATEST events_journey row
//   (ORDER BY created_at DESC LIMIT 1) is the canonical JourneyPath.
//   Historical rows for the same journey_id are NOT unioned or merged —
//   this matches the tracker's intended write semantics. Known
//   consequence: some historically-written journey_ids may have an
//   incomplete latest snapshot (e.g. missing the true first hop) if an
//   older, buggy version of the tracker wrote earlier rows inconsistently.
//   That is treated as a historical data-quality issue to fix at the
//   write/backfill layer, not silently repaired here by reconstructing
//   across rows.
//
// event_id -> journey_id is a BRIDGE, not a guaranteed 1:1 relationship.
// Verified on real data: the same event_id has appeared inside more than
// one journey_id's `event_ids` array. getJourneysForEvent() and
// getJourneysForSessionId() therefore return plural, explicit-ambiguity
// shapes rather than silently picking one journey_id.
//
// TERMINAL SEMANTICS: a step is terminal-looking when
// destinationVideoId === null. Do NOT also assume assetId === null on a
// terminal step — verified on real data that these two fields vary
// independently (journey_id 2fc8b8db... has destination_video_id: null
// with a non-null asset_id).
//
// OUT OF SCOPE (do not add here — see promotionJourney.ts / future
// journeyMetrics.ts / journeyAnalyticsEngine.ts instead):
//   - promotion_id / campaign_id business rules
//   - revenue, click counts, or any "observedCount" style aggregation
//   - purchase attribution / evidence verification
//   - UI shaping
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type JourneyStep = {
  videoId: string;
  assetId: string | null;
  redirectLinkId: string | null;
  destinationVideoId: string | null;
};

export type JourneyPath = {
  journeyId: string;
  steps: JourneyStep[];
  createdAt: string;
};

// Raw row shape as read from `events_journey`.
type EventsJourneyRow = {
  id: string;
  journey_id: string;
  event_ids: string[] | null;
  journey_snapshot: RawSnapshotEntry[] | null;
  redirect_link_id: string | null;
  created_at: string;
};

type RawSnapshotEntry = {
  asset_id: string | null;
  video_id: string;
  redirect_link_id: string | null;
  destination_video_id: string | null;
};

const EVENTS_JOURNEY_COLUMNS =
  'id, journey_id, event_ids, journey_snapshot, redirect_link_id, created_at';

// ═══════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════

function toJourneyPath(row: EventsJourneyRow): JourneyPath {
  const snapshot = row.journey_snapshot ?? [];
  const steps: JourneyStep[] = snapshot.map((entry) => ({
    videoId: entry.video_id,
    assetId: entry.asset_id ?? null,
    redirectLinkId: entry.redirect_link_id ?? null,
    destinationVideoId: entry.destination_video_id ?? null,
  }));

  return {
    journeyId: row.journey_id,
    steps,
    createdAt: row.created_at,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// getJourneyById
//
// Given a journey_id, return the canonical JourneyPath: the LATEST
// events_journey row for that journey_id, parsed into JourneyStep[].
// Does not union historical rows (see file header).
// ═══════════════════════════════════════════════════════════════════════════

export type GetJourneyByIdResult =
  | { found: true; journey: JourneyPath }
  | { found: false; journey: null };

export async function getJourneyById(journeyId: string): Promise<GetJourneyByIdResult> {
  const { data, error } = await supabase
    .from('events_journey')
    .select(EVENTS_JOURNEY_COLUMNS)
    .eq('journey_id', journeyId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`journey.ts getJourneyById: events_journey query failed — ${error.message}`);
  }

  const latestRow = ((data ?? []) as EventsJourneyRow[])[0];
  if (!latestRow) {
    return { found: false, journey: null };
  }

  return { found: true, journey: toJourneyPath(latestRow) };
}

// ═══════════════════════════════════════════════════════════════════════════
// getJourneysForEvent
//
// Given an events.id, find every journey_id whose events_journey.event_ids
// array contains it, then resolve each one's own canonical (latest-row)
// JourneyPath independently.
//
// event_id -> journey_id is NOT assumed 1:1 (verified: the same event_id
// has appeared under more than one journey_id historically). This function
// makes that explicit via a plural `journeyIds` + `journeys` shape instead
// of silently returning a single journey.
// ═══════════════════════════════════════════════════════════════════════════

export type GetJourneysForEventResult = {
  journeyIds: string[];
  journeys: JourneyPath[];
};

export async function getJourneysForEvent(eventId: string): Promise<GetJourneysForEventResult> {
  const { data, error } = await supabase
    .from('events_journey')
    .select(EVENTS_JOURNEY_COLUMNS)
    .contains('event_ids', [eventId]);

  if (error) {
    throw new Error(`journey.ts getJourneysForEvent: events_journey query failed — ${error.message}`);
  }

  const rows = (data ?? []) as EventsJourneyRow[];

  // Distinct journey_ids referencing this event across however many
  // events_journey rows matched — a matched row is not necessarily the
  // latest row for its own journey_id, so each journey_id is re-resolved
  // via getJourneyById() rather than reused from this query's rows.
  const journeyIds = Array.from(new Set(rows.map((r) => r.journey_id)));

  const journeys: JourneyPath[] = [];
  for (const journeyId of journeyIds) {
    const result = await getJourneyById(journeyId);
    if (result.found) {
      journeys.push(result.journey);
    }
  }

  return { journeyIds, journeys };
}

// ═══════════════════════════════════════════════════════════════════════════
// getJourneysForSessionId
//
// Bridge from a purchase's session_id (pixel_purchases.session_id or
// stripe_purchases.session_id — same shape for both, see file header) to
// every journey reachable through that session's events.
//
// NOT ATTRIBUTION-VERIFIED. session_id has been verified (see
// journeyAnalyticsEngine.ts §12) to be a persistent, long-lived client
// identifier rather than a bounded browsing session — it can span months
// and multiple campaigns. This function does not filter for "does this
// journey actually belong to this purchase specifically" the way
// journeyAnalyticsEngine.ts's Evidence Contract / Attribution Verification
// (§10-§13) does. It only answers "what journeys touch this session_id,"
// for journey-display/bridging purposes. If you need conversion-grade
// verified attribution, use journeyAnalyticsEngine.ts instead.
// ═══════════════════════════════════════════════════════════════════════════

export async function getJourneysForSessionId(
  sessionId: string,
): Promise<GetJourneysForEventResult> {
  const { data, error } = await supabase.from('events').select('id').eq('session_id', sessionId);

  if (error) {
    throw new Error(`journey.ts getJourneysForSessionId: events query failed — ${error.message}`);
  }

  const eventIds = ((data ?? []) as { id: string }[]).map((e) => e.id);

  const journeyIdSet = new Set<string>();
  for (const eventId of eventIds) {
    const result = await getJourneysForEvent(eventId);
    for (const id of result.journeyIds) {
      journeyIdSet.add(id);
    }
  }

  const journeyIds = Array.from(journeyIdSet);
  const journeys: JourneyPath[] = [];
  for (const journeyId of journeyIds) {
    const result = await getJourneyById(journeyId);
    if (result.found) {
      journeys.push(result.journey);
    }
  }

  return { journeyIds, journeys };
}
