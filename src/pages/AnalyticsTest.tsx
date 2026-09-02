// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsTest.tsx — PHASE 2: real data + attribution classifier hypothesis
//
// Table remains primary (AllAssetsAnalytics-like).
// Attribution is isolated in ../lib/attributeConversion.ts
// Debug KPIs are real; overlap must stay 0 for exclusivity invariant.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  TABLE_COLUMNS,
  COLUMN_LABELS,
  getDateBounds,
  type MetricType,
  type RevenueView,
} from '../lib/analyticsEngine';
import {
  getAssetAnalyticsRows,
  type AssetAnalyticsTableRow,
} from '../services/asset/getAssetAnalyticsRows';
import {
  attributeConversion,
  conversionKey,
  type AttributionResult,
  type ConversionEvidence,
} from '../lib/attributeConversion';

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

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function AnalyticsTest() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeSource, setActiveSource] = useState<RevenueView>('total');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [attributions, setAttributions] = useState<AttributionResult[]>([]);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setSelectedRowKey(null);
      try {
        const { organizationId, viewerId } = await resolveOrgAndViewer();

        const source: 'total' | 'pixel' | 'stripe' =
          activeSource === 'pixel' || activeSource === 'stripe' ? activeSource : 'total';

        const result = await getAssetAnalyticsRows({
          organizationId,
          viewerId,
          dateRange: '30days',
          customRange: null,
          activeSource: source,
        });

        if (cancelled) return;

        const { start, end } = getDateBounds('30days', null);
        const startIso = start.toISOString();
        const endIso = end.toISOString();

        const [stripeRes, pixelRes] = await Promise.all([
          source === 'pixel'
            ? Promise.resolve({ data: [] as any[], error: null })
            : supabase
                .from('stripe_purchases')
                .select(
                  'id, amount, session_id, video_id, redirect_link_token, organization_id, created_at',
                )
                .eq('organization_id', organizationId)
                .gte('created_at', startIso)
                .lte('created_at', endIso),
          source === 'stripe'
            ? Promise.resolve({ data: [] as any[], error: null })
            : supabase
                .from('pixel_purchases')
                .select('id, amount, session_id, video_id, organization_id, created_at')
                .eq('organization_id', organizationId)
                .gte('created_at', startIso)
                .lte('created_at', endIso),
        ]);

        if (stripeRes.error) throw new Error(stripeRes.error.message);
        if (pixelRes.error) throw new Error(pixelRes.error.message);

        const stripeRows = (stripeRes.data ?? []).filter(
          (p: any) => parseFloat(String(p.amount ?? 0)) > 0,
        );
        const pixelRows = (pixelRes.data ?? []).filter(
          (p: any) => parseFloat(String(p.amount ?? 0)) > 0,
        );

        const tokens = Array.from(
          new Set(
            stripeRows
              .map((p: any) => p.redirect_link_token as string | null)
              .filter((t): t is string => !!t),
          ),
        );

        const sessionIds = Array.from(
          new Set(
            [
              ...stripeRows.map((p: any) => p.session_id),
              ...pixelRows.map((p: any) => p.session_id),
            ].filter(Boolean),
          ),
        ) as string[];

        const [linksRes, eventsRes] = await Promise.all([
          tokens.length
            ? supabase
                .from('redirect_links')
                .select('id, token, asset_id, video_id')
                .in('token', tokens)
            : Promise.resolve({ data: [] as any[], error: null }),
          sessionIds.length
            ? supabase
                .from('events')
                .select('session_id, asset_id, video_id, event_type, created_at')
                .in('session_id', sessionIds)
            : Promise.resolve({ data: [] as any[], error: null }),
        ]);

        if (linksRes.error) throw new Error(linksRes.error.message);
        if (eventsRes.error) throw new Error(eventsRes.error.message);

        const linkByToken = new Map(
          (linksRes.data ?? []).map((l: any) => [l.token as string, l]),
        );
        const eventsBySession = new Map<string, any[]>();
        for (const e of eventsRes.data ?? []) {
          const sid = e.session_id as string;
          if (!sid) continue;
          const list = eventsBySession.get(sid) ?? [];
          list.push(e);
          eventsBySession.set(sid, list);
        }

        const classified: AttributionResult[] = [];

        for (const p of stripeRows) {
          const token = (p.redirect_link_token as string | null) ?? null;
          const link = token ? linkByToken.get(token) : undefined;
          const sessionEvents = p.session_id
            ? eventsBySession.get(p.session_id) ?? []
            : [];
          const evidence: ConversionEvidence = {
            source: 'stripe',
            conversionId: p.id as string,
            amount: parseFloat(String(p.amount ?? 0)),
            sessionId: (p.session_id as string | null) ?? null,
            videoId: (p.video_id as string | null) ?? null,
            redirectLinkToken: token,
            redirectLinkAssetId: (link?.asset_id as string | null) ?? null,
            redirectLinkVideoId: (link?.video_id as string | null) ?? null,
            sessionEventAssetIds: sessionEvents
              .map((e) => e.asset_id as string | null)
              .filter((id): id is string => !!id),
            sessionEventVideoIds: sessionEvents
              .map((e) => e.video_id as string | null)
              .filter((id): id is string => !!id),
          };
          classified.push(attributeConversion(evidence));
        }

        for (const p of pixelRows) {
          const sessionEvents = p.session_id
            ? eventsBySession.get(p.session_id) ?? []
            : [];
          const evidence: ConversionEvidence = {
            source: 'pixel',
            conversionId: p.id as string,
            amount: parseFloat(String(p.amount ?? 0)),
            sessionId: (p.session_id as string | null) ?? null,
            videoId: (p.video_id as string | null) ?? null,
            redirectLinkToken: null,
            redirectLinkAssetId: null,
            redirectLinkVideoId: null,
            sessionEventAssetIds: sessionEvents
              .map((e) => e.asset_id as string | null)
              .filter((id): id is string => !!id),
            sessionEventVideoIds: sessionEvents
              .map((e) => e.video_id as string | null)
              .filter((id): id is string => !!id),
          };
          classified.push(attributeConversion(evidence));
        }

        if (!cancelled) setAttributions(classified);

        const assetIds = Array.from(new Set(result.rows.map((r) => r.asset_id)));
        const videoIds = Array.from(new Set(result.rows.map((r) => r.video_id)));
        const campaignIds = Array.from(
          new Set(
            result.rows
              .map((r) => r.assetCampaign?.campaignId ?? null)
              .filter((id): id is string => !!id),
          ),
        );
        const promotionIds = Array.from(
          new Set(result.rows.flatMap((r) => r.promotionIds ?? []).filter(Boolean)),
        );

        const [videosRes, assetsRes, promoRes] = await Promise.all([
          videoIds.length
            ? supabase
                .from('videos')
                .select('id, video_title, user_id, campaign_id')
                .in('id', videoIds)
            : Promise.resolve({ data: [] as any[], error: null }),
          assetIds.length
            ? supabase
                .from('assets')
                .select(
                  'id, asset_type, videos(video_title), asset_resources(title), campaign_element_assets(display_name)',
                )
                .in('id', assetIds)
            : Promise.resolve({ data: [] as any[], error: null }),
          promotionIds.length
            ? supabase
                .from('promotions')
                .select('id, assignment_id, campaign_id')
                .in('id', promotionIds)
            : Promise.resolve({ data: [] as any[], error: null }),
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
            contentOwnerName: owner?.full_name?.trim() || owner?.email || null,
            promotionLabel: promoId ? promotionNameById.get(promoId) ?? promoId : null,
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
          setAttributions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSource, user?.id]);

  const attributionKpis = useMemo(() => {
    let assetRevenue = 0;
    let contentRevenue = 0;
    let unknownRevenue = 0;
    const byKey = new Map<string, AttributionResult>();

    for (const a of attributions) {
      const key = conversionKey(a.source, a.conversionId);
      byKey.set(key, a);
    }

    const destinationsSeen = new Map<string, Set<string>>();
    for (const a of byKey.values()) {
      if (a.destination === 'asset') assetRevenue += a.amount;
      else if (a.destination === 'content') contentRevenue += a.amount;
      else unknownRevenue += a.amount;

      const key = conversionKey(a.source, a.conversionId);
      const set = destinationsSeen.get(key) ?? new Set();
      set.add(a.destination);
      destinationsSeen.set(key, set);
    }

    let overlap = 0;
    destinationsSeen.forEach((set) => {
      if (set.size > 1) overlap += 1;
    });

    return { assetRevenue, contentRevenue, unknownRevenue, overlap };
  }, [attributions]);

  const selectedRow = useMemo(() => {
    if (!selectedRowKey) return null;
    return rows.find((r) => `${r.assetId}::${r.videoId}` === selectedRowKey) ?? null;
  }, [rows, selectedRowKey]);

  const selectedRowAttributions = useMemo(() => {
    if (!selectedRow) return [] as AttributionResult[];
    return attributions.filter(
      (a) =>
        (a.assetId && a.assetId === selectedRow.assetId) ||
        (a.videoId && a.videoId === selectedRow.videoId && a.destination !== 'asset'),
    );
  }, [attributions, selectedRow]);

  const metricKeys = useMemo(() => TABLE_COLUMNS as MetricType[], []);

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden">
      <header className="bg-zinc-950 border-b border-zinc-900 px-8 shrink-0">
        <div className="h-16 flex items-center gap-6 min-w-0">
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
              Phase 2 — attribution hypothesis · table is primary
            </p>
          </div>
        </div>
      </header>

      {/* Source toggle below header — avoids left-nav overlap */}
      <div className="relative z-30 px-8 py-3 border-b border-zinc-900 bg-zinc-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          {(['total', 'pixel', 'stripe'] as RevenueView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setActiveSource(v)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                activeSource === v
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="px-3 py-2 bg-zinc-900/50 border border-zinc-900 rounded-xl">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
            {loading ? '…' : `${rows.length} Rows`}
          </span>
        </div>
      </div>

      <div className="px-8 py-4 border-b border-zinc-900 bg-zinc-950/50 shrink-0">
        <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-3">
          Attribution Debug
        </p>
        <div className="flex flex-wrap gap-6">
          <div className="min-w-[120px]">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
              Asset Revenue
            </div>
            <div className="text-sm font-bold text-emerald-400 tabular-nums mt-1">
              {loading ? '…' : formatMoney(attributionKpis.assetRevenue)}
            </div>
          </div>
          <div className="min-w-[120px]">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
              Content Revenue
            </div>
            <div className="text-sm font-bold text-sky-400 tabular-nums mt-1">
              {loading ? '…' : formatMoney(attributionKpis.contentRevenue)}
            </div>
          </div>
          <div className="min-w-[120px]">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
              Unknown Revenue
            </div>
            <div className="text-sm font-bold text-zinc-400 tabular-nums mt-1">
              {loading ? '…' : formatMoney(attributionKpis.unknownRevenue)}
            </div>
          </div>
          <div className="min-w-[120px]">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
              Overlap
            </div>
            <div
              className={`text-sm font-bold tabular-nums mt-1 ${
                attributionKpis.overlap > 0 ? 'text-red-400' : 'text-zinc-400'
              }`}
            >
              {loading ? '…' : attributionKpis.overlap}
            </div>
          </div>
          <div className="min-w-[120px]">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
              Conversions classified
            </div>
            <div className="text-sm font-bold text-zinc-400 tabular-nums mt-1">
              {loading ? '…' : attributions.length}
            </div>
          </div>
        </div>
        <p className="text-[9px] text-zinc-600 mt-3 max-w-3xl">
          Hypothesis only: Stripe uses redirect_link_token → link.asset_id; Pixel uses
          single-session asset_id consistency. UNKNOWN when evidence is insufficient.
          Table metrics still come from getAssetAnalyticsRows (unchanged).
        </p>
      </div>

      {selectedRow && (
        <div className="px-8 py-3 border-b border-zinc-900 bg-zinc-900/40 shrink-0 max-h-40 overflow-y-auto">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500">
              Selected row evidence
            </p>
            <button
              type="button"
              onClick={() => setSelectedRowKey(null)}
              className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
            >
              Clear
            </button>
          </div>
          <div className="text-[10px] text-zinc-400 space-y-1 font-mono">
            <div>
              Asset: {selectedRow.assetTitle} ({selectedRow.assetId}) · Type:{' '}
              {ASSET_TYPE_LABELS[selectedRow.assetType]}
            </div>
            <div>
              Promoting: {selectedRow.videoTitle} · Asset Campaign:{' '}
              {selectedRow.assetCampaignLabel} · Content Campaign:{' '}
              {selectedRow.contentCampaignLabel}
            </div>
            {selectedRowAttributions.length === 0 && (
              <div className="text-zinc-600">No classified conversions matched this row.</div>
            )}
            {selectedRowAttributions.slice(0, 8).map((a) => (
              <div key={conversionKey(a.source, a.conversionId)} className="text-zinc-300">
                [{a.source}] {a.conversionId.slice(0, 8)}… · {formatMoney(a.amount)} ·{' '}
                <span className="text-white font-bold">{a.destination}</span> · {a.reason}
                {a.sessionId ? ` · session ${a.sessionId.slice(0, 8)}…` : ''}
                {a.redirectLinkToken ? ` · token ${a.redirectLinkToken.slice(0, 8)}…` : ''}
              </div>
            ))}
            {selectedRowAttributions.length > 8 && (
              <div className="text-zinc-600">
                +{selectedRowAttributions.length - 8} more…
              </div>
            )}
          </div>
        </div>
      )}

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
                      Failed to load
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
                  </td>
                </tr>
              )}

              {!loading &&
                !error &&
                rows.map((row) => {
                  const rowKey = `${row.assetId}::${row.videoId}`;
                  const active = selectedRowKey === rowKey;
                  return (
                    <tr
                      key={rowKey}
                      onClick={() => setSelectedRowKey(active ? null : rowKey)}
                      className={`hover:bg-zinc-950 transition-colors cursor-pointer ${
                        active ? 'bg-zinc-900/80' : ''
                      }`}
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
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}