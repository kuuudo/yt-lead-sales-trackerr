/**
 * src/components/analytics/widgets/DashboardWidget.tsx
 *
 * Compact "Top Content" leaderboard widget for the Workspace canvas.
 *
 * ARCHITECTURE — mirrors Dashboard.tsx exactly:
 *   1. Fetch raw data from Supabase (videos, campaigns, events, purchases)
 *   2. Enrich via buildStripeFromPurchaseTypeTable / buildPixelPurchases
 *   3. Pass through getAnalyticsEngine() → sortedVideos
 *   4. Render the top N rows in a compact widget layout
 *
 * NO stores. NO dataPool. NO widgetAnalytics.ts. No transport layers.
 * This widget is fully self-contained — fetch logic is intentionally
 * duplicated from Dashboard.tsx; refactor later once the widget is stable.
 *
 * Config shape (widget.config):
 *   dateRange:          DateRange  — default 'all'
 *   selectedCampaignId: string     — default 'all'
 */

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth }         from '../../../lib/auth'
import { useOrganization } from '../../../lib/useOrganization'
import { supabase }        from '../../../lib/supabase'

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
  type CampaignMeta,
  type DateRange,
} from '../../../lib/analyticsEngine'

import { resolveThumbnail, renderContentIdentity } from '../../../lib/videoFormatters'
import { PLATFORM_CONFIG }                         from '../../../lib/platformParser'
import type { Widget }                             from '../store/useWorkspaceStore'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  widget:    Widget
  onUpdate?: (patch: Partial<Widget>) => void
  analyticsResult?: unknown  // unused — engine fetches directly
}

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

// ─── Date range options (compact labels for widget) ───────────────────────────

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'all',   label: 'All'   },
  { value: '7days',    label: '7d'    },
  { value: '30days',   label: '30d'   },
  { value: '2months', label: 'Mo'    },
]

// ─── Component ────────────────────────────────────────────────────────────────

const TOP_N = 5

export default function DashboardWidget({ widget, onUpdate }: Props) {
  const { user }           = useAuth()
  const { organizationId } = useOrganization()

  // ── Config (persisted in widget.config) ────────────────────────────────────
  const dateRange:          DateRange = (widget.config?.dateRange as DateRange) ?? 'all'
  const selectedCampaignId: string    = (widget.config?.selectedCampaignId as string) ?? 'all'

  const setDateRange = (v: DateRange) =>
    onUpdate?.({ config: { ...widget.config, dateRange: v } })

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
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load data')
        console.error('[DashboardWidget] Fetch error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [user, organizationId])

  // ── Engine ──────────────────────────────────────────────────────────────────

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
    activeSource:        'total',
    includeEV:           true,
    sortConfig:          { key: 'total_revenue', direction: 'desc' },
  }), [videos, campaigns, rawEvents, stripePurchases, pixelPurchases, dateRange, selectedCampaignId])

  const { sortedVideos } = useMemo(() => getAnalyticsEngine(engineInput), [engineInput])

  const topVideos = sortedVideos.slice(0, TOP_N)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={styles.toolbar}>
        <span style={styles.toolbarLabel}>Period</span>
        <div style={styles.pillGroup}>
          {DATE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={{
                ...styles.pill,
                ...(dateRange === opt.value ? styles.pillActive : {}),
              }}
              onClick={() => setDateRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={styles.list}>
        {loading ? (
          Array.from({ length: TOP_N }).map((_, i) => (
            <div key={i} style={styles.skeletonRow}>
              <div style={{ ...styles.skeleton, width: 20 }} />
              <div style={{ ...styles.skeleton, flex: 1 }} />
              <div style={{ ...styles.skeleton, width: 52 }} />
            </div>
          ))
        ) : error ? (
          <div style={styles.empty}>{error}</div>
        ) : topVideos.length === 0 ? (
          <div style={styles.empty}>No content yet</div>
        ) : (
          topVideos.map((row, idx) => {
            const rank    = idx + 1
            const revenue = selectDisplayRevenue(row, 'total') ?? 0
            const thumb   = resolveThumbnail(row.video)
            const title   = renderContentIdentity(row.video)
            const plat    = row.video.platform
              ? (PLATFORM_CONFIG[row.video.platform]?.label ?? row.video.platform.toUpperCase())
              : null

            return (
              <div key={row.video.id} style={styles.row}>

                {/* Rank */}
                <span style={{ ...styles.rank, color: rankColor(rank) }}>
                  #{rank}
                </span>

                {/* Thumbnail */}
                <div style={styles.thumbWrap}>
                  <img src={thumb} style={styles.thumb} alt="" />
                  {plat && <span style={styles.platBadge}>{plat}</span>}
                </div>

                {/* Title */}
                <span style={styles.title} title={String(title)}>
                  {title}
                </span>

                {/* Revenue */}
                <span style={styles.revenue}>
                  ${revenue.toLocaleString()}
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
    display:        'flex',
    flexDirection:  'column',
    height:         '100%',
    background:     '#141414',
    overflow:       'hidden',
    fontFamily:     'inherit',
  },
  toolbar: {
    display:        'flex',
    alignItems:     'center',
    gap:            8,
    padding:        '6px 10px',
    borderBottom:   '1px solid #1e1e1e',
    flexShrink:     0,
  },
  toolbarLabel: {
    fontSize:       9,
    fontWeight:     800,
    textTransform:  'uppercase',
    letterSpacing:  '0.1em',
    color:          '#52525b',
  },
  pillGroup: {
    display:        'flex',
    gap:            2,
    padding:        2,
    background:     '#0f0f0f',
    borderRadius:   8,
    border:         '1px solid #1e1e1e',
  },
  pill: {
    background:     'transparent',
    border:         'none',
    borderRadius:   6,
    padding:        '3px 7px',
    fontSize:       9,
    fontWeight:     800,
    textTransform:  'uppercase' as const,
    letterSpacing:  '0.08em',
    color:          '#52525b',
    cursor:         'pointer',
    transition:     'all 0.1s',
  },
  pillActive: {
    background:     '#3f3f46',
    color:          '#ffffff',
  },
  list: {
    flex:           1,
    overflowY:      'auto',
    padding:        '4px 0',
  },
  row: {
    display:        'flex',
    alignItems:     'center',
    gap:            8,
    padding:        '5px 10px',
    borderBottom:   '1px solid #1a1a1a',
    minHeight:      40,
  },
  rank: {
    fontSize:       10,
    fontWeight:     900,
    fontVariantNumeric: 'tabular-nums',
    flexShrink:     0,
    width:          22,
    textAlign:      'right',
  },
  thumbWrap: {
    position:       'relative',
    flexShrink:     0,
  },
  thumb: {
    width:          48,
    aspectRatio:    '16/9',
    objectFit:      'cover',
    borderRadius:   4,
    border:         '1px solid #27272a',
    display:        'block',
  },
  platBadge: {
    position:       'absolute',
    top:            -3,
    right:          -3,
    fontSize:       6,
    fontWeight:     900,
    textTransform:  'uppercase',
    letterSpacing:  '0.05em',
    padding:        '1px 3px',
    borderRadius:   3,
    background:     '#18181b',
    border:         '1px solid #3f3f46',
    color:          '#a1a1aa',
    lineHeight:     1,
  },
  title: {
    flex:           1,
    fontSize:       11,
    fontWeight:     600,
    color:          '#d4d4d8',
    overflow:       'hidden',
    textOverflow:   'ellipsis',
    whiteSpace:     'nowrap',
    minWidth:       0,
  },
  revenue: {
    fontSize:       11,
    fontWeight:     900,
    color:          '#34d399',
    fontVariantNumeric: 'tabular-nums',
    flexShrink:     0,
  },
  empty: {
    padding:        '24px 12px',
    textAlign:      'center',
    fontSize:       10,
    fontWeight:     700,
    textTransform:  'uppercase',
    letterSpacing:  '0.1em',
    color:          '#3f3f46',
  },
  skeletonRow: {
    display:        'flex',
    alignItems:     'center',
    gap:            8,
    padding:        '5px 10px',
    borderBottom:   '1px solid #1a1a1a',
    height:         42,
  },
  skeleton: {
    height:         10,
    borderRadius:   4,
    background:     '#1e1e1e',
    animation:      'pulse 1.5s ease-in-out infinite',
  },
}
