// ─────────────────────────────────────────────────────────────────────────────
// JourneyAnalytics.tsx
// Route: /analytics/journey
//
// Membership = Videos.tsx organization content universe
//   (organization_id + deleted_at IS NULL). Discovery is enrichment only:
//   observed multi-hop paths stay full rows; videos with no journey evidence
//   become singleton [Video] rows. Asset filters are row-level only.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronDown,
  Loader2,
  BarChart3,
  X,
  Calendar,
  Filter,
  Briefcase,
  Megaphone,
  User,
  Check,
} from 'lucide-react';

import { Campaign, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useViewing } from '../lib/ViewingContext';
import { useOrganization } from '../lib/useOrganization';
import { resolveThumbnail } from '../lib/videoFormatters';
import {
  getDateBounds,
  TABLE_COLUMNS,
  COLUMN_LABELS,
  type DateRange,
  type CustomDateRange,
  type RevenueView,
  type MetricType,
} from '../lib/analyticsEngine';
import { PLATFORM_CONFIG, type Platform } from '../lib/platformParser';
import {
  discoverJourneysForVideos,
  type DiscoveredJourney,
} from '../lib/journeyDiscovery';
import {
  resolveStructuralLinksForVideos,
  type StructuralLink,
} from '../services/journey/journeyDownstreamResolver';

import { groupJourneysByRoute, type RouteJourney } from '../lib/journeyRouteGrouping';

import JourneyStrip, {
  type JourneyStripStep,
  type AssetScopeTag,
} from '../components/analytics/JourneyStrip';
import {
  getPromotionAssignmentGroups,
  type PromotionAssignmentGroups,
  type AssignmentGroup,
} from '../services/promotion/getPromotionAssignmentGroups';
import { useAnalyticsMobileLayout } from './analytics-lego/useAnalyticsMobileLayout';
import { AnalyticsMobileViewToggle } from './analytics-lego/AnalyticsMobileViewToggle';
import {
  AnalyticsMobileFilterButton,
  AnalyticsMobileFilterSheet,
} from './analytics-lego/AnalyticsMobileFilterSheet';
/** Batch size for discoverJourneysForVideos — not a membership gate. */
const DISCOVERY_BATCH = 50;

export const JOURNEY_ANALYTICS_EXTRA = [
  { key: 'type', label: 'Type' },
  { key: 'promotion', label: 'Promotion' },
  { key: 'asset_campaign', label: 'Asset Campaign' },
  { key: 'content_campaign', label: 'Content Campaign' },
  { key: 'asset_clicks', label: 'Asset Clicks' },
  { key: 'downstream', label: 'Downstream' },
  { key: 'total_revenue_front', label: 'Total Revenue ($)' },
] as const;

function elementTypeToWebmood(elementType: string | null | undefined): string | null {
  if (!elementType) return null;
  const t = elementType.toLowerCase();
  if (t === 'sales_call' || t === 'sales') return 'sales_call';
  if (t === 'consultation' || t === 'consult') return 'consultation';
  if (t === 'newsletter' || t === 'news') return 'newsletter';
  if (
    t === 'landing_page' ||
    t === 'landing' ||
    t === 'purchase' ||
    t === 'direct_purchase'
  )
    return 'landing_page';
  return null;
}

/** Same taxonomy as assetAnalyticsColumns.toAssetTypeTag */
function toAssetTypeTag(assetType: string | null | undefined): string | null {
  if (!assetType) return null;
  if (assetType === 'campaign_element') return 'campaign_element';
  if (assetType === 'resource') return 'resource';
  if (assetType === 'video') return 'promotional_video';
  return 'content_video';
}

export const ASSET_TYPE_OPTIONS = [
  { value: 'campaign_element', label: 'Campaign Element' },
  { value: 'promotional_video', label: 'Promotional Video' },
  { value: 'resource', label: 'Resource' },
  { value: 'content_video', label: 'Content Video' },
] as const;

export const SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'my', label: 'My' },
  { value: 'shared', label: 'Shared' },
  { value: 'assigned', label: 'Assigned' },
] as const;

// ── Org + campaigns + promotions ────────────────────────────────────────────

export function useCampaignOptions(viewerId: string | null): Campaign[] {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', viewerId)
      .then(({ data }) => {
        if (!cancelled) setCampaigns(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId]);
  return campaigns;
}

export type PromotionOption = { id: string; name: string };

/** Fetch rows from `table` by primary key, in chunks. Errors are logged, never swallowed. */
async function fetchRowsByIds(
  table: string,
  columns: string,
  ids: string[],
): Promise<any[]> {
  const CHUNK = 80;
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in('id', ids.slice(i, i + CHUNK));
    if (error) {
      console.warn(`[JourneyAnalytics] ${table} load failed`, error.message);
      continue;
    }
    rows.push(...((data ?? []) as any[]));
  }
  return rows;
}

/**
 * Promotion options come ONLY from promotion ids already present on the loaded
 * journeys' Asset steps (VideoDisplay.promotionIds) — the exact data the
 * Promotion filter matches against. So every option is selectable, matches at
 * least one journey, and visibility is never widened beyond what is already
 * on screen (no organization-wide or unscoped promotions query).
 *
 * `promotions` has NO title / name column. Display name is resolved as:
 *   promotions.assignment_id → assignments.title
 *   else promotions.campaign_id → campaigns.campaign_name
 *   else "Promotion XXXXXXXX" (first 8 chars of the id)
 */
export function usePromotionOptions(promotionIds: string[]): PromotionOption[] {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const idsKey = promotionIds.join(',');

  useEffect(() => {
    if (promotionIds.length === 0) {
      setNames(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const promoRows = await fetchRowsByIds(
        'promotions',
        'id, assignment_id, campaign_id',
        promotionIds,
      );
      const assignmentIds = Array.from(
        new Set(promoRows.map((p) => p.assignment_id as string | null).filter(Boolean) as string[]),
      );
      const campaignIds = Array.from(
        new Set(promoRows.map((p) => p.campaign_id as string | null).filter(Boolean) as string[]),
      );
      const [assignmentRows, campaignRows] = await Promise.all([
        assignmentIds.length > 0
          ? fetchRowsByIds('assignments', 'id, title', assignmentIds)
          : Promise.resolve([] as any[]),
        campaignIds.length > 0
          ? fetchRowsByIds('campaigns', 'id, campaign_name', campaignIds)
          : Promise.resolve([] as any[]),
      ]);
      if (cancelled) return;

      const titleByAssignmentId = new Map<string, string>();
      for (const a of assignmentRows) {
        const t = typeof a.title === 'string' ? a.title.trim() : '';
        if (t) titleByAssignmentId.set(a.id as string, t);
      }
      const nameByCampaignId = new Map<string, string>();
      for (const c of campaignRows) {
        const n = typeof c.campaign_name === 'string' ? c.campaign_name.trim() : '';
        if (n) nameByCampaignId.set(c.id as string, n);
      }

      const next = new Map<string, string>();
      for (const p of promoRows) {
        const name =
          (p.assignment_id && titleByAssignmentId.get(p.assignment_id)) ||
          (p.campaign_id && nameByCampaignId.get(p.campaign_id)) ||
          null;
        if (name) next.set(p.id as string, name);
      }
      setNames(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return useMemo(
    () =>
      promotionIds
        .map((id) => ({ id, name: names.get(id) ?? `Promotion ${id.slice(0, 8)}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [idsKey, names],
  );
}

/**
 * Canonical Content Video universe — same membership as Videos.tsx:
 *   organization_id = effectiveOrgId, deleted_at IS NULL.
 * campaign_id is NOT a membership gate.
 */
async function loadOrgContentVideoIds(organizationId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('videos')
    .select('id')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load org videos: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/** Run discovery in batches; merge by journeyId. Does not rewrite the engine. */
async function discoverJourneysBatched(
  videoIds: string[],
): Promise<{
  journeys: DiscoveredJourney[];
  truncated: boolean;
  excludedJourneys: number;
  journeyCountByVideoId: Record<string, number>;
}> {
  const byId = new Map<string, DiscoveredJourney>();
  let truncated = false;
  let excludedJourneys = 0;
  const journeyCountByVideoId: Record<string, number> = {};

  for (let i = 0; i < videoIds.length; i += DISCOVERY_BATCH) {
    const slice = videoIds.slice(i, i + DISCOVERY_BATCH);
    const result = await discoverJourneysForVideos(slice);
    truncated = truncated || !!result.truncated;
    excludedJourneys += result.excludedJourneys ?? 0;
    for (const j of result.journeys ?? []) {
      if (!byId.has(j.journeyId)) byId.set(j.journeyId, j);
    }
    const cov = (result as any).journeyCountByVideoId ?? {};
    for (const [vid, n] of Object.entries(cov)) {
      journeyCountByVideoId[vid] = (journeyCountByVideoId[vid] ?? 0) + (n as number);
    }
  }

  return {
    journeys: Array.from(byId.values()),
    truncated,
    excludedJourneys,
    journeyCountByVideoId,
  };
}

/** Singleton row for a content video with no observed journey path. */
function makeSingletonJourney(videoId: string): RouteJourney {
  const journeyId = `singleton:${videoId}`;
  return {
    journeyId,
    path: { steps: [{ videoId }] },
    memberJourneyIds: [journeyId],
  } as RouteJourney;
}

// ── Per-video enrichment (canonical fields reused from All Assets model) ────

export type VideoDisplay = {
  title: string;
  thumbnailUrl: string | null;
  platform: string | null;
  campaignId: string | null;
  createdAt: string | null;
  userId: string | null;
  contentOwnerName: string | null;
  promotedTypes: Set<string>;
  /** Asset identity */
  isAsset: boolean;
  assetId: string | null;
  assetTypeTag: string | null;
  assetOrganizationId: string | null;
  assetScope: AssetScopeTag | null;
  assetCampaignId: string | null;
  isAssigned: boolean;
  promotionIds: string[];
  createdViaCreative: boolean;
};

async function loadVideoDisplayMap(
  videoIds: string[],
  organizationId: string | null,
): Promise<Map<string, VideoDisplay>> {
  const map = new Map<string, VideoDisplay>();
  const ids = Array.from(new Set(videoIds.filter(Boolean)));
  if (ids.length === 0) return map;

  const CHUNK = 80;
  const allVideos: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('videos').select('*').in('id', slice);
    if (error) throw new Error(`Failed to load video display data: ${error.message}`);
    allVideos.push(...(data ?? []));
  }

  const assetIds = Array.from(
    new Set(allVideos.map((v) => v.asset_id).filter(Boolean) as string[]),
  );
  const ownerIds = Array.from(
    new Set(allVideos.map((v) => v.user_id).filter(Boolean) as string[]),
  );

  // Assets — type + org (campaign on asset is optional; many installs omit it)
  const assetById = new Map<
    string,
    {
      asset_type: string | null;
      organization_id: string | null;
      campaign_id: string | null;
    }
  >();
  for (let i = 0; i < assetIds.length; i += CHUNK) {
    const slice = assetIds.slice(i, i + CHUNK);
    let rows: any[] = [];
    {
      const { data, error } = await supabase
        .from('assets')
        .select('id, asset_type, organization_id')
        .in('id', slice);
      if (error) {
        console.warn('[JourneyAnalytics] assets load', error.message);
      } else {
        rows = data ?? [];
      }
    }
    for (const a of rows) {
      assetById.set(a.id, {
        asset_type: a.asset_type ?? null,
        organization_id: a.organization_id ?? null,
        campaign_id: null,
      });
    }
  }

  // Promotion membership via redirect_links (asset_id + promotion_id) —
  // same real table journeyDownstreamResolver already uses. promotion_assets
  // is not assumed to exist.
  const promotionIdsByAsset = new Map<string, string[]>();
  if (assetIds.length > 0) {
    for (let i = 0; i < assetIds.length; i += CHUNK) {
      const slice = assetIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('redirect_links')
        .select('asset_id, promotion_id')
        .in('asset_id', slice)
        .not('promotion_id', 'is', null);
      if (error) {
        console.warn('[JourneyAnalytics] redirect_links promotions', error.message);
        continue;
      }
      for (const row of (data ?? []) as any[]) {
        if (!row.asset_id || !row.promotion_id) continue;
        const list = promotionIdsByAsset.get(row.asset_id) ?? [];
        if (!list.includes(row.promotion_id)) list.push(row.promotion_id);
        promotionIdsByAsset.set(row.asset_id, list);
      }
    }
  }

  // Also map promotions from videos via redirect_links.video_id
  const promotionIdsByVideo = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('redirect_links')
      .select('video_id, promotion_id, asset_id')
      .in('video_id', slice)
      .not('promotion_id', 'is', null);
    if (error) continue;
    for (const row of (data ?? []) as any[]) {
      if (!row.video_id || !row.promotion_id) continue;
      const list = promotionIdsByVideo.get(row.video_id) ?? [];
      if (!list.includes(row.promotion_id)) list.push(row.promotion_id);
      promotionIdsByVideo.set(row.video_id, list);
      if (row.asset_id) {
        const al = promotionIdsByAsset.get(row.asset_id) ?? [];
        if (!al.includes(row.promotion_id)) al.push(row.promotion_id);
        promotionIdsByAsset.set(row.asset_id, al);
      }
    }
  }

  // Profiles for content owner names (same select pattern as AllAssets)
  const profileById = new Map<string, { full_name: string | null; email: string | null }>();
  for (let i = 0; i < ownerIds.length; i += CHUNK) {
    const slice = ownerIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', slice);
    for (const p of (data ?? []) as any[]) {
      profileById.set(p.id, {
        full_name: p.full_name ?? null,
        email: p.email ?? null,
      });
    }
  }

  for (const v of allVideos) {
    const assetId = (v.asset_id as string | null) ?? null;
    const asset = assetId ? assetById.get(assetId) : undefined;
    const isAsset = !!assetId && !!asset;
    const assetOrg = asset?.organization_id ?? null;
    const isAssigned =
      !!v.created_via_creative ||
      (assetId ? (promotionIdsByAsset.get(assetId)?.length ?? 0) > 0 : false);

    let assetScope: AssetScopeTag | null = null;
    if (isAsset && organizationId) {
      const isMy = assetOrg === organizationId;
      if (isMy && isAssigned) assetScope = 'assigned';
      else if (isMy) assetScope = 'my';
      else assetScope = 'shared';
    } else if (isAsset) {
      assetScope = 'my'; // no org context — treat as my
    }

    const profile = v.user_id ? profileById.get(v.user_id) : null;
    const contentOwnerName =
      profile?.full_name?.trim() || profile?.email || null;

    map.set(v.id, {
      title: (v.video_title as string) || 'Untitled video',
      thumbnailUrl: resolveThumbnail(v) ?? null,
      platform: (v.platform as string | null) ?? null,
      campaignId: (v.campaign_id as string | null) ?? null,
      createdAt: (v.created_at as string | null) ?? null,
      userId: (v.user_id as string | null) ?? null,
      contentOwnerName,
      promotedTypes: new Set(),
      isAsset,
      assetId,
      assetTypeTag: toAssetTypeTag(asset?.asset_type),
      assetOrganizationId: assetOrg,
      assetScope,
      assetCampaignId: asset?.campaign_id ?? (isAsset ? ((v.campaign_id as string | null) ?? null) : null),
      isAssigned,
      createdViaCreative: !!v.created_via_creative,
      promotionIds: Array.from(
        new Set([
          ...(assetId ? promotionIdsByAsset.get(assetId) ?? [] : []),
          ...(promotionIdsByVideo.get(v.id) ?? []),
        ]),
      ),
    });
  }
  return map;
}

function applyPromotedTypes(
  display: Map<string, VideoDisplay>,
  links: StructuralLink[],
): Map<string, VideoDisplay> {
  const next = new Map(display);
  for (const link of links) {
    if (link.resolution === 'legacy') continue;
    const key = elementTypeToWebmood(link.elementType);
    if (!key) continue;
    const existing = next.get(link.videoId);
    if (!existing) continue;
    const types = new Set(existing.promotedTypes);
    types.add(key);
    next.set(link.videoId, { ...existing, promotedTypes: types });
  }
  return next;
}

export function stepsForJourney(
  journey: DiscoveredJourney,
  display: Map<string, VideoDisplay>,
): JourneyStripStep[] {
  return (journey.path?.steps ?? []).map((s) => {
    const d = display.get(s.videoId);
    return {
      videoId: s.videoId,
      title: d?.title ?? `Video ${s.videoId.slice(0, 8)}…`,
      thumbnailUrl: d?.thumbnailUrl ?? null,
      platform: d?.platform ?? null,
      promotedTypes: d?.promotedTypes ?? new Set(),
      isAsset: d?.isAsset ?? false,
      assetScope: d?.assetScope ?? null,
      contentOwnerName: d?.contentOwnerName ?? null,
    };
  });
}

export function journeyPromotedTypes(
  journey: DiscoveredJourney,
  display: Map<string, VideoDisplay>,
): Set<string> {
  const out = new Set<string>();
  for (const s of journey.path?.steps ?? []) {
    display.get(s.videoId)?.promotedTypes.forEach((k) => out.add(k));
  }
  return out;
}

const WEBMOOD_CELLS = [
  { type: 'sales_call', label: 'SALES' },
  { type: 'consultation', label: 'CONSULT' },
  { type: 'newsletter', label: 'NEWS' },
  { type: 'landing_page', label: 'PURCHASE' },
] as const;

export function TypeCell({ types }: { types: Set<string> }) {
  return (
    <div className="grid grid-cols-2 gap-px w-[88px] h-[44px] rounded-md overflow-hidden border border-zinc-800 bg-zinc-950 shrink-0">
      {WEBMOOD_CELLS.map((cell) => {
        const on = types.has(cell.type);
        return (
          <div
            key={cell.type}
            className={
              on
                ? 'flex items-center justify-center text-[7px] font-black tracking-wider text-orange-400 bg-orange-500/20'
                : 'flex items-center justify-center text-[7px] font-black tracking-wider text-zinc-600 bg-zinc-900/80'
            }
          >
            {cell.label}
          </div>
        );
      })}
    </div>
  );
}

export function FilterMultiPanel({
  open,
  onClose,
  panelRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, panelRef]);
  if (!open) return null;
  return (
    <div className="absolute left-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-96 overflow-y-auto">
      {children}
    </div>
  );
}

// ── Shared dataset loader (JourneyAnalytics + PartnerJourneySection) ─────────
// Moved verbatim out of JourneyAnalytics' load effect — same membership rules:
// org content universe (Videos.tsx) + observed journeys + singleton rows.

export type JourneyDataset = {
  journeys: RouteJourney[];
  videoDisplay: Map<string, VideoDisplay>;
  entryVideoCount: number;
  truncated: boolean;
  excludedJourneys: number;
};

export async function loadJourneyDataset(
  effectiveOrgId: string | null,
  organizationId: string | null,
  isCancelled: () => boolean = () => false,
): Promise<JourneyDataset | null> {
  const empty: JourneyDataset = {
    journeys: [],
    videoDisplay: new Map(),
    entryVideoCount: 0,
    truncated: false,
    excludedJourneys: 0,
  };
  if (!effectiveOrgId) return empty;

  // 1) Full org content universe (Videos.tsx membership)
  const videoIds = await loadOrgContentVideoIds(effectiveOrgId);
  if (isCancelled()) return null;
  if (videoIds.length === 0) return empty;

  // 2) Observed journeys (enrichment) — batched, engine unchanged.
  // NOTE: discovery caps distinct journey_ids per batch BEFORE paths are compared
  // (see the KNOWN RISK comment in journeyDiscovery.ts). Route grouping below runs
  // AFTER that cap and does NOT fix it; `truncated` must keep being surfaced.
  const discovery = await discoverJourneysBatched(videoIds);
  if (isCancelled()) return null;

  const stepVideoIds = discovery.journeys.flatMap((j) =>
    (j.path?.steps ?? []).map((s) => s.videoId),
  );
  const allVideoIdsForLinks = Array.from(new Set([...videoIds, ...stepVideoIds]));
  let allLinks: StructuralLink[] = [];
  for (let i = 0; i < allVideoIdsForLinks.length; i += DISCOVERY_BATCH) {
    const slice = allVideoIdsForLinks.slice(i, i + DISCOVERY_BATCH);
    const links = await resolveStructuralLinksForVideos(slice).catch((e) => {
      console.warn('[JourneyAnalytics] structural resolution failed', e);
      return [] as StructuralLink[];
    });
    allLinks = [...allLinks, ...links];
  }
  if (isCancelled()) return null;

  let display = await loadVideoDisplayMap([...videoIds, ...stepVideoIds], organizationId);
  if (isCancelled()) return null;
  display = applyPromotedTypes(display, allLinks);

  // 3) Videos that appear on at least one observed path
  const videosInObservedPaths = new Set<string>();
  for (const j of discovery.journeys) {
    for (const s of j.path?.steps ?? []) {
      if (s.videoId) videosInObservedPaths.add(s.videoId);
    }
  }

  // 4) Singleton rows for org catalog videos with zero journey evidence
  const singletons: RouteJourney[] = [];
  for (const vid of videoIds) {
    if (!videosInObservedPaths.has(vid)) singletons.push(makeSingletonJourney(vid));
  }

  return {
    journeys: [...discovery.journeys, ...singletons],
    videoDisplay: display,
    entryVideoCount: videoIds.length,
    truncated: discovery.truncated,
    excludedJourneys: discovery.excludedJourneys,
  };
}

// ── Shared journey-level filters (AND). Every filter matches ANY step, and the
// journey is always returned whole — the full path is never truncated. ───────

export type JourneyFilters = {
  selectedVideoId: string | null;
  platforms: string[];
  /** Content owner user ids (OR). Empty = all. */
  contentOwnerIds: string[];
  campaignId: string; // 'all' = off
  contentCampaignIds: string[];
  assetCampaignIds: string[];
  promotionIds: string[];
  assetTypes: string[];
  creativeScope: null | 'toMe' | 'byMe';
  viewerId: string | null;
  assetSource: 'all' | 'my' | 'shared' | 'assigned';
  dateRange: DateRange;
  customRange: CustomDateRange | null;
};

export function filterJourneys(
  journeys: DiscoveredJourney[],
  videoDisplay: Map<string, VideoDisplay>,
  f: JourneyFilters,
): DiscoveredJourney[] {
  let list = journeys;
  const anyStep = (j: DiscoveredJourney, fn: (d: VideoDisplay | undefined) => boolean) =>
    (j.path?.steps ?? []).some((s) => fn(videoDisplay.get(s.videoId)));

  if (f.selectedVideoId) {
    list = list.filter((j) => (j.path?.steps ?? []).some((s) => s.videoId === f.selectedVideoId));
  }
  if (f.platforms.length > 0) {
    list = list.filter((j) => anyStep(j, (d) => f.platforms.includes(d?.platform ?? 'youtube')));
  }
  if (f.contentOwnerIds.length > 0) {
    list = list.filter((j) => anyStep(j, (d) => !!d?.userId && f.contentOwnerIds.includes(d.userId)));
  }
  if (f.campaignId !== 'all') {
    list = list.filter((j) => anyStep(j, (d) => d?.campaignId === f.campaignId));
  }
  if (f.contentCampaignIds.length > 0) {
    list = list.filter((j) =>
      anyStep(j, (d) => d?.campaignId != null && f.contentCampaignIds.includes(d.campaignId)),
    );
  }
  if (f.assetCampaignIds.length > 0) {
    list = list.filter((j) =>
      anyStep(
        j,
        (d) => !!d?.isAsset && d.assetCampaignId != null && f.assetCampaignIds.includes(d.assetCampaignId),
      ),
    );
  }
  if (f.promotionIds.length > 0) {
    list = list.filter((j) =>
      anyStep(j, (d) => !!d?.isAsset && d.promotionIds.some((pid) => f.promotionIds.includes(pid))),
    );
  }
  if (f.creativeScope) {
    list = list.filter((j) =>
      anyStep(j, (d) => {
        if (!d?.createdViaCreative || !d.userId) return false;
        return f.creativeScope === 'toMe' ? d.userId === f.viewerId : d.userId !== f.viewerId;
      }),
    );
  }
  if (f.assetTypes.length > 0) {
    list = list.filter((j) =>
      anyStep(j, (d) => !!d?.isAsset && d.assetTypeTag != null && f.assetTypes.includes(d.assetTypeTag)),
    );
  }
  if (f.assetSource !== 'all') {
    list = list.filter((j) => anyStep(j, (d) => !!d?.isAsset && d.assetScope === f.assetSource));
  }
  if (f.dateRange !== 'all') {
    const { start, end } = getDateBounds(f.dateRange, f.customRange);
    list = list.filter((j) =>
      anyStep(j, (d) => {
        if (!d?.createdAt) return false;
        const t = new Date(d.createdAt);
        return t >= start && t <= end;
      }),
    );
  }
  return list;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function JourneyAnalytics() {
  const navigate = useNavigate();
  const { campaignId: paramCampaignId } = useParams<{ campaignId?: string }>();
  const { user } = useAuth();
  const { viewingMemberId, viewingOrgId, isReadOnly } = useViewing();
  const { organizationId: hookOrgId } = useOrganization();
  // Same effective org as Videos.tsx — membership key for content universe
  const effectiveOrgId = isReadOnly ? (viewingOrgId ?? null) : (hookOrgId ?? null);
  const effectiveViewerId = isReadOnly ? viewingMemberId : (user?.id ?? null);

  const campaignOptions = useCampaignOptions(effectiveViewerId);
  // organizationId used for Asset scope + promotion options (may equal effectiveOrgId)
  const organizationId = effectiveOrgId;



  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    paramCampaignId ?? 'all',
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [selectedAssetSource, setSelectedAssetSource] = useState<
    'all' | 'my' | 'shared' | 'assigned'
  >('all');
  const [selectedContentOwnerId, setSelectedContentOwnerId] = useState<string>('all');
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<string[]>([]);
  const [selectedAssetCampaignIds, setSelectedAssetCampaignIds] = useState<string[]>([]);
  const [selectedContentCampaignIds, setSelectedContentCampaignIds] = useState<string[]>([]);
  const [hideArchivedAsset, setHideArchivedAsset] = useState(false);
  const [hideArchivedContent, setHideArchivedContent] = useState(false);
  const [hideArchivedCampaign, setHideArchivedCampaign] = useState(false);
  const [hideArchivedPromotion, setHideArchivedPromotion] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
    // Mobile chrome — same LEGO AllAssetsAnalytics uses. Cards|Table is mapped
  // onto the existing showAnalytics flag, so only landscape + sheet state is used.
  const {
    isMobileLandscape,
    filterOpen: mobileMenuOpen,
    setFilterOpen: setMobileMenuOpen,
  } = useAnalyticsMobileLayout('cards');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showContentOwner, setShowContentOwner] = useState(false);

  const [assetCampaignOpen, setAssetCampaignOpen] = useState(false);
  const [contentCampaignOpen, setContentCampaignOpen] = useState(false);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const assetCampaignRef = useRef<HTMLDivElement>(null);
  const contentCampaignRef = useRef<HTMLDivElement>(null);
  const promotionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paramCampaignId) setSelectedCampaignId(paramCampaignId);
  }, [paramCampaignId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<DiscoveredJourney[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [excludedJourneys, setExcludedJourneys] = useState(0);
  const [entryVideoCount, setEntryVideoCount] = useState(0);
  const [videoDisplay, setVideoDisplay] = useState<Map<string, VideoDisplay>>(new Map());

  // Promotion options: ids already on the loaded journeys' Asset steps — the
  // same data the Promotion filter matches against (see usePromotionOptions).
  const loadedPromotionIds = useMemo(() => {
    const ids = new Set<string>();
    videoDisplay.forEach((d) => {
      if (!d.isAsset) return;
      d.promotionIds.forEach((pid) => ids.add(pid));
    });
    return Array.from(ids).sort();
  }, [videoDisplay]);
  const promotionOptions = usePromotionOptions(loadedPromotionIds);
    const promotionNameById = useMemo(
    () => new Map(promotionOptions.map((p) => [p.id, p.name])),
    [promotionOptions],
  );

  // Promotion panel tabs — same service/shape as AllAssetsAnalytics.
  const [promotionTab, setPromotionTab] = useState<'all' | 'toMe' | 'byMe'>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [assignmentGroups, setAssignmentGroups] = useState<PromotionAssignmentGroups | null>(null);
  const [assignmentGroupsLoading, setAssignmentGroupsLoading] = useState(false);
  const [creativeScopeFilter, setCreativeScopeFilter] = useState<null | 'toMe' | 'byMe'>(null);

  // Lazy-load on first open (desktop panel or mobile sheet) — not refetched on tab switch.
  useEffect(() => {
    if (
      (!promotionOpen && !mobileMenuOpen) ||
      assignmentGroups ||
      assignmentGroupsLoading ||
      !user?.id
    )
      return;
    setAssignmentGroupsLoading(true);
    getPromotionAssignmentGroups(user.id)
      .then(setAssignmentGroups)
      .catch((e) => {
        console.warn('[JourneyAnalytics] promotion assignment groups failed', e?.message ?? e);
        setAssignmentGroups({ assignedToMe: [], assignedByMe: [] });
      })
      .finally(() => setAssignmentGroupsLoading(false));
  }, [promotionOpen, mobileMenuOpen, assignmentGroups, assignmentGroupsLoading, user?.id]);

  const activeGroupList: AssignmentGroup[] =
    promotionTab === 'toMe'
      ? assignmentGroups?.assignedToMe ?? []
      : promotionTab === 'byMe'
        ? assignmentGroups?.assignedByMe ?? []
        : [];
  const selectedPerson = activeGroupList.find((g) => g.person.id === selectedPersonId) ?? null;

  const promotionButtonLabel =
    selectedPromotionIds.length > 0
      ? `${selectedPromotionIds.length} Selected`
      : creativeScopeFilter
        ? creativeScopeFilter === 'toMe'
          ? 'Creative · To Me'
          : 'Creative · By Me'
        : 'All Promotions';
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setJourneys([]);
    setSelectedVideoId(null);

    (async () => {
      try {
        const ds = await loadJourneyDataset(effectiveOrgId, organizationId, () => cancelled);
        if (cancelled || !ds) return;
        setEntryVideoCount(ds.entryVideoCount);
        setJourneys(ds.journeys);
        setTruncated(ds.truncated);
        setExcludedJourneys(ds.excludedJourneys);
        setVideoDisplay(ds.videoDisplay);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
          setJourneys([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveOrgId, organizationId]);

  const presentPlatforms = useMemo(() => {
    const seen = new Set<string>();
    videoDisplay.forEach((v) => seen.add(v.platform ?? 'youtube'));
    return Array.from(seen).sort();
  }, [videoDisplay]);

  // Content marketers with real names
  const contentMarketers = useMemo(() => {
    const byId = new Map<string, string>();
    videoDisplay.forEach((v) => {
      if (!v.userId) return;
      if (!byId.has(v.userId)) {
        byId.set(v.userId, v.contentOwnerName || v.userId.slice(0, 8));
      }
    });
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [videoDisplay]);

  // Campaign name lookup for filters / cells
  const campaignNameById = useMemo(() => {
    const m = new Map<string, string>();
    campaignOptions.forEach((c) => m.set(c.id, c.campaign_name));
    return m;
  }, [campaignOptions]);

  // ── Journey-level filters (AND) ───────────────────────────────────────────
  const visibleJourneys = useMemo(
    () =>
      filterJourneys(journeys, videoDisplay, {
        selectedVideoId,
        platforms: selectedPlatforms,
        contentOwnerIds: selectedContentOwnerId === 'all' ? [] : [selectedContentOwnerId],
        campaignId: selectedCampaignId,
        contentCampaignIds: selectedContentCampaignIds,
        assetCampaignIds: selectedAssetCampaignIds,
        promotionIds: selectedPromotionIds,
        assetTypes: selectedAssetTypes,
        creativeScope: creativeScopeFilter,
        viewerId: user?.id ?? null,
        assetSource: selectedAssetSource,
        dateRange,
        customRange,
      }),
    [
      journeys,
      selectedVideoId,
      selectedPlatforms,
      selectedContentOwnerId,
      selectedCampaignId,
      selectedContentCampaignIds,
      selectedAssetCampaignIds,
      selectedPromotionIds,
      selectedAssetTypes,
      creativeScopeFilter,
      user?.id,
      selectedAssetSource,
      videoDisplay,
      dateRange,
      customRange,
    ],
  );

  const handleSelectVideo = useCallback((videoId: string) => {
    setSelectedVideoId((prev) => (prev === videoId ? null : videoId));
  }, []);

  const toggleId = (id: string, list: string[], set: (v: string[]) => void) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  // Asset type counts for filter pills
  const assetTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      campaign_element: 0,
      promotional_video: 0,
      resource: 0,
      content_video: 0,
    };
    videoDisplay.forEach((v) => {
      if (v.isAsset && v.assetTypeTag && counts[v.assetTypeTag] !== undefined) {
        counts[v.assetTypeTag] += 1;
      }
    });
    return counts;
  }, [videoDisplay]);

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const sidebarFilters = (
        <div className="space-y-8">
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Date Range
        </label>
        <div className="relative">
          <select
            value={dateRange}
            onChange={(e) => {
              const v = e.target.value as DateRange;
              setDateRange(v);
              if (v !== 'custom') setCustomRange(null);
            }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer text-zinc-300"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="2months">Last 2 Months</option>
            <option value="6months">Last 6 Months</option>
            <option value="1year">Last Year</option>
            <option value="all">Lifetime</option>
            <option value="custom">Custom Range</option>
          </select>
          <Calendar
            size={12}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
          />
        </div>
        {dateRange === 'custom' && (
          <div className="mt-2 space-y-2">
            <input
              type="date"
              value={
                customRange?.start
                  ? typeof customRange.start === 'string'
                    ? customRange.start.slice(0, 10)
                    : customRange.start.toISOString().slice(0, 10)
                  : ''
              }
              onChange={(e) =>
                setCustomRange((prev) => ({
                  start: e.target.value,
                  end: prev?.end ?? e.target.value,
                }))
              }
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] text-zinc-300"
            />
            <input
              type="date"
              value={
                customRange?.end
                  ? typeof customRange.end === 'string'
                    ? customRange.end.slice(0, 10)
                    : customRange.end.toISOString().slice(0, 10)
                  : ''
              }
              onChange={(e) =>
                setCustomRange((prev) => ({
                  start: prev?.start ?? e.target.value,
                  end: e.target.value,
                }))
              }
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] text-zinc-300"
            />
          </div>
        )}
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Campaign
        </label>
        <div className="relative">
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer text-zinc-300"
          >
            <option value="all">All Campaigns</option>
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaign_name}
              </option>
            ))}
          </select>
          <Briefcase
            size={12}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
          />
        </div>
      </div>

      {/* Asset Campaign */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Asset Campaign
        </label>
        <div className="relative" ref={assetCampaignRef}>
          <button
            type="button"
            onClick={() => {
              setAssetCampaignOpen((o) => !o);
              setContentCampaignOpen(false);
              setPromotionOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all truncate ${
              assetCampaignOpen
                ? 'bg-zinc-800 border-zinc-700 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              <Briefcase size={12} className="shrink-0 text-zinc-600" />
              <span className="truncate">
                {selectedAssetCampaignIds.length === 0
                  ? 'All Asset Campaigns'
                  : `${selectedAssetCampaignIds.length} Selected`}
              </span>
            </span>
            <ChevronDown
              size={11}
              className={`shrink-0 transition-transform ${assetCampaignOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <FilterMultiPanel
            open={assetCampaignOpen}
            onClose={() => setAssetCampaignOpen(false)}
            panelRef={assetCampaignRef}
          >
            <button
              type="button"
              onClick={() => setSelectedAssetCampaignIds([])}
              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 border-b border-zinc-800"
            >
              {selectedAssetCampaignIds.length === 0 ? (
                <Check size={11} className="shrink-0 text-red-500" />
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              All Asset Campaigns
            </button>
            {campaignOptions.map((c) => {
              const on = selectedAssetCampaignIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    toggleId(c.id, selectedAssetCampaignIds, setSelectedAssetCampaignIds)
                  }
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 truncate"
                >
                  {on ? (
                    <Check size={11} className="shrink-0 text-red-500" />
                  ) : (
                    <span className="w-[11px] shrink-0" />
                  )}
                  <span className="truncate">{c.campaign_name}</span>
                </button>
              );
            })}
          </FilterMultiPanel>
        </div>
      </div>

      {/* Content Campaign */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Content Campaign
        </label>
        <div className="relative" ref={contentCampaignRef}>
          <button
            type="button"
            onClick={() => {
              setContentCampaignOpen((o) => !o);
              setAssetCampaignOpen(false);
              setPromotionOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all truncate ${
              contentCampaignOpen
                ? 'bg-zinc-800 border-zinc-700 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              <Briefcase size={12} className="shrink-0 text-zinc-600" />
              <span className="truncate">
                {selectedContentCampaignIds.length === 0
                  ? 'All Content Campaigns'
                  : `${selectedContentCampaignIds.length} Selected`}
              </span>
            </span>
            <ChevronDown
              size={11}
              className={`shrink-0 transition-transform ${contentCampaignOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <FilterMultiPanel
            open={contentCampaignOpen}
            onClose={() => setContentCampaignOpen(false)}
            panelRef={contentCampaignRef}
          >
            <button
              type="button"
              onClick={() => setSelectedContentCampaignIds([])}
              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 border-b border-zinc-800"
            >
              {selectedContentCampaignIds.length === 0 ? (
                <Check size={11} className="shrink-0 text-red-500" />
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              All Content Campaigns
            </button>
            {campaignOptions.map((c) => {
              const on = selectedContentCampaignIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    toggleId(c.id, selectedContentCampaignIds, setSelectedContentCampaignIds)
                  }
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 truncate"
                >
                  {on ? (
                    <Check size={11} className="shrink-0 text-red-500" />
                  ) : (
                    <span className="w-[11px] shrink-0" />
                  )}
                  <span className="truncate">{c.campaign_name}</span>
                </button>
              );
            })}
          </FilterMultiPanel>
        </div>
      </div>

      {/* Promotion */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Promotion
        </label>
        <div className="relative" ref={promotionRef}>
          <button
            type="button"
            onClick={() => {
              setPromotionOpen((o) => !o);
              setAssetCampaignOpen(false);
              setContentCampaignOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all truncate ${
              promotionOpen
                ? 'bg-zinc-800 border-zinc-700 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              <Megaphone size={12} className="shrink-0 text-zinc-600" />
              <span className="truncate">
                {promotionButtonLabel}
              </span>
            </span>
            <ChevronDown
              size={11}
              className={`shrink-0 transition-transform ${promotionOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <FilterMultiPanel
            open={promotionOpen}
            onClose={() => setPromotionOpen(false)}
            panelRef={promotionRef}
          >
            <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-zinc-800">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'toMe', label: 'Assigned to Me' },
                  { key: 'byMe', label: 'Assigned by Me' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setPromotionTab(tab.key);
                    setSelectedPersonId(null);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    promotionTab === tab.key
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {promotionTab === 'all' && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPromotionIds([]);
                    setCreativeScopeFilter(null);
                  }}
                  className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 border-b border-zinc-800"
                >
                  {selectedPromotionIds.length === 0 && !creativeScopeFilter ? (
                    <Check size={11} className="shrink-0 text-red-500" />
                  ) : (
                    <span className="w-[11px] shrink-0" />
                  )}
                  All Promotions
                </button>
                {promotionOptions.length === 0 && (
                  <div className="px-4 py-3 text-[10px] text-zinc-600">
                    No promotions found in the loaded journeys
                  </div>
                )}
                {promotionOptions.map((p) => {
                  const on = selectedPromotionIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleId(p.id, selectedPromotionIds, setSelectedPromotionIds)}
                      className="w-full flex items-center gap-2 text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 truncate"
                    >
                      {on ? (
                        <Check size={11} className="shrink-0 text-red-500" />
                      ) : (
                        <span className="w-[11px] shrink-0" />
                      )}
                      <span className="truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {(promotionTab === 'toMe' || promotionTab === 'byMe') && (
              <div>
                <div className="px-3 py-2 border-b border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setCreativeScopeFilter(promotionTab === 'toMe' ? 'toMe' : 'byMe');
                      setSelectedPromotionIds([]);
                      setPromotionOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                      creativeScopeFilter === (promotionTab === 'toMe' ? 'toMe' : 'byMe')
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    Creative
                  </button>
                  {creativeScopeFilter && (
                    <button
                      type="button"
                      onClick={() => setCreativeScopeFilter(null)}
                      className="mt-1 w-full text-left px-3 py-1.5 text-[9px] font-bold text-zinc-600 hover:text-zinc-400"
                    >
                      Clear Creative filter
                    </button>
                  )}
                </div>

                <div className="py-2">
                  {assignmentGroupsLoading && (
                    <div className="px-4 py-6 text-center text-[10px] font-bold text-zinc-600">
                      Loading…
                    </div>
                  )}

                  {!assignmentGroupsLoading && !selectedPerson && activeGroupList.length === 0 && (
                    <div className="px-4 py-6 text-center text-[10px] font-bold text-zinc-600">
                      Nothing here yet.
                    </div>
                  )}

                  {!assignmentGroupsLoading &&
                    !selectedPerson &&
                    activeGroupList.map((group) => (
                      <button
                        key={group.person.id}
                        type="button"
                        onClick={() => setSelectedPersonId(group.person.id)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left"
                      >
                        <span className="min-w-0">
                          <span className="block text-[8px] font-black uppercase tracking-widest text-zinc-600">
                            {promotionTab === 'toMe' ? 'Sponsor' : 'Marketer'}
                          </span>
                          <span className="block text-[10px] font-bold text-zinc-300 truncate">
                            {group.person.name}
                          </span>
                        </span>
                        <span className="shrink-0 text-[9px] font-bold text-zinc-500 whitespace-nowrap">
                          {group.promotions.length} Promotion
                          {group.promotions.length === 1 ? '' : 's'} →
                        </span>
                      </button>
                    ))}

                  {!assignmentGroupsLoading && selectedPerson && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setSelectedPersonId(null)}
                        className="w-full flex items-center gap-1.5 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                      >
                        <ChevronLeft size={11} />
                        {selectedPerson.person.name}
                      </button>
                      {selectedPerson.promotions.map((p) => {
                        const on = selectedPromotionIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() =>
                              toggleId(p.id, selectedPromotionIds, setSelectedPromotionIds)
                            }
                            className="w-full flex items-center gap-2 text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 truncate"
                          >
                            {on ? (
                              <Check size={11} className="shrink-0 text-red-500" />
                            ) : (
                              <span className="w-[11px] shrink-0" />
                            )}
                            <span className="truncate">
                              {promotionNameById.get(p.id) ??
                                p.assignment?.title ??
                                `Promotion ${p.id.slice(0, 8)}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </FilterMultiPanel>
        </div>
      </div>

      {/* Content Marketer */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Content Marketer
        </label>
        <div className="relative">
          <select
            value={selectedContentOwnerId}
            onChange={(e) => setSelectedContentOwnerId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer text-zinc-300"
          >
            <option value="all">All Content Marketers</option>
            {contentMarketers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <User
            size={12}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
          />
        </div>
      </div>

      {/* Asset Type — real filter */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Asset Type
        </label>
        <div className="flex flex-wrap gap-2">
          {ASSET_TYPE_OPTIONS.map((o) => {
            const active = selectedAssetTypes.includes(o.value);
            const count = assetTypeCounts[o.value] ?? 0;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() =>
                  setSelectedAssetTypes((prev) =>
                    prev.includes(o.value)
                      ? prev.filter((x) => x !== o.value)
                      : [...prev, o.value],
                  )
                }
                className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${
                  active
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                {o.label}
                <span className="ml-1 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Asset Scope — real filter */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Asset Scope
        </label>
        <div className="flex gap-1.5">
          {SCOPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setSelectedAssetSource(o.value)}
              className={`flex-1 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                selectedAssetSource === o.value
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[8px] font-bold uppercase tracking-widest text-zinc-600">
          <span className="text-rose-400">● My</span>
          <span className="text-violet-400">● Shared</span>
          <span className="text-cyan-400">● Assigned</span>
        </div>
      </div>

      {/* Hide Archived — UI state for later metrics wiring */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
          Hide Archived
        </label>
        <div className="space-y-2">
          {(
            [
              { key: 'asset', label: 'Asset', value: hideArchivedAsset, set: setHideArchivedAsset },
              {
                key: 'content',
                label: 'Content',
                value: hideArchivedContent,
                set: setHideArchivedContent,
              },
              {
                key: 'campaign',
                label: 'Campaign',
                value: hideArchivedCampaign,
                set: setHideArchivedCampaign,
              },
              {
                key: 'promotion',
                label: 'Promotion',
                value: hideArchivedPromotion,
                set: setHideArchivedPromotion,
              },
            ] as const
          ).map((row) => (
            <label
              key={row.key}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={row.value}
                onChange={(e) => row.set(e.target.checked)}
                className="rounded border-zinc-700"
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                {row.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderJourneyStrip = (j: DiscoveredJourney) => (
    <JourneyStrip
      steps={stepsForJourney(j, videoDisplay)}
      highlightVideoId={selectedVideoId}
      onSelectVideo={handleSelectVideo}
      showContentOwner={showContentOwner}
    />
  );

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      <aside
        className={`${
          sidebarOpen ? 'hidden lg:flex' : 'hidden'
        } w-80 bg-zinc-950 border-r border-zinc-900 flex-col shrink-0 fixed inset-y-0 left-0 z-50 lg:static`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Filters
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
            aria-label="Close filters"
          >
            <X size={16} />
          </button>
        </div>
                {sidebarOpen && (
          <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
            {sidebarFilters}
          </div>
        )}
      </aside>

   

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AnalyticsMobileFilterSheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          {sidebarFilters}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full py-3 rounded-xl bg-red-600 text-white text-[11px] font-black uppercase tracking-widest"
            >
              Show {visibleJourneys.length} Journeys
            </button>
          </div>
        </AnalyticsMobileFilterSheet>

        {!isMobileLandscape && (
        <header className="shrink-0 border-b border-zinc-900 bg-zinc-950 px-4 lg:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 w-full lg:w-auto">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all"
                aria-label="Back"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                title="Sidebar filters"
                onClick={() => setSidebarOpen((o) => !o)}
                className={`hidden lg:flex p-3 border rounded-2xl transition-all ${
                  sidebarOpen
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <Filter size={20} />
              </button>
              <div className="min-w-0">
                <h2 className="text-xl lg:text-2xl font-black text-white uppercase tracking-tight">
                  Journey Analytics
                </h2>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
                  One row = one journey
                </p>
              </div>
              <AnalyticsMobileFilterButton
                className="ml-auto"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                {(['total', 'pixel', 'stripe'] as RevenueView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setActiveSource(v)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      activeSource === v
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowContentOwner((v) => !v)}
                className={`h-9 px-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                  showContentOwner
                    ? 'bg-zinc-700 border-zinc-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {showContentOwner ? 'Hide Content Owner' : 'Show Content Owner'}
              </button>

              {selectedVideoId && (
                <button
                  type="button"
                  onClick={() => setSelectedVideoId(null)}
                  className="h-9 px-3 rounded-xl border border-red-600/40 bg-red-600/10 text-[9px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5"
                >
                  Video selected
                  <X size={12} />
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowAnalytics((v) => !v)}
                className={`h-9 px-4 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                  showAnalytics
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-600'
                }`}
              >
                <BarChart3 size={14} />
                {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedPlatforms([])}
                className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                  selectedPlatforms.length === 0
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                All
                <span className="ml-1.5 text-[8px] opacity-70">{journeys.length}</span>
              </button>
              {presentPlatforms.map((p) => {
                const cfg = PLATFORM_CONFIG[p as Platform];
                const active = selectedPlatforms.includes(p);
                const color = cfg?.color ?? '#dc2626';
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setSelectedPlatforms((prev) =>
                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                      )
                    }
                    style={active ? { backgroundColor: color, borderColor: color } : {}}
                    className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                      active
                        ? 'text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                    }`}
                  >
                    {cfg?.icon ? <span className="mr-1 opacity-70">{cfg.icon}</span> : null}
                    {cfg?.label ?? p}
                  </button>
                );
              })}
            </div>
            <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
              Content {entryVideoCount} · Rows {journeys.length} ·
              Showing {visibleJourneys.length}
              {truncated && <span className="text-amber-600"> · Truncated</span>}
            </div>
          </div>
    </header>
    )}

    <div className="flex-1 overflow-auto custom-scrollbar">

          {loading && (
            <div className="py-20 text-center">
              <Loader2 className="animate-spin text-red-600 mx-auto" size={32} aria-hidden />
              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mt-4">
                Loading journeys…
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="py-20 text-center">
              <div className="text-[11px] font-black uppercase tracking-widest text-red-500">
                Failed to load journeys
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 max-w-md mx-auto">{error}</div>
            </div>
          )}

          {!loading && !error && visibleJourneys.length === 0 && (
            <div className="py-20 text-center">
              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                No journeys match the current filters
              </div>
            </div>
          )}

          {!loading && !error && visibleJourneys.length > 0 && !showAnalytics && (
            <div className="px-4 lg:px-6 py-4 space-y-2">
              {visibleJourneys.map((j) => (
                <div
                  key={j.journeyId}
                  className="rounded-xl border border-zinc-900 bg-zinc-950/80 px-2 py-1.5"
                >
                  <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5 px-0.5">
                    Journey · {j.journeyId.slice(0, 8)}…
                  </div>
                  {renderJourneyStrip(j)}
                </div>
              ))}
            </div>
          )}

          {!loading && !error && visibleJourneys.length > 0 && showAnalytics && (
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-zinc-900 border-collapse">
                <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
                  <tr>
                    <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[320px] sticky left-0 z-30">
                      Journey Map
                    </th>
                    {JOURNEY_ANALYTICS_EXTRA.map((col) => (
                      <th
                        key={col.key}
                        className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                    {TABLE_COLUMNS.map((key) => (
                      <th
                        key={key}
                        className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap"
                      >
                        {COLUMN_LABELS[key as MetricType] ?? key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-black divide-y divide-zinc-900">
                  {visibleJourneys.map((j) => {
                    const types = journeyPromotedTypes(j, videoDisplay);
                    return (
                      <tr
                        key={j.journeyId}
                        className="hover:bg-zinc-950/80 transition-colors group"
                      >
                        <td className="px-3 py-3 sticky left-0 z-10 bg-black group-hover:bg-zinc-950 transition-colors min-w-[320px] max-w-[480px]">
                          <div className="text-[7px] font-black uppercase tracking-widest text-zinc-700 mb-0.5">
                            {j.journeyId.slice(0, 8)}…
                          </div>
                          {renderJourneyStrip(j)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <TypeCell types={types} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600">
                          —
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600">
                          —
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600">
                          —
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600 tabular-nums">
                          —
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600">
                          —
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600 tabular-nums">
                          —
                        </td>
                        {TABLE_COLUMNS.map((key) => (
                          <td
                            key={key}
                            className="px-4 py-3 whitespace-nowrap text-sm font-bold text-zinc-600 tabular-nums"
                          >
                            —
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
