// pages/AllCampaignAnalytics.tsx
// Phase 2: Horizontal L→R progressive hierarchy tree.
// Structural prototype — mock data only. Tree grows LEFT → RIGHT.

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X, ExternalLink } from 'lucide-react';
import {
  MOCK_CAMPAIGNS,
  getMarketersForCampaign,
  getPromotionsFor,
  getAssetsFor,
} from '../lib/mockAnalyticsData';
import { useDrillDown, type BranchKind } from '../lib/DrillDownContext';

const BRANCHES: { id: BranchKind; label: string; hint: string }[] = [
  { id: 'content', label: 'Content Analytics', hint: 'Tracked content in this campaign' },
  { id: 'own_assets', label: 'Own Asset Analytics', hint: 'Owner assets only — not shared' },
  { id: 'marketers', label: 'Marketer Analytics', hint: 'Marketers in this campaign' },
];

function NodeCard({
  label,
  sub,
  active,
  dimmed,
  onClick,
  accent,
}: {
  label: string;
  sub?: string;
  active?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={[
        'text-left w-56 shrink-0 rounded-2xl border px-4 py-3 transition-all duration-200',
        active
          ? 'bg-zinc-900 border-red-500/60 shadow-[0_0_0_1px_rgba(220,38,38,0.25)] scale-[1.02]'
          : dimmed
            ? 'bg-zinc-950/40 border-zinc-900 opacity-35'
            : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/80',
        onClick ? 'cursor-pointer' : 'cursor-default',
        accent ?? '',
      ].join(' ')}
    >
      <div className="text-[11px] font-black uppercase tracking-tight text-white truncate">
        {label}
      </div>
      {sub && (
        <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1 truncate">
          {sub}
        </div>
      )}
    </button>
  );
}

function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 shrink-0 min-w-[15rem]">
      <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600 px-1">
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-center self-center shrink-0 px-1">
      <div className="w-8 h-px bg-zinc-700" />
      <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-zinc-700" />
    </div>
  );
}

export default function AllCampaignAnalytics() {
  const navigate = useNavigate();
  const {
    state,
    selectCampaign,
    selectBranch,
    selectMarketer,
    selectPromotion,
    openDestination,
    goToPathIndex,
    clearAll,
    breadcrumbs,
  } = useDrillDown();

  const marketers = useMemo(
    () => (state.campaignId ? getMarketersForCampaign(state.campaignId) : []),
    [state.campaignId],
  );

  const promotions = useMemo(
    () =>
      getPromotionsFor({
        campaignId: state.campaignId,
        marketerId: state.marketerId,
      }),
    [state.campaignId, state.marketerId],
  );

  const assets = useMemo(
    () =>
      getAssetsFor({
        campaignId: state.campaignId,
        marketerId: state.marketerId,
        promotionId: state.promotionId,
        ownOnly: false,
      }),
    [state.campaignId, state.marketerId, state.promotionId],
  );

  const showBranches = !!state.campaignId;
  const showMarketers = state.branch === 'marketers';
  const showPromotions = !!state.marketerId;
  const showAssets = !!state.promotionId;

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="bg-zinc-950 border-b border-zinc-900 px-6 shrink-0">
          <div className="h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={() => navigate(-1)}
                className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white shrink-0"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white uppercase tracking-tight">
                  Campaign Analytics
                </h2>
                <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">
                  Hierarchy grows left → right · select to expand
                </p>
              </div>
            </div>
            {state.path.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
              >
                <X size={12} />
                Reset
              </button>
            )}
          </div>

          {/* Breadcrumb */}
          {breadcrumbs.length > 0 && (
            <div className="pb-3 flex items-center gap-1.5 flex-wrap">
              {breadcrumbs.map((b, i) => (
                <React.Fragment key={`${b.label}-${i}`}>
                  {i > 0 && <span className="text-zinc-700 text-[10px]">/</span>}
                  <button
                    type="button"
                    onClick={() => goToPathIndex(b.index)}
                    className={`text-[10px] font-black uppercase tracking-widest ${
                      i === breadcrumbs.length - 1
                        ? 'text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {b.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </header>

        {/* Horizontal tree canvas */}
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <div className="flex items-start gap-0 px-8 py-10 min-h-full min-w-max">
            {/* Column 0 — Campaigns */}
            <Column title="Campaigns">
              {MOCK_CAMPAIGNS.map(c => {
                const active = state.campaignId === c.id;
                const dimmed = !!state.campaignId && !active;
                return (
                  <NodeCard
                    key={c.id}
                    label={c.name}
                    sub={`${c.clicks.toLocaleString()} clicks · $${c.revenue.toLocaleString()}`}
                    active={active}
                    dimmed={dimmed}
                    onClick={() => selectCampaign(c.id, c.name)}
                  />
                );
              })}
            </Column>

            {/* Column 1 — Branches (after campaign selected) */}
            {showBranches && (
              <>
                <Connector />
                <Column title="Open">
                  {BRANCHES.map(b => {
                    const active = state.branch === b.id;
                    const dimmed = !!state.branch && !active;
                    return (
                      <div key={b.id} className="flex flex-col gap-1">
                        <NodeCard
                          label={b.label}
                          sub={b.hint}
                          active={active}
                          dimmed={dimmed}
                          onClick={() => selectBranch(b.id)}
                        />
                        {/* Destination CTA when this branch is active and is a leaf path */}
                        {active && b.id === 'content' && (
                          <button
                            type="button"
                            onClick={() => openDestination('content')}
                            className="ml-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink size={11} />
                            Open Content Analytics
                          </button>
                        )}
                        {active && b.id === 'own_assets' && (
                          <button
                            type="button"
                            onClick={() => openDestination('own_assets')}
                            className="ml-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-400 hover:text-amber-300"
                          >
                            <ExternalLink size={11} />
                            Open Own Asset Analytics
                          </button>
                        )}
                      </div>
                    );
                  })}
                </Column>
              </>
            )}

            {/* Column 2 — Marketers */}
            {showMarketers && (
              <>
                <Connector />
                <Column title="Marketers">
                  {marketers.map(m => {
                    const active = state.marketerId === m.id;
                    const dimmed = !!state.marketerId && !active;
                    return (
                      <NodeCard
                        key={m.id}
                        label={m.name}
                        sub={`$${m.revenue.toLocaleString()} · ${m.purchases} purchases`}
                        active={active}
                        dimmed={dimmed}
                        onClick={() => selectMarketer(m.id, m.name)}
                      />
                    );
                  })}
                  {marketers.length === 0 && (
                    <div className="text-[9px] text-zinc-600 uppercase tracking-widest px-2">
                      No marketers
                    </div>
                  )}
                </Column>
              </>
            )}

            {/* Column 3 — Promotions */}
            {showPromotions && (
              <>
                <Connector />
                <Column title="Promotions">
                  {promotions.map(p => {
                    const active = state.promotionId === p.id;
                    const dimmed = !!state.promotionId && !active;
                    return (
                      <NodeCard
                        key={p.id}
                        label={p.name}
                        sub={`$${p.revenue.toLocaleString()} · ${p.clicks} clicks`}
                        active={active}
                        dimmed={dimmed}
                        onClick={() => selectPromotion(p.id, p.name)}
                      />
                    );
                  })}
                  {promotions.length === 0 && (
                    <div className="text-[9px] text-zinc-600 uppercase tracking-widest px-2">
                      No promotions
                    </div>
                  )}
                </Column>
              </>
            )}

            {/* Column 4 — Assets (nodes on path; full table via CTA) */}
            {showAssets && (
              <>
                <Connector />
                <Column title="Assets">
                  {assets.map(a => (
                    <NodeCard
                      key={a.id}
                      label={a.assetTitle}
                      sub={`${a.assetClicks} clicks · $${a.totalRevenue.toLocaleString()}`}
                      active={false}
                      dimmed={false}
                    />
                  ))}
                  {assets.length === 0 && (
                    <div className="text-[9px] text-zinc-600 uppercase tracking-widest px-2">
                      No assets
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openDestination('assets')}
                    className="mt-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 px-1"
                  >
                    <ExternalLink size={11} />
                    Open Asset Analytics table
                  </button>
                </Column>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}