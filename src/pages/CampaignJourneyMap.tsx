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

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { discoverJourneysForVideos, resolveVideoIdsForAssets, type DiscoveredJourney } from '../lib/journeyDiscovery'
import { buildJourneyGraph, type JourneyGraph } from '../lib/journeyGraph'
import { resolveDownstreamNodes, resolveStructuralLinksForVideos, type StructuralLink } from '../services/journey/journeyDownstreamResolver'
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
// Mobile/fit additions: lower zoom floor (so a phone can fit the whole map),
// floor for the initial auto-fit, and the container width below which the
// layout is treated as "narrow" (phone).
const JOURNEY_MIN_SCALE = 0.15
const JOURNEY_FIT_MIN_SCALE = 0.2
const JOURNEY_NARROW_PX = 640

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

// ─── Slice C: selection chips + node highlights ─────────────────────────────
// Every selected Structure node becomes a chip. A chip's "members" are the
// video ids behind that node (month -> its videos/assets, marketer -> its
// promotions' assets, ...). Active chips highlight the journey-graph nodes
// they contain; everything else dims. Toggling a chip off only affects the
// highlight — it never removes a selection or an already-discovered journey.

interface NodeHighlight {
  colors: string[]
  labels: string[]
}

interface SelectionChip {
  id: string // = the Structure node id
  label: string
  branch: PanelBranchId
  color: string
  /** members that are nodes of the current journey graph */
  countInGraph: number
  /** distinct videos behind this selection (assets resolved via videos.asset_id) */
  totalCount: number
}

/** Fallback branch lookup by id prefix (used only if the node is not in panelTree). */
function chipBranchOf(id: string): PanelBranchId | null {
  if (id.startsWith('content_')) return 'content'
  if (id.startsWith('own_assets_') || id.startsWith('own_asset_')) return 'own_assets'
  if (id.startsWith('marketer_') || id.startsWith('promotion_')) return 'marketers'
  return null
}

const UUID_TAIL = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

type LeafRef = { type: 'video' | 'asset'; id: string }

/** A video/asset leaf -> the raw id the journey engine understands. */
function leafRefOf(n: TreeNode): LeafRef | null {
  if (n.kind !== 'video' && n.kind !== 'asset') return null
  if (n.id.startsWith('content_video_')) return { type: 'video', id: n.id.slice('content_video_'.length) }
  if (n.id.startsWith('own_asset_')) return { type: 'asset', id: n.id.slice('own_asset_'.length) }
  const m = n.id.match(UUID_TAIL) // e.g. an asset under a promotion
  return m ? { type: n.kind === 'video' ? 'video' : 'asset', id: m[1] } : null
}

function collectLeafRefs(node: TreeNode, out: LeafRef[] = []): LeafRef[] {
  if (node.isShowMore) return out
  const ref = leafRefOf(node)
  if (ref) out.push(ref)
  node.children?.forEach((c) => collectLeafRefs(c, out))
  return out
}

/** Screen-space chip row (not zoomed with the canvas, so it stays readable). */
function JourneyChipBar({
  presentation,
  chips,
  chipOff,
  onToggleChip,
  narrow = false,
  narrowTop = 16,
}: {
  presentation: 'campaign' | 'tree'
  chips: SelectionChip[]
  chipOff: Set<string>
  onToggleChip: (id: string) => void
  /** phone layout: vertical stack under the legend instead of a wrapped row */
  narrow?: boolean
  narrowTop?: number
}) {
  if (chips.length === 0) return null
  const dark = presentation === 'tree'
  return (
    <div
      onPointerDown={narrow ? (e) => e.stopPropagation() : undefined}
      style={
        narrow
          ? {
              position: 'absolute',
              top: narrowTop,
              left: 12,
              maxWidth: 'min(70vw, 260px)',
              maxHeight: `calc(100% - ${narrowTop + 84}px)`, // keep clear of the bottom-right controls
              overflowY: 'auto',
              touchAction: 'pan-y',
              zIndex: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              flexWrap: 'nowrap',
              gap: 6,
            }
          : {
              position: 'absolute',
              top: 16,
              left: 350,
              right: 20,
              zIndex: 4,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              pointerEvents: 'none', // empty space between chips still pans the canvas
            }
      }
    >
      {chips.map((chip) => {
        const off = chipOff.has(chip.id)
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={!off}
            title={`${chip.countInGraph} of ${chip.totalCount} video${chip.totalCount === 1 ? '' : 's'} appear in the journey graph${off ? ' (highlight off)' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onToggleChip(chip.id)}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              maxWidth: narrow ? '100%' : 240,
              fontSize: 11.5,
              fontWeight: 600,
              padding: '5px 10px',
              borderRadius: 999,
              cursor: 'pointer',
              border: `1px solid ${off ? (dark ? TREE_DARK.border : '#e5e7eb') : chip.color}`,
              background: off ? (dark ? TREE_DARK.cardBg : '#ffffff') : `${chip.color}${dark ? '24' : '14'}`,
              color: dark ? TREE_DARK.textPrimary : '#374151',
              opacity: off ? 0.55 : 1,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'opacity 150ms ease, background 150ms ease, border-color 150ms ease',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                boxSizing: 'border-box',
                background: off ? 'transparent' : chip.color,
                border: `1.5px solid ${chip.color}`,
              }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chip.label}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, flexShrink: 0, color: dark ? TREE_DARK.textFaint : '#9ca3af' }}>
              {chip.countInGraph}/{chip.totalCount}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Slice A: sticky journey context (engine only — no UI reads this yet) ───
interface JourneyEnd {
  videoId: string
  outcomeId: string
  count: number
  /** true = from redirect_links structure (nobody has traversed it); drawn dashed, no count pill */
  structural?: boolean
}

// ─── Structural (redirect_links) outcomes ───────────────────────────────────
// Contextual (foreign) campaign outcome ids are namespaced `ctx:<campaignId>:<outcomeId>`
// so they can never collide with the primary campaign's fixed outcome ids.
const LEGACY_OUTCOME_ID = 'legacy'
const ctxOutcomeId = (campaignId: string, outcomeId: string) => `ctx:${campaignId}:${outcomeId}`
/** 'ctx:<cid>:sales_call' -> 'sales_call'; primary ids pass through unchanged. */
const baseOutcomeId = (id: string) => (id.startsWith('ctx:') ? id.slice(id.lastIndexOf(':') + 1) : id)

interface ForeignCampaign {
  campaignId: string
  /** primary-style outcome ids reached ('sales_call' | 'direct_purchase' | ...) */
  outcomeBases: string[]
}

/** Structural facts -> journey ends. Situation A (owner = selected campaign) maps to the
 *  primary outcome ids; Situation B (owner = another campaign) to namespaced ctx ids. */
function buildStructuralEnds(links: StructuralLink[], primaryCampaignId: string | undefined) {
  const ends = new Map<string, JourneyEnd>()
  const foreign = new Map<string, Set<string>>()
  const legacyLinks = new Set<string>()
  const videoIds = new Set<string>()
  for (const l of links) {
    if (l.resolution === 'legacy') {
      legacyLinks.add(l.redirectLinkId)
      ends.set(`${l.videoId}::${LEGACY_OUTCOME_ID}`, { videoId: l.videoId, outcomeId: LEGACY_OUTCOME_ID, count: 0, structural: true })
      videoIds.add(l.videoId)
      continue
    }
    const base = OUTCOME_BY_ELEMENT_TYPE[l.elementType]
    if (!base) continue
    const isForeign = !!l.ownerCampaignId && !!primaryCampaignId && l.ownerCampaignId !== primaryCampaignId
    let outcomeId = base
    if (isForeign && l.ownerCampaignId) {
      outcomeId = ctxOutcomeId(l.ownerCampaignId, base)
      const set = foreign.get(l.ownerCampaignId) ?? new Set<string>()
      set.add(base)
      foreign.set(l.ownerCampaignId, set)
    }
    ends.set(`${l.videoId}::${outcomeId}`, { videoId: l.videoId, outcomeId, count: 0, structural: true })
    videoIds.add(l.videoId)
  }
  return {
    ends: Array.from(ends.values()),
    foreign: Array.from(foreign, ([campaignId, set]) => ({ campaignId, outcomeBases: Array.from(set) })) as ForeignCampaign[],
    legacyCount: legacyLinks.size,
    videoIds,
  }
}

const OUTCOME_BY_ELEMENT_TYPE: Record<string, string> = {
  sales_call: 'sales_call',
  landing_page: 'direct_purchase',
  consultation: 'consultation',
  newsletter: 'newsletter',
}

interface JourneyContext {
  status: 'idle' | 'loading' | 'ready' | 'error'
  graph: JourneyGraph | null
  journeyCount: number
  excludedJourneys: number
  truncated: boolean
  /** requested entry video id -> number of kept journeys containing it */
  coverage: Record<string, number>

  /** Where observed journeys END: last video -> outcome node */
  ends: JourneyEnd[]
  /** Structural (redirect_links) ends for the selected videos — supplements `ends`, never replaces it */
  structuralEnds: JourneyEnd[]
  /** Other campaigns whose Campaign Element Assets the selected videos promote (contextual, not switchable) */
  foreign: ForeignCampaign[]
  /** redirect links that no longer match a campaign field (outdated / legacy) */
  legacyCount: number
  /** Outcome resolution is still running / finished / failed */
  endsStatus: 'pending' | 'ready' | 'failed'
  /** Journey ends that did not map to one of the 4 outcome nodes */
  endsUnmapped: number

  error: string | null
}

const EMPTY_JOURNEY_CONTEXT: JourneyContext = {
  status: 'idle',
  graph: null,
  journeyCount: 0,
  excludedJourneys: 0,
  truncated: false,
  coverage: {},
  ends: [],
  structuralEnds: [],
  foreign: [],
  legacyCount: 0,
  endsStatus: 'pending',
  endsUnmapped: 0,
  error: null,
}

/** Resolve where each kept journey ENDS, with the EXISTING resolver, the same
 *  way downstreamForRow.ts does: take every journey's own terminal step
 *  (destinationVideoId === null, per journey.ts TERMINAL SEMANTICS) and resolve
 *  it on a fabricated terminal-only graph. Resolving per journey (not on the
 *  merged graph) means a video that is terminal in one journey but mid-path in
 *  another still gets its end resolved where it actually ends. */
async function resolveJourneyEnds(journeys: DiscoveredJourney[]): Promise<{ ends: JourneyEnd[]; unmapped: number }> {
  const tally = new Map<string, { videoId: string; redirectLinkId: string; count: number }>()
  for (const j of journeys) {
    const last = j.path.steps[j.path.steps.length - 1]
    if (!last || last.destinationVideoId !== null || !last.redirectLinkId) continue
    const key = `${last.videoId}::${last.redirectLinkId}`
    const t = tally.get(key)
    if (t) t.count += 1
    else tally.set(key, { videoId: last.videoId, redirectLinkId: last.redirectLinkId, count: 1 })
  }
  if (tally.size === 0) return { ends: [], unmapped: 0 }

  const linksByVideo = new Map<string, string[]>()
  for (const t of tally.values()) {
    const list = linksByVideo.get(t.videoId)
    if (list) list.push(t.redirectLinkId)
    else linksByVideo.set(t.videoId, [t.redirectLinkId])
  }
  const terminalGraph: JourneyGraph = {
    nodes: Array.from(linksByVideo, ([videoId, links]) => ({
      videoId,
      observedAssetIds: [],
      observedRedirectLinkIds: links,
    })),
    edges: [],
  }
  const resolution = await resolveDownstreamNodes(terminalGraph)

  const outcomeByLink = new Map<string, string | null>()
  for (const n of resolution.nodes) {
    outcomeByLink.set(n.redirectLinkId, n.elementType ? OUTCOME_BY_ELEMENT_TYPE[n.elementType] ?? null : null)
  }

  const merged = new Map<string, JourneyEnd>()
  let unmapped = 0
  for (const t of tally.values()) {
    const outcomeId = outcomeByLink.get(t.redirectLinkId)
    if (!outcomeId) {
      unmapped += t.count
      continue
    }
    const key = `${t.videoId}::${outcomeId}`
    const prev = merged.get(key)
    if (prev) prev.count += t.count
    else merged.set(key, { videoId: t.videoId, outcomeId, count: t.count })
  }
  return { ends: Array.from(merged.values()), unmapped }
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

  // Pinch-to-zoom (touch only) — same pattern as CampaignStructureMap's
  // activePointers / pinchState. Single-finger pan and wheel are unchanged.
  const miniPointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const miniPinch = useRef<{ startDist: number; startScale: number } | null>(null)

  const handleDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.pointerType === 'touch') {
      miniPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (miniPointers.current.size === 2) {
        dragRef.current = null
        const pts = Array.from(miniPointers.current.values())
        miniPinch.current = { startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), startScale: view.scale }
        return
      }
    }
    if (e.button !== 0) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false }
  }
  const handleMove = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (e.pointerType === 'touch' && miniPointers.current.has(e.pointerId)) {
      miniPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    if (miniPointers.current.size === 2 && miniPinch.current) {
      const rect = viewportRef.current?.getBoundingClientRect()
      const pts = Array.from(miniPointers.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const ox = (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0)
      const oy = (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0)
      const target = miniPinch.current.startScale * (dist / (miniPinch.current.startDist || 1))
      userMovedRef.current = true
      setView((v) => {
        const sc = Math.min(2, Math.max(0.1, target))
        const cx = (ox - v.x) / v.scale
        const cy = (oy - v.y) / v.scale
        return { scale: sc, x: ox - cx * sc, y: oy - cy * sc }
      })
      return
    }
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
    if (e.pointerType === 'touch') {
      miniPointers.current.delete(e.pointerId)
      miniPinch.current = null
      if (miniPointers.current.size === 1) {
        // one finger left after a pinch: keep panning from where it is (moved=true suppresses an accidental tap)
        const [rest] = Array.from(miniPointers.current.values())
        dragRef.current = { sx: rest.x, sy: rest.y, lx: rest.x, ly: rest.y, moved: true }
      }
    }
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
            onPointerCancel={handleUp}
            onWheel={handleWheel}
            style={{
              position: 'relative',
              overflow: 'hidden',
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
              background: c.canvas,
              width: customSize ? customSize.w : large ? 'min(820px, calc(100vw - 80px))' : 'min(380px, calc(100vw - 40px))',
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

// ─── Slice B2: journey scene (videos connected to each other AND to outcomes) ──
// Renders journeyContext.graph (the existing JourneyGraph from buildJourneyGraph)
// as-is: one card per GraphNode, one arrow per GraphEdge, label = observedCount.
// New in B2: every connected group of videos is placed UNDER THE OUTCOME COLUMN
// its journeys end in, and the last video is connected up into that outcome node
// (Sales Call / Direct Purchase / Consultation / Newsletter) using `ends`.
//
// Layout is LOCAL and deliberately small (no shared/exported layout code):
//   1. split the graph into connected groups,
//   2. per group: drop DFS back-edges (loops), then longest-path layering so a
//      fan-in node sits ABOVE all of its sources,
//   3. result-oriented flow like the rest of this map: journey END at the top
//      (nearest the outcome row), journey START at the bottom, arrows point up,
//   4. groups are centered under the outcome column(s) they end in; groups with
//      no resolved outcome are packed to the right. Packing never overlaps.
// Outcome columns use their DEFAULT x (stable layout); the connectors read the
// LIVE `positions`, so dragging an outcome node drags its connectors with it.
const JG_NODE_W = 190
const JG_NODE_H = 56
const JG_GAP_X = 40
const JG_GAP_Y = 76
const JG_COMP_GAP = 70 // horizontal gap between separate connected groups
const JG_TOP = 1190 // canvas y of the top journey row (outcome row ends ~1109)
const JG_AFTER_GAP = 96 // gap between the journey area and the Phase 1 cards below it
const JG_FIRST_COL_LEFT = HUB_X - ((CAMPAIGN_PATHS.length - 1) / 2) * COLUMN_SPACING - OUTCOME_W / 2 // left edge of the first outcome node (labels)
const JG_MIN_LEFT = HUB_X - ((CAMPAIGN_PATHS.length - 1) / 2) * COLUMN_SPACING - JG_NODE_W / 2 // leftmost a card may start: a lone card still centers under column 0

interface JgNode {
  videoId: string
  layer: number
  x: number
  y: number
}
interface JgLocalLayout {
  nodes: JgNode[] // x/y relative to the group's own top-left
  backEdges: Set<string>
  width: number
  height: number
}
interface JgScene {
  nodes: JgNode[] // absolute canvas coordinates
  byId: Map<string, JgNode>
  backEdges: Set<string>
  bottom: number
}

/** Default x of an outcome node's center (what buildLayout() gives it). */
function defaultOutcomeX(outcomeId: string): number | null {
  const p = CAMPAIGN_PATHS.find((c) => c.outcomes[0].id === outcomeId)
  return p ? HUB_X + (p.column - (CAMPAIGN_PATHS.length - 1) / 2) * COLUMN_SPACING : null
}

/** Layered layout of ONE connected group. Top row (y = 0) = deepest layer = journey end. */
function layoutJourneyGroup(nodesIn: JourneyGraph['nodes'], edgesIn: JourneyGraph['edges']): JgLocalLayout {
  const ids = nodesIn.map((n) => n.videoId)
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  const hasIncoming = new Set<string>()
  for (const e of edgesIn) {
    if (e.fromVideoId === e.toVideoId) continue
    const list = out.get(e.fromVideoId)
    if (!list || !out.has(e.toVideoId)) continue
    if (!list.includes(e.toVideoId)) list.push(e.toVideoId)
    hasIncoming.add(e.toVideoId)
  }

  // 1. back edges (loops) via DFS, roots first
  const state = new Map<string, 1 | 2>()
  const backEdges = new Set<string>()
  const visit = (u: string) => {
    state.set(u, 1)
    for (const v of out.get(u) ?? []) {
      const s = state.get(v)
      if (s === 1) backEdges.add(`${u}::${v}`)
      else if (s === undefined) visit(v)
    }
    state.set(u, 2)
  }
  for (const id of ids) if (!hasIncoming.has(id)) visit(id)
  for (const id of ids) if (!state.has(id)) visit(id)

  // 2. longest-path layering on the remaining DAG (Kahn)
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const [u, vs] of out) {
    for (const v of vs) if (!backEdges.has(`${u}::${v}`)) indeg.set(v, (indeg.get(v) ?? 0) + 1)
  }
  const layer = new Map<string, number>(ids.map((id) => [id, 0]))
  const queue = ids.filter((id) => indeg.get(id) === 0)
  while (queue.length > 0) {
    const u = queue.shift() as string
    for (const v of out.get(u) ?? []) {
      if (backEdges.has(`${u}::${v}`)) continue
      layer.set(v, Math.max(layer.get(v) ?? 0, (layer.get(u) ?? 0) + 1))
      indeg.set(v, (indeg.get(v) ?? 1) - 1)
      if (indeg.get(v) === 0) queue.push(v)
    }
  }

  // 3. rows: deepest layer at the top (y = 0); each row centered
  const rows = new Map<number, string[]>()
  for (const id of ids) {
    const l = layer.get(id) ?? 0
    const row = rows.get(l)
    if (row) row.push(id)
    else rows.set(l, [id])
  }
  const maxLayer = Math.max(0, ...Array.from(rows.keys()))
  const maxCount = Math.max(1, ...Array.from(rows.values(), (r) => r.length))
  const width = maxCount * JG_NODE_W + (maxCount - 1) * JG_GAP_X
  const nodes: JgNode[] = []
  for (const [l, row] of rows) {
    const rowWidth = row.length * JG_NODE_W + (row.length - 1) * JG_GAP_X
    const x0 = (width - rowWidth) / 2
    row.forEach((videoId, i) => {
      nodes.push({ videoId, layer: l, x: x0 + i * (JG_NODE_W + JG_GAP_X), y: (maxLayer - l) * (JG_NODE_H + JG_GAP_Y) })
    })
  }
  return { nodes, backEdges, width, height: (maxLayer + 1) * JG_NODE_H + maxLayer * JG_GAP_Y }
}

// ═══════════════════════════════════════════════════════════════════════════
// Month / Part assignment — LAYOUT ONLY.
//
// Month = X-axis column, Part = vertical continuation inside that month.
// Pure function over the EXISTING JourneyGraph: it only READS graph.nodes /
// graph.edges and never creates, removes or changes a node, an edge or a
// canonical videoId. A Part boundary is NOT a graph relationship.
//
//   Flat  = connected component of 1 video (no video->video edge)
//   Chain = connected component of 2+ videos (real edges); NEVER split
// A Chain's month = month of its EARLIEST dated member (it stays together even
// if its videos span several calendar months). Components with no dated member
// go to a trailing 'undated' group so nothing is dropped.
// Parts are homogeneous: within a month, Flat Parts first, then Chain Parts.
// ═══════════════════════════════════════════════════════════════════════════
const MONTH_PART_INNER_W = (CAMPAIGN_PATHS.length - 1) * COLUMN_SPACING + OUTCOME_W // 958: width of the 4 outcome columns
export const FLAT_CARD_W = 220 // PROVISIONAL (thumbnail-on baseline) — tune freely
export const FLAT_CARD_H = 170 // PROVISIONAL — not used by assignMonthParts, reserved for the layout patch
export const FLAT_CARD_GAP = 24
export const FLAT_COLUMNS = Math.max(1, Math.floor((MONTH_PART_INNER_W + FLAT_CARD_GAP) / (FLAT_CARD_W + FLAT_CARD_GAP))) // 4
export const FLAT_ROWS_PER_PART = 5
export const FLAT_PART_CAPACITY = FLAT_COLUMNS * FLAT_ROWS_PER_PART // 20 (tunable, not a product rule)
export const CHAIN_PART_CAPACITY = 12 // counted in nodes; a starting guideline, not a hard limit

export type MonthPartKind = 'flat' | 'chain'

/** UTC year / 0-based month, same rule as the month chips (CampaignStructureMap). */
export interface VideoMonthInfo {
  year: number
  month: number
  createdAtMs: number
}

export interface MonthPart {
  partIndex: number // 0-based inside its month; Flat and Chain Parts share one running index
  kind: MonthPartKind
  videoIds: string[] // canonical videoIds only
}

export interface MonthPartGroup {
  monthKey: string // `${year}_${month}`, or 'undated'
  year: number | null
  month: number | null
  partCount: number
  segmented: boolean // partCount > 1 (later: orange vs purple)
  parts: MonthPart[]
}

export interface MonthPartResult {
  groups: MonthPartGroup[] // ascending in time, 'undated' last
  partByVideoId: Map<string, { monthKey: string; partIndex: number; kind: MonthPartKind }>
}

export interface MonthPartOptions {
  flatCapacity?: number
  chainCapacity?: number
}

const UNDATED_MONTH_KEY = 'undated'
const monthKeyOf = (year: number, month: number) => `${year}_${month}`
const cmpId = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)

export function assignMonthParts(
  graph: JourneyGraph,
  monthInfoByVideoId: Map<string, VideoMonthInfo>,
  options?: MonthPartOptions,
): MonthPartResult {
  const flatCapacity = Math.max(1, options?.flatCapacity ?? FLAT_PART_CAPACITY)
  const chainCapacity = Math.max(1, options?.chainCapacity ?? CHAIN_PART_CAPACITY)

  // 1. Unique node ids (read-only over graph.nodes).
  const ids: string[] = []
  const idSet = new Set<string>()
  for (const n of graph.nodes) {
    if (idSet.has(n.videoId)) continue
    idSet.add(n.videoId)
    ids.push(n.videoId)
  }

  // 2. Connected components — same edge rule as layoutJourneyScene:
  //    both endpoints must be graph nodes, self-loops ignored.
  const parent = new Map<string, string>()
  for (const id of ids) parent.set(id, id)
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root) as string
    let cur = x
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  for (const e of graph.edges) {
    if (e.fromVideoId === e.toVideoId) continue
    if (!idSet.has(e.fromVideoId) || !idSet.has(e.toVideoId)) continue
    const a = find(e.fromVideoId)
    const b = find(e.toVideoId)
    if (a !== b) parent.set(a, b)
  }
  const members = new Map<string, string[]>()
  for (const id of ids) {
    const root = find(id)
    const list = members.get(root)
    if (list) list.push(id)
    else members.set(root, [id])
  }

  // 3. Classify each component and pick its month bucket.
  const msOf = (id: string) => monthInfoByVideoId.get(id)?.createdAtMs ?? Infinity
  interface Comp {
    ids: string[]
    kind: MonthPartKind
    monthKey: string
    year: number | null
    month: number | null
    anchorMs: number
  }
  const comps: Comp[] = []
  members.forEach((list) => {
    const sorted = list.slice().sort((x, y) => {
      const ax = msOf(x)
      const ay = msOf(y)
      if (ax !== ay) return ax < ay ? -1 : 1
      return cmpId(x, y)
    })
    let earliest: VideoMonthInfo | null = null
    for (const id of sorted) {
      const info = monthInfoByVideoId.get(id)
      if (info && (earliest === null || info.createdAtMs < earliest.createdAtMs)) earliest = info
    }
    comps.push({
      ids: sorted,
      kind: sorted.length > 1 ? 'chain' : 'flat',
      monthKey: earliest ? monthKeyOf(earliest.year, earliest.month) : UNDATED_MONTH_KEY,
      year: earliest ? earliest.year : null,
      month: earliest ? earliest.month : null,
      anchorMs: earliest ? earliest.createdAtMs : 0,
    })
  })

  const byMonth = new Map<string, Comp[]>()
  for (const c of comps) {
    const list = byMonth.get(c.monthKey)
    if (list) list.push(c)
    else byMonth.set(c.monthKey, [c])
  }

  // 4. Per month: balanced Flat Parts first, then Chain Parts (components atomic).
  const newestFirst = (a: Comp, b: Comp) =>
    a.anchorMs !== b.anchorMs ? b.anchorMs - a.anchorMs : cmpId(a.ids[0], b.ids[0])

  const groups: MonthPartGroup[] = []
  byMonth.forEach((monthComps, monthKey) => {
    const parts: MonthPart[] = []

    const flatIds = monthComps
      .filter((c) => c.kind === 'flat')
      .sort(newestFirst)
      .map((c) => c.ids[0])
    if (flatIds.length > 0) {
      const partCount = Math.ceil(flatIds.length / flatCapacity)
      const base = Math.floor(flatIds.length / partCount)
      const extra = flatIds.length % partCount
      let cursor = 0
      for (let p = 0; p < partCount; p++) {
        const size = base + (p < extra ? 1 : 0)
        parts.push({ partIndex: parts.length, kind: 'flat', videoIds: flatIds.slice(cursor, cursor + size) })
        cursor += size
      }
    }

    let current: string[] = []
    const flushChain = () => {
      if (current.length === 0) return
      parts.push({ partIndex: parts.length, kind: 'chain', videoIds: current })
      current = []
    }
    for (const c of monthComps.filter((x) => x.kind === 'chain').sort(newestFirst)) {
      if (current.length > 0 && current.length + c.ids.length > chainCapacity) flushChain()
      current.push(...c.ids) // a component is never split, even if it alone exceeds chainCapacity
    }
    flushChain()

    groups.push({
      monthKey,
      year: monthComps[0].year,
      month: monthComps[0].month,
      partCount: parts.length,
      segmented: parts.length > 1,
      parts,
    })
  })

  groups.sort((a, b) => {
    if (a.year === null || a.month === null) return b.year === null ? 0 : 1
    if (b.year === null || b.month === null) return -1
    return a.year * 12 + a.month - (b.year * 12 + b.month)
  })

  // 5. Lookup + invariant: every canonical videoId is assigned exactly once.
  const partByVideoId = new Map<string, { monthKey: string; partIndex: number; kind: MonthPartKind }>()
  let assigned = 0
  for (const g of groups) {
    for (const p of g.parts) {
      for (const id of p.videoIds) {
        if (partByVideoId.has(id)) console.warn('[assignMonthParts] videoId assigned twice:', id)
        partByVideoId.set(id, { monthKey: g.monthKey, partIndex: p.partIndex, kind: p.kind })
        assigned += 1
      }
    }
  }
  if (assigned !== ids.length || partByVideoId.size !== ids.length) {
    console.warn('[assignMonthParts] assignment mismatch', { nodes: ids.length, assigned, unique: partByVideoId.size })
  }

  return { groups, partByVideoId }
}

/** Whole scene: connected groups placed under the outcome column they end in. */
function layoutJourneyScene(graph: JourneyGraph, ends: JourneyEnd[], outcomeX?: Map<string, number>): JgScene {
  // connected groups (undirected)
  const parent = new Map<string, string>(graph.nodes.map((n) => [n.videoId, n.videoId]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as string
    return r
  }
  for (const e of graph.edges) {
    if (parent.has(e.fromVideoId) && parent.has(e.toVideoId)) parent.set(find(e.fromVideoId), find(e.toVideoId))
  }
  const groups = new Map<string, { nodes: JourneyGraph['nodes']; edges: JourneyGraph['edges'] }>()
  for (const n of graph.nodes) {
    const r = find(n.videoId)
    const g = groups.get(r)
    if (g) g.nodes.push(n)
    else groups.set(r, { nodes: [n], edges: [] })
  }
  for (const e of graph.edges) {
    if (!parent.has(e.fromVideoId) || !parent.has(e.toVideoId)) continue
    groups.get(find(e.fromVideoId))?.edges.push(e)
  }

  const endsByVideo = new Map<string, JourneyEnd[]>()
  for (const e of ends) {
    const list = endsByVideo.get(e.videoId)
    if (list) list.push(e)
    else endsByVideo.set(e.videoId, [e])
  }

  const comps = Array.from(groups.values()).map((g) => {
    const local = layoutJourneyGroup(g.nodes, g.edges)
    const xs: number[] = []
    for (const n of g.nodes) {
      for (const e of endsByVideo.get(n.videoId) ?? []) {
        const x = outcomeX?.get(e.outcomeId) ?? defaultOutcomeX(e.outcomeId)
        if (x !== null) xs.push(x)
      }
    }
    return { local, desired: xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null }
  })

  // attached groups left-to-right by the column they end in, then the rest
  const ordered = [
    ...comps.filter((c) => c.desired !== null).sort((a, b) => (a.desired as number) - (b.desired as number)),
    ...comps.filter((c) => c.desired === null),
  ]
  const nodes: JgNode[] = []
  const backEdges = new Set<string>()
  let cursor = JG_MIN_LEFT - JG_COMP_GAP
  let bottom = JG_TOP
  for (const c of ordered) {
    const want = c.desired === null ? -Infinity : c.desired - c.local.width / 2
    const left = Math.max(cursor + JG_COMP_GAP, want)
    for (const n of c.local.nodes) nodes.push({ ...n, x: left + n.x, y: JG_TOP + n.y })
    c.local.backEdges.forEach((k) => backEdges.add(k))
    cursor = left + c.local.width
    bottom = Math.max(bottom, JG_TOP + c.local.height)
  }
  return { nodes, byId: new Map(nodes.map((n) => [n.videoId, n])), backEdges, bottom }
}

/** Vertical S-curve p0 -> p1 (works upward or downward) + its midpoint (for the count pill). */
function jgCurve(p0: Pt, p1: Pt): { d: string; mid: Pt } {
  const dy = (p1.y - p0.y) / 2
  const c1 = { x: p0.x, y: p0.y + dy }
  const c2 = { x: p1.x, y: p1.y - dy }
  return {
    d: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p1.x} ${p1.y}`,
    mid: { x: (p0.x + 3 * c1.x + 3 * c2.x + p1.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p1.y) / 8 },
  }
}

/** Video -> video connector geometry. */
function jgEdgeGeometry(a: JgNode, b: JgNode): { d: string; mid: Pt } {
  const acx = a.x + JG_NODE_W / 2
  const bcx = b.x + JG_NODE_W / 2
  if (b.y < a.y) return jgCurve({ x: acx, y: a.y }, { x: bcx, y: b.y + JG_NODE_H }) // normal: up
  if (b.y > a.y) return jgCurve({ x: acx, y: a.y + JG_NODE_H }, { x: bcx, y: b.y }) // loop / back edge: down
  // same row: side to side
  const right = bcx > acx
  const p0 = { x: right ? a.x + JG_NODE_W : a.x, y: a.y + JG_NODE_H / 2 }
  const p1 = { x: right ? b.x : b.x + JG_NODE_W, y: b.y + JG_NODE_H / 2 }
  const dx = (p1.x - p0.x) / 2
  const c1 = { x: p0.x + dx, y: p0.y }
  const c2 = { x: p1.x - dx, y: p1.y }
  return {
    d: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p1.x} ${p1.y}`,
    mid: { x: (p0.x + 3 * c1.x + 3 * c2.x + p1.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p1.y) / 8 },
  }
}

// ─── Contextual (foreign) campaign hubs + legacy node ───────────────────────
// Situation B: a selected video promotes ANOTHER campaign's Campaign Element Asset.
// Read-only: no switcher, not draggable, not part of `positions`. Only the branches
// actually reached are drawn. Node ids are namespaced (ctx:<campaignId>:<outcomeId>).
const CTX_GAP = 140

interface CtxHubLayout {
  campaignId: string
  hub: Pt
  nodes: PositionedNode[]
  connections: { fromId: string; toId: string; color: string; pathId: string }[]
}

function buildContextLayouts(foreign: ForeignCampaign[], showLegacy: boolean) {
  const layouts: CtxHubLayout[] = []
  const positions: Record<string, Pt> = {}
  const outcomeX = new Map<string, number>()
  let left = HUB_X + ((CAMPAIGN_PATHS.length - 1) / 2) * COLUMN_SPACING + OUTCOME_W / 2 + CTX_GAP
  for (const f of foreign) {
    const paths = CAMPAIGN_PATHS.filter((p) => f.outcomeBases.includes(p.outcomes[0].id))
    if (paths.length === 0) continue
    const n = paths.length
    const hubX = left + OUTCOME_W / 2 + ((n - 1) / 2) * COLUMN_SPACING
    const layout: CtxHubLayout = { campaignId: f.campaignId, hub: { x: hubX, y: HUB_Y }, nodes: [], connections: [] }
    paths.forEach((path, i) => {
      const colX = hubX + (i - (n - 1) / 2) * COLUMN_SPACING
      const rootId = ctxOutcomeId(f.campaignId, path.root.id)
      const outId = ctxOutcomeId(f.campaignId, path.outcomes[0].id)
      const rootCenter = { x: colX, y: HUB_Y + ROOT_DIST }
      const outCenter = { x: colX, y: HUB_Y + OUTCOME_DIST }
      layout.nodes.push(
        { id: rootId, label: path.root.label, center: rootCenter, w: ROOT_W, h: ROOT_H, kind: 'root', pathId: path.id, color: path.color },
        { id: outId, label: path.outcomes[0].label, center: outCenter, w: OUTCOME_W, h: OUTCOME_H, kind: 'outcome', pathId: path.id, color: path.color },
      )
      layout.connections.push(
        { fromId: 'hub', toId: rootId, color: path.color, pathId: path.id },
        { fromId: rootId, toId: outId, color: path.color, pathId: path.id },
      )
      positions[rootId] = rootCenter
      positions[outId] = outCenter
      outcomeX.set(outId, colX)
    })
    layouts.push(layout)
    left = hubX + ((n - 1) / 2) * COLUMN_SPACING + OUTCOME_W / 2 + CTX_GAP
  }
  if (showLegacy) {
    positions[LEGACY_OUTCOME_ID] = {
      x: HUB_X - ((CAMPAIGN_PATHS.length - 1) / 2) * COLUMN_SPACING - COLUMN_SPACING,
      y: HUB_Y + OUTCOME_DIST,
    }
  }
  return { layouts, positions, outcomeX }
}

function ContextCampaignLayer({
  presentation,
  layouts,
  names,
  legacyPos,
}: {
  presentation: 'campaign' | 'tree'
  layouts: CtxHubLayout[]
  names: Record<string, string>
  legacyPos: Pt | null
}) {
  if (layouts.length === 0 && !legacyPos) return null
  const dark = presentation === 'tree'
  return (
    <>
      <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
        {layouts.map((L) => {
          const byId = new Map(L.nodes.map((n) => [n.id, n]))
          return L.connections.map((c, i) => {
            const toNode = byId.get(c.toId)
            const fromNode = c.fromId === 'hub' ? null : byId.get(c.fromId)
            if (!toNode) return null
            const fromCenter = fromNode ? fromNode.center : L.hub
            const from = fromNode ? rectAnchor(fromNode.center, fromNode.w, fromNode.h, toNode.center) : circleAnchor(L.hub, HUB_R, toNode.center)
            const to = rectAnchor(toNode.center, toNode.w, toNode.h, fromCenter)
            return <path key={`${L.campaignId}:${i}`} d={curvePath(from, to)} fill="none" stroke={c.color} strokeWidth={2} strokeOpacity={0.55} />
          })
        })}
      </svg>
      {layouts.map((L) => (
        <React.Fragment key={L.campaignId}>
          <div
            title="Promoted campaign (contextual — not switchable)"
            style={{ ...styles.hub, left: L.hub.x - HUB_R, top: L.hub.y - HUB_R, width: HUB_R * 2, height: HUB_R * 2 }}
          >
            <span style={styles.hubEyebrow}>Promoted campaign</span>
            <span style={styles.hubTitle}>{names[L.campaignId] ?? 'Loading…'}</span>
          </div>
          {L.nodes.map((node) => {
            const isRoot = node.kind === 'root'
            return (
              <div
                key={node.id}
                style={{
                  ...(isRoot ? styles.rootNode : styles.outcomeNode),
                  left: node.center.x - node.w / 2,
                  top: node.center.y - node.h / 2,
                  width: node.w,
                  height: node.h,
                  borderColor: isRoot ? node.color : `${node.color}66`,
                  ...(dark ? { background: isRoot ? TREE_DARK.cardBg : TREE_DARK.cardBgAlt } : {}),
                }}
              >
                <span style={{ ...styles.nodeDot, background: node.color }} />
                <div style={styles.nodeTextCol}>
                  <span style={{ ...(isRoot ? styles.nodeLabelRoot : styles.nodeLabelOutcome), ...(dark ? { color: TREE_DARK.textPrimary } : {}) }}>
                    {node.label}
                  </span>
                  <span style={{ ...styles.nodeKind, color: node.color }}>{isRoot ? 'Entry content' : 'Outcome'}</span>
                </div>
              </div>
            )
          })}
        </React.Fragment>
      ))}
      {legacyPos && (
        <div
          title="Redirect links whose destination no longer matches a current campaign field"
          style={{
            ...styles.outcomeNode,
            left: legacyPos.x - OUTCOME_W / 2,
            top: legacyPos.y - OUTCOME_H / 2,
            width: OUTCOME_W,
            height: OUTCOME_H,
            borderColor: '#9ca3af88',
            ...(dark ? { background: TREE_DARK.cardBgAlt } : {}),
          }}
        >
          <span style={{ ...styles.nodeDot, background: '#9ca3af' }} />
          <div style={styles.nodeTextCol}>
            <span style={{ ...styles.nodeLabelOutcome, ...(dark ? { color: TREE_DARK.textPrimary } : {}) }}>Outdated links</span>
            <span style={{ ...styles.nodeKind, color: '#9ca3af' }}>Legacy</span>
          </div>
        </div>
      )}
    </>
  )
}

/** Draws journeyContext.graph + the journey -> outcome connectors in canvas
 *  coordinates. Not draggable, not part of `positions` (it only READS them). Simple
 *  styling on purpose — Slice C adds category / highlight treatment. */
function JourneyGraphLayer({
  presentation,
  context,
  scene,
  titles,
  entryIds,
  positions,
  onClear,
  highlights,
}: {
  presentation: 'campaign' | 'tree'
  context: JourneyContext
  scene: JgScene | null
  titles: Record<string, string>
  entryIds: string[]
  positions: Record<string, Pt>
  onClear: () => void
  /** videoId -> chips that contain it. Empty = nothing highlighted, nothing dimmed. */
  highlights: Map<string, NodeHighlight>
}) {
  if (context.status === 'idle' && !context.graph) return null

  const dark = presentation === 'tree'
  const edgeColor = dark ? '#525252' : '#94a3b8'
  const pillBg = dark ? TREE_DARK.cardBg : '#ffffff'
  const pillBorder = dark ? TREE_DARK.border : '#e5e7eb'
  const pillText = dark ? TREE_DARK.textSecondary : '#6b7280'
  const entry = new Set(entryIds)
  const graph = context.graph
  const dimming = highlights.size > 0
  const FADE = 0.25

  let statusText: string
  if (context.status === 'error') statusText = `Journey error: ${context.error ?? 'unknown'}`
  else if (!graph) statusText = 'Discovering journeys…'
  else if (graph.nodes.length === 0) statusText = 'No observed journey or structural link for the selected videos'
  else {
    const structuralCount = context.structuralEnds.filter((e) => e.outcomeId !== LEGACY_OUTCOME_ID).length
    statusText =
      (context.journeyCount > 0
        ? `Observed journey · ${context.journeyCount} journey${context.journeyCount === 1 ? '' : 's'} · `
        : 'Structural journey · ') +
      `${graph.nodes.length} video${graph.nodes.length === 1 ? '' : 's'}` +
      (structuralCount > 0 ? ` · ${structuralCount} structural link${structuralCount === 1 ? '' : 's'}` : '') +
      (context.legacyCount > 0 ? ` · ${context.legacyCount} outdated link${context.legacyCount === 1 ? '' : 's'}` : '') +
      (context.endsStatus === 'pending' ? ' · finding outcomes…' : '') +
      (context.endsStatus === 'failed' ? ' · outcome lookup failed' : '') +
      (context.endsStatus === 'ready' && context.ends.length > 0 ? ` · ${context.ends.length} outcome link${context.ends.length === 1 ? '' : 's'}` : '') +
      (context.endsUnmapped > 0 ? ` · ${context.endsUnmapped} end${context.endsUnmapped === 1 ? '' : 's'} with no outcome node` : '') +
      (context.truncated ? ' · truncated (newest 50 journeys)' : '') +
      (context.status === 'loading' ? ' · updating…' : '')
  }

  const outcomeColor = (outcomeId: string) =>
    CAMPAIGN_PATHS.find((c) => c.outcomes[0].id === baseOutcomeId(outcomeId))?.color ?? edgeColor
  const arrowId = (outcomeId: string) => {
    const base = baseOutcomeId(outcomeId)
    return CAMPAIGN_PATHS.some((c) => c.outcomes[0].id === base) ? `jgArrow-${base}` : 'jgArrow'
  }

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: JG_FIRST_COL_LEFT,
          top: JG_TOP - 34,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          whiteSpace: 'nowrap',
          fontSize: 12,
          fontWeight: 700,
          color: dark ? TREE_DARK.textSecondary : '#6b7280',
        }}
      >
        <span>{statusText}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClear}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 999,
            cursor: 'pointer',
            border: `1px solid ${pillBorder}`,
            background: pillBg,
            color: dark ? TREE_DARK.textSecondary : '#374151',
          }}
        >
          Clear
        </button>
      </div>

      {graph && scene && (
        <>
          <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              <marker id="jgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeColor} />
              </marker>
              {CAMPAIGN_PATHS.map((p) => (
                <marker
                  key={p.outcomes[0].id}
                  id={`jgArrow-${p.outcomes[0].id}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={p.color} />
                </marker>
              ))}
            </defs>

            {/* video -> video: one arrow per GraphEdge, label = observedCount */}
            {graph.edges.map((e) => {
              const a = scene.byId.get(e.fromVideoId)
              const b = scene.byId.get(e.toVideoId)
              if (!a || !b || a === b) return null
              const { d, mid } = jgEdgeGeometry(a, b)
              const isBack = scene.backEdges.has(`${e.fromVideoId}::${e.toVideoId}`)
              const label = `×${e.observedCount}`
              const pillW = 14 + label.length * 6.5
              const faded = dimming && !(highlights.has(e.fromVideoId) && highlights.has(e.toVideoId))
              return (
                <g
                  key={`${e.fromVideoId}::${e.toVideoId}`}
                  style={{ opacity: faded ? FADE : 1, transition: 'opacity 150ms ease' }}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth={1.25 + Math.min(3.5, Math.log2(Math.max(1, e.observedCount)) * 0.7)}
                    strokeDasharray={isBack ? '5 4' : undefined}
                    markerEnd="url(#jgArrow)"
                  />
                  <rect x={mid.x - pillW / 2} y={mid.y - 9} width={pillW} height={18} rx={9} fill={pillBg} stroke={pillBorder} />
                  <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={pillText}>
                    {label}
                  </text>
                </g>
              )
            })}

            {/* last video -> outcome node (reads LIVE node positions, so dragging follows) */}
            {context.ends.map((en) => {
              const v = scene.byId.get(en.videoId)
              const o = positions[en.outcomeId]
              if (!v || !o) return null
              const color = outcomeColor(en.outcomeId)
              const { d, mid } = jgCurve({ x: v.x + JG_NODE_W / 2, y: v.y }, { x: o.x, y: o.y + OUTCOME_H / 2 })
              const label = `×${en.count}`
              const pillW = 14 + label.length * 6.5
              const faded = dimming && !highlights.has(en.videoId)
              return (
                <g
                  key={`end:${en.videoId}::${en.outcomeId}`}
                  style={{ opacity: faded ? FADE : 1, transition: 'opacity 150ms ease' }}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={en.structural ? 1.4 : 1.25 + Math.min(3.5, Math.log2(Math.max(1, en.count)) * 0.7)}
                    strokeDasharray={en.structural ? '6 4' : undefined}
                    strokeOpacity={en.structural ? 0.8 : 1}
                    markerEnd={`url(#${arrowId(en.outcomeId)})`}
                  />
                  {!en.structural && (
                    <>
                      <rect x={mid.x - pillW / 2} y={mid.y - 9} width={pillW} height={18} rx={9} fill={pillBg} stroke={color} />
                      <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={color}>
                        {label}
                      </text>
                    </>
                  )}
                </g>
              )
            })}
          </svg>

          {scene.nodes.map((n) => {
            const isEntry = entry.has(n.videoId)
            const title = titles[n.videoId] ?? `Video ${n.videoId.slice(0, 8)}…`
            const hl = highlights.get(n.videoId)
            const dim = dimming && !hl
            return (
              <div
                key={n.videoId}
                title={`${title}\n${n.videoId}${hl ? `\nSelected via: ${hl.labels.join(', ')}` : ''}`}
                style={{
                  position: 'absolute',
                  left: n.x,
                  top: n.y,
                  width: JG_NODE_W,
                  height: JG_NODE_H,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 2,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: `${isEntry ? 2 : 1.5}px solid ${isEntry ? (dark ? '#818cf8' : '#6366f1') : dark ? TREE_DARK.border : '#e5e7eb'}`,
                  background: dark ? TREE_DARK.cardBgAlt : '#ffffff',
                  boxShadow: hl
                    ? hl.colors.map((c) => `0 0 10px ${c}66`).join(', ')
                    : dark
                    ? 'none'
                    : '0 2px 6px rgba(15,23,42,0.04)',
                  opacity: dim ? 0.4 : 1,
                  transition: 'opacity 150ms ease, box-shadow 150ms ease',
                }}
              >
                {hl && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      borderRadius: '8px 0 0 8px',
                    }}
                  >
                    {hl.colors.map((c) => (
                      <div key={c} style={{ flex: 1, background: c }} />
                    ))}
                  </div>
                )}
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
                  {title}
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: isEntry ? (dark ? '#818cf8' : '#6366f1') : dark ? TREE_DARK.textFaint : '#9ca3af',
                  }}
                >
                  {isEntry ? 'Entry' : 'In journey'}
                </span>
              </div>
            )
          })}
        </>
      )}
    </>
  )
}


/** Phase 1 selected-item cards. Rendered inside the transformed canvas layer
 *  (canvas coordinates) and deliberately NOT part of `positions`/drag. */
function SelectedItemsLayer({
  presentation,
  label,
  items,
  showThumbnails,
  top,
  connectedCount,
}: {
  presentation: 'campaign' | 'tree'
  label: string | null
  items: PanelItem[]
  showThumbnails: boolean
  /** canvas y of the first card row (moves down when a journey is drawn above) */
  top: number
  /** selected items already drawn as nodes in the journey above */
  connectedCount: number
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
          top: top - 34,
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          color: dark ? TREE_DARK.textSecondary : '#6b7280',
        }}
      >
        {label} · {items.length + connectedCount} item{items.length + connectedCount === 1 ? '' : 's'}
        {connectedCount > 0 ? ` · ${connectedCount} connected in the journey above` : ''}
        {items.length > shown.length ? ` (showing first ${shown.length})` : ''}
      </div>
      {shown.map((it, i) => (
        <div
          key={it.id}
          title={it.label}
          style={{
            position: 'absolute',
            left: left0 + (i % ITEMS_COLS) * ITEMS_COL_SPACING,
            top: top + Math.floor(i / ITEMS_COLS) * ITEMS_ROW_SPACING,
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
const campaignIdRef = useRef<string | undefined>(campaignId)
campaignIdRef.current = campaignId
// Bumped whenever the cache above gains entries, so memos that read it recompute.
const [assetCacheVersion, setAssetCacheVersion] = useState(0)

const clearJourneyContext = useCallback(() => {
  setJourneyEntryVideoIds((prev) => (prev.length ? [] : prev))
  setJourneyContext(EMPTY_JOURNEY_CONTEXT)
}, [])

useEffect(() => {
  clearJourneyContext()
  assetVideoCacheRef.current = new Map()
  setAssetCacheVersion((v) => v + 1)
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
        if (!cancelled) setAssetCacheVersion((v) => v + 1)
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
      // Observed journeys + structural redirect_links, resolved together so a selected
      // video never flashes as an isolated card. Structural failure degrades to observed-only.
      const [result, structuralLinks] = await Promise.all([
        discoverJourneysForVideos(journeyEntryVideoIds),
        resolveStructuralLinksForVideos(journeyEntryVideoIds).catch((e) => {
          console.warn('[CJM journey] structural link resolution failed', e)
          return [] as StructuralLink[]
        }),
      ])

      if (cancelled) return

      const graph = buildJourneyGraph(result.journeys)
      const structural = buildStructuralEnds(structuralLinks, campaignIdRef.current)
      // One canonical node per video: a structural-only video becomes a (possibly edgeless)
      // graph node; videos already in the observed graph are never added twice.
      const inGraph = new Set(graph.nodes.map((n) => n.videoId))
      structural.videoIds.forEach((v) => {
        if (!inGraph.has(v)) graph.nodes.push({ videoId: v, observedAssetIds: [], observedRedirectLinkIds: [] })
      })

      setJourneyContext({
        status: 'ready',
        graph,
        journeyCount: result.journeys.length,
        excludedJourneys: result.excludedJourneys,
        truncated: result.truncated,
        coverage: result.journeyCountByVideoId,
        ends: [],
        structuralEnds: structural.ends,
        foreign: structural.foreign,
        legacyCount: structural.legacyCount,
        endsStatus: 'pending',
        endsUnmapped: 0,
        error: null,
      })

      // Phase 2 of loading (graph is already drawn): where do these journeys END?
      try {
        const { ends, unmapped } = await resolveJourneyEnds(result.journeys)
        if (cancelled) return
        setJourneyContext((c) => ({ ...c, ends, endsStatus: 'ready', endsUnmapped: unmapped }))
      } catch (endErr) {
        console.warn('[CJM journey] resolving journey ends failed', endErr)
        if (!cancelled) setJourneyContext((c) => ({ ...c, endsStatus: 'failed' }))
      }
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
  console.log('ends (last video -> outcome):', journeyContext.endsStatus, journeyContext.ends, 'unmapped:', journeyContext.endsUnmapped)
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

// ── Slice B: display titles for graph nodes (metadata lookup only) ───────
const [journeyTitles, setJourneyTitles] = useState<Record<string, string>>({})

useEffect(() => {
  const g = journeyContext.graph
  if (!g || g.nodes.length === 0) return

  const ids = g.nodes.map((n) => n.videoId)
  let cancelled = false

  ;(async () => {
    const found: Record<string, string> = {}

    for (let i = 0; i < ids.length; i += 80) {
      const { data, error } = await supabase
        .from('videos')
        .select('id, video_title')
        .in('id', ids.slice(i, i + 80))

      if (error) {
        console.warn(
          '[CJM journey] title lookup failed',
          error.message,
        )
        continue
      }

      for (const v of (data ?? []) as {
        id: string
        video_title: string | null
      }[]) {
        if (v.video_title) {
          found[v.id] = v.video_title
        }
      }
    }

    if (!cancelled) {
      setJourneyTitles((prev) => ({
        ...prev,
        ...found,
      }))
    }
  })()

  return () => {
    cancelled = true
  }
}, [journeyContext.graph])

  // ── Month/Part Patch 2: videoId -> visual month (layout INPUT only, nothing is drawn yet) ──
  // Visual month = Content `videos.created_at` first; only when the video is not a
  // Content video, fall back to its Own Asset's `assets.created_at`.
  // UTC year / 0-based month = same rule as the month chips. Chip membership is untouched.
  const monthInfoByVideoId = useMemo(() => {
    const out = new Map<string, VideoMonthInfo>()
    const toInfo = (iso: string | null | undefined): VideoMonthInfo | null => {
      if (!iso) return null
      const ms = Date.parse(iso)
      if (Number.isNaN(ms)) return null
      const d = new Date(ms)
      return { year: d.getUTCFullYear(), month: d.getUTCMonth(), createdAtMs: ms }
    }
    for (const v of contentData.contentVideos ?? []) {
      const info = toInfo(v.createdAt)
      if (info) out.set(v.id, info)
    }
    const cache = assetVideoCacheRef.current
    for (const a of structureData.ownAssetNodes ?? []) {
      const info = toInfo(a.createdAt)
      if (!info || !a.id.startsWith('own_asset_')) continue
      for (const videoId of cache.get(a.id.slice('own_asset_'.length)) ?? []) {
        if (!out.has(videoId)) out.set(videoId, info) // Content date wins
      }
    }
    return out
    // assetCacheVersion: the asset->video cache is a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentData.contentVideos, structureData.ownAssetNodes, assetCacheVersion])

  // ── TEMPORARY DEBUG (Month/Part Patch 2) — remove when the layout patch lands ──
  useEffect(() => {
    const g = journeyContext.graph
    if (!g || g.nodes.length === 0) return
    const res = assignMonthParts(g, monthInfoByVideoId)
    console.groupCollapsed(`[CJM month/part] ${g.nodes.length} node(s) -> ${res.groups.length} month group(s)`)
    for (const grp of res.groups) {
      const label =
        grp.year !== null && grp.month !== null
          ? `${grp.year}-${String(grp.month + 1).padStart(2, '0')}`
          : 'undated'
      console.log(
        `${label}  parts=${grp.partCount}  ${grp.segmented ? 'SEGMENTED (orange)' : 'single (purple)'}`,
        grp.parts.map((p) => `#${p.partIndex + 1} ${p.kind} x${p.videoIds.length}`),
      )
    }
    const undated = res.groups.find((x) => x.monthKey === 'undated')
    console.log('undated videoIds:', undated ? undated.parts.flatMap((p) => p.videoIds) : [])
    console.log('assigned:', res.partByVideoId.size, 'of', g.nodes.length)
    console.groupEnd()
  }, [journeyContext.graph, monthInfoByVideoId])

  // ── Slice B2: one scene — journey videos sit under the outcome they END in ──
  // Observed ends + structural ends (an observed end for the same video/outcome wins).
  const allEnds = useMemo(() => {
    const seen = new Set(journeyContext.ends.map((e) => `${e.videoId}::${e.outcomeId}`))
    return [...journeyContext.ends, ...journeyContext.structuralEnds.filter((e) => !seen.has(`${e.videoId}::${e.outcomeId}`))]
  }, [journeyContext.ends, journeyContext.structuralEnds])

  // Contextual (foreign) campaigns: names are display-only; RLS may hide another owner's campaign row.
  const [foreignNames, setForeignNames] = useState<Record<string, string>>({})
  useEffect(() => {
    const ids = journeyContext.foreign.map((f) => f.campaignId).filter((id) => !(id in foreignNames))
    if (ids.length === 0) return
    let cancelled = false
    supabase
      .from('campaigns')
      .select('id, campaign_name')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled) return
        const found = new Map((data ?? []).map((c: { id: string; campaign_name: string | null }) => [c.id, c.campaign_name]))
        setForeignNames((prev) => {
          const next = { ...prev }
          for (const id of ids) next[id] = found.get(id) || 'Promoted campaign'
          return next
        })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyContext.foreign])

  const hasLegacyEnds = journeyContext.structuralEnds.some((e) => e.outcomeId === LEGACY_OUTCOME_ID)
  const ctx = useMemo(() => buildContextLayouts(journeyContext.foreign, hasLegacyEnds), [journeyContext.foreign, hasLegacyEnds])
  const layerContext = useMemo(() => ({ ...journeyContext, ends: allEnds }), [journeyContext, allEnds])

  const journeyScene = useMemo(
    () => (journeyContext.graph ? layoutJourneyScene(journeyContext.graph, allEnds, ctx.outcomeX) : null),
    [journeyContext.graph, allEnds, ctx.outcomeX],
  )
  // Phase 1 cards for videos that are now nodes of the journey are not drawn twice;
  // selected videos with no observed journey stay as plain cards below it.
  const { looseItems, connectedItemCount } = useMemo(() => {
    // placedVideoIds: every video that is a canonical node of the final graph
    // (observed + upstream/downstream + structural + videos behind contextual campaigns).
    const placedVideoIds = new Set((journeyContext.graph?.nodes ?? []).map((n) => n.videoId))
    if (placedVideoIds.size === 0) return { looseItems: selectedItems, connectedItemCount: 0 }
    const cache = assetVideoCacheRef.current
    // Any item id -> the video ids behind it (not just the content_video_/own_asset_ prefixes).
    const videoIdsOf = (it: PanelItem): string[] => {
      if (it.id.startsWith('content_video_')) return [it.id.slice('content_video_'.length)]
      if (it.id.startsWith('own_asset_')) return cache.get(it.id.slice('own_asset_'.length)) ?? []
      const tail = it.id.match(UUID_TAIL)?.[1]
      if (!tail) return []
      if (it.kind === 'video') return [tail]
      if (it.kind === 'asset') return cache.get(tail) ?? []
      return []
    }
    const loose = selectedItems.filter((it) => !videoIdsOf(it).some((v) => placedVideoIds.has(v)))
    return { looseItems: loose, connectedItemCount: selectedItems.length - loose.length }
    // assetCacheVersion: the asset->video cache is a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems, journeyContext.graph, assetCacheVersion])
  const itemsTop =
    journeyScene && journeyScene.nodes.length > 0 ? Math.max(ITEMS_TOP, journeyScene.bottom + JG_AFTER_GAP) : ITEMS_TOP

  // ── Slice C: chips (one per selected Structure node) + node highlights ──
  const [chipOff, setChipOff] = useState<Set<string>>(new Set())

  // Resolve asset leaves under ANY selected node (incl. marketer -> promotion ->
  // asset) to video ids. Shares assetVideoCacheRef with Slice A: no duplicate lookups.
  useEffect(() => {
    const cache = assetVideoCacheRef.current
    const need = new Set<string>()
    for (const n of selectedNodes) {
      for (const r of collectLeafRefs(n)) if (r.type === 'asset' && !cache.has(r.id)) need.add(r.id)
    }
    if (need.size === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const found = await resolveVideoIdsForAssets(Array.from(need))
        if (cancelled) return
        for (const id of need) if (!cache.has(id)) cache.set(id, found.get(id) ?? [])
        setAssetCacheVersion((v) => v + 1)
      } catch (err) {
        console.warn('[CJM chips] asset -> video lookup failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedNodes])

  // Drop toggled-off ids whose selection no longer exists (re-selecting starts "on").
  useEffect(() => {
    setChipOff((prev) => {
      if (prev.size === 0) return prev
      const live = new Set(selectedNodes.map((n) => n.id))
      const next = new Set(Array.from(prev).filter((id) => live.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [selectedNodes])

  // chip id -> distinct raw video ids behind that selection
  const chipMembers = useMemo(() => {
    const cache = assetVideoCacheRef.current
    const out = new Map<string, Set<string>>()
    for (const n of selectedNodes) {
      const vids = new Set<string>()
      for (const ref of collectLeafRefs(n)) {
        if (ref.type === 'video') vids.add(ref.id)
        else for (const v of cache.get(ref.id) ?? []) vids.add(v)
      }
      out.set(n.id, vids)
    }
    return out
    // assetCacheVersion: the cache is a ref, this is what tells us it changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodes, assetCacheVersion])

  const graphVideoIds = useMemo(
    () => new Set((journeyContext.graph?.nodes ?? []).map((n) => n.videoId)),
    [journeyContext.graph],
  )

  const selectionChips = useMemo<SelectionChip[]>(
    () =>
      selectedNodes.map((n) => {
        const branchId =
          PANEL_BRANCHES.find((b) => findTreeNode(panelTree[b.id], n.id))?.id ?? chipBranchOf(n.id) ?? 'content'
        const branch = PANEL_BRANCHES.find((b) => b.id === branchId) ?? PANEL_BRANCHES[0]
        const members = chipMembers.get(n.id) ?? new Set<string>()
        let inGraph = 0
        members.forEach((v) => {
          if (graphVideoIds.has(v)) inGraph += 1
        })
        return { id: n.id, label: n.label, branch: branch.id, color: branch.color, countInGraph: inGraph, totalCount: members.size }
      }),
    [selectedNodes, panelTree, chipMembers, graphVideoIds],
  )

  // videoId -> which ACTIVE chips contain it
  const nodeHighlights = useMemo(() => {
    const map = new Map<string, NodeHighlight>()
    for (const chip of selectionChips) {
      if (chipOff.has(chip.id)) continue
      chipMembers.get(chip.id)?.forEach((v) => {
        if (!graphVideoIds.has(v)) return
        const h = map.get(v) ?? { colors: [], labels: [] }
        if (!h.colors.includes(chip.color)) h.colors.push(chip.color)
        h.labels.push(chip.label)
        map.set(v, h)
      })
    }
    return map
  }, [selectionChips, chipOff, chipMembers, graphVideoIds])

  const handleToggleChip = useCallback((id: string) => {
    setChipOff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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

  // Primary (draggable) positions + read-only contextual-campaign / legacy positions, for the journey connectors.
  const layerPositions = useMemo(() => ({ ...ctx.positions, ...positions }), [ctx.positions, positions])

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
      if (e.pointerType === 'touch') return // touch: one finger pans / two pinch — no card drag, let it reach the canvas
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

  // True once the user has panned/zoomed: auto-fit stops overriding the view.
  const userMovedRef = useRef(false)
  const legendRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [legendBottom, setLegendBottom] = useState(0)
  const isNarrow = containerSize.w > 0 && containerSize.w < JOURNEY_NARROW_PX

  const pan = useCallback((dx: number, dy: number) => {
    if (dx !== 0 || dy !== 0) userMovedRef.current = true
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])

  const zoom = useCallback((delta: number, originX: number, originY: number) => {
    userMovedRef.current = true
    setTransform((t) => {
      const factor = delta > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP
      const newScale = Math.min(MAX_SCALE, Math.max(JOURNEY_MIN_SCALE, t.scale * factor))
      const canvasX = (originX - t.x) / t.scale
      const canvasY = (originY - t.y) / t.scale
      return { scale: newScale, x: originX - canvasX * newScale, y: originY - canvasY * newScale }
    })
  }, [])

  // Extents of what is actually drawn (read-only: uses the same constants /
  // journeyScene / itemsTop / looseItems the canvas already uses).
  const contentBounds = useMemo(() => {
    const colsHalf = ((CAMPAIGN_PATHS.length - 1) / 2) * COLUMN_SPACING + OUTCOME_W / 2
    let minX = HUB_X - colsHalf
    let maxX = HUB_X + colsHalf
    const minY = HUB_Y - HUB_R
    let maxY = HUB_Y + OUTCOME_DIST + OUTCOME_H / 2
    if (journeyScene && journeyScene.nodes.length > 0) {
      for (const n of journeyScene.nodes) {
        minX = Math.min(minX, n.x)
        maxX = Math.max(maxX, n.x + JG_NODE_W)
      }
      maxY = Math.max(maxY, journeyScene.bottom)
    }
    for (const L of ctx.layouts) {
      for (const n of L.nodes) {
        minX = Math.min(minX, n.center.x - n.w / 2)
        maxX = Math.max(maxX, n.center.x + n.w / 2)
      }
      maxX = Math.max(maxX, L.hub.x + HUB_R)
    }
    const lp = ctx.positions[LEGACY_OUTCOME_ID]
    if (lp) minX = Math.min(minX, lp.x - OUTCOME_W / 2)
    if (looseItems.length > 0) {
      const half = ((ITEMS_COLS - 1) / 2) * ITEMS_COL_SPACING + OUTCOME_W / 2
      minX = Math.min(minX, HUB_X - half)
      maxX = Math.max(maxX, HUB_X + half)
      const rows = Math.ceil(Math.min(looseItems.length, PANEL_ITEM_CAP) / ITEMS_COLS)
      maxY = Math.max(maxY, itemsTop + (rows - 1) * ITEMS_ROW_SPACING + OUTCOME_H)
    }
    return { minX, maxX, minY, maxY }
  }, [journeyScene, looseItems, itemsTop, ctx])

  // Same idea as CampaignStructureMap's tree auto-fit: scale = min(fitW, fitH),
  // centred. Capped at 1 so desktop never starts blown-up.
  const computeFit = useCallback((): CanvasTransform | null => {
    const el = containerRef.current
    if (!el || !el.clientWidth || !el.clientHeight) return null
    const w = el.clientWidth
    const h = el.clientHeight
    const b = contentBounds
    const cw = b.maxX - b.minX
    const ch = b.maxY - b.minY
    const padX = 32
    const padTop = 16
    const padBottom = 72 // clear of the bottom-right controls
    const availW = w - padX
    const availH = Math.max(1, h - padTop - padBottom)
    const scale = Math.min(1, Math.max(JOURNEY_FIT_MIN_SCALE, Math.min(availW / cw, availH / ch)))
    return {
      scale,
      x: (w - cw * scale) / 2 - b.minX * scale,
      y: padTop + (availH - ch * scale) / 2 - b.minY * scale,
    }
  }, [contentBounds])

  const resetView = useCallback(() => {
    userMovedRef.current = false
    const t = computeFit()
    if (t) setTransform(t)
  }, [computeFit])

  // Auto-fit until the user pans/zooms (re-fits if content or viewport size changes).
  useLayoutEffect(() => {
    if (userMovedRef.current) return
    const t = computeFit()
    if (t) setTransform(t)
  }, [computeFit, containerSize.w, containerSize.h])

  // Track container size (+ legend bottom, for the stacked mobile chips).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      setContainerSize((prev) => (prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }))
      const lg = legendRef.current
      if (lg) setLegendBottom((prev) => (prev === lg.offsetTop + lg.offsetHeight ? prev : lg.offsetTop + lg.offsetHeight))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (legendRef.current) ro.observe(legendRef.current)
    return () => ro.disconnect()
  }, [])

  const panState = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  })

  // Pinch-to-zoom (touch only) — same pattern as CampaignStructureMap
  // (activePointers / pinchState / zoomToScale). Mouse pan, wheel and the
  // +/- buttons still go through the existing paths.
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchState = useRef<{ startDist: number; startScale: number } | null>(null)
  const pointerDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

  const zoomToScale = useCallback((newScaleRaw: number, originX: number, originY: number) => {
    userMovedRef.current = true
    setTransform((t) => {
      const newScale = Math.min(MAX_SCALE, Math.max(JOURNEY_MIN_SCALE, newScaleRaw))
      const canvasX = (originX - t.x) / t.scale
      const canvasY = (originY - t.y) / t.scale
      return { scale: newScale, x: originX - canvasX * newScale, y: originY - canvasY * newScale }
    })
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') {
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (activePointers.current.size === 2) {
          panState.current.active = false
          const pts = Array.from(activePointers.current.values())
          pinchState.current = { startDist: pointerDistance(pts[0], pts[1]), startScale: transform.scale }
          return
        }
      }
      if (e.button !== 0) return
      panState.current = { active: true, lastX: e.clientX, lastY: e.clientY }
    },
    [transform.scale]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'touch' && activePointers.current.has(e.pointerId)) {
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }
      if (activePointers.current.size === 2 && pinchState.current) {
        const rect = containerRef.current?.getBoundingClientRect()
        const pts = Array.from(activePointers.current.values())
        const dist = pointerDistance(pts[0], pts[1])
        const midX = (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0)
        const midY = (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0)
        zoomToScale(pinchState.current.startScale * (dist / (pinchState.current.startDist || 1)), midX, midY)
        return
      }
      if (!panState.current.active) return
      const dx = e.clientX - panState.current.lastX
      const dy = e.clientY - panState.current.lastY
      panState.current.lastX = e.clientX
      panState.current.lastY = e.clientY
      pan(dx, dy)
    },
    [pan, zoomToScale]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      activePointers.current.delete(e.pointerId)
      pinchState.current = null
      if (activePointers.current.size === 1) {
        const [remaining] = Array.from(activePointers.current.values())
        panState.current = { active: true, lastX: remaining.x, lastY: remaining.y }
        return
      }
    }
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
        onPointerCancel={handlePointerUp}
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
          {/* Slice B: observed journey graph (canvas coordinates, right of the hub group) */}
<ContextCampaignLayer
            presentation={presentation}
            layouts={ctx.layouts}
            names={foreignNames}
            legacyPos={ctx.positions[LEGACY_OUTCOME_ID] ?? null}
          />

          <JourneyGraphLayer
            presentation={presentation}
            context={layerContext}
            scene={journeyScene}
            titles={journeyTitles}
            entryIds={journeyEntryVideoIds}
            positions={layerPositions}
            onClear={clearJourneyContext}
            highlights={nodeHighlights}
          />

          <SelectedItemsLayer
            presentation={presentation}
            label={selectionLabel}
            items={looseItems}
            showThumbnails={showThumbnails}
            top={itemsTop}
            connectedCount={connectedItemCount}
          />

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

        {/* Slice C: one chip per selected Structure node (screen space) */}
        <JourneyChipBar
          presentation={presentation}
          chips={selectionChips}
          chipOff={chipOff}
          onToggleChip={handleToggleChip}
          narrow={isNarrow}
          narrowTop={legendBottom + 8}
        />

        {/* Legend */}
        <div ref={legendRef} style={styles.legend}>
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