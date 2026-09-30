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
 *   - persisted node positions — cards (and the hub) ARE draggable now, but
 *     a dragged layout only lives in this component's state; reloading the
 *     page snaps back to the default hub layout. Persisting positions is a
 *     later phase (needs a place to store per-campaign layout overrides).
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  TrendingUp,
  ShoppingCart,
  Mail,
  CalendarCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import CanvasGrid from '../components/analytics/canvas/CanvasGrid'
import type { CanvasTransform } from '../components/analytics/store/useWorkspaceStore'
import { Campaign, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useViewing } from '../lib/ViewingContext'
import {
  useCampaignStructureData,
  useCampaignContentBuckets,
  buildMonthClusterNodes,
  buildContentMonthNodes,
  layoutTree,
  applyStructureCollapse,
  type TreeNode,
} from './CampaignStructureMap'
import { discoverJourneysForVideos, resolveVideoIdsForAssets } from '../lib/journeyDiscovery'
import { buildJourneyGraph, type JourneyGraph } from '../lib/journeyGraph'
// ─── Real-data hook (header name + switcher only) ───────────────────────
// Identical to the copy in CampaignStructureMap.tsx / AllAssetsAnalytics.tsx
// — same query, same viewer-id resolution. Not imported because it isn't
// exported from either of those files.
function useCampaignOptions(viewerId: string | null): Campaign[] {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  useEffect(() => {
    if (!viewerId) return
    let cancelled = false
    supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', viewerId)
      .then(({ data }) => {
        if (!cancelled) setCampaigns(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [viewerId])
  return campaigns
}

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
  /** Which of the 4 evenly-spaced columns below the hub this branch sits in (0 = leftmost). */
  column: number
  root: CampaignPathNode
  outcomes: CampaignPathNode[]
}

const CAMPAIGN_PATHS: CampaignPath[] = [
  {
    id: 'sales',
    label: 'Sales',
    color: '#6366f1',
    icon: TrendingUp,
    column: 0,
    root: { id: 'sales_call_booked', label: 'Sales Call Booked' },
    outcomes: [{ id: 'sales_call', label: 'Sales Call' }],
  },
  {
    id: 'direct_purchase',
    label: 'Direct Purchase',
    color: '#ea580c',
    icon: ShoppingCart,
    column: 1,
    root: { id: 'direct_purchase_thank_you', label: 'Direct Purchase Thank You' },
    outcomes: [{ id: 'direct_purchase', label: 'Direct Purchase' }],
  },
  {
    id: 'consultation',
    label: 'Consultation',
    color: '#10b981',
    icon: CalendarCheck,
    column: 2,
    root: { id: 'consultation_booking', label: 'Consultation Booking' },
    outcomes: [{ id: 'consultation', label: 'Consultation' }],
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    color: '#0ea5e9',
    icon: Mail,
    column: 3,
    root: { id: 'newsletter_thank_you', label: 'Newsletter Thank You' },
    outcomes: [{ id: 'newsletter', label: 'Newsletter' }],
  },
]

// ─── Layout constants ───────────────────────────────────────────────────────

const HUB_X = 1080
const HUB_Y = 620
const HUB_R = 92

const ROOT_DIST = 250 // now used as vertical distance from hub down to the root row
const OUTCOME_DIST = 460 // now used as vertical distance from hub down to the outcome row

// Tree-native dark presentation tokens (visual only — same values as
// CampaignStructureMap's TREE_DARK, kept in sync for a consistent look).
const TREE_DARK = {
  page: '#0a0a0a',
  canvas: '#0a0a0a',
  cardBg: '#141414',
  cardBgAlt: '#111111',
  border: '#262626',
  textPrimary: '#f5f5f5',
  textSecondary: '#a3a3a3',
  textFaint: '#737373',
}
const FORK_OFFSET = 100 // unused now that every branch has one outcome; kept in case a branch gains a second one again
const COLUMN_SPACING = 260 // horizontal gap between adjacent branch columns

const ROOT_W = 178
const ROOT_H = 68
const OUTCOME_W = 178
const OUTCOME_H = 58

const MIN_SCALE = 0.4
const MAX_SCALE = 2.2
const ZOOM_STEP = 0.15

// ─── Geometry helpers ───────────────────────────────────────────────────────

type Pt = { x: number; y: number }



/** Point on a circle's boundary (e.g. the hub), facing `target`. */
function circleAnchor(center: Pt, r: number, target: Pt): Pt {
  const dx = target.x - center.x
  const dy = target.y - center.y
  const len = Math.hypot(dx, dy) || 1
  return { x: center.x + (dx / len) * r, y: center.y + (dy / len) * r }
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
  const connections: { fromId: string; toId: string; color: string; pathId: string }[] = []
  const centerColumn = (paths.length - 1) / 2 // e.g. 1.5 for 4 columns, so the hub sits centered between columns 1 and 2

  for (const path of paths) {
    const colX = HUB_X + (path.column - centerColumn) * COLUMN_SPACING
    const rootCenter: Pt = { x: colX, y: HUB_Y + ROOT_DIST }
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
    connections.push({ fromId: 'hub', toId: path.root.id, color: path.color, pathId: path.id })

    // Every branch has exactly one outcome today, so it sits straight below
    // its root in the same column — no perpendicular fanning needed.
    const outcome = path.outcomes[0]
    const outcomeCenter: Pt = { x: colX, y: HUB_Y + OUTCOME_DIST }
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
    connections.push({ fromId: path.root.id, toId: outcome.id, color: path.color, pathId: path.id })
  }

  return { nodes, connections }
}

// ─── Component ──────────────────────────────────────────────────────────────

// ─── Phase 1: Structure control panel (selector only — no journey logic) ────
// The panel lists Content / Own Assets / Marketers using CampaignStructureMap's
// own hooks + month bucketer. Clicking a node only sets `selectedNodeId`; the
// canvas below the outcome row then shows that node's direct children as
// plain cards. Nothing here touches positions, CAMPAIGN_PATHS or journeys.

const PANEL_BRANCHES = [
  { id: 'content', label: 'Content', color: '#0ea5e9' },
  { id: 'own_assets', label: 'Own Assets', color: '#10b981' },
  { id: 'marketers', label: 'Marketers', color: '#8b5cf6' },
] as const

type PanelBranchId = (typeof PANEL_BRANCHES)[number]['id']
type PanelTree = Record<PanelBranchId, TreeNode[] | null> // null = still loading

interface PanelItem {
  id: string
  label: string
  kind: TreeNode['kind']
  color: string
  thumbnailUrl?: string | null
}

const PANEL_ITEM_CAP = 60
const ITEMS_TOP = 1190 // canvas y of the first card row (outcome row ends ~1109)
const ITEMS_COLS = 4
const ITEMS_COL_SPACING = 260
const ITEMS_ROW_SPACING = 84
const ITEM_KIND_LABEL: Partial<Record<TreeNode['kind'], string>> = {
  video: 'Video',
  asset: 'Asset',
  marketer: 'Marketer',
  promotion: 'Promotion',
  month: 'Month',
}

function findTreeNode(nodes: TreeNode[] | null, id: string): TreeNode | null {
  if (!nodes) return null
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = findTreeNode(n.children ?? null, id)
    if (hit) return hit
  }
  return null
}

/** Selection rule: month -> its items, marketer -> its promotions,
 *  promotion -> its assets, video/asset -> just itself. */
function itemsForNode(node: TreeNode): PanelItem[] {
  const source =
    node.kind === 'month' || node.kind === 'marketer' || node.kind === 'promotion'
      ? node.children ?? []
      : [node]
  return source
    .filter((n) => !n.isShowMore)
    .map((n) => ({ id: n.id, label: n.label, kind: n.kind, color: n.color, thumbnailUrl: n.thumbnailUrl ?? null }))
}

// ─── Slice A: sticky journey context (engine only — no UI reads this yet) ───
interface JourneyContext {
  status: 'idle' | 'loading' | 'ready' | 'error'
  graph: JourneyGraph | null
  journeyCount: number
  excludedJourneys: number
  truncated: boolean
  /** requested entry video id -> number of kept journeys containing it */
  coverage: Record<string, number>
  error: string | null
}

const EMPTY_JOURNEY_CONTEXT: JourneyContext = {
  status: 'idle',
  graph: null,
  journeyCount: 0,
  excludedJourneys: 0,
  truncated: false,
  coverage: {},
  error: null,
}

type LaidOut = ReturnType<typeof layoutTree>
type LaidOutNode = LaidOut['nodes'][number]

/** Builds the Content / Own Assets / Marketers month trees with the SAME
 *  Structure helpers CampaignStructureMap uses. Full date range, no search. */
function buildPanelTree(
  contentVideos: Parameters<typeof buildContentMonthNodes>[0] | null,
  ownAssetNodes: TreeNode[] | null,
  marketerNodes: TreeNode[] | null,
  expanded: Record<string, boolean>,
): PanelTree {
  return {
    content: contentVideos
      ? buildContentMonthNodes(contentVideos, '', 'all', expanded, PANEL_BRANCHES[0].color)
      : null,
    own_assets: ownAssetNodes
      ? buildMonthClusterNodes(
          ownAssetNodes,
          () => true,
          '',
          'all',
          expanded,
          'own_assets_month',
          PANEL_BRANCHES[1].color,
          (n) => `${n} asset${n === 1 ? '' : 's'}`,
        )
      : null,
    marketers: marketerNodes
      ? buildMonthClusterNodes(
          marketerNodes,
          () => true,
          '',
          'all',
          expanded,
          'marketer_month',
          PANEL_BRANCHES[2].color,
          (n) => `${n} mktr${n === 1 ? '' : 's'}`,
          // ids are unique across marketers/promotions, so one map serves both
          (monthMarketers) => applyStructureCollapse(monthMarketers, expanded, expanded),
        )
      : null,
  }
}

interface MiniStructureMapProps {
  presentation: 'campaign' | 'tree'
  open: boolean
  large: boolean
  onToggleOpen: () => void
  onToggleLarge: () => void
  tree: PanelTree
  campaignLabel: string
  expanded: Record<string, boolean>
  selectedIds: string[]
  onNodeClick: (id: string, kind: TreeNode['kind']) => void
  error: string | null
}

/** Small Structure graph (same layoutTree + circles as CampaignStructureMap),
 *  with its own pan / zoom, that acts purely as a selector. */
function MiniStructureMap({
  presentation,
  open,
  large,
  onToggleOpen,
  onToggleLarge,
  tree,
  campaignLabel,
  expanded,
  selectedIds,
  onNodeClick,
  error,
}: MiniStructureMapProps) {
  const dark = presentation === 'tree'
  const c = dark
    ? { bg: TREE_DARK.cardBg, alt: TREE_DARK.cardBgAlt, border: TREE_DARK.border, text: TREE_DARK.textPrimary, sub: TREE_DARK.textFaint, canvas: TREE_DARK.canvas }
    : { bg: '#ffffff', alt: '#ffffff', border: '#e5e7eb', text: '#111827', sub: '#9ca3af', canvas: '#fafafa' }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  const root = useMemo<TreeNode>(
    () => ({
      id: 'panel_root',
      label: campaignLabel,
      kind: 'campaign',
      color: '#111827',
      children: PANEL_BRANCHES.map((b) => ({
        id: b.id,
        label: b.label,
        kind: 'branch' as const,
        color: b.color,
        children: tree[b.id] ?? [],
      })),
    }),
    [tree, campaignLabel],
  )
  const layout = useMemo(() => layoutTree(root), [root])
  const subtitleById = useMemo(() => {
    const m = new Map<string, string>()
    const walk = (n: TreeNode) => {
      if (n.subtitle) m.set(n.id, n.subtitle)
      n.children?.forEach(walk)
    }
    walk(root)
    return m
  }, [root])
  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout])
  const isLoading = tree.content === null || tree.own_assets === null || tree.marketers === null

  const viewportRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const userMovedRef = useRef(false)
  const dragRef = useRef<{ sx: number; sy: number; lx: number; ly: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  // Manual resize (drag the top-left corner). null = use the preset size.
  const [customSize, setCustomSize] = useState<{ w: number; h: number } | null>(null)
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  const fit = useCallback(() => {
    const el = viewportRef.current
    if (!el || !el.clientWidth || !el.clientHeight) return
    const s = Math.min(1, Math.max(0.12, Math.min(el.clientWidth / layout.canvasW, el.clientHeight / layout.canvasH)))
    setView({ scale: s, x: (el.clientWidth - layout.canvasW * s) / 2, y: (el.clientHeight - layout.canvasH * s) / 2 })
  }, [layout.canvasW, layout.canvasH])

  // Auto-fit until the user pans/zooms; the ⌂ button re-enables it.
  useEffect(() => {
    if (open && !userMovedRef.current) fit()
  }, [open, large, customSize, fit])

  const handleDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.button !== 0) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false }
  }
  const handleMove = (e: React.PointerEvent) => {
    e.stopPropagation()
    const d = dragRef.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3) d.moved = true
    if (!d.moved) return
    const dx = e.clientX - d.lx
    const dy = e.clientY - d.ly
    d.lx = e.clientX
    d.ly = e.clientY
    userMovedRef.current = true
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }
  const handleUp = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (dragRef.current?.moved) {
      suppressClickRef.current = true
      setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
    dragRef.current = null
  }
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const ox = e.clientX - rect.left
    const oy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.87 : 1.15
    userMovedRef.current = true
    setView((v) => {
      const s = Math.min(2, Math.max(0.1, v.scale * factor))
      const cx = (ox - v.x) / v.scale
      const cy = (oy - v.y) / v.scale
      return { scale: s, x: ox - cx * s, y: oy - cy * s }
    })
  }
  const handleNodeClick = (n: LaidOutNode) => {
    if (suppressClickRef.current) return
    onNodeClick(n.id, n.kind)
  }

  const headerBtn: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: c.sub,
    cursor: 'pointer',
    fontSize: 13,
    padding: '0 4px',
    lineHeight: 1,
  }

  const renderNode = (n: LaidOutNode) => {
    const selected = selectedIds.includes(n.id)
    const ring = selected ? `0 0 0 3px ${n.color}66` : undefined
    const base: React.CSSProperties = {
      position: 'absolute',
      left: n.center.x - n.w / 2,
      top: n.center.y - n.h / 2,
      width: n.w,
      height: n.h,
      boxSizing: 'border-box',
    }
    if (n.kind === 'campaign') {
      return (
        <div
          key={n.id}
          style={{
            ...base,
            borderRadius: 12,
            background: 'linear-gradient(160deg, #111827 0%, #312e81 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 12px',
            fontSize: 13,
            fontWeight: 700,
            textAlign: 'center',
            overflow: 'hidden',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
        </div>
      )
    }
    if (n.kind === 'month' || n.kind === 'marketer' || n.kind === 'promotion') {
      const isOpen = !!expanded[n.id]
      return (
        <div
          key={n.id}
          role="button"
          onClick={() => handleNodeClick(n)}
          style={{
            ...base,
            borderRadius: '50%',
            border: `1.5px solid ${n.color}`,
            background: c.bg,
            boxShadow: ring,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            padding: 8,
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: c.text, lineHeight: 1.15, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {n.label}
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: n.color }}>{subtitleById.get(n.id) ?? ''}</span>
          <span style={{ fontSize: 9, color: n.color }}>{isOpen ? '▲' : '▼'}</span>
        </div>
      )
    }
    if (n.kind === 'branch') {
      return (
        <div
          key={n.id}
          style={{
            ...base,
            borderRadius: 12,
            border: `1.5px solid ${n.color}`,
            background: c.bg,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.color, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: c.text, whiteSpace: 'nowrap' }}>{n.label}</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: n.color }}>Branch</span>
          </div>
        </div>
      )
    }
    // asset / video leaf
    return (
      <div
        key={n.id}
        role="button"
        onClick={() => handleNodeClick(n)}
        title={n.label}
        style={{
          ...base,
          borderRadius: 10,
          border: `1.5px solid ${n.color}66`,
          background: c.alt,
          boxShadow: ring,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          cursor: 'pointer',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: n.color, flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.label}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: n.color }}>
            {n.kind === 'video' ? 'Video' : 'Asset'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onWheel={stop}
      style={{ position: 'absolute', right: 20, bottom: 70, zIndex: 5, cursor: 'default' }}
    >
      <div
        style={{
          background: c.bg,
          border: `1px solid ${c.border}`,
          borderRadius: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: c.text,
            boxShadow: open ? `inset 0 -1px 0 ${c.border}` : 'none',
          }}
        >
          <span onClick={onToggleOpen} style={{ cursor: 'pointer', flex: 1 }}>
            Structure
          </span>
          {open && (
            <>
              <button
                style={headerBtn}
                title="Fit to panel"
                onClick={() => {
                  userMovedRef.current = false
                  fit()
                }}
              >
                ⌂
              </button>
              <button
                style={headerBtn}
                title={large ? 'Shrink' : 'Enlarge'}
                onClick={() => {
                  userMovedRef.current = false
                  setCustomSize(null)
                  onToggleLarge()
                }}
              >
                {large ? '⤡' : '⤢'}
              </button>
            </>
          )}
          <button style={headerBtn} onClick={onToggleOpen} title={open ? 'Close' : 'Open'}>
            {open ? '×' : '▸'}
          </button>
        </div>
        {open && (
          <div
            ref={viewportRef}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
            onWheel={handleWheel}
            style={{
              position: 'relative',
              overflow: 'hidden',
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
              background: c.canvas,
              width: customSize ? customSize.w : large ? 'min(820px, calc(100vw - 80px))' : 380,
              height: customSize ? customSize.h : large ? 'min(560px, calc(100vh - 260px))' : 260,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 0,
                height: 0,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                transformOrigin: '0 0',
              }}
            >
              <svg style={{ position: 'absolute', top: 0, left: 0, width: layout.canvasW, height: layout.canvasH, overflow: 'visible', pointerEvents: 'none' }}>
                {layout.edges.map((e, i) => {
                  const p = nodeById.get(e.fromId)
                  const ch = nodeById.get(e.toId)
                  if (!p || !ch) return null
                  return (
                    <path
                      key={i}
                      d={curvePath({ x: p.center.x, y: p.center.y + p.h / 2 }, { x: ch.center.x, y: ch.center.y - ch.h / 2 })}
                      fill="none"
                      stroke={e.color}
                      strokeWidth={2}
                      strokeOpacity={0.55}
                    />
                  )
                })}
              </svg>
              {layout.nodes.map(renderNode)}
            </div>
            {(isLoading || error) && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: '6px 10px',
                  fontSize: 11,
                  color: error ? '#dc2626' : c.sub,
                  background: c.bg,
                }}
              >
                {error ?? 'Loading structure…'}
              </div>
            )}
          </div>
        )}
      </div>
      {open && (
        <div
          title="Drag to resize"
          onPointerDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
            const el = viewportRef.current
            if (!el) return
            e.currentTarget.setPointerCapture(e.pointerId)
            resizeRef.current = { x: e.clientX, y: e.clientY, w: el.clientWidth, h: el.clientHeight }
          }}
          onPointerMove={(e) => {
            e.stopPropagation()
            const r = resizeRef.current
            if (!r) return
            setCustomSize({
              w: Math.min(window.innerWidth - 60, Math.max(280, r.w + (r.x - e.clientX))),
              h: Math.min(window.innerHeight - 230, Math.max(180, r.h + (r.y - e.clientY))),
            })
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            resizeRef.current = null
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 16,
            height: 16,
            zIndex: 2,
            cursor: 'nwse-resize',
            touchAction: 'none',
            background: `linear-gradient(135deg, ${c.sub} 0 2px, transparent 2px 5px, ${c.sub} 5px 7px, transparent 7px)`,
          }}
        />
      )}
    </div>
  )
}

/** Phase 1 selected-item cards. Rendered inside the transformed canvas layer
 *  (canvas coordinates) and deliberately NOT part of `positions`/drag. */
function SelectedItemsLayer({
  presentation,
  label,
  items,
  showThumbnails,
}: {
  presentation: 'campaign' | 'tree'
  label: string | null
  items: PanelItem[]
  showThumbnails: boolean
}) {
  if (!label) return null
  const dark = presentation === 'tree'
  const shown = items.slice(0, PANEL_ITEM_CAP)
  const left0 = HUB_X - ((ITEMS_COLS - 1) / 2) * ITEMS_COL_SPACING - OUTCOME_W / 2
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: left0,
          top: ITEMS_TOP - 34,
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          color: dark ? TREE_DARK.textSecondary : '#6b7280',
        }}
      >
        {label} · {items.length} item{items.length === 1 ? '' : 's'}
        {items.length > shown.length ? ` (showing first ${shown.length})` : ''}
      </div>
      {shown.map((it, i) => (
        <div
          key={it.id}
          title={it.label}
          style={{
            position: 'absolute',
            left: left0 + (i % ITEMS_COLS) * ITEMS_COL_SPACING,
            top: ITEMS_TOP + Math.floor(i / ITEMS_COLS) * ITEMS_ROW_SPACING,
            width: OUTCOME_W,
            height: OUTCOME_H,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '0 12px',
            borderRadius: 10,
            border: `1.5px solid ${it.color}66`,
            background: dark ? TREE_DARK.cardBgAlt : '#ffffff',
            boxShadow: dark ? 'none' : '0 2px 6px rgba(15,23,42,0.04)',
          }}
        >
          {showThumbnails && (it.kind === 'video' || it.kind === 'asset') && it.thumbnailUrl ? (
            <img
              src={it.thumbnailUrl}
              alt=""
              draggable={false}
              style={{ width: 26, height: 26, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: dark ? TREE_DARK.textPrimary : '#374151',
              }}
            >
              {it.label}
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: it.color }}>
              {ITEM_KIND_LABEL[it.kind] ?? it.kind}
            </span>
          </div>
        </div>
      ))}
    </>
  )
}

interface CampaignJourneyMapProps {
  embedded?: boolean;
  presentation?: 'campaign' | 'tree';
}

export default function CampaignJourneyMap({ embedded = false, presentation = 'campaign' }: CampaignJourneyMapProps) {
  const { campaignId: paramCampaignId } = useParams<{ campaignId: string }>()
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(undefined)
  const campaignId = presentation === 'tree' ? selectedCampaignId : paramCampaignId
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // Header name + switcher only — same viewer-id resolution as
  // CampaignStructureMap.tsx / AllAssetsAnalytics.tsx (Operator-Mode-aware).
  const { user } = useAuth()
  const { viewingMemberId, viewingOrgId, isReadOnly } = useViewing()
  const effectiveViewerId = isReadOnly ? viewingMemberId : (user?.id ?? null)
  const campaignOptions = useCampaignOptions(effectiveViewerId)
  const currentCampaignName = useMemo(
    () => campaignOptions.find((c) => c.id === campaignId)?.campaign_name ?? null,
    [campaignOptions, campaignId]
  )

  useEffect(() => {
    if (presentation === 'tree' && !selectedCampaignId && campaignOptions.length > 0) {
      setSelectedCampaignId(campaignOptions[0].id)
    }
  }, [presentation, selectedCampaignId, campaignOptions])

    // ── Phase 1: Structure control panel state ────────────────────────────
  const [panelOpen, setPanelOpen] = useState(false)
  // Sticky flag: flips true the first time the panel is opened. Until then
  // both Structure hooks receive campaignId = undefined, so they return null
  // and run NO queries (useCampaignStructureData runs getAssetAnalyticsRows).
  const [structureRequested, setStructureRequested] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState<Record<string, boolean>>({})
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])

  const structureData = useCampaignStructureData(
    structureRequested ? campaignId : undefined,
    effectiveViewerId,
    isReadOnly,
    viewingMemberId,
    viewingOrgId,
  )
  const contentData = useCampaignContentBuckets(structureRequested ? campaignId : undefined, effectiveViewerId)

  useEffect(() => {
    setSelectedNodeIds([])
    setPanelExpanded({})
  }, [campaignId])

  // The selected node is always treated as expanded for the builder, so a
  // selected month always has its children even if its row is collapsed.
  const builderExpanded = useMemo(() => {
    if (selectedNodeIds.length === 0) return panelExpanded
    const m = { ...panelExpanded }
    selectedNodeIds.forEach((id) => {
      m[id] = true
    })
    return m
  }, [panelExpanded, selectedNodeIds])

  // Full date range on purpose ('all'), no search — see Phase 1 notes.
  // displayTree follows only what the user expanded. panelTree (used just to
  // find the selected node's cards) also treats the selected node as expanded,
  // so a selected-but-collapsed month still yields its items.
  const displayTree = useMemo(
    () => buildPanelTree(contentData.contentVideos, structureData.ownAssetNodes, structureData.marketerNodes, panelExpanded),
    [contentData.contentVideos, structureData.ownAssetNodes, structureData.marketerNodes, panelExpanded],
  )
  const panelTree = useMemo(
    () => buildPanelTree(contentData.contentVideos, structureData.ownAssetNodes, structureData.marketerNodes, builderExpanded),
    [contentData.contentVideos, structureData.ownAssetNodes, structureData.marketerNodes, builderExpanded],
  )

  // Selection is additive: every selected node contributes its items, until
  // that node is toggled off. The ref keeps a selected video/asset's node if
  // its parent circle is collapsed (its own descendants are dropped on toggle-off).
  const selectedNodesRef = useRef<Map<string, TreeNode>>(new Map())
  const selectedNodes = useMemo(() => {
    const keep = new Map<string, TreeNode>()
    const out: TreeNode[] = []
    for (const id of selectedNodeIds) {
      let hit: TreeNode | null = null
      for (const b of PANEL_BRANCHES) {
        hit = findTreeNode(panelTree[b.id], id)
        if (hit) break
      }
      hit = hit ?? selectedNodesRef.current.get(id) ?? null
      if (hit) {
        keep.set(id, hit)
        out.push(hit)
      }
    }
    selectedNodesRef.current = keep
    return out
  }, [panelTree, selectedNodeIds])
  const selectedItems = useMemo(() => {
    const seen = new Set<string>()
    const items: PanelItem[] = []
    for (const n of selectedNodes) {
      for (const it of itemsForNode(n)) {
        if (!seen.has(it.id)) {
          seen.add(it.id)
          items.push(it)
        }
      }
    }
    return items
  }, [selectedNodes])
  const selectionLabel =
    selectedNodes.length === 0 ? null : selectedNodes.length === 1 ? selectedNodes[0].label : `${selectedNodes.length} selections`

// ── Slice A: sticky journey context (engine only) ─────────────────────
// Structure selection = WHICH items. This block = WHICH real journeys contain
// them. Entry video ids only ever GROW (until campaign change / clear), so
// turning a selection off later never removes an already-discovered journey.
// Slice A covers Content videos (content_video_<videoId>) and Own Assets
// (own_asset_<assetId>, resolved via videos.asset_id). Marketer / Promotion
// entries are intentionally ignored here.
const [journeyEntryVideoIds, setJourneyEntryVideoIds] = useState<string[]>([])
const [journeyContext, setJourneyContext] = useState<JourneyContext>(EMPTY_JOURNEY_CONTEXT)
const assetVideoCacheRef = useRef<Map<string, string[]>>(new Map())

const clearJourneyContext = useCallback(() => {
  setJourneyEntryVideoIds((prev) => (prev.length ? [] : prev))
  setJourneyContext(EMPTY_JOURNEY_CONTEXT)
}, [])

useEffect(() => {
  clearJourneyContext()
  assetVideoCacheRef.current = new Map()
}, [campaignId, clearJourneyContext])

// selectedItems -> entry video ids (grow-only)
useEffect(() => {
  const contentVideoIds: string[] = []
  const ownAssetIds: string[] = []

  for (const it of selectedItems) {
    if (it.id.startsWith('content_video_')) {
      contentVideoIds.push(it.id.slice('content_video_'.length))
    } else if (it.id.startsWith('own_asset_')) {
      ownAssetIds.push(it.id.slice('own_asset_'.length))
    }
  }

  if (contentVideoIds.length === 0 && ownAssetIds.length === 0) return

  let cancelled = false

  ;(async () => {
    try {
      const cache = assetVideoCacheRef.current
      const uncached = ownAssetIds.filter((id) => !cache.has(id))

      if (uncached.length > 0) {
        const found = await resolveVideoIdsForAssets(uncached)

        for (const id of uncached) {
          cache.set(id, found.get(id) ?? [])
        }
      }

      if (cancelled) return

      const fromAssets = ownAssetIds.flatMap((id) => cache.get(id) ?? [])
      const nonVideoAssets = ownAssetIds.filter(
        (id) => (cache.get(id) ?? []).length === 0,
      )

      if (nonVideoAssets.length > 0) {
        console.log(
          '[CJM journey] Own Assets with no video (skipped in Slice A):',
          nonVideoAssets,
        )
      }

      setJourneyEntryVideoIds((prev) => {
        const next = new Set(prev)

        for (const v of [...contentVideoIds, ...fromAssets]) {
          next.add(v)
        }

        return next.size === prev.length ? prev : Array.from(next)
      })
    } catch (err) {
      if (!cancelled) {
        setJourneyContext((c) => ({
          ...c,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }))
      }
    }
  })()

  return () => {
    cancelled = true
  }
}, [selectedItems])

// entry video ids -> real journeys -> graph (existing buildJourneyGraph)
useEffect(() => {
  if (journeyEntryVideoIds.length === 0) return

  let cancelled = false

  setJourneyContext((c) => ({
    ...c,
    status: 'loading',
    error: null,
  }))

  ;(async () => {
    try {
      const result = await discoverJourneysForVideos(journeyEntryVideoIds)

      if (cancelled) return

      setJourneyContext({
        status: 'ready',
        graph: buildJourneyGraph(result.journeys),
        journeyCount: result.journeys.length,
        excludedJourneys: result.excludedJourneys,
        truncated: result.truncated,
        coverage: result.journeyCountByVideoId,
        error: null,
      })
    } catch (err) {
      if (!cancelled) {
        setJourneyContext((c) => ({
          ...c,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }))
      }
    }
  })()

  return () => {
    cancelled = true
  }
}, [journeyEntryVideoIds])

// ── TEMPORARY DEBUG (Slice A only — remove when Slice B renders the graph) ──
useEffect(() => {
  if (journeyContext.status === 'error') {
    console.warn('[CJM journey] error:', journeyContext.error)
  }

  if (journeyContext.status !== 'ready' || !journeyContext.graph) return

  const g = journeyContext.graph

  console.groupCollapsed(
    `[CJM journey] ${journeyContext.journeyCount} journey(s), ${g.nodes.length} node(s), ${g.edges.length} edge(s)` +
      `${journeyContext.truncated ? ' — TRUNCATED' : ''}`,
  )

  console.log('entry videos:', journeyEntryVideoIds.length, journeyEntryVideoIds)
  console.log(
    'excluded (canonical path no longer has the video):',
    journeyContext.excludedJourneys,
  )
  console.log('coverage (entry video -> journeys):', journeyContext.coverage)
  console.log(
    'entry videos with NO observed journey:',
    journeyEntryVideoIds.filter((v) => !journeyContext.coverage[v]),
  )
  console.log('nodes:', g.nodes.map((n) => n.videoId))
  console.log(
    'edges:',
    g.edges.map(
      (e) => `${e.fromVideoId} -> ${e.toVideoId}  x${e.observedCount}`,
    ),
  )

  console.groupEnd()
}, [journeyContext, journeyEntryVideoIds])

// ── end temporary debug ──

const [panelLarge, setPanelLarge] = useState(false)
  const [showThumbnails, setShowThumbnails] = useState(false)
  const handlePanelToggle = () => {
    setPanelOpen((o) => !o)
    setStructureRequested(true)
  }
  // Click rule: branch / root do nothing. Any other node toggles: first click
  // selects it (and expands a Month / Marketer / Promotion circle); clicking it
  // again deselects it, collapses the circle, and drops anything selected
  // beneath it. Selecting another node never clears the others.
  const handlePanelNodeClick = (id: string, kind: TreeNode['kind']) => {
    if (kind === 'campaign' || kind === 'branch') return
    const isCluster = kind === 'month' || kind === 'marketer' || kind === 'promotion'
    if (selectedNodeIds.includes(id)) {
      const drop = new Set<string>([id])
      const collect = (n: TreeNode) => n.children?.forEach((ch) => { drop.add(ch.id); collect(ch) })
      for (const b of PANEL_BRANCHES) {
        const node = findTreeNode(panelTree[b.id], id)
        if (node) {
          collect(node)
          break
        }
      }
      setSelectedNodeIds((prev) => prev.filter((x) => !drop.has(x)))
      if (isCluster) setPanelExpanded((p) => ({ ...p, [id]: false }))
    } else {
      setSelectedNodeIds((prev) => [...prev, id])
      if (isCluster) setPanelExpanded((p) => ({ ...p, [id]: true }))
    }
  }

  const { nodes, connections } = useMemo(() => buildLayout(CAMPAIGN_PATHS), [])

  const [transform, setTransform] = useState<CanvasTransform>({ x: -360, y: -340, scale: 0.8 })
  const [hoveredPathId, setHoveredPathId] = useState<string | null>(null)

  // Movable-canvas state: every card (and the hub) can be dragged to a
  // custom position. Session-only for now — see header comment.
  const [positions, setPositions] = useState<Record<string, Pt>>(() => {
    const initial: Record<string, Pt> = { hub: { x: HUB_X, y: HUB_Y } }
    nodes.forEach((n) => {
      initial[n.id] = n.center
    })
    return initial
  })

  const nodeById = useMemo(() => {
    const map: Record<string, PositionedNode> = {}
    nodes.forEach((n) => {
      map[n.id] = n
    })
    return map
  }, [nodes])

  const connectorPaths = useMemo(() => {
    return connections.map((conn) => {
      const fromCenter = positions[conn.fromId]
      const toCenter = positions[conn.toId]
      const from =
        conn.fromId === 'hub'
          ? circleAnchor(fromCenter, HUB_R, toCenter)
          : rectAnchor(fromCenter, nodeById[conn.fromId].w, nodeById[conn.fromId].h, toCenter)
      const to = rectAnchor(toCenter, nodeById[conn.toId].w, nodeById[conn.toId].h, fromCenter)
      return { from, to, color: conn.color, pathId: conn.pathId }
    })
  }, [connections, positions, nodeById])

  // Drag-to-reposition: pointer capture keeps move/up events targeted at
  // the card being dragged; stopPropagation keeps the canvas's own pan
  // handlers from firing on the same gesture.
  const dragRef = useRef<{ id: string; startClientX: number; startClientY: number; startCenter: Pt } | null>(null)

  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = { id, startClientX: e.clientX, startClientY: e.clientY, startCenter: positions[id] }
    },
    [positions]
  )

  const handleNodePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return
      e.stopPropagation()
      const { id, startClientX, startClientY, startCenter } = dragRef.current
      const dx = (e.clientX - startClientX) / transform.scale
      const dy = (e.clientY - startClientY) / transform.scale
      setPositions((p) => ({ ...p, [id]: { x: startCenter.x + dx, y: startCenter.y + dy } }))
    },
    [transform.scale]
  )

  const handleNodePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.stopPropagation()
    dragRef.current = null
  }, [])

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

  const resetView = useCallback(() => setTransform({ x: -360, y: -340, scale: 0.8 }), [])

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

  const renderCampaignSwitcher = () => (
    <div style={styles.campaignSwitcherWrap}>
      <select
        value={campaignId ?? ''}
        onChange={(e) => {
          if (presentation === 'tree') {
            setSelectedCampaignId(e.target.value)
          } else {
            navigate(`/marketplace/campaigns/${e.target.value}/journey`)
          }
        }}
        style={{ ...styles.campaignSwitcher, ...(presentation === 'tree' ? { background: TREE_DARK.cardBg, borderColor: TREE_DARK.border, color: TREE_DARK.textPrimary } : {}) }}
      >
        {campaignId && !campaignOptions.some((c) => c.id === campaignId) && (
          <option value={campaignId}>{currentCampaignName ?? 'Untitled Campaign'}</option>
        )}
        {campaignOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.campaign_name}
          </option>
        ))}
      </select>
      <ChevronDown size={12} style={{ ...styles.campaignSwitcherIcon, ...(presentation === 'tree' ? { color: TREE_DARK.textFaint } : {}) }} />
    </div>
  )

  return (
    <div style={{ ...styles.page, ...(presentation === 'tree' ? { background: TREE_DARK.page } : {}) }}>
      {presentation === 'campaign' && (
        <div style={styles.header}>
          <Link to="/dashboard" style={styles.backLink}>
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
          <div style={styles.titleBlock}>
            <span style={styles.title}>Campaign Journey Map</span>
            <span style={styles.subtitle}>{currentCampaignName ?? campaignId ?? 'Untitled Campaign'}</span>
          </div>
          <span style={styles.movableNote}>
            🖐️ Drag any card to rearrange — cards stay movable as more get added later
          </span>
          <span style={styles.phaseBadge}>
            <Sparkles size={12} /> Phase 1 · Visual preview — not yet connected to live tracking data
          </span>
          {renderCampaignSwitcher()}
        </div>
      )}

      <div
        ref={containerRef}
        style={{ ...styles.canvasContainer, ...(presentation === 'tree' ? { background: TREE_DARK.canvas } : {}) }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <CanvasGrid transform={transform} dark={presentation === 'tree'} />

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
            <circle cx={positions.hub.x} cy={positions.hub.y} r={HUB_R + 210} fill="url(#hubGlow)" />
            <circle cx={positions.hub.x} cy={positions.hub.y} r={ROOT_DIST} fill="none" stroke="#eef0f3" strokeWidth={1} strokeDasharray="2 6" />
            <circle cx={positions.hub.x} cy={positions.hub.y} r={OUTCOME_DIST} fill="none" stroke="#f3f4f6" strokeWidth={1} strokeDasharray="2 6" />

            {connectorPaths.map((c, i) => {
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

          {/* Phase 1: selected Structure items (canvas coordinates, not draggable) */}
          <SelectedItemsLayer presentation={presentation} label={selectionLabel} items={selectedItems} showThumbnails={showThumbnails} />

          {/* Hub node */}
          <div
            onPointerDown={(e) => handleNodePointerDown(e, 'hub')}
            onPointerMove={handleNodePointerMove}
            onPointerUp={handleNodePointerUp}
            style={{
              ...styles.hub,
              left: positions.hub.x - HUB_R,
              top: positions.hub.y - HUB_R,
              width: HUB_R * 2,
              height: HUB_R * 2,
              cursor: 'grab',
              touchAction: 'none',
            }}
          >
            <span style={styles.hubEyebrow}>Campaign</span>
            <span style={styles.hubTitle}>{currentCampaignName ?? (campaignId ? 'Loading…' : 'Campaign Name')}</span>
          </div>

          {/* Path root + outcome nodes */}
          {nodes.map((node) => {
            const dimmed = hoveredPathId !== null && hoveredPathId !== node.pathId
            const isRoot = node.kind === 'root'
            const center = positions[node.id]
            return (
              <div
                key={node.id}
                onMouseEnter={() => setHoveredPathId(node.pathId)}
                onMouseLeave={() => setHoveredPathId(null)}
                onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
                style={{
                  ...(isRoot ? styles.rootNode : styles.outcomeNode),
                  left: center.x - node.w / 2,
                  top: center.y - node.h / 2,
                  width: node.w,
                  height: node.h,
                  borderColor: isRoot ? node.color : `${node.color}66`,
                  boxShadow: isRoot
                    ? `0 0 0 2px ${node.color}1f, 0 4px 10px rgba(15,23,42,0.06)`
                    : '0 2px 6px rgba(15,23,42,0.04)',
                  ...(presentation === 'tree' ? { background: isRoot ? TREE_DARK.cardBg : TREE_DARK.cardBgAlt } : {}),
                  opacity: dimmed ? 0.35 : 1,
                  cursor: 'grab',
                  touchAction: 'none',
                }}
              >
                <span style={{ ...styles.nodeDot, background: node.color }} />
                <div style={styles.nodeTextCol}>
                  <span
                    style={
                      presentation === 'tree'
                        ? { ...(isRoot ? styles.nodeLabelRoot : styles.nodeLabelOutcome), color: TREE_DARK.textPrimary }
                        : isRoot
                        ? styles.nodeLabelRoot
                        : styles.nodeLabelOutcome
                    }
                  >
                    {node.label}
                  </span>
                  <span style={{ ...styles.nodeKind, color: node.color }}>
                    {isRoot ? 'Entry content' : 'Outcome'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {(() => {
          const anchorLeft = transform.x + positions.hub.x * transform.scale + HUB_R * transform.scale + 12
          const anchorTop = transform.y + positions.hub.y * transform.scale - 15
          const dark = presentation === 'tree'
          return (
            <div style={{ position: 'absolute', left: anchorLeft, top: anchorTop, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowThumbnails((prev) => !prev)}
                style={{
                  ...styles.legendChip,
                  borderColor: showThumbnails ? '#6366f1' : dark ? TREE_DARK.border : '#e5e7eb',
                  background: showThumbnails ? '#6366f10f' : dark ? TREE_DARK.cardBg : '#ffffff',
                  color: showThumbnails ? '#6366f1' : dark ? TREE_DARK.textSecondary : '#374151',
                }}
              >
                Thumbnails: {showThumbnails ? 'On' : 'Off'}
              </button>
              {dark && renderCampaignSwitcher()}
            </div>
          )
        })()}

        {/* Phase 1: Structure control panel (screen space, above zoomControls) */}
        <MiniStructureMap
          presentation={presentation}
          open={panelOpen}
          large={panelLarge}
          onToggleOpen={handlePanelToggle}
          onToggleLarge={() => setPanelLarge((l) => !l)}
          tree={displayTree}
          campaignLabel={currentCampaignName ?? 'Campaign'}
          expanded={panelExpanded}
          selectedIds={selectedNodeIds}
          onNodeClick={handlePanelNodeClick}
          error={structureData.error ?? contentData.error}
        />

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
                  borderColor: active ? p.color : (presentation === 'tree' ? TREE_DARK.border : '#e5e7eb'),
                  background: active ? `${p.color}0f` : (presentation === 'tree' ? TREE_DARK.cardBg : '#ffffff'),
                }}
                onMouseEnter={() => setHoveredPathId(p.id)}
                onMouseLeave={() => setHoveredPathId(null)}
              >
                <Icon size={13} color={p.color} />
                <span style={{ color: active ? p.color : (presentation === 'tree' ? TREE_DARK.textSecondary : '#374151') }}>{p.label}</span>
              </button>
            )
          })}
        </div>

        <div style={{ ...styles.zoomControls, ...(presentation === 'tree' ? { background: TREE_DARK.cardBg, borderColor: TREE_DARK.border } : {}) }}>
          <button style={{ ...styles.zoomBtn, ...(presentation === 'tree' ? { color: TREE_DARK.textSecondary } : {}) }} onClick={zoomIn} title="Zoom in">
            +
          </button>
          <span style={{ ...styles.zoomLabel, ...(presentation === 'tree' ? { color: TREE_DARK.textFaint } : {}) }}>{scalePercent}%</span>
          <button style={{ ...styles.zoomBtn, ...(presentation === 'tree' ? { color: TREE_DARK.textSecondary } : {}) }} onClick={zoomOut} title="Zoom out">
            −
          </button>
          <button
            style={{ ...styles.zoomBtn, borderLeft: `1px solid ${presentation === 'tree' ? TREE_DARK.border : '#e5e7eb'}`, marginLeft: 2, paddingLeft: 6, ...(presentation === 'tree' ? { color: TREE_DARK.textSecondary } : {}) }}
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
  movableNote: {
    marginLeft: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    color: '#3730a3',
    background: '#eef2ff',
    border: '1px solid #c7d2fe',
    borderRadius: 999,
    padding: '5px 10px',
    whiteSpace: 'nowrap',
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
  campaignSwitcherWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  campaignSwitcher: {
    appearance: 'none',
    fontSize: 11,
    fontWeight: 600,
    color: '#111827',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '6px 26px 6px 10px',
    cursor: 'pointer',
    maxWidth: 180,
  },
  campaignSwitcherIcon: {
    position: 'absolute',
    right: 8,
    color: '#9ca3af',
    pointerEvents: 'none',
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
// Place at the bottom of CampaignJourneyMap.tsx
export function EmbeddedCampaignJourneyMap({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      style={{
        position: embedded ? 'absolute' : 'fixed',
        inset: 0,
        top: embedded ? 0 : 56,
        overflow: 'hidden',
      }}
    >
      {embedded && (
        <style>{`
          .embedded-journey-container header,
          div[style*="borderBottom: 1px solid"],
          div[style*="border-bottom"] {
            display: none !important;
          }
        `}</style>
      )}
      <div className={embedded ? 'embedded-journey-container' : ''} style={{ width: '100%', height: '100%' }}>
        <CampaignJourneyMap />
      </div>
    </div>
  );
}