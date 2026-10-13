// ─────────────────────────────────────────────────────────────────────────────
// PartnerAnalytics.tsx
// Route: /analytics/partners
//
// MVP: Revenue-only partner table wired to existing ranking services.
//   Marketers mode → getTopMarketersAnalytics (via loadPartnerTableStage1/More)
//   Sponsors mode  → getTopSponsorsAnalytics  (via loadPartnerTableStage1/More)
//
// Stage 1: monthly_ranking_snapshots (fast).
// Stage 2: "More" loads remaining relationships with the same formal revenue
//          path used when a marketer is outside Top-N snapshots.
//
// Journey section is UNCHANGED (still receives partners list).
// Trend disabled until real series exist. No Asset Clicks / RPC / Sessions.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Calendar, Check, EyeOff, Loader2, Minus, X } from 'lucide-react';

import { useLanguage } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { useViewing } from '../lib/ViewingContext';
import { useOrganization } from '../lib/useOrganization';
import { type ScaleMode } from '../lib/chartScale';
import PartnerChart, { type ChartSeries, type ChartText } from '../components/analytics/PartnerChart';
import PartnerJourneySection from '../components/analytics/PartnerJourneySection';
import {
  loadPartnerTableStage1,
  loadPartnerTableMore,
  type PartnerMode,
  type PartnerPreset,
  type PartnerTableRow,
} from '../services/promotion/getPartnerAnalytics';

type PartnerRange = PartnerPreset;
type ChartView = 'trend' | 'totals';

const PARTNER_COLORS = [
  '#ef4444',
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#fb923c',
  '#2dd4bf',
];

const PRESETS: { key: PartnerPreset; labelKey: string }[] = [
  { key: 'last_7_days', labelKey: 'range.last_7_days' },
  { key: 'last_30_days', labelKey: 'range.last_30_days' },
  { key: 'this_month', labelKey: 'range.this_month' },
  { key: 'last_12_months', labelKey: 'range.last_12_months' },
  { key: 'all_time', labelKey: 'range.all_time' },
  { key: 'custom', labelKey: 'range.custom' },
];

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const COPY = {
  en: {
    title: 'Partner Analytics',
    subtitle: 'Performance by partner',
    'mode.marketers': 'Marketers',
    'mode.sponsors': 'Sponsors',
    'range.last_7_days': 'Last 7 Days',
    'range.last_30_days': 'Last 30 Days',
    'range.this_month': 'This Month',
    'range.last_12_months': 'Last 12 Months',
    'range.all_time': 'All Time',
    'range.custom': 'Custom Range',
    totalRevenue: 'Total Revenue',
    'revenueHint.marketers': 'Revenue attributed to marketers in this organization',
    'revenueHint.sponsors': 'Revenue I generated for each sponsor',
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
    'list.marketers': 'My Marketer Performance',
    'list.sponsors': 'My Sponsor Performance',
    'listHint.marketers': 'Which marketers help promote my campaigns? Check several to compare.',
    'listHint.sponsors': 'Which sponsors am I helping? Check several to compare.',
    'role.sponsor': 'Sponsor',
    'role.marketer': 'Marketer',
    partner: 'Partner',
    journeys: 'Journeys',
    selectAll: 'Select all',
    clearAll: 'Clear selection',
    removePartner: 'Remove',
    empty: 'No partners to show yet.',
    more: 'More',
    loadingMore: 'Loading more…',
    'chart.empty': 'Check a partner in the table to see it here.',
    'chart.noData': 'No data for the selected range.',
    'chart.trendDisabled': 'Trend not available yet — use Totals.',
    'chart.linearBadge': 'Linear scale',
    'chart.logBadge': 'Log scale',
    'chart.auto': 'auto',
    'chart.logNote': 'Each gridline is 10× the one below. Compare ratios, not differences.',
    'chart.zeroNote': 'Zero values sit on the axis floor.',
    'chart.hatchNote': 'Hatched bars are drawn at a minimum width; exact values are shown at right.',
    'chart.forcedLinearHint':
      '{name} is far larger than the rest, so smaller partners are hard to see. Try Auto or Log.',
    'chart.logUnavailable': 'Log scale needs non-negative values, so Linear is shown.',
    'chart.noValue': '—',
    'journey.title': 'Journeys',
    'journey.hint':
      'Full journey paths for the selected partners. Uncheck a partner above to widen the list.',
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
    'journey.route': 'Route',
    'journey.sortDefault': 'Default order',
    'journey.sortLongest': 'Longest first',
    'journey.showRest': 'Show rest',
    'journey.rowsPlaceholder': 'rows',
    'journey.showRows': 'Show',
    'journey.journeysOne': '1 journey',
    'journey.journeysMany': '{n} journeys',
    'journey.videosOne': '1 video',
    'journey.videosMany': '{n} videos',
    'journey.showFlow': 'Show Journey Flow',
    'journey.hideFlow': 'Hide Journey Flow',
    'journey.flowHint':
      'Event counts on the redirect link(s) between adjacent videos. Follows the date range above.',
    'journey.flowCount':
      '{n} landing_page events on the redirect link(s) for this step (not verified as redirect clicks)',
    'journey.flowUnresolved': 'Not measurable: destination asset or matching redirect link not found',
  },
  zh: {
    title: '合作夥伴分析',
    subtitle: '依合作夥伴檢視成效',
    'mode.marketers': 'Marketers',
    'mode.sponsors': 'Sponsors',
    'range.last_7_days': '最近 7 天',
    'range.last_30_days': '最近 30 天',
    'range.this_month': '本月',
    'range.last_12_months': '最近 12 個月',
    'range.all_time': '全部時間',
    'range.custom': '自訂範圍',
    totalRevenue: '總收入',
    'revenueHint.marketers': '本組織內歸屬於 Marketer 的收入',
    'revenueHint.sponsors': '我為各 Sponsor 產生的收入',
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
    'list.marketers': '我的 Marketer 成效',
    'list.sponsors': '我的 Sponsor 成效',
    'listHint.marketers': '哪些 Marketer 在幫我推廣 Campaign？勾選多個即可比較。',
    'listHint.sponsors': '我正在幫哪些 Sponsor 推廣？勾選多個即可比較。',
    'role.sponsor': 'Sponsor',
    'role.marketer': 'Marketer',
    partner: '合作夥伴',
    journeys: 'Journey',
    selectAll: '全選',
    clearAll: '清除選取',
    removePartner: '移除',
    empty: '目前沒有可顯示的合作夥伴。',
    more: '載入更多',
    loadingMore: '載入中…',
    'chart.empty': '在下方表格勾選合作夥伴，就會顯示在這裡。',
    'chart.noData': '所選範圍內沒有資料。',
    'chart.trendDisabled': '趨勢尚未開放 — 請使用總計。',
    'chart.linearBadge': '線性刻度',
    'chart.logBadge': '對數刻度',
    'chart.auto': '自動',
    'chart.logNote': '每一條格線是下一條的 10 倍，適合比較倍數而非差距。',
    'chart.zeroNote': '數值為 0 的點會落在座標軸底部。',
    'chart.hatchNote': '斜線長條為最小寬度的示意，精確數值顯示在右側。',
    'chart.forcedLinearHint':
      '{name} 遠大於其他夥伴，較小的夥伴不易看見。可改用「自動」或「對數」。',
    'chart.logUnavailable': '對數刻度需要非負數值，因此改以線性顯示。',
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
    'journey.route': '路線',
    'journey.sortDefault': '預設排序',
    'journey.sortLongest': '最長優先',
    'journey.showRest': '顯示其餘',
    'journey.rowsPlaceholder': '列數',
    'journey.showRows': '顯示',
    'journey.journeysOne': '1 條 Journey',
    'journey.journeysMany': '{n} 條 Journey',
    'journey.videosOne': '1 支影片',
    'journey.videosMany': '{n} 支影片',
    'journey.showFlow': '顯示 Journey 流量',
    'journey.hideFlow': '隱藏 Journey 流量',
    'journey.flowHint': '相鄰影片之間 redirect 連結上的事件數，依上方日期範圍計算。',
    'journey.flowCount':
      '此步驟的 redirect 連結上有 {n} 筆 landing_page 事件(尚未驗證為 redirect 點擊)',
    'journey.flowUnresolved': '無法計算:找不到目標 Asset 或對應的 redirect 連結',
  },
} as const;

type CopyKey = keyof (typeof COPY)['en'];

const DASH = '—';
const formatMoney = (n: number | null) =>
  n === null
    ? DASH
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** JourneyAnalytics still uses the old range names; map presets for the section only. */
function journeyRangeFromPreset(
  preset: PartnerPreset,
): '7days' | '15days' | '30days' | '6months' | '1year' | 'all' | 'custom' {
  switch (preset) {
    case 'last_7_days':
      return '7days';
    case 'last_30_days':
      return '30days';
    case 'last_12_months':
      return '1year';
    case 'all_time':
      return 'all';
    case 'custom':
      return 'custom';
    default:
      return '30days';
  }
}

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

function Checkbox({
  state,
  onClick,
  label,
}: {
  state: 'on' | 'off' | 'some';
  onClick: () => void;
  label: string;
}) {
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
    <div className="relative px-6 py-5 min-w-0">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-red-600/70 via-red-600/10 to-transparent" />
      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-black tabular-nums truncate bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">
        {value}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">{hint}</div>
    </div>
  );
}

export default function PartnerAnalytics() {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const dict = lang === 'en' ? COPY.en : COPY.zh;
  const tr = (k: CopyKey): string => dict[k];

  const { user } = useAuth();
  const { viewingMemberId, viewingOrgId, isReadOnly } = useViewing();
  const { organizationId: hookOrgId } = useOrganization();
  const organizationId = isReadOnly ? (viewingOrgId ?? null) : (hookOrgId ?? null);
  const marketerUserId = isReadOnly ? viewingMemberId : (user?.id ?? null);

  const [mode, setMode] = useState<PartnerMode>('marketers');
  const [preset, setPreset] = useState<PartnerPreset>('last_30_days');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(new Date()));

  const [view, setView] = useState<ChartView>('totals');
  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto');

  const [partners, setPartners] = useState<PartnerTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreAvailable, setHasMoreAvailable] = useState(true);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [chartHidden, setChartHidden] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const requestIdRef = useRef(0);

  const customRange =
    preset === 'custom' && customStart && customEnd
      ? { start: new Date(customStart), end: new Date(customEnd) }
      : null;

  const loadParams = useMemo(
    () => ({
      mode,
      organizationId,
      marketerUserId,
      preset,
      customRange,
    }),
    [mode, organizationId, marketerUserId, preset, customStart, customEnd],
  );

  // Stage 1: snapshot-only
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setHasMoreAvailable(true);

    if (preset === 'custom') {
      const a = new Date(customStart);
      const b = new Date(customEnd);
      if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) {
        setLoading(false);
        return;
      }
    }

    loadPartnerTableStage1(loadParams)
      .then((rows) => {
        if (requestId !== requestIdRef.current) return;
        setPartners(rows);
        setSelectedIds(rows.length ? [rows[0].id] : []);
      })
      .catch((e: unknown) => {
        if (requestId !== requestIdRef.current) return;
        setError(e instanceof Error ? e.message : 'Failed to load partners');
        setPartners([]);
        setSelectedIds([]);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [loadParams]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    const requestId = requestIdRef.current;
    loadPartnerTableMore({
      ...loadParams,
      alreadyLoadedIds: partners.map((p) => p.id),
    })
      .then((extra) => {
        if (requestId !== requestIdRef.current) return;
        if (extra.length === 0) {
          setHasMoreAvailable(false);
          return;
        }
        setPartners((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const r of extra) {
            if (!ids.has(r.id)) merged.push(r);
          }
          return merged.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
        });
        setHasMoreAvailable(false);
      })
      .catch((e: unknown) => {
        if (requestId !== requestIdRef.current) return;
        setError(e instanceof Error ? e.message : 'Failed to load more partners');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoadingMore(false);
      });
  }, [loadParams, partners, loadingMore, loading]);

  const changeMode = (m: PartnerMode) => {
    setMode(m);
    setSelectedIds([]);
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allState: 'on' | 'off' | 'some' =
    selectedIds.length === 0 ? 'off' : selectedIds.length === partners.length ? 'on' : 'some';

  const partnerRole: 'sponsor' | 'marketer' = mode === 'marketers' ? 'marketer' : 'sponsor';

  // KPI: sum of currently loaded table (MVP). Not a second attribution path.
  const kpiRevenue = useMemo(() => {
    if (partners.length === 0) return null;
    return partners.reduce((s, p) => s + (p.revenue || 0), 0);
  }, [partners]);

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

  // Totals chart only (Trend disabled)
  const series: ChartSeries[] = useMemo(
    () =>
      partners
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => selectedIds.includes(p.id))
        .map(({ p, i }) => ({
          id: p.id,
          name: p.name,
          color: PARTNER_COLORS[i % PARTNER_COLORS.length],
          total: p.revenue,
          values: [p.revenue],
        })),
    [partners, selectedIds],
  );

  const chartText: ChartText = {
    empty: tr('chart.empty'),
    noData: view === 'trend' ? tr('chart.trendDisabled') : tr('chart.noData'),
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

  const jRange = journeyRangeFromPreset(preset);

  const renderChartPanel = (variant: 'inline' | 'modal') => (
    <section className="bg-gradient-to-b from-zinc-900/50 to-zinc-950 border border-zinc-800/80 rounded-2xl shadow-[0_0_40px_-24px_rgba(220,38,38,0.4)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-zinc-900">
        <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-red-600" />
          {tr('totals')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<ChartView>
            small
            value={view}
            onChange={(v) => setView(v === 'trend' ? 'totals' : v)}
            options={[
              { value: 'totals', label: tr('totals') },
              { value: 'trend', label: `${tr('trend')} · soon` },
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
        {view === 'trend' ? (
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-zinc-600 py-10">
            {tr('chart.trendDisabled')}
          </p>
        ) : (
          <PartnerChart
            view="totals"
            metric="currency"
            labels={['Total']}
            fullLabels={['Total']}
            series={series}
            scaleMode={scaleMode}
            height={variant === 'modal' ? 360 : 280}
            text={chartText}
          />
        )}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">{tr('title')}</h2>
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">
            {tr('subtitle')}
          </p>
        </div>
        <Segmented<PartnerMode>
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'marketers', label: tr('mode.marketers') },
            { value: 'sponsors', label: tr('mode.sponsors') },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3">
        <Segmented<PartnerPreset>
          small
          value={preset}
          onChange={setPreset}
          options={PRESETS.map((p) => ({ value: p.key, label: tr(p.labelKey as CopyKey) }))}
        />
        {preset === 'custom' && (
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

      <section className="grid grid-cols-1 bg-gradient-to-br from-zinc-900/60 to-zinc-950 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-[0_0_40px_-20px_rgba(220,38,38,0.45)]">
        <KpiCell
          label={tr('totalRevenue')}
          value={loading ? '…' : formatMoney(kpiRevenue)}
          hint={tr(`revenueHint.${mode}` as CopyKey)}
        />
      </section>

      {!chartHidden && renderChartPanel('inline')}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-red-600" />
              {tr(`list.${mode}` as CopyKey)}
            </h3>
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
          {loading && (
            <div className="flex items-center justify-center gap-2 px-6 py-10 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <Loader2 className="animate-spin" size={14} /> Loading…
            </div>
          )}
          {!loading && error && (
            <div className="px-6 py-6 text-center text-[11px] font-bold text-red-500">{error}</div>
          )}
          {!loading && !error && partners.length === 0 && (
            <div className="px-6 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
              {tr('empty')}
            </div>
          )}
          {!loading && !error && partners.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-900 border-collapse">
                <thead className="bg-zinc-950">
                  <tr>
                    <th className="w-12 pl-5 py-4 border-b border-zinc-900 text-left">
                      <Checkbox
                        state={allState}
                        label={allState === 'on' ? tr('clearAll') : tr('selectAll')}
                        onClick={() =>
                          setSelectedIds(allState === 'on' ? [] : partners.map((p) => p.id))
                        }
                      />
                    </th>
                    <th className="px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                      {tr('partner')}
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
                        className={`cursor-pointer transition-colors ${
                          on
                            ? 'bg-gradient-to-r from-zinc-800/60 to-transparent'
                            : 'hover:bg-zinc-900/40'
                        }`}
                      >
                        <td
                          className="pl-5 py-4"
                          style={{
                            boxShadow: on
                              ? `inset 3px 0 0 ${PARTNER_COLORS[i % PARTNER_COLORS.length]}`
                              : undefined,
                          }}
                        >
                          <Checkbox state={on ? 'on' : 'off'} label={p.name} onClick={() => toggle(p.id)} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span
                              className="w-2 h-2 rounded-sm shrink-0"
                              style={{
                                background: on
                                  ? PARTNER_COLORS[i % PARTNER_COLORS.length]
                                  : 'transparent',
                              }}
                            />
                            <span className="text-sm font-bold text-white">{p.name}</span>
                            <span className="px-2 py-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                              {tr(`role.${partnerRole}` as CopyKey)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right text-sm text-zinc-300 tabular-nums">
                          {formatMoney(p.revenue)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(
                                `/analytics/journey?partnerMode=${mode === 'marketers' ? 'sponsor' : 'marketer'}&partnerId=${encodeURIComponent(p.id)}`,
                              );
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

        {!loading && !error && hasMoreAvailable && partners.length > 0 && (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={loadMore}
              className="h-9 px-5 rounded-xl border border-zinc-800 bg-zinc-900 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-600 disabled:opacity-50 flex items-center gap-2"
            >
              {loadingMore && <Loader2 className="animate-spin" size={12} />}
              {loadingMore ? tr('loadingMore') : tr('more')}
            </button>
          </div>
        )}
      </section>

      {/* Journey section UNCHANGED — still uses partner list for chips only */}
      <PartnerJourneySection
        mode={mode === 'marketers' ? 'sponsor' : 'marketer'}
        partners={partners.map((p, i) => ({
          id: p.id,
          name: p.name,
          color: PARTNER_COLORS[i % PARTNER_COLORS.length],
        }))}
        selectedIds={selectedIds}
        onTogglePartner={toggle}
        onClearPartners={() => setSelectedIds([])}
        range={jRange}
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
          route: tr('journey.route'),
          sortDefault: tr('journey.sortDefault'),
          sortLongest: tr('journey.sortLongest'),
          showRest: tr('journey.showRest'),
          rowsPlaceholder: tr('journey.rowsPlaceholder'),
          showRows: tr('journey.showRows'),
          journeysOne: tr('journey.journeysOne'),
          journeysMany: tr('journey.journeysMany'),
          videosOne: tr('journey.videosOne'),
          videosMany: tr('journey.videosMany'),
          showFlow: tr('journey.showFlow'),
          hideFlow: tr('journey.hideFlow'),
          flowHint: tr('journey.flowHint'),
          flowCount: tr('journey.flowCount'),
          flowUnresolved: tr('journey.flowUnresolved'),
        }}
      />

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
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            {renderChartPanel('modal')}
          </div>
        </div>
      )}
    </div>
  );
}
