/**
 * services/attribution/resolveJourneyStart.ts
 *
 * journey_id → TRUE START (video_id + asset_id).
 *
 * Model:
 *   - The latest NON-checkout events_journey row is PATH EVIDENCE, never START by itself.
 *   - L0 = snapshot[0].redirect_link_id; redirect_links.video_id is the authoritative video.
 *   - Walk upstream ONLY when structurally provable:
 *       parent.destination_url (host + first path token) == current link's tracking host + token
 *       AND the parent link appears in this journey's event evidence
 *       (and, when the current link has events, before its first event).
 *   - Checkout links are boundaries, never nodes, never START.
 *   - Inconsistent journeys return a diagnostic status; they never block anything else.
 *
 * Does NOT touch Relay, events_journey writing, or journey.ts.
 */

import { supabase } from '../../lib/supabase';

export type JourneyStartStatus =
  | 'resolved_path_only'
  | 'resolved_with_upstream_hop'
  | 'no_journey_rows'
  | 'no_path_row'
  | 'snapshot_invalid'
  | 'link_missing'
  | 'video_missing';

export interface JourneyStartResolution {
  journeyId: string;
  status: JourneyStartStatus;
  startVideoId: string | null;
  startAssetId: string | null;
  startRedirectLinkId: string | null;
  /** L0 before the upstream walk (snapshot[0] of the path candidate). */
  pathRootRedirectLinkId: string | null;
  /** Parent links walked, nearest first. Empty when START == path root. */
  upstreamHopLinkIds: string[];
  diagnostics: string[];
}

type SnapshotEntry = {
  video_id: string | null;
  asset_id: string | null;
  redirect_link_id: string | null;
  destination_video_id: string | null;
};

type JourneyRow = {
  id: string;
  journey_id: string;
  event_ids: string[] | null;
  journey_snapshot: SnapshotEntry[] | null;
  redirect_link_id: string | null;
  created_at: string;
};

type LinkRow = {
  id: string;
  token: string | null;
  video_id: string | null;
  asset_id: string | null;
  link_type: string | null;
  destination_url: string | null;
  tracking_hostname: string | null;
};

type EventRow = { id: string; created_at: string; redirect_link_id: string | null };

const EVENTS_JOURNEY_COLUMNS =
  'id, journey_id, event_ids, journey_snapshot, redirect_link_id, created_at';
const LINK_COLUMNS =
  'id, token, video_id, asset_id, link_type, destination_url, tracking_hostname';

const IN_CHUNK = 150;
// Journeys have many rows each; keep batches small so one query stays under
// PostgREST's default 1000-row cap.
const JOURNEY_CHUNK = 20;
const MAX_UPSTREAM_DEPTH = 10;
// Links with tracking_hostname = null live on the default VSTRK domain.
const DEFAULT_TRACKING_HOST = 'vstrk.com';

// ── shared helpers (also used by resolveStripePurchaseJourneys.ts) ──────────

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function fetchRowsByIn<T>(
  table: string,
  columns: string,
  column: string,
  values: string[],
  size: number = IN_CHUNK,
): Promise<T[]> {
  const distinct = Array.from(new Set(values.filter(Boolean)));
  const out: T[] = [];
  for (const batch of chunkArray(distinct, size)) {
    const { data, error } = await supabase.from(table).select(columns).in(column, batch);
    if (error) {
      throw new Error(`attribution: ${table}.${column} query failed — ${error.message}`);
    }
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

function normHost(h: string | null | undefined): string | null {
  if (!h) return null;
  const v = h.trim().toLowerCase().replace(/^www\./, '');
  return v || null;
}

function linkHost(l: LinkRow): string {
  return normHost(l.tracking_hostname) ?? DEFAULT_TRACKING_HOST;
}

function parseDestination(url: string | null): { host: string; token: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const token = u.pathname.split('/').filter(Boolean)[0];
    const host = normHost(u.hostname);
    if (!token || !host) return null;
    return { host, token };
  } catch {
    return null;
  }
}

function byCreatedThenId(a: JourneyRow, b: JourneyRow): number {
  const t = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

// ── per-journey resolution (pure; no I/O) ───────────────────────────────────

function resolveOne(
  journeyId: string,
  jrows: JourneyRow[],
  eventById: Map<string, EventRow>,
  linkById: Map<string, LinkRow>,
  ownAssetByVideoId: Map<string, string | null>,
): JourneyStartResolution {
  const diagnostics: string[] = [];
  const fail = (status: JourneyStartStatus, pathRoot: string | null = null): JourneyStartResolution => ({
    journeyId,
    status,
    startVideoId: null,
    startAssetId: null,
    startRedirectLinkId: null,
    pathRootRedirectLinkId: pathRoot,
    upstreamHopLinkIds: [],
    diagnostics,
  });

  if (jrows.length === 0) return fail('no_journey_rows');

  const sorted = [...jrows].sort(byCreatedThenId);

  // Boundary row = written by a checkout link. Its snapshot is NOT path evidence
  // (observed: it collapses to the tail of the real path), but its event_ids
  // still count as evidence below.
  const isBoundary = (r: JourneyRow): boolean =>
    r.redirect_link_id != null && linkById.get(r.redirect_link_id)?.link_type === 'checkout';

  const pathRows = sorted.filter((r) => !isBoundary(r) && (r.journey_snapshot?.length ?? 0) > 0);
  if (pathRows.length === 0) return fail('no_path_row');

  const candidate = pathRows[pathRows.length - 1];
  const steps = candidate.journey_snapshot ?? [];

  // Validate the candidate snapshot itself (NOT the whole table's history).
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.redirect_link_id) {
      diagnostics.push(`step_without_link:${i}`);
      return fail('snapshot_invalid');
    }
    const link = linkById.get(s.redirect_link_id);
    if (!link) {
      diagnostics.push(`link_not_found:${i}`);
      return fail('link_missing');
    }
    if (link.link_type === 'checkout') {
      diagnostics.push(`checkout_inside_path:${i}`);
      return fail('snapshot_invalid');
    }
    if (s.video_id && link.video_id && s.video_id !== link.video_id) {
      diagnostics.push(`step_video_mismatch:${i}`); // redirect_links wins
    }
    const next = steps[i + 1];
    if (next && s.destination_video_id && next.video_id && s.destination_video_id !== next.video_id) {
      diagnostics.push(`chain_break:${i}`);
      return fail('snapshot_invalid');
    }
  }

  // Non-blocking diagnostics about the journey's history.
  const candLinks = steps.map((s) => s.redirect_link_id);
  for (const r of pathRows.slice(0, -1)) {
    const ids = (r.journey_snapshot ?? []).map((s) => s.redirect_link_id);
    if (ids.length > candLinks.length || ids.some((id, i) => id !== candLinks[i])) {
      diagnostics.push('history_not_prefix');
      break;
    }
  }
  const maxSteps = Math.max(...pathRows.map((r) => r.journey_snapshot?.length ?? 0));
  if (maxSteps > steps.length) diagnostics.push('candidate_shorter_than_longest');

  // Event evidence: link id → event timestamps (all rows incl. boundary rows).
  const evidence = new Map<string, number[]>();
  const seen = new Set<string>();
  for (const r of jrows) {
    for (const eid of r.event_ids ?? []) {
      if (seen.has(eid)) continue;
      seen.add(eid);
      const ev = eventById.get(eid);
      if (!ev?.redirect_link_id) continue;
      const t = Date.parse(ev.created_at);
      if (Number.isNaN(t)) continue;
      const arr = evidence.get(ev.redirect_link_id);
      if (arr) arr.push(t);
      else evidence.set(ev.redirect_link_id, [t]);
    }
  }

  // L0 and the structural upstream walk.
  let current = linkById.get(steps[0].redirect_link_id as string) as LinkRow;
  const pathRootId = current.id;
  const hops: string[] = [];
  const visited = new Set<string>([current.id]);

  for (let depth = 0; depth < MAX_UPSTREAM_DEPTH; depth++) {
    if (!current.token) break;
    const curHost = linkHost(current);
    const curTimes = evidence.get(current.id);
    const curFirst = curTimes && curTimes.length > 0 ? Math.min(...curTimes) : null;

    // Asset-based proof: the video that owns `current` has its OWN asset (videos.asset_id);
    // a landing_page link pointing at that asset is a structural parent.
    const curOwnAssetId = current.video_id ? ownAssetByVideoId.get(current.video_id) ?? null : null;
    const parents: { link: LinkRow; t: number; via: 'destination' | 'asset' }[] = [];
    for (const [linkId, times] of Array.from(evidence.entries())) {
      if (visited.has(linkId)) continue;
      const p = linkById.get(linkId);
      if (!p || p.link_type === 'checkout') continue;
      const dest = parseDestination(p.destination_url);
      const byDestination = !!dest && dest.host === curHost && dest.token === current.token;
      const byAsset =
        p.link_type === 'landing_page' &&
        !!curOwnAssetId &&
        p.asset_id === curOwnAssetId &&
        p.video_id !== current.video_id; // never a self-loop
      if (!byDestination && !byAsset) continue;
      const qualifying = curFirst === null ? times : times.filter((t) => t <= curFirst);
      if (qualifying.length === 0) continue;
      parents.push({ link: p, t: Math.max(...qualifying), via: byDestination ? 'destination' : 'asset' });
    }
    if (parents.length === 0) break;

    parents.sort((a, b) => b.t - a.t || a.link.id.localeCompare(b.link.id));
    if (parents.length > 1) diagnostics.push(`multiple_parents:${current.id}`);

    if (parents[0].via === 'asset') diagnostics.push(`hop_via_asset:${parents[0].link.id}`);
    current = parents[0].link;
    visited.add(current.id);
    hops.push(current.id);
    if (depth === MAX_UPSTREAM_DEPTH - 1) diagnostics.push('upstream_depth_limit');
  }

  if (!current.video_id) {
    return {
      ...fail('video_missing', pathRootId),
      startRedirectLinkId: current.id,
      upstreamHopLinkIds: hops,
    };
  }

  return {
    journeyId,
    status: hops.length > 0 ? 'resolved_with_upstream_hop' : 'resolved_path_only',
    startVideoId: current.video_id,
    startAssetId: current.asset_id ?? null,
    startRedirectLinkId: current.id,
    pathRootRedirectLinkId: pathRootId,
    upstreamHopLinkIds: hops,
    diagnostics,
  };
}

// ── batched entry point ─────────────────────────────────────────────────────

export async function resolveJourneyStarts(
  journeyIds: string[],
): Promise<Map<string, JourneyStartResolution>> {
  const out = new Map<string, JourneyStartResolution>();
  const ids = Array.from(new Set(journeyIds.filter(Boolean)));
  if (ids.length === 0) return out;

  // 1. all events_journey rows for these journeys
  const rows = await fetchRowsByIn<JourneyRow>(
    'events_journey',
    EVENTS_JOURNEY_COLUMNS,
    'journey_id',
    ids,
    JOURNEY_CHUNK,
  );
  const rowsByJourney = new Map<string, JourneyRow[]>();
  for (const r of rows) {
    const arr = rowsByJourney.get(r.journey_id);
    if (arr) arr.push(r);
    else rowsByJourney.set(r.journey_id, [r]);
  }

  // 2. event evidence (events referenced by any row's event_ids)
  const eventIds: string[] = [];
  for (const r of rows) for (const e of r.event_ids ?? []) eventIds.push(e);
  const events = await fetchRowsByIn<EventRow>(
    'events',
    'id, created_at, redirect_link_id',
    'id',
    eventIds,
  );
  const eventById = new Map(events.map((e) => [e.id, e]));

  // 3. every redirect link we may need: row links, snapshot links, event links
  const linkIds: string[] = [];
  for (const r of rows) {
    if (r.redirect_link_id) linkIds.push(r.redirect_link_id);
    for (const s of r.journey_snapshot ?? []) if (s.redirect_link_id) linkIds.push(s.redirect_link_id);
  }
  for (const e of events) if (e.redirect_link_id) linkIds.push(e.redirect_link_id);
  const links = await fetchRowsByIn<LinkRow>('redirect_links', LINK_COLUMNS, 'id', linkIds);
  const linkById = new Map(links.map((l) => [l.id, l]));

  // 3b. each link's video → that video's OWN asset (videos.asset_id), for the asset-based parent proof
  const linkVideoIds = Array.from(
    new Set(links.map((l) => l.video_id).filter((v): v is string => !!v)),
  );
  const videoRows = await fetchRowsByIn<{ id: string; asset_id: string | null }>(
    'videos',
    'id, asset_id',
    'id',
    linkVideoIds,
  );
  const ownAssetByVideoId = new Map(videoRows.map((v) => [v.id, v.asset_id] as const));

  // 4. pure per-journey resolution
  for (const journeyId of ids) {
    out.set(
      journeyId,
      resolveOne(journeyId, rowsByJourney.get(journeyId) ?? [], eventById, linkById, ownAssetByVideoId),
    );
  }
  return out;
}