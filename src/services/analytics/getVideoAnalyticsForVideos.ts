/**
 * services/analytics/getVideoAnalyticsForVideos.ts
 *
 * Video-level analytics for an explicit set of video ids (CampaignJourneyMap
 * Phase 1). This is an ORCHESTRATION wrapper only — it mirrors the fetch +
 * canonical-owner + engine pipeline InDepthAnalytics.fetchData() uses, because
 * that pipeline lives inline in the page component and is not exported.
 *
 * Reuses, unchanged:
 *   - applyCanonicalPurchaseOwners  (services/attribution) — revenue ownership
 *   - buildStripeFromPurchases / buildPixelPurchases / buildRedirectLinkLookup /
 *     flattenSessionEvents / mergeEventSources / getAnalyticsEngine
 *     (lib/analyticsEngine) — click / impression / revenue math
 *   - stripeRowsWithPositiveAmount (services/attribution/filterPurchasesByCreatedAt)
 *
 * Does NOT: implement attribution, dedupe Pixel vs Stripe, or touch the
 * click/impression engine.
 *
 * Deliberate differences from InDepthAnalytics (see report):
 *   1. If applyCanonicalPurchaseOwners THROWS, this returns an error and NO
 *      revenue — it does not fall back to the legacy purchase.video_id.
 *   2. Purchases the resolver left 'unresolved' are EXCLUDED from per-video
 *      revenue and only counted (unresolvedStripe / unresolvedPixel), so
 *      revenue is never silently owned by a legacy/wrong video.
 *   3. No session-lookup fallback for purchases without a video_id.
 *   4. Metrics window is all-time ('all'): the map's month selection picks
 *      WHICH videos (creation date); it does not window the metrics.
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
  type ProcessedVideoRow,
  type PixelPurchaseRow,
  type RawEvent,
  type StripePurchaseRow,
  type StripePurchasesRawRow,
} from '../../lib/analyticsEngine';
import { applyCanonicalPurchaseOwners } from '../attribution/applyCanonicalPurchaseOwners';
import { stripeRowsWithPositiveAmount } from '../attribution/filterPurchasesByCreatedAt';

export interface VideoMapAnalytics {
  videoId: string;
  /** Engine metrics exactly as InDepthAnalytics would show them (all-time, 'total' source). */
  metrics: ProcessedVideoRow;
}

export interface VideoMapAnalyticsResult {
  byVideoId: Map<string, VideoMapAnalytics>;
  /** Requested ids that were not returned by the videos query (not visible / not found). */
  missingVideoIds: string[];
  /** Purchases the canonical resolver could not own — excluded from revenue. */
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

export async function getVideoAnalyticsForVideos(videoIdsIn: string[]): Promise<VideoMapAnalyticsResult> {
  const videoIds = Array.from(new Set(videoIdsIn.filter(Boolean)));
  const empty: VideoMapAnalyticsResult = {
    byVideoId: new Map(),
    missingVideoIds: [],
    unresolvedStripe: 0,
    unresolvedPixel: 0,
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
  const unresolvedStripe = stripeOwnedAll.length - stripeOwned.length;
  const unresolvedPixel = owned.pixelPurchases.length - pixelOwned.length;

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

  // ── Engine (unchanged). all-time window; 'total' source = InDepth default ─
  const engineInput: AnalyticsEngineInput = {
    videos: videos as AnalyticsEngineInput['videos'],
    campaigns: campaigns as CampaignMeta[],
    rawEvents,
    stripePurchases: stripeBuilt,
    pixelPurchases: pixelBuilt,
    dateRange: 'all',
    customRange: null,
    selectedCampaignId: 'all',
    selectedGoals: [],
    selectedLeadMagnets: [],
    activeSource: 'total',
    includeEV: true,
    sortConfig: { key: 'total_revenue', direction: 'desc' },
  };
  const result = getAnalyticsEngine(engineInput);

  const byVideoId = new Map<string, VideoMapAnalytics>();
  for (const row of result.sortedVideos) {
    byVideoId.set(row.video.id, { videoId: row.video.id, metrics: row });
  }
  return { byVideoId, missingVideoIds, unresolvedStripe, unresolvedPixel };
}
