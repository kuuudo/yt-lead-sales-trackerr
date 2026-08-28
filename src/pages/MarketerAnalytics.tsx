// pages/MarketerAnalytics.tsx
// Real Marketer Analytics table. Hover dim. Click → grow promotions L→R → enter Promotion Analytics.

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';
import {
  MOCK_MARKETERS,
  getMarketersForCampaign,
  getPromotionsFor,
  type MockMarketer,
} from '../lib/mockAnalyticsData';
import { useDrillDown } from '../lib/DrillDownContext';
import AnalyticsDrillDownTable, {
  type ColumnDef,
} from '../components/analytics/AnalyticsDrillDownTable';
import { GrowConnector, GrowNode } from '../components/analytics/GrowBranch';
import LockedFilterBadge from '../components/analytics/LockedFilterBadge';

const columns: ColumnDef<MockMarketer>[] = [
  {
  key: 'name',
  label: 'Marketer',
  interactive: true,
  sortValue: r => r.name,
  render: r => r.name,
},
  {
    key: 'campaignName',
    label: 'Campaign',
    sortValue: r => r.campaignName,
    render: r => r.campaignName,
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

export default function MarketerAnalytics() {
  const navigate = useNavigate();
  const {
    state,
    expandMarketer,
    enterPromotionAnalytics,
    collapseExpand,
    clearAll,
    breadcrumbs,
    goToPathIndex,
  } = useDrillDown();

  const rows = useMemo(
    () =>
      state.campaignId
        ? getMarketersForCampaign(state.campaignId)
        : MOCK_MARKETERS,
    [state.campaignId],
  );

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      <aside className="w-72 bg-zinc-950 border-r border-zinc-900 hidden lg:flex flex-col shrink-0">
        <div className="p-6 space-y-4">
          {state.locked.campaign && state.campaignName && (
            <LockedFilterBadge label="Campaign" value={state.campaignName} />
          )}
          <p className="text-[9px] text-zinc-600 leading-relaxed">
            Hover a marketer to focus. Click to grow promotions, then open Promotion Analytics.
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-zinc-950 border-b border-zinc-900 px-6 shrink-0">
          <div className="h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white"
              >
                <ChevronLeft size={18} />
              </button>
              <div>
                <h2 className="text-lg font-black text-white uppercase tracking-tight">
                  Marketer Analytics
                </h2>
                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">
                  {state.campaignName
                    ? `Scoped to ${state.campaignName}`
                    : 'All marketers'}
                </p>
              </div>
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
          {breadcrumbs.length > 0 && (
            <div className="pb-3 flex flex-wrap gap-1.5 items-center">
              {breadcrumbs.map((b, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-zinc-700 text-[10px]">/</span>}
                  <button
                    type="button"
                    onClick={() => goToPathIndex(b.index)}
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
            rows={rows}
            expandedId={state.expandedRowId}
            onRowClick={row => {
              if (state.expandedRowId === row.id) collapseExpand();
              else expandMarketer(row.id, row.name);
            }}
           renderGrowPath={row => {
  const promos = getPromotionsFor({
    campaignId: state.campaignId ?? row.campaignId,
    marketerId: row.id,
  });

  return (
    <>
      {promos.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 && <GrowConnector />}
          <GrowNode
            label={p.name}
            sub={`$${p.revenue.toLocaleString()}`}
            onClick={() => {
              expandMarketer(row.id, row.name);
              enterPromotionAnalytics();
            }}
          />
        </React.Fragment>
      ))}

      <GrowConnector />

      <GrowNode
        label="Promotion Analytics"
        sub="Full table"
        accent="border-violet-500/50 hover:border-violet-400"
        onClick={enterPromotionAnalytics}
      />
    </>
  );
}}
          />
        </div>
      </div>
    </div>
  );
}