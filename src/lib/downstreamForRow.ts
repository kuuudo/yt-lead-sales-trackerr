// ─────────────────────────────────────────────────────────────────────────────
// src/lib/downstreamForRow.ts
//
// PURPOSE: For ONE analytics row identity (promoting video_id + asset_id),
// load the observed DOWNSTREAM path(s): everything that observed journeys did
// AFTER this row's step, plus the counts shown in the Downstream preview.
//
// Reuses only existing pieces — nothing new is invented:
//   - events_journey.journey_snapshot (jsonb) — matched with a containment
//     query, then every matched journey_id is re-resolved to its canonical
//     (latest-row) JourneyPath via journey.ts getJourneyById().
//   - journeyDownstreamResolver.ts resolveDownstreamNodes() — unchanged — to
//     turn a terminal step's redirect link into "Newsletter" / "Consultation"
//     / resource, exactly like PromotionJourneyMap does.
//
// NO purchase attribution, NO sessionId, NO conversions/revenue: this works
// for rows that have clicks but no purchases. No ranking, comparison,
// "longest", or "best" journey: every journey_id contributes equally.
//
// NUMBERS (see DOWNSTREAM_COLUMN.md): same definition as journeyGraph.ts's
// observedCount — one count per occurrence of an adjacent step pair inside a
// matched journey's downstream slice. Always shown, including 1.
//
// Does NOT modify journey.ts, journeyGraph.ts, journeyDownstreamResolver.ts,
// PromotionJourneyMap.tsx, or any DB schema.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { getJourneyById, type JourneyStep } from './journey';
import { resolveDownstreamNodes } from '../services/journey/journeyDownstreamResolver';
import type { JourneyGraph } from './journeyGraph';

// ── Limits (documented in DOWNSTREAM_COLUMN.md) ─────────────────────────────
// A popular row can match thousands of journeys. Each journey costs one
// getJourneyById() query, so the preview is bounded. Selection is by most
// recently written events_journey row — recency only, never quality.
const MATCH_ROW_LIMIT = 500;
const MAX_JOURNEYS = 50;
const JOURNEY_FETCH_CONCURRENCY = 5;
const TITLE_CHUNK = 80;

// ── Result types ────────────────────────────────────────────────────────────

export type DownstreamStep = {
  videoId: string;
  title: string;
};

export type DownstreamEndNode = {
  id: string;
  kind: 'campaign_element' | 'resource';
  elementType: string | null;
  label: string;
};

export type DownstreamPath = {
  key: string;
  /** steps[0] is always this row's own step. */
  steps: DownstreamStep[];
  /** Resolved terminal destination (Newsletter, Consultation, …), if any. */
  endNodeId: string | null;
  /** How many matched journeys follow exactly this path. */
  journeyCount: number;
};

export type DownstreamResult = {
  paths: DownstreamPath[];
  /** `${fromVideoId}::${toVideoId}` → observed adjacent-pair count. */
  edgeCounts: Record<string, number>;
  /** `${lastVideoId}::${endNodeId}` → journeys whose terminal step led there. */
  endEdgeCounts: Record<string, number>;
  endNodes: Record<string, DownstreamEndNode>;
  /** Journeys included (their latest snapshot still contains this row's step). */
  journeyTotal: number;
  /** Matched journeys dropped because their latest snapshot no longer has the step. */
  excludedJourneys: number;
  /** True when more journeys matched than the preview loads. */
  truncated: boolean;
  /** True when terminal-step resolution failed (paths still shown). */
  endResolutionFailed: boolean;
};

export function edgeKey(fromVideoId: string, toVideoId: string): string {
  return `${fromVideoId}::${toVideoId}`;
}

const ELEMENT_LABELS: Record<string, string> = {
  landing_page: 'Direct purchase / Landing',
  newsletter: 'Newsletter',
  consultation: 'Consultation',
  sales_call: 'Sales call',
  lead_magnet: 'Lead magnet',
};

function endLabel(kind: 'campaign_element' | 'resource', elementType: string | null): string {
  if (elementType) return ELEMENT_LABELS[elementType] ?? elementType;
  return kind === 'resource' ? 'Resource' : 'Campaign element';
}

// ── Small helpers ───────────────────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── Per-row cache (module scope, keyed by row identity) ─────────────────────
// A failed load is evicted so the next hover/click retries.
const cache = new Map<string, Promise<DownstreamResult>>();

export function loadDownstreamForRow(videoId: string, assetId: string): Promise<DownstreamResult> {
  const key = `${assetId}::${videoId}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const promise = computeDownstream(videoId, assetId).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, promise);
  return promise;
}

// ── Core ────────────────────────────────────────────────────────────────────

async function computeDownstream(videoId: string, assetId: string): Promise<DownstreamResult> {
  // 1. Which journey_ids ever had a snapshot step for THIS promoting video +
  //    asset? jsonb containment against events_journey.journey_snapshot
  //    (entries are { video_id, asset_id, redirect_link_id, destination_video_id }).
  //    Matched rows may be historical (not the latest for their journey_id),
  //    so this only yields candidate journey_ids — canonical paths come from (2).
  const { data: matched, error: matchError } = await supabase
    .from('events_journey')
    .select('journey_id, created_at')
    // journey_snapshot is jsonb. supabase-js formats a JS ARRAY passed to
    // .contains() as a Postgres array literal ({a,b}) — invalid for jsonb
    // ("invalid input syntax for type json"). A string is sent as-is, so pass
    // the JSON text explicitly. (journey.ts' .contains('event_ids', [id]) is
    // fine because event_ids is a real text[] column.)
    .contains('journey_snapshot', JSON.stringify([{ video_id: videoId, asset_id: assetId }]))
    .order('created_at', { ascending: false })
    .limit(MATCH_ROW_LIMIT);

  if (matchError) {
    throw new Error(`downstreamForRow: events_journey match failed — ${matchError.message}`);
  }

  const matchedRows = (matched ?? []) as { journey_id: string; created_at: string }[];
  const distinctIds = Array.from(new Set(matchedRows.map((r) => r.journey_id)));
  const truncated = distinctIds.length > MAX_JOURNEYS || matchedRows.length >= MATCH_ROW_LIMIT;
  const journeyIds = distinctIds.slice(0, MAX_JOURNEYS);

  // 2. Canonical (latest-row) path per journey_id — existing journey.ts rule.
  const resolved = await mapWithConcurrency(journeyIds, JOURNEY_FETCH_CONCURRENCY, (id) =>
    getJourneyById(id),
  );

  // 3. Slice each journey from THIS row's step onward. The canonical latest
  //    snapshot may no longer contain the step (see journey.ts header) — those
  //    journeys are excluded and counted, never repaired.
  type Slice = { journeyId: string; steps: JourneyStep[] };
  const slices: Slice[] = [];
  let excludedJourneys = 0;

  for (const r of resolved) {
    if (!r.found) {
      excludedJourneys += 1;
      continue;
    }
    const steps = r.journey.steps;
    // First occurrence only — a looping journey does not start a second path.
    const idx = steps.findIndex((s) => s.videoId === videoId && s.assetId === assetId);
    if (idx === -1) {
      excludedJourneys += 1;
      continue;
    }
    slices.push({ journeyId: r.journey.journeyId, steps: steps.slice(idx) });
  }

  if (slices.length === 0) {
    return {
      paths: [],
      edgeCounts: {},
      endEdgeCounts: {},
      endNodes: {},
      journeyTotal: 0,
      excludedJourneys,
      truncated,
      endResolutionFailed: false,
    };
  }

  // 4. Resolve each journey's terminal step (destinationVideoId === null,
  //    per journey.ts TERMINAL SEMANTICS) with the EXISTING resolver.
  //    Fabricated minimal graph: only terminal videos, no edges, so every
  //    node counts as terminal inside resolveDownstreamNodes(). Resolving per
  //    journey (not on a merged graph) means a video that is terminal in one
  //    journey but not in another still gets its end resolved where it ends.
  const terminalLinkIdsByVideo = new Map<string, Set<string>>();
  for (const s of slices) {
    const last = s.steps[s.steps.length - 1];
    if (last.destinationVideoId === null && last.redirectLinkId) {
      const set = terminalLinkIdsByVideo.get(last.videoId) ?? new Set<string>();
      set.add(last.redirectLinkId);
      terminalLinkIdsByVideo.set(last.videoId, set);
    }
  }

  const endNodes: Record<string, DownstreamEndNode> = {};
  const endNodeByLinkId = new Map<string, string>();
  let endResolutionFailed = false;

  if (terminalLinkIdsByVideo.size > 0) {
    const terminalGraph: JourneyGraph = {
      nodes: Array.from(terminalLinkIdsByVideo.entries()).map(([vid, links]) => ({
        videoId: vid,
        observedAssetIds: [],
        observedRedirectLinkIds: Array.from(links),
      })),
      edges: [],
    };
    try {
      const resolution = await resolveDownstreamNodes(terminalGraph);
      for (const n of resolution.nodes) {
        endNodes[n.id] = {
          id: n.id,
          kind: n.kind,
          elementType: n.elementType,
          label: endLabel(n.kind, n.elementType),
        };
        endNodeByLinkId.set(n.redirectLinkId, n.id);
      }
    } catch (err) {
      console.warn('[downstreamForRow] terminal resolution failed', err);
      endResolutionFailed = true;
    }
  }

  // 5. Titles for every video in every slice (one batched lookup).
  const allVideoIds = Array.from(new Set(slices.flatMap((s) => s.steps.map((st) => st.videoId))));
  const titleById = new Map<string, string>();
  for (const ids of chunk(allVideoIds, TITLE_CHUNK)) {
    const { data, error } = await supabase.from('videos').select('id, video_title').in('id', ids);
    if (error) {
      console.warn('[downstreamForRow] title lookup failed', error.message);
      continue;
    }
    for (const v of (data ?? []) as { id: string; video_title: string | null }[]) {
      if (v.video_title) titleById.set(v.id, v.video_title);
    }
  }
  const titleOf = (id: string) => titleById.get(id) ?? `Unresolved step (${id.slice(0, 8)}…)`;

  // 6. Group identical downstream paths + count edges (journeyGraph definition).
  const edgeCounts: Record<string, number> = {};
  const endEdgeCounts: Record<string, number> = {};
  const pathsByKey = new Map<string, DownstreamPath>();

  for (const s of slices) {
    for (let i = 0; i < s.steps.length - 1; i++) {
      const k = edgeKey(s.steps[i].videoId, s.steps[i + 1].videoId);
      edgeCounts[k] = (edgeCounts[k] ?? 0) + 1;
    }

    const last = s.steps[s.steps.length - 1];
    const endNodeId =
      last.destinationVideoId === null && last.redirectLinkId
        ? endNodeByLinkId.get(last.redirectLinkId) ?? null
        : null;
    if (endNodeId) {
      const k = edgeKey(last.videoId, endNodeId);
      endEdgeCounts[k] = (endEdgeCounts[k] ?? 0) + 1;
    }

    const key = `${s.steps.map((st) => st.videoId).join('>')}|${endNodeId ?? ''}`;
    const existing = pathsByKey.get(key);
    if (existing) {
      existing.journeyCount += 1;
    } else {
      pathsByKey.set(key, {
        key,
        steps: s.steps.map((st) => ({ videoId: st.videoId, title: titleOf(st.videoId) })),
        endNodeId,
        journeyCount: 1,
      });
    }
  }

  return {
    // Insertion order (= most recently written journey first). Not sorted by
    // count or length on purpose — no ranking.
    paths: Array.from(pathsByKey.values()),
    edgeCounts,
    endEdgeCounts,
    endNodes,
    journeyTotal: slices.length,
    excludedJourneys,
    truncated,
    endResolutionFailed,
  };
}
