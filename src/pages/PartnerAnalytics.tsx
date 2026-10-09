// ─────────────────────────────────────────────────────────────────────────────
// PartnerAnalytics.tsx
// Route: /analytics/partners   (rendered inside <PageWrapper> in App.tsx)
//
// MVP, UI ONLY. Nothing here is wired to real analytics yet.
//   Overview  →  Partner list  →  Partner detail  →  JourneyAnalytics
//
// Marketer Mode: "What results does my promotion bring for each Sponsor?"
// Sponsor Mode : "What results do my campaigns get, and which Marketers help?"
//
// RULES FOR WHEN DATA IS CONNECTED LATER
//  • Summary cards are their own query. Do NOT derive them by summing the
//    partner rows (a journey/revenue could be attributed to more than one
//    partner, so a sum may double count).
//  • Do NOT treat "assigned" as proof of revenue attribution.
//  • Partner source is unverified (see PLACEHOLDER_PARTNERS).
//  • This file must not touch JourneyAnalytics / CampaignJourneyMap /
//    AllAssetsAnalytics or any attribution logic.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ArrowUpRight, Calendar, X } from 'lucide-react';

import { useLanguage } from '../lib/hooks';

// ── Types ───────────────────────────────────────────────────────────────────

type PartnerMode = 'marketer' | 'sponsor';

// NOTE: JourneyAnalytics' own select has 7days/30days/2months/6months/1year/
// all/custom. '15days' is new here. Keep this local until analyticsEngine's
// DateRange / getDateBounds is confirmed to support it.
type PartnerRange =
  | '7days'
  | '15days'
  | '30days'
  | '6months'
  | '1year'
  | 'all'
  | 'custom';

type PartnerRow = {
  id: string;
  name: string;
  /** Asset clicks for the selected range. null = not connected yet. */
  assetClicks: number | null;
  /** Revenue for the selected range. null = not connected yet. */
  revenue: number | null;
};

type PartnerCampaignRow = {
  id: string;
  campaignName: string;
  promotionName: string;
  assetClicks: number | null;
  revenue: number | null;
};

// ── Placeholder data (REMOVE when real source is connected) ─────────────────
// Names come from the product brief only. How Sponsor–Marketer relationships
// are stored (assignments / assignment_collaborators / promotions) has not been
// verified against the schema, so no relationship logic is implied here.

const PLACEHOLDER_PARTNERS: Record<PartnerMode, PartnerRow[]> = {
  marketer: [
    { id: 'placeholder-ali', name: 'Ali', assetClicks: null, revenue: null },
    { id: 'placeholder-178', name: '178', assetClicks: null, revenue: null },
  ],
  sponsor: [
    { id: 'placeholder-webmood', name: 'Webmood', assetClicks: null, revenue: null },
  ],
};

const PLACEHOLDER_CAMPAIGN_ROWS: PartnerCampaignRow[] = [
  { id: 'placeholder-row', campaignName: '—', promotionName: '—', assetClicks: null, revenue: null },
];

// ── Copy (EN / 繁體中文) ────────────────────────────────────────────────────
// Kept local so this page does not depend on the shape of the shared
// translations file. Keys are named so they can move into it unchanged.

const COPY = {
  en: {
    'partnerAnalytics.title': 'Partner Analytics',
    'partnerAnalytics.subtitle': 'Summary by partner',
    'partnerAnalytics.mode.marketer': 'Marketer Mode',
    'partnerAnalytics.mode.sponsor': 'Sponsor Mode',
    'partnerAnalytics.range.7days': 'Last 7 Days',
    'partnerAnalytics.range.15days': 'Last 15 Days',
    'partnerAnalytics.range.30days': 'Last 30 Days',
    'partnerAnalytics.range.6months': 'Last 6 Months',
    'partnerAnalytics.range.1year': 'Last Year',
    'partnerAnalytics.range.all': 'Lifetime',
    'partnerAnalytics.range.custom': 'Custom Range',
    'partnerAnalytics.overview': 'Performance Overview',
    'partnerAnalytics.totalRevenue': 'Total Revenue',
    'partnerAnalytics.assetClicks': 'Asset Clicks',
    'partnerAnalytics.revenueHint.marketer': 'Revenue associated with my promotion',
    'partnerAnalytics.revenueHint.sponsor': 'Revenue associated with my campaigns',
    'partnerAnalytics.clicksHint.marketer': 'My promotion activity',
    'partnerAnalytics.clicksHint.sponsor': 'Activity on my campaigns',
    'partnerAnalytics.list.marketer': 'My Sponsor Performance',
    'partnerAnalytics.list.sponsor': 'My Marketer Performance',
    'partnerAnalytics.listHint.marketer': 'Which sponsors am I helping?',
    'partnerAnalytics.listHint.sponsor': 'Which marketers help promote my campaigns?',
    'partnerAnalytics.role.sponsor': 'Sponsor',
    'partnerAnalytics.role.marketer': 'Marketer',
    'partnerAnalytics.col.partner': 'Partner',
    'partnerAnalytics.col.campaign': 'Campaign',
    'partnerAnalytics.col.promotion': 'Promotion',
    'partnerAnalytics.viewDetails': 'View',
    'partnerAnalytics.detail.close': 'Close',
    'partnerAnalytics.detail.title.marketer': 'My promotion for',
    'partnerAnalytics.detail.title.sponsor': 'Promotion by',
    'partnerAnalytics.detail.empty': 'Campaign and promotion breakdown will appear here once analytics is connected.',
    'partnerAnalytics.viewJourneyDetails': 'View Journey Details',
    'partnerAnalytics.notConnected': 'Preview layout. Analytics is not connected yet.',
    'partnerAnalytics.empty': 'No partners to show yet.',
  },
  zh: {
    'partnerAnalytics.title': '合作夥伴分析',
    'partnerAnalytics.subtitle': '依合作夥伴彙整成效',
    'partnerAnalytics.mode.marketer': 'Marketer 模式',
    'partnerAnalytics.mode.sponsor': 'Sponsor 模式',
    'partnerAnalytics.range.7days': '最近 7 天',
    'partnerAnalytics.range.15days': '最近 15 天',
    'partnerAnalytics.range.30days': '最近 30 天',
    'partnerAnalytics.range.6months': '最近 6 個月',
    'partnerAnalytics.range.1year': '最近一年',
    'partnerAnalytics.range.all': '全部時間',
    'partnerAnalytics.range.custom': '自訂範圍',
    'partnerAnalytics.overview': '成效總覽',
    'partnerAnalytics.totalRevenue': '總收入',
    'partnerAnalytics.assetClicks': 'Asset 點擊數',
    'partnerAnalytics.revenueHint.marketer': '與我的推廣相關的收入',
    'partnerAnalytics.revenueHint.sponsor': '與我的 Campaign 相關的收入',
    'partnerAnalytics.clicksHint.marketer': '我的推廣活動量',
    'partnerAnalytics.clicksHint.sponsor': '我的 Campaign 的活動量',
    'partnerAnalytics.list.marketer': '我的 Sponsor 成效',
    'partnerAnalytics.list.sponsor': '我的 Marketer 成效',
    'partnerAnalytics.listHint.marketer': '我正在幫哪些 Sponsor 推廣？',
    'partnerAnalytics.listHint.sponsor': '哪些 Marketer 在幫我推廣 Campaign？',
    'partnerAnalytics.role.sponsor': 'Sponsor',
    'partnerAnalytics.role.marketer': 'Marketer',
    'partnerAnalytics.col.partner': '合作夥伴',
    'partnerAnalytics.col.campaign': 'Campaign',
    'partnerAnalytics.col.promotion': 'Promotion',
    'partnerAnalytics.viewDetails': '查看',
    'partnerAnalytics.detail.close': '關閉',
    'partnerAnalytics.detail.title.marketer': '我為此 Sponsor 的推廣：',
    'partnerAnalytics.detail.title.sponsor': '推廣者：',
    'partnerAnalytics.detail.empty': '連接 Analytics 後，這裡會顯示 Campaign 與 Promotion 明細。',
    'partnerAnalytics.viewJourneyDetails': '查看 Journey 詳情',
    'partnerAnalytics.notConnected': '版面預覽，尚未連接 Analytics。',
    'partnerAnalytics.empty': '目前沒有可顯示的合作夥伴。',
  },
} as const;

type CopyKey = keyof (typeof COPY)['en'];

const RANGE_ORDER: PartnerRange[] = ['7days', '15days', '30days', '6months', '1year', 'all', 'custom'];

// ── Helpers ─────────────────────────────────────────────────────────────────

const DASH = '—';

function formatCount(n: number | null): string {
  return n === null ? DASH : n.toLocaleString();
}

function formatMoney(n: number | null): string {
  return n === null
    ? DASH
    : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Builds the link to the existing Journey Analytics page.
 *
 * TODAY JourneyAnalytics reads NO query params (its only URL input is a
 * `:campaignId` path param, and /analytics/journey has no such param in
 * App.tsx), so these params are ignored. They are sent now so the contract is
 * fixed: when JourneyAnalytics learns to read them, this page needs no change.
 * Always navigate to journeys, never to a rebuilt/truncated path view.
 */
function buildJourneyHref(args: {
  mode: PartnerMode;
  partnerId: string;
  range: PartnerRange;
  customStart: string;
  customEnd: string;
}): string {
  const params = new URLSearchParams();
  params.set('partnerMode', args.mode);
  params.set('partnerId', args.partnerId);
  params.set('range', args.range);
  if (args.range === 'custom') {
    if (args.customStart) params.set('from', args.customStart);
    if (args.customEnd) params.set('to', args.customEnd);
  }
  return `/analytics/journey?${params.toString()}`;
}

// ── Small reusable pieces (local to this page) ──────────────────────────────

function ModeSwitch({
  mode,
  onChange,
  labels,
}: {
  mode: PartnerMode;
  onChange: (m: PartnerMode) => void;
  labels: Record<PartnerMode, string>;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
      {(['marketer', 'sponsor'] as PartnerMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            mode === m ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          {labels[m]}
        </button>
      ))}
    </div>
  );
}

function RangePills({
  range,
  onChange,
  label,
}: {
  range: PartnerRange;
  onChange: (r: PartnerRange) => void;
  label: (r: PartnerRange) => string;
}) {
  return (
    <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto max-w-full">
      {RANGE_ORDER.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          aria-pressed={range === r}
          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
            range === r ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          {label(r)}
        </button>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6">
      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-3 text-3xl font-black text-white tabular-nums">{value}</div>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">{hint}</div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function PartnerAnalytics() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const dict = lang === 'en' ? COPY.en : COPY.zh;
  const tr = (key: CopyKey): string => dict[key];

  const [mode, setMode] = useState<PartnerMode>('marketer');
  const [range, setRange] = useState<PartnerRange>('30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  // Marketer Mode lists Sponsors; Sponsor Mode lists Marketers.
  const partnerRole: PartnerMode = mode === 'marketer' ? 'sponsor' : 'marketer';
  const partners = PLACEHOLDER_PARTNERS[mode];

  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === selectedPartnerId) ?? null,
    [partners, selectedPartnerId],
  );

  const handleModeChange = (m: PartnerMode) => {
    setMode(m);
    setSelectedPartnerId(null); // partner list changes with the mode
  };

  const goToJourneys = (partnerId: string) =>
    navigate(buildJourneyHref({ mode, partnerId, range, customStart, customEnd }));

  return (
    <div className="flex flex-col gap-8">
      {/* Header + mode switch */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">
            {tr('partnerAnalytics.title')}
          </h2>
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
            {tr('partnerAnalytics.subtitle')}
          </p>
        </div>
        <ModeSwitch
          mode={mode}
          onChange={handleModeChange}
          labels={{
            marketer: tr('partnerAnalytics.mode.marketer'),
            sponsor: tr('partnerAnalytics.mode.sponsor'),
          }}
        />
      </div>

      {/* Date range controls the whole page */}
      <div className="flex flex-col gap-3">
        <RangePills
          range={range}
          onChange={setRange}
          label={(r) => tr(`partnerAnalytics.range.${r}` as CopyKey)}
        />
        {range === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <Calendar size={12} className="text-zinc-600" />
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] text-zinc-300 outline-none focus:border-red-600"
            />
            <span className="text-zinc-700">–</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[10px] text-zinc-300 outline-none focus:border-red-600"
            />
          </div>
        )}
      </div>

      {/* Layer 1 — overview */}
      <section className="flex flex-col gap-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          {tr('partnerAnalytics.overview')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryCard
            label={tr('partnerAnalytics.totalRevenue')}
            value={`$ ${DASH}`}
            hint={tr(`partnerAnalytics.revenueHint.${mode}` as CopyKey)}
          />
          <SummaryCard
            label={tr('partnerAnalytics.assetClicks')}
            value={DASH}
            hint={tr(`partnerAnalytics.clicksHint.${mode}` as CopyKey)}
          />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-700">
          {tr('partnerAnalytics.notConnected')}
        </p>
      </section>

      {/* Layer 2 — partner list */}
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-tight">
            {tr(`partnerAnalytics.list.${mode}` as CopyKey)}
          </h3>
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
            {tr(`partnerAnalytics.listHint.${mode}` as CopyKey)}
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
          {partners.length === 0 ? (
            <div className="px-6 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
              {tr('partnerAnalytics.empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-900 border-collapse">
                <thead className="bg-zinc-950">
                  <tr>
                    <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                      {tr('partnerAnalytics.col.partner')}
                    </th>
                    <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                      {tr('partnerAnalytics.assetClicks')}
                    </th>
                    <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                      {tr('partnerAnalytics.totalRevenue')}
                    </th>
                    <th className="w-24 border-b border-zinc-900" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {partners.map((p) => {
                    const active = p.id === selectedPartnerId;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedPartnerId(active ? null : p.id)}
                        className={`cursor-pointer transition-colors ${
                          active ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'
                        }`}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-white">{p.name}</span>
                            <span className="px-2 py-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                              {tr(`partnerAnalytics.role.${partnerRole}` as CopyKey)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right text-sm text-zinc-300 tabular-nums">
                          {formatCount(p.assetClicks)}
                        </td>
                        <td className="px-4 py-4 text-right text-sm text-zinc-300 tabular-nums">
                          {formatMoney(p.revenue)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                            {tr('partnerAnalytics.viewDetails')}
                            <ChevronRight
                              size={12}
                              className={`transition-transform ${active ? 'rotate-90' : ''}`}
                            />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Layer 3 — partner detail */}
      {selectedPartner && (
        <section className="bg-zinc-950 border border-zinc-900 rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-zinc-900">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                {tr(`partnerAnalytics.detail.title.${mode}` as CopyKey)}
              </div>
              <div className="text-lg font-black text-white truncate">{selectedPartner.name}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToJourneys(selectedPartner.id)}
                className="h-9 px-4 rounded-xl border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-600 transition-all flex items-center gap-1.5"
              >
                {tr('partnerAnalytics.viewJourneyDetails')}
                <ArrowUpRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => setSelectedPartnerId(null)}
                aria-label={tr('partnerAnalytics.detail.close')}
                className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
            <SummaryCard
              label={tr('partnerAnalytics.totalRevenue')}
              value={formatMoney(selectedPartner.revenue)}
              hint={tr('partnerAnalytics.notConnected')}
            />
            <SummaryCard
              label={tr('partnerAnalytics.assetClicks')}
              value={formatCount(selectedPartner.assetClicks)}
              hint={tr('partnerAnalytics.notConnected')}
            />
          </div>

          <div className="overflow-x-auto border-t border-zinc-900">
            <table className="min-w-full divide-y divide-zinc-900 border-collapse">
              <thead className="bg-zinc-950">
                <tr>
                  <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                    {tr('partnerAnalytics.col.campaign')}
                  </th>
                  <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                    {tr('partnerAnalytics.col.promotion')}
                  </th>
                  <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                    {tr('partnerAnalytics.assetClicks')}
                  </th>
                  <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                    {tr('partnerAnalytics.totalRevenue')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {PLACEHOLDER_CAMPAIGN_ROWS.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-4 text-sm text-zinc-300">{r.campaignName}</td>
                    <td className="px-4 py-4 text-sm text-zinc-300">{r.promotionName}</td>
                    <td className="px-4 py-4 text-right text-sm text-zinc-300 tabular-nums">
                      {formatCount(r.assetClicks)}
                    </td>
                    <td className="px-4 py-4 text-right text-sm text-zinc-300 tabular-nums">
                      {formatMoney(r.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-700 border-t border-zinc-900">
            {tr('partnerAnalytics.detail.empty')}
          </p>
        </section>
      )}
    </div>
  );
}
