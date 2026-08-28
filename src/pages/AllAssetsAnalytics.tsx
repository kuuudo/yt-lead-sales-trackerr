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

import {
  PLATFORM_CONFIG,
  type Platform,
} from '../lib/platformParser';

import {
  getAssetAnalyticsRows,
  type AssetAnalyticsTableRow,
} from '../services/asset/getAssetAnalyticsRows';

import {
  ChevronLeft, Filter, Columns, ChevronDown, ArrowUpDown, Boxes,
  Calendar, Briefcase, Megaphone, Check,
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

const DEFAULT_VISIBLE = new Set<string>([...TABLE_COLUMNS]);

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
}

interface AssetAnalyticsRow {
  asset:           AssetIdentity;
  promoting_video: PromotingVideoIdentity;
  campaign_id:     string | null;
  promotion_id:    string | null;
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
}): { rows: AssetAnalyticsRow[]; loading: boolean; error: string | null } {
  const [rows, setRows] = useState<AssetAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { organizationId, viewerId } = await resolveOrgAndViewer();

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

    const videoDisplay = new Map<string, { title: React.ReactNode; thumbnail_url?: string; platform?: string | null; created_at?: string | null }>();
    for (const v of videosRes.data ?? []) {
      videoDisplay.set(v.id, {
        // Canonical helpers, same call signature InDepthAnalytics uses
        // (resolveThumbnail(row.video) / renderContentIdentity(row.video)).
        title: renderContentIdentity(v),
        thumbnail_url: resolveThumbnail(v),
        platform: v.platform ?? null,
        created_at: v.created_at ?? null,
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
            },
            campaign_id: r.campaignIds?.[0] ?? null,
            promotion_id: r.promotionIds?.[0] ?? null,
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

  return { rows, loading, error };
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
    supabase
      .from('promotions')
      .select('id, promotion_name')
      .in('id', presentPromotionIds)
      .then(({ data }) => {
        if (cancelled) return;
        setNames(new Map((data ?? []).map((p: any) => [p.id, p.promotion_name as string])));
      });
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

  // ── Filter state (before data hook so date/source drive fetch) ───────────
  const [dateRange, setDateRange]         = useState<DateRange>('30days');
  const [customRange, setCustomRange]     = useState<CustomDateRange | null>(null);
  const [selectedCampaignId, setSelectedCampaignId]   = useState<string>('all');
  const [selectedPromotionId, setSelectedPromotionId] = useState<string>('all');
  const [activeSource, setActiveSource]   = useState<RevenueView>('total');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<AssetTypeTag[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total_revenue',
    direction: 'desc',
  });

  const { rows, loading, error } = useAssetAnalyticsRows({
    dateRange,
    customRange,
    activeSource,
  });
  const campaigns  = useCampaignOptions();
  const promotions = usePromotionOptions(rows);

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

  // ── Asset type filter (applied after fetch, pure UI — no-op while rows=[]) ─
  const typeFilteredRows = useMemo(() => {
    if (selectedAssetTypes.length === 0) return rows;
    return rows.filter(row => selectedAssetTypes.includes(row.asset.asset_type));
  }, [rows, selectedAssetTypes]);

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
    if (selectedPromotionId === 'all') return campaignFilteredRows;
    return campaignFilteredRows.filter(row => row.promotion_id === selectedPromotionId);
  }, [campaignFilteredRows, selectedPromotionId]);

  const sortedRows = useMemo(() => {
    const key = sortConfig.key;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    if (key === 'asset_created_at') {
      return [...promotionFilteredRows].sort((a, b) => {
        const at = a.promoting_video.created_at ? new Date(a.promoting_video.created_at).getTime() : 0;
        const bt = b.promoting_video.created_at ? new Date(b.promoting_video.created_at).getTime() : 0;
        if (at === bt) return 0;
        return at > bt ? dir : -dir;
      });
    }
    return [...promotionFilteredRows].sort((a, b) => {
      const av = Number(a.metrics[key as MetricType] ?? 0);
      const bv = Number(b.metrics[key as MetricType] ?? 0);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [promotionFilteredRows, sortConfig]);

  const colSpan = 4 + TABLE_COLUMNS.length + 1; // Asset + Content + Type + Asset Clicks + metrics + trailing spacer

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="w-80 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0 lg:relative z-50">
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

          {/* Promotion — new, not present in InDepthAnalytics */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
              Promotion
            </label>
            <div className="relative">
              <select
                value={selectedPromotionId}
                onChange={e => setSelectedPromotionId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-red-600 appearance-none cursor-pointer truncate pr-10"
              >
                <option value="all">All Promotions</option>
                {promotions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Megaphone size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
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

          {/* Reserved — All/My/Shared/Assigned scope tabs. Ownership chain
              (promotion creator → assignment → collaborator → marketer)
              still unconfirmed, see ASSET_ANALYTICS_DESIGN.md §3. */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-700 mb-3">
              Scope (reserved)
            </label>
            <p className="text-[9px] text-zinc-700 leading-relaxed">
              All / My / Shared / Assigned land here once the ownership
              boundary is confirmed against real data.
            </p>
          </div>

        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">

        {/* ── Header ─────────────────────────────────────────────────────── */}
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
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all hidden lg:flex"
              >
                <Filter size={20} />
              </button>
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                  Asset Analytics
                </h2>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                  Performance data per asset × promoting video
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
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
          </div>

          {/* Second row: platform filter + quick sort */}
          <div className="pb-4 flex flex-wrap items-center justify-between gap-3">

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

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-x-auto custom-scrollbar">
          <div className="inline-block min-w-full align-middle h-full overflow-y-auto">
            <table className="min-w-full divide-y divide-zinc-900 border-collapse">
              <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
                <tr>
                  {/* ── Asset identity column (sticky) ────────────────────── */}
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[260px] sticky left-0 z-30">
                    Asset
                  </th>

                  {/* ── Content column — the promoting video ──────────────── */}
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[260px]">
                    Content
                  </th>

                  {/* ── Asset type badge column ────────────────────────────── */}
                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[140px]">
                    Type
                  </th>

                  {/* ── Asset Clicks — placeholder, see header comment ─────── */}
                  <th
                    className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[110px]"
                    title="Definition not yet locked — see ASSET_ANALYTICS_DESIGN.md"
                  >
                    Asset Clicks
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

                {!loading && sortedRows.map(row => (
                  <tr
                    key={`${row.asset.id}::${row.promoting_video.id}`}
                    className="hover:bg-zinc-950 transition-colors group"
                  >
                    {/* ── Asset identity cell ─────────────────────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 z-10 bg-black group-hover:bg-zinc-950 transition-colors">
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

                    {/* ── Asset type badge cell ───────────────────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${ASSET_TYPE_COLORS[row.asset.asset_type]}`}
                      >
                        {ASSET_TYPE_LABELS[row.asset.asset_type]}
                      </span>
                    </td>

                    {/* ── Asset Clicks cell ───────────────────────────────── */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                      {row.asset_clicks ?? '—'}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}