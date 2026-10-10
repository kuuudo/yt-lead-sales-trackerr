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
  // ── TEMPORARY DEBUG (diagnostic only — remove after diagnosis) ──────────
  console.log('[journeyDiscovery] redirectLinkIds.length =', redirectLinkIds.length)
  console.log('[journeyDiscovery] redirectLinkIds =', redirectLinkIds)
  // ── end temporary debug ───────────────────────────────────────────────
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

  // ── TEMPORARY DEBUG (diagnostic only — remove after diagnosis) ──────────
  console.log('[journeyDiscovery] events_journey raw data =', journeyRows)
  console.log('[journeyDiscovery] events_journey error =', ejError)
  // ── end temporary debug ───────────────────────────────────────────────

  if (ejError) {
    throw new Error(
      `journeyDiscovery.ts discoverPromotionJourneys: events_journey query failed — ${ejError.message}`,
    );
  }

  const journeyIds = Array.from(
    new Set(((journeyRows ?? []) as EventsJourneyIdRow[]).map((r) => r.journey_id)),
  );

  // ── TEMPORARY DEBUG (diagnostic only — remove after diagnosis) ──────────
  console.log('[journeyDiscovery] journeyIds.length =', journeyIds.length)
  console.log('[journeyDiscovery] journeyIds =', journeyIds)
  // ── end temporary debug ───────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════
// Slice A (CampaignJourneyMap Phase 2): discovery from VIDEO entry points.
//
// ADDITIVE. Does not change discoverPromotionJourneys. Returns the SAME
// DiscoveredJourney[] shape, so buildJourneyGraph() / resolveDownstreamNodes()
// consume it unchanged — this is a second ENTRY POINT into the existing
// journey pipeline, not a second journey model.
//
// WHY video_id ONLY (no asset_id) in the containment match:
//   journey_snapshot[].asset_id is the DESTINATION asset of that step's
//   redirect link (verified against real data), NOT the step video's own
//   asset. A Content / Own Asset video does not know which asset it promotes,
//   so loadDownstreamForRow(V, videos.asset_id) would silently match nothing.
//   Every video in a path appears as `video_id` on some step (the terminal
//   step included), so { video_id: V } finds every journey touching V, at any
//   position — upstream AND downstream context both come from the full path.
//
// Canonical rule is unchanged (journey.ts): matched events_journey rows can be
// historical, so each journey_id is re-resolved to its LATEST row, and kept
// only if that canonical path still contains at least one requested video.
// ═══════════════════════════════════════════════════════════════════════════

export const VIDEO_DISCOVERY_MAX_JOURNEYS = 50;
const VIDEO_DISCOVERY_ROW_LIMIT = 500; // per requested video, newest first
const VIDEO_DISCOVERY_CONCURRENCY = 5;
const ASSET_LOOKUP_CHUNK = 80;

export type DiscoverJourneysForVideosResult = {
  journeys: DiscoveredJourney[];
  /** True when more journeys matched than were loaded (50-journey cap or a
   *  per-video 500-row limit). Recency only — never quality. */
  truncated: boolean;
  /** Matched journey_ids dropped because their canonical (latest) path no
   *  longer contains any requested video, or could not be resolved. */
  excludedJourneys: number;
  /** Distinct journey_ids matched before the cap was applied. */
  matchedJourneyCount: number;
  /** For every requested video: how many KEPT journeys contain it (0 = none
   *  observed, or crowded out by the cap — check `truncated`). */
  journeyCountByVideoId: Record<string, number>;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function discoverJourneysForVideos(
  videoIds: string[],
  options?: { maxJourneys?: number },
): Promise<DiscoverJourneysForVideosResult> {
  const maxJourneys = options?.maxJourneys ?? VIDEO_DISCOVERY_MAX_JOURNEYS;
  const wanted = Array.from(new Set(videoIds.filter(Boolean)));
  const wantedSet = new Set(wanted);
  const coverage: Record<string, number> = {};
  for (const id of wanted) coverage[id] = 0;

  if (wanted.length === 0) {
    return { journeys: [], truncated: false, excludedJourneys: 0, matchedJourneyCount: 0, journeyCountByVideoId: coverage };
  }

  // 1. Candidate journey_ids: jsonb containment on { video_id }, one query per
  //    requested video (bounded concurrency). journey_snapshot is jsonb, so the
  //    pattern is passed as JSON text — same reason as downstreamForRow.ts.
  const perVideoRows = await mapLimit(wanted, VIDEO_DISCOVERY_CONCURRENCY, async (videoId) => {
    const { data, error } = await supabase
      .from('events_journey')
      .select('journey_id, created_at')
      .contains('journey_snapshot', JSON.stringify([{ video_id: videoId }]))
      .order('created_at', { ascending: false })
      .limit(VIDEO_DISCOVERY_ROW_LIMIT);
    if (error) {
      throw new Error(`journeyDiscovery.ts discoverJourneysForVideos: events_journey match failed — ${error.message}`);
    }
    return (data ?? []) as { journey_id: string; created_at: string }[];
  });

  let rowLimitHit = false;
  const newestMatchMs = new Map<string, number>();
  for (const rows of perVideoRows) {
    if (rows.length >= VIDEO_DISCOVERY_ROW_LIMIT) rowLimitHit = true;
    for (const r of rows) {
      const ms = Date.parse(r.created_at);
      const prev = newestMatchMs.get(r.journey_id);
      if (prev === undefined || ms > prev) newestMatchMs.set(r.journey_id, ms);
    }
  }

// 2. Cap: most recently written journeys first (recency only).
//
// KNOWN RISK (documented, not fixed here): this cap is applied to distinct
// journey_ids BEFORE their paths are resolved or compared. Many sessions that
// walked the same route each consume one of the maxJourneys slots, so repeated
// routes can push other valid journeys past the cap. Videos whose journeys are
// crowded out look like "no journey evidence" and are shown as singleton rows
// by JourneyAnalytics. Route de-duplication (journeyRouteGrouping.ts) runs
// AFTER this cap and does NOT solve this; the `truncated` flag returned below
// is the only signal and must keep being surfaced in the UI.
  const orderedIds = Array.from(newestMatchMs.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const truncated = rowLimitHit || orderedIds.length > maxJourneys;
  const keptIds = orderedIds.slice(0, maxJourneys);

  // 3. Canonical (latest-row) path per journey_id — existing journey.ts rule.
  const resolved = await mapLimit(keptIds, VIDEO_DISCOVERY_CONCURRENCY, (id) => getJourneyById(id));

  const journeys: DiscoveredJourney[] = [];
  let excludedJourneys = 0;
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    if (!r.found) {
      excludedJourneys += 1;
      continue;
    }
    const touched = new Set<string>();
    for (const step of r.journey.steps) {
      if (wantedSet.has(step.videoId)) touched.add(step.videoId);
    }
    if (touched.size === 0) {
      excludedJourneys += 1; // canonical latest snapshot no longer contains the video
      continue;
    }
    for (const id of touched) coverage[id] += 1;
    journeys.push({ journeyId: keptIds[i], path: r.journey });
  }

  return {
    journeys,
    truncated,
    excludedJourneys,
    matchedJourneyCount: orderedIds.length,
    journeyCountByVideoId: coverage,
  };
}

// Own Asset -> video entry: a video asset's video is videos.asset_id = assetId.
// Assets with no videos row (campaign elements, imported resources) are simply
// absent from the returned map — they have no video to enter a journey from.
export async function resolveVideoIdsForAssets(assetIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = Array.from(new Set(assetIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += ASSET_LOOKUP_CHUNK) {
    const slice = ids.slice(i, i + ASSET_LOOKUP_CHUNK);
    const { data, error } = await supabase.from('videos').select('id, asset_id').in('asset_id', slice);
    if (error) {
      throw new Error(`journeyDiscovery.ts resolveVideoIdsForAssets: videos query failed — ${error.message}`);
    }
    for (const row of (data ?? []) as { id: string; asset_id: string | null }[]) {
      if (!row.asset_id) continue;
      const list = out.get(row.asset_id) ?? [];
      list.push(row.id);
      out.set(row.asset_id, list);
    }
  }
  return out;
}