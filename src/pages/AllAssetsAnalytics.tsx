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
// Table shell + column definitions ONLY. No Supabase queries, no
// asset/redirect_link joins, no revenue wiring. Every row-producing function
// below is a stub that returns an empty array. This matches the phase-1
// instruction: "build the table structure first, no data wired."
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
// 1. Leftmost identity cell is an ASSET (thumbnail/title/type badge), not a
//    video. Sub-line shows which video is promoting it ("Promoted by ...").
// 2. Row grain is ASSET × PROMOTING VIDEO, not just video. The same asset can
//    appear on multiple rows (once per promoting video) and the same video
//    can appear on multiple rows (once per asset it promotes).
// 3. New "Asset Type" badge column — Campaign Element / Video Library /
//    Resource / Content Video.
// 4. New "Asset Clicks" column — INTENTIONALLY UNDEFINED for now. See
//    ASSET_ANALYTICS_DESIGN.md § Open Question — Asset Clicks Definition.
//    Rendered as a static placeholder, never fabricated from other columns.
//
// EXPLICITLY NOT IN THIS PASS (see design doc "Deferred" list)
// ════════════════════════════════════════════════════════════
// - Filters (All/My/Shared/Assigned, asset-type pills, Campaign/Promotion
//   selectors). Column header shell has a reserved slot; no logic yet.
// - Any revenue/click computation.
// - Double-counting/attribution resolution (Video B → Asset A → Video A
//   scenario). That must be solved in the engine layer before this table's
//   revenue columns can be trusted — do not backfill it here as a UI patch.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  TABLE_COLUMNS,
  COLUMN_LABELS,
  handleSortToggle,
  type MetricType,
} from '../lib/analyticsEngine';

import {
  ChevronLeft, Filter, Columns, ChevronDown, ArrowUpDown, Boxes,
} from 'lucide-react';

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

// ─────────────────────────────────────────────────────────────────────────────
// Row shape — ONE ROW = ONE (asset, promoting video) PAIR
//
// This mirrors ProcessedVideoRow from analyticsEngine.ts but swaps the video
// identity for an asset identity, and keeps a reference to the promoting
// video alongside it (a row needs both to be meaningful).
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
}

interface PromotingVideoIdentity {
  id:    string;
  title: string | undefined;
}

interface AssetAnalyticsRow {
  asset:           AssetIdentity;
  promoting_video: PromotingVideoIdentity;
  // Placeholder — see "Asset Clicks" note above. Left as `number | null` so
  // the UI can distinguish "not computed yet" (null → renders "—") from a
  // real zero once wired.
  asset_clicks:    number | null;
  // Same 14-key shape as VideoMetricsResult. All zeroed for now via
  // emptyVideoMetrics() equivalent — never fabricated.
  metrics:         Record<MetricType, number | string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// STUB data source — returns nothing. Replace with the real fetch/engine
// call once ASSET_ANALYTICS_DESIGN.md's open questions are resolved.
// ─────────────────────────────────────────────────────────────────────────────

function useAssetAnalyticsRows(): { rows: AssetAnalyticsRow[]; loading: boolean } {
  // TODO(wiring phase): replace with real fetch —
  //   1. Pull redirect_links WHERE asset_id IS NOT NULL for this org.
  //   2. Group by (video_id, asset_id) → one row per pair.
  //   3. Resolve asset identity (assets table) + promoting video identity.
  //   4. Compute metrics per pair — NOT per video alone (see design doc,
  //      this is the part that needs a new engine function, not a reuse of
  //      processVideoMetrics() as-is, since that function is video-scoped).
  return { rows: [], loading: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AllAssetsAnalytics() {
  const navigate = useNavigate();
  const { rows, loading } = useAssetAnalyticsRows();

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total_revenue',
    direction: 'desc',
  });

  const handleSort = (key: string) => {
    setSortConfig(prev => handleSortToggle(prev, key));
  };

  // No-op until rows exist — kept so the sort affordance is wired end-to-end
  // and doesn't need to be revisited when data lands.
  const sortedRows = useMemo(() => rows, [rows, sortConfig]);

  return (
    <div className="flex h-full bg-black">
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="bg-zinc-950 border-b border-zinc-900 px-8 shrink-0">
          <div className="h-20 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={() => navigate(-1)}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all flex items-center gap-2 cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                disabled
                title="Filters — not yet wired (structure-only phase)"
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-700 hidden lg:flex cursor-not-allowed"
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
              {/* Columns dropdown — visual only for now, all TABLE_COLUMNS always on */}
              <button
                disabled
                title="Column visibility toggle — not yet wired"
                className="flex items-center gap-2 px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest bg-zinc-900 border-zinc-800 text-zinc-700 cursor-not-allowed"
              >
                <Columns size={13} />
                Columns
                <ChevronDown size={11} />
              </button>
            </div>
          </div>

          {/* Reserved filter row — All/My/Shared/Assigned + asset-type pills +
              Campaign/Promotion selectors land here once scope rules are
              confirmed against real data (ASSET_ANALYTICS_DESIGN.md §6). */}
          <div className="py-4 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-700">
            <Boxes size={12} />
            Filters reserved — All / My / Shared / Assigned · Campaign Elements ·
            Promotional Videos · Resources · Content Videos · Campaign · Promotion
          </div>
        </header>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
              <tr>
                {/* ── Asset identity column ─────────────────────────────── */}
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[300px] sticky left-0 z-30">
                  Asset
                </th>

                {/* ── Asset type badge column ───────────────────────────── */}
                <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[140px]">
                  Type
                </th>

                {/* ── Asset Clicks — placeholder, see header comment ───── */}
                <th
                  className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 min-w-[110px]"
                  title="Definition not yet locked — see ASSET_ANALYTICS_DESIGN.md"
                >
                  Asset Clicks
                </th>

                {/* ── Engine metric columns — identical to InDepthAnalytics ── */}
                {TABLE_COLUMNS.map(key => (
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
                  <td colSpan={3 + TABLE_COLUMNS.length + 1} className="px-6 py-16 text-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                      Loading…
                    </span>
                  </td>
                </tr>
              )}

              {!loading && sortedRows.length === 0 && (
                <tr>
                  <td colSpan={3 + TABLE_COLUMNS.length + 1} className="px-6 py-20 text-center">
                    <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                      No data wired yet
                    </div>
                    <div className="text-[10px] text-zinc-700 mt-2 max-w-md mx-auto">
                      Table structure only — columns above are locked and match
                      InDepthAnalytics. Row data (asset × promoting-video pairs,
                      Asset Clicks, and the 14 metric columns) gets wired in
                      the next phase once ASSET_ANALYTICS_DESIGN.md's open
                      questions are resolved.
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
                    <div className="flex items-center gap-3">
                      <img
                        src={row.asset.thumbnail_url}
                        className="w-16 h-9 object-cover rounded-lg border border-zinc-800 shrink-0"
                        alt=""
                        onError={e => {
                          const t = e.currentTarget;
                          t.onerror = null;
                          t.src = 'https://placehold.co/64x36/18181b/52525b?text=Asset';
                        }}
                      />
                      <div className="max-w-[220px] min-w-0">
                        <div className="text-xs font-bold truncate leading-snug">
                          {row.asset.title ?? 'Untitled asset'}
                        </div>
                        <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5 truncate">
                          Promoted by {row.promoting_video.title ?? 'Untitled video'}
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
                  {TABLE_COLUMNS.map(key => (
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
  );
}