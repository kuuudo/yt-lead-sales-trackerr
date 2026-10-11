import { useEffect, useMemo, useState } from 'react';

import { supabase } from '../../lib/supabase';
import {
  getDateBounds,
  isRevenueCol,
  type CustomDateRange,
  type DateRange,
  type MetricType,
  type RevenueView,
  type VideoMetricsResult,
} from '../../lib/analyticsEngine';
import {
  computeJourneyRouteRevenueMetrics,
  mergeRouteClicksIntoMetrics,
  type RouteLike,
} from '../../services/attribution/journeyRouteRevenue';
import { computeJourneyRouteClickMetrics } from '../../services/attribution/journeyRouteClicks';
import type {
  StripePurchaseOwnerInput,
  PixelPurchaseOwnerInput,
} from '../../services/attribution/resolveConversionOwners';

const ID_CHUNK = 100;
const PAGE_SIZE = 1000;
const EMPTY_METRICS: Map<string, VideoMetricsResult> = new Map();

type RouteClickMap = Awaited<ReturnType<typeof computeJourneyRouteClickMetrics>>;
const EMPTY_CLICKS = new Map() as unknown as RouteClickMap;

const STRIPE_COLUMNS =
  'id, session_id, token, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id, conversion_id, revenue_type';
const PIXEL_COLUMNS =
  'id, event_id, session_id, video_id, campaign_id, amount, event_type, created_at, asset_id, conversion_id, organization_id, promotion_id';

type RevenueRoute = RouteLike & {
  path?: { steps?: Array<{ videoId?: string | null }> | null } | null;
};

type PageResult = { data: any; error: { message: string } | null };

/** Page through one query until a short page comes back (Supabase caps rows per request). */
async function fetchPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult>,
  isCancelled: () => boolean,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    if (isCancelled()) return out;
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    for (const r of rows) out.push(r);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Fallback: purchases whose stored video_id is one of the route path videos. */
async function fetchChunkedByVideo<T>(
  fetchPage: (chunk: string[], from: number, to: number) => PromiseLike<PageResult>,
  ids: string[],
  isCancelled: () => boolean,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const rows = await fetchPaged<T>((from, to) => fetchPage(chunk, from, to), isCancelled);
    for (const r of rows) out.push(r);
  }
  return out;
}

/** Org-scoped fetch first; fall back to path-video fetch on error or when it returns nothing. */
async function orgScopedWithFallback<T>(
  label: string,
  primary: () => Promise<T[]>,
  fallback: () => Promise<T[]>,
): Promise<T[]> {
  try {
    const rows = await primary();
    if (rows.length > 0) return rows;
    console.warn(`[useRouteRevenueMetrics] ${label}: org-scoped fetch returned 0 rows; falling back to path video ids`);
  } catch (e) {
    console.warn(`[useRouteRevenueMetrics] ${label}: org-scoped fetch failed; falling back to path video ids`, e);
  }
  return fallback();
}

/**
 * Journey-linked Revenue per route (TRUE START journeyId in memberJourneyIds)
 * + journey-scoped clicks (events_journey.event_ids -> events), merged per route.
 */
export function useRouteRevenueMetrics(opts: {
  orgId: string | null;
  journeys: RevenueRoute[];
  dateRange: DateRange;
  customRange: CustomDateRange | null;
  activeSource: RevenueView;
}): { routeMetrics: Map<string, VideoMetricsResult>; metricsLoading: boolean } {
  const { orgId, journeys, dateRange, customRange, activeSource } = opts;

  const [purchases, setPurchases] = useState<{
    stripe: StripePurchaseOwnerInput[];
    pixel: PixelPurchaseOwnerInput[];
  } | null>(null);
  const [revMap, setRevMap] = useState<Map<string, VideoMetricsResult>>(EMPTY_METRICS);
  const [clickMap, setClickMap] = useState<RouteClickMap>(EMPTY_CLICKS);
  const [fetching, setFetching] = useState(false);
  const [computing, setComputing] = useState(false);
  const [clicksLoading, setClicksLoading] = useState(false);

  const videoIds = useMemo(
    () =>
      Array.from(
        new Set(
          journeys.flatMap(
            (j) => (j.path?.steps ?? []).map((s) => s.videoId).filter(Boolean) as string[],
          ),
        ),
      ),
    [journeys],
  );

  // 1) Fetch purchases (re-runs only when org / route videos / date window change).
  useEffect(() => {
    if (!orgId || videoIds.length === 0) {
      setPurchases(null);
      setRevMap(EMPTY_METRICS);
      setFetching(false);
      return;
    }
    let cancelled = false;
    const isCancelled = () => cancelled;
    setFetching(true);

    // Purchases are filtered by their OWN timestamp (route rows are not date-filtered).
    const bounds = dateRange === 'all' ? null : getDateBounds(dateRange, customRange);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windowed = (q: any) =>
      bounds
        ? q.gte('created_at', bounds.start.toISOString()).lte('created_at', bounds.end.toISOString())
        : q;

    (async () => {
      try {
        const [stripe, pixel] = await Promise.all([
          orgScopedWithFallback<StripePurchaseOwnerInput>(
            'stripe_purchases',
            () =>
              fetchPaged<StripePurchaseOwnerInput>(
                (from, to) =>
                  windowed(
                    supabase.from('stripe_purchases').select(STRIPE_COLUMNS).eq('organization_id', orgId),
                  )
                    .order('id', { ascending: true })
                    .range(from, to),
                isCancelled,
              ),
            () =>
              fetchChunkedByVideo<StripePurchaseOwnerInput>(
                (chunk, from, to) =>
                  windowed(supabase.from('stripe_purchases').select(STRIPE_COLUMNS).in('video_id', chunk))
                    .order('id', { ascending: true })
                    .range(from, to),
                videoIds,
                isCancelled,
              ),
          ),
          orgScopedWithFallback<PixelPurchaseOwnerInput>(
            'pixel_purchases',
            () =>
              fetchPaged<PixelPurchaseOwnerInput>(
                (from, to) =>
                  windowed(
                    supabase.from('pixel_purchases').select(PIXEL_COLUMNS).eq('organization_id', orgId),
                  )
                    .order('id', { ascending: true })
                    .range(from, to),
                isCancelled,
              ),
            () =>
              fetchChunkedByVideo<PixelPurchaseOwnerInput>(
                (chunk, from, to) =>
                  windowed(supabase.from('pixel_purchases').select(PIXEL_COLUMNS).in('video_id', chunk))
                    .order('id', { ascending: true })
                    .range(from, to),
                videoIds,
                isCancelled,
              ),
          ),
        ]);
        if (cancelled) return;
        setPurchases({ stripe, pixel });
      } catch (e) {
        console.error('[useRouteRevenueMetrics] purchase fetch failed', e);
        if (!cancelled) {
          setPurchases(null);
          setRevMap(EMPTY_METRICS);
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, videoIds, dateRange, customRange]);

  // 2) Revenue per route (re-runs on source toggle without refetching purchases).
  useEffect(() => {
    if (!purchases) {
      setComputing(false);
      return;
    }
    let cancelled = false;
    setComputing(true);

    (async () => {
      try {
        const metrics = await computeJourneyRouteRevenueMetrics({
          routes: journeys,
          stripePurchases: purchases.stripe,
          pixelPurchases: purchases.pixel,
          activeSource,
          includeEV: true,
        });
        if (!cancelled) setRevMap(metrics);
      } catch (e) {
        console.error('[useRouteRevenueMetrics] route revenue failed', e);
        if (!cancelled) setRevMap(EMPTY_METRICS);
      } finally {
        if (!cancelled) setComputing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purchases, journeys, activeSource]);

  // 3) Journey-scoped clicks (independent of purchases; follows the date window).
  useEffect(() => {
    if (!orgId || journeys.length === 0) {
      setClickMap(EMPTY_CLICKS);
      setClicksLoading(false);
      return;
    }
    let cancelled = false;
    setClicksLoading(true);

    (async () => {
      try {
        const clicks = await computeJourneyRouteClickMetrics({
          routes: journeys,
          dateRange,
          customRange,
        });
        if (!cancelled) setClickMap(clicks);
      } catch (e) {
        console.error('[useRouteRevenueMetrics] route clicks failed', e);
        if (!cancelled) setClickMap(EMPTY_CLICKS);
      } finally {
        if (!cancelled) setClicksLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, journeys, dateRange, customRange]);

  const routeMetrics = useMemo(
    () => mergeRouteClicksIntoMetrics(revMap, clickMap),
    [revMap, clickMap],
  );

  return { routeMetrics, metricsLoading: fetching || computing || clicksLoading };
}

/** Table cell text for one metric column. Counts show 0 as 0; rpc shows "—" when it is 0. */
export function formatRouteMetricCell(
  key: MetricType,
  metrics: VideoMetricsResult | undefined,
  loading: boolean,
): string {
  if (loading) return '…';
  const raw = metrics ? (metrics as unknown as Record<string, unknown>)[key] : null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return '—';
  if (key === 'rpc' && raw === 0) return '—'; // no reliable rpc when no clicks or no revenue
  if (isRevenueCol(key)) {
    return raw.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    });
  }
  return raw.toLocaleString();
}

/** Total journey-scoped clicks across the five click columns. */
export function routeClickTotal(metrics: VideoMetricsResult | undefined): number {
  if (!metrics) return 0;
  return (
    (metrics.landing_page_view ?? 0) +
    (metrics.lead_magnet_click ?? 0) +
    (metrics.newsletter_click ?? 0) +
    (metrics.call_booking_click ?? 0) +
    (metrics.consultation_click ?? 0)
  );
}

/** Card-row revenue chip: amount only when > 0; "—" means no journey-linked formal amount. */
export function routeRevenueDisplay(
  metrics: VideoMetricsResult | undefined,
  loading: boolean,
): { text: string; hasRevenue: boolean } {
  if (loading) return { text: '…', hasRevenue: false };
  const tr = metrics?.total_revenue;
  if (typeof tr === 'number' && Number.isFinite(tr) && tr > 0) {
    return {
      text: tr.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }),
      hasRevenue: true,
    };
  }
  return { text: '—', hasRevenue: false };
}