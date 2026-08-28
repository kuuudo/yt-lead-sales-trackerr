// pages/MarketerAnalytics.tsx
// Marketer ranking. When campaign is locked, only that campaign's marketers.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ArrowUpDown, User } from 'lucide-react';
import { MOCK_MARKETERS, getMarketersForCampaign } from '../lib/mockAnalyticsData';
import { useDrillDown } from '../lib/DrillDownContext';
import AnalyticsBreadcrumb from '../components/analytics/AnalyticsBreadcrumb';
import LockedFilterBadge from '../components/analytics/LockedFilterBadge';

type SortKey = 'name' | 'campaignName' | 'clicks' | 'revenue' | 'purchases' | 'rpc';

export default function MarketerAnalytics() {
  const navigate = useNavigate();
  const { state, openPromotionAnalytics } = useDrillDown();
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const base = state.campaignId
    ? getMarketersForCampaign(state.campaignId)
    : MOCK_MARKETERS;

  const rows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortKey === 'name' || sortKey === 'campaignName') {
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * dir;
      }
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [base, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const money = (n: number) =>
    `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      {/* Sidebar — locked campaign when present */}
      <aside className="w-80 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0 hidden lg:flex">
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {state.locked.campaign && state.campaignName ? (
            <LockedFilterBadge label="Campaign" value={state.campaignName} />
          ) : (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3 block">
                Campaign
              </label>
              <div className="text-[10px] text-zinc-600">
                All campaigns (no drill-down context)
              </div>
            </div>
          )}
          <p className="text-[9px] text-zinc-700 leading-relaxed">
            Click a marketer to open Promotion Analytics with Campaign + Marketer locked.
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">
        <header className="bg-zinc-950 border-b border-zinc-900 px-8 shrink-0">
          <div className="h-20 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6 min-w-0">
              <button
                onClick={() => navigate(-1)}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all shrink-0"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="min-w-0">
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                  Marketer Analytics
                </h2>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                  {state.campaignName
                    ? `Marketers in ${state.campaignName}`
                    : 'All marketers'}
                </p>
              </div>
            </div>
            <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-900 rounded-xl shrink-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                {rows.length} Marketers
              </span>
            </div>
          </div>
          <div className="pb-4">
            <AnalyticsBreadcrumb />
          </div>
        </header>

        <div className="flex-1 overflow-x-auto custom-scrollbar">
          <table className="min-w-full divide-y divide-zinc-900 border-collapse">
            <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
              <tr>
                {(
                  [
                    { key: 'name' as SortKey, label: 'Marketer' },
                    { key: 'campaignName' as SortKey, label: 'Campaign' },
                    { key: 'clicks' as SortKey, label: 'Clicks' },
                    { key: 'revenue' as SortKey, label: 'Revenue' },
                    { key: 'purchases' as SortKey, label: 'Purchases' },
                    { key: 'rpc' as SortKey, label: 'Revenue / Click' },
                  ] as const
                ).map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 cursor-pointer hover:text-zinc-300"
                  >
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      <ArrowUpDown
                        size={10}
                        className={sortKey === col.key ? 'text-white' : 'text-zinc-700'}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-black divide-y divide-zinc-900">
              {rows.map(row => (
                <tr
                  key={`${row.id}-${row.campaignId}`}
                  onClick={() => openPromotionAnalytics(row.id, row.name)}
                  className="hover:bg-zinc-950 transition-colors group cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                        <User size={14} className="text-zinc-500" />
                      </div>
                      <span className="text-xs font-bold text-white">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400">
                    {row.campaignName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                    {row.clicks.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                    {money(row.revenue)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                    {row.purchases}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                    ${row.rpc.toFixed(2)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    No marketers in this scope
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}