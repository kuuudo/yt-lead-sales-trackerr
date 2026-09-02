// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsTest.tsx — PHASE 1: REAL DATA LOAD
//
// Visual laboratory that mirrors AllAssetsAnalytics column language.
// Loads real (asset × promoting video) rows via getAssetAnalyticsRows.
// NO attribution classifier (Phase 2+). Debug KPIs remain placeholders.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  TABLE_COLUMNS,
  COLUMN_LABELS,
  type MetricType,
  type RevenueView,
} from '../lib/analyticsEngine';
import {
  getAssetAnalyticsRows,
  type AssetAnalyticsTableRow,
} from '../services/asset/getAssetAnalyticsRows';

type AssetTypeTag = 'campaign_element' | 'promotional_video' | 'resource' | 'content_video';

const ASSET_TYPE_LABELS: Record<AssetTypeTag, string> = {
  campaign_element: 'Campaign Element',
  promotional_video: 'Promotional Video',
  resource: 'Resource',
  content_video: 'Content Video',
};

const ASSET_TYPE_COLORS: Record<AssetTypeTag, string> = {
  campaign_element: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
  promotional_video: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  resource: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  content_video: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
};

function toAssetTypeTag(assetType: string): AssetTypeTag {
  if (assetType === 'campaign_element') return 'campaign_element';
  if (assetType === 'resource') return 'resource';
  if (assetType === 'video') return 'promotional_video';
  return 'content_video';
}

/** Map AssetMetrics (5-key) into shared TABLE_COLUMNS shape — same bridge as production. */
function toTableMetrics(
  m: AssetAnalyticsTableRow['metrics'],
): Record<MetricType, number | string> {
  const base = {} as Record<MetricType, number | string>;
  for (const key of TABLE_COLUMNS) {
    base[key as MetricType] = 0;
  }
  if ('total_revenue' in base) base.total_revenue = m.revenue ?? 0;
  if ('rpc' in base) base.rpc = m.rpc ?? 0;
  if ('unique_clicks' in base) base.unique_clicks = m.clicks ?? 0;
  return base;
}

interface DisplayRow {
  assetId: string;
  assetTitle: string;
  assetType: AssetTypeTag;
  videoId: string;
  videoTitle: string;
  contentOwnerName: string | null;
  promotionLabel: string | null;
  assetCampaignLabel: string;
  contentCampaignLabel: string;
  assetClicks: number;
  metrics: Record<MetricType, number | string>;
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

export default function AnalyticsTest() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DisplayRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { organizationId, viewerId } = await resolveOrgAndViewer();

        const source: 'total' | 'pixel' | 'stripe' =
          activeSource === 'pixel' || activeSource === 'stripe' ? activeSource : 'total';

        // Same service + date preset path as AllAssetsAnalytics (no date picker UI).
        const result = await getAssetAnalyticsRows({
          organizationId,
          viewerId,
          dateRange: '30days',
          customRange: null,
          activeSource: source,
        });

        if (cancelled) return;

        const assetIds = Array.from(new Set(result.rows.map((r) => r.asset_id)));
        const videoIds = Array.from(new Set(result.rows.map((r) => r.video_id)));
        const campaignIds = Array.from(
          new Set(
            result.rows
              .flatMap((r) => [
                r.assetCampaign?.campaignId ?? null,
                // content campaign resolved from videos below
              ])
              .filter((id): id is string => !!id),
          ),
        );
        const promotionIds = Array.from(
          new Set(result.rows.flatMap((r) => r.promotionIds ?? []).filter(Boolean)),
        );

        const [videosRes, assetsRes, campaignsRes, promoRes, profilesRes] = await Promise.all([
          videoIds.length
            ? supabase.from('videos').select('id, video_title, user_id, campaign_id').in('id', videoIds)
            : Promise.resolve({ data: [] as any[], error: null }),
          assetIds.length
            ? supabase
                .from('assets')
                .select(
                  'id, asset_type, videos(video_title), asset_resources(title), campaign_element_assets(display_name)',
                )
                .in('id', assetIds)
            : Promise.resolve({ data: [] as any[], error: null }),
          campaignIds.length
            ? supabase.from('campaigns').select('id, campaign_name').in('id', campaignIds)
            : Promise.resolve({ data: [] as any[], error: null }),
          promotionIds.length
            ? supabase.from('promotions').select('id, assignment_id, campaign_id').in('id', promotionIds)
            : Promise.resolve({ data: [] as any[], error: null }),
          Promise.resolve({ data: [] as any[], error: null }),
        ]);

        if (videosRes.error) throw new Error(videosRes.error.message);
        if (assetsRes.error) throw new Error(assetsRes.error.message);

        const videoById = new Map((videosRes.data ?? []).map((v: any) => [v.id, v]));
        const ownerIds = Array.from(
          new Set((videosRes.data ?? []).map((v: any) => v.user_id).filter(Boolean)),
        );
        const { data: profiles } = ownerIds.length
          ? await supabase.from('profiles').select('id, email, full_name').in('id', ownerIds)
          : { data: [] as any[] };
        const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

        // Content campaign ids from videos — fetch names (owned names only; no privacy panel in Phase 1)
        const contentCampaignIds = Array.from(
          new Set(
            (videosRes.data ?? [])
              .map((v: any) => v.campaign_id)
              .filter((id: string | null): id is string => !!id),
          ),
        );
        const allCampaignIds = Array.from(new Set([...campaignIds, ...contentCampaignIds]));
        const { data: allCampaigns } = allCampaignIds.length
          ? await supabase.from('campaigns').select('id, campaign_name').in('id', allCampaignIds)
          : { data: [] as any[] };
        const campaignNameById = new Map(
          (allCampaigns ?? []).map((c: any) => [c.id, c.campaign_name as string]),
        );

        // Promotion display: assignment title preferred (same pattern as production)
        const assignmentIds = Array.from(
          new Set((promoRes.data ?? []).map((p: any) => p.assignment_id).filter(Boolean)),
        );
        const promoCampaignIds = Array.from(
          new Set((promoRes.data ?? []).map((p: any) => p.campaign_id).filter(Boolean)),
        );
        const [{ data: assignments }, { data: promoCampaigns }] = await Promise.all([
          assignmentIds.length
            ? supabase.from('assignments').select('id, title').in('id', assignmentIds)
            : Promise.resolve({ data: [] as any[] }),
          promoCampaignIds.length
            ? supabase.from('campaigns').select('id, campaign_name').in('id', promoCampaignIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const assignmentTitleById = new Map(
          (assignments ?? []).map((a: any) => [a.id, a.title as string]),
        );
        const promoCampaignNameById = new Map(
          (promoCampaigns ?? []).map((c: any) => [c.id, c.campaign_name as string]),
        );
        const promotionNameById = new Map<string, string>();
        for (const p of promoRes.data ?? []) {
          const name =
            (p.assignment_id && assignmentTitleById.get(p.assignment_id)) ||
            (p.campaign_id && promoCampaignNameById.get(p.campaign_id)) ||
            null;
          if (name) promotionNameById.set(p.id, name);
        }

        const assetTitleById = new Map<string, string>();
        for (const row of assetsRes.data ?? []) {
          const v = Array.isArray(row.videos) ? row.videos[0] : row.videos;
          const res = Array.isArray(row.asset_resources)
            ? row.asset_resources[0]
            : row.asset_resources;
          const el = Array.isArray(row.campaign_element_assets)
            ? row.campaign_element_assets[0]
            : row.campaign_element_assets;
          assetTitleById.set(
            row.id,
            v?.video_title ?? res?.title ?? el?.display_name ?? 'Untitled asset',
          );
        }

        // campaignsRes was partial; prefer allCampaigns map
        void campaignsRes;

        const mapped: DisplayRow[] = result.rows.map((r) => {
          const video = videoById.get(r.video_id);
          const owner = video?.user_id ? profileById.get(video.user_id) : null;
          const contentCampaignId = video?.campaign_id ?? null;
          const assetCampaignId = r.assetCampaign?.campaignId ?? null;
          const promoId = r.promotionIds?.[0] ?? null;

          let assetCampaignLabel = 'No Campaign';
          if (r.assetCampaign?.isCampaignFreeResource) {
            assetCampaignLabel = 'Campaign-Free Resource Asset';
          } else if (assetCampaignId) {
            assetCampaignLabel = campaignNameById.get(assetCampaignId) ?? assetCampaignId;
          }

          return {
            assetId: r.asset_id,
            assetTitle: assetTitleById.get(r.asset_id) ?? 'Untitled asset',
            assetType: toAssetTypeTag(r.asset_type),
            videoId: r.video_id,
            videoTitle: video?.video_title ?? 'Untitled video',
            contentOwnerName:
              owner?.full_name?.trim() || owner?.email || null,
            promotionLabel: promoId
              ? promotionNameById.get(promoId) ?? promoId
              : null,
            assetCampaignLabel,
            contentCampaignLabel: contentCampaignId
              ? campaignNameById.get(contentCampaignId) ?? contentCampaignId
              : 'No Campaign',
            assetClicks: r.metrics.clicks ?? 0,
            metrics: toTableMetrics(r.metrics),
          };
        });

        if (!cancelled) setRows(mapped);
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
  }, [activeSource, user?.id]);

  const metricKeys = useMemo(() => TABLE_COLUMNS as MetricType[], []);

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="bg-zinc-950 border-b border-zinc-900 px-8 shrink-0">
        <div className="h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="min-w-0">
              <h2 className="text-2xl font-black text-white uppercase tracking-tight truncate">
                Analytics Test
              </h2>
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                Phase 1 — real asset rows · attribution not implemented
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-3 py-2 bg-zinc-900/50 border border-zinc-900 rounded-xl">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                {loading ? '…' : `${rows.length} Rows`}
              </span>
            </div>
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
          </div>
        </div>
      </header>

      {/* ── Attribution debug strip (placeholders — Phase 2+) ───────────── */}
      <div className="px-8 py-4 border-b border-zinc-900 bg-zinc-950/50 shrink-0">
        <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-3">
          Attribution Debug (not implemented)
        </p>
        <div className="flex flex-wrap gap-6">
          {(
            [
              { label: 'Asset Revenue', value: '—' },
              { label: 'Content Revenue', value: '—' },
              { label: 'Unknown Revenue', value: '—' },
              { label: 'Overlap', value: '—' },
            ] as const
          ).map((kpi) => (
            <div key={kpi.label} className="min-w-[120px]">
              <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
                {kpi.label}
              </div>
              <div className="text-sm font-bold text-zinc-500 tabular-nums mt-1">
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-auto custom-scrollbar">
        <div className="inline-block min-w-full align-middle h-full overflow-y-auto">
          <table className="min-w-full divide-y divide-zinc-900 border-collapse">
            <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
              <tr>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[220px] sticky left-0 z-30">
                  Asset
                </th>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap">
                  Type
                </th>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[200px]">
                  Promoting Content
                </th>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap">
                  Content Owner
                </th>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap">
                  Promotion
                </th>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[160px]">
                  Asset Campaign
                </th>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[160px]">
                  Content Campaign
                </th>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap">
                  Asset Clicks
                </th>
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap">
                  {COLUMN_LABELS.total_revenue ?? 'Total Revenue ($)'}
                </th>
                {metricKeys.map((key) => (
                  <th
                    key={key}
                    className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap"
                  >
                    {COLUMN_LABELS[key] ?? key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-black divide-y divide-zinc-900">
              {loading && (
                <tr>
                  <td
                    colSpan={9 + metricKeys.length}
                    className="px-6 py-16 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600"
                  >
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={9 + metricKeys.length} className="px-6 py-20 text-center">
                    <div className="text-[11px] font-black uppercase tracking-widest text-red-500">
                      Failed to load asset analytics
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-2 max-w-md mx-auto">{error}</div>
                  </td>
                </tr>
              )}

              {!loading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={9 + metricKeys.length} className="px-6 py-20 text-center">
                    <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                      No asset × content pairs in range
                    </div>
                    <div className="text-[10px] text-zinc-700 mt-2 max-w-md mx-auto">
                      No org-scoped redirect_links with asset_id for the last 30 days / current
                      source mode.
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                !error &&
                rows.map((row) => (
                  <tr
                    key={`${row.assetId}::${row.videoId}`}
                    className="hover:bg-zinc-950 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 z-10 bg-black">
                      <div className="text-xs font-bold truncate max-w-[200px]">
                        {row.assetTitle}
                      </div>
                      <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
                        Asset
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${ASSET_TYPE_COLORS[row.assetType]}`}
                      >
                        {ASSET_TYPE_LABELS[row.assetType]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs font-bold truncate max-w-[180px]">
                        {row.videoTitle}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400">
                      {row.contentOwnerName ?? '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 max-w-[160px] truncate">
                      {row.promotionLabel ?? '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 max-w-[180px] truncate">
                      {row.assetCampaignLabel}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 max-w-[180px] truncate">
                      {row.contentCampaignLabel}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                      {row.assetClicks}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                      {row.metrics.total_revenue ?? 0}
                    </td>
                    {metricKeys.map((key) => (
                      <td
                        key={key}
                        className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums"
                      >
                        {row.metrics[key] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}