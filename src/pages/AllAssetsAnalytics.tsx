// ─────────────────────────────────────────────────────────────────────────────
// AllAssetsAnalytics.tsx
//
// STRUCTURE-ONLY PHASE — see ASSET_ANALYTICS_DESIGN.md for the full spec.
//
// Route: /analytics/assets  (adjust to match your router — placeholder page
// previously lived at whatever route rendered the old blank component)
//
// WHAT THIS FILE IS RIGHT NOW
// ════════════════════════════
// Table shell + column definitions + filter shell. Filters are real React
// state, wired to their controls — but since useAssetAnalyticsRows() is
// still a stub returning [], nothing actually filters anything yet. No
// Supabase queries, no asset/redirect_link joins, no revenue wiring.
//
// COLUMN PARITY WITH InDepthAnalytics
// ════════════════════════════════════
// The 14 metric columns (TABLE_COLUMNS / COLUMN_LABELS) are imported directly
// from analyticsEngine.ts — NOT re-declared here. This guarantees this table
// can never drift from InDepthAnalytics' column set/labels/order by accident.
// When we wire real data, whatever engine function computes these per-row
// must also come from analyticsEngine.ts (or a sibling engine that composes
// it) — never a parallel reimplementation. See ASSET_ANALYTICS_DESIGN.md
// "Revenue Boundary" section before touching this.
//
// WHAT'S NEW VS InDepthAnalytics
// ════════════════════════════════
// 1. TWO identity cells per row, not one:
//    - Asset (sticky leftmost) — thumbnail/title/type badge.
//    - Content — the promoting video's own thumbnail/title. InDepthAnalytics
//      only ever needs one identity cell (video = the row). Here the row is
//      an (asset, promoting video) PAIR, so both identities need their own
//      column — the sub-line approach from the previous pass under-
//      represented the video, per product decision.
// 2. Row grain is ASSET × PROMOTING VIDEO. The same asset can appear on
//    multiple rows (once per promoting video) and the same video can appear
//    on multiple rows (once per asset it promotes). Example: Video A
//    promotes Asset B, Asset C, Asset D → 3 rows, each pairing Video A with
//    a different asset.
// 3. "Asset Type" badge column — Campaign Element / Promotional Video /
//    Resource / Content Video.
// 4. "Asset Clicks" column — INTENTIONALLY UNDEFINED for now. See
//    ASSET_ANALYTICS_DESIGN.md § Open Question — Asset Clicks Definition.
//    Rendered as a static placeholder, never fabricated from other columns.
// 5. Promotions filter — NOT present in InDepthAnalytics (which has no
//    concept of a promotion). Added here as its own dropdown, styled like
//    the Campaign dropdown, because rows here can be scoped by promotion.
//
// FILTERS ADDED THIS PASS (state wired, not yet applied to data)
// ══════════════════════════════════════════════════════════════
// - Date Range (7/30/60/180/365 days, lifetime, custom) — same control/
//   options as InDepthAnalytics' sidebar.
// - Campaign dropdown — same as InDepthAnalytics.
// - Promotions dropdown — new, same visual pattern as Campaign.
// - Source toggle (total / pixel / stripe) — same as InDepthAnalytics header.
// - Columns dropdown — visual shell present; toggle logic wired to
//   visibleColumns state (mirrors InDepthAnalytics' DEFAULT_VISIBLE pattern).
// - Platform pills (All + one per platform present in the data) — same
//   pattern as InDepthAnalytics, reusing PLATFORM_CONFIG.
// - Sort shortcuts (Revenue / Consultations / Purchases / Calls / Opt-ins) —
//   same shortcut set as InDepthAnalytics, minus "Clicks" (InDepthAnalytics
//   itself points that shortcut at a non-existent 'unique_clicks' key — not
//   reproduced here to avoid carrying over a dead sort key).
//
// STILL RESERVED / NOT BUILT THIS PASS
// ══════════════════════════════════════
// - All/My/Shared/Assigned scope tabs and the four asset-type filter pills
//   named in the original brief — scope rules unconfirmed against real data
//   (ASSET_ANALYTICS_DESIGN.md §3). Reserved row kept below the filter bar.
// - Any revenue/click computation.
// - Double-counting/attribution resolution (Video B → Asset A → Video A
//   scenario). Must be solved in the engine layer first — see
//   ASSET_ANALYTICS_DESIGN.md §2.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Campaign, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  TABLE_COLUMNS,
  COLUMN_LABELS,
  handleSortToggle,
  getDateBounds,
  type MetricType,
  type DateRange,
  type CustomDateRange,
  type RevenueView,
} from '../lib/analyticsEngine';
import { applyAnalyticsArchiveFilters } from '../lib/analyticsArchiveFilter';
import {
  PLATFORM_CONFIG,
  type Platform,
} from '../lib/platformParser';

import {
  getAssetAnalyticsRows,
  type AssetAnalyticsTableRow,
} from '../services/asset/getAssetAnalyticsRows';
import { getVideoArchiveContextsForViewer } from '../services/video/getVideoArchiveContext';
import { getCampaignArchiveContextsForViewer } from '../services/campaign/getCampaignArchiveContext';
import { getPromotionArchiveContextsForViewer } from '../services/promotion/getPromotionArchiveContext';
import {
  getPromotionAssignmentGroups,
  type PromotionAssignmentGroups,
  type AssignmentGroup,
} from '../services/promotion/getPromotionAssignmentGroups';

import {
  ChevronLeft, Filter, Columns, ChevronDown, ArrowUpDown, Boxes,
  Calendar, Briefcase, Megaphone, Check, User, Menu, X,
} from 'lucide-react';

import {
  resolveThumbnail,
  renderContentIdentity,
  resolveAssetThumbnail,
  resolveElementThumbnail,
  type ResourceType,
  type CampaignElementType,
} from '../lib/videoFormatters';

// ─────────────────────────────────────────────────────────────────────────────
// Asset type taxonomy
// Verbatim from the four categories named in ASSET_ANALYTICS_DESIGN.md
// (Campaign Elements / Promotional Videos / Resources / Content Videos).
// Kept as a local const here (not imported) because no shared assetTypes.ts
// currently exists — flagged in the design doc as something to confirm
// against the actual `assets.asset_type` enum before wiring.
// ─────────────────────────────────────────────────────────────────────────────

type AssetTypeTag = 'campaign_element' | 'promotional_video' | 'resource' | 'content_video';

const ASSET_TYPE_LABELS: Record<AssetTypeTag, string> = {
  campaign_element:  'Campaign Element',
  promotional_video: 'Promotional Video',
  resource:          'Resource',
  content_video:     'Content Video',
};

const ASSET_TYPE_COLORS: Record<AssetTypeTag, string> = {
  campaign_element:  'bg-violet-500/10 border-violet-500/30 text-violet-400',
  promotional_video: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  resource:          'bg-amber-500/10 border-amber-500/30 text-amber-400',
  content_video:     'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
};
const ALL_ASSET_TYPES: AssetTypeTag[] = [
  'campaign_element',
  'promotional_video',
  'resource',
  'content_video',
];
// ─────────────────────────────────────────────────────────────────────────────
// Sort shortcuts — same set InDepthAnalytics exposes, minus the dead
// 'unique_clicks' key (see header comment).
// ─────────────────────────────────────────────────────────────────────────────

const SORT_SHORTCUTS: { label: string; key: string }[] = [
  { label: 'Recently Added', key: 'asset_created_at' },
  { label: 'Revenue',       key: 'total_revenue' },
  { label: 'Consultations', key: 'consultation_thankyou' },
  { label: 'Purchases',     key: 'purchase_thankyou' },
  { label: 'Calls',         key: 'call_booking_thankyou' },
  { label: 'Opt-ins',       key: 'newsletter_thankyou' },
];

const DEFAULT_VISIBLE = new Set<string>([...TABLE_COLUMNS, 'promotion']);

// ─────────────────────────────────────────────────────────────────────────────
// Local placeholder type — a promotion, only the fields this dropdown needs.
// Once wired, this should come from wherever the app already types
// promotions (e.g. lib/supabase.ts), not be redefined here.
// ─────────────────────────────────────────────────────────────────────────────

interface PromotionOption {
  id:   string;
  name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row shape — ONE ROW = ONE (asset, promoting video) PAIR
//
// This mirrors ProcessedVideoRow from analyticsEngine.ts but splits identity
// into two cells — Asset and Content (the promoting video) — since neither
// alone represents the row.
//
// `metrics` reuses VideoMetricsResult's shape by structural typing — once
// wired, whatever function computes this per (asset, video) pair should
// return the same shape processVideoMetrics() returns today, so
// formatCellValue()/COLUMN_LABELS keep working unmodified.
// ─────────────────────────────────────────────────────────────────────────────

interface AssetIdentity {
  id:             string;
  title:          string | undefined;
  thumbnail_url?: string;
  asset_type:     AssetTypeTag;
  platform?:      string | null;
  created_at?:    string | null;
}

interface PromotingVideoIdentity {
  id:             string;
  title:          React.ReactNode | undefined;
  thumbnail_url?: string;
  platform?:      string | null;
  created_at?:    string | null;
  content_owner_id?: string | null;
  content_owner_name?: string | null;
}

interface AssetAnalyticsRow {
  asset:           AssetIdentity;
  promoting_video: PromotingVideoIdentity;
  campaign_id:     string | null;
  promotion_id:    string | null;
  // assets.organization_id, unchanged from the data layer. AllAssetsAnalytics
  // compares this to organizationId (from the hook) to derive My vs Shared.
  assetOrganizationId: string;
  // From getAssignedAssetSummaryForOwner(viewerId) — annotation on top of
  // My, never a separate/exclusive source. See ASSET_ANALYTICS_DESIGN_6.md.
  isAssigned: boolean;
    // From getAssetAnalyticsRows → getAssetArchiveContextsForViewer (Entity Archive only).
  archive: {
    isArchived: boolean;
    reasons: { sourceType: string; sourceId: string; sourceName: string | null }[];
  };
  // From getVideoArchiveContextsForViewer for promoting_video.id (Entity Archive only).
  videoArchive: {
    isArchived: boolean;
  };
  // From getCampaignArchiveContextsForViewer for campaign_id (Entity Archive only).
  campaignArchive: {
    isArchived: boolean;
  };

  // From getPromotionArchiveContextsForViewer (Surface A / personal only).
  promotionArchive: {
    isArchived: boolean;
  };
  // Placeholder — see "Asset Clicks" note above. Left as `number | null` so
  // the UI can distinguish "not computed yet" (null → renders "—") from a
  // real zero once wired.
  asset_clicks:    number | null;
  // Same 14-key shape as VideoMetricsResult. All zeroed for now via
  // emptyVideoMetrics() equivalent — never fabricated.
  metrics:         Record<MetricType, number | string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// STUB data sources — return nothing yet. Replace with real fetches/engine
// calls once ASSET_ANALYTICS_DESIGN.md's open questions are resolved.
// ─────────────────────────────────────────────────────────────────────────────

/** Map engine asset_type → UI badge taxonomy (local labels only). */
function toAssetTypeTag(assetType: string): AssetTypeTag {
  if (assetType === 'campaign_element') return 'campaign_element';
  if (assetType === 'resource') return 'resource';
  if (assetType === 'video') return 'promotional_video';
  return 'content_video';
}

/** Zero-filled 14-column metrics bag; overlay AssetMetrics onto compatible keys. */
function toTableMetrics(
  m: AssetAnalyticsTableRow['metrics'],
): Record<MetricType, number | string> {
  const base = {} as Record<MetricType, number | string>;
  for (const key of TABLE_COLUMNS) {
    base[key as MetricType] = 0;
  }
  // AssetMetrics is the 5-metric vocabulary from assetAnalyticsEngine.
  // Map into the shared table columns without inventing funnel breakdowns.
  if ('total_revenue' in base) base.total_revenue = m.revenue ?? 0;
  if ('unique_clicks' in base) base.unique_clicks = m.clicks ?? 0;
  return base;
}

async function resolveOrgAndViewer(): Promise<{ organizationId: string; viewerId: string }> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    throw new Error('Not authenticated');
  }
  const viewerId = auth.user.id;

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', viewerId)
    .limit(1)
    .maybeSingle();

  if (membership?.organization_id) {
    return { organizationId: membership.organization_id as string, viewerId };
  }

  const { data: asset } = await supabase
    .from('assets')
    .select('organization_id')
    .limit(1)
    .maybeSingle();

  if (!asset?.organization_id) {
    throw new Error('Could not resolve organizationId');
  }
  return { organizationId: asset.organization_id as string, viewerId };
}

/**
 * Boundary adapter: verified orchestration → existing table row shape.
 * Does not change engines. Display identity is enriched with a small bulk fetch.
 */
function useAssetAnalyticsRows(opts: {
  dateRange: DateRange;
  customRange: CustomDateRange | null;
  activeSource: RevenueView;
}): { rows: AssetAnalyticsRow[]; loading: boolean; error: string | null; organizationId: string | null } {
  const [rows, setRows] = useState<AssetAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { organizationId, viewerId } = await resolveOrgAndViewer();
        if (!cancelled) setOrganizationId(organizationId);

        const source =
          opts.activeSource === 'pixel' || opts.activeSource === 'stripe'
            ? opts.activeSource
            : 'total';

        const result = await getAssetAnalyticsRows({
          organizationId,
          viewerId,
          dateRange: opts.dateRange,
          customRange: opts.customRange,
          activeSource: source,
        });

        if (cancelled) return;

       
        const assetIds = Array.from(new Set(result.rows.map((r) => r.asset_id)));
        const videoIds = Array.from(new Set(result.rows.map((r) => r.video_id)));
        const videoArchiveById = await getVideoArchiveContextsForViewer(
          videoIds.map((id) => ({ id })),
          viewerId,
        );

        const campaignIds = Array.from(
          new Set(
            result.rows
              .flatMap((r) => r.campaignIds ?? [])
              .filter((id): id is string => !!id),
          ),
        );

        let campaignArchiveById = new Map<
          string,
          { isArchived: boolean }
        >();
        if (campaignIds.length > 0) {
          const { data: campaignRows, error: campaignArchiveError } = await supabase
            .from('campaigns')
            .select('id, archived_at')
            .in('id', campaignIds);
          if (campaignArchiveError) {
            throw new Error(
              `Failed to load campaigns for archive context: ${campaignArchiveError.message}`,
            );
          }
          const campaignsForArchive = (campaignRows ?? []).map((c: any) => ({
            id: c.id as string,
            archivedAt: (c.archived_at as string | null) ?? null,
          }));
          const fullCampaignArchive = await getCampaignArchiveContextsForViewer(
            campaignsForArchive,
            viewerId,
          );
          campaignArchiveById = new Map(
            Array.from(fullCampaignArchive.entries()).map(([id, ctx]) => [
              id,
              { isArchived: !!ctx.isArchived },
            ]),
          );
        }



                const promotionIds = Array.from(
          new Set(
            result.rows
              .flatMap((r) => r.promotionIds ?? [])
              .filter((id): id is string => !!id),
          ),
        );

        let promotionArchiveById = new Map<string, { isArchived: boolean }>();
        if (promotionIds.length > 0) {
          const { data: promoStateRows, error: promoStateError } = await supabase
            .from('promotion_user_states')
            .select('promotion_id, archived_at')
            .eq('user_id', viewerId)
            .in('promotion_id', promotionIds);

          if (promoStateError) {
            throw new Error(
              `Failed to load promotion archive states: ${promoStateError.message}`,
            );
          }

          const archivedAtByPromotionId = new Map<string, string | null>(
            (promoStateRows ?? []).map((row: any) => [
              row.promotion_id as string,
              (row.archived_at as string | null) ?? null,
            ]),
          );

          const promotionsForArchive = promotionIds.map((id) => ({
            id,
            archivedAt: archivedAtByPromotionId.get(id) ?? null,
          }));

          const fullPromotionArchive = await getPromotionArchiveContextsForViewer(
            promotionsForArchive,
            viewerId,
          );
          promotionArchiveById = new Map(
            Array.from(fullPromotionArchive.entries()).map(([id, ctx]) => [
              id,
              { isArchived: !!ctx.isArchived },
            ]),
          );
        }
        // NOTE: videos fetched with '*' (not a narrow column list) because
        // resolveThumbnail()/renderContentIdentity() are canonical helpers
        // from videoFormatters.ts whose exact field dependencies aren't
        // known from this file alone — same defensive posture InDepthAnalytics
        // takes by passing a full Video row into these helpers.
        const [videosRes, libraryRes] = await Promise.all([
          videoIds.length
            ? supabase
                .from('videos')
                .select('*')
                .in('id', videoIds)
            : Promise.resolve({ data: [] as any[] }),
          assetIds.length
            ? supabase
                .from('assets')
                .select(
                  'id, asset_type, created_at, videos(video_title, thumbnail_url, platform), asset_resources(title, thumbnail_url, platform, resource_type), campaign_element_assets(display_name, element_type)',
                )
                .in('id', assetIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        // Content Owner — same profiles.select('id, email, full_name').in('id', ...)
        // pattern getPromotionLevelMetricsForOrg() (getTopPromotionsAnalytics.ts)
        // already uses to resolve marketer identity. No new identity system.
        const videoOwnerIds = Array.from(
          new Set((videosRes.data ?? []).map((v: any) => v.user_id).filter(Boolean)),
        );
        const { data: ownerProfiles } = videoOwnerIds.length
          ? await supabase
              .from('profiles')
              .select('id, email, full_name')
              .in('id', videoOwnerIds)
          : { data: [] as any[] };
        const profileByUserId = new Map((ownerProfiles ?? []).map((p: any) => [p.id, p]));

        const assetDisplay = new Map<
        string,
        {
          title?: string | null;
          thumbnail_url?: string | null;
          asset_type?: string;
          platform?: string | null;
          created_at?: string | null
        }
        >();
        for (const row of libraryRes.data ?? []) {
          const v = Array.isArray(row.videos) ? row.videos[0] : row.videos;
          // FIX: asset_resources was never normalized for array-vs-object
          // like videos/campaign_element_assets already were — PostgREST
          // embeds can come back as an array here too, which silently
          // broke every Resource-type title/thumbnail.
          const res = Array.isArray(row.asset_resources) ? row.asset_resources[0] : row.asset_resources;
          const el = Array.isArray(row.campaign_element_assets)
            ? row.campaign_element_assets[0]
            : row.campaign_element_assets;

          // Thumbnail: same 3-way branch AssetPicker.tsx's fromMyRow() uses.
          // No new resolution system — this is the existing canonical logic,
          // just applied here instead of only in the picker components.
          let thumbnailUrl: string | null = null;
          if (row.asset_type === 'campaign_element') {
            thumbnailUrl = resolveElementThumbnail(
              (el?.element_type ?? 'landing_page') as CampaignElementType,
            );
          } else if (row.asset_type === 'resource') {
            thumbnailUrl = resolveAssetThumbnail({
              thumbnail_url: res?.thumbnail_url ?? null,
              resource_type: (res?.resource_type ?? 'other') as ResourceType,
              platform: res?.platform ?? null,
            });
          } else {
            // Type 2 — video asset. Uses resolveThumbnail() for the
            // same platform-image fallback the Content column already gets.
            thumbnailUrl = resolveThumbnail({
              thumbnail_url: v?.thumbnail_url ?? res?.thumbnail_url ?? null,
              platform: v?.platform ?? null,
            });
          }

          assetDisplay.set(row.id, {
            title: v?.video_title ?? res?.title ?? el?.display_name ?? null,
            thumbnail_url: thumbnailUrl,
            platform: row.asset_type === 'campaign_element' ? null : (v?.platform ?? res?.platform ?? null),
            asset_type: row.asset_type,
            created_at: row.created_at ?? null,
          });
        }

    const videoDisplay = new Map<string, { title: React.ReactNode; thumbnail_url?: string; platform?: string | null; created_at?: string | null; content_owner_id?: string | null; content_owner_name?: string | null }>();
    for (const v of videosRes.data ?? []) {
      const ownerProfile = v.user_id ? profileByUserId.get(v.user_id) : null;
      videoDisplay.set(v.id, {
        // Canonical helpers, same call signature InDepthAnalytics uses
        // (resolveThumbnail(row.video) / renderContentIdentity(row.video)).
        title: renderContentIdentity(v),
        thumbnail_url: resolveThumbnail(v),
        platform: v.platform ?? null,
        created_at: v.created_at ?? null,
        content_owner_id: v.user_id ?? null,
        content_owner_name: ownerProfile?.full_name?.trim() || ownerProfile?.email || null,
      });
    }

        const mapped: AssetAnalyticsRow[] = result.rows.map((r) => {
          const a = assetDisplay.get(r.asset_id);
          const v = videoDisplay.get(r.video_id);
          return {
            asset: {
              id: r.asset_id,
              title: a?.title ?? undefined,
              thumbnail_url: a?.thumbnail_url ?? undefined,
              asset_type: toAssetTypeTag(r.asset_type),
              platform: a?.platform ?? null,
              created_at: a?.created_at ?? null,
            },
            promoting_video: {
              id: r.video_id,
              title: v?.title ?? undefined,
              thumbnail_url: v?.thumbnail_url ?? undefined,
              platform: v?.platform ?? null,
              created_at: v?.created_at ?? null,
              content_owner_id: v?.content_owner_id ?? null,
              content_owner_name: v?.content_owner_name ?? null,
            },
            campaign_id: r.campaignIds?.[0] ?? null,
            promotion_id: r.promotionIds?.[0] ?? null,
            assetOrganizationId: r.assetOrganizationId,
            isAssigned: r.isAssigned,
              archive: {
              isArchived: !!r.archive?.isArchived,
              reasons: r.archive?.reasons ?? [],
            },
            videoArchive: {
              isArchived: !!videoArchiveById.get(r.video_id)?.isArchived,
            },

            campaignArchive: {
              isArchived: !!(
                (r.campaignIds?.[0]
                  ? campaignArchiveById.get(r.campaignIds[0])?.isArchived
                  : false)
              ),
            },

            promotionArchive: {
              isArchived: !!(
                r.promotionIds?.[0]
                  ? promotionArchiveById.get(r.promotionIds[0])?.isArchived
                  : false
              ),
            },


            asset_clicks: r.metrics.clicks ?? 0,
            metrics: toTableMetrics(r.metrics),
          };
        });
        setRows(mapped);

      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opts.dateRange, opts.customRange, opts.activeSource]);

  return { rows, loading, error, organizationId };
}



function useCampaignOptions(): Campaign[] {
  // Same query InDepthAnalytics.tsx already uses — no new scope invented.
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!cancelled) setCampaigns(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return campaigns;
}

function usePromotionOptions(rows: AssetAnalyticsRow[]): PromotionOption[] {
  // Ownership boundary intentionally NOT decided here — see
  // ASSET_ANALYTICS_DESIGN 3.md §3 "Ownership". Rather than guess a scope
  // (organization_id alone is explicitly flagged there as wrong for
  // Promotions), this derives options ONLY from promotion_ids already
  // present in `rows` — i.e. whatever scope getAssetAnalyticsRows already
  // enforced upstream. This never widens visibility beyond what's already
  // on screen; it only attaches a display name to ids already there.
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const presentPromotionIds = useMemo(() => {
    const seen = new Set<string>();
    rows.forEach(r => {
      if (r.promotion_id) seen.add(r.promotion_id);
    });
    return Array.from(seen);
  }, [rows]);

  useEffect(() => {
    if (presentPromotionIds.length === 0) {
      setNames(new Map());
      return;
    }
    let cancelled = false;
    // Confirmed source (getTopPromotionsAnalytics.ts TITLE NOTE):
    // promotions has NO title column. Real name = assignments.title,
    // fallback campaigns.campaign_name. Do not reintroduce promotion_name.
    (async () => {
      const { data: promoRows } = await supabase
        .from('promotions')
        .select('id, assignment_id, campaign_id')
        .in('id', presentPromotionIds);

      const assignmentIds = Array.from(new Set((promoRows ?? []).map((p: any) => p.assignment_id).filter(Boolean)));
      const campaignIds = Array.from(new Set((promoRows ?? []).map((p: any) => p.campaign_id).filter(Boolean)));

      const [{ data: assignmentRows }, { data: campaignRows }] = await Promise.all([
        assignmentIds.length ? supabase.from('assignments').select('id, title').in('id', assignmentIds) : Promise.resolve({ data: [] as any[] }),
        campaignIds.length ? supabase.from('campaigns').select('id, campaign_name').in('id', campaignIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;
      const titleByAssignmentId = new Map((assignmentRows ?? []).map((a: any) => [a.id, a.title as string]));
      const nameByCampaignId = new Map((campaignRows ?? []).map((c: any) => [c.id, c.campaign_name as string]));

      const next = new Map<string, string>();
      for (const p of promoRows ?? []) {
        const name = (p.assignment_id && titleByAssignmentId.get(p.assignment_id)) ?? (p.campaign_id && nameByCampaignId.get(p.campaign_id)) ?? null;
        if (name) next.set(p.id, name);
      }
      setNames(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [presentPromotionIds.join(',')]);

  return presentPromotionIds.map(id => ({ id, name: names.get(id) ?? id }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AllAssetsAnalytics() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Filter state (before data hook so date/source drive fetch) ───────────
  const [dateRange, setDateRange]         = useState<DateRange>('30days');
  const [customRange, setCustomRange]     = useState<CustomDateRange | null>(null);
  const [selectedCampaignId, setSelectedCampaignId]   = useState<string>('all');
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<string[]>([]);
  const togglePromotionId = (id: string) => {
    setSelectedPromotionIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };
  const [selectedContentOwnerId, setSelectedContentOwnerId] = useState<string>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(true);

  // Mobile landscape: hide header/chart/tabs entirely so the table/cards
  // get the full screen. Only fires below the lg breakpoint — desktop
  // (always "landscape" in the literal sense) is unaffected.
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px) and (orientation: landscape)');
    const update = () => setIsMobileLandscape(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'cards' | 'table'>('cards');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [activeSource, setActiveSource]   = useState<RevenueView>('total');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<AssetTypeTag[]>([]);
  // All/My/Shared/Assigned — asset-level ownership scope, per
  // ASSET_ANALYTICS_DESIGN_6.md confirmed model. Distinct from Marketplace's
  // Promotion-level scopes (My Promotions etc.) — do not conflate.
  const [selectedAssetSource, setSelectedAssetSource] = useState<'all' | 'my' | 'shared' | 'assigned'>('all');
  const [hideArchivedAsset, setHideArchivedAsset] = useState(false);
  const [hideArchivedVideo, setHideArchivedVideo] = useState(false);
  const [hideArchivedCampaign, setHideArchivedCampaign] = useState(false);
  const [hideArchivedPromotion, setHideArchivedPromotion] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'asset_created_at',
    direction: 'desc',
  });
  
  const { rows, loading, error, organizationId } = useAssetAnalyticsRows({
    dateRange,
    customRange,
    activeSource,
  });
  const campaigns = useCampaignOptions();

  const campaignNameById = useMemo(
    () => new Map(campaigns.map(c => [c.id, c.campaign_name])),
    [campaigns]
  );

  const promotions = usePromotionOptions(rows);
  const promotionNameById = useMemo(
    () => new Map(promotions.map(p => [p.id, p.name])),
    [promotions]
  );
  // ── Promotion filter panel state ────────────────────────────────────────
  // Button + panel replacing the old plain <select>, mirroring the Columns
  // dropdown pattern below (same ref/outside-click hook). [All] behaves
  // exactly as before. Assigned to Me / Assigned by Me add a person →
  // promotions drill-down, sourced from getPromotionAssignmentGroups().
  const [promotionPanelOpen, setPromotionPanelOpen] = useState(false);
  const promotionPanelRef = useRef<HTMLDivElement>(null);
  const [promotionTab, setPromotionTab] = useState<'all' | 'toMe' | 'byMe'>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [assignmentGroups, setAssignmentGroups] = useState<PromotionAssignmentGroups | null>(null);
  const [assignmentGroupsLoading, setAssignmentGroupsLoading] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (promotionPanelRef.current && !promotionPanelRef.current.contains(e.target as Node)) {
        setPromotionPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Lazy-load on first open only — never refetched just for switching tabs.
  useEffect(() => {
    if ((!promotionPanelOpen && !mobileMenuOpen) || assignmentGroups || assignmentGroupsLoading || !user?.id) return;
    setAssignmentGroupsLoading(true);
    getPromotionAssignmentGroups(user.id)
      .then(setAssignmentGroups)
      .catch(() => setAssignmentGroups({ assignedToMe: [], assignedByMe: [] }))
      .finally(() => setAssignmentGroupsLoading(false));
  }, [promotionPanelOpen, mobileMenuOpen, assignmentGroups, assignmentGroupsLoading, user?.id]);

  const activeGroupList: AssignmentGroup[] =
    promotionTab === 'toMe' ? assignmentGroups?.assignedToMe ?? []
    : promotionTab === 'byMe' ? assignmentGroups?.assignedByMe ?? []
    : [];

  const selectedPerson = activeGroupList.find(g => g.person.id === selectedPersonId) ?? null;

  const selectedPromotionLabel =
    selectedPromotionIds.length === 0
      ? 'All Promotions'
      : selectedPromotionIds.length === 1
        ? promotionNameById.get(selectedPromotionIds[0]) ?? selectedPromotionIds[0]
        : `${selectedPromotionIds.length} Promotions`;

  // Content Marketer options — derived from rows already on screen, same
  // conservative approach usePromotionOptions() uses. Keyed by
  // content_owner_id (videos.user_id), never by display name, so two
  // people sharing a name can't collide and a later name change can't
  // break the filter.
  const contentOwners = useMemo(() => {
    const byId = new Map<string, string>();
    rows.forEach(row => {
      const id = row.promoting_video.content_owner_id;
      if (!id) return;
      if (!byId.has(id)) {
        byId.set(id, row.promoting_video.content_owner_name || 'Unknown');
      }
    });
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // ── Columns dropdown state ──────────────────────────────────────────────
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => handleSortToggle(prev, key));
  };

  // ── Date bounds — UI-only, same helper InDepthAnalytics uses ────────────
  const dateRangeBounds = useMemo(() => getDateBounds(dateRange, customRange), [dateRange, customRange]);

  // ── Asset source filter — My/Shared/Assigned. My/Shared are mutually
  // exclusive (org boundary); Assigned is an annotation on My, never a
  // separate source — an asset can be My + Assigned at once.
  const assetSourceFilteredRows = useMemo(() => {
    if (selectedAssetSource === 'all' || !organizationId) return rows;
    return rows.filter(row => {
      const isMy = row.assetOrganizationId === organizationId;
      if (selectedAssetSource === 'my') return isMy;
      if (selectedAssetSource === 'shared') return !isMy;
      if (selectedAssetSource === 'assigned') return isMy && row.isAssigned;
      return true;
    });
  }, [rows, selectedAssetSource, organizationId]);

  // ── Asset type filter (applied after fetch, pure UI — no-op while rows=[]) ─
  const typeFilteredRows = useMemo(() => {
    if (selectedAssetTypes.length === 0) return assetSourceFilteredRows;
    return assetSourceFilteredRows.filter(row => selectedAssetTypes.includes(row.asset.asset_type));
  }, [assetSourceFilteredRows, selectedAssetTypes]);

  // ── Platform filter (applied after fetch, pure UI — no-op while rows=[]) ─
  const platformFilteredRows = useMemo(() => {
    if (selectedPlatforms.length === 0) return typeFilteredRows;
    return typeFilteredRows.filter(row => selectedPlatforms.includes(row.promoting_video.platform ?? 'youtube'));
  }, [typeFilteredRows, selectedPlatforms]);

  const presentPlatforms = useMemo(() => {
    const seen = new Set<string>();
    rows.forEach(row => seen.add(row.promoting_video.platform ?? 'youtube'));
    return Array.from(seen).sort();
  }, [rows]);

  // ── Campaign filter — real filter now. row.campaign_id was already
  // being populated by the identity-enrichment layer (r.campaignIds?.[0]);
  // it was computed but never consumed until this edit.
  const campaignFilteredRows = useMemo(() => {
    if (selectedCampaignId === 'all') return platformFilteredRows;
    return platformFilteredRows.filter(row => row.campaign_id === selectedCampaignId);
  }, [platformFilteredRows, selectedCampaignId]);

  // ── Promotion filter — same shape as Campaign. See usePromotionOptions()
  // above for why the OPTIONS list is scope-conservative; the filter
  // itself is just an equality check on data already on each row.
  const promotionFilteredRows = useMemo(() => {
    if (selectedPromotionIds.length === 0) return campaignFilteredRows;
        return campaignFilteredRows.filter(
      row => row.promotion_id != null && selectedPromotionIds.includes(row.promotion_id),
    );
  }, [campaignFilteredRows, selectedPromotionIds]);

  // ── Content Marketer filter — operates on videos.user_id via
  // content_owner_id, never on the display name. Chained last, right
  // before sort, so Recently Added / metric sorts always run on the
  // fully-filtered set.
  const contentOwnerFilteredRows = useMemo(() => {
    if (selectedContentOwnerId === 'all') return promotionFilteredRows;
    return promotionFilteredRows.filter(row => row.promoting_video.content_owner_id === selectedContentOwnerId);
  }, [promotionFilteredRows, selectedContentOwnerId]);

  const archiveFilteredRows = useMemo(
    () =>
      applyAnalyticsArchiveFilters(
        contentOwnerFilteredRows,
        (row) => ({
          assetArchived: row.archive.isArchived,
          videoArchived: row.videoArchive.isArchived,
          campaignArchived: row.campaignArchive.isArchived,
          promotionArchived: row.promotionArchive.isArchived,
        }),
        {
          hideArchivedAsset,
          hideArchivedVideo,
          hideArchivedCampaign,
          hideArchivedPromotion,
        },
      ),
    [
      contentOwnerFilteredRows,
      hideArchivedAsset,
      hideArchivedVideo,
      hideArchivedCampaign,
      hideArchivedPromotion,
    ],
  );
  const sortedRows = useMemo(() => {
    const key = sortConfig.key;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    if (key === 'asset_created_at') {
      return [...archiveFilteredRows].sort((a, b) => {
        const at = a.promoting_video.created_at ? new Date(a.promoting_video.created_at).getTime() : 0;
        const bt = b.promoting_video.created_at ? new Date(b.promoting_video.created_at).getTime() : 0;
        if (at === bt) return 0;
        return at > bt ? dir : -dir;
      });
    }
    // asset_clicks lives on row.asset_clicks, not row.metrics (it's not a
    // MetricType key), so it needs the same kind of special case as
    // asset_created_at above rather than the generic metrics[key] branch.
    if (key === 'asset_clicks') {
      return [...archiveFilteredRows].sort((a, b) => {
        const av = Number(a.asset_clicks ?? 0);
        const bv = Number(b.asset_clicks ?? 0);
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
      });
    }

    // Asset column — groups identical assets together. Sorted by asset
    // title (case-insensitive); ties broken by asset id so rows for the
    // same asset always land next to each other.
    if (key === 'asset') {
      return [...archiveFilteredRows].sort((a, b) => {
        if (a.asset.id === b.asset.id) return 0;
        const at = (a.asset.title ?? '').toLowerCase();
        const bt = (b.asset.title ?? '').toLowerCase();
        if (at !== bt) return at > bt ? dir : -dir;
        return a.asset.id > b.asset.id ? dir : -dir;
      });
    }

    return [...archiveFilteredRows].sort((a, b) => {
      const av = Number(a.metrics[key as MetricType] ?? 0);
      const bv = Number(b.metrics[key as MetricType] ?? 0);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [archiveFilteredRows, sortConfig]);

  const colSpan = 7 + TABLE_COLUMNS.length + 1 + (visibleColumns.has('promotion') ? 1 : 0); // Asset + Type + Content + Content Owner + Asset Clicks + Total Revenue (dup) + metrics + trailing spacer + optional Promotion

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        className={`${mobileFiltersOpen ? 'flex' : 'hidden'} lg:flex w-80 bg-zinc-950 border-r border-zinc-900 flex-col shrink-0 fixed inset-y-0 left-0 lg:static z-50`}
      >
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar space-y-8">

          {/* Date range */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Date Range
            </label>
            <div className="relative">
              <select
                value={dateRange}
                onChange={e => {
                  const v = e.target.value as DateRange;
                  setDateRange(v);
                  if (v !== 'custom') setCustomRange(null);
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="2months">Last 2 Months</option>
                <option value="6months">Last 6 Months</option>
                <option value="1year">Last Year</option>
                <option value="all">Lifetime</option>
                <option value="custom">Custom Range</option>
              </select>
              <Calendar size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            </div>

            {dateRange === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1.5 block">
                    Start
                  </label>
                  <input
                    type="date"
                    value={typeof customRange?.start === 'string' ? customRange.start : ''}
                    max={typeof customRange?.end === 'string' ? customRange.end : undefined}
                    onChange={e => {
                      const start = e.target.value;
                      setCustomRange(prev => ({
                        start,
                        end: (typeof prev?.end === 'string' && prev.end) || start,
                      }));
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-red-600 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1.5 block">
                    End
                  </label>
                  <input
                    type="date"
                    value={typeof customRange?.end === 'string' ? customRange.end : ''}
                    min={typeof customRange?.start === 'string' ? customRange.start : undefined}
                    onChange={e => {
                      const end = e.target.value;
                      setCustomRange(prev => ({
                        start: (typeof prev?.start === 'string' && prev.start) || end,
                        end,
                      }));
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-red-600 [color-scheme:dark]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Campaign */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Campaign
            </label>
            <div className="relative">
              <select
                value={selectedCampaignId}
                onChange={e => setSelectedCampaignId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer truncate pr-10"
              >
                <option value="all">All Campaigns</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.campaign_name}</option>
                ))}
              </select>
              <Briefcase size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            </div>
          </div>

          {/* Promotion — button + panel (mirrors Columns dropdown pattern).
              [All] behaves exactly as the old <select> did. Assigned to Me /
              Assigned by Me add a person → promotions drill-down, sourced
              from getPromotionAssignmentGroups(). */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Promotion
            </label>
            <div className="relative" ref={promotionPanelRef}>
              <button
                onClick={() => setPromotionPanelOpen(o => !o)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all truncate ${
                  promotionPanelOpen
                    ? 'bg-zinc-800 border-zinc-700 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0 truncate">
                  <Megaphone size={12} className="shrink-0 text-zinc-600" />
                  <span className="truncate">{selectedPromotionLabel}</span>
                </span>
                <ChevronDown size={11} className={`shrink-0 transition-transform ${promotionPanelOpen ? 'rotate-180' : ''}`} />
              </button>

              {promotionPanelOpen && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-zinc-800">
                    {([
                      { key: 'all', label: 'All' },
                      { key: 'toMe', label: 'Assigned to Me' },
                      { key: 'byMe', label: 'Assigned by Me' },
                    ] as const).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => {
                          setPromotionTab(tab.key);
                          setSelectedPersonId(null);
                          if (tab.key === 'all') {
                            setSelectedPromotionIds([]);
                            setPromotionPanelOpen(false);
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                          promotionTab === tab.key ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {promotionTab === 'all' && (
                    <div className="max-h-72 overflow-y-auto py-2">
                      <button
                        onClick={() => { setSelectedPromotionIds([]); setPromotionPanelOpen(false); }}
                        className="w-full text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 transition-colors"
                      >
                        All Promotions
                      </button>
                      {promotions.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedPromotionIds([p.id]); setPromotionPanelOpen(false); }}
                          className="w-full text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 transition-colors truncate"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {(promotionTab === 'toMe' || promotionTab === 'byMe') && (
                    <div className="max-h-72 overflow-y-auto py-2">
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

                      {!assignmentGroupsLoading && !selectedPerson && activeGroupList.map(group => (
                        <button
                          key={group.person.id}
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
                            {group.promotions.length} Promotion{group.promotions.length === 1 ? '' : 's'} →
                          </span>
                        </button>
                      ))}

                      {!assignmentGroupsLoading && selectedPerson && (
                        <div>
                          <button
                            onClick={() => setSelectedPersonId(null)}
                            className="w-full flex items-center gap-1.5 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                          >
                            <ChevronLeft size={11} />
                            {selectedPerson.person.name}
                          </button>
                          {selectedPerson.promotions.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setSelectedPromotionIds([p.id]);
                                setPromotionPanelOpen(false);
                                setSelectedPersonId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 transition-colors truncate"
                            >
                              {promotionNameById.get(p.id) ?? (p.assignment?.title ?? p.id)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Content Marketer — filters by videos.user_id (content_owner_id),
              never by display name. Same identity resolved for the
              Content Owner column. */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Content Marketer
            </label>
            <div className="relative">
              <select
                value={selectedContentOwnerId}
                onChange={e => setSelectedContentOwnerId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer truncate pr-10"
              >
                <option value="all">All Content Marketers</option>
                {contentOwners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <User size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            </div>
          </div>

          {/* Asset Type — real filter now. Multi-select pills, AND-combined
              with the platform pills in the header. Counts computed off the
              full unfiltered `rows`, same convention platform pills use. */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-1.5">
              <Boxes size={11} />
              Asset Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ASSET_TYPES.map(t => {
                const active = selectedAssetTypes.includes(t);
                const count  = rows.filter(r => r.asset.asset_type === t).length;
                return (
                  <button
                    key={t}
                    onClick={() =>
                      setSelectedAssetTypes(prev =>
                        prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t],
                      )
                    }
                    className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                      active
                        ? ASSET_TYPE_COLORS[t].replace('/10', '/20')
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {ASSET_TYPE_LABELS[t]}
                    <span className={`text-[8px] px-1 py-0.5 rounded font-black ${
                      active ? 'bg-black/20' : 'bg-zinc-800 text-zinc-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Asset ownership scope — confirmed model, see
              ASSET_ANALYTICS_DESIGN_6.md session addendum. Assigned is an
              annotation on My, not a separate source (an asset can be
              My + Assigned at once) — hence 4 buttons, not exclusive tabs
              in the database sense, just a UI selector over the derived flags. */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Asset Scope
            </label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: 'all', label: 'All' },
                { key: 'my', label: 'My' },
                { key: 'shared', label: 'Shared' },
                { key: 'assigned', label: 'Assigned' },
              ] as const).map(opt => {
                const active = selectedAssetSource === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSelectedAssetSource(opt.key)}
                    className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                      active
                        ? 'bg-red-600/20 border-red-600/40 text-red-400'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Entity Archive soft filters — default OFF (show archived). */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Hide Archived
            </label>
            <div className="space-y-1.5">
              {([
                { key: 'asset', label: 'Asset', value: hideArchivedAsset, set: setHideArchivedAsset },
                { key: 'video', label: 'Content', value: hideArchivedVideo, set: setHideArchivedVideo },
                { key: 'campaign', label: 'Campaign', value: hideArchivedCampaign, set: setHideArchivedCampaign },
                { key: 'promotion', label: 'Promotion', value: hideArchivedPromotion, set: setHideArchivedPromotion },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => opt.set(!opt.value)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all ${
                    opt.value
                      ? 'bg-red-600/20 border-red-600/40 text-red-400'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      opt.value
                        ? 'bg-red-600 border-red-600'
                        : 'border-zinc-700 bg-zinc-950'
                    }`}
                  >
                    {opt.value && <Check size={10} className="text-white" />}
                  </div>

                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">

        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-[9500] flex flex-col justify-end bg-black/70">
            <div
              className="max-h-[85vh] bg-zinc-950 border-t border-zinc-800 rounded-t-3xl overflow-y-auto custom-scrollbar px-6 pt-5 pb-8 space-y-8"
            >
              {/* Header row: title + close */}
              <div className="flex items-center justify-between sticky top-0 bg-zinc-950 pb-3 -mt-5 pt-5 -mx-6 px-6 border-b border-zinc-900">
                <span className="text-xs font-black uppercase tracking-widest text-white">Filters & Sort</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Date Range */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Date Range
                </label>
                <select
                  value={dateRange}
                  onChange={e => {
                    const v = e.target.value as DateRange;
                    setDateRange(v);
                    if (v !== 'custom') setCustomRange(null);
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer"
                >
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="2months">Last 2 Months</option>
                  <option value="6months">Last 6 Months</option>
                  <option value="1year">Last Year</option>
                  <option value="all">Lifetime</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {/* Campaign */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Campaign
                </label>
                <select
                  value={selectedCampaignId}
                  onChange={e => setSelectedCampaignId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer truncate"
                >
                  <option value="all">All Campaigns</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.campaign_name}</option>
                  ))}
                </select>
              </div>

                           {/* Promotion — All / Assigned to Me / Assigned by Me,
                  Marketplace.tsx pill style. Multi-select: tapping a
                  promotion toggles it in/out of selectedPromotionIds,
                  panel stays open so you can pick several. */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Promotion {selectedPromotionIds.length > 0 && `(${selectedPromotionIds.length})`}
                </label>

                <div className="flex items-center gap-2 flex-wrap">
                  {([
                    { key: 'all', label: 'All' },
                    { key: 'toMe', label: 'Assigned to Me' },
                    { key: 'byMe', label: 'Assigned by Me' },
                  ] as const).map(t => (
                    <button
                      key={t.key}
                      onClick={() => {
                        setPromotionTab(t.key);
                        setSelectedPersonId(null);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        promotionTab === t.key
                          ? 'bg-red-600 text-white'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                  {selectedPromotionIds.length > 0 && (
                    <button
                      onClick={() => setSelectedPromotionIds([])}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all text-zinc-500 hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {promotionTab === 'all' && (
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    {promotions.map(p => (
                      <button
                        key={p.id}
                        onClick={() => togglePromotionId(p.id)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all truncate max-w-[160px] flex items-center gap-1.5 ${
                          selectedPromotionIds.includes(p.id)
                            ? 'bg-red-600 text-white'
                            : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white'
                        }`}
                      >
                        {selectedPromotionIds.includes(p.id) && <Check size={10} />}
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}

                {(promotionTab === 'toMe' || promotionTab === 'byMe') && (
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    {assignmentGroupsLoading && (
                      <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Loading…</span>
                    )}
                    {!assignmentGroupsLoading && !selectedPerson && activeGroupList.length === 0 && (
                      <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Nobody here yet.</span>
                    )}
                    {!assignmentGroupsLoading && !selectedPerson && activeGroupList.map(group => (
                      <button
                        key={group.person.id}
                        onClick={() => setSelectedPersonId(group.person.id)}
                        className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white"
                      >
                        {group.person.name} ({group.promotions.length})
                      </button>
                    ))}
                  </div>
                )}

                {(promotionTab === 'toMe' || promotionTab === 'byMe') && selectedPerson && (
                  <div className="mt-2">
                    <button
                      onClick={() => setSelectedPersonId(null)}
                      className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors mb-1.5"
                    >
                      <ChevronLeft size={11} />
                      {selectedPerson.person.name}
                    </button>
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedPerson.promotions.map(p => (
                        <button
                          key={p.id}
                          onClick={() => togglePromotionId(p.id)}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all truncate max-w-[160px] flex items-center gap-1.5 ${
                            selectedPromotionIds.includes(p.id)
                              ? 'bg-red-600 text-white'
                              : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white'
                          }`}
                        >
                          {selectedPromotionIds.includes(p.id) && <Check size={10} />}
                          {promotionNameById.get(p.id) ?? (p.assignment?.title ?? p.id)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Content Marketer */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Content Marketer
                </label>
                <select
                  value={selectedContentOwnerId}
                  onChange={e => setSelectedContentOwnerId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer truncate"
                >
                  <option value="all">All Content Marketers</option>
                  {contentOwners.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Asset Type */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Asset Type
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ASSET_TYPES.map(t => {
                    const active = selectedAssetTypes.includes(t);
                    const count  = rows.filter(r => r.asset.asset_type === t).length;
                    return (
                      <button
                        key={t}
                        onClick={() =>
                          setSelectedAssetTypes(prev =>
                            prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t],
                          )
                        }
                        className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                          active
                            ? ASSET_TYPE_COLORS[t].replace('/10', '/20')
                            : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                        }`}
                      >
                        {ASSET_TYPE_LABELS[t]}
                        <span className={`text-[8px] px-1 py-0.5 rounded font-black ${active ? 'bg-black/20' : 'bg-zinc-800 text-zinc-600'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Asset Scope */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Asset Scope
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: 'all', label: 'All' },
                    { key: 'my', label: 'My' },
                    { key: 'shared', label: 'Shared' },
                    { key: 'assigned', label: 'Assigned' },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setSelectedAssetSource(opt.key)}
                      className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest ${
                        selectedAssetSource === opt.key
                          ? 'bg-red-600/20 border-red-600/40 text-red-400'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entity Archive soft filters — default OFF (show archived). */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Hide Archived
                </label>
                <div className="space-y-1.5">
                  {([
                    { key: 'asset', label: 'Asset', value: hideArchivedAsset, set: setHideArchivedAsset },
                    { key: 'video', label: 'Content', value: hideArchivedVideo, set: setHideArchivedVideo },
                    { key: 'campaign', label: 'Campaign', value: hideArchivedCampaign, set: setHideArchivedCampaign },
                    { key: 'promotion', label: 'Promotion', value: hideArchivedPromotion, set: setHideArchivedPromotion },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => opt.set(!opt.value)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all ${
                        opt.value
                          ? 'bg-red-600/20 border-red-600/40 text-red-400'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          opt.value
                            ? 'bg-red-600 border-red-600'
                            : 'border-zinc-700 bg-zinc-950'
                        }`}
                      >
                        {opt.value && <Check size={10} className="text-white" />}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Platform */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Platform
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedPlatforms([])}
                    className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest ${
                      selectedPlatforms.length === 0
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                    }`}
                  >
                    All
                    <span className="ml-1.5 text-[8px] px-1 py-0.5 rounded font-black bg-black/20">{rows.length}</span>
                  </button>
                  {presentPlatforms.map(p => {
                    const cfg = PLATFORM_CONFIG[p as Platform];
                    const active = selectedPlatforms.includes(p);
                    const count = rows.filter(r => (r.promoting_video.platform ?? 'youtube') === p).length;
                    return (
                      <button
                        key={p}
                        onClick={() =>
                          setSelectedPlatforms(prev =>
                            prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p],
                          )
                        }
                        style={active ? { backgroundColor: cfg?.color ?? '#dc2626', borderColor: cfg?.color ?? '#dc2626' } : {}}
                        className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                          active ? 'text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                        }`}
                      >
                        {cfg?.icon && <span className="opacity-70 text-[10px]">{cfg.icon}</span>}
                        {cfg?.label ?? p}
                        <span className="text-[8px] px-1 py-0.5 rounded font-black bg-black/20">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Source */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Source
                </label>
                <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
                  {(['total', 'pixel', 'stripe'] as RevenueView[]).map(v => (
                    <button
                      key={v}
                      onClick={() => setActiveSource(v)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                        activeSource === v ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Columns */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Columns
                </label>
                <div className="space-y-0.5">
                  {TABLE_COLUMNS.map(key => (
                    <button
                      key={key}
                      onClick={() => toggleColumn(key)}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800 text-left"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        visibleColumns.has(key) ? 'bg-red-600 border-red-600' : 'border-zinc-700 bg-zinc-950'
                      }`}>
                        {visibleColumns.has(key) && <Check size={9} className="text-white" />}
                      </div>
                      <span className="text-[10px] font-bold text-zinc-300 truncate">
                        {COLUMN_LABELS[key as MetricType]}
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => toggleColumn('promotion')}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800 text-left"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      visibleColumns.has('promotion') ? 'bg-red-600 border-red-600' : 'border-zinc-700 bg-zinc-950'
                    }`}>
                      {visibleColumns.has('promotion') && <Check size={9} className="text-white" />}
                    </div>
                    <span className="text-[10px] font-bold text-zinc-300 truncate">Promotion</span>
                  </button>
                </div>
              </div>

              {/* Sort */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                  Sort
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SORT_SHORTCUTS.map(s => (
                    <button
                      key={s.key}
                      onClick={() => setSortConfig({ key: s.key, direction: 'desc' })}
                      className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest ${
                        sortConfig.key === s.key
                          ? 'bg-red-600 border-red-600 text-white'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row count + Apply */}
              <div className="pt-2">
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3 rounded-xl bg-red-600 text-white text-[11px] font-black uppercase tracking-widest"
                >
                  Show {sortedRows.length} Rows
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────────── */}
        {!isMobileLandscape && (
        <header className="bg-zinc-950 border-b border-zinc-900 px-8 shrink-0">

          {/* Top row: nav + title + source toggle + columns + count */}
          <div className="h-20 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={() => navigate(-1)}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all flex items-center gap-2 cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                title="Sidebar filters"
                onClick={() => setMobileFiltersOpen(o => !o)}
                className="hidden lg:flex p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all"
              >
                <Filter size={20} />
              </button>
              <div className="hidden lg:block">
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                  Asset Analytics
                </h2>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                  Performance data per asset × promoting video
                </p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-3">
              {/* Source toggle */}
              <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                {(['total', 'pixel', 'stripe'] as RevenueView[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setActiveSource(v)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      activeSource === v ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* Columns dropdown */}
              <div className="relative" ref={columnsRef}>
                <button
                  onClick={() => setColumnsOpen(o => !o)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                    columnsOpen
                      ? 'bg-zinc-800 border-zinc-700 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Columns size={13} />
                  Columns
                  <ChevronDown size={11} className={`transition-transform ${columnsOpen ? 'rotate-180' : ''}`} />
                </button>

                {columnsOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 pt-4 pb-4">
                      <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-2">
                        Core Metrics
                      </p>
                      <div className="space-y-0.5">
                        {TABLE_COLUMNS.map(key => (
                          <button
                            key={key}
                            onClick={() => toggleColumn(key)}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                              visibleColumns.has(key)
                                ? 'bg-red-600 border-red-600'
                                : 'border-zinc-700 bg-zinc-950'
                            }`}>
                              {visibleColumns.has(key) && <Check size={9} className="text-white" />}
                            </div>
                            <span className="text-[10px] font-bold text-zinc-300 truncate">
                              {COLUMN_LABELS[key as MetricType]}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-2 mt-4">
                        Table Columns
                      </p>
                      <button
                        onClick={() => toggleColumn('promotion')}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                          visibleColumns.has('promotion') ? 'bg-red-600 border-red-600' : 'border-zinc-700 bg-zinc-950'
                        }`}>
                          {visibleColumns.has('promotion') && <Check size={9} className="text-white" />}
                        </div>
                        <span className="text-[10px] font-bold text-zinc-300 truncate">Promotion</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Row count */}
              <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-900 rounded-xl">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  {sortedRows.length} Rows
                </span>
              </div>
            </div>

            {/* Mobile-only: ☰ moved to top right */}
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              className="lg:hidden w-11 h-11 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg shrink-0"
            >
              <Menu size={20} />
            </button>
          </div>

          {/* Second row: platform filter + quick sort */}
          <div className="hidden lg:flex pb-4 flex-wrap items-center justify-between gap-3">

            {/* Platform filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setSelectedPlatforms([])}
                className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                  selectedPlatforms.length === 0
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                All
                <span className={`ml-1.5 text-[8px] px-1 py-0.5 rounded font-black ${
                  selectedPlatforms.length === 0 ? 'bg-black/20 text-white' : 'bg-zinc-800 text-zinc-600'
                }`}>
                  {rows.length}
                </span>
              </button>

              {presentPlatforms.map(p => {
                const cfg    = PLATFORM_CONFIG[p as Platform];
                const label  = cfg?.label ?? p;
                const color  = cfg?.color ?? '#dc2626';
                const active = selectedPlatforms.includes(p);
                const count  = rows.filter(r => (r.promoting_video.platform ?? 'youtube') === p).length;
                return (
                  <button
                    key={p}
                    onClick={() =>
                      setSelectedPlatforms(prev =>
                        prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p],
                      )
                    }
                    style={active ? { backgroundColor: color, borderColor: color } : {}}
                    className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                      active
                        ? 'text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {cfg?.icon && <span className="opacity-70 text-[10px]">{cfg.icon}</span>}
                    {label}
                    <span className={`text-[8px] px-1 py-0.5 rounded font-black ${
                      active ? 'bg-black/20 text-white' : 'bg-zinc-800 text-zinc-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick sort buttons */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-700 mr-1">
                Sort
              </span>
              {SORT_SHORTCUTS.map(s => {
                const active = sortConfig.key === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSortConfig({ key: s.key, direction: 'desc' })}
                    className={`h-7 px-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                      active
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

          </div>
        </header>
        )}

        {/* ── Mobile-only decorative chart — placeholder bars, not wired to
              real per-day data yet (rows here aren't bucketed by date).
              Swap the `chartBars` array for real daily-revenue totals
              later if needed. ─────────────────────────────────────────── */}
        {!isMobileLandscape && (
        <div className="lg:hidden px-4 pt-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Trend</span>
              <button
                onClick={() => setChartOpen(o => !o)}
                className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
              >
                {chartOpen ? 'Hide' : 'Show'}
              </button>
            </div>

            {chartOpen && (
              <div className="flex items-end gap-2.5 h-28 mt-3">
                {[35, 55, 45, 90, 65].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-md"
                    style={{
                      height: `${h}%`,
                      background: 'linear-gradient(180deg, #7c3aed 0%, #3b82f6 100%)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────────── */}
                {/* ── Mobile view tabs — mobile only, desktop keeps the table ─────── */}
        {!isMobileLandscape && (
        <div className="lg:hidden flex items-center gap-2 px-6 py-3 bg-zinc-950 border-b border-zinc-900">
          <button
            onClick={() => setMobileTab('cards')}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              mobileTab === 'cards' ? 'bg-red-600 text-white' : 'border border-zinc-800 text-zinc-500'
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setMobileTab('table')}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              mobileTab === 'table' ? 'bg-red-600 text-white' : 'border border-zinc-800 text-zinc-500'
            }`}
          >
            Table
          </button>
        </div>
        )}

        {/* ── Mobile card list — mobile only, Cards tab ───────────────────── */}
        {mobileTab === 'cards' && (
          <div className="lg:hidden flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {!loading && sortedRows.map(row => {
              const cardKey = `${row.asset.id}::${row.promoting_video.id}`;
              const isExpanded = expandedCards.has(cardKey);
              return (
                <div key={cardKey} className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <img
                      src={row.asset.thumbnail_url}
                      className="w-10 h-10 object-cover rounded-lg border border-zinc-800 shrink-0"
                      alt=""
                      onError={e => {
                        const t = e.currentTarget;
                        t.onerror = null;
                        t.src = `https://placehold.co/40x40/18181b/52525b?text=${encodeURIComponent(
                          (row.asset.platform ?? 'Asset').toUpperCase(),
                        )}`;
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{row.asset.title ?? 'Untitled asset'}</div>
                      <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${ASSET_TYPE_COLORS[row.asset.asset_type]}`}>
                        {ASSET_TYPE_LABELS[row.asset.asset_type]}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-zinc-900 pt-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-600 font-bold uppercase tracking-widest">Asset Clicks</span>
                      <span className="text-zinc-300 font-bold tabular-nums">{row.asset_clicks ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-600 font-bold uppercase tracking-widest">Total Revenue ($)</span>
                      <span className="text-zinc-300 font-bold tabular-nums">{row.metrics['total_revenue' as MetricType] ?? 0}</span>
                    </div>

                    {isExpanded && TABLE_COLUMNS.map(key => (
                      <div key={key} className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-600 font-bold uppercase tracking-widest">{COLUMN_LABELS[key as MetricType]}</span>
                        <span className="text-zinc-300 font-bold tabular-nums">{row.metrics[key] ?? 0}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() =>
                      setExpandedCards(prev => {
                        const next = new Set(prev);
                        next.has(cardKey) ? next.delete(cardKey) : next.add(cardKey);
                        return next;
                      })
                    }
                    className="w-full mt-3 py-2 rounded-lg border border-zinc-800 text-zinc-500 text-[9px] font-black uppercase tracking-widest"
                  >
                    {isExpanded ? 'Hide extra metrics' : 'Show all metrics'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className={`${mobileTab === 'table' ? 'block' : 'hidden'} lg:block flex-1 overflow-x-auto custom-scrollbar`}>
          <div className="inline-block min-w-full align-middle h-full overflow-y-auto">
            <table className="min-w-full divide-y divide-zinc-900 border-collapse">
              <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
                <tr>
                  {/* ── Asset identity column (sticky) — sortable/groupable ── */}
                  <th
                    onClick={() => handleSort('asset')}
                    className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[260px] sticky left-0 z-30 cursor-pointer hover:text-zinc-300 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Asset
                      <ArrowUpDown
                        size={10}
                        className={sortConfig.key === 'asset' ? 'text-white' : 'text-zinc-700'}
                      />
                    </div>
                  </th>

                  {/* ── Asset type badge column ────────────────────────────── */}
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[140px]">
                    Type
                  </th>

                  {/* ── Content column — the promoting video ──────────────── */}
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[260px]">
                    Promoting Content
                  </th>

                  {/* ── Content Owner column — owner of the promoting video ── */}
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[160px]">
                    Content Owner
                  </th>

                  {/* ── Promotion column — hidden by default. Uses
                      row.promotion_id exactly as getAssetAnalyticsRows
                      already exposes it (Mechanism B — see
                      ASSET_ANALYTICS_DESIGN_6.md session addendum).
                      This is NOT claimed to be the sole/authoritative
                      promotion for this (video,asset) pair — open
                      investigation still applies when promotion_id
                      is NULL. ─────────────────────────────────────── */}
                  {visibleColumns.has('promotion') && (
                    <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[160px]">
                      Promotion
                    </th>
                  )}

                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[140px]">
                    Campaign
                  </th>


                  {/* ── Asset Clicks — now sortable via the existing
                      handleSort/sortConfig mechanism (row.asset_clicks,
                      special-cased in sortedRows since it isn't a
                      MetricType key). Definition itself is unchanged —
                      see ASSET_ANALYTICS_DESIGN.md. ─────────────────────── */}
                  <th
                    onClick={() => handleSort('asset_clicks')}
                    className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[110px] cursor-pointer hover:text-zinc-300 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Asset Clicks
                      <ArrowUpDown
                        size={10}
                        className={sortConfig.key === 'asset_clicks' ? 'text-white' : 'text-zinc-700'}
                      />
                    </div>
                  </th>

                  {/* ── Total Revenue ($) — presentation duplicate of the
                      existing engine total_revenue column, pulled forward
                      next to Asset Clicks. Same metric, same label source,
                      no new calculation. Now sortable via the same
                      handleSort('total_revenue') key the engine column
                      below uses — clicking either header sorts the same
                      way, no second sort system. ─────────────────────────── */}
                  <th
                    onClick={() => handleSort('total_revenue')}
                    className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap cursor-pointer hover:text-zinc-300 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      {COLUMN_LABELS['total_revenue' as MetricType]}
                      <ArrowUpDown
                        size={10}
                        className={sortConfig.key === 'total_revenue' ? 'text-white' : 'text-zinc-700'}
                      />
                    </div>
                  </th>

                  {/* ── Engine metric columns — identical to InDepthAnalytics ── */}
                  {TABLE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 cursor-pointer hover:text-zinc-300 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1.5">
                        {COLUMN_LABELS[key as MetricType]}
                        <ArrowUpDown
                          size={10}
                          className={sortConfig.key === key ? 'text-white' : 'text-zinc-700'}
                        />
                      </div>
                    </th>
                  ))}

                  <th className="px-6 py-5 border-b border-zinc-900 bg-zinc-950" />
                </tr>
              </thead>

              <tbody className="bg-black divide-y divide-zinc-900">
                {loading && (
                  <tr>
                    <td colSpan={colSpan} className="px-6 py-16 text-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                        Loading…
                      </span>
                    </td>
                  </tr>
                )}

                {!loading && error && (
                  <tr>
                    <td colSpan={colSpan} className="px-6 py-20 text-center">
                      <div className="text-[11px] font-black uppercase tracking-widest text-red-500">
                        Failed to load asset analytics
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-2 max-w-md mx-auto">
                        {error}
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && !error && sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="px-6 py-20 text-center">
                      <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                        No asset × content pairs in this range
                      </div>
                      <div className="text-[10px] text-zinc-700 mt-2 max-w-md mx-auto">
                        No org-scoped redirect_links with asset_id were found
                        for the current filters. Zero-activity pairs still
                        appear when links exist — empty here means no
                        promotional asset links in scope.
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && sortedRows.map((row, rowIndex) => {
                  const prevRow = rowIndex > 0 ? sortedRows[rowIndex - 1] : null;
                  const showAssetCell =
                    sortConfig.key !== 'asset' || !prevRow || prevRow.asset.id !== row.asset.id;
                  return (
                  <tr
                    key={`${row.asset.id}::${row.promoting_video.id}`}
                    className="hover:bg-zinc-950 transition-colors group"
                  >
                    {/* ── Asset identity cell ─────────────────────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 z-10 bg-black group-hover:bg-zinc-950 transition-colors">
                      {showAssetCell && (
                      <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => navigate(`/assets/${row.asset.id}`)}
                      >
                        <img
                          src={row.asset.thumbnail_url}
                          className="w-16 h-9 object-cover rounded-lg border border-zinc-800 shrink-0"
                          alt=""
                          onError={e => {
                            const t = e.currentTarget;
                            t.onerror = null;
                            t.src = `https://placehold.co/64x36/18181b/52525b?text=${encodeURIComponent(
                              (row.asset.platform ?? 'Asset').toUpperCase(),
                            )}`;
                          }}
                        />
                        <div className="max-w-[190px] min-w-0">
                          <div className="text-xs font-bold truncate leading-snug">
                            {row.asset.title ?? 'Untitled asset'}
                          </div>
                          <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5 truncate">
                            Asset
                          </div>
                        </div>
                      </div>
                      )}
                    </td>

                    {/* ── Asset type badge cell ───────────────────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${ASSET_TYPE_COLORS[row.asset.asset_type]}`}
                      >
                        {ASSET_TYPE_LABELS[row.asset.asset_type]}
                      </span>
                    </td>

                    {/* ── Content cell — the promoting video ──────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => navigate(`/videos/${row.promoting_video.id}`)}
                      >
                        <img
                          src={row.promoting_video.thumbnail_url}
                          className="w-16 h-9 object-cover rounded-lg border border-zinc-800 shrink-0"
                          alt=""
                          onError={e => {
                            const t = e.currentTarget;
                            t.onerror = null;
                            t.src = `https://placehold.co/64x36/18181b/52525b?text=${encodeURIComponent(
                              (row.promoting_video.platform ?? 'post').toUpperCase(),
                            )}`;
                          }}
                        />
                        <div className="max-w-[190px] min-w-0">
                          <div className="text-xs font-bold truncate leading-snug">
                            {row.promoting_video.title ?? 'Untitled video'}
                          </div>
                          <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5 truncate">
                            {row.promoting_video.platform ?? 'Content'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* ── Content Owner cell ──────────────────────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400">
                      {row.promoting_video.content_owner_name ?? '—'}
                    </td>

                    {visibleColumns.has('promotion') && (() => {
                      // Real promotion name stays plain text (unchanged).
                      // My/Assigned + NULL render as a category badge — same
                      // visual pattern as the Type column (ASSET_TYPE_COLORS),
                      // just different colors so they're not mistaken for an
                      // asset type. Shared + NULL stays plain "—" — genuinely
                      // unresolved, not relabeled.
                      const isMy = organizationId != null && row.assetOrganizationId === organizationId;

                      if (row.promotion_id) {
                        const name = promotionNameById.get(row.promotion_id) ?? row.promotion_id;
                        return (
                          <td className="px-6 py-4">
                            <div className="max-w-[190px] truncate text-sm font-bold text-zinc-400" title={name}>
                              {name}
                            </div>
                          </td>
                        );
                      }
                      if (isMy && row.isAssigned) {
                        return (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest bg-cyan-500/10 border-cyan-500/30 text-cyan-400">
                              Assigned Asset
                            </span>
                          </td>
                        );
                      }
                      if (isMy) {
                        return (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest bg-rose-500/10 border-rose-500/30 text-rose-400">
                              My Asset
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td className="px-6 py-4">
                          <div className="max-w-[190px] truncate text-sm font-bold text-zinc-400">—</div>
                        </td>
                      );
                    })()}

                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400">
                      {(row.campaign_id && campaignNameById.get(row.campaign_id)) || '—'}
                    </td>

                    {/* ── Asset Clicks cell ───────────────────────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                      {row.asset_clicks ?? '—'}
                    </td>

                    {/* ── Total Revenue ($) — duplicate presentation cell,
                        same value as the engine total_revenue column below. */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                      {row.metrics['total_revenue' as MetricType] ?? 0}
                    </td>

                    {/* ── Engine metric cells ─────────────────────────────── */}
                    {TABLE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => (
                      <td
                        key={key}
                        className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums"
                      >
                        {row.metrics[key] ?? 0}
                      </td>
                    ))}

                    <td className="px-6 py-4" />
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}