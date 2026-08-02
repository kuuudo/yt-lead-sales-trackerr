/**
 * src/components/analytics/widgets/DashboardWidget.tsx
 *
 * Compact "Top Content" leaderboard widget for the Workspace canvas.
 *
 * ARCHITECTURE — mirrors Dashboard.tsx exactly:
 *   1. Fetch raw data from Supabase (videos, campaigns, events, purchases)
 *   2. Enrich via buildStripeFromPurchaseTypeTable / buildPixelPurchases
 *   3. Pass through getAnalyticsEngine() → sortedVideos
 *   4. Post-filter by platform (same as Dashboard)
 *   5. Render top N rows
 *
 * NO stores. NO dataPool. NO widgetAnalytics.ts. No transport layers.
 *
 * Config shape (widget.config) — all persisted via onUpdate:
 *   dateRange:          DateRange   — default 'all'
 *   selectedCampaignId: string      — default 'all'
 *   sortKey:            MetricType  — default 'total_revenue'
 *   selectedPlatform:   string      — default 'all'
 *   visibleMetric:      MetricType  — default 'total_revenue'  (column shown beside title)
 */

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth }         from '../../../lib/auth'
import { useOrganization } from '../../../lib/useOrganization'
import { supabase }        from '../../../lib/supabase'
import { dashboardWidgetPageCache } from '../../../lib/dashboardWidgetPageCache'
import {
  getAnalyticsEngine,
  buildStripeFromPurchaseTypeTable,
  buildPixelPurchases,
  flattenSessionEvents,
  mergeEventSources,
  selectDisplayRevenue,
  filterVideosByDateRange,
  type AnalyticsEngineInput,
  type RawEvent,
  type StripePurchaseRow,
  type PixelPurchaseRow,
  type StripePurchaseTypeRow,
  type CampaignMeta,
  type DateRange,
  type CustomDateRange,
  type MetricType,
} from '../../../lib/analyticsEngine'

import { resolveThumbnail, renderContentIdentity } from '../../../lib/videoFormatters'
import { PLATFORM_CONFIG }                         from '../../../lib/platformParser'
import type { Widget }                             from '../store/useWorkspaceStore'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  widget:           Widget
  onUpdate?:        (patch: Partial<Widget>) => void
  analyticsResult?: unknown  // unused — engine fetches directly
}

// ─── Constants — identical values to Dashboard.tsx ───────────────────────────

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: '7days',     label: '7d'  },
  { value: '30days',    label: '30d' },
  { value: 'thismonth', label: 'Mo'  },
]

// Full list from Dashboard — compact labels for widget
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

type PlatformFilter = typeof PLATFORM_OPTIONS[number]['value']

// Sort options — identical to Dashboard.tsx
const SORT_OPTIONS: { value: MetricType; label: string; shortLabel: string }[] = [
  { value: 'total_revenue',         label: 'Revenue',       shortLabel: 'Rev'   },
  { value: 'consultation_thankyou', label: 'Consultations', shortLabel: 'Cons'  },
  { value: 'purchase_thankyou',     label: 'Purchases',     shortLabel: 'Purch' },
  { value: 'call_booking_thankyou', label: 'Calls',         shortLabel: 'Calls' },
  { value: 'landing_page_view',     label: 'Clicks',        shortLabel: 'Clks'  },
  { value: 'newsletter_thankyou',   label: 'Opt-ins',       shortLabel: 'Optins'},
]

// Color per sort metric key — used for the value badge in each row
const METRIC_COLORS: Partial<Record<MetricType, string>> = {
  total_revenue:         '#34d399',  // emerald
  consultation_thankyou: '#a78bfa',  // violet
  purchase_thankyou:     '#34d399',  // emerald
  call_booking_thankyou: '#60a5fa',  // blue
  landing_page_view:     '#a1a1aa',  // zinc
  newsletter_thankyou:   '#fb923c',  // orange
}

const TOP_N = 5

// ─── Local helpers (verbatim from Dashboard.tsx) ──────────────────────────────

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

function rankColor(rank: number): string {
  if (rank === 1) return '#FBBF24'  // amber-400
  if (rank === 2) return '#9CA3AF'  // zinc-400
  if (rank === 3) return '#B45309'  // amber-700
  return '#3F3F46'                  // zinc-700
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardWidget({ widget, onUpdate }: Props) {
  const { user }           = useAuth()
  const { organizationId } = useOrganization()

  // ── Config — all values read from widget.config, written back via onUpdate ──
  // Matches the config shape in WIDGET_DEFAULTS in WidgetRegistry.ts.

  const dateRange:          DateRange     = (widget.config?.dateRange          as DateRange)     ?? 'all'
  const customRange:        CustomDateRange | null = (widget.config?.customRange as CustomDateRange | null) ?? null
  const selectedCampaignId: string        = (widget.config?.selectedCampaignId as string)        ?? 'all'
  const sortKey:            MetricType    = (widget.config?.sortKey            as MetricType)    ?? 'total_revenue'
  const selectedPlatform:   PlatformFilter = (widget.config?.selectedPlatform  as PlatformFilter) ?? 'all'
  // visibleMetric: which metric value to display in the row right-hand column.
  // Defaults to following sortKey so the sort always has visible context.
  const visibleMetric: MetricType = (widget.config?.visibleMetric as MetricType) ?? sortKey

  // Single config patch helper — merges into existing config
  const patchConfig = (patch: Record<string, unknown>) =>
    onUpdate?.({ config: { ...widget.config, ...patch } })

  // When sort changes, also update visibleMetric to match (keeps display in sync).
  // User can diverge them via the column toggle if they want.
  const setSortKey = (v: MetricType) =>
    patchConfig({ sortKey: v, visibleMetric: v })

  const setDateRange        = (v: DateRange)      => patchConfig({ dateRange: v, ...(v !== 'custom' ? { customRange: null } : {}) })
  const setCustomRange      = (v: CustomDateRange | null) => patchConfig({ customRange: v })
  const setSelectedPlatform = (v: PlatformFilter) => patchConfig({ selectedPlatform: v })
  const setVisibleMetric    = (v: MetricType)      => patchConfig({ visibleMetric: v })

  // ── Column visibility panel (local UI state — not persisted) ────────────────
  const [colPanelOpen, setColPanelOpen] = useState(false)
  const [customRangeOpen, setCustomRangeOpen] = useState(false)

  // ── Raw data state ──────────────────────────────────────────────────────────
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [videos, setVideos]                   = useState<any[]>([])
  const [campaigns, setCampaigns]             = useState<any[]>([])
  const [rawEvents, setRawEvents]             = useState<RawEvent[]>([])
  const [stripePurchases, setStripePurchases] = useState<StripePurchaseRow[]>([])
  const [pixelPurchases, setPixelPurchases]   = useState<PixelPurchaseRow[]>([])

  // ── Fetch — identical to Dashboard.fetchData ────────────────────────────────
  useEffect(() => {
    if (!user || !organizationId) return

    const cached = dashboardWidgetPageCache.get(organizationId)
    if (cached) {
      console.log('[DashboardWidget] Cache hit', new Date(cached.cachedAt).toLocaleTimeString())
      setVideos(cached.data.videos)
      setCampaigns(cached.data.campaigns)
      setRawEvents(cached.data.rawEvents)
      setStripePurchases(cached.data.stripePurchases)
      setPixelPurchases(cached.data.pixelPurchases)
      setLoading(false)
      return
    }
    console.log('[DashboardWidget] Cache miss — fetching from Supabase')

    let cancelled = false

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [vRes, cRes] = await Promise.all([
          supabase.from('videos').select('*').eq('organization_id', organizationId),
          supabase.from('campaigns').select('*').eq('organization_id', organizationId),
        ])

        if (vRes.error) throw vRes.error
        if (cRes.error) throw cRes.error
        if (!vRes.data || !cRes.data) return

        if (cancelled) return
        setVideos(vRes.data)
        setCampaigns(cRes.data)

        if (vRes.data.length === 0) {
          setLoading(false)
          if (!cancelled) {
            dashboardWidgetPageCache.set(organizationId, {
              videos: vRes.data, campaigns: cRes.data,
              rawEvents: [], stripePurchases: [], pixelPurchases: [],
            })
            console.log('[DashboardWidget] Cache updated (no videos)')
          }
          return
        }

        const videoIds    = vRes.data.map((v: any) => v.id)
        const campaignIds = vRes.data.map((v: any) => v.campaign_id).filter(Boolean)

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

        dashboardWidgetPageCache.set(organizationId, {
          videos: vRes.data, campaigns: cRes.data,
          rawEvents: allEvents, stripePurchases: enrichedStripe, pixelPurchases: enrichedPixel,
        })
        console.log('[DashboardWidget] Cache updated')
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load data')
        console.error('[DashboardWidget] Fetch error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [user?.id, organizationId])

  // ── Engine — sortConfig now driven by sortKey from config ───────────────────

  const engineInput = useMemo((): AnalyticsEngineInput => ({
    videos:              videos as any,
    campaigns:           campaigns as CampaignMeta[],
    rawEvents,
    stripePurchases,
    pixelPurchases,
    dateRange,
    customRange,
    selectedCampaignId,
    selectedGoals:       [],
    selectedLeadMagnets: [],
    activeSource:        'total',
    includeEV:           true,
    sortConfig:          { key: sortKey, direction: 'desc' },
  }), [videos, campaigns, rawEvents, stripePurchases, pixelPurchases, dateRange, customRange, selectedCampaignId, sortKey])

  const { sortedVideos } = useMemo(() => getAnalyticsEngine(engineInput), [engineInput])

  // Platform filter + content date filter — identical to Dashboard.tsx.
  // analyticsEngine's date filtering only applies to events/metrics
  // (sortedVideos retains ALL videos matching campaign/goal filters), so the
  // displayed content list is additionally restricted here to videos whose
  // created_at falls within the selected date range / custom range.
  const filteredVideos = useMemo(() => {
    const platformFiltered = selectedPlatform === 'all'
      ? sortedVideos
      : sortedVideos.filter(r => r.video.platform === selectedPlatform)

    if (dateRange === 'all') return platformFiltered

    const datePassingVideos = new Set(
      filterVideosByDateRange(
        platformFiltered.map(r => r.video),
        dateRange,
        customRange,
      ).map(v => v.id),
    )

    return platformFiltered.filter(r => datePassingVideos.has(r.video.id))
  }, [sortedVideos, selectedPlatform, dateRange, customRange])

  const topVideos = filteredVideos.slice(0, TOP_N)

  // Resolved labels for the current sort/metric
  const sortOption      = SORT_OPTIONS.find(o => o.value === sortKey)
  const metricOption    = SORT_OPTIONS.find(o => o.value === visibleMetric)
  const metricColor     = METRIC_COLORS[visibleMetric] ?? '#a1a1aa'
  const isRevenueMetric = visibleMetric === 'total_revenue' || visibleMetric === 'purchase_thankyou'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>

      {/* ── Toolbar row 1: Period + Sort ─────────────────────────────────── */}
      <div style={styles.toolbarRow}>

        <span style={styles.toolbarLabel}>Period</span>
        <div style={styles.pillGroup}>
          {DATE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={{ ...styles.pill, ...(dateRange === opt.value ? styles.pillActive : {}) }}
              onClick={() => { setDateRange(opt.value); setCustomRangeOpen(false) }}
            >
              {opt.label}
            </button>
          ))}
          <button
            style={{ ...styles.pill, ...(dateRange === 'custom' ? styles.pillActive : {}) }}
            onClick={() => setCustomRangeOpen(o => !o)}
            title="Custom range"
          >
            Custom
          </button>
        </div>

        {customRangeOpen && (
          <div style={{ ...styles.pillGroup, gap: 4, paddingLeft: 6, paddingRight: 6 }}>
            <input
              type="date"
              value={typeof customRange?.start === 'string' ? customRange.start : ''}
              max={typeof customRange?.end === 'string' ? customRange.end : undefined}
              onChange={e => {
                const start = e.target.value
                const next = { start, end: (typeof customRange?.end === 'string' && customRange.end) || start }
                setCustomRange(next)
                if (start && next.end) setDateRange('custom')
              }}
              style={styles.dateInput}
            />
            <span style={styles.toolbarLabel}>–</span>
            <input
              type="date"
              value={typeof customRange?.end === 'string' ? customRange.end : ''}
              min={typeof customRange?.start === 'string' ? customRange.start : undefined}
              onChange={e => {
                const end = e.target.value
                const next = { start: (typeof customRange?.start === 'string' && customRange.start) || end, end }
                setCustomRange(next)
                if (next.start && end) setDateRange('custom')
              }}
              style={styles.dateInput}
            />
          </div>
        )}

        <div style={styles.divider} />

        <span style={styles.toolbarLabel}>Sort</span>
        <div style={styles.pillGroup}>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={{ ...styles.pill, ...(sortKey === opt.value ? styles.pillActive : {}) }}
              onClick={() => setSortKey(opt.value)}
              title={opt.label}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>

      </div>

      {/* ── Toolbar row 2: Platform filter + Column toggle ───────────────── */}
      <div style={{ ...styles.toolbarRow, borderTopWidth: 0 }}>

        <span style={styles.toolbarLabel}>Platform</span>
        <div style={{ ...styles.pillGroup, flexWrap: 'wrap' as const }}>
          {PLATFORM_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={{
                ...styles.pill,
                ...(selectedPlatform === opt.value ? styles.pillActive : {}),
              }}
              onClick={() => setSelectedPlatform(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={styles.divider} />

        {/* Column toggle — which metric shows in each row */}
        <div style={{ position: 'relative' as const }}>
          <button
            style={{
              ...styles.pill,
              ...(colPanelOpen ? styles.pillActive : {}),
              border: '1px solid #27272a',
              padding: '3px 8px',
            }}
            onClick={() => setColPanelOpen(v => !v)}
            title="Choose column"
          >
            {metricOption?.shortLabel ?? 'Col'} ▾
          </button>

          {colPanelOpen && (
            <>
              {/* Backdrop */}
              <div
                style={styles.backdrop}
                onClick={() => setColPanelOpen(false)}
              />
              {/* Dropdown */}
              <div style={styles.dropdown}>
                <div style={styles.dropdownHeader}>Show Column</div>
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    style={{
                      ...styles.dropdownItem,
                      ...(visibleMetric === opt.value ? styles.dropdownItemActive : {}),
                    }}
                    onClick={() => { setVisibleMetric(opt.value); setColPanelOpen(false) }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

      </div>

      {/* ── Sort context label ────────────────────────────────────────────── */}
      <div style={styles.sortContext}>
        <span style={styles.sortContextText}>
          Ranked by {sortOption?.label ?? sortKey}
          {selectedPlatform !== 'all' && ` · ${selectedPlatform.toUpperCase()}`}
        </span>
      </div>

      {/* ── Content list ─────────────────────────────────────────────────── */}
      <div style={styles.list}>
        {loading ? (
          Array.from({ length: TOP_N }).map((_, i) => (
            <div key={i} style={styles.skeletonRow}>
              <div style={{ ...styles.skeleton, width: 20 }} />
              <div style={{ ...styles.skeleton, width: 48, flexShrink: 0 }} />
              <div style={{ ...styles.skeleton, flex: 1 }} />
              <div style={{ ...styles.skeleton, width: 52 }} />
            </div>
          ))
        ) : error ? (
          <div style={styles.empty}>{error}</div>
        ) : topVideos.length === 0 ? (
          <div style={styles.empty}>No content matches filters</div>
        ) : (
          topVideos.map((row, idx) => {
            const rank  = idx + 1
            const thumb = resolveThumbnail(row.video)
            const title = renderContentIdentity(row.video)
            const plat  = row.video.platform
              ? (PLATFORM_CONFIG[row.video.platform]?.label ?? row.video.platform.toUpperCase())
              : null

            // Value to display in right-hand column
            const displayValue: string = (() => {
              if (visibleMetric === 'total_revenue') {
                const rev = selectDisplayRevenue(row, 'total') ?? 0
                return `$${rev.toLocaleString()}`
              }
              const raw = (row as any)[visibleMetric]
              const num = typeof raw === 'number' ? raw : 0
              return num.toLocaleString()
            })()

            return (
              <div key={row.video.id} style={styles.row}>

                {/* Rank */}
                <span style={{ ...styles.rank, color: rankColor(rank) }}>
                  #{rank}
                </span>

                {/* Thumbnail + platform badge */}
                <div style={styles.thumbWrap}>
                  <img src={thumb} style={styles.thumb} alt="" />
                  {plat && <span style={styles.platBadge}>{plat}</span>}
                </div>

                {/* Title */}
                <span style={styles.title} title={title}>
                  {title}
                </span>

                {/* Metric value */}
                <span style={{ ...styles.metricValue, color: metricColor }}>
                  {displayValue}
                </span>

              </div>
            )
          })
        )}
      </div>

    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display:       'flex',
    flexDirection: 'column',
    height:        '100%',
    background:    '#141414',
    overflow:      'hidden',
    fontFamily:    'inherit',
  },

  // ── Toolbar ────────────────────────────────────────────────────────────────
  toolbarRow: {
    display:      'flex',
    alignItems:   'center',
    flexWrap:     'wrap',
    gap:          6,
    padding:      '5px 10px',
    borderBottom: '1px solid #1e1e1e',
    flexShrink:   0,
  },
  toolbarLabel: {
    fontSize:      9,
    fontWeight:    800,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#52525b',
    flexShrink:    0,
  },
  divider: {
    width:      1,
    height:     14,
    background: '#27272a',
    flexShrink: 0,
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
    borderRadius:  6,
    padding:       '3px 6px',
    fontSize:      9,
    fontWeight:    800,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color:         '#52525b',
    cursor:        'pointer',
    transition:    'all 0.1s',
  },
  pillActive: {
    background: '#3f3f46',
    color:      '#ffffff',
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

  // ── Sort context label ─────────────────────────────────────────────────────
  sortContext: {
    padding:      '3px 10px',
    borderBottom: '1px solid #1a1a1a',
    flexShrink:   0,
  },
  sortContextText: {
    fontSize:      8,
    fontWeight:    800,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#3f3f46',
  },

  // ── List ───────────────────────────────────────────────────────────────────
  list: {
    flex:      1,
    overflowY: 'auto',
    padding:   '2px 0',
  },
  row: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    padding:      '5px 10px',
    borderBottom: '1px solid #1a1a1a',
    minHeight:    40,
  },
  rank: {
    fontSize:           10,
    fontWeight:         900,
    fontVariantNumeric: 'tabular-nums',
    flexShrink:         0,
    width:              22,
    textAlign:          'right',
  },
  thumbWrap: {
    position:  'relative',
    flexShrink: 0,
  },
  thumb: {
    width:        48,
    aspectRatio:  '16/9',
    objectFit:    'cover',
    borderRadius: 4,
    border:       '1px solid #27272a',
    display:      'block',
  },
  platBadge: {
    position:      'absolute',
    top:           -3,
    right:         -3,
    fontSize:      6,
    fontWeight:    900,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding:       '1px 3px',
    borderRadius:  3,
    background:    '#18181b',
    border:        '1px solid #3f3f46',
    color:         '#a1a1aa',
    lineHeight:    1,
  },
  title: {
    flex:         1,
    fontSize:     11,
    fontWeight:   600,
    color:        '#d4d4d8',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
    minWidth:     0,
  },
  metricValue: {
    fontSize:           11,
    fontWeight:         900,
    fontVariantNumeric: 'tabular-nums',
    flexShrink:         0,
  },

  // ── Empty / skeleton ───────────────────────────────────────────────────────
  empty: {
    padding:       '24px 12px',
    textAlign:     'center',
    fontSize:      10,
    fontWeight:    700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color:         '#3f3f46',
  },
  skeletonRow: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    padding:      '5px 10px',
    borderBottom: '1px solid #1a1a1a',
    height:       42,
  },
  skeleton: {
    height:        10,
    borderRadius:  4,
    background:    '#1e1e1e',
  },

  // ── Column toggle dropdown ─────────────────────────────────────────────────
  backdrop: {
    position: 'fixed',
    inset:    0,
    zIndex:   40,
  },
  dropdown: {
    position:     'absolute',
    top:          'calc(100% + 4px)',
    right:        0,
    zIndex:       50,
    minWidth:     140,
    background:   '#18181b',
    border:       '1px solid #27272a',
    borderRadius: 10,
    overflow:     'hidden',
    boxShadow:    '0 8px 24px rgba(0,0,0,0.6)',
  },
  dropdownHeader: {
    padding:       '7px 12px 5px',
    fontSize:      8,
    fontWeight:    800,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color:         '#52525b',
    borderBottom:  '1px solid #27272a',
  },
  dropdownItem: {
    display:       'block',
    width:         '100%',
    textAlign:     'left',
    background:    'transparent',
    border:        'none',
    padding:       '7px 12px',
    fontSize:      11,
    fontWeight:    600,
    color:         '#71717a',
    cursor:        'pointer',
    transition:    'all 0.1s',
  },
  dropdownItemActive: {
    background: '#27272a',
    color:      '#ffffff',
  },
}
