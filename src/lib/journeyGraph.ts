// ─────────────────────────────────────────────────────────────────────────────
// journeyGraph.ts
//
// PURPOSE: Merge the individual JourneyPaths discovered for a Promotion
// (journeyDiscovery.ts -> DiscoveredJourney[]) into ONE observed graph:
// deduplicated nodes + edges annotated with how many times that transition
// was actually observed.
//
// PURE FUNCTION, NO DATABASE ACCESS: consumes only the JourneyPath shape
// already produced by journey.ts (via journeyDiscovery.ts). Does not query
// Supabase, does not touch `events`, does not touch attribution or
// `journeyAnalyticsEngine.ts`.
//
// SCOPE (deliberately narrow — see conversation 2026-09-14):
//   - Node identity, edge construction, transition counts. That's it.
//   - NO click/visitor/engagement/source metrics (that's a future
//     journeyMetrics.ts, sourced from `events`).
//   - NO UI shaping, NO layout/positions, NO Play-animation timing.
//   - Does NOT invent edges: an edge only exists if two steps were actually
//     adjacent, in that order, within some discovered JourneyPath's own
//     `steps` array. No shortcutting across skipped steps, no inferring an
//     edge from destinationVideoId when it wasn't also the literal next
//     step observed.
//
// NODE IDENTITY: keyed by JourneyStep.videoId. This mirrors journey.ts /
// journeyDiscovery.ts / promotionJourney.ts / assetJourney.ts, all of which
// already treat `videoId` as the per-step identity field coming out of
// journey_snapshot (present on every step regardless of underlying asset
// type — video, campaign element, or imported resource). assetId and
// redirectLinkId are NOT used as the node key, because the same videoId
// has been observed reached via more than one redirectLinkId, and
// assetJourney.ts's own comments confirm assetId can vary independently of
// other fields on a step. Both are preserved on the node as observed sets
// instead (see GraphNode below) rather than picking one arbitrarily.
//
// EDGE CONSTRUCTION: for each DiscoveredJourney, walk its JourneyPath.steps
// array in order and emit one edge per adjacent pair (steps[i] -> steps[i+1]),
// keyed by (fromVideoId, toVideoId). observedCount is incremented once per
// occurrence of that adjacent pair across all discovered journeys — matches
// the worked example (J1: A-B-C-D, J2: A-B-C, J3: A-B => A->B:3, B->C:2,
// C->D:1).
// ─────────────────────────────────────────────────────────────────────────────

import type { DiscoveredJourney } from './journeyDiscovery';
import type { JourneyStep } from './journey';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type GraphNode = {
  // Dedup key — see NODE IDENTITY above.
  videoId: string;
  // Every distinct assetId seen attached to this videoId across all
  // discovered journeys. Usually a single-element array; kept as a set
  // rather than a single field because nothing in journey.ts / assetJourney.ts
  // guarantees a videoId maps to exactly one assetId.
  observedAssetIds: string[];
  // Every distinct redirectLinkId seen attached to this videoId across all
  // discovered journeys (a video can be reached via more than one
  // redirect_link row).
  observedRedirectLinkIds: string[];
};

export type GraphEdge = {
  fromVideoId: string;
  toVideoId: string;
  // Number of times this exact (fromVideoId -> toVideoId) adjacency was
  // observed as two consecutive steps in some discovered journey's own
  // step sequence. See EDGE CONSTRUCTION above.
  observedCount: number;
  // Which journeyIds contributed to this edge's count — kept for
  // traceability/debugging, not required by the count itself.
  journeyIds: string[];
};

export type JourneyGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

// ═══════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════

function addToNodeSet(map: Map<string, GraphNode>, step: JourneyStep): void {
  const existing = map.get(step.videoId);
  if (!existing) {
    map.set(step.videoId, {
      videoId: step.videoId,
      observedAssetIds: step.assetId ? [step.assetId] : [],
      observedRedirectLinkIds: step.redirectLinkId ? [step.redirectLinkId] : [],
    });
    return;
  }

  if (step.assetId && !existing.observedAssetIds.includes(step.assetId)) {
    existing.observedAssetIds.push(step.assetId);
  }
  if (step.redirectLinkId && !existing.observedRedirectLinkIds.includes(step.redirectLinkId)) {
    existing.observedRedirectLinkIds.push(step.redirectLinkId);
  }
}

function edgeKey(fromVideoId: string, toVideoId: string): string {
  return `${fromVideoId}::${toVideoId}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// buildJourneyGraph
// ═══════════════════════════════════════════════════════════════════════════

export function buildJourneyGraph(discovered: DiscoveredJourney[]): JourneyGraph {
  const nodesByVideoId = new Map<string, GraphNode>();
  const edgesByKey = new Map<string, GraphEdge>();

  for (const { journeyId, path } of discovered) {
    const steps = path.steps;

    // Nodes: every step contributes its videoId, regardless of position.
    for (const step of steps) {
      addToNodeSet(nodesByVideoId, step);
    }

    // Edges: only literal consecutive pairs in this journey's own observed
    // order. A journey with 0 or 1 steps contributes no edges.
    for (let i = 0; i < steps.length - 1; i++) {
      const from = steps[i];
      const to = steps[i + 1];
      const key = edgeKey(from.videoId, to.videoId);

      const existing = edgesByKey.get(key);
      if (!existing) {
        edgesByKey.set(key, {
          fromVideoId: from.videoId,
          toVideoId: to.videoId,
          observedCount: 1,
          journeyIds: [journeyId],
        });
      } else {
        existing.observedCount += 1;
        if (!existing.journeyIds.includes(journeyId)) {
          existing.journeyIds.push(journeyId);
        }
      }
    }
  }

  return {
    nodes: Array.from(nodesByVideoId.values()),
    edges: Array.from(edgesByKey.values()),
  };
}
