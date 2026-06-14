/**
 * src/components/analytics/widgets/InDepthAnalyticsWidget.tsx
 *
 * Compact "In-Depth Analytics" table widget for the Workspace canvas.
 *
 * ARCHITECTURE — mirrors InDepthAnalytics.tsx exactly:
 *   1. Fetch raw data from Supabase (videos, campaigns, lead_magnets, events, purchases)
 *   2. Enrich via buildStripeFromPurchaseTypeTable / buildPixelPurchases
 *   3. Pass through getAnalyticsEngine() → sortedVideos
 *   4. Post-filter by platform (pure UI, same as InDepthAnalytics)
 *   5. Render all rows in a compact scrollable table
 *
 * NO stores. NO dataPool. NO widgetAnalytics.ts.
 *
 * FEATURE PARITY — every feature from InDepthAnalytics.tsx is preserved:
 *   ✓ Full analytics engine usage (getAnalyticsEngine)
 *   ✓ All TABLE_COLUMNS + CONVERSION_RATE_COLUMNS with per-column toggle
 *   ✓ Platform filter pills (All, YT, TT, IG, LI, X, TH, FB, RD, TW)
 *   ✓ Quick sort shortcuts (Revenue, Consultations, Purchases, Calls, Clicks, Opt-ins)
 *   ✓ Revenue source switching (total / stripe / pixel)
 *   ✓ EV toggle (include / exclude estimated call revenue)
 *   ✓ Date range selector
 *   ✓ Campaign selector
 *   ✓ Goal filter (multi-select)
 *   ✓ Lead magnet filter (multi-select)
 *   ✓ Column header sort click
 *   ✓ "In range" badge for videos uploaded within selected period
 *   ✓ Conversion rate cells (newsletter opt-in, call booking, consultation, purchase)
 *   ✓ resolveThumbnail + renderContentIdentity for content identity cells
 *
 * UI ADAPTATIONS for widget environment:
 *   - No fixed inset-0 / h-screen layout
 *   - No sidebar — sidebar filters collapsed into a compact toolbar strip
 *   - All controls fit in 2-3 toolbar rows within the widget body
 *   - Table scrolls within widget body (overflow: auto)
 *   - Columns dropdown uses absolute positioning relative to its trigger
 *
 * Config shape (widget.config) — persisted via onUpdate:
 *   dateRange:          DateRange   — default '30days'
 *   selectedCampaignId: string      — default 'all'
 *
 * Local UI state (not persisted — resets on widget re-mount, intentional):
 *   sortConfig, selectedPlatforms, visibleColumns, activeSource,
 *   includeEV, selectedGoals, selectedLeadMagnets, columnsOpen, filtersOpen
 */

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate }    from 'react-router-dom'
import { useAuth }        from '../../../lib/auth'
import { useOrganization } from '../../../lib/useOrganization'
import { supabase }       from '../../../lib/supabase'

import {
  getAnalyticsEngine,
  buildStripeFromPurchaseTypeTable,
  buildPixelPurchases,
  flattenSessionEvents,
  mergeEventSources,
  handleSortToggle,
  formatCellValue,
  getDateBounds,
  TABLE_COLUMNS,
  COLUMN_LABELS,
  type AnalyticsEngineInput,
  type RawEvent,
  type StripePurchaseRow,
  type PixelPurchaseRow,
  type StripePurchaseTypeRow,
  type DateRange,
  type CustomDateRange,
  type RevenueView,
  type MetricType,
  type CampaignMeta,
} from '../../../lib/analyticsEngine'

import { resolveThumbnail, renderContentIdentity } from '../../../lib/videoFormatters'
import { PLATFORM_CONFIG, type Platform }          from '../../../lib/platformParser'
import type { Widget }                             from '../store/useWorkspaceStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  widget:           Widget
  onUpdate?:        (patch: Partial<Widget>) => void
  analyticsResult?: unknown  // unused — engine fetches directly
}

// ─── Conversion rate helpers (verbatim from InDepthAnalytics.tsx) ─────────────

const convRate = (conversions: number, clicks: number): string => {
  if (!clicks || clicks <= 0) return '—'
  return `${((conversions / clicks) * 100).toFixed(1)}%`
}

type ConversionRateKey =
  | 'newsletter_optin_rate'
  | 'call_booking_rate'
  | 'consultation_rate'
  | 'purchase_rate'

const CONVERSION_RATE_COLUMNS: ConversionRateKey[] = [
  'newsletter_optin_rate',
  'call_booking_rate',
  'consultation_rate',
  'purchase_rate',
]

const CONVERSION_RATE_LABELS: Record<ConversionRateKey, string> = {
  newsletter_optin_rate: 'NL Opt-in Rate',   // shortened for widget headers
  call_booking_rate:     'Call Book. Rate',
  consultation_rate:     'Consult. Rate',
  purchase_rate:         'Purchase Rate',
}

function getConversionRate(key: ConversionRateKey, row: any): string {
  switch (key) {
    case 'newsletter_optin_rate':
      return convRate(row.newsletter_thankyou ?? 0, row.newsletter_click ?? 0)
    case 'call_booking_rate':
      return convRate(row.call_booking_thankyou ?? 0, row.call_booking_click ?? 0)
    case 'consultation_rate':
      return convRate(row.consultation_thankyou ?? 0, row.consultation_click ?? 0)
    case 'purchase_rate':
      return convRate(row.purchase_thankyou ?? 0, row.landing_page_view ?? 0)
    default:
      return '—'
  }
}

// ─── Quick sort shortcuts (verbatim from InDepthAnalytics.tsx) ────────────────

const SORT_SHORTCUTS: { label: string; key: string }[] = [
  { label: 'Rev',    key: 'total_revenue' },
  { label: 'Consult',key: 'consultation_thankyou' },
  { label: 'Purch',  key: 'purchase_thankyou' },
  { label: 'Calls',  key: 'call_booking_thankyou' },
  { label: 'Clicks', key: 'unique_clicks' },
  { label: 'Optins', key: 'newsletter_thankyou' },
]

// ─── Default column visibility (verbatim from InDepthAnalytics.tsx) ───────────
// TABLE_COLUMNS ON by default, CONVERSION_RATE_COLUMNS OFF by default

const DEFAULT_VISIBLE = new Set<string>([...TABLE_COLUMNS])

// ─── Platform options (verbatim from DashboardWidget.tsx) ─────────────────────

const PLATFORM_OPTIONS = [
  { value: 'all',       label: 'All' },
  { value: 'youtube',   label: 'YT'  },
  { value: 'tiktok',    label: 'TT'  },
  { value: 'instagram', label: 'IG'  },
  { value: 'linkedin',  label: 'LI'  },
  { value: 'x',         label: 'X'   },
  { value: 'threads',   label: 'TH'  },
  { value: 'facebook',  label: 'FB'  },
  { value: 'reddit',    label: 'RD'  },
  { value: 'twitch',    label: 'TW'  },
] as const

// ─── Goal options (verbatim from InDepthAnalytics.tsx sidebar) ────────────────

const GOAL_OPTIONS = [
  { id: 'sales',      label: 'Sales'    },
  { id: 'newsletter', label: 'Email'    },
  { id: 'calls',      label: 'Calls'    },
  { id: 'consult',    label: 'Consult'  },
  { id: 'viral',      label: 'Awareness'},
]

// ─── Session lookup helper (verbatim from InDepthAnalytics.tsx) ───────────────

async function buildSessionLookup(
  rows: any[],
): Promise<Record<string, { video_id: string; campaign_id: string }>> {
  const missingIds = rows
    .filter((p: any) => !p.video_id && p.session_id)
    .map((p: any) => p.session_id)
  if (!missingIds.length) return {}
  const { data: sData } = await supabase
    .from('sessions')
    .select('id, video_id, campaign_id')
    .in('id', missingIds)
  const lookup: Record<string, { video_id: string; campaign_id: string }> = {}
  ;(sData || []).forEach((s: any) => {
    if (s.video_id) lookup[s.id] = { video_id: s.video_id, campaign_id: s.campaign_id }
  })
  return lookup
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InDepthAnalyticsWidget({ widget, onUpdate }: Props) {
  const { user }           = useAuth()
  const { organizationId } = useOrganization()
  const navigate           = useNavigate()

  // ── Config — dateRange + campaign read from widget.config, written back ───
  const dateRange:          DateRange = (widget.config?.dateRange          as DateRange) ?? '30days'
  // Custom date range — only used when dateRange === 'custom'. Persisted
  // alongside dateRange, mirroring DashboardWidget's customRange pattern.
  const customRange: CustomDateRange | null = (widget.config?.customRange as CustomDateRange | null) ?? null
  const selectedCampaignId: string    = (widget.config?.selectedCampaignId as string)    ?? 'all'

  const patchConfig = (patch: Record<string, unknown>) =>
    onUpdate?.({ config: { ...widget.config, ...patch } })

  // Switching away from 'custom' clears the stored custom range (same as DashboardWidget).
  const setDateRange         = (v: DateRange) => patchConfig({ dateRange: v, ...(v !== 'custom' ? { customRange: null } : {}) })
  const setCustomRange       = (v: CustomDateRange | null) => patchConfig({ customRange: v })
  const setSelectedCampaignId = (v: string)   => patchConfig({ selectedCampaignId: v })

  // ── Local filter state (not persisted — intentional, same as full page) ───
  const [selectedGoals, setSelectedGoals]             = useState<string[]>([])
  const [selectedLeadMagnets, setSelectedLeadMagnets] = useState<string[]>([])
  const [activeSource, setActiveSource]               = useState<RevenueView>('total')
  const [includeEV, setIncludeEV]                     = useState<boolean>(true)
  const [sortConfig, setSortConfig]                   = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total_revenue',
    direction: 'desc',
  })
  const [selectedPlatforms, setSelectedPlatforms]     = useState<string[]>([])
  const [visibleColumns, setVisibleColumns]           = useState<Set<string>>(new Set(DEFAULT_VISIBLE))

  // ── Dropdown / panel open state ───────────────────────────────────────────
  const [columnsOpen, setColumnsOpen]   = useState(false)
  const [filtersOpen, setFiltersOpen]   = useState(false)
  // Custom date range picker — auto-open if a custom range is already active
  // (e.g. on widget reload), mirroring DashboardWidget's customRangeOpen.
  const [customRangeOpen, setCustomRangeOpen] = useState(dateRange === 'custom')
  const columnsRef = useRef<HTMLDivElement>(null)
  const filtersRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false)
      }
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Raw data state ────────────────────────────────────────────────────────
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [videos, setVideos]                   = useState<any[]>([])
  const [campaigns, setCampaigns]             = useState<any[]>([])
  const [leadMagnets, setLeadMagnets]         = useState<any[]>([])
  const [rawEvents, setRawEvents]             = useState<RawEvent[]>([])
  const [stripePurchases, setStripePurchases] = useState<StripePurchaseRow[]>([])
  const [pixelPurchases, setPixelPurchases]   = useState<PixelPurchaseRow[]>([])

  // ── Fetch — identical to InDepthAnalytics.fetchData, org-scoped ──────────
  useEffect(() => {
    if (!user || !organizationId) return
    let cancelled = false

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [vRes, cRes, lmRes] = await Promise.all([
          supabase.from('videos').select('*').eq('organization_id', organizationId),
          supabase.from('campaigns').select('*').eq('organization_id', organizationId),
          supabase.from('lead_magnets').select('*').eq('organization_id', organizationId),
        ])

        if (cancelled) return
        const vData  = vRes.data  || []
        const cData  = cRes.data  || []
        const lmData = lmRes.data || []

        setVideos(vData)
        setCampaigns(cData)
        setLeadMagnets(lmData)

        if (vData.length === 0) { setLoading(false); return }

        const videoIds    = vData.map((v: any) => v.id)
        const campaignIds = vData.map((v: any) => v.campaign_id).filter(Boolean)

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
              .select('video_id, campaign_id, amount, stripe_session_id, payment_type')
            if (campaignIds.length) {
              return q.or(
                `video_id.in.(${videoIds.join(',')}),campaign_id.in.(${campaignIds.join(',')})`,
              )
            }
            return q.in('video_id', videoIds)
          })(),

          campaignIds.length
            ? supabase
                .from('pixel_purchases')
                .select('video_id, campaign_id, amount, event_type, session_id')
                .in('campaign_id', campaignIds)
            : Promise.resolve({ data: [] as any[] }),
        ])

        const sessionResolvedEvents = flattenSessionEvents(
          (eViaSessionData.data as any[]) || [],
        )
        const allEvents = mergeEventSources(eDirectData.data || [], sessionResolvedEvents)

        const stripeRaw: StripePurchaseTypeRow[] = ((spData.data as any[]) || []).map(
          (r: any) => ({
            video_id:          r.video_id,
            campaign_id:       r.campaign_id,
            amount:            r.amount,
            stripe_session_id: r.stripe_session_id ?? null,
            payment_type:      r.payment_type ?? null,
          }),
        )
        const pixelRaw = ppData.data || []

        const [stripeSessLookup, pixelSessLookup] = await Promise.all([
          buildSessionLookup(stripeRaw.map(r => ({ ...r, session_id: r.stripe_session_id }))),
          buildSessionLookup(pixelRaw),
        ])

        const enrichedStripe = buildStripeFromPurchaseTypeTable(stripeRaw, stripeSessLookup)
        const enrichedPixel  = buildPixelPurchases(pixelRaw, pixelSessLookup)

        if (cancelled) return
        setRawEvents(allEvents)
        setStripePurchases(enrichedStripe)
        setPixelPurchases(enrichedPixel)
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load data')
        console.error('[InDepthAnalyticsWidget] Fetch error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [user, organizationId])

  // ── Engine input (verbatim from InDepthAnalytics.tsx) ────────────────────
  const engineInput = useMemo((): AnalyticsEngineInput => ({
    videos:              videos as AnalyticsEngineInput['videos'],
    campaigns:           campaigns as CampaignMeta[],
    rawEvents,
    stripePurchases,
    pixelPurchases,
    dateRange,
    customRange,
    selectedCampaignId,
    selectedGoals,
    selectedLeadMagnets,
    activeSource,
    includeEV,
    sortConfig,
  }), [
    videos, campaigns, rawEvents, stripePurchases, pixelPurchases,
    dateRange, customRange, selectedCampaignId, selectedGoals, selectedLeadMagnets,
    activeSource, includeEV, sortConfig,
  ])

  const engineResult = useMemo(() => getAnalyticsEngine(engineInput), [engineInput])
  const engineSorted = engineResult.sortedVideos

  // ── In-range bounds (UI-only indicator) ──────────────────────────────────
  const dateRangeBounds = useMemo(() => getDateBounds(dateRange, customRange), [dateRange, customRange])

  // ── Platform filter — post-engine, pure UI (verbatim) ────────────────────
  const sortedVideos = useMemo(() => {
    if (selectedPlatforms.length === 0) return engineSorted
    return engineSorted.filter(row =>
      selectedPlatforms.includes(row.video.platform ?? 'youtube'),
    )
  }, [engineSorted, selectedPlatforms])

  // Present platforms derived from full engine output
  const presentPlatforms = useMemo(() => {
    const seen = new Set<string>()
    engineSorted.forEach(row => seen.add(row.video.platform ?? 'youtube'))
    return Array.from(seen).sort()
  }, [engineSorted])

  // ── Sort handler (verbatim) ───────────────────────────────────────────────
  const handleSort = (key: string) =>
    setSortConfig(prev => handleSortToggle(prev, key))

  // ── Column toggle helpers (verbatim) ─────────────────────────────────────
  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Filtered lead magnets for current campaign ────────────────────────────
  const filteredLeadMagnets = useMemo(
    () => leadMagnets.filter(
      lm => selectedCampaignId === 'all' || lm.campaign_id === selectedCampaignId,
    ),
    [leadMagnets, selectedCampaignId],
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={s.root}>

      {/* ══ TOOLBAR ROW 1: Date · Campaign · Source · EV · Columns ════════ */}
      <div style={s.toolbarRow}>

        {/* Date range */}
        <label style={s.label}>Period</label>
        <div style={s.pillGroup}>
          {(
            [
              { value: '7days',    label: '7d'  },
              { value: '30days',   label: '30d' },
              { value: '2months',  label: '2mo' },
              { value: '6months',  label: '6mo' },
              { value: '1year',    label: '1yr' },
              { value: 'all',      label: 'All' },
            ] as { value: DateRange; label: string }[]
          ).map(opt => (
            <button
              key={opt.value}
              style={{ ...s.pill, ...(dateRange === opt.value ? s.pillActive : {}) }}
              onClick={() => { setDateRange(opt.value); setCustomRangeOpen(false) }}
            >
              {opt.label}
            </button>
          ))}
          <button
            style={{ ...s.pill, ...(dateRange === 'custom' ? s.pillActive : {}) }}
            onClick={() => setCustomRangeOpen(o => !o)}
            title="Custom range"
          >
            Custom
          </button>
        </div>

        {/* Custom range inline pickers — shown when toggled or already active */}
        {customRangeOpen && (
          <div style={{ ...s.pillGroup, gap: 4, paddingLeft: 6, paddingRight: 6 }}>
            <input
              type="date"
              value={typeof customRange?.start === 'string' ? customRange.start : ''}
              max={typeof customRange?.end === 'string' ? customRange.end : undefined}
              onChange={e => {
                const start = e.target.value
                const next = { start, end: (typeof customRange?.end === 'string' && customRange.end) || start }
                // Single atomic patch — setCustomRange + setDateRange separately
                // would each spread from the same stale widget.config, and the
                // second call would overwrite the first's customRange write.
                patchConfig({ customRange: next, dateRange: 'custom' })
              }}
              style={s.dateInput}
            />
            <span style={s.label}>–</span>
            <input
              type="date"
              value={typeof customRange?.end === 'string' ? customRange.end : ''}
              min={typeof customRange?.start === 'string' ? customRange.start : undefined}
              onChange={e => {
                const end = e.target.value
                const next = { start: (typeof customRange?.start === 'string' && customRange.start) || end, end }
                // Single atomic patch — see note above.
                patchConfig({ customRange: next, dateRange: 'custom' })
              }}
              style={s.dateInput}
            />
          </div>
        )}

        <div style={s.divider} />

        {/* Revenue source */}
        <label style={s.label}>Src</label>
        <div style={s.pillGroup}>
          {(['total', 'stripe', 'pixel'] as RevenueView[]).map(v => (
            <button
              key={v}
              style={{ ...s.pill, ...(activeSource === v ? s.pillActive : {}) }}
              onClick={() => setActiveSource(v)}
            >
              {v === 'total' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div style={s.divider} />

        {/* EV toggle */}
        <button
          style={{ ...s.pill, ...(includeEV ? s.pillActive : {}), border: '1px solid #27272a' }}
          onClick={() => setIncludeEV(v => !v)}
          title={includeEV ? 'EV included — click to exclude' : 'EV excluded — click to include'}
        >
          EV
        </button>

        <div style={s.divider} />

        {/* Columns dropdown */}
        <div style={{ position: 'relative' as const }} ref={columnsRef}>
          <button
            style={{ ...s.pill, ...(columnsOpen ? s.pillActive : {}), border: '1px solid #27272a', padding: '3px 8px' }}
            onClick={() => setColumnsOpen(v => !v)}
            title="Toggle columns"
          >
            Cols ▾
          </button>

          {columnsOpen && (
            <>
              <div style={s.backdrop} onClick={() => setColumnsOpen(false)} />
              <div style={{ ...s.dropdown, minWidth: 200 }}>
                <div style={s.dropdownHeader}>Core Metrics</div>
                {TABLE_COLUMNS.map(key => (
                  <button
                    key={key}
                    style={{ ...s.dropdownItem, ...(visibleColumns.has(key) ? s.dropdownItemActive : {}) }}
                    onClick={() => toggleColumn(key)}
                  >
                    <span style={s.checkBox}>
                      {visibleColumns.has(key) ? '✓' : ''}
                    </span>
                    {COLUMN_LABELS[key as MetricType]}
                  </button>
                ))}
                <div style={{ ...s.dropdownHeader, borderTop: '1px solid #27272a', marginTop: 2 }}>
                  Conversion Rates
                </div>
                {CONVERSION_RATE_COLUMNS.map(key => (
                  <button
                    key={key}
                    style={{ ...s.dropdownItem, ...(visibleColumns.has(key) ? s.dropdownItemActive : {}) }}
                    onClick={() => toggleColumn(key)}
                  >
                    <span style={s.checkBox}>
                      {visibleColumns.has(key) ? '✓' : ''}
                    </span>
                    {CONVERSION_RATE_LABELS[key]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Video count */}
        <span style={{ ...s.label, marginLeft: 'auto', color: '#52525b' }}>
          {sortedVideos.length} videos
        </span>

      </div>

      {/* ══ TOOLBAR ROW 2: Platform pills ══════════════════════════════════ */}
      <div style={{ ...s.toolbarRow, flexWrap: 'wrap' as const }}>

        <label style={s.label}>Platform</label>
        {/* "All" pill */}
        <button
          style={{
            ...s.pill,
            ...(selectedPlatforms.length === 0 ? { ...s.pillActive, background: '#dc2626', color: '#fff' } : {}),
          }}
          onClick={() => setSelectedPlatforms([])}
        >
          All
          <span style={s.countBadge}>{engineSorted.length}</span>
        </button>

        {presentPlatforms.map(p => {
          const cfg    = PLATFORM_CONFIG[p as Platform]
          const label  = cfg?.label ?? p
          const color  = cfg?.color ?? '#dc2626'
          const active = selectedPlatforms.includes(p)
          const count  = engineSorted.filter(r => (r.video.platform ?? 'youtube') === p).length
          return (
            <button
              key={p}
              style={{
                ...s.pill,
                ...(active ? { background: color, color: '#fff' } : {}),
              }}
              onClick={() =>
                setSelectedPlatforms(prev =>
                  prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p],
                )
              }
            >
              {cfg?.icon && <span style={{ opacity: 0.75, marginRight: 2 }}>{cfg.icon}</span>}
              {label}
              <span style={s.countBadge}>{count}</span>
            </button>
          )
        })}

      </div>

      {/* ══ TOOLBAR ROW 3: Campaign · Goals · Lead Magnets · Quick Sort ════ */}
      <div style={{ ...s.toolbarRow, flexWrap: 'wrap' as const }}>

        {/* Campaign selector */}
        <label style={s.label}>Campaign</label>
        <select
          value={selectedCampaignId}
          onChange={e => setSelectedCampaignId(e.target.value)}
          style={s.select}
        >
          <option value="all">All</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>{c.campaign_name}</option>
          ))}
        </select>

        <div style={s.divider} />

        {/* Goal filters */}
        <label style={s.label}>Goals</label>
        {GOAL_OPTIONS.map(goal => (
          <button
            key={goal.id}
            style={{ ...s.pill, ...(selectedGoals.includes(goal.id) ? s.pillActive : {}) }}
            onClick={() =>
              setSelectedGoals(prev =>
                prev.includes(goal.id) ? prev.filter(g => g !== goal.id) : [...prev, goal.id],
              )
            }
          >
            {goal.label}
          </button>
        ))}

        {filteredLeadMagnets.length > 0 && (
          <>
            <div style={s.divider} />
            <div style={{ position: 'relative' as const }} ref={filtersRef}>
              <button
                style={{ ...s.pill, ...(filtersOpen ? s.pillActive : {}), border: '1px solid #27272a', padding: '3px 8px' }}
                onClick={() => setFiltersOpen(v => !v)}
              >
                LM ({selectedLeadMagnets.length || 'All'}) ▾
              </button>

              {filtersOpen && (
                <>
                  <div style={s.backdrop} onClick={() => setFiltersOpen(false)} />
                  <div style={{ ...s.dropdown, minWidth: 200, maxHeight: 220, overflowY: 'auto' as const }}>
                    <div style={s.dropdownHeader}>Lead Magnets</div>
                    {filteredLeadMagnets.map(lm => (
                      <button
                        key={lm.id}
                        style={{ ...s.dropdownItem, ...(selectedLeadMagnets.includes(lm.id) ? s.dropdownItemActive : {}) }}
                        onClick={() =>
                          setSelectedLeadMagnets(prev =>
                            prev.includes(lm.id) ? prev.filter(id => id !== lm.id) : [...prev, lm.id],
                          )
                        }
                      >
                        <span style={s.checkBox}>{selectedLeadMagnets.includes(lm.id) ? '✓' : ''}</span>
                        {lm.lead_magnet_name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <div style={s.divider} />

        {/* Quick sort */}
        <label style={s.label}>Sort</label>
        {SORT_SHORTCUTS.map(sc => (
          <button
            key={sc.key}
            style={{
              ...s.pill,
              ...(sortConfig.key === sc.key ? { ...s.pillActive, background: '#dc2626', color: '#fff' } : {}),
            }}
            onClick={() => setSortConfig({ key: sc.key, direction: 'desc' })}
          >
            {sc.label}
          </button>
        ))}

      </div>

      {/* ══ TABLE ══════════════════════════════════════════════════════════ */}
      <div style={s.tableWrap}>
        {loading ? (
          <div style={s.stateBox}>
            <div style={s.spinner} />
            <span style={s.stateText}>Loading…</span>
          </div>
        ) : error ? (
          <div style={s.stateBox}>
            <span style={{ ...s.stateText, color: '#ef4444' }}>{error}</span>
          </div>
        ) : sortedVideos.length === 0 ? (
          <div style={s.stateBox}>
            <span style={s.stateText}>No matching videos</span>
          </div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                {/* Sticky content column header */}
                <th style={{ ...s.th, ...s.thSticky, minWidth: 220 }}>
                  Content
                </th>

                {/* Engine metric columns */}
                {TABLE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => (
                  <th
                    key={key}
                    style={{ ...s.th, cursor: 'pointer', minWidth: 110 }}
                    onClick={() => handleSort(key)}
                  >
                    <span style={{
                      ...s.thInner,
                      color: sortConfig.key === key ? '#ef4444' : undefined,
                    }}>
                      {COLUMN_LABELS[key as MetricType]}
                      <span style={{ marginLeft: 3, opacity: 0.5 }}>
                        {sortConfig.key === key ? (sortConfig.direction === 'desc' ? '↓' : '↑') : '⇅'}
                      </span>
                    </span>
                  </th>
                ))}

                {/* Conversion rate columns */}
                {CONVERSION_RATE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => (
                  <th key={key} style={{ ...s.th, minWidth: 120 }}>
                    <span style={s.thInner}>{CONVERSION_RATE_LABELS[key]}</span>
                  </th>
                ))}

                {/* Nav column */}
                <th style={s.th} />
              </tr>
            </thead>

            <tbody>
              {sortedVideos.map(row => {
                const createdAt = row.video.created_at
                const inRange   = dateRange !== 'all' && !!createdAt &&
                  new Date(createdAt) >= dateRangeBounds.start &&
                  new Date(createdAt) <= dateRangeBounds.end

                return (
                  <tr key={row.video.id} style={{ ...s.tr, ...(inRange ? s.trInRange : {}) }}>

                    {/* Content identity cell — sticky */}
                    <td style={{ ...s.td, ...s.tdSticky, ...(inRange ? s.tdInRangeBg : {}) }}>
                      <div style={s.contentCell}>
                        <img
                          src={resolveThumbnail(row.video)}
                          style={s.thumb}
                          alt=""
                          onError={e => {
                            const t = e.currentTarget
                            t.onerror = null
                            t.src = `https://placehold.co/48x27/18181b/52525b?text=${encodeURIComponent(
                              (row.video.platform ?? 'post').toUpperCase(),
                            )}`
                          }}
                        />
                        <div style={s.contentMeta}>
                          <div style={s.contentTitle}>
                            {renderContentIdentity(row.video)}
                            {inRange && (
                              <span style={s.inRangeBadge}>● in range</span>
                            )}
                          </div>
                          <div style={s.contentSub}>
                            {(row.campaign as any)?.campaign_name || 'Individual Video'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Engine metric cells */}
                    {TABLE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => (
                      <td key={key} style={s.td}>
                        {key === 'total_revenue' ? (
                          <div>
                            <div style={s.metricVal}>{formatCellValue(key, row)}</div>
                            <div style={s.revLabel}>{row.revenue_mode_label}</div>
                          </div>
                        ) : (
                          <span style={s.metricVal}>{formatCellValue(key, row)}</span>
                        )}
                      </td>
                    ))}

                    {/* Conversion rate cells */}
                    {CONVERSION_RATE_COLUMNS.filter(key => visibleColumns.has(key)).map(key => {
                      const val = getConversionRate(key, row)
                      return (
                        <td key={key} style={s.td}>
                          <span style={{ ...s.metricVal, color: val === '—' ? '#3f3f46' : '#34d399' }}>
                            {val}
                          </span>
                        </td>
                      )
                    })}

                    {/* Nav cell */}
                    <td style={{ ...s.td, textAlign: 'right' as const }}>
                      <button
                        style={s.navBtn}
                        onClick={() => navigate(`/videos/${row.video.id}`)}
                        title="Open video detail"
                      >
                        ↗
                      </button>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {

  // ── Root ───────────────────────────────────────────────────────────────────
  root: {
    display:       'flex',
    flexDirection: 'column',
    height:        '100%',
    background:    '#141414',
    overflow:      'hidden',
    fontFamily:    'inherit',
  },

  // ── Toolbar rows ───────────────────────────────────────────────────────────
  toolbarRow: {
    display:      'flex',
    alignItems:   'center',
    gap:          4,
    padding:      '4px 8px',
    borderBottom: '1px solid #1e1e1e',
    flexShrink:   0,
    overflowX:    'auto',
  },
  label: {
    fontSize:      8,
    fontWeight:    800,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#52525b',
    flexShrink:    0,
    marginRight:   2,
  },
  divider: {
    width:      1,
    height:     12,
    background: '#27272a',
    flexShrink: 0,
    marginLeft: 2,
    marginRight:2,
  },
  pillGroup: {
    display:      'flex',
    gap:          2,
    padding:      2,
    background:   '#0f0f0f',
    borderRadius: 8,
    border:       '1px solid #1e1e1e',
  },
  pill: {
    background:    'transparent',
    border:        'none',
    borderRadius:  5,
    padding:       '3px 6px',
    fontSize:      8,
    fontWeight:    800,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color:         '#52525b',
    cursor:        'pointer',
    transition:    'all 0.1s',
    flexShrink:    0,
    display:       'flex',
    alignItems:    'center',
    gap:           3,
  },
  pillActive: {
    background: '#3f3f46',
    color:      '#ffffff',
  },
  countBadge: {
    fontSize:      7,
    fontWeight:    900,
    background:    '#27272a',
    color:         '#71717a',
    borderRadius:  3,
    padding:       '1px 4px',
    lineHeight:    1,
  },
  select: {
    background:    '#1c1c1c',
    border:        '1px solid #27272a',
    borderRadius:  6,
    padding:       '3px 6px',
    fontSize:      8,
    fontWeight:    700,
    color:         '#a1a1aa',
    outline:       'none',
    cursor:        'pointer',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    maxWidth:      110,
  },
  dateInput: {
    background:    'transparent',
    border:        'none',
    borderRadius:  6,
    padding:       '3px 4px',
    fontSize:      9,
    fontWeight:    700,
    color:         '#a1a1aa',
    colorScheme:   'dark' as const,
  },

  // ── Table wrapper ──────────────────────────────────────────────────────────
  tableWrap: {
    flex:     1,
    overflow: 'auto',
    position: 'relative',
  },
  table: {
    width:           '100%',
    borderCollapse:  'collapse',
    tableLayout:     'auto',
  },

  // ── Table header ──────────────────────────────────────────────────────────
  th: {
    padding:         '5px 10px',
    textAlign:       'left',
    background:      '#111',
    borderBottom:    '1px solid #1e1e1e',
    position:        'sticky',
    top:             0,
    zIndex:          10,
    userSelect:      'none',
    verticalAlign:   'middle',
  },
  thSticky: {
    left:   0,
    zIndex: 20,
  },
  thInner: {
    fontSize:      8,
    fontWeight:    900,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#52525b',
    display:       'flex',
    alignItems:    'center',
    whiteSpace:    'nowrap',
  },

  // ── Table body ────────────────────────────────────────────────────────────
  tr: {
    borderBottom: '1px solid #1a1a1a',
    transition:   'background 0.1s',
  },
  trInRange: {
    background:     'rgba(16, 185, 129, 0.03)',
    borderLeft:     '2px solid rgba(16,185,129,0.35)',
  },
  td: {
    padding:       '5px 10px',
    verticalAlign: 'middle',
    whiteSpace:    'nowrap',
  },
  tdSticky: {
    position:   'sticky',
    left:       0,
    background: '#141414',
    zIndex:     5,
  },
  tdInRangeBg: {
    background: 'rgba(16, 185, 129, 0.05)',
  },

  // ── Content identity cell ─────────────────────────────────────────────────
  contentCell: {
    display:    'flex',
    alignItems: 'center',
    gap:        7,
    minWidth:   0,
  },
  thumb: {
    width:        48,
    aspectRatio:  '16/9',
    objectFit:    'cover',
    borderRadius: 4,
    border:       '1px solid #27272a',
    flexShrink:   0,
    display:      'block',
  },
  contentMeta: {
    minWidth: 0,
    flex:     1,
  },
  contentTitle: {
    fontSize:     10,
    fontWeight:   700,
    color:        '#d4d4d8',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
    display:      'flex',
    alignItems:   'center',
    gap:          4,
    maxWidth:     160,
  },
  contentSub: {
    fontSize:      8,
    fontWeight:    700,
    color:         '#52525b',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginTop:     1,
    overflow:      'hidden',
    textOverflow:  'ellipsis',
    whiteSpace:    'nowrap',
    maxWidth:      160,
  },
  inRangeBadge: {
    flexShrink:    0,
    fontSize:      7,
    fontWeight:    900,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#34d399',
    background:    'rgba(52,211,153,0.08)',
    border:        '1px solid rgba(52,211,153,0.25)',
    borderRadius:  4,
    padding:       '1px 4px',
    whiteSpace:    'nowrap',
  },

  // ── Metric values ─────────────────────────────────────────────────────────
  metricVal: {
    fontSize:           10,
    fontWeight:         700,
    color:              '#a1a1aa',
    fontVariantNumeric: 'tabular-nums',
    display:            'block',
  },
  revLabel: {
    fontSize:      7,
    fontWeight:    800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color:         '#3f3f46',
    marginTop:     1,
  },

  // ── Nav button ────────────────────────────────────────────────────────────
  navBtn: {
    background:   'transparent',
    border:       '1px solid #27272a',
    borderRadius: 5,
    color:        '#52525b',
    fontSize:     11,
    cursor:       'pointer',
    padding:      '2px 5px',
    lineHeight:   1,
    transition:   'all 0.1s',
  },

  // ── State / empty / loading ───────────────────────────────────────────────
  stateBox: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    padding:        32,
    height:         '100%',
    minHeight:      80,
  },
  stateText: {
    fontSize:      9,
    fontWeight:    700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#3f3f46',
  },
  spinner: {
    width:        20,
    height:       20,
    borderRadius: '50%',
    border:       '2px solid #27272a',
    borderTop:    '2px solid #dc2626',
    animation:    'spin 0.7s linear infinite',
  },

  // ── Dropdowns ─────────────────────────────────────────────────────────────
  backdrop: {
    position: 'fixed',
    inset:    0,
    zIndex:   40,
  },
  dropdown: {
    position:     'absolute',
    top:          'calc(100% + 4px)',
    left:         0,
    zIndex:       50,
    background:   '#18181b',
    border:       '1px solid #27272a',
    borderRadius: 8,
    overflow:     'hidden',
    boxShadow:    '0 8px 24px rgba(0,0,0,0.7)',
  },
  dropdownHeader: {
    padding:       '6px 10px 4px',
    fontSize:      7,
    fontWeight:    900,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color:         '#52525b',
    borderBottom:  '1px solid #27272a',
  },
  dropdownItem: {
    display:    'flex',
    alignItems: 'center',
    gap:        6,
    width:      '100%',
    textAlign:  'left',
    background: 'transparent',
    border:     'none',
    padding:    '6px 10px',
    fontSize:   10,
    fontWeight: 600,
    color:      '#71717a',
    cursor:     'pointer',
    transition: 'all 0.1s',
    whiteSpace: 'nowrap',
  },
  dropdownItemActive: {
    background: '#27272a',
    color:      '#ffffff',
  },
  checkBox: {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          12,
    height:         12,
    borderRadius:   3,
    border:         '1px solid #3f3f46',
    fontSize:       8,
    fontWeight:     900,
    color:          '#ffffff',
    flexShrink:     0,
  },
}
