/**
 * src/lib/structuralJourneyDomains.ts
 *
 * Structural (not observed) downstream discovery for video-turn assets,
 * plus journey-domain eligibility for a NEW Video → Video edge.
 *
 * Does NOT use events_journey / downstreamForRow.ts (analytics).
 * Does NOT implement Relay consumption.
 */

import { supabase } from './supabase';

/** Product: NULL tracking_hostname means VSTRK. */
export const VSTRK_HOSTNAME = 'www.vstrk.com';

export function normalizeTrackingHostname(
  trackingHostname: string | null | undefined
): string {
  const h = (trackingHostname ?? '').trim().toLowerCase();
  if (!h) return VSTRK_HOSTNAME;
  return h.replace(/^www\./, '') === 'vstrk.com' ? VSTRK_HOSTNAME : trackingHostname!.trim();
}

/** Stable hostname key for set membership (www.vstrk.com and vstrk.com collapse). */
export function hostnameKey(host: string): string {
  const n = normalizeTrackingHostname(host);
  return n.replace(/^www\./, '').toLowerCase();
}

export function dedupeHostnames(hosts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hosts) {
    const n = normalizeTrackingHostname(h);
    const k = hostnameKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

// ── Graph types ─────────────────────────────────────────────────────────────

export type StructuralEdge = {
  redirectLinkId: string;
  token: string;
  fromVideoId: string;
  toAssetId: string;
  toVideoId: string | null;
  linkType: string;
  trackingHostname: string | null;
  normalizedHostname: string;
  journeyDomains: string[] | null;
};

export type StructuralBranch = {
  /** Ordered video ids from the start video outward (does not include start). */
  videoPath: string[];
  edges: StructuralEdge[];
  /** Domains committed on this branch (from edge journey_domains or normalized hostname). */
  existingDomains: string[];
  domainCount: number;
  isAnomalous: boolean;
};

export type StructuralDownstreamResult = {
  startAssetId: string;
  startVideoId: string | null;
  /** False when asset is not a video-turn asset (no videos.asset_id match). */
  isVideoTurn: boolean;
  branches: StructuralBranch[];
  /** Union across branches — display only; do NOT use for budget (branches are independent). */
  allDomainsDisplay: string[];
};

const VIDEO_HOP_LINK_TYPES = ['landing_page'] as const;
const MAX_DEPTH = 12;
const MAX_NODES = 200;

type LinkRow = {
  id: string;
  token: string;
  video_id: string;
  asset_id: string;
  link_type: string;
  tracking_hostname: string | null;
  journey_domains: string[] | null;
};

/**
 * Domains committed on one edge: prefer journey_domains when present,
 * else the edge's normalized tracking_hostname.
 */
export function domainsFromEdge(edge: {
  tracking_hostname?: string | null;
  journey_domains?: string[] | null;
  trackingHostname?: string | null;
  journeyDomains?: string[] | null;
}): string[] {
  const jd =
    edge.journey_domains ?? edge.journeyDomains ?? null;
  if (jd && Array.isArray(jd) && jd.length > 0) {
    return dedupeHostnames(jd.map(String));
  }
  const th = edge.tracking_hostname ?? edge.trackingHostname ?? null;
  return [normalizeTrackingHostname(th)];
}

/**
 * Build journey_domains for a NEW edge:
 * existing branch domains + hostname selected for THIS edge (deduped, max 2 enforced by eligibility).
 */
export function buildJourneyDomainsForNewEdge(
  existingBranchDomains: string[],
  selectedHostname: string | null | undefined
): string[] {
  const selected = normalizeTrackingHostname(selectedHostname);
  return dedupeHostnames([...existingBranchDomains, selected]);
}

/**
 * Path B / UI candidates → which hostnames may be chosen for the new edge.
 */
export function filterCandidatesByJourneyBudget(
  existingBranchDomains: string[],
  candidateHostnames: string[]
): {
  allowed: string[];
  blocked: string[];
  existingCount: number;
  isAnomalous: boolean;
} {
  const existing = dedupeHostnames(existingBranchDomains);
  const existingCount = existing.length;
  const isAnomalous = existingCount >= 3;
  const existingKeys = new Set(existing.map(hostnameKey));

  const allowed: string[] = [];
  const blocked: string[] = [];
  const seen = new Set<string>();

  for (const raw of candidateHostnames) {
    const n = normalizeTrackingHostname(raw);
    const k = hostnameKey(n);
    if (seen.has(k)) continue;
    seen.add(k);

    if (isAnomalous) {
      // Do not expand further — only allow already-on-branch hosts
      if (existingKeys.has(k)) allowed.push(n);
      else blocked.push(n);
      continue;
    }

    if (existingCount === 0) {
      allowed.push(n);
      continue;
    }
    if (existingCount === 1) {
      // same or one new
      allowed.push(n);
      continue;
    }
    // existingCount === 2
    if (existingKeys.has(k)) allowed.push(n);
    else blocked.push(n);
  }

  return { allowed, blocked, existingCount, isAnomalous };
}

/**
 * For a selected asset_id (video-turn), walk structural downstream branches.
 */
export async function loadStructuralDownstreamForAsset(
  assetId: string
): Promise<StructuralDownstreamResult> {
  const empty = (isVideoTurn: boolean, startVideoId: string | null): StructuralDownstreamResult => ({
    startAssetId: assetId,
    startVideoId,
    isVideoTurn,
    branches: [],
    allDomainsDisplay: [],
  });

  const { data: videoRow, error: vErr } = await supabase
    .from('videos')
    .select('id, asset_id')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (vErr || !videoRow?.id) {
    return empty(false, null);
  }

  const startVideoId = videoRow.id as string;

  // BFS: each path from start is an independent branch (fan-out).
  type PathState = {
    videoId: string;
    edges: StructuralEdge[];
    domainAcc: string[];
    depth: number;
  };

  const completed: StructuralBranch[] = [];
  let queue: PathState[] = [{ videoId: startVideoId, edges: [], domainAcc: [], depth: 0 }];
  let nodesVisited = 0;

  while (queue.length > 0 && nodesVisited < MAX_NODES) {
    const layer = queue;
    queue = [];

    for (const state of layer) {
      if (state.depth >= MAX_DEPTH) {
        completed.push(toBranch(state));
        continue;
      }

      const { data: links, error } = await supabase
        .from('redirect_links')
        .select('id, token, video_id, asset_id, link_type, tracking_hostname, journey_domains')
        .eq('video_id', state.videoId)
        .in('link_type', VIDEO_HOP_LINK_TYPES as unknown as string[])
        .not('asset_id', 'is', null);

      if (error) {
        console.warn('[structuralJourneyDomains] outgoing links failed', error.message);
        completed.push(toBranch(state));
        continue;
      }

      const rows = (links ?? []) as LinkRow[];
      if (rows.length === 0) {
        if (state.edges.length > 0) completed.push(toBranch(state));
        continue;
      }

      const assetIds = Array.from(new Set(rows.map((r) => r.asset_id).filter(Boolean)));
      const videoByAsset = await fetchVideosByAssetIds(assetIds);

      let expanded = false;
      for (const row of rows) {
        nodesVisited += 1;
        const childVideo = videoByAsset.get(row.asset_id);
        const edge: StructuralEdge = {
          redirectLinkId: row.id,
          token: row.token,
          fromVideoId: row.video_id,
          toAssetId: row.asset_id,
          toVideoId: childVideo?.id ?? null,
          linkType: row.link_type,
          trackingHostname: row.tracking_hostname,
          normalizedHostname: normalizeTrackingHostname(row.tracking_hostname),
          journeyDomains: row.journey_domains,
        };

        const edgeDomains = domainsFromEdge(row);
        const nextDomains = dedupeHostnames([...state.domainAcc, ...edgeDomains]);

        // Cycle: child already on this path
        const pathVideoIds = [
          startVideoId,
          ...state.edges.map((e) => e.toVideoId).filter(Boolean) as string[],
        ];
        if (childVideo && pathVideoIds.includes(childVideo.id)) {
          completed.push(
            toBranch({
              videoId: state.videoId,
              edges: [...state.edges, edge],
              domainAcc: nextDomains,
              depth: state.depth + 1,
            })
          );
          continue;
        }

        if (!childVideo) {
          // Terminal non-video asset hop — branch ends after this edge
          completed.push(
            toBranch({
              videoId: state.videoId,
              edges: [...state.edges, edge],
              domainAcc: nextDomains,
              depth: state.depth + 1,
            })
          );
          expanded = true;
          continue;
        }

        queue.push({
          videoId: childVideo.id,
          edges: [...state.edges, edge],
          domainAcc: nextDomains,
          depth: state.depth + 1,
        });
        expanded = true;
      }

      if (!expanded && state.edges.length > 0) {
        completed.push(toBranch(state));
      }
    }
  }

  // Leftover queue paths
  for (const state of queue) {
    if (state.edges.length > 0) completed.push(toBranch(state));
  }

  const allDomainsDisplay = dedupeHostnames(
    completed.flatMap((b) => b.existingDomains)
  );

  return {
    startAssetId: assetId,
    startVideoId,
    isVideoTurn: true,
    branches: completed,
    allDomainsDisplay,
  };
}

function toBranch(state: {
  edges: StructuralEdge[];
  domainAcc: string[];
  // Callers pass whole PathState-like objects; these are ignored here.
  // Widened ONLY to satisfy tsc excess-property checks (no runtime change).
  videoId?: string;
  depth?: number;
}): StructuralBranch {
  const existingDomains = dedupeHostnames(state.domainAcc);
  return {
    videoPath: state.edges
      .map((e) => e.toVideoId)
      .filter((id): id is string => !!id),
    edges: state.edges,
    existingDomains,
    domainCount: existingDomains.length,
    isAnomalous: existingDomains.length >= 3,
  };
}

async function fetchVideosByAssetIds(
  assetIds: string[]
): Promise<Map<string, { id: string; asset_id: string }>> {
  const out = new Map<string, { id: string; asset_id: string }>();
  if (assetIds.length === 0) return out;

  const { data, error } = await supabase
    .from('videos')
    .select('id, asset_id')
    .in('asset_id', assetIds);

  if (error) {
    console.warn('[structuralJourneyDomains] videos by asset failed', error.message);
    return out;
  }

  for (const v of data ?? []) {
    if (v.asset_id) out.set(v.asset_id as string, { id: v.id as string, asset_id: v.asset_id as string });
  }
  return out;
}

/**
 * When attaching a NEW edge that promotes `assetId`, existing domains are
 * the domains already on downstream branches of that video-turn asset.
 * For budget on the new edge we use the max / primary branch context:
 * - If any branch is already at 2, candidates are limited to the intersection
 *   of domains allowed on the strictest branch (union of 2-domain branch sets
 *   when multiple 2-domain branches exist is too loose; we use:
 *   domains that appear on EVERY branch that has domainCount === 2, else
 *   union of all existing domains on branches as "known", with count = max).
 *
 * Simpler product rule for create (Videos): take the **strictest** branch:
 * max domainCount among branches; existingDomains = union of domains from
 * branches that have that max count (if max is 2, user may only pick from
 * those hostnames that are in the union of 2-domain branches — still may
 * allow a hostname only on one branch; safer alternative: intersection).
 *
 * Locked simpler rule for MVP:
 * existingDomains = union of all branch existingDomains
 * existingCount for eligibility = max(branch.domainCount)
 * When max >= 2, only hostnames in the union of branches with domainCount >= 2
 * are allowed as "already used"; third hostnames blocked.
 */
export function aggregateExistingForNewEdge(
  result: StructuralDownstreamResult
): { existingDomains: string[]; existingCount: number; isAnomalous: boolean } {
  if (!result.isVideoTurn || result.branches.length === 0) {
    return { existingDomains: [], existingCount: 0, isAnomalous: false };
  }

  const maxCount = Math.max(...result.branches.map((b) => b.domainCount), 0);
  const isAnomalous = maxCount >= 3 || result.branches.some((b) => b.isAnomalous);

  if (maxCount === 0) {
    return { existingDomains: [], existingCount: 0, isAnomalous: false };
  }

  // Union of domains on all branches (each branch independent for fan-out
  // display; for the new inbound edge to this asset we treat known domains
  // on any downstream path from this asset as committed context for THIS
  // asset's chain).
  const union = dedupeHostnames(result.branches.flatMap((b) => b.existingDomains));

  return {
    existingDomains: union,
    existingCount: Math.min(maxCount, union.length),
    isAnomalous,
  };
}
