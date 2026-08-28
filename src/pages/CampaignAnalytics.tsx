// pages/CampaignAnalytics.tsx
// Campaign Overview — middle stage after clicking a campaign.
// Three intentional paths: Content · Own Assets · Marketers.
import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Video, Library, Users, ArrowRight,
} from 'lucide-react';
import { getCampaign } from '../lib/mockAnalyticsData';
import { useDrillDown } from '../lib/DrillDownContext';
import AnalyticsBreadcrumb from '../components/analytics/AnalyticsBreadcrumb';

export default function CampaignAnalytics() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    state,
    openCampaignOverview,
    openContentAnalytics,
    openOwnAssetAnalytics,
    openMarketerAnalytics,
  } = useDrillDown();

  const campaign = getCampaign(id ?? '') ??
    (state.campaignId === id
      ? { id: state.campaignId!, name: state.campaignName ?? 'Campaign', clicks: 0, revenue: 0, purchases: 0, rpc: 0 }
      : null);

  // Ensure context is set if user landed via direct URL
  useEffect(() => {
    if (id && campaign && state.campaignId !== id) {
      openCampaignOverview(id, campaign.name);
    }
  }, [id, campaign?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!campaign) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-zinc-500">
        <div className="text-center">
          <p className="text-[11px] font-black uppercase tracking-widest">Campaign not found</p>
          <button
            onClick={() => navigate('/campaigns/analytics')}
            className="mt-4 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-400"
          >
            Back to Campaign Analytics
          </button>
        </div>
      </div>
    );
  }

  const cards = [
    {
      key: 'content',
      title: 'Content Analytics',
      description:
        'Performance of tracked / published content belonging to this campaign.',
      icon: Video,
      accent: 'border-blue-500/40 hover:border-blue-500/70',
      iconColor: 'text-blue-400',
      onClick: openContentAnalytics,
    },
    {
      key: 'own_assets',
      title: 'Own Asset Analytics',
      description:
        'Assets owned and promoted by the campaign owner — not shared marketer assets.',
      icon: Library,
      accent: 'border-amber-500/40 hover:border-amber-500/70',
      iconColor: 'text-amber-400',
      onClick: openOwnAssetAnalytics,
    },
    {
      key: 'marketers',
      title: 'Marketer Analytics',
      description:
        'Marketers participating in this campaign. Drill into promotions, then shared assets.',
      icon: Users,
      accent: 'border-violet-500/40 hover:border-violet-500/70',
      iconColor: 'text-violet-400',
      onClick: openMarketerAnalytics,
    },
  ] as const;

  const money = (n: number) =>
    `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden fixed inset-0 z-[100]">
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-black relative">
        <header className="bg-zinc-950 border-b border-zinc-900 px-8 shrink-0">
          <div className="h-20 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6 min-w-0">
              <button
                onClick={() => navigate('/campaigns/analytics')}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400 hover:text-white transition-all shrink-0"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="min-w-0">
                <h2 className="text-2xl font-black text-white uppercase tracking-tight truncate">
                  {campaign.name}
                </h2>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
                  Campaign overview · choose an analytical path
                </p>
              </div>
            </div>
          </div>
          <div className="pb-4">
            <AnalyticsBreadcrumb />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-10">
          {/* High-level KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10 max-w-4xl">
            {[
              { label: 'Clicks', value: campaign.clicks.toLocaleString() },
              { label: 'Revenue', value: money(campaign.revenue) },
              { label: 'Purchases', value: String(campaign.purchases) },
              { label: 'Rev / Click', value: `$${campaign.rpc.toFixed(2)}` },
            ].map(k => (
              <div
                key={k.label}
                className="bg-zinc-950 border border-zinc-900 rounded-2xl px-5 py-4"
              >
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1">
                  {k.label}
                </div>
                <div className="text-lg font-black text-white tabular-nums">{k.value}</div>
              </div>
            ))}
          </div>

          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-4">
            This campaign contains three analytical areas
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl">
            {cards.map(card => {
              const Icon = card.icon;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={card.onClick}
                  className={`group text-left bg-zinc-950 border rounded-2xl p-6 transition-all duration-200 hover:bg-zinc-900/80 ${card.accent}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center ${card.iconColor}`}>
                      <Icon size={20} />
                    </div>
                    <ArrowRight
                      size={16}
                      className="text-zinc-700 group-hover:text-white group-hover:translate-x-0.5 transition-all"
                    />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-white mb-2">
                    {card.title}
                  </h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    {card.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}