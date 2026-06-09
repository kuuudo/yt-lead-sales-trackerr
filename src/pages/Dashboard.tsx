// ─────────────────────────────────────────────────────────────────────────────
// Dashboard.tsx  (refactored)
//
// ARCHITECTURE
// ════════════
// Layer 1 — Raw data          : Supabase fetch, unchanged rows
// Layer 2 — Campaign capability: deriveCampaignCapabilities / mergeCampaignCapabilities
//                               Strictly from URL presence on selected campaign(s)
// Layer 3 — Column engine      : buildColumnDefs(caps) → ColumnDef[]
//                               Single source of truth. No column logic in JSX.
//
// RULES ENFORCED
// ══════════════
// • "NO DATA" is completely eliminated — no string, no fallback label
// • Null/missing values render as empty cell ("—") only at the renderer level
// • Capability flags live on campaign(s), NEVER on rows
// • Clicks shown ONLY when no funnel URLs exist (hard-enforced in columnEngine)
// • Revenue column: always last, always visible, green + bold
// • Campaign selector drives capability recalculation and column recomputation
// • Sort label reflects both active metric AND selected campaign context
// ─────────────────────────────────────────────────────────────────────────────

import { useOrganization } from '../lib/useOrganization';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase, Video, Campaign } from '../lib/supabase';
import { useAuth } from '../lib/auth';

import {
  getAnalyticsEngine,
  buildStripeFromPurchaseTypeTable,
  buildPixelPurchases,
  flattenSessionEvents,
  mergeEventSources,
  selectDisplayRevenue,
  type AnalyticsEngineInput,
  type RawEvent,
  type StripePurchaseRow,
  type PixelPurchaseRow,
  type StripePurchaseTypeRow,
  type RevenueView,
  type CampaignMeta,
  type DateRange,
  type MetricType,
} from '../lib/analyticsEngine';

// ── Column engine (Layer 2 + 3) ───────────────────────────────────────────────
import {
  deriveCampaignCapabilities,
  mergeCampaignCapabilities,
  buildSortLabel,
  defaultVisibleKeys,
  ALL_TOGGLEABLE_COLUMNS,
  RANK_COLUMN,
  CONTENT_COLUMN,
  REVENUE_COLUMN,
  type CampaignCapabilitySource,
  type ColumnDef,
} from '../lib/columnEngine';

import {
  Target, Users, DollarSign,
  Activity, AlertCircle, CheckCircle2, ArrowRight,
  ShoppingCart, ChevronDown, Settings2,
} from 'lucide-react';
import { PLATFORM_CONFIG } from '../lib/platformParser';

import {
  resolveThumbnail,
  renderContentIdentity,
} from '../lib/videoFormatters';

import { motion } from 'motion/react';
import { useNavigate, Link } from 'react-router-dom';
import { Modal } from '../components/Modal';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_FILTERS = [
  { value: 'all',       label: 'All'  },
  { value: 'youtube',   label: 'YT'   },
  { value: 'tiktok',    label: 'TT'   },
  { value: 'instagram', label: 'IG'   },
  { value: 'linkedin',  label: 'LI'   },
  { value: 'x',         label: 'X'    },
  { value: 'threads',   label: 'TH'   },
  { value: 'facebook',  label: 'FB'   },
  { value: 'reddit',    label: 'RD'   },
  { value: 'twitch',    label: 'TW'   },
] as const;

type PlatformFilter = typeof PLATFORM_FILTERS[number]['value'];

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all',   label: 'All time'   },
  { value: '7d',    label: '7 days'     },
  { value: '30d',   label: '30 days'    },
  { value: 'month', label: 'This month' },
];

// Sort options — only metrics that make sense globally
const SORT_OPTIONS: { value: MetricType; label: string }[] = [
  { value: 'total_revenue',         label: 'Revenue'        },
  { value: 'consultation_thankyou', label: 'Consultations'  },
  { value: 'purchase_thankyou',     label: 'Purchases'      },
  { value: 'call_booking_thankyou', label: 'Calls'          },
  { value: 'landing_page_view',     label: 'Clicks'         },
  { value: 'newsletter_thankyou',   label: 'Opt-ins'        },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function buildSessionLookup(
  rows: any[],
): Promise<Record<string, { video_id: string; campaign_id: string }>> {
  const missingIds = rows
    .filter((p: any) => !p.video_id && p.session_id)
    .map((p: any) => p.session_id);
  if (!missingIds.length) return {};
  const { data: sData } = await supabase
    .from('sessions')
    .select('id, video_id, campaign_id')
    .in('id', missingIds);
  const lookup: Record<string, { video_id: string; campaign_id: string }> = {};
  (sData || []).forEach((s: any) => {
    if (s.video_id) lookup[s.id] = { video_id: s.video_id, campaign_id: s.campaign_id };
  });
  return lookup;
}

function formatAddedDate(createdAt: string | null | undefined): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function rankColor(rank: number): string {
  if (rank === 1) return 'text-amber-400';
  if (rank === 2) return 'text-zinc-400';
  if (rank === 3) return 'text-amber-700';
  return 'text-zinc-700';
}

function getStatusIcon(status: string) {
  if (!status || status === 'no_data') return null;
  switch (status) {
    case 'active':  return <CheckCircle2 size={10} className="text-green-500" />;
    case 'error':   return <AlertCircle  size={10} className="text-red-500" />;
    default:        return <Activity     size={10} className="text-zinc-600" />;
  }
}

// ── Safe metric accessor ──────────────────────────────────────────────────────
// UI-level null guard. Never propagates "NO DATA". Returns 0 for missing values.
function getMetricValue(row: any, metricKey: MetricType | undefined): number {
  if (!metricKey) return 0;
  const val = row[metricKey];
  return typeof val === 'number' ? val : 0;
}

// ── Cell renderer per column role ─────────────────────────────────────────────
// All null/undefined handled HERE — nowhere else.
function renderDynamicCell(col: ColumnDef, row: any, revenueView: RevenueView) {
  if (col.role === 'revenue') {
    const rev = selectDisplayRevenue(row, revenueView);
    return (
      <td key={col.key} className="px-5 py-3 text-right sticky right-0 bg-zinc-950">
        <div className="text-sm font-black text-emerald-400 tabular-nums">
          ${(rev ?? 0).toLocaleString()}
        </div>
        {row.revenue_mode_label && (
          <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-tighter mt-0.5">
            {row.revenue_mode_label}
          </div>
        )}
      </td>
    );
  }

  const value = getMetricValue(row, col.metricKey);
  const rawVal = col.metricKey ? row[col.metricKey] : undefined;
  const isEmpty = rawVal === null || rawVal === undefined;

  // Color per metric
  const color =
    col.key === 'consultations' ? 'text-violet-400' :
    col.key === 'purchases'     ? 'text-emerald-400' :
    col.key === 'calls'         ? 'text-blue-400' :
    col.key === 'clicks'        ? 'text-zinc-400' :
    'text-zinc-400';

  return (
    <td key={col.key} className="px-4 py-3 text-center">
      <span className={`text-[11px] font-bold tabular-nums ${color}`}>
        {isEmpty ? '' : value.toLocaleString()}
      </span>
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign Selector Component
// ─────────────────────────────────────────────────────────────────────────────

interface CampaignSelectorProps {
  campaigns:          Campaign[];
  selectedCampaignId: string;
  onChange:           (id: string) => void;
}

function CampaignSelector({ campaigns, selectedCampaignId, onChange }: CampaignSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = selectedCampaignId === 'all'
    ? 'All Campaigns'
    : campaigns.find(c => c.id === selectedCampaignId)?.campaign_name ?? 'Campaign';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-[9px] font-black uppercase tracking-widest text-zinc-300 hover:border-zinc-700 transition-all"
      >
        <span className="text-zinc-600">Campaign</span>
        <span className="max-w-[140px] truncate">{selectedLabel}</span>
        <ChevronDown size={10} className={`text-zinc-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-[220px] bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
          {/* All Campaigns option */}
          <button
            onClick={() => { onChange('all'); setOpen(false); }}
            className={`w-full text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
              selectedCampaignId === 'all'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            All Campaigns
          </button>

          {/* Divider */}
          {campaigns.length > 0 && (
            <div className="border-t border-zinc-800" />
          )}

          {/* Individual campaigns */}
          {campaigns.map(c => (
            <button
              key={c.id}
              onClick={() => { onChange(c.id); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-widest truncate transition-colors ${
                selectedCampaignId === c.id
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              {c.campaign_name ?? c.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user }           = useAuth();
  const { organizationId } = useOrganization();
  const navigate           = useNavigate();

  // ── Raw data state ──────────────────────────────────────────────────────────
  const [loading, setLoading]                 = useState(true);
  const [videos, setVideos]                   = useState<Video[]>([]);
  const [campaigns, setCampaigns]             = useState<Campaign[]>([]);
  const [rawEvents, setRawEvents]             = useState<RawEvent[]>([]);
  const [stripePurchases, setStripePurchases] = useState<StripePurchaseRow[]>([]);
  const [pixelPurchases, setPixelPurchases]   = useState<PixelPurchaseRow[]>([]);

  // ── Filter + sort state ─────────────────────────────────────────────────────
  const [revenueView,       setRevenueView]      = useState<RevenueView>('total');
  const [dateRange,         setDateRange]         = useState<DateRange>('all');
  const [selectedPlatform,  setSelectedPlatform] = useState<PlatformFilter>('all');
  const [sortKey,           setSortKey]           = useState<MetricType>('total_revenue');
  const [selectedCampaignId,setSelectedCampaignId] = useState<string>('all');

  // ── Column visibility state ─────────────────────────────────────────────────
  // Seeded from campaign defaults. User overrides persist across campaign changes
  // unless the column was newly enabled/disabled by the campaign switch.
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<Set<string>>(
    () => new Set(['consultations', 'purchases', 'calls']), // sane bootstrap; recalculated below
  );
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'info' | 'danger' | 'success';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'info' });

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info') => {
    setModalConfig({ isOpen: true, title, message, variant });
  };

  useEffect(() => {
    if (user && organizationId) fetchData();
  }, [user, organizationId]);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const [vRes, cRes] = await Promise.all([
        supabase.from('videos').select('*').eq('organization_id', organizationId),
        supabase.from('campaigns').select('*').eq('organization_id', organizationId),
      ]);

      if (vRes.error) throw vRes.error;
      if (cRes.error) throw cRes.error;
      if (!vRes.data || !cRes.data) return;

      setVideos(vRes.data);
      setCampaigns(cRes.data);

      if (vRes.data.length === 0) return;

      const videoIds    = vRes.data.map((v: any) => v.id);
      const campaignIds = vRes.data.map((v: any) => v.campaign_id).filter(Boolean);

      const [eDirectData, eViaSessionData, spData, ppData] = await Promise.all([
        supabase
          .from('events')
          .select('video_id, campaign_id, event_type, created_at')
          .in('video_id', videoIds),

        supabase
          .from('events')
          .select('event_type, created_at, sessions!inner(video_id, campaign_id)')
          .is('video_id', null)
          .in('sessions.video_id', videoIds),

        (() => {
          const q = supabase
            .from('stripe_purchase_type')
            .select('video_id, campaign_id, amount, stripe_session_id, payment_type');
          if (campaignIds.length) {
            return q.or(
              `video_id.in.(${videoIds.join(',')}),campaign_id.in.(${campaignIds.join(',')})`,
            );
          }
          return q.in('video_id', videoIds);
        })(),

        campaignIds.length
          ? supabase
              .from('pixel_purchases')
              .select('video_id, campaign_id, amount, event_type, session_id')
              .in('campaign_id', campaignIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const sessionResolvedEvents = flattenSessionEvents(eViaSessionData.data as any[] || []);
      const allEvents = mergeEventSources(eDirectData.data || [], sessionResolvedEvents);

      const stripeRaw: StripePurchaseTypeRow[] = (spData.data || []).map((r: any) => ({
        video_id:          r.video_id,
        campaign_id:       r.campaign_id,
        amount:            r.amount,
        stripe_session_id: r.stripe_session_id ?? null,
        payment_type:      r.payment_type ?? null,
      }));
      const pixelRaw = ppData.data || [];

      const [stripeSessLookup, pixelSessLookup] = await Promise.all([
        buildSessionLookup(stripeRaw.map(r => ({ ...r, session_id: r.stripe_session_id }))),
        buildSessionLookup(pixelRaw),
      ]);

      const enrichedStripe = buildStripeFromPurchaseTypeTable(stripeRaw, stripeSessLookup);
      const enrichedPixel  = buildPixelPurchases(pixelRaw, pixelSessLookup);

      setRawEvents(allEvents);
      setStripePurchases(enrichedStripe);
      setPixelPurchases(enrichedPixel);
    } catch (err: any) {
      console.error('[Dashboard] Fetch Error:', err);
      showAlert('Dashboard Error', `Failed to load dashboard data: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // LAYER 2 — Campaign capability derivation
  // Recalculates whenever selectedCampaignId changes.
  // Capabilities come ONLY from the selected campaign(s) — not from the global set.
  // ─────────────────────────────────────────────────────────────────────────────

  const activeCampaigns = useMemo((): CampaignCapabilitySource[] => {
    if (selectedCampaignId === 'all') {
      return campaigns as CampaignCapabilitySource[];
    }
    const match = campaigns.find(c => c.id === selectedCampaignId);
    return match ? [match as CampaignCapabilitySource] : [];
  }, [campaigns, selectedCampaignId]);

  const capabilities = useMemo(() => {
    if (selectedCampaignId === 'all') {
      return mergeCampaignCapabilities(activeCampaigns);
    }
    return activeCampaigns.length > 0
      ? deriveCampaignCapabilities(activeCampaigns[0])
      : mergeCampaignCapabilities([]);
  }, [activeCampaigns, selectedCampaignId]);

  // LAYER 3 — Column engine capabilities still needed for defaultVisibleKeys

  // ── Column visibility sync on campaign change ────────────────────────────────
  // When campaign changes, apply new defaults — but preserve user overrides:
  // - If user had explicitly turned ON a column → keep it on
  // - If user had explicitly turned OFF a column → keep it off
  // Only columns that were never touched follow the new campaign defaults.
  // We track "user overrides" as a ref so we don't re-render on every toggle.
  const userOverridesRef = useRef<Map<string, boolean>>(new Map());
  const prevCapKeysRef   = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newDefaults = defaultVisibleKeys(capabilities);

    // On first run (prevCapKeysRef is empty), just apply defaults directly
    if (prevCapKeysRef.current.size === 0) {
      setVisibleColumnKeys(new Set(newDefaults));
      prevCapKeysRef.current = newDefaults;
      return;
    }

    // Merge: start from new campaign defaults, then apply user overrides
    const merged = new Set(newDefaults);
    for (const [key, userChoice] of userOverridesRef.current.entries()) {
      if (userChoice) {
        merged.add(key);
      } else {
        merged.delete(key);
      }
    }

    setVisibleColumnKeys(merged);
    prevCapKeysRef.current = newDefaults;
  }, [capabilities]); // runs when campaign changes (capabilities recalculates)

  // Toggle handler — records user override
  const toggleColumn = useCallback((key: string, checked: boolean) => {
    userOverridesRef.current.set(key, checked);
    setVisibleColumnKeys(prev => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  // Final ordered column list for the table
  // Order: Rank, Content, [visible dynamic in canonical order], Revenue
  const columns = useMemo((): ColumnDef[] => {
    const visibleDynamic = ALL_TOGGLEABLE_COLUMNS.filter(
      col => visibleColumnKeys.has(col.key),
    );
    return [RANK_COLUMN, CONTENT_COLUMN, ...visibleDynamic, REVENUE_COLUMN];
  }, [visibleColumnKeys]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Engine orchestration — campaign filter passed directly
  // ─────────────────────────────────────────────────────────────────────────────

  const engineInput = useMemo((): AnalyticsEngineInput => ({
    videos:              videos as any,
    campaigns:           campaigns as CampaignMeta[],
    rawEvents,
    stripePurchases,
    pixelPurchases,
    dateRange,
    selectedCampaignId,
    selectedGoals:       [],
    selectedLeadMagnets: [],
    activeSource:        revenueView,
    includeEV:           true,
    sortConfig:          { key: sortKey, direction: 'desc' },
  }), [videos, campaigns, rawEvents, stripePurchases, pixelPurchases, revenueView, dateRange, sortKey, selectedCampaignId]);

  const { sortedVideos, campaignTotals } = useMemo(
    () => getAnalyticsEngine(engineInput),
    [engineInput],
  );

  // Platform post-filter
  const filteredVideos = useMemo(
    () => selectedPlatform === 'all'
      ? sortedVideos
      : sortedVideos.filter(r => r.video.platform === selectedPlatform),
    [sortedVideos, selectedPlatform],
  );

  // ── Derived display values ──────────────────────────────────────────────────

  const displayRevenue = useMemo(
    () => selectDisplayRevenue(campaignTotals as any, revenueView),
    [campaignTotals, revenueView],
  );

  const displayRevenueLabel = revenueView === 'stripe' ? 'Verified (Stripe)'
    : revenueView === 'pixel'  ? 'Estimated (Pixel)'
    : 'Total (Hybrid)';

  const totalDirectPurchases = campaignTotals.purchase_thankyou;
  const totalOptins          = campaignTotals.newsletter_thankyou;
  const totalCallBooks       = campaignTotals.call_booking_thankyou;

  // Sort label: reflects both metric AND selected campaign context
  const selectedCampaignName = useMemo(() => {
    if (selectedCampaignId === 'all') return null;
    return campaigns.find(c => c.id === selectedCampaignId)?.campaign_name ?? null;
  }, [campaigns, selectedCampaignId]);

  const sortLabel = buildSortLabel(sortKey, selectedCampaignName);

  // Column span for empty/loading rows
  const colSpan = columns.length;

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto px-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-end pt-2">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-red-600 rounded-sm shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
            Revenue Intelligence
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">
            Operational Revenue View
          </p>
        </div>
        <Link
          to="/analytics"
          className="bg-zinc-900 border border-zinc-800 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-800 transition-all"
        >
          Go To Analytics <ArrowRight size={14} />
        </Link>
      </header>

      {/* ── Controls bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Campaign selector */}
        <CampaignSelector
          campaigns={campaigns}
          selectedCampaignId={selectedCampaignId}
          onChange={setSelectedCampaignId}
        />

        <div className="w-px h-5 bg-zinc-800" />

        {/* Revenue source */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          {(['total', 'pixel', 'stripe'] as RevenueView[]).map(v => (
            <button
              key={v}
              onClick={() => setRevenueView(v)}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                revenueView === v ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
              }`}
            >
              {v === 'total' ? 'Total' : v === 'pixel' ? 'Pixel' : 'Stripe'}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-zinc-800" />

        {/* Period */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Period</span>
          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            {DATE_RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                  dateRange === opt.value ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-5 bg-zinc-800" />

        {/* Sort by */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-start">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Sort</span>
            <span className="text-[7px] font-bold uppercase tracking-widest text-zinc-700 -mt-0.5">ranks rows only</span>
          </div>
          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSortKey(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                  sortKey === opt.value ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-5 bg-zinc-800" />

        {/* Platform filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Platform</span>
          <div className="flex flex-wrap gap-1">
            {PLATFORM_FILTERS.map(p => (
              <button
                key={p.value}
                onClick={() => setSelectedPlatform(p.value)}
                className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border transition-all ${
                  selectedPlatform === p.value
                    ? 'bg-zinc-700 border-zinc-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-5 bg-zinc-800" />

        {/* ⚙️ Column visibility panel */}
        <div className="relative">
          <button
            onClick={() => setColumnPanelOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
              columnPanelOpen
                ? 'bg-zinc-800 border-zinc-600 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
            }`}
          >
            <Settings2 size={11} />
            Columns
            <span className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 text-[7px] font-black uppercase tracking-wider">
              visibility only
            </span>
          </button>

          {columnPanelOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setColumnPanelOpen(false)}
              />
              {/* Panel */}
              <div className="absolute top-full mt-2 left-0 z-50 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">
                    Column Visibility
                  </span>
                </div>

                <div className="px-4 py-3 space-y-3">
                  {/* Revenue — always on, locked */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-300">Revenue</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600">Always on</span>
                      <input
                        type="checkbox"
                        checked
                        disabled
                        className="w-3.5 h-3.5 accent-emerald-500 opacity-50 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Toggleable columns */}
                  {ALL_TOGGLEABLE_COLUMNS.map(col => (
                    <div key={col.key} className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-zinc-300">{col.label}</span>
                      <input
                        type="checkbox"
                        checked={visibleColumnKeys.has(col.key)}
                        onChange={e => toggleColumn(col.key, e.target.checked)}
                        className="w-3.5 h-3.5 accent-zinc-400 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>

                <div className="px-4 py-2.5 border-t border-zinc-800">
                  <span className="text-[8px] font-bold text-zinc-600">
                    Defaults set by selected campaign
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Metric Cards ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label:    'Total Revenue',
            value:    `$${(displayRevenue ?? 0).toLocaleString()}`,
            sublabel: displayRevenueLabel,
            icon:     DollarSign,
            color:    'text-green-500',
          },
          {
            label:    'Direct Purchases',
            value:    totalDirectPurchases,
            sublabel: undefined,
            icon:     ShoppingCart,
            color:    'text-blue-500',
          },
          {
            label:    'Newsletter Opt-ins',
            value:    totalOptins,
            sublabel: undefined,
            icon:     Users,
            color:    'text-orange-500',
          },
          {
            label:    'Sales Calls',
            value:    totalCallBooks,
            sublabel: undefined,
            icon:     Target,
            color:    'text-red-500',
          },
        ].map(card => (
          <div
            key={card.label}
            className="bento-card py-6 px-4 flex flex-col justify-between min-h-[100px]"
          >
            <span className="label-caps !text-zinc-600 truncate">{card.label}</span>
            <div className="flex items-center justify-between mt-auto">
              <div className="flex flex-col">
                <span className="text-white text-xl font-black">{card.value}</span>
                {'sublabel' in card && card.sublabel && (
                  <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-0.5 block">
                    {card.sublabel}
                  </span>
                )}
              </div>
              <card.icon size={16} className={`${card.color} opacity-40`} />
            </div>
          </div>
        ))}
      </section>

      {/* ── Top Performing Content Leaderboard ─────────────────────────────── */}
      <section className="bento-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-900/10 flex justify-between items-center">
          <h2 className="label-caps !text-white">Top Performing Content</h2>
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
            Sorted by {sortLabel}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">

            {/* ── Column headers — driven entirely by column engine ─────────── */}
            <thead className="bg-zinc-950/50 border-b border-zinc-900">
              <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`py-3 ${
                      col.key === 'rank'    ? 'pl-4 pr-2 w-8' :
                      col.key === 'content' ? 'px-4' :
                      col.role === 'revenue' ? 'px-5 text-right sticky right-0 bg-zinc-950' :
                      'px-4 text-center'
                    }`}
                  >
                    {col.label}
                    {col.role === 'revenue' && <span className="ml-1 text-zinc-700">↓</span>}
                  </th>
                ))}
              </tr>
            </thead>

            {/* ── Rows ─────────────────────────────────────────────────────── */}
            <tbody className="divide-y divide-zinc-900/50">
              {loading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={colSpan} className="px-6 py-6">
                      <div className="h-4 bg-zinc-900 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredVideos.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-20 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-600">
                      No content matches the current filters
                    </p>
                  </td>
                </tr>
              ) : (
                filteredVideos.slice(0, 7).map((row, idx) => {
                  const rank      = idx + 1;
                  const addedDate = formatAddedDate(row.video.created_at);

                  return (
                    <tr
                      key={row.video.id}
                      className="hover:bg-white/[0.015] transition-colors cursor-pointer"
                      onClick={() => navigate(`/videos/${row.video.id}`)}
                    >
                      {columns.map(col => {

                        // ── Rank ─────────────────────────────────────────────
                        if (col.key === 'rank') {
                          return (
                            <td key="rank" className="pl-5 pr-2 py-4">
                              <span className={`text-[10px] font-black tabular-nums ${rankColor(rank)}`}>
                                #{rank}
                              </span>
                            </td>
                          );
                        }

                        // ── Content ───────────────────────────────────────────
                        if (col.key === 'content') {
                          return (
                            <td key="content" className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="relative flex-shrink-0">
                                  <img
                                    src={resolveThumbnail(row.video)}
                                    className="w-28 aspect-video rounded-lg object-cover border border-zinc-800 transition-all duration-200 hover:scale-105 hover:shadow-[0_0_14px_rgba(255,255,255,0.07)] hover:border-zinc-600"
                                  />
                                  {row.video.platform && (
                                    <span className="absolute -top-1 -right-1 text-[6px] font-black uppercase tracking-wide px-1 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-400 leading-none">
                                      {PLATFORM_CONFIG[row.video.platform]?.label ?? row.video.platform.toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0 max-w-[220px]">
                                  <p className="text-[11px] font-bold truncate leading-snug mb-1">
                                    {renderContentIdentity(row.video)}
                                  </p>
                                  {(() => {
                                    const st = row.video.status;
                                    if (!st || st === 'no_data') return null;
                                    return (
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        {getStatusIcon(st)}
                                        <span className="text-[8px] font-black uppercase text-zinc-600 tracking-tighter">
                                          {st.replace('_', ' ')}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                  {addedDate && (
                                    <p className="text-[8px] font-bold text-zinc-700 tracking-tight">
                                      Added: {addedDate}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        // ── Dynamic + Revenue columns ─────────────────────────
                        // All null/undefined handled in renderDynamicCell — never "NO DATA"
                        return renderDynamicCell(col, row, revenueView);
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Quick Actions ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 pb-4">
        <Link
          to="/videos"
          className="flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white hover:border-zinc-700 transition-all group"
        >
          Track New Content
          <ArrowRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
        </Link>
        <Link
          to="/campaigns"
          className="flex items-center justify-between px-5 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white hover:border-zinc-700 transition-all group"
        >
          View All Funnels
          <ArrowRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
        </Link>
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
        onConfirm={modalConfig.onConfirm}
      />
    </div>
  );
}
