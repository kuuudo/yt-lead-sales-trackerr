// pages/AllCampaignAnalytics.tsx
// Real Campaign Analytics table. Hover = dim. Click = grow 3 branches L→R.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';
import { MOCK_CAMPAIGNS, type MockCampaign } from '../lib/mockAnalyticsData';
import { useDrillDown } from '../lib/DrillDownContext';
import AnalyticsDrillDownTable, {
  type ColumnDef,
} from '../components/analytics/AnalyticsDrillDownTable';
import { GrowConnector, GrowNode } from '../components/analytics/GrowBranch';

const columns: ColumnDef<MockCampaign>[] = [
  {
    key: 'name',
    label: 'Campaign',
    sortValue: r => r.name,
    render: r => <span className="text-white">{r.name}</span>,
    className: 'min-w-[260px]',
  },
  {
    key: 'revenue',
    label: 'Revenue',
    sortValue: r => r.revenue,
    render: r => `$${r.revenue.toLocaleString()}`,
  },
  {
    key: 'clicks',
    label: 'Clicks',
    sortValue: r => r.clicks,
    render: r => r.clicks.toLocaleString(),
  },
  {
    key: 'purchases',
    label: 'Purchases',
    sortValue: r => r.purchases,
    render: r => r.purchases,
  },
  {
    key: 'rpc',
    label: 'Revenue / Click',
    sortValue: r => r.rpc,
    render: r => `$${r.rpc.toFixed(2)}`,
  },
];

export default function AllCampaignAnalytics() {
  const navigate = useNavigate();
  const {
    state,
    expandCampaign,
    enterBranch,
    collapseExpand,
    clearAll,
    breadcrumbs,
    goToPathIndex,
  } = useDrillDown();

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-zinc-950 border-b border-zinc-900 px-6 shrink-0">
          <div className="h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={() => navigate(-1)}
                className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white"
              >
                <ChevronLeft size={18} />
              </button>
              <div>
                <h2 className="text-lg font-black text-white uppercase tracking-tight">
                  Campaign Analytics
                </h2>
                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">
                  Hover to focus · Click to open hierarchy (grows left → right)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 bg-zinc-900/50 border border-zinc-900 rounded-xl">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  {MOCK_CAMPAIGNS.length} Campaigns
                </span>
              </div>
              {state.path.length > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
                >
                  <X size={12} /> Reset
                </button>
              )}
            </div>
          </div>
          {breadcrumbs.length > 0 && (
            <div className="pb-3 flex items-center gap-1.5 flex-wrap">
              {breadcrumbs.map((b, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-zinc-700 text-[10px]">/</span>}
                  <button
                    type="button"
                    onClick={() => {
                      goToPathIndex(b.index);
                      if (b.index === 0) {
                        /* stay on campaign table with expand */
                      }
                    }}
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      i === breadcrumbs.length - 1 ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {b.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <AnalyticsDrillDownTable
            columns={columns}
            rows={MOCK_CAMPAIGNS}
            expandedId={state.expandedRowId}
            onRowClick={row => {
              if (state.expandedRowId === row.id) collapseExpand();
              else expandCampaign(row.id, row.name);
            }}
            renderExpand={() => (
              <>
                <GrowNode
                  label="Content Analytics"
                  sub="Tracked content performance"
                  accent="border-blue-500/40 hover:border-blue-400"
                  onClick={() => enterBranch('content')}
                />
                <GrowConnector />
                <GrowNode
                  label="Own Asset Analytics"
                  sub="Owner assets only"
                  accent="border-amber-500/40 hover:border-amber-400"
                  onClick={() => enterBranch('own_assets')}
                />
                <GrowConnector />
                <GrowNode
                  label="Marketer Analytics"
                  sub="Marketers in this campaign"
                  accent="border-violet-500/40 hover:border-violet-400"
                  onClick={() => enterBranch('marketers')}
                />
              </>
            )}
          />
        </div>
      </div>
    </div>
  );
}