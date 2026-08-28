// pages/AssetAnalyticsMock.tsx
// Temporary UI-only Asset table driven by DrillDownContext + mock data.
// Replace with real AllAssetsAnalytics wiring once hierarchy is approved.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ArrowUpDown } from 'lucide-react';
import { getAssetsFor } from '../lib/mockAnalyticsData';
import { useDrillDown } from '../lib/DrillDownContext';
import AnalyticsBreadcrumb from '../components/analytics/AnalyticsBreadcrumb';
import LockedFilterBadge from '../components/analytics/LockedFilterBadge';

type SortKey = 'assetTitle' | 'assetClicks' | 'totalRevenue' | 'revenuePerClick';

const TYPE_LABELS: Record<string, string> = {
  campaign_element: 'Campaign Element',
  promotional_video: 'Promotional Video',
  resource: 'Resource',
  content_video: 'Content Video',
};

export default function AssetAnalyticsMock() {
  const navigate = useNavigate();
  const { state } = useDrillDown();
  const [sortKey, setSortKey] = useState<SortKey>('totalRevenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const base = getAssetsFor({
    campaignId: state.campaignId,
    marketerId: state.marketerId,
    promotionId: state.promotionId,
    ownOnly: state.ownAssetsOnly,
  });

  const rows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortKey === 'assetTitle') {
        return a.assetTitle.localeCompare(b.assetTitle) * dir;
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
      <aside className="w-80 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0 hidden lg:flex">
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {state.locked.campaign && state.campaignName && (
            <LockedFilterBadge label="Campaign" value={state.campaignName} />
          )}
          {state.locked.marketer && state.marketerName && (
            <LockedFilterBadge label="Marketer" value={state.marketerName} />
          )}
          {state.locked.promotion && state.promotionName && (
            <LockedFilterBadge label="Promotion" value={state.promotionName} />
          )}
          {state.ownAssetsOnly && (
            <LockedFilterBadge label="Scope" value="Own Assets" />
          )}
          <p className="text-[9px] text-zinc-700 leading-relaxed">
            Mock Asset Analytics for hierarchy demo. Real AllAssetsAnalytics stays the foundation for live data.
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-zinc-950 border-b border-zinc-900 px-8 shrink-0">
          <div className="h-20 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6 min-w-0">
              <button
                onClick={() => navigate(-1)}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white shrink-0"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="min-w-0">
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                  Asset Analytics
                </h2>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                  Asset × promoting content
                  {state.promotionName ? ` · ${state.promotionName}` : ''}
                  {state.ownAssetsOnly ? ' · Own assets' : ''}
                </p>
              </div>
            </div>
            <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-900 rounded-xl">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                {rows.length} Rows
              </span>
            </div>
          </div>
          <div className="pb-4">
            <AnalyticsBreadcrumb />
          </div>
        </header>

        <div className="flex-1 overflow-x-auto custom-scrollbar">
          <table className="min-w-full divide-y divide-zinc-900">
            <thead className="bg-zinc-950 sticky top-0 z-20">
              <tr>
                {[
                  { key: 'assetTitle' as SortKey, label: 'Asset' },
                  { key: null, label: 'Type' },
                  { key: null, label: 'Promoting Content' },
                  { key: null, label: 'Content Owner' },
                  { key: 'assetClicks' as SortKey, label: 'Asset Clicks' },
                  { key: 'totalRevenue' as SortKey, label: 'Total Revenue ($)' },
                  { key: 'revenuePerClick' as SortKey, label: 'Rev / Click' },
                ].map((col, i) => (
                  <th
                    key={i}
                    onClick={col.key ? () => handleSort(col.key!) : undefined}
                    className={`px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 ${
                      col.key ? 'cursor-pointer hover:text-zinc-300' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      {col.key && (
                        <ArrowUpDown
                          size={10}
                          className={sortKey === col.key ? 'text-white' : 'text-zinc-700'}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-black divide-y divide-zinc-900">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-zinc-950">
                  <td className="px-6 py-4 text-xs font-bold text-white max-w-[200px] truncate">
                    {row.assetTitle}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2 py-1 rounded-full border border-zinc-700 text-[8px] font-black uppercase tracking-widest text-zinc-400">
                      {TYPE_LABELS[row.assetType] ?? row.assetType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-zinc-300 max-w-[180px] truncate">
                    {row.promotingVideoTitle}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-zinc-400">
                    {row.contentOwnerName}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-zinc-400 tabular-nums">
                    {row.assetClicks.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-zinc-400 tabular-nums">
                    {money(row.totalRevenue)}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-zinc-400 tabular-nums">
                    ${row.revenuePerClick.toFixed(2)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    No assets in this scope
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