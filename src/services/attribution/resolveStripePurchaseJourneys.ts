/**
 * services/attribution/resolveStripePurchaseJourneys.ts
 *
 * Layer 1 + Layer 2 foundation (read-only; changes no metrics):
 *
 *   stripe purchase
 *     → purchase.session_id + purchase.token
 *     → checkout event (same session, link_type 'checkout', link.token == purchase.token)
 *     → events_journey rows whose event_ids contain that checkout event
 *     → journey_id
 *     → resolveJourneyStarts() → TRUE START
 *
 * stripe_purchases.redirect_link_id / redirect_link_token are deliberately NOT used:
 * real data shows they can point at an earlier hop of the journey.
 */

import { supabase } from '../../lib/supabase';
import {
  chunkArray,
  fetchRowsByIn,
  resolveJourneyStarts,
  type JourneyStartResolution,
} from './resolveJourneyStart';

export type StripePurchaseJourneyStatus =
  | 'resolved'
  | 'no_session'
  | 'no_token'
  | 'no_checkout_event'
  | 'checkout_not_matched'
  | 'no_events_journey'
  | 'ambiguous_journey';

export interface StripePurchaseJourneyInput {
  id: string;
  session_id: string | null;
  token: string | null; // stripe_purchases.token, e.g. 'mGVj'
  created_at: string;
}

export interface StripePurchaseJourneyResolution {
  purchaseId: string;
  status: StripePurchaseJourneyStatus;
  checkoutEventId: string | null;
  /** How many checkout events were valid candidates (>1 = deterministic pick was needed). */
  checkoutCandidateCount: number;
  journeyId: string | null;
  /** Filled only when status === 'ambiguous_journey'. */
  candidateJourneyIds: string[];
  /** Layer 2 result; null when the journey could not be resolved or Layer 2 failed. */
  start: JourneyStartResolution | null;
  startVideoId: string | null;
  startAssetId: string | null;
}

/** A checkout is only paired with a purchase made within this window after it
 *  (Stripe checkout sessions expire after 24h). Adjust here if needed. */
const CHECKOUT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_CHUNK = 150;
const OR_CHUNK = 40;

type CheckoutEventRow = {
  id: string;
  session_id: string;
  created_at: string;
  redirect_link_id: string | null;
};
type LinkLite = { id: string; token: string | null; link_type: string | null };

async function fetchCheckoutEventsBySession(sessionIds: string[]): Promise<CheckoutEventRow[]> {
  const out: CheckoutEventRow[] = [];
  for (const batch of chunkArray(Array.from(new Set(sessionIds)), SESSION_CHUNK)) {
    const { data, error } = await supabase
      .from('events')
      .select('id, session_id, created_at, redirect_link_id')
      .in('session_id', batch)
      .eq('event_type', 'checkout');
    if (error) throw new Error(`attribution: checkout events query failed — ${error.message}`);
    out.push(...((data ?? []) as CheckoutEventRow[]));
  }
  return out;
}

/** event id → journey_ids whose events_journey.event_ids contain it. Batched via
 *  .or(); if PostgREST rejects that filter, falls back to one .contains per id. */
async function fetchJourneyIdsByEventIds(eventIds: string[]): Promise<Map<string, Set<string>>> {
  const wanted = new Set(eventIds);
  const out = new Map<string, Set<string>>();

  const collect = (rows: { journey_id: string; event_ids: string[] | null }[]) => {
    for (const row of rows) {
      for (const eid of row.event_ids ?? []) {
        if (!wanted.has(eid)) continue;
        const set = out.get(eid);
        if (set) set.add(row.journey_id);
        else out.set(eid, new Set([row.journey_id]));
      }
    }
  };

  for (const batch of chunkArray(Array.from(wanted), OR_CHUNK)) {
    const orFilter = batch.map((id) => `event_ids.cs.${JSON.stringify([id])}`).join(',');
    const { data, error } = await supabase
      .from('events_journey')
      .select('journey_id, event_ids')
      .or(orFilter);

    if (!error) {
      collect((data ?? []) as { journey_id: string; event_ids: string[] | null }[]);
      continue;
    }

    console.warn('[resolveStripePurchaseJourneys] .or() batch failed, falling back per id:', error.message);
    for (const id of batch) {
      const { data: d2, error: e2 } = await supabase
        .from('events_journey')
        .select('journey_id, event_ids')
        .contains('event_ids', JSON.stringify([id]));
      if (e2) throw new Error(`attribution: events_journey containment failed — ${e2.message}`);
      collect((d2 ?? []) as { journey_id: string; event_ids: string[] | null }[]);
    }
  }
  return out;
}

export async function resolveStripePurchaseJourneys(
  purchases: StripePurchaseJourneyInput[],
): Promise<Map<string, StripePurchaseJourneyResolution>> {
  const result = new Map<string, StripePurchaseJourneyResolution>();

  const base = (
    p: StripePurchaseJourneyInput,
    status: StripePurchaseJourneyStatus,
  ): StripePurchaseJourneyResolution => ({
    purchaseId: p.id,
    status,
    checkoutEventId: null,
    checkoutCandidateCount: 0,
    journeyId: null,
    candidateJourneyIds: [],
    start: null,
    startVideoId: null,
    startAssetId: null,
  });

  // 0. eligibility
  const eligible: StripePurchaseJourneyInput[] = [];
  for (const p of purchases) {
    if (!p.session_id) result.set(p.id, base(p, 'no_session'));
    else if (!p.token) result.set(p.id, base(p, 'no_token'));
    else eligible.push(p);
  }
  if (eligible.length === 0) return result;

  // 1. checkout events for those sessions (no date window: checkout precedes purchase)
  const checkoutEvents = await fetchCheckoutEventsBySession(eligible.map((p) => p.session_id as string));
  const eventsBySession = new Map<string, CheckoutEventRow[]>();
  for (const e of checkoutEvents) {
    const arr = eventsBySession.get(e.session_id);
    if (arr) arr.push(e);
    else eventsBySession.set(e.session_id, [e]);
  }

  // 2. verify each event's link really is the checkout link
  const links = await fetchRowsByIn<LinkLite>(
    'redirect_links',
    'id, token, link_type',
    'id',
    checkoutEvents.map((e) => e.redirect_link_id).filter((x): x is string => !!x),
  );
  const linkById = new Map(links.map((l) => [l.id, l]));

  // 3. deterministic pick per purchase: nearest PRECEDING valid checkout event
  //    (same session, link_type 'checkout', link.token == purchase.token, within window);
  //    ties broken by event id ascending.
  const picked = new Map<string, { eventId: string; candidates: number }>();
  for (const p of eligible) {
    const sessionEvents = eventsBySession.get(p.session_id as string) ?? [];
    if (sessionEvents.length === 0) {
      result.set(p.id, base(p, 'no_checkout_event'));
      continue;
    }
    const purchaseT = Date.parse(p.created_at);
    const valid = sessionEvents
      .filter((e) => {
        const link = e.redirect_link_id ? linkById.get(e.redirect_link_id) : undefined;
        if (!link || link.link_type !== 'checkout' || link.token !== p.token) return false;
        const t = Date.parse(e.created_at);
        return !Number.isNaN(t) && !Number.isNaN(purchaseT) && t <= purchaseT && purchaseT - t <= CHECKOUT_MAX_AGE_MS;
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id));

    if (valid.length === 0) {
      result.set(p.id, base(p, 'checkout_not_matched'));
      continue;
    }
    picked.set(p.id, { eventId: valid[0].id, candidates: valid.length });
  }
  if (picked.size === 0) return result;

  // 4. checkout event → journey_id (batched)
  const journeysByEvent = await fetchJourneyIdsByEventIds(Array.from(picked.values()).map((x) => x.eventId));

  const resolvedJourneyIds = new Set<string>();
  for (const p of eligible) {
    const pick = picked.get(p.id);
    if (!pick) continue;
    const journeys = Array.from(journeysByEvent.get(pick.eventId) ?? []).sort();
    const r = base(p, 'no_events_journey');
    r.checkoutEventId = pick.eventId;
    r.checkoutCandidateCount = pick.candidates;

    if (journeys.length === 1) {
      r.status = 'resolved';
      r.journeyId = journeys[0];
      resolvedJourneyIds.add(journeys[0]);
    } else if (journeys.length > 1) {
      r.status = 'ambiguous_journey'; // never guess
      r.candidateJourneyIds = journeys;
    }
    result.set(p.id, r);
  }

  // 5. Layer 2 (isolated: a failure here keeps Layer 1's journey_id)
  if (resolvedJourneyIds.size > 0) {
    try {
      const starts = await resolveJourneyStarts(Array.from(resolvedJourneyIds));
      result.forEach((r) => {
        if (r.status !== 'resolved' || !r.journeyId) return;
        const s = starts.get(r.journeyId) ?? null;
        r.start = s;
        r.startVideoId = s?.startVideoId ?? null;
        r.startAssetId = s?.startAssetId ?? null;
      });
    } catch (err) {
      console.error('[resolveStripePurchaseJourneys] resolveJourneyStarts failed (journey_id kept):', err);
    }
  }

  return result;
}