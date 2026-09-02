// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsTest.tsx — PHASE 0 SHELL ONLY
//
// Visual laboratory surface that mirrors AllAssetsAnalytics column language.
// No data loading, no attribution, no metric aggregation in this phase.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

type RevenueView = 'total' | 'pixel' | 'stripe';

/** Same terminology / order as AllAssetsAnalytics production table. */
const TABLE_HEADERS: string[] = [
  'Asset',
  'Type',
  'Promoting Content',
  'Content Owner',
  'Promotion',
  'Asset Campaign',
  'Content Campaign',
  'Asset Clicks',
  'Total Revenue ($)',
  'Landing Page Clicks',
  'Direct Purchases',
  'Lead Magnet Clicks',
  'Newsletter Clicks',
  'Newsletter Opt-ins',
  'Call Booking Clicks',
  'Call Bookings Confirmed',
  'Consultation Page Clicks',
  'Consultation Purchases',
  'Direct Offer Sales ($)',
  'Estimated Call Revenue ($)',
  'Consultation Revenue ($)',
  'Total Revenue ($)',
  'Revenue Per Click ($)',
];

export default function AnalyticsTest() {
  const navigate = useNavigate();
  const [activeSource, setActiveSource] = useState<RevenueView>('total');

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
                Attribution laboratory shell — no live data yet
              </p>
            </div>
          </div>

          {/* ONLY control: TOTAL | PIXEL | STRIPE */}
          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl shrink-0">
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
      </header>

      {/* ── Attribution debug strip (placeholders only) ─────────────────── */}
      <div className="px-8 py-4 border-b border-zinc-900 bg-zinc-950/50 shrink-0">
        <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-3">
          Attribution Debug (Phase 0 — empty)
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

      {/* ── Table shell ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-auto custom-scrollbar">
        <div className="inline-block min-w-full align-middle h-full overflow-y-auto">
          <table className="min-w-full divide-y divide-zinc-900 border-collapse">
            <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
              <tr>
                {TABLE_HEADERS.map((label, i) => (
                  <th
                    key={`${label}-${i}`}
                    className={`px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 whitespace-nowrap ${
                      i === 0 ? 'min-w-[260px] sticky left-0 z-30' : ''
                    }`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-black divide-y divide-zinc-900">
              <tr>
                <td
                  colSpan={TABLE_HEADERS.length}
                  className="px-6 py-20 text-center"
                >
                  <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                    Phase 0 shell — no asset × content pairs loaded
                  </div>
                  <div className="text-[10px] text-zinc-700 mt-2 max-w-lg mx-auto">
                    This page mirrors AllAssetsAnalytics column layout for comparison.
                    Live attribution, purchases, and metrics arrive in a later phase.
                    Source toggle ({activeSource}) is UI-only until then.
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}