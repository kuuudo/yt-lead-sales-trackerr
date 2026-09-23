/**
 * src/pages/CampaignJourneyMap.tsx
 *
 * Route (suggested): /marketplace/campaigns/:campaignId/journey
 *
 * PHASE 1 ONLY — see the big block comment at the bottom of the file for
 * the full phase roadmap this was built against.
 *
 * Purpose (Phase 1): a polished, static "big picture" visual of a Campaign's
 * conversion structure — a central Campaign hub with the major content
 * paths (Sales, Direct Purchase, Newsletter, Consultation) radiating out of
 * it, each ending in its real-world outcome page(s).
 *
 * Explicitly NOT part of Phase 1:
 *   - any query to promotion_assets, events_journey, journeyDiscovery.ts,
 *     journeyGraph.ts, or journeyDownstreamResolver.ts
 *   - node click -> navigation to a real asset/video
 *   - persisted node positions (this view is not draggable on purpose —
 *     the hub layout is the point; see PHASE ROADMAP notes below)
 *   - any indication on a node that it is "live" or "tracked" — Phase 1 is
 *     visual-only and says so in the header badge, deliberately, so nobody
 *     mistakes the mockup for a working tracking view
 *
 * Reused from PromotionJourneyMap.tsx (pure interaction/math + presentational
 * pieces, not Workspace product state — same rationale as that file's own
 * header comment):
 *   1. The canvas-space coordinate model (translate+scale transform,
 *      screen<->canvas conversion, wheel-to-zoom-at-cursor math).
 *   2. <CanvasGrid /> — stateless dot-grid background.
 *   3. The "gold card / subtle bezier connector with arrowhead" visual
 *      language (border colors changed to per-path accents instead of the
 *      single gold used for promoted assets there).
 *
 * This page does NOT use useWorkspaceStore and does NOT write to the
 * `widgets` table — same as PromotionJourneyMap.tsx.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  TrendingUp,
  ShoppingCart,
  Mail,
  CalendarCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import CanvasGrid from '../components/analytics/canvas/CanvasGrid'
import type { CanvasTransform } from '../components/analytics/store/useWorkspaceStore'

// ─── Static Phase-1 data model ─────────────────────────────────────────────
// Deliberately NOT fetched from anywhere. Phase 2 replaces exactly this
// array (or the parts of it a real path can reach) with real resolved
// content — see the roadmap comment at the bottom of the file.

interface CampaignPathNode {
  id: string
  label: string
}

interface CampaignPath {
  id: string
  label: string
  color: string
  icon: LucideIcon
  /** Compass angle in degrees, 0 = right/east, 90 = down/south (screen space). */
  angle: number
  root: CampaignPathNode
  outcomes: CampaignPathNode[]
}

const CAMPAIGN_PATHS: CampaignPath[] = [
  {
    id: 'sales',
    label: 'Sales',
    color: '#6366f1',
    icon: TrendingUp,
    angle: -90,
    root: { id: 'sales_page', label: 'Sales Page' },
    outcomes: [
      { id: 'sales_thank_you', label: 'Sales Thank You' },
      { id: 'sales_booking', label: 'Sales Booking' },
    ],
  },
  {
    id: 'consultation',
    label: 'Consultation',
    color: '#10b981',
    icon: CalendarCheck,
    angle: 0,
    root: { id: 'consultation', label: 'Consultation' },
    outcomes: [{ id: 'consultation_booking', label: 'Consultation Booking' }],
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    color: '#0ea5e9',
    icon: Mail,
    angle: 90,
    root: { id: 'newsletter', label: 'Newsletter' },
    outcomes: [{ id: 'newsletter_thank_you', label: 'Newsletter Thank You' }],
  },
  {
    id: 'direct_purchase',
    label: 'Direct Purchase',
    color: '#ea580c',
    icon: ShoppingCart,
    angle: 180,
    root: { id: 'direct_purchase', label: 'Direct Purchase' },
    outcomes: [{ id: 'direct_purchase_thank_you', label: 'Direct Purchase Thank You' }],
  },
]

// ─── Layout constants ───────────────────────────────────────────────────────

const HUB_X = 1080
const HUB_Y = 620
const HUB_R = 92

const ROOT_DIST = 250
const OUTCOME_DIST = 460
const FORK_OFFSET = 100

const ROOT_W = 178
const ROOT_H = 68
const OUTCOME_W = 178
const OUTCOME_H = 58

const MIN_SCALE = 0.4
const MAX_SCALE = 2.2
const ZOOM_STEP = 0.15

// ─── Geometry helpers ───────────────────────────────────────────────────────

type Pt = { x: number; y: number }

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

function polar(angleDeg: number, dist: number, offset: Pt = { x: 0, y: 0 }): Pt {
  const rad = toRad(angleDeg)
  return { x: HUB_X + Math.cos(rad) * dist + offset.x, y: HUB_Y + Math.sin(rad) * dist + offset.y }
}

function perpUnit(angleDeg: number): Pt {
  const rad = toRad(angleDeg)
  return { x: -Math.sin(rad), y: Math.cos(rad) }
}

/** Point on the hub circle's boundary, facing `target`. */
function hubAnchor(target: Pt): Pt {
  const dx = target.x - HUB_X
  const dy = target.y - HUB_Y
  const len = Math.hypot(dx, dy) || 1
  return { x: HUB_X + (dx / len) * HUB_R, y: HUB_Y + (dy / len) * HUB_R }
}

/** Point on a rectangle's boundary, exiting toward `target`. */
function rectAnchor(center: Pt, w: number, h: number, target: Pt): Pt {
  const dx = target.x - center.x
  const dy = target.y - center.y
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: center.x + Math.sign(dx || 1) * (w / 2), y: center.y }
  }
  return { x: center.x, y: center.y + Math.sign(dy || 1) * (h / 2) }
}

/** Smooth cubic bezier between two points, curving along whichever axis dominates. */
function curvePath(a: Pt, b: Pt): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = (a.x + b.x) / 2
    return `M ${a.x} ${a.y} C ${midX} ${a.y} ${midX} ${b.y} ${b.x} ${b.y}`
  }
  const midY = (a.y + b.y) / 2
  return `M ${a.x} ${a.y} C ${a.x} ${midY} ${b.x} ${midY} ${b.x} ${b.y}`
}

// Precompute every node's canvas position once — static data, no need to
// redo this per render inside the component body's hot paths.
interface PositionedNode {
  id: string
  label: string
  center: Pt
  w: number
  h: number
  kind: 'root' | 'outcome'
  pathId: string
  color: string
}

function buildLayout(paths: CampaignPath[]) {
  const nodes: PositionedNode[] = []
  const connectors: { from: Pt; to: Pt; color: string; pathId: string }[] = []

  for (const path of paths) {
    const rootCenter = polar(path.angle, ROOT_DIST)
    nodes.push({
      id: path.root.id,
      label: path.root.label,
      center: rootCenter,
      w: ROOT_W,
      h: ROOT_H,
      kind: 'root',
      pathId: path.id,
      color: path.color,
    })
    connectors.push({
      from: hubAnchor(rootCenter),
      to: rectAnchor(rootCenter, ROOT_W, ROOT_H, { x: HUB_X, y: HUB_Y }),
      color: path.color,
      pathId: path.id,
    })

    const perp = perpUnit(path.angle)
    const n = path.outcomes.length
    path.outcomes.forEach((outcome, i) => {
      // Single outcome: straight out along the path angle. Two or more:
      // fan them out perpendicular to the path so forks read as forks.
      const spread = n === 1 ? 0 : (i - (n - 1) / 2) * FORK_OFFSET
      const base = polar(path.angle, OUTCOME_DIST)
      const outcomeCenter: Pt = { x: base.x + perp.x * spread, y: base.y + perp.y * spread }
      nodes.push({
        id: outcome.id,
        label: outcome.label,
        center: outcomeCenter,
        w: OUTCOME_W,
        h: OUTCOME_H,
        kind: 'outcome',
        pathId: path.id,
        color: path.color,
      })
      connectors.push({
        from: rectAnchor(rootCenter, ROOT_W, ROOT_H, outcomeCenter),
        to: rectAnchor(outcomeCenter, OUTCOME_W, OUTCOME_H, rootCenter),
        color: path.color,
        pathId: path.id,
      })
    })
  }

  return { nodes, connectors }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CampaignJourneyMap() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const containerRef = useRef<HTMLDivElement>(null)

  const { nodes, connectors } = useMemo(() => buildLayout(CAMPAIGN_PATHS), [])

  const [transform, setTransform] = useState<CanvasTransform>({ x: -420, y: -260, scale: 0.82 })
  const [hoveredPathId, setHoveredPathId] = useState<string | null>(null)

  const pan = useCallback((dx: number, dy: number) => {
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])

  const zoom = useCallback((delta: number, originX: number, originY: number) => {
    setTransform((t) => {
      const factor = delta > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor))
      const canvasX = (originX - t.x) / t.scale
      const canvasY = (originY - t.y) / t.scale
      return { scale: newScale, x: originX - canvasX * newScale, y: originY - canvasY * newScale }
    })
  }, [])

  const resetView = useCallback(() => setTransform({ x: -420, y: -260, scale: 0.82 }), [])

  const panState = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  })

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    panState.current = { active: true, lastX: e.clientX, lastY: e.clientY }
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panState.current.active) return
      const dx = e.clientX - panState.current.lastX
      const dy = e.clientY - panState.current.lastY
      panState.current.lastX = e.clientX
      panState.current.lastY = e.clientY
      pan(dx, dy)
    },
    [pan]
  )

  const handlePointerUp = useCallback(() => {
    panState.current.active = false
  }, [])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      zoom(e.deltaY > 0 ? -1 : 1, e.clientX - rect.left, e.clientY - rect.top)
    },
    [zoom]
  )

  const zoomIn = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    zoom(1, (rect?.width ?? 800) / 2, (rect?.height ?? 500) / 2)
  }
  const zoomOut = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    zoom(-1, (rect?.width ?? 800) / 2, (rect?.height ?? 500) / 2)
  }

  const scalePercent = Math.round(transform.scale * 100)

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <Link to="/dashboard" style={styles.backLink}>
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
        <div style={styles.titleBlock}>
          <span style={styles.title}>Campaign Journey Map</span>
          <span style={styles.subtitle}>{campaignId ?? 'Untitled Campaign'}</span>
        </div>
        <span style={styles.phaseBadge}>
          <Sparkles size={12} /> Phase 1 · Visual preview — not yet connected to live tracking data
        </span>
      </div>

      <div
        ref={containerRef}
        style={styles.canvasContainer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <CanvasGrid transform={transform} />

        <div
          style={{
            ...styles.canvasLayer,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <svg style={styles.edgesLayer}>
            <defs>
              {CAMPAIGN_PATHS.map((p) => (
                <marker
                  key={p.id}
                  id={`arrow-${p.id}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill={p.color} />
                </marker>
              ))}
              <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#eef2ff" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#eef2ff" stopOpacity={0} />
              </radialGradient>
            </defs>

            {/* Soft glow + orbit rings behind the hub, purely decorative. */}
            <circle cx={HUB_X} cy={HUB_Y} r={HUB_R + 210} fill="url(#hubGlow)" />
            <circle cx={HUB_X} cy={HUB_Y} r={ROOT_DIST} fill="none" stroke="#eef0f3" strokeWidth={1} strokeDasharray="2 6" />
            <circle cx={HUB_X} cy={HUB_Y} r={OUTCOME_DIST} fill="none" stroke="#f3f4f6" strokeWidth={1} strokeDasharray="2 6" />

            {connectors.map((c, i) => {
              const dimmed = hoveredPathId !== null && hoveredPathId !== c.pathId
              return (
                <path
                  key={i}
                  d={curvePath(c.from, c.to)}
                  fill="none"
                  stroke={c.color}
                  strokeWidth={dimmed ? 1.4 : 2}
                  strokeOpacity={dimmed ? 0.18 : 0.55}
                  markerEnd={`url(#arrow-${c.pathId})`}
                  style={{ transition: 'stroke-opacity 150ms ease, stroke-width 150ms ease' }}
                />
              )
            })}
          </svg>

          {/* Hub node */}
          <div
            style={{
              ...styles.hub,
              left: HUB_X - HUB_R,
              top: HUB_Y - HUB_R,
              width: HUB_R * 2,
              height: HUB_R * 2,
            }}
          >
            <span style={styles.hubEyebrow}>Campaign</span>
            <span style={styles.hubTitle}>{campaignId ? campaignId.slice(0, 18) : 'Campaign Name'}</span>
          </div>

          {/* Path root + outcome nodes */}
          {nodes.map((node) => {
            const dimmed = hoveredPathId !== null && hoveredPathId !== node.pathId
            const isRoot = node.kind === 'root'
            return (
              <div
                key={node.id}
                onMouseEnter={() => setHoveredPathId(node.pathId)}
                onMouseLeave={() => setHoveredPathId(null)}
                style={{
                  ...(isRoot ? styles.rootNode : styles.outcomeNode),
                  left: node.center.x - node.w / 2,
                  top: node.center.y - node.h / 2,
                  width: node.w,
                  height: node.h,
                  borderColor: isRoot ? node.color : `${node.color}66`,
                  boxShadow: isRoot
                    ? `0 0 0 2px ${node.color}1f, 0 4px 10px rgba(15,23,42,0.06)`
                    : '0 2px 6px rgba(15,23,42,0.04)',
                  opacity: dimmed ? 0.35 : 1,
                }}
              >
                <span style={{ ...styles.nodeDot, background: node.color }} />
                <div style={styles.nodeTextCol}>
                  <span style={isRoot ? styles.nodeLabelRoot : styles.nodeLabelOutcome}>{node.label}</span>
                  <span style={{ ...styles.nodeKind, color: node.color }}>
                    {isRoot ? 'Entry content' : 'Outcome'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div style={styles.legend}>
          {CAMPAIGN_PATHS.map((p) => {
            const Icon = p.icon
            const active = hoveredPathId === p.id
            return (
              <button
                key={p.id}
                style={{
                  ...styles.legendChip,
                  borderColor: active ? p.color : '#e5e7eb',
                  background: active ? `${p.color}0f` : '#ffffff',
                }}
                onMouseEnter={() => setHoveredPathId(p.id)}
                onMouseLeave={() => setHoveredPathId(null)}
              >
                <Icon size={13} color={p.color} />
                <span style={{ color: active ? p.color : '#374151' }}>{p.label}</span>
              </button>
            )
          })}
        </div>

        <div style={styles.zoomControls}>
          <button style={styles.zoomBtn} onClick={zoomIn} title="Zoom in">
            +
          </button>
          <span style={styles.zoomLabel}>{scalePercent}%</span>
          <button style={styles.zoomBtn} onClick={zoomOut} title="Zoom out">
            −
          </button>
          <button
            style={{ ...styles.zoomBtn, borderLeft: '1px solid #e5e7eb', marginLeft: 2, paddingLeft: 6 }}
            onClick={resetView}
            title="Reset view"
          >
            ⌂
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    top: 56,
    display: 'flex',
    flexDirection: 'column',
    background: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '14px 20px',
    borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
    background: '#ffffff',
  },
  backLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6b7280',
    textDecoration: 'none',
    flexShrink: 0,
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
  },
  subtitle: {
    fontSize: 11,
    color: '#9ca3af',
  },
  phaseBadge: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    color: '#92400e',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 999,
    padding: '5px 10px',
    whiteSpace: 'nowrap',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    cursor: 'grab',
    userSelect: 'none',
    background: '#ffffff',
    touchAction: 'none',
  },
  canvasLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
  edgesLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 2200,
    height: 1400,
    overflow: 'visible',
    pointerEvents: 'none',
  },
  hub: {
    position: 'absolute',
    borderRadius: '50%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 12,
    textAlign: 'center',
    background: 'linear-gradient(160deg, #111827 0%, #312e81 100%)',
    boxShadow: '0 0 0 6px rgba(99,102,241,0.08), 0 12px 28px rgba(49,46,129,0.25)',
    color: '#ffffff',
    cursor: 'default',
  },
  hubEyebrow: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#a5b4fc',
  },
  hubTitle: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.2,
    overflowWrap: 'break-word',
  },
  rootNode: {
    position: 'absolute',
    background: '#ffffff',
    border: '1.5px solid',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 14px',
    cursor: 'default',
  },
  outcomeNode: {
    position: 'absolute',
    background: '#fafafa',
    border: '1.5px dashed',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '0 12px',
    cursor: 'default',
  },
  nodeDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  nodeTextCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  nodeLabelRoot: {
    fontSize: 12.5,
    fontWeight: 700,
    color: '#111827',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nodeLabelOutcome: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nodeKind: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  legend: {
    position: 'absolute',
    top: 16,
    left: 16,
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    maxWidth: 320,
  },
  legendChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11.5,
    fontWeight: 600,
    border: '1px solid #e5e7eb',
    borderRadius: 999,
    padding: '6px 11px',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    transition: 'background 150ms ease, border-color 150ms ease',
  },
  zoomControls: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '4px 6px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  zoomBtn: {
    background: 'transparent',
    border: 'none',
    color: '#374151',
    fontSize: 16,
    cursor: 'pointer',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    lineHeight: 1,
  },
  zoomLabel: {
    fontSize: 11,
    color: '#6b7280',
    minWidth: 36,
    textAlign: 'center',
  },
}

/**
 * PHASE ROADMAP (for future edits to this file — do not delete)
 *
 * PHASE 1 (this file, current state)
 *   Static CAMPAIGN_PATHS array above. No queries. No node click-through.
 *
 * PHASE 2 — connect ONE real user journey
 *   Target: Newsletter -> Newsletter Thank You (this is the one the user
 *   already has real tracked data for). Concretely:
 *     - Resolve the campaign's real "Newsletter" promoted asset the same
 *       way getPromotionDetail() does it in PromotionJourneyMap.tsx.
 *     - Reuse discoverPromotionJourneys() / buildJourneyGraph() scoped to
 *       that one asset only — do NOT run it for all four paths yet.
 *     - Render the real discovered steps as a small inline sub-chain
 *       hanging off the "Newsletter" root node (visually distinct from the
 *       static outcome pill it replaces), so it's obvious on the canvas
 *       which single path is now "live."
 *   Before wiring this, see the "Newsletter Thank You" bug note below —
 *   fix that first, or Phase 2 will visibly reproduce the same gap.
 *
 * PHASE 3 — add the remaining paths one at a time, same pattern as Phase 2.
 *
 * PHASE 4 — CAMPAIGN_PATHS itself becomes derived from real campaign
 *   content (campaign_elements / promotions under the campaign) instead of
 *   a hardcoded array, and the hub becomes a real Campaign record.
 *
 * ── "Newsletter Thank You" missing from PromotionJourneyMap — investigation
 *    note, not yet fixed here (needs journeyDiscovery.ts / journeyGraph.ts /
 *    journeyDownstreamResolver.ts, which were not available when this file
 *    was written) ──
 *
 *   From one real events_journey row for this exact path:
 *     journey_snapshot has 5 step entries, but event_ids has 6 ids — so one
 *     tracked event isn't represented as its own snapshot step at all.
 *     The LAST snapshot entry is:
 *       { asset_id: null, video_id: "3b9dbc2c-...", redirect_link_id: "2712755a-...", destination_video_id: null }
 *     asset_id and destination_video_id are both null on that final step —
 *     every earlier step has a non-null destination_video_id. That's the
 *     landing on "Newsletter Thank You" itself: a campaign_element/landing
 *     page, not a video, so it never gets a video_id of its own and nothing
 *     resolves "destination_video_id" for it.
 *   Likely cause: buildJourneyGraph() (or resolveDownstreamNodes(), which
 *     is what's supposed to turn a terminal video's redirect_link_id into a
 *     resolved campaign-element node — see journeyDownstreamResolver.ts)
 *     only resolves a downstream node when it can map through an asset_id.
 *     Because this final step's asset_id is null, the resolver most likely
 *     drops it rather than falling back to resolving the campaign_element
 *     directly off redirect_link_id "2712755a-...".
 *   To confirm and fix this for real (not guessed), I'd need:
 *     - journeyDiscovery.ts
 *     - journeyGraph.ts
 *     - journeyDownstreamResolver.ts
 *   Send those and I can patch the actual resolver instead of guessing.
 */
