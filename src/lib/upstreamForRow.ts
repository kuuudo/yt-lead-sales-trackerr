// ─────────────────────────────────────────────────────────────────────────────
// src/lib/upstreamForRow.ts
//
// PURPOSE: For ONE analytics row identity (a video_id + its OWN asset_id),
// walk BACKWARD to find every video that could structurally have led here,
// plus — for whichever of those transitions really happened — how many real
// (events_journey-matched) journeys actually confirm it.
//
// This is the mirror image of downstreamForRow.ts, but it is NOT the same
// kind of computation:
//
//   downstreamForRow.ts:
//     1 events_journey containment match on THIS row's step
//     2 re-resolve every matched journey_id to its canonical path
//     3 slice everything AFTER this row's step
//   → downstream only ever describes journeys that were actually observed.
//
//   upstreamForRow.ts:
//     Structural half: redirect_links + videos, walked backward — "what COULD
//     have led here", independent of whether anyone ever clicked it. This is
//     necessarily branchy (fan-in): several videos can link to the same
//     asset, and we keep every branch, we do not pick "the" one.
//     Confirmed half: reuses the exact SAME containment+resolve step downstream
//     uses (on THIS row), just sliced the other direction (everything BEFORE
//     this row's step in a matched journey). That prefix is real, so any
//     structural edge it touches gets a confirmedCount > 0.
//
// Nothing about "light color" / "normal color" / "campaign border color" is
// decided here on purpose (per spec, 2026-09-27): this file only reports
//   - does this node/edge exist structurally
//   - is it confirmed, and by how many real journeys
//   - what Content Campaign (videos.campaign_id) each node belongs to
//   - was a supplied boundary asset reached (e.g. a Promotion's root asset)
// PromotionJourneyMap decides confirmed=normal / unconfirmed=light and stops
// at isBoundary nodes. CampaignJourneyMap ignores all of that and just draws
// everything returned, expanding past boundaries if it wants the bigger
// picture. Neither page's rendering choices belong in this file.
//
// Does NOT modify journey.ts, downstreamForRow.ts, journeyGraph.ts,
// PromotionJourneyMap.tsx, CampaignJourneyMap.tsx, or any DB schema.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { getJourneyById, type JourneyStep } from './journey';
import { edgeKey } from './downstreamForRow';

// ── Limits ──────────────────────────────────────────────────────────────────
// A batch walks at most DEFAULT_MAX_DEPTH hops back before stopping and
// handing the caller a `frontier` to resume from via continueUpstream() —
// this is "Continue upstream", not a hard ceiling. MAX_NODES_PER_BATCH is a
// second, independent safety valve (a shallow-but-very-branchy graph could
// still blow up a single batch), same spirit as downstream's MAX_JOURNEYS.
const DEFAULT_MAX_DEPTH = 10;
const MAX_NODES_PER_BATCH = 300;
const ASSET_ID_CHUNK = 80;
const VIDEO_ID_CHUNK = 80;

// Only a redirect_link whose destination asset_id resolves to ANOTHER
// video's own asset_id counts as an upstream hop. A link whose destination is
// a Newsletter / Consultation / Sales call / Lead magnet (or any other
// non-video campaign element / resource) is a valid DOWNSTREAM terminal, but
// it is never an upstream VIDEO — there is nothing to keep walking back
// through. link_type 'landing_page' is, by convention in this schema, the
// type used for a video-to-video (video-to-asset) reference; everything else
// is excluded up front so we never even ask "does this asset resolve to a
// video" for links that structurally can't be one.
const VIDEO_LINK_TYPES = ['landing_page'] as const;

// ── Result types ────────────────────────────────────────────────────────────

export type UpstreamNode = {
  videoId: string;
  /** This video's OWN identity asset (videos.asset_id) — what a further hop back is matched against. */
  assetId: string;
  title: string;
  /** Content Campaign this video belongs to (videos.campaign_id). Border color, if any, is the caller's decision. */
  campaignId: string | null;
  /** 1 = immediately upstream of the row this walk started from. */
  depth: number;
  /** This node's own assetId matched a supplied boundary — included, but never expanded past. */
  isBoundary: boolean;
  /** This node was reached again from another branch after already being expanded — never re-expanded, so no infinite walk, but the merge point is worth flagging to the caller. */
  isRevisited: boolean;
};

export type UpstreamEdge = {
  /** Earlier / further-back video. */
  fromVideoId: string;
  fromAssetId: string;
  /** Later video — closer to (or equal to) the row the walk started from. */
  toVideoId: string;
  toAssetId: string;
  redirectLinkId: string;
  /** How many real matched journeys actually traversed this exact transition immediately upstream of the starting row. 0 = structural only, never observed. */
  confirmedCount: number;
};

export type UpstreamResult = {
  startVideoId: string;
  startAssetId: string;
  /** Every upstream node discovered so far (does NOT include the starting row itself). */
  nodes: UpstreamNode[];
  edges: UpstreamEdge[];
  /** `${fromVideoId}::${toVideoId}` → confirmedCount, exposed same as downstream's edgeCounts. */
  confirmedEdgeCounts: Record<string, number>;
  /** Nodes still waiting to be expanded — pass this whole result into continueUpstream() for the next batch. Empty when the walk ran out of real upstream links on its own (nothing left to continue). */
  frontier: Array<{ videoId: string; assetId: string; depth: number }>;
  /** True when `frontier` is non-empty because maxDepth was hit (there is more to see), not because data ran out. */
  truncatedByDepth: boolean;
  /** True when MAX_NODES_PER_BATCH cut the batch short regardless of depth. */
  truncatedBySize: boolean;
  /** Count of edges that pointed back to an already-discovered node (legitimate fan-in convergence AND true cycles both land here — either way nothing is re-expanded, so nothing loops forever). */
  revisitEdgeCount: number;
};

export type UpstreamOptions = {
  /** Default 10. How many additional hops this call is allowed to walk before returning a resumable frontier. */
  maxDepth?: number;
  /**
   * Asset ids that are a hard stop for expansion — e.g. a Promotion's own
   * root/promoted asset. A node whose OWN assetId is in this set is still
   * included in the result (isBoundary: true) so the caller can render it,
   * but the walk does not look for what's upstream of it. Leave empty/undefined
   * (e.g. for CampaignJourneyMap) to walk with no such boundary.
   */
  boundaryAssetIds?: Iterable<string>;
};

// ── Small helpers ───────────────────────────────────────────────────────────

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type VideoInfo = { videoId: string; title: string; assetId: string | null; campaignId: string | null };

async function fetchVideosByIds(ids: string[]): Promise<Map<string, VideoInfo>> {
  const out = new Map<string, VideoInfo>();
  for (const idsChunk of chunk(Array.from(new Set(ids)), VIDEO_ID_CHUNK)) {
    const { data, error } = await supabase
      .from('videos')
      .select('id, video_title, asset_id, campaign_id')
      .in('id', idsChunk);
    if (error) {
      console.warn('[upstreamForRow] video lookup failed', error.message);
      continue;
    }
    for (const v of (data ?? []) as {
      id: string;
      video_title: string | null;
      asset_id: string | null;
      campaign_id: string | null;
    }[]) {
      out.set(v.id, {
        videoId: v.id,
        title: v.video_title ?? `Unresolved video (${v.id.slice(0, 8)}…)`,
        assetId: v.asset_id,
        campaignId: v.campaign_id,
      });
    }
  }
  return out;
}

type RedirectLinkRow = { id: string; video_id: string | null; asset_id: string | null };

/** For a batch of destination asset ids, find every redirect_link (video → asset) pointing at any of them. */
async function fetchIncomingLinks(assetIds: string[]): Promise<RedirectLinkRow[]> {
  const out: RedirectLinkRow[] = [];
  for (const idsChunk of chunk(Array.from(new Set(assetIds)), ASSET_ID_CHUNK)) {
    const { data, error } = await supabase
      .from('redirect_links')
      .select('id, video_id, asset_id')
      .in('asset_id', idsChunk)
      .in('link_type', VIDEO_LINK_TYPES as unknown as string[])
      .not('video_id', 'is', null);
    if (error) {
      console.warn('[upstreamForRow] redirect_links backward lookup failed', error.message);
      continue;
    }
    out.push(...((data ?? []) as RedirectLinkRow[]));
  }
  return out;
}

// ── Confirmed half — reuses downstream's exact matching step, sliced the
//    other way. See downstreamForRow.ts steps 1–3 for the full rationale;
//    not duplicated here beyond what's needed to build a prefix edge count. ──

async function fetchConfirmedPrefixEdgeCounts(
  videoId: string,
  assetId: string,
): Promise<Record<string, number>> {
  const { data: matched, error: matchError } = await supabase
    .from('events_journey')
    .select('journey_id, created_at')
    .contains('journey_snapshot', JSON.stringify([{ video_id: videoId, asset_id: assetId }]))
    .order('created_at', { ascending: false })
    .limit(500);

  if (matchError) {
    console.warn('[upstreamForRow] events_journey match failed', matchError.message);
    return {};
  }

  const matchedRows = (matched ?? []) as { journey_id: string }[];
  const journeyIds = Array.from(new Set(matchedRows.map((r) => r.journey_id))).slice(0, 50);

  const edgeCounts: Record<string, number> = {};

  await Promise.all(
    journeyIds.map(async (id) => {
      const r = await getJourneyById(id).catch(() => null);
      if (!r || !r.found) return;
      const steps: JourneyStep[] = r.journey.steps;
      const idx = steps.findIndex((s) => s.videoId === videoId && s.assetId === assetId);
      if (idx <= 0) return; // idx === -1 (step missing from canonical latest) or idx === 0 (nothing upstream to confirm)
      for (let i = 0; i < idx; i++) {
        const k = edgeKey(steps[i].videoId, steps[i + 1].videoId);
        edgeCounts[k] = (edgeCounts[k] ?? 0) + 1;
      }
    }),
  );

  return edgeCounts;
}

// ── Core BFS walker ─────────────────────────────────────────────────────────

type FrontierItem = { videoId: string; assetId: string; depth: number };

async function walk(
  startVideoId: string,
  startAssetId: string,
  initialFrontier: FrontierItem[],
  seenVideoIds: Set<string>,
  nodesSoFar: Map<string, UpstreamNode>,
  edgesSoFar: UpstreamEdge[],
  confirmedEdgeCounts: Record<string, number>,
  options: UpstreamOptions | undefined,
): Promise<UpstreamResult> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const boundarySet = new Set(options?.boundaryAssetIds ?? []);

  let frontier = initialFrontier;
  let truncatedByDepth = false;
  let truncatedBySize = false;
  let revisitEdgeCount = 0;
  const nextFrontier: FrontierItem[] = [];

  while (frontier.length > 0) {
    const depth = frontier[0].depth; // all items in one BFS layer share a depth
    if (depth > maxDepth) {
      truncatedByDepth = true;
      nextFrontier.push(...frontier);
      break;
    }
    if (nodesSoFar.size >= MAX_NODES_PER_BATCH) {
      truncatedBySize = true;
      nextFrontier.push(...frontier);
      break;
    }

    // toAssetId → the frontier item(s) it belongs to (normally one, but a
    // video's own asset_id is unique so this is really just a lookup map).
    const byAssetId = new Map<string, FrontierItem>();
    for (const f of frontier) byAssetId.set(f.assetId, f);

    const incoming = await fetchIncomingLinks(frontier.map((f) => f.assetId));
    if (incoming.length === 0) {
      frontier = [];
      continue; // this layer's branches simply end here — not truncation, just no more data
    }

    const upstreamVideoIds = Array.from(
      new Set(incoming.map((l) => l.video_id).filter((v): v is string => !!v)),
    );
    const videoInfoById = await fetchVideosByIds(upstreamVideoIds);

    const layerNext: FrontierItem[] = [];

    for (const link of incoming) {
      if (!link.video_id || !link.asset_id) continue;
      const toItem = byAssetId.get(link.asset_id);
      if (!toItem) continue; // defensive — shouldn't happen, query was filtered on these exact asset ids

      const info = videoInfoById.get(link.video_id);
      if (!info) continue; // upstream video row missing/deleted — nothing to show

      const edge: UpstreamEdge = {
        fromVideoId: info.videoId,
        fromAssetId: info.assetId ?? '',
        toVideoId: toItem.videoId,
        toAssetId: toItem.assetId,
        redirectLinkId: link.id,
        confirmedCount: confirmedEdgeCounts[edgeKey(info.videoId, toItem.videoId)] ?? 0,
      };
      edgesSoFar.push(edge);

      if (seenVideoIds.has(info.videoId)) {
        // Already discovered (and already expanded, or already queued) from
        // another branch — or this IS a true cycle back to a video already
        // on this chain. Either way: don't re-expand, don't duplicate the
        // node, just count it.
        revisitEdgeCount += 1;
        const existing = nodesSoFar.get(info.videoId);
        if (existing) existing.isRevisited = true;
        continue;
      }
      seenVideoIds.add(info.videoId);

      const isBoundary = !!info.assetId && boundarySet.has(info.assetId);
      const node: UpstreamNode = {
        videoId: info.videoId,
        assetId: info.assetId ?? '',
        title: info.title,
        campaignId: info.campaignId,
        depth,
        isBoundary,
        isRevisited: false,
      };
      nodesSoFar.set(info.videoId, node);

      if (!isBoundary && info.assetId) {
        layerNext.push({ videoId: info.videoId, assetId: info.assetId, depth: depth + 1 });
      }
    }

    frontier = layerNext;
  }

  return {
    startVideoId,
    startAssetId,
    nodes: Array.from(nodesSoFar.values()),
    edges: edgesSoFar,
    confirmedEdgeCounts,
    frontier: nextFrontier,
    truncatedByDepth,
    truncatedBySize,
    revisitEdgeCount,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Start a fresh upstream walk from one analytics row identity. Returns up to
 * `options.maxDepth` (default 10) hops back. If `result.frontier` is
 * non-empty and `result.truncatedByDepth` is true, there is more to see —
 * call `continueUpstream(result, options)` to fetch the next batch; the UI's
 * "Continue upstream" button is exactly this.
 */
export async function loadUpstreamForRow(
  videoId: string,
  assetId: string,
  options?: UpstreamOptions,
): Promise<UpstreamResult> {
  // NOTE (fixed 2026-09-27): boundaryAssetIds is allowed to contain the
  // starting row's own assetId — this is in fact the normal case when a
  // Promotion Asset traces its own upstream with itself as the boundary
  // (see PromotionJourneyMap.tsx's "Upstream" button). Boundary only stops
  // expansion PAST a node discovered during the walk (handled inside walk()
  // via `isBoundary`); it must never short-circuit the initial lookup just
  // because the start happens to be in that same set.
  const confirmedEdgeCounts = await fetchConfirmedPrefixEdgeCounts(videoId, assetId);

  return walk(
    videoId,
    assetId,
    [{ videoId, assetId, depth: 1 }],
    new Set([videoId]),
    new Map(),
    [],
    confirmedEdgeCounts,
    options,
  );
}

/**
 * Resume a previous (possibly depth- or size-truncated) walk from where it
 * left off. Returns the FULL accumulated graph (previous nodes/edges plus
 * whatever this batch adds), so the caller can just re-render from the
 * returned result each time rather than manually merging two objects.
 */
export async function continueUpstream(
  previous: UpstreamResult,
  options?: UpstreamOptions,
): Promise<UpstreamResult> {
  if (previous.frontier.length === 0) return previous; // nothing left to continue

  const nodesSoFar = new Map(previous.nodes.map((n) => [n.videoId, { ...n }] as const));
  const seenVideoIds = new Set([previous.startVideoId, ...previous.nodes.map((n) => n.videoId)]);

  return walk(
    previous.startVideoId,
    previous.startAssetId,
    previous.frontier,
    seenVideoIds,
    nodesSoFar,
    [...previous.edges],
    previous.confirmedEdgeCounts,
    options,
  );
}