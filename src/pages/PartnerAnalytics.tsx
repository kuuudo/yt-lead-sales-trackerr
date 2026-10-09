// ─────────────────────────────────────────────────────────────────────────────
// PartnerAnalytics.tsx
// Route: /analytics/partners   (rendered inside <PageWrapper> in App.tsx)
//
// PHASE 1, UI ONLY. Nothing here is wired to real analytics.
//   KPI overview → comparison chart → partner table (checkbox multi-select)
//
// • Checking a partner ADDS it to the chart; earlier selections are kept until
//   the user unchecks them. Colors are fixed per partner (list position).
// • "Hide Chart" removes the chart from the page and leaves a corner button
//   that opens the same chart in a modal.
// • Phase 2 (not built): journey table below, filtered by selected partner(s).
//
// RULES FOR WHEN DATA IS CONNECTED LATER
//  • KPI cards are their own query; never derive them by summing the table
//    (a journey may be attributed to more than one partner → double counting).
//  • "Assigned" is not proof of revenue attribution.
//  • Partner source is unverified; PREVIEW_PARTNERS below is sample data.
//  • Scaling lives in lib/chartScale.ts and only changes presentation.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Calendar, Check, EyeOff, Minus, X } from 'lucide-react';

import { useLanguage } from '../lib/hooks';
import { type ScaleMode } from '../lib/chartScale';
import PartnerChart, { type ChartSeries, type ChartText } from '../components/analytics/PartnerChart';
import PartnerJourneySection from '../components/analytics/PartnerJourneySection';

// ── Types ───────────────────────────────────────────────────────────────────

type PartnerMode = 'marketer' | 'sponsor';
type PartnerRange = '7days' | '15days' | '30days' | '6months' | '1year' | 'all' | 'custom';
type Metric = 'revenue' | 'clicks';
type ChartView = 'trend' | 'totals';

type PartnerRow = {
  id: string;
  name: string;
  assetClicks: number | null;
  revenue: number | null;
};

// ── PREVIEW DATA (remove when the real source is connected) ─────────────────
// Magnitudes deliberately span $100 → $100,000,000 to exercise the chart
// scaling. Partner names beyond Ali / 178 / Webmood are invented labels.

const PREVIEW_PARTNERS: Record<PartnerMode, PartnerRow[]> = {
  marketer: [
    { id: 'preview-ali', name: 'Ali', assetClicks: 42, revenue: 100 },
    { id: 'preview-178', name: '178', assetClicks: 1_200_000, revenue: 100_000_000 },
    { id: 'preview-sponsor-c', name: 'Sponsor C', assetClicks: 9_800, revenue: 25_000 },
  ],
  sponsor: [
    { id: 'preview-webmood', name: 'Webmood', assetClicks: 9_800, revenue: 25_000 },
    { id: 'preview-marketer-b', name: 'Marketer B', assetClicks: 1_200_000, revenue: 100_000_000 },
    { id: 'preview-marketer-c', name: 'Marketer C', assetClicks: 42, revenue: 100 },
  ],
};

// KPI cards are independent of the table. Preview values only.
const PREVIEW_KPI: Record<PartnerMode, { revenue: number; clicks: number }> = {
  marketer: { revenue: 100_025_100, clicks: 1_209_842 },
  sponsor: { revenue: 100_025_100, clicks: 1_209_842 },
};

const PARTNER_COLORS = ['#ef4444', '#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#fb923c', '#2dd4bf'];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function previewSeries(total: number | null, points: number, seed: string, integer: boolean): (number | null)[] {
  if (total === null) return Array.from({ length: points }, () => null);
  let s = hash(seed) || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const raw = Array.from({ length: points }, () => (rnd() < 0.1 ? 0 : 0.4 + 1.2 * rnd()));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((r) => (integer ? Math.round((r / sum) * total) : Math.round((r / sum) * total * 100) / 100));
}

function buildTimeline(range: PartnerRange, customStart: string, customEnd: string) {
  const day = 86_400_000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtFull = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

  let dates: Date[] = [];
  let mode: 'day' | 'week' | 'month' = 'day';

  if (range === '6months') {
    mode = 'week';
    dates = Array.from({ length: 26 }, (_, i) => new Date(today.getTime() - (25 - i) * 7 * day));
  } else if (range === '1year' || range === 'all') {
    mode = 'month';
    dates = Array.from({ length: 12 }, (_, i) => new Date(today.getFullYear(), today.getMonth() - (11 - i), 1));
  } else {
    let n = range === '7days' ? 7 : range === '15days' ? 15 : 30;
    let start = new Date(today.getTime() - (n - 1) * day);
    if (range === 'custom' && customStart && customEnd) {
      const a = new Date(customStart);
      const b = new Date(customEnd);
      const span = Math.round((b.getTime() - a.getTime()) / day) + 1;
      if (Number.isFinite(span) && span >= 1) {
        n = Math.min(90, span);
        start = a;
      }
    }
    dates = Array.from({ length: n }, (_, i) => new Date(start.getTime() + i * day));
  }
  return {
    labels: dates.map((d) => (mode === 'month' ? fmtMonth(d) : fmtDay(d))),
    fullLabels: dates.map((d) => (mode === 'month' ? fmtMonth(d) : fmtFull(d))),
  };
}

// ── Copy (EN / 繁體中文) ────────────────────────────────────────────────────

const COPY = {
  en: {
    title: 'Partner Analytics',
    subtitle: 'Performance by partner',
    preview: 'Preview data · analytics not connected',
    'mode.marketer': 'Marketer Mode',
    'mode.sponsor': 'Sponsor Mode',
    'range.7days': 'Last 7 Days',
    'range.15days': 'Last 15 Days',
    'range.30days': 'Last 30 Days',
    'range.6months': 'Last 6 Months',
    'range.1year': 'Last Year',
    'range.all': 'Lifetime',
    'range.custom': 'Custom Range',
    totalRevenue: 'Total Revenue',
    assetClicks: 'Asset Clicks',
    'revenueHint.marketer': 'Revenue associated with my promotion',
    'revenueHint.sponsor': 'Revenue associated with my campaigns',
    'clicksHint.marketer': 'My promotion activity',
    'clicksHint.sponsor': 'Activity on my campaigns',
    trend: 'Trend',
    totals: 'Totals',
    scale: 'Scale',
    'scale.auto': 'Auto',
    'scale.linear': 'Linear',
    'scale.log': 'Log',
    hideChart: 'Hide Chart',
    showChart: 'Show chart',
    pinChart: 'Show on page',
    close: 'Close',
    'list.marketer': 'My Sponsor Performance',
    'list.sponsor': 'My Marketer Performance',
    'listHint.marketer': 'Which sponsors am I helping? Check several to compare.',
    'listHint.sponsor': 'Which marketers help promote my campaigns? Check several to compare.',
    'role.sponsor': 'Sponsor',
    'role.marketer': 'Marketer',
    partner: 'Partner',
    journeys: 'Journeys',
    selectAll: 'Select all',
    clearAll: 'Clear selection',
    removePartner: 'Remove',
    empty: 'No partners to show yet.',
    'chart.empty': 'Check a partner in the table to see it here.',
    'chart.noData': 'No data for the selected range.',
    'chart.linearBadge': 'Linear scale',
    'chart.logBadge': 'Log scale',
    'chart.auto': 'auto',
    'chart.logNote': 'Each gridline is 10× the one below. Compare ratios, not differences.',
    'chart.zeroNote': 'Zero values sit on the axis floor.',
    'chart.hatchNote': 'Hatched bars are drawn at a minimum width; exact values are shown at right.',
    'chart.forcedLinearHint': '{name} is far larger than the rest, so smaller partners are hard to see. Try Auto or Log.',
    'chart.logUnavailable': 'Log scale needs non-negative values, so Linear is shown.',
    'chart.noValue': '—',
    'journey.title': 'Journeys',
    'journey.hint': 'Full journey paths for the selected partners. Uncheck a partner above to widen the list.',
    'journey.allPartners': 'All partners (none selected)',
    'journey.scopedTo': 'Showing journeys for',
    'journey.filters': 'Filters',
    'journey.clear': 'Clear',
    'journey.showMore': 'Show more',
    'journey.showing': 'Showing',
    'journey.of': 'of',
    'journey.loading': 'Loading journeys…',
    'journey.empty': 'No journeys match the selected partners and filters',
    'journey.showOwner': 'Show Content Owner',
    'journey.hideOwner': 'Hide Content Owner',
    'journey.done': 'Show journeys',
    'journey.allPlatforms': 'All',
    'journey.assetType': 'Asset Type',
    'journey.assetScope': 'Asset Scope',
    'journey.promotion': 'Promotion',
    'journey.assetCampaign': 'Asset Campaign',
    'journey.contentCampaign': 'Content Campaign',
    'journey.campaign': 'Campaign',
    'journey.allCampaigns': 'All',
    'journey.partner': 'Partner',
    'journey.addPartner': 'Add partner…',
    'journey.range': 'Date range follows the selector above',
    'journey.truncated': 'Truncated',
  },
  zh: {
    title: '合作夥伴分析',
    subtitle: '依合作夥伴檢視成效',
    preview: '預覽資料 · 尚未連接 Analytics',
    'mode.marketer': 'Marketer 模式',
    'mode.sponsor': 'Sponsor 模式',
    'range.7days': '最近 7 天',
    'range.15days': '最近 15 天',
    'range.30days': '最近 30 天',
    'range.6months': '最近 6 個月',
    'range.1year': '最近一年',
    'range.all': '全部時間',
    'range.custom': '自訂範圍',
    totalRevenue: '總收入',
    assetClicks: 'Asset 點擊數',
    'revenueHint.marketer': '與我的推廣相關的收入',
    'revenueHint.sponsor': '與我的 Campaign 相關的收入',
    'clicksHint.marketer': '我的推廣活動量',
    'clicksHint.sponsor': '我的 Campaign 的活動量',
    trend: '趨勢',
    totals: '總計',
    scale: '刻度',
    'scale.auto': '自動',
    'scale.linear': '線性',
    'scale.log': '對數',
    hideChart: '隱藏圖表',
    showChart: '顯示圖表',
    pinChart: '放回頁面',
    close: '關閉',
    'list.marketer': '我的 Sponsor 成效',
    'list.sponsor': '我的 Marketer 成效',
    'listHint.marketer': '我正在幫哪些 Sponsor 推廣?勾選多個即可比較。',
    'listHint.sponsor': '哪些 Marketer 在幫我推廣 Campaign?勾選多個即可比較。',
    'role.sponsor': 'Sponsor',
    'role.marketer': 'Marketer',
    partner: '合作夥伴',
    journeys: 'Journey',
    selectAll: '全選',
    clearAll: '清除選取',
    removePartner: '移除',
    empty: '目前沒有可顯示的合作夥伴。',
    'chart.empty': '在下方表格勾選合作夥伴,就會顯示在這裡。',
    'chart.noData': '所選範圍內沒有資料。',
    'chart.linearBadge': '線性刻度',
    'chart.logBadge': '對數刻度',
    'chart.auto': '自動',
    'chart.logNote': '每一條格線是下一條的 10 倍,請比較倍數而非差距。',
    'chart.zeroNote': '數值為 0 的點會落在座標軸底部。',
    'chart.hatchNote': '斜線長條為最小寬度的示意,精確數值顯示在右側。',
    'chart.forcedLinearHint': '{name} 遠大於其他夥伴,較小的夥伴不易看見。可改用「自動」或「對數」。',
    'chart.logUnavailable': '對數刻度需要非負數值,因此改以線性顯示。',
    'chart.noValue': '—',
    'journey.title': 'Journey',
    'journey.hint': '所選合作夥伴的完整 Journey 路徑。取消勾選上方夥伴即可擴大範圍。',
    'journey.allPartners': '全部合作夥伴(未選取)',
    'journey.scopedTo': '顯示以下夥伴的 Journey',
    'journey.filters': '篩選',
    'journey.clear': '清除',
    'journey.showMore': '顯示更多',
    'journey.showing': '顯示',
    'journey.of': '/',
    'journey.loading': '正在載入 Journey…',
    'journey.empty': '沒有符合所選夥伴與篩選條件的 Journey',
    'journey.showOwner': '顯示內容擁有者',
    'journey.hideOwner': '隱藏內容擁有者',
    'journey.done': '顯示 Journey',
    'journey.allPlatforms': '全部',
    'journey.assetType': 'Asset 類型',
    'journey.assetScope': 'Asset 範圍',
    'journey.promotion': '推廣',
    'journey.assetCampaign': 'Asset Campaign',
    'journey.contentCampaign': 'Content Campaign',
    'journey.campaign': 'Campaign',
    'journey.allCampaigns': '全部',
    'journey.partner': '合作夥伴',
    'journey.addPartner': '新增夥伴…',
    'journey.range': '日期範圍與上方選擇器相同',
    'journey.truncated': '已截斷',
  },
} as const;

type CopyKey = keyof (typeof COPY)['en'];

const RANGE_ORDER: PartnerRange[] = ['7days', '15days', '30days', '6months', '1year', 'all', 'custom'];
const DASH = '—';

const formatCount = (n: number | null) => (n === null ? DASH : n.toLocaleString());
const formatMoney = (n: number | null) =>
  n === null ? DASH : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Link into the existing Journey Analytics page. TODAY JourneyAnalytics reads
 * no query params, so these are ignored until it is taught to read them.
 */
function buildJourneyHref(a: { mode: PartnerMode; partnerId: string; range: PartnerRange; from: string; to: string }) {
  const p = new URLSearchParams({ partnerMode: a.mode, partnerId: a.partnerId, range: a.range });
  if (a.range === 'custom') {
    if (a.from) p.set('from', a.from);
    if (a.to) p.set('to', a.to);
  }
  return `/analytics/journey?${p.toString()}`;
}

// ── Small pieces ────────────────────────────────────────────────────────────

function Segmented<T extends string>({
  value,
  options,
  onChange,
  small,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl max-w-full overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg font-black uppercase tracking-widest whitespace-nowrap transition-all ${
            small ? 'px-3 py-1.5 text-[9px]' : 'px-4 py-2 text-[10px]'
          } ${value === o.value ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Checkbox({ state, onClick, label }: { state: 'on' | 'off' | 'some'; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'some' ? 'mixed' : state === 'on'}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
        state === 'off' ? 'border-zinc-700 bg-zinc-900' : 'border-red-600 bg-red-600 text-white'
      }`}
    >
      {state === 'on' && <Check size={11} strokeWidth={3} />}
      {state === 'some' && <Minus size={11} strokeWidth={3} />}
    </button>
  );
}

function KpiCell({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-6 py-5 min-w-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-white tabular-nums truncate">{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">{hint}</div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function PartnerAnalytics() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const dict = lang === 'en' ? COPY.en : COPY.zh;
  const tr = (k: CopyKey): string => dict[k];

  const [mode, setMode] = useState<PartnerMode>('marketer');
  const [range, setRange] = useState<PartnerRange>('30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [metric, setMetric] = useState<Metric>('revenue');
  const [view, setView] = useState<ChartView>('trend');
  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto');

  const [selectedIds, setSelectedIds] = useState<string[]>([PREVIEW_PARTNERS.marketer[0].id]);
  const [chartHidden, setChartHidden] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const partners = PREVIEW_PARTNERS[mode];
  const partnerRole: PartnerMode = mode === 'marketer' ? 'sponsor' : 'marketer';

  const changeMode = (m: PartnerMode) => {
    setMode(m);
    setSelectedIds(PREVIEW_PARTNERS[m].length ? [PREVIEW_PARTNERS[m][0].id] : []);
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allState: 'on' | 'off' | 'some' =
    selectedIds.length === 0 ? 'off' : selectedIds.length === partners.length ? 'on' : 'some';

  // Modal: Esc closes, background scroll locked.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setModalOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const timeline = useMemo(() => buildTimeline(range, customStart, customEnd), [range, customStart, customEnd]);

  // Color identity = position in the partner list, so it never changes when
  // other partners are added or removed.
  const series: ChartSeries[] = useMemo(
    () =>
      partners
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => selectedIds.includes(p.id))
        .map(({ p, i }) => {
          const total = metric === 'revenue' ? p.revenue : p.assetClicks;
          return {
            id: p.id,
            name: p.name,
            color: PARTNER_COLORS[i % PARTNER_COLORS.length],
            total,
            values: previewSeries(total, timeline.labels.length, `${p.id}:${metric}`, metric === 'clicks'),
          };
        }),
    [partners, selectedIds, metric, timeline],
  );

  const chartText: ChartText = {
    empty: tr('chart.empty'),
    noData: tr('chart.noData'),
    linearBadge: tr('chart.linearBadge'),
    logBadge: tr('chart.logBadge'),
    autoSuffix: tr('chart.auto'),
    logNote: tr('chart.logNote'),
    zeroNote: tr('chart.zeroNote'),
    hatchNote: tr('chart.hatchNote'),
    forcedLinearHint: tr('chart.forcedLinearHint'),
    logUnavailable: tr('chart.logUnavailable'),
    noValue: tr('chart.noValue'),
  };

  const goToJourneys = (partnerId: string) =>
    navigate(buildJourneyHref({ mode, partnerId, range, from: customStart, to: customEnd }));

  const kpi = PREVIEW_KPI[mode];

  const renderChartPanel = (variant: 'inline' | 'modal') => (
    <section className="bg-zinc-950 border border-zinc-900 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-zinc-900">
        <h3 className="text-sm font-black text-white uppercase tracking-tight">{tr('trend')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Metric>
            small
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'revenue', label: tr('totalRevenue') },
              { value: 'clicks', label: tr('assetClicks') },
            ]}
          />
          <Segmented<ChartView>
            small
            value={view}
            onChange={setView}
            options={[
              { value: 'trend', label: tr('trend') },
              { value: 'totals', label: tr('totals') },
            ]}
          />
          <Segmented<ScaleMode>
            small
            value={scaleMode}
            onChange={setScaleMode}
            options={[
              { value: 'auto', label: tr('scale.auto') },
              { value: 'linear', label: tr('scale.linear') },
              { value: 'log', label: tr('scale.log') },
            ]}
          />
          {variant === 'inline' ? (
            <button
              type="button"
              onClick={() => setChartHidden(true)}
              className="h-9 px-3 rounded-xl border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white flex items-center gap-1.5"
            >
              <EyeOff size={14} />
              {tr('hideChart')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setChartHidden(false);
                  setModalOpen(false);
                }}
                className="h-9 px-3 rounded-xl border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white"
              >
                {tr('pinChart')}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label={tr('close')}
                className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {series.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
          {series.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-[11px] font-bold text-zinc-300"
            >
              <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
              {s.name}
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-label={`${tr('removePartner')} ${s.name}`}
                className="p-0.5 rounded text-zinc-500 hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="px-6 py-5">
        <PartnerChart
          view={view}
          metric={metric === 'revenue' ? 'currency' : 'count'}
          labels={timeline.labels}
          fullLabels={timeline.fullLabels}
          series={series}
          scaleMode={scaleMode}
          height={variant === 'modal' ? 360 : 280}
          text={chartText}
        />
      </div>
    </section>
  );

  return (
<div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">{tr('title')}</h2>
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
            {tr('subtitle')} · <span className="text-amber-500/80">{tr('preview')}</span>
          </p>
        </div>
        <Segmented<PartnerMode>
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'marketer', label: tr('mode.marketer') },
            { value: 'sponsor', label: tr('mode.sponsor') },
          ]}
        />
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-3">
        <Segmented<PartnerRange>
          small
          value={range}
          onChange={setRange}
          options={RANGE_ORDER.map((r) => ({ value: r, label: tr(`range.${r}` as CopyKey) }))}
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

      {/* KPI row (independent of the table) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-y sm:divide-y-0 divide-zinc-900 bg-zinc-950 border border-zinc-900 rounded-2xl">
        <KpiCell label={tr('totalRevenue')} value={formatMoney(kpi.revenue)} hint={tr(`revenueHint.${mode}` as CopyKey)} />
        <KpiCell label={tr('assetClicks')} value={formatCount(kpi.clicks)} hint={tr(`clicksHint.${mode}` as CopyKey)} />
      </section>

      {/* Chart (inline unless hidden) */}
      {!chartHidden && renderChartPanel('inline')}

      {/* Partner table */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-tight">{tr(`list.${mode}` as CopyKey)}</h3>
            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
              {tr(`listHint.${mode}` as CopyKey)}
            </p>
          </div>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
            >
              {tr('clearAll')} ({selectedIds.length})
            </button>
          )}
        </div>

        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
          {partners.length === 0 ? (
            <div className="px-6 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
              {tr('empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-900 border-collapse">
                <thead className="bg-zinc-950">
                  <tr>
                    <th className="w-12 pl-5 py-4 border-b border-zinc-900 text-left">
                      <Checkbox
                        state={allState}
                        label={allState === 'on' ? tr('clearAll') : tr('selectAll')}
                        onClick={() => setSelectedIds(allState === 'on' ? [] : partners.map((p) => p.id))}
                      />
                    </th>
                    <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                      {tr('partner')}
                    </th>
                    <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                      {tr('assetClicks')}
                    </th>
                    <th className="px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                      {tr('totalRevenue')}
                    </th>
                    <th className="w-28 border-b border-zinc-900" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {partners.map((p, i) => {
                    const on = selectedIds.includes(p.id);
                    return (
                      <tr
                        key={p.id}
                        onClick={() => toggle(p.id)}
                        className={`cursor-pointer transition-colors ${on ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/40'}`}
                      >
                        <td className="pl-5 py-4">
                          <Checkbox state={on ? 'on' : 'off'} label={p.name} onClick={() => toggle(p.id)} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span
                              className="w-2 h-2 rounded-sm shrink-0"
                              style={{ background: on ? PARTNER_COLORS[i % PARTNER_COLORS.length] : 'transparent' }}
                            />
                            <span className="text-sm font-bold text-white">{p.name}</span>
                            <span className="px-2 py-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                              {tr(`role.${partnerRole}` as CopyKey)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right text-sm text-zinc-300 tabular-nums">{formatCount(p.assetClicks)}</td>
                        <td className="px-4 py-4 text-right text-sm text-zinc-300 tabular-nums">{formatMoney(p.revenue)}</td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              goToJourneys(p.id);
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
                          >
                            {tr('journeys')}
                            <ArrowUpRight size={12} />
                          </button>
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
{/* Journeys for the checked partners (selection state shared) */}
      <PartnerJourneySection
        mode={mode}
        partners={partners.map((p, i) => ({ id: p.id, name: p.name, color: PARTNER_COLORS[i % PARTNER_COLORS.length] }))}
        selectedIds={selectedIds}
        onTogglePartner={toggle}
        onClearPartners={() => setSelectedIds([])}
        range={range}
        customStart={customStart}
        customEnd={customEnd}
        labels={{
          title: tr('journey.title'),
          hint: tr('journey.hint'),
          allPartners: tr('journey.allPartners'),
          scopedTo: tr('journey.scopedTo'),
          removePartner: tr('removePartner'),
          filters: tr('journey.filters'),
          clear: tr('journey.clear'),
          showMore: tr('journey.showMore'),
          showing: tr('journey.showing'),
          of: tr('journey.of'),
          loading: tr('journey.loading'),
          empty: tr('journey.empty'),
          showOwner: tr('journey.showOwner'),
          hideOwner: tr('journey.hideOwner'),
          done: tr('journey.done'),
          allPlatforms: tr('journey.allPlatforms'),
          assetType: tr('journey.assetType'),
          assetScope: tr('journey.assetScope'),
          promotion: tr('journey.promotion'),
          assetCampaign: tr('journey.assetCampaign'),
          contentCampaign: tr('journey.contentCampaign'),
          campaign: tr('journey.campaign'),
          allCampaigns: tr('journey.allCampaigns'),
          partner: tr('journey.partner'),
          addPartner: tr('journey.addPartner'),
          rangeLabel: tr('journey.range'),
          truncated: tr('journey.truncated'),
        }}
      />

      {/* Hidden chart → corner button → modal */}
      {chartHidden && !modalOpen && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label={tr('showChart')}
          title={tr('showChart')}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 rounded-full bg-red-600 text-white shadow-lg shadow-red-900/40 flex items-center justify-center hover:bg-red-500 transition-colors"
        >
          <BarChart3 size={20} />
        </button>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalOpen(false)} aria-hidden="true" />
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto">{renderChartPanel('modal')}</div>
        </div>
      )}
    </div>
  );
}
