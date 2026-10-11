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
  type RouteLike,
} from '../../services/attribution/journeyRouteRevenue';
import type {
  StripePurchaseOwnerInput,
  PixelPurchaseOwnerInput,
} from '../../services/attribution/resolveConversionOwners';

const ID_CHUNK = 100;
const PAGE_SIZE = 1000;
const EMPTY_METRICS: Map<string, VideoMetricsResult> = new Map();

const STRIPE_COLUMNS =
  'id, session_id, token, video_id, campaign_id, amount, created_at, redirect_link_id, redirect_link_token, organization_id, conversion_id, revenue_type';
const PIXEL_COLUMNS =
  'id, event_id, session_id, video_id, campaign_id, amount, event_type, created_at, asset_id, conversion_id, organization_id, promotion_id';

type RevenueRoute = RouteLike & {
  path?: { steps?: Array<{ videoId?: string | null }> | null } | null;
};

type PageResult = { data: any; error: { message: string } | null };

/** Fetch every row for a set of video ids: chunked `.in()` + paginated `.range()`. */
async function fetchAllChunked<T>(
  fetchPage: (chunk: string[], from: number, to: number) => PromiseLike<PageResult>,
  ids: string[],
  isCancelled: () => boolean,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      if (isCancelled()) return out;
      const { data, error } = await fetchPage(chunk, from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
  }
  return out;
}

/**
 * Journey-linked Revenue per route (TRUE START journeyId in memberJourneyIds).
 * Clicks are not joined (would double-count shared videos across routes).
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
  const [routeMetrics, setRouteMetrics] = useState<Map<string, VideoMetricsResult>>(EMPTY_METRICS);
  const [fetching, setFetching] = useState(false);
  const [computing, setComputing] = useState(false);

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

  // 1) Fetch purchases (only re-runs when org / route videos / date window change).
  useEffect(() => {
    if (!orgId || videoIds.length === 0) {
      setPurchases(null);
      setRouteMetrics(EMPTY_METRICS);
      setFetching(false);
      return;
    }
    let cancelled = false;
    setFetching(true);

    (async () => {
      try {
        const [stripeRows, pixelRows] = await Promise.all([
          fetchAllChunked<StripePurchaseOwnerInput>(
            (chunk, from, to) =>
              supabase
                .from('stripe_purchases')
                .select(STRIPE_COLUMNS)
                .in('video_id', chunk)
                .order('id', { ascending: true })
                .range(from, to),
            videoIds,
            () => cancelled,
          ),
          fetchAllChunked<PixelPurchaseOwnerInput>(
            (chunk, from, to) =>
              supabase
                .from('pixel_purchases')
                .select(PIXEL_COLUMNS)
                .in('video_id', chunk)
                .order('id', { ascending: true })
                .range(from, to),
            videoIds,
            () => cancelled,
          ),
        ]);
        if (cancelled) return;

        // Purchases are filtered by their OWN timestamp (route rows are not date-filtered).
        const { start, end } = getDateBounds(dateRange, customRange);
        const inWindow = (created_at: string | null | undefined) => {
          if (dateRange === 'all') return true;
          if (!created_at) return false;
          const t = new Date(created_at);
          return !Number.isNaN(t.getTime()) && t >= start && t <= end;
        };

        setPurchases({
          stripe: stripeRows.filter((p) => inWindow(p.created_at)),
          pixel: pixelRows.filter((p) => inWindow(p.created_at)),
        });
      } catch (e) {
        console.error('[useRouteRevenueMetrics] purchase fetch failed', e);
        if (!cancelled) {
          setPurchases(null);
          setRouteMetrics(EMPTY_METRICS);
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, videoIds, dateRange, customRange]);

  // 2) Compute per-route metrics (re-runs on source toggle without refetching).
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
        if (!cancelled) setRouteMetrics(metrics);
      } catch (e) {
        console.error('[useRouteRevenueMetrics] route revenue failed', e);
        if (!cancelled) setRouteMetrics(EMPTY_METRICS);
      } finally {
        if (!cancelled) setComputing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purchases, journeys, activeSource]);

  return { routeMetrics, metricsLoading: fetching || computing };
}

/** Columns that cannot be computed per route (clicks are not joined; rpc = revenue / clicks). */
const UNAVAILABLE_KEYS = new Set<MetricType>([
  'landing_page_view',
  'lead_magnet_click',
  'newsletter_click',
  'call_booking_click',
  'consultation_click',
  'rpc',
]);

export function formatRouteMetricCell(
  key: MetricType,
  metrics: VideoMetricsResult | undefined,
  loading: boolean,
): string {
  if (UNAVAILABLE_KEYS.has(key)) return '—';
  if (loading) return '…';
  const raw = metrics ? (metrics as unknown as Record<string, unknown>)[key] : null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return '—';
  if (isRevenueCol(key)) {
    return raw.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    });
  }
  return raw.toLocaleString();
}