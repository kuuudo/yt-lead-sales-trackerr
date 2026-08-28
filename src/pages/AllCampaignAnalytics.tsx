// pages/AllCampaignAnalytics.tsx
// Campaign Analytics — top of the hierarchy. Mock data only this phase.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ArrowUpDown, BarChart3,
} from 'lucide-react';
import { MOCK_CAMPAIGNS } from '../lib/mockAnalyticsData';
import { useDrillDown } from '../lib/DrillDownContext';
import AnalyticsBreadcrumb from '../components/analytics/AnalyticsBreadcrumb';

type SortKey = 'name' | 'clicks' | 'revenue' | 'purchases' | 'rpc';

export default function AllCampaignAnalytics() {
  const navigate = useNavigate();
  const { openCampaignOverview } = useDrillDown();
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...MOCK_CAMPAIGNS].sort((a, b) => {
      if (sortKey === 'name') {
        return a.name.localeCompare(b.name) * dir;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const money = (n: number) =>
    `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">
        <header className="bg-zinc-950 border-b border-zinc-900 px-8 shrink-0">
          <div className="h-20 flex items-center justify-between">
            <div className="flex items-center gap-6 min-w-0">
              <button
                onClick={() => navigate(-1)}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all shrink-0"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="min-w-0">
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                  Campaign Analytics
                </h2>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                  Ranked campaigns · click a row to open overview
                </p>
              </div>
            </div>
            <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-900 rounded-xl shrink-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                {rows.length} Campaigns
              </span>
            </div>
          </div>
          <div className="pb-4">
            <AnalyticsBreadcrumb />
          </div>
        </header>

        <div className="flex-1 overflow-x-auto custom-scrollbar">
          <div className="inline-block min-w-full align-middle h-full overflow-y-auto">
            <table className="min-w-full divide-y divide-zinc-900 border-collapse">
              <thead className="bg-zinc-950 sticky top-0 z-20 shadow-xl">
                <tr>
                  {(
                    [
                      { key: 'name' as SortKey, label: 'Campaign', min: 'min-w-[280px]' },
                      { key: 'clicks' as SortKey, label: 'Clicks', min: 'min-w-[120px]' },
                      { key: 'revenue' as SortKey, label: 'Revenue', min: 'min-w-[140px]' },
                      { key: 'purchases' as SortKey, label: 'Purchases', min: 'min-w-[120px]' },
                      { key: 'rpc' as SortKey, label: 'Revenue / Click', min: 'min-w-[140px]' },
                    ] as const
                  ).map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 cursor-pointer hover:text-zinc-300 transition-colors ${col.min}`}
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
                  <th className="px-6 py-5 border-b border-zinc-900 bg-zinc-950" />
                </tr>
              </thead>
              <tbody className="bg-black divide-y divide-zinc-900">
                {rows.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => openCampaignOverview(row.id, row.name)}
                    className="hover:bg-zinc-950 transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                          <BarChart3 size={16} className="text-red-500" />
                        </div>
                        <div className="text-xs font-bold text-white truncate max-w-[220px]">
                          {row.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums">
                      {fmt(row.clicks)}
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