/**
 * services/analytics/getVideoAnalyticsForVideos.ts
 *
 * Video-level analytics for an explicit set of video ids (CampaignJourneyMap).
 * ORCHESTRATION wrapper only — it mirrors the fetch + canonical-owner + engine
 * pipeline InDepthAnalytics.fetchData() uses, because that pipeline lives inline
 * in the page component and is not exported.
 *
 * Two steps so the analytics date range can change WITHOUT refetching:
 *   1. loadVideoAnalyticsInputs(videoIds)  — fetch all-time rows, apply canonical
 *      purchase owners, enrich. No date filtering here.
 *   2. computeVideoAnalytics(inputs, dateRange, customRange) — pure; applies the
 *      engine's own date convention exactly as InDepthAnalytics does
 *      (filterPurchasesByCreatedAt for purchases + getAnalyticsEngine, which
 *      date-filters events) and returns one engine row per video.
 *
 * Reuses, unchanged: applyCanonicalPurchaseOwners, buildStripeFromPurchases,
 * buildPixelPurchases, buildRedirectLinkLookup, flattenSessionEvents,
 * mergeEventSources, getAnalyticsEngine, filterPurchasesByCreatedAt,
 * stripeRowsWithPositiveAmount.
 *
 * Does NOT: implement attribution, dedupe Pixel vs Stripe, or touch the
 * click/impression engine.
 *
 * Deliberate differences from InDepthAnalytics:
 *   1. If applyCanonicalPurchaseOwners THROWS, loadVideoAnalyticsInputs rejects —
 *      there is NO fallback to the legacy purchase.video_id.
 *   2. Purchases the resolver left 'unresolved' are EXCLUDED from per-video
 *      revenue and only counted, so revenue is never owned by a legacy video_id.
 *   3. No session-lookup fallback for purchases without a video_id.
 */

import { supabase } from '../../lib/supabase';
import {
  getAnalyticsEngine,
  buildStripeFromPurchases,
  buildPixelPurchases,
  buildRedirectLinkLookup,
  flattenSessionEvents,
  mergeEventSources,
  type AnalyticsEngineInput,
  type CampaignMeta,
  type CustomDateRange,
  type DateRange,
  type ProcessedVideoRow,
  type PixelPurchaseRow,
  type RawEvent,
  type StripePurchaseRow,
  type StripePurchasesRawRow,
} from '../../lib/analyticsEngine';
import { applyCanonicalPurchaseOwners } from '../attribution/applyCanonicalPurchaseOwners';
import {
  filterPurchasesByCreatedAt,
  stripeRowsWithPositiveAmount,
} from '../attribution/filterPurchasesByCreatedAt';

type WithDate<T> = T & { created_at?: string | null };

/** All-time, canonically-owned, enriched inputs — date filtering happens later. */
export interface VideoAnalyticsInputs {
  videos: any[];
  campaigns: any[];
  rawEvents: RawEvent[];
  stripePurchases: Array<WithDate<StripePurchaseRow>>;
  pixelPurchases: Array<WithDate<PixelPurchaseRow>>;
  /** Requested ids not returned by the videos query (not visible / not found). */
  missingVideoIds: string[];
  /** created_at of purchases the canonical resolver could not own (excluded from revenue). */
  unresolvedStripe: Array<{ created_at: string }>;
  unresolvedPixel: Array<{ created_at: string }>;
  /** true = the events->sessions query failed; only direct events are counted. */
  sessionEventsUnavailable: boolean;
}

export interface VideoAnalyticsComputed {
  /** One engine row per found video, for the given date range. */
  byVideoId: Map<string, ProcessedVideoRow>;
  /** Unattributed purchases inside the same date range (excluded from revenue). */
  unresolvedStripe: number;
  unresolvedPixel: number;
}

const CHUNK = 100;
const PAGE = 1000;

function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Pages through a query (PostgREST caps at 1000 rows by default). */
async function fetchAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function dedupeById<T extends { id?: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.id) return true;
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

export async function loadVideoAnalyticsInputs(videoIdsIn: string[]): Promise<VideoAnalyticsInputs> {
  const videoIds = Array.from(new Set(videoIdsIn.filter(Boolean)));
  const empty: VideoAnalyticsInputs = {
    videos: [],
    campaigns: [],
    rawEvents: [],
    stripePurchases: [],
    pixelPurchases: [],
    missingVideoIds: [],
    unresolvedStripe: [],
    unresolvedPixel: [],
    sessionEventsUnavailable: false,
  };
  if (videoIds.length === 0) return empty;

  // ── Videos + campaigns (engine input) ────────────────────────────────────
  const videos: any[] = [];
  for (const ids of chunk(videoIds)) {
    const { data, error } = await supabase.from('videos').select('*').in('id', ids);
    if (error) throw error;
    videos.push(...(data ?? []));
  }
  const foundIds = new Set(videos.map((v) => v.id));
  const missingVideoIds = videoIds.filter((id) => !foundIds.has(id));
  if (videos.length === 0) return { ...empty, missingVideoIds };

  const campaignIds = Array.from(new Set(videos.map((v) => v.campaign_id).filter(Boolean))) as string[];
  const campaigns: any[] = [];
  for (const ids of chunk(campaignIds)) {
    const { data, error } = await supabase.from('campaigns').select('*').in('id', ids);
    if (error) throw error;
    campaigns.push(...(data ?? []));
  }

  // ── Events (same two sources as InDepthAnalytics) ────────────────────────
  const eventsDirect: any[] = [];
  const eventsViaSession: any[] = [];
  let sessionEventsUnavailable = false;
  for (const ids of chunk(videoIds)) {
    eventsDirect.push(
      ...(await fetchAll((from, to) =>
        supabase
          .from('events')
          .select('video_id, campaign_id, event_type, created_at')
          .in('video_id', ids)
          .order('created_at', { ascending: true })
          .range(from, to),
      )),
    );
    try {
      eventsViaSession.push(
        ...(await fetchAll((from, to) =>
          supabase
            .from('events')
            .select('event_type, created_at, sessions!inner(video_id, campaign_id)')
            .is('video_id', null)
            .in('sessions.video_id', ids)
            .order('created_at', { ascending: true })
            .range(from, to),
        )),
      );
    } catch (e) {
      sessionEventsUnavailable = true;
      console.warn('[VideoAnalytics] events via sessions unavailable:', e);
    }
  }
  const rawEvents: RawEvent[] = mergeEventSources(eventsDirect as RawEvent[], flattenSessionEvents(eventsViaSession));

  // ── Purchases (same scope as InDepthAnalytics: video OR campaign) ────────
  const stripeSelect =
    'id, video_id, campaign_id, amount, session_id, redirect_link_id, redirect_link_token, token, created_at';
  const stripeRows: any[] = [];
  // Same scope as InDepthAnalytics (video_id OR campaign_id), split into two
  // chunked queries so URLs stay short; results are de-duplicated by id below.
  for (const ids of chunk(videoIds)) {
    stripeRows.push(
      ...(await fetchAll((from, to) =>
        supabase
          .from('stripe_purchases')
          .select(stripeSelect)
          .in('video_id', ids)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      )),
    );
  }
  for (const ids of chunk(campaignIds)) {
    stripeRows.push(
      ...(await fetchAll((from, to) =>
        supabase
          .from('stripe_purchases')
          .select(stripeSelect)
          .in('campaign_id', ids)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      )),
    );
  }
  const pixelRows: any[] = [];
  for (const ids of chunk(campaignIds)) {
    pixelRows.push(
      ...(await fetchAll((from, to) =>
        supabase
          .from('pixel_purchases')
          .select('id, video_id, campaign_id, amount, event_type, session_id, event_id, created_at')
          .in('campaign_id', ids)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      )),
    );
  }
  const stripeData = dedupeById(stripeRows);
  const pixelData = dedupeById(pixelRows);

  // redirect_link_token → link_type (revenue_type classification, as InDepth)
  const tokens = Array.from(
    new Set(stripeData.map((r) => r.redirect_link_token).filter((t): t is string => !!t)),
  );
  const rlRows: any[] = [];
  for (const ids of chunk(tokens)) {
    const { data, error } = await supabase.from('redirect_links').select('token, link_type').in('token', ids);
    if (error) throw error;
    rlRows.push(...(data ?? []));
  }
  const redirectLinkLookup = buildRedirectLinkLookup(rlRows);

  // ── Canonical ownership — NO legacy fallback on failure ──────────────────
  const owned = await applyCanonicalPurchaseOwners({
    stripePurchases: stripeData.map((r) => ({
      id: r.id,
      session_id: r.session_id ?? null,
      token: r.token ?? r.redirect_link_token ?? null,
      video_id: r.video_id ?? null,
      campaign_id: r.campaign_id ?? null,
      amount: r.amount,
      created_at: r.created_at,
      redirect_link_id: r.redirect_link_id ?? null,
      redirect_link_token: r.redirect_link_token ?? null,
    })),
    pixelPurchases: pixelData.map((r) => ({
      id: r.id,
      event_id: r.event_id ?? null,
      session_id: r.session_id ?? null,
      video_id: r.video_id ?? null,
      campaign_id: r.campaign_id ?? null,
      amount: r.amount,
      event_type: r.event_type ?? null,
      created_at: r.created_at,
    })),
  });

  // Exclude rows the resolver could not own (applyCanonicalPurchaseOwners leaves
  // their legacy video_id in place — we must not let that become revenue).
  const isOwned = (p: { _canonicalOwner?: { attributionReason: string; ownerVideoId: string | null } }) =>
    !!p._canonicalOwner && p._canonicalOwner.attributionReason !== 'unresolved' && !!p._canonicalOwner.ownerVideoId;

  const stripeOwnedAll = owned.stripePurchases;
  const stripeOwned = stripeOwnedAll.filter(isOwned);
  const pixelOwned = owned.pixelPurchases.filter(isOwned);
  const unresolvedStripe = stripeOwnedAll.filter((p) => !isOwned(p)).map((p) => ({ created_at: p.created_at }));
  const unresolvedPixel = owned.pixelPurchases.filter((p) => !isOwned(p)).map((p) => ({ created_at: p.created_at }));

  // Same enrichment + created_at re-attachment as InDepthAnalytics (index-aligned).
  const stripePositive = stripeRowsWithPositiveAmount(stripeOwned);
  const stripeBuilt: StripePurchaseRow[] = buildStripeFromPurchases(
    stripePositive.map(
      (p): StripePurchasesRawRow => ({
        video_id: p.video_id,
        campaign_id: p.campaign_id ?? null,
        amount: p.amount,
        session_id: p.session_id ?? null,
        redirect_link_id: p.redirect_link_id ?? null,
        redirect_link_token: p.redirect_link_token ?? null,
      }),
    ),
    redirectLinkLookup,
    {}, // no session-lookup fallback: ownership comes only from the canonical resolver
  );
  const nStripe = Math.min(stripeBuilt.length, stripePositive.length);
  if (stripeBuilt.length !== stripePositive.length) {
    console.warn('[VideoAnalytics] stripe enrichment length mismatch', stripeBuilt.length, stripePositive.length);
  }
  const stripePurchases = stripeBuilt
    .slice(0, nStripe)
    .map((row, i) => ({ ...row, created_at: stripePositive[i]?.created_at ?? null }));

  const pixelBuilt: PixelPurchaseRow[] = buildPixelPurchases(
    pixelOwned.map((p) => ({
      video_id: p.video_id,
      campaign_id: p.campaign_id ?? null,
      amount: p.amount,
      event_type: p.event_type,
      session_id: p.session_id,
    })),
    {},
  );
  const pixelPurchases = pixelBuilt.map((row, i) => ({ ...row, created_at: pixelOwned[i]?.created_at ?? null }));

  return { videos, campaigns, rawEvents, stripePurchases, pixelPurchases, missingVideoIds, unresolvedStripe, unresolvedPixel, sessionEventsUnavailable };
}

/**
 * Pure. Same date convention as InDepthAnalytics: purchases are filtered by
 * created_at with filterPurchasesByCreatedAt; the engine date-filters events with
 * the same range. activeSource 'total' / includeEV true = InDepth defaults.
 */
export function computeVideoAnalytics(
  inputs: VideoAnalyticsInputs,
  dateRange: DateRange,
  customRange: CustomDateRange | null,
): VideoAnalyticsComputed {
  if (inputs.videos.length === 0) return { byVideoId: new Map(), unresolvedStripe: 0, unresolvedPixel: 0 };

  const engineInput: AnalyticsEngineInput = {
    videos: inputs.videos as AnalyticsEngineInput['videos'],
    campaigns: inputs.campaigns as CampaignMeta[],
    rawEvents: inputs.rawEvents,
    stripePurchases: filterPurchasesByCreatedAt(inputs.stripePurchases, dateRange, customRange),
    pixelPurchases: filterPurchasesByCreatedAt(inputs.pixelPurchases, dateRange, customRange),
    dateRange,
    customRange,
    selectedCampaignId: 'all',
    selectedGoals: [],
    selectedLeadMagnets: [],
    activeSource: 'total',
    includeEV: true,
    sortConfig: { key: 'total_revenue', direction: 'desc' },
  };
  const result = getAnalyticsEngine(engineInput);

  const byVideoId = new Map<string, ProcessedVideoRow>();
  for (const row of result.sortedVideos) byVideoId.set(row.video.id, row);

  return {
    byVideoId,
    unresolvedStripe: filterPurchasesByCreatedAt(inputs.unresolvedStripe, dateRange, customRange).length,
    unresolvedPixel: filterPurchasesByCreatedAt(inputs.unresolvedPixel, dateRange, customRange).length,
  };
}