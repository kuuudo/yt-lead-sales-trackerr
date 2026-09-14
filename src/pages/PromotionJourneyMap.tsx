/**
 * src/pages/PromotionJourneyMap.tsx
 *
 * Route: /marketplace/promotions/:promotionId/journey
 *
 * PHASE 1 + STEP 2 (observed journey graph).
 *
 * Purpose (Phase 1): load the assets actually promoted in this Promotion
 * (promotion_assets, via the existing getPromotionDetail() loader) and
 * display them as movable visual cards on a clean white canvas.
 *
 * Purpose (Step 2, additive): also load the real observed journey graph for
 * this promotion via discoverPromotionJourneys() -> buildJourneyGraph()
 * (journeyDiscovery.ts / journeyGraph.ts — unmodified, consumed as-is) and
 * render it as one continuous graph flowing out of the promoted-asset
 * cards: promoted asset(s) -> observed JourneyGraph.nodes, connected by
 * JourneyGraph.edges plus a structural connector from a promoted asset to
 * any JourneyGraph node whose observedAssetIds includes that asset's id.
 * No edge is invented: every line drawn is either a real GraphEdge or that
 * one real assetId-membership connector. See STEP 2 NODE DISPLAY LIMITATION
 * below for what is and isn't resolvable per-node yet.
 *
 * Explicitly NOT part of Phase 1:
 *   - events_journey / journeyAnalyticsEngine.ts / userJourneyAnalytics
 *   - "+ Create New Content"
 *   - tracking-domain constraints
 *   - persisted node positions (layout resets on reload — intentional)
 *
 * Explicitly NOT part of Step 2 (future phases):
 *   - click/visitor/engagement/conversion metrics on nodes or edges
 *   - Play button / animation / time scrubber / date-range filters
 *   - a general graph-layout engine (this uses a simple deterministic
 *     layered left-to-right layout, not force-directed / auto-organize)
 *   - persisted graph-node positions
 *
 * STEP 2 NODE DISPLAY LIMITATION (read before extending):
 *   GraphNode (journeyGraph.ts) carries videoId + observedAssetIds +
 *   observedRedirectLinkIds only — no title, thumbnail, or resourceType.
 *   There is no per-node asset-metadata resolver available to this file
 *   for the *downstream* graph nodes (only the already-promoted assets have
 *   resolved title/thumbnail, via getPromotionDetail). Rather than invent a
 *   fake type/title for a node we can't actually identify, downstream
 *   nodes are rendered generically (truncated videoId) with only one real,
 *   data-derived distinction: a node with zero outgoing GraphEdges is
 *   drawn with the terminal/"end of journey" treatment, since that is a
 *   structural fact from the graph itself, not an invented label. Getting
 *   the mockup's per-type icons (Newsletter/Sales Page/etc.) for downstream
 *   nodes requires enriching GraphNode with resourceType/title upstream —
 *   flagged for a follow-up, not done here per "don't modify journeyGraph.ts
 *   beyond tiny type-only fixes."
 *
 * Architecture notes:
 *   - This page does NOT use useWorkspaceStore, does NOT write to the
 *     `widgets` table, and is NOT a Workspace board. It has its own local
 *     (in-memory) state for node positions and canvas pan/zoom.
 *   - It DOES reuse two things from the Workspace canvas implementation,
 *     because they are pure interaction/math, not Workspace product state:
 *       1. The canvas-space coordinate model (translate+scale transform,
 *          screen<->canvas conversion) — reimplemented locally below,
 *          same formulas as WorkspaceCanvas.tsx.
 *       2. <CanvasGrid /> — a stateless presentational dot-grid component
 *          that only reads a `transform` prop. Importing it does not pull
 *          in the store.
 *   - Asset display data comes from getPromotionDetail(), which already
 *     resolves each promoted asset via the same getAssetDetail() resolver
 *     AssetDetail.tsx uses — same `resource.title` / thumbnail resolution,
 *     so this page can never drift from how assets are displayed elsewhere.
 *   - Clicking a node navigates to the existing canonical /assets/:id
 *     route (AssetDetail.tsx already exposes a deeper "Open Video Detail"
 *     link itself for video-origin assets — not duplicated here).
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Box, Flag, AlertCircle } from 'lucide-react'
import { getPromotionDetail } from '../services/promotion/getPromotionDetail'
import type { PromotionDetailData } from '../services/promotion/getPromotionDetail'
import {
  resolveAssetThumbnail,
  resolveElementThumbnail,
  type ResourceType,
  type CampaignElementType,
} from '../lib/videoFormatters'
import CanvasGrid from '../components/analytics/canvas/CanvasGrid'
import type { CanvasTransform } from '../components/analytics/store/useWorkspaceStore'
// STEP 2: real observed journey graph. Consumed as-is, per the approved
// contracts — nothing in journeyDiscovery.ts / journeyGraph.ts is modified.
// NOTE: import path assumed to match promotionJourney.ts / assetJourney.ts
// (same directory as journey.ts, referenced there as './journey'). Adjust
// these two lines if that directory differs from what's shown here.
import { discoverPromotionJourneys } from '../lib/journeyDiscovery'
import { buildJourneyGraph } from '../lib/journeyGraph'
import type { DiscoveredJourney } from '../lib/journeyDiscovery'
import type { JourneyGraph, GraphNode, GraphEdge } from '../lib/journeyGraph'

// ─── Local node model (Phase 1 — no edges, no persistence) ────────────────────

interface JourneyNode {
  assetId: string
  promotionAssetId: string
  title: string
  thumbnailSrc: string | null
  x: number
  y: number
}

const NODE_WIDTH = 180
const NODE_HEIGHT = 150
const THUMB_HEIGHT = 100
const GRID_GAP_X = 48
const GRID_GAP_Y = 48
const CANVAS_MARGIN = 60
const NODES_PER_ROW = 4

const MIN_SCALE = 0.4
const MAX_SCALE = 2.5
const ZOOM_STEP = 0.15
const DRAG_THRESHOLD_PX = 4 // movement below this = treated as a click, not a drag

// ─── STEP 2: observed-graph layout constants (deterministic, left-to-right) ──
// Root promoted-asset column sits at ROOT_COLUMN_X, vertically centered in
// the measured canvas. Graph-node columns extend rightward from there —
// this is NOT a force-directed / auto-organize layout, just fixed columns
// by BFS depth from the root node(s), matching the approved mockup.
const ROOT_COLUMN_X = 60
const GRAPH_NODE_WIDTH = 200
const GRAPH_NODE_HEIGHT = 92
const GRAPH_COLUMN_GAP = 100
const GRAPH_ROW_GAP = 56
const DEFAULT_CANVAS_HEIGHT = 640

// ─── Thumbnail resolution — mirrors AssetDetail.tsx exactly ───────────────────

function resolveNodeThumbnail(resource: PromotionDetailData['assets'][number]['resource']): string | null {
  if (!resource) return null
  if (resource.origin === 'campaign_element') {
    return resolveElementThumbnail((resource.resourceType ?? 'landing_page') as CampaignElementType)
  }
  if (resource.thumbnailUrl || resource.resourceType) {
    return resolveAssetThumbnail({
      thumbnail_url: resource.thumbnailUrl ?? null,
      resource_type: (resource.resourceType ?? 'other') as ResourceType,
      platform: resource.platform ?? null,
    })
  }
  return null
}

// ─── Initial layout — STEP 2: single root column, vertically centered ────────
// Previously a top-left row/wrap grid (NODES_PER_ROW). Changed per the
// approved direction: promoted assets are the starting point of one
// continuous graph, so they now anchor as a centered left column instead
// of being pinned to a corner. Still NOT an "Organize" algorithm — no
// force-directed layout, just a centered stack.

function layoutNodes(
  assets: PromotionDetailData['assets'],
  canvasHeight: number = DEFAULT_CANVAS_HEIGHT
): JourneyNode[] {
  const totalHeight = assets.length * NODE_HEIGHT + Math.max(0, assets.length - 1) * GRID_GAP_Y
  const startY = Math.max(CANVAS_MARGIN, (canvasHeight - totalHeight) / 2)
  return assets.map((a, i) => ({
    assetId: a.assetId,
    promotionAssetId: a.promotionAssetId,
    title: a.resource?.title || 'Untitled asset',
    thumbnailSrc: resolveNodeThumbnail(a.resource),
    x: ROOT_COLUMN_X,
    y: startY + i * (NODE_HEIGHT + GRID_GAP_Y),
  }))
}

// ─── STEP 2: observed journey graph — positioning types ───────────────────────
// Positioned wrapper around the real GraphNode/GraphEdge shapes from
// journeyGraph.ts. No fields are invented here beyond x/y/depth/isTerminal,
// all of which are derived purely from graph structure (BFS depth,
// out-degree), never from guessed asset metadata. See file header's
// "STEP 2 NODE DISPLAY LIMITATION" note.
interface PositionedGraphNode extends GraphNode {
  x: number
  y: number
  depth: number
  isTerminal: boolean // true iff zero outgoing GraphEdges — a real structural fact
  isRootMatch: boolean // true iff observedAssetIds intersects the promotion's own asset ids
}

interface PositionedGraphEdge extends GraphEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface RootConnector {
  // from a promoted-asset card (JourneyNode) to a PositionedGraphNode whose
  // observedAssetIds contains that asset's id — a real assetId match, not
  // an invented edge.
  fromAssetId: string
  x1: number
  y1: number
  x2: number
  y2: number
}

// Deterministic layered (BFS-by-depth) layout. NOT a general graph-layout
// engine — fixed columns by depth from the promotion's own root node(s),
// simple vertical stacking within a column. Defensive against cycles via
// a bounded relaxation pass count.
function layoutJourneyGraph(
  graph: JourneyGraph,
  promotedAssetIds: Set<string>,
  rootColumnRightEdgeX: number,
  canvasHeight: number
): { nodes: PositionedGraphNode[]; edges: PositionedGraphEdge[] } {
  const { nodes, edges } = graph

  const outDegree = new Map<string, number>()
  for (const n of nodes) outDegree.set(n.videoId, 0)
  for (const e of edges) outDegree.set(e.fromVideoId, (outDegree.get(e.fromVideoId) ?? 0) + 1)

  const isRootMatch = (n: GraphNode) =>
    n.observedAssetIds.some((id) => promotedAssetIds.has(id))

  // BFS depth assignment, relaxed upward (a node reachable via multiple
  // paths sits at the greatest depth reached, so it never draws left of an
  // ancestor). Bounded by nodes.length passes to stay safe against cycles.
  const depth = new Map<string, number>()
  for (const n of nodes) depth.set(n.videoId, isRootMatch(n) ? 0 : -1)
  if (![...depth.values()].some((d) => d === 0)) {
    // No node matched a promoted asset (e.g. promotion has no assets yet,
    // or discovery didn't surface the exact root step) — fall back to
    // graph-structural roots: nodes nothing points to.
    const hasIncoming = new Set(edges.map((e) => e.toVideoId))
    for (const n of nodes) {
      if (!hasIncoming.has(n.videoId)) depth.set(n.videoId, 0)
    }
  }

  const maxPasses = nodes.length + 2
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false
    for (const e of edges) {
      const fromDepth = depth.get(e.fromVideoId)
      if (fromDepth === undefined || fromDepth === -1) continue
      const candidate = fromDepth + 1
      const currentToDepth = depth.get(e.toVideoId) ?? -1
      if (candidate > currentToDepth) {
        depth.set(e.toVideoId, candidate)
        changed = true
      }
    }
    if (!changed) break
  }
  // Any node still unreached (isolated from every root) is placed at depth 0
  // of its own — it's still a real discovered node, just not proven
  // connected to a promoted asset by any observed edge.
  for (const n of nodes) {
    if ((depth.get(n.videoId) ?? -1) === -1) depth.set(n.videoId, 0)
  }

  const byDepth = new Map<number, GraphNode[]>()
  for (const n of nodes) {
    const d = depth.get(n.videoId) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(n)
  }

  const positioned: PositionedGraphNode[] = []
  const posByVideoId = new Map<string, PositionedGraphNode>()
  for (const [d, colNodes] of byDepth.entries()) {
    const totalHeight =
      colNodes.length * GRAPH_NODE_HEIGHT + Math.max(0, colNodes.length - 1) * GRAPH_ROW_GAP
    const startY = Math.max(CANVAS_MARGIN, (canvasHeight - totalHeight) / 2)
    colNodes.forEach((n, i) => {
      const pn: PositionedGraphNode = {
        ...n,
        depth: d,
        x: rootColumnRightEdgeX + d * (GRAPH_NODE_WIDTH + GRAPH_COLUMN_GAP),
        y: startY + i * (GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP),
        isTerminal: (outDegree.get(n.videoId) ?? 0) === 0,
        isRootMatch: isRootMatch(n),
      }
      positioned.push(pn)
      posByVideoId.set(n.videoId, pn)
    })
  }

  const positionedEdges: PositionedGraphEdge[] = edges
    .map((e) => {
      const from = posByVideoId.get(e.fromVideoId)
      const to = posByVideoId.get(e.toVideoId)
      if (!from || !to) return null
      return {
        ...e,
        x1: from.x + GRAPH_NODE_WIDTH,
        y1: from.y + GRAPH_NODE_HEIGHT / 2,
        x2: to.x,
        y2: to.y + GRAPH_NODE_HEIGHT / 2,
      }
    })
    .filter((e): e is PositionedGraphEdge => e !== null)

  return { nodes: positioned, edges: positionedEdges }
}

function edgeBezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2
  return `M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PromotionJourneyMap() {
  const { promotionId } = useParams<{ promotionId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promotionTitle, setPromotionTitle] = useState<string>('Promotion')
  const [nodes, setNodes] = useState<JourneyNode[]>([])

  // STEP 2: observed journey graph — loaded independently of the promoted
  // assets above (different data source, different failure mode). A graph
  // load failure does not block the promoted-asset cards from rendering.
  const [graphLoading, setGraphLoading] = useState(true)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [graph, setGraph] = useState<JourneyGraph | null>(null)

  // Local canvas transform — NOT useWorkspaceStore.
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 })
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Load promotion + its promoted assets ─────────────────────────────────
  useEffect(() => {
    if (!promotionId) return
    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const detail = await getPromotionDetail(promotionId)
        if (cancelled) return
        if (!detail) {
          setError('Promotion not found.')
          setLoading(false)
          return
        }
        setPromotionTitle(detail.assignment?.title ?? 'Promotion')
        setNodes(layoutNodes(detail.assets))
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load this promotion.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [promotionId])

  // ── STEP 2: load the real observed journey graph ─────────────────────────
  // discoverPromotionJourneys(promotionId) -> buildJourneyGraph(discovered).
  // Both consumed exactly as exported today — no changes to either file.
  useEffect(() => {
    if (!promotionId) return
    let cancelled = false

    ;(async () => {
      setGraphLoading(true)
      setGraphError(null)
      try {
        const discovered: DiscoveredJourney[] = await discoverPromotionJourneys(promotionId)
        if (cancelled) return
        const built = buildJourneyGraph(discovered)
        setGraph(built)
      } catch (err: any) {
        if (!cancelled) setGraphError(err?.message || 'Could not load the journey graph.')
      } finally {
        if (!cancelled) setGraphLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [promotionId])

  // ── STEP 2: promoted-asset ids, for matching graph nodes to root cards ───
  const promotedAssetIds = useMemo(() => new Set(nodes.map((n) => n.assetId)), [nodes])

  // ── STEP 2: deterministic layered layout for the observed graph ──────────
  const rootColumnRightEdgeX = ROOT_COLUMN_X + NODE_WIDTH + GRID_GAP_X * 2
  const { nodes: positionedGraphNodes, edges: positionedGraphEdges } = useMemo(() => {
    if (!graph) return { nodes: [] as PositionedGraphNode[], edges: [] as PositionedGraphEdge[] }
    return layoutJourneyGraph(graph, promotedAssetIds, rootColumnRightEdgeX, DEFAULT_CANVAS_HEIGHT)
  }, [graph, promotedAssetIds, rootColumnRightEdgeX])

  // ── STEP 2: structural connectors from a promoted-asset card to any graph
  // node whose observedAssetIds contains that asset's id — a real assetId
  // match, not an invented edge. ────────────────────────────────────────────
  const rootConnectors: RootConnector[] = useMemo(() => {
    const out: RootConnector[] = []
    for (const asset of nodes) {
      for (const gn of positionedGraphNodes) {
        if (gn.observedAssetIds.includes(asset.assetId)) {
          out.push({
            fromAssetId: asset.assetId,
            x1: asset.x + NODE_WIDTH,
            y1: asset.y + NODE_HEIGHT / 2,
            x2: gn.x,
            y2: gn.y + GRAPH_NODE_HEIGHT / 2,
          })
        }
      }
    }
    return out
  }, [nodes, positionedGraphNodes])

  // ── Pan / zoom (same formulas as WorkspaceCanvas.tsx, kept local) ────────
  const pan = useCallback((dx: number, dy: number) => {
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])

  const zoom = useCallback((delta: number, originX: number, originY: number) => {
    setTransform((t) => {
      const factor = delta > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor))
      // Keep the point under the cursor/origin fixed while zooming.
      const canvasX = (originX - t.x) / t.scale
      const canvasY = (originY - t.y) / t.scale
      return {
        scale: newScale,
        x: originX - canvasX * newScale,
        y: originY - canvasY * newScale,
      }
    })
  }, [])

  const resetView = useCallback(() => setTransform({ x: 0, y: 0, scale: 1 }), [])

  // ── Canvas pan (pointer down on empty canvas) ────────────────────────────
  const panState = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false, lastX: 0, lastY: 0,
  })

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    panState.current = { active: true, lastX: e.clientX, lastY: e.clientY }
  }, [])

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panState.current.active) return
    const dx = e.clientX - panState.current.lastX
    const dy = e.clientY - panState.current.lastY
    panState.current.lastX = e.clientX
    panState.current.lastY = e.clientY
    pan(dx, dy)
  }, [pan])

  const handleCanvasPointerUp = useCallback(() => {
    panState.current.active = false
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    zoom(e.deltaY > 0 ? -1 : 1, e.clientX - rect.left, e.clientY - rect.top)
  }, [zoom])

  const zoomIn = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    zoom(1, (rect?.width ?? 800) / 2, (rect?.height ?? 500) / 2)
  }
  const zoomOut = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    zoom(-1, (rect?.width ?? 800) / 2, (rect?.height ?? 500) / 2)
  }

  // ── Node drag (click vs. drag disambiguation) ────────────────────────────
  const dragState = useRef<{
    assetId: string | null
    startClientX: number
    startClientY: number
    startNodeX: number
    startNodeY: number
    moved: boolean
  }>({ assetId: null, startClientX: 0, startClientY: 0, startNodeX: 0, startNodeY: 0, moved: false })

  const handleNodePointerDown = useCallback((e: React.PointerEvent, node: JourneyNode) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragState.current = {
      assetId: node.assetId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
      moved: false,
    }
  }, [])

  const handleNodePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    if (!ds.assetId) return
    const dxScreen = e.clientX - ds.startClientX
    const dyScreen = e.clientY - ds.startClientY
    if (Math.hypot(dxScreen, dyScreen) > DRAG_THRESHOLD_PX) ds.moved = true

    const dxCanvas = dxScreen / transform.scale
    const dyCanvas = dyScreen / transform.scale
    setNodes((prev) =>
      prev.map((n) =>
        n.assetId === ds.assetId
          ? { ...n, x: ds.startNodeX + dxCanvas, y: ds.startNodeY + dyCanvas }
          : n
      )
    )
  }, [transform.scale])

  const handleNodePointerUp = useCallback((e: React.PointerEvent, node: JourneyNode) => {
    const ds = dragState.current
    const wasDrag = ds.moved
    dragState.current.assetId = null
    if (!wasDrag) {
      navigate(`/assets/${node.assetId}`)
    }
  }, [navigate])

  const scalePercent = Math.round(transform.scale * 100)

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.centered}>
        <Loader2 className="animate-spin" size={20} />
        <span style={styles.loadingText}>Loading promotion journey map…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.centered}>
        <p style={styles.errorText}>{error}</p>
        <Link to="/marketplace" style={styles.backLinkPlain}>Back to Marketplace</Link>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <Link
          to={promotionId ? `/marketplace/promotions/${promotionId}` : '/marketplace'}
          style={styles.backLink}
        >
          <ArrowLeft size={14} /> Back to promotion
        </Link>
        <span style={styles.title}>{promotionTitle} — User journey</span>
      </div>

      <div
        ref={containerRef}
        style={styles.canvasContainer}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerLeave={handleCanvasPointerUp}
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
          {/* STEP 2: edges — real GraphEdges + real assetId-match root
              connectors only. Drawn under the node cards. */}
          <svg style={styles.edgesSvg}>
            <defs>
              <marker id="journeyArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#c7cbd1" />
              </marker>
            </defs>
            {rootConnectors.map((c, i) => (
              <path
                key={`root-${c.fromAssetId}-${i}`}
                d={edgeBezierPath(c.x1, c.y1, c.x2, c.y2)}
                style={styles.edgePath}
                markerEnd="url(#journeyArrow)"
              />
            ))}
            {positionedGraphEdges.map((e) => (
              <path
                key={`${e.fromVideoId}::${e.toVideoId}`}
                d={edgeBezierPath(e.x1, e.y1, e.x2, e.y2)}
                style={styles.edgePath}
                markerEnd="url(#journeyArrow)"
              />
            ))}
          </svg>

          {nodes.map((node) => (
            <div
              key={node.assetId}
              style={{
                ...styles.node,
                left: node.x,
                top: node.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
              }}
              onPointerDown={(e) => handleNodePointerDown(e, node)}
              onPointerMove={handleNodePointerMove}
              onPointerUp={(e) => handleNodePointerUp(e, node)}
            >
              <div style={{ ...styles.nodeThumb, height: THUMB_HEIGHT }}>
                {node.thumbnailSrc ? (
                  <img src={node.thumbnailSrc} style={styles.nodeThumbImg} draggable={false} />
                ) : (
                  <div style={styles.nodeThumbFallback} />
                )}
              </div>
              <div style={styles.nodeTitle}>{node.title}</div>
            </div>
          ))}

          {/* STEP 2: real observed graph nodes. See file header's "STEP 2
              NODE DISPLAY LIMITATION" — no per-type icon/title exists for
              these yet, only the real structural terminal/mid-path
              distinction. */}
          {positionedGraphNodes.map((gn) => (
            <div
              key={gn.videoId}
              style={{
                ...styles.graphNode,
                ...(gn.isTerminal ? styles.graphNodeTerminal : null),
                left: gn.x,
                top: gn.y,
                width: GRAPH_NODE_WIDTH,
                height: GRAPH_NODE_HEIGHT,
              }}
              title={`videoId: ${gn.videoId}`}
            >
              <div style={styles.graphNodeHead}>
                <div
                  style={{
                    ...styles.graphNodeIcon,
                    background: gn.isTerminal ? '#d1fae5' : '#eef0f3',
                  }}
                >
                  {gn.isTerminal ? (
                    <Flag size={13} color="#059669" />
                  ) : (
                    <Box size={13} color="#6b7280" />
                  )}
                </div>
                <div>
                  <div style={styles.graphNodeTitle}>{gn.videoId.slice(0, 10)}…</div>
                  <div style={styles.graphNodeType}>
                    {gn.isTerminal ? 'Terminal — end of journey' : 'Observed step'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {nodes.length === 0 && (
          <div style={styles.emptyOverlay}>
            <p style={styles.emptyText}>No assets in this promotion yet.</p>
          </div>
        )}

        {/* STEP 2: graph status — inline, non-blocking. Promoted-asset cards
            above render regardless of graph load state. */}
        {graphLoading && (
          <div style={styles.graphStatusChip}>
            <Loader2 size={12} className="animate-spin" />
            <span>Loading journey graph…</span>
          </div>
        )}
        {!graphLoading && graphError && (
          <div style={{ ...styles.graphStatusChip, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}>
            <AlertCircle size={12} />
            <span>{graphError}</span>
          </div>
        )}
        {!graphLoading && !graphError && graph && graph.nodes.length === 0 && (
          <div style={styles.graphStatusChip}>
            <span>No observed journeys yet for this promotion.</span>
          </div>
        )}

        <div style={styles.zoomControls}>
          <button style={styles.zoomBtn} onClick={zoomIn} title="Zoom in">+</button>
          <span style={styles.zoomLabel}>{scalePercent}%</span>
          <button style={styles.zoomBtn} onClick={zoomOut} title="Zoom out">−</button>
          <button style={{ ...styles.zoomBtn, borderLeft: '1px solid #e5e7eb', marginLeft: 2, paddingLeft: 6 }} onClick={resetView} title="Reset view">⌂</button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles — white canvas, no dark Workspace theme ───────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
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
  },
  backLinkPlain: {
    fontSize: 13,
    color: '#6b7280',
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
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
  node: {
    position: 'absolute',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    overflow: 'hidden',
    cursor: 'grab',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  nodeThumb: {
    width: '100%',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nodeThumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
  },
  nodeThumbFallback: {
    width: '100%',
    height: '100%',
    background: '#f3f4f6',
  },
  nodeTitle: {
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 500,
    color: '#111827',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
  emptyOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  emptyText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  centered: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: '100vh',
    background: '#ffffff',
  },
  loadingText: {
    fontSize: 13,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
  },
}
