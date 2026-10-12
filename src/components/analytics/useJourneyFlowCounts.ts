// ─────────────────────────────────────────────────────────────────────────────
// useJourneyFlowCounts.ts
//
// "Show Journey Flow": a count between adjacent videos on a journey strip.
// Shared by JourneyAnalytics and PartnerJourneySection.
//
// WHAT IS COUNTED (read this before relabelling anything):
//   For an adjacent pair  A → B  on a route:
//     1. destination asset  = videos.asset_id of B
//                             (already loaded: VideoDisplay.assetId — no query)
//     2. matching links     = ALL redirect_links where video_id = A.id AND
//                             asset_id = B's asset id. (video_id, asset_id) is
//                             NOT unique, so every match is collected and
//                             de-duplicated by id.
//     3. count              = events rows whose redirect_link_id is one of
//                             those ids AND whose event_type is in
//                             JOURNEY_FLOW_EVENT_TYPES, inside the page's
//                             selected date range (events.created_at).
//
//   An events row has exactly ONE redirect_link_id, so summing over a de-duped
//   id set cannot double-count an event within one pair.
//
// EVENT MEANING — NOT VERIFIED:
//   The tracking code that inserts these events (Track.tsx / tracker.ts /
//   redirects.ts) has NOT been inspected. Data shows events.event_type equals
//   redirect_links.link_type, but that does not prove 'landing_page' is a
//   redirect click. The UI therefore says "events", never "clicks".
//   If the real click event type turns out to be different, change
//   JOURNEY_FLOW_EVENT_TYPES below — it is the only place.
//
// QUERIES (batched, never one per transition):
//   • redirect_links  — chunked by SOURCE video id (80/chunk), paged by 1000
//   • events          — chunked by link id (100/chunk), paged by 1000,
//                       one narrow column (redirect_link_id), counted in JS
//   Only the pairs of the rows passed in (the rows on screen) are resolved,
//   and results are cached per (date range, dataset) so "show more" only
//   fetches pairs it has not seen yet.
//
// NO new analytics engine: this file does not touch journey discovery, route
// grouping, revenue attribution or owner resolution.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';

import { supabase } from '../../lib/supabase';
import { getDateBounds, type CustomDateRange, type DateRange } from '../../lib/analyticsEngine';

/** number = resolved pair (0 allowed); null = destination asset or link not resolvable. */
export type FlowCount = number | null;
export type FlowConnectorLabel = { text: string; title: string };

type FlowRoute = { path?: { steps?: Array<{ videoId?: string | null }> | null } | null };
type VideoAssets = ReadonlyMap<string, { assetId: string | null }>;
type Bounds = { start: Date; end: Date } | null;

/** The ONLY place that decides which events.event_type values are counted. */
export const JOURNEY_FLOW_EVENT_TYPES: string[] = ['landing_page'];

const PAGE_SIZE = 1000;
const SOURCE_CHUNK = 80;
const LINK_CHUNK = 100;
const EMPTY_COUNTS: Map<string, FlowCount> = new Map();

export function flowPairKey(fromVideoId: string, toVideoId: string): string {
  return `${fromVideoId}::${toVideoId}`;
}

/** Unique "A::B" keys for every adjacent pair of the given routes (first-seen order). */
export function flowPairKeysOf(routes: FlowRoute[]): string[] {
  const seen = new Set<string>();
  for (const r of routes) {
    const steps = r.path?.steps ?? [];
    for (let i = 0; i < steps.length - 1; i++) {
      const a = steps[i]?.videoId;
      const b = steps[i + 1]?.videoId;
      if (a && b) seen.add(flowPairKey(a, b));
    }
  }
  return Array.from(seen);
}

type PageResult = { data: any; error: { message: string } | null };

/** Thrown when a run is cancelled, so a partial page set can never be mistaken for a result. */
class FlowCancelled extends Error {
  constructor() {
    super('journey flow computation cancelled');
    this.name = 'FlowCancelled';
  }
}

/** Page through one query until a short page comes back (Supabase caps rows per request). */
async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult>,
  isCancelled: () => boolean,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    if (isCancelled()) throw new FlowCancelled();
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (isCancelled()) throw new FlowCancelled();
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    for (const r of rows) out.push(r);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * Core computation (no React). Returns one entry per requested pair key:
 *   null   → destination asset unknown, or no matching redirect link
 *   number → summed events over the de-duplicated matching link ids (0 allowed)
 */
export async function computeJourneyFlowCounts(opts: {
  pairKeys: string[];
  videoAssets: VideoAssets;
  bounds: Bounds;
  isCancelled?: () => boolean;
}): Promise<Map<string, FlowCount>> {
  const { pairKeys, videoAssets, bounds } = opts;
  const isCancelled = opts.isCancelled ?? (() => false);
  const out = new Map<string, FlowCount>();

  // 1) Destination asset per pair — from data already loaded (no query).
  const assetByPair = new Map<string, string>();
  for (const key of pairKeys) {
    const [, to] = key.split('::');
    const assetId = videoAssets.get(to)?.assetId ?? null;
    if (!assetId) out.set(key, null);
    else assetByPair.set(key, assetId);
  }
  if (assetByPair.size === 0) return out;

  // 2) All redirect_links of the source videos (batched), matched in JS by
  //    (video_id, asset_id). Every match is kept; ids are de-duplicated.
  const sourceIds = Array.from(new Set(Array.from(assetByPair.keys()).map((k) => k.split('::')[0])));
  const idsByVideoAsset = new Map<string, Set<string>>();
  for (let i = 0; i < sourceIds.length; i += SOURCE_CHUNK) {
    const chunk = sourceIds.slice(i, i + SOURCE_CHUNK);
    const rows = await fetchAllPages<{ id: string; video_id: string | null; asset_id: string | null }>(
      (from, to) =>
        supabase
          .from('redirect_links')
          .select('id, video_id, asset_id')
          .in('video_id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
      isCancelled,
    );
    for (const r of rows) {
      if (!r.id || !r.video_id || !r.asset_id) continue;
      const k = `${r.video_id}::${r.asset_id}`;
      const set = idsByVideoAsset.get(k) ?? new Set<string>();
      set.add(r.id);
      idsByVideoAsset.set(k, set);
    }
  }

  const linkIdsByPair = new Map<string, string[]>();
  const allLinkIds = new Set<string>();
  assetByPair.forEach((assetId, key) => {
    const [from] = key.split('::');
    const ids = idsByVideoAsset.get(`${from}::${assetId}`);
    if (!ids || ids.size === 0) {
      out.set(key, null); // destination known, but no matching redirect link
      return;
    }
    linkIdsByPair.set(key, Array.from(ids));
    ids.forEach((id) => allLinkIds.add(id));
  });

  // 3) Events per link id (batched). One narrow column, counted in JS.
  const countByLink = new Map<string, number>();
  const linkIdList = Array.from(allLinkIds);
  for (let i = 0; i < linkIdList.length; i += LINK_CHUNK) {
    const chunk = linkIdList.slice(i, i + LINK_CHUNK);
    const rows = await fetchAllPages<{ redirect_link_id: string | null }>((from, to) => {
      let q = supabase
        .from('events')
        .select('redirect_link_id')
        .in('redirect_link_id', chunk)
        .in('event_type', JOURNEY_FLOW_EVENT_TYPES);
      if (bounds) {
        q = q.gte('created_at', bounds.start.toISOString()).lte('created_at', bounds.end.toISOString());
      }
      return q.order('id', { ascending: true }).range(from, to);
    }, isCancelled);
    for (const r of rows) {
      if (!r.redirect_link_id) continue;
      countByLink.set(r.redirect_link_id, (countByLink.get(r.redirect_link_id) ?? 0) + 1);
    }
  }

  linkIdsByPair.forEach((ids, key) => {
    out.set(key, ids.reduce((sum, id) => sum + (countByLink.get(id) ?? 0), 0));
  });
  return out;
}

/**
 * Counts for the pairs of `routes` (pass only the rows on screen). Does nothing
 * until `enabled`. Date window = the page's selected range, applied to
 * events.created_at exactly like useRouteRevenueMetrics windows purchases.
 */
export function useJourneyFlowCounts(opts: {
  enabled: boolean;
  routes: FlowRoute[];
  videoAssets: VideoAssets;
  dateRange: DateRange;
  customRange: CustomDateRange | null;
}): { flowCounts: Map<string, FlowCount>; flowLoading: boolean } {
  const { enabled, routes, videoAssets, dateRange, customRange } = opts;
  const [flowCounts, setFlowCounts] = useState<Map<string, FlowCount>>(EMPTY_COUNTS);
  const [flowLoading, setFlowLoading] = useState(false);
  const cacheRef = useRef<{ assets: unknown; dateKey: string; map: Map<string, FlowCount> }>({
    assets: null,
    dateKey: '',
    map: new Map(),
  });

  // String key so the effect only re-runs when the set of pairs really changes
  // (the `routes` array identity changes on every render).
  const pairsKey = enabled ? flowPairKeysOf(routes).join('|') : '';
  const dateKey = `${dateRange}|${JSON.stringify(customRange ?? null)}`;

  useEffect(() => {
    if (!enabled || !pairsKey) {
      setFlowCounts(EMPTY_COUNTS);
      setFlowLoading(false);
      return;
    }

    if (cacheRef.current.assets !== videoAssets || cacheRef.current.dateKey !== dateKey) {
      cacheRef.current = { assets: videoAssets, dateKey, map: new Map() };
    }
    const cache = cacheRef.current.map;
    const wanted = pairsKey.split('|');
    const missing = wanted.filter((k) => !cache.has(k));

    const publish = () => {
      const next = new Map<string, FlowCount>();
      for (const k of wanted) {
        const v = cache.get(k);
        if (v !== undefined) next.set(k, v);
      }
      setFlowCounts(next);
    };

    if (missing.length === 0) {
      publish();
      setFlowLoading(false);
      return;
    }

    let cancelled = false;
    setFlowLoading(true);
    (async () => {
      try {
        const bounds = dateRange === 'all' ? null : getDateBounds(dateRange, customRange);
        const computed = await computeJourneyFlowCounts({
          pairKeys: missing,
          videoAssets,
          bounds,
          isCancelled: () => cancelled,
        });
        if (cancelled) return;
        computed.forEach((v, k) => cache.set(k, v));
      } catch (e) {
        // Cancelled runs are expected (filters/rows changed) and publish nothing.
        // Pairs that failed stay un-cached, so they render "—" (not 0) and are retried next time.
        if (!(e instanceof FlowCancelled)) console.error('[useJourneyFlowCounts] failed', e);
      } finally {
        if (!cancelled) {
          publish();
          setFlowLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // pairsKey/dateKey are the real inputs; videoAssets identity changes only when the dataset reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pairsKey, dateKey, videoAssets]);

  return { flowCounts, flowLoading };
}

/** English tooltip. Wording is deliberately "events", never "clicks" (see header). */
export function describeFlowCountEn(count: FlowCount): string {
  if (count === null) return 'Not measurable: destination asset or matching redirect link not found';
  return `${count.toLocaleString()} landing_page events on the redirect link(s) for this step (not verified as redirect clicks)`;
}

/** One label per gap between adjacent steps (index i = gap before step i + 1). */
export function flowConnectorLabels(
  route: FlowRoute,
  counts: ReadonlyMap<string, FlowCount>,
  loading: boolean,
  describe: (count: FlowCount) => string = describeFlowCountEn,
): FlowConnectorLabel[] {
  const steps = route.path?.steps ?? [];
  const labels: FlowConnectorLabel[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const a = steps[i]?.videoId;
    const b = steps[i + 1]?.videoId;
    if (!a || !b) {
      labels.push({ text: '—', title: describe(null) });
      continue;
    }
    const key = flowPairKey(a, b);
    if (!counts.has(key)) {
      labels.push(loading ? { text: '…', title: '' } : { text: '—', title: describe(null) });
      continue;
    }
    const c = counts.get(key) ?? null;
    labels.push({ text: c === null ? '—' : c.toLocaleString(), title: describe(c) });
  }
  return labels;
}
