/**
 * src/pages/PromotionJourneyMap.tsx
 *
 * Route: /marketplace/promotions/:promotionId/journey
 *
 * PHASE 1 ONLY.
 *
 * Purpose (Phase 1): load the assets actually promoted in this Promotion
 * (promotion_assets, via the existing getPromotionDetail() loader) and
 * display them as movable visual cards on a clean white canvas.
 *
 * Explicitly NOT part of Phase 1:
 *   - events_journey / journeyAnalyticsEngine.ts / userJourneyAnalytics
 *   - any connector/edge rendering
 *   - "+ Create New Content"
 *   - tracking-domain constraints
 *   - persisted node positions (layout resets on reload — intentional)
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
import { ArrowLeft, Loader2 } from 'lucide-react'
import { getPromotionDetail } from '../services/promotion/getPromotionDetail'
import type { PromotionDetailData } from '../services/promotion/getPromotionDetail'
import {
  resolveAssetThumbnail,
  resolveElementThumbnail,
  getElementTypeLabel,
  type ResourceType,
  type CampaignElementType,
} from '../lib/videoFormatters'
import CanvasGrid from '../components/analytics/canvas/CanvasGrid'
import type { CanvasTransform } from '../components/analytics/store/useWorkspaceStore'

// ─── STEP 2 (additive) — wire the observed journey graph into this page ───────
// See journeyDiscovery.ts / journeyGraph.ts for the actual discovery + graph
// build logic; this page only consumes their output. Not touched: journey.ts,
// journeyDiscovery.ts, journeyGraph.ts, promotionJourney.ts, assetJourney.ts,
// journeyAnalyticsEngine.ts, events, attribution, the database.
import { discoverPromotionJourneys } from '../lib/journeyDiscovery'
import { buildJourneyGraph, type JourneyGraph, type GraphNode, type GraphEdge } from '../lib/journeyGraph'
import { resolveAssetType } from '../services/asset/resolveAssetType'

// ─── STEP 3 (additive) — resolve what a terminal video step's own observed
// redirect link actually led to (campaign element / resource), using only
// existing data. No conversion/purchase data involved — see
// journeyDownstreamResolver.ts's file header for the full rationale. Does
// NOT modify journeyGraph.ts, journeyAnalyticsEngine.ts, or analyticsEngine.ts.
import { resolveDownstreamNodes, type DownstreamResolution, type DownstreamNode } from '../services/journey/journeyDownstreamResolver'

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

// Shared vertical midline: the promoted-asset column and the first graph
// layer are both centered on this so "promoted asset -> Video A" reads as
// one straight, continuous line rather than two independently-centered
// stacks. Arbitrary but fixed — not derived from container height, since
// this page doesn't auto-fit-to-viewport (see Pan/zoom section below).
const CANVAS_MID_Y = 320

// ─── Observed-journey graph layout (additive — see STEP 2 import block) ───────
const GRAPH_NODE_WIDTH = 180
const GRAPH_NODE_HEIGHT = 92
const GRAPH_COL_GAP = 140
const GRAPH_ROW_GAP = 40
const GRAPH_START_X = CANVAS_MARGIN + NODE_WIDTH + GRID_GAP_X + 120

const MIN_SCALE = 0.4
const MAX_SCALE = 2.5
const ZOOM_STEP = 0.15
const DRAG_THRESHOLD_PX = 4 // movement below this = treated as a click, not a drag

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

// ─── Initial layout — single centered column. NOT an "Organize" algorithm. ────
// Promoted assets are the observed graph's starting point (mockup approved
// 2026-09-14), so they're stacked in one column centered on CANVAS_MID_Y
// instead of the old top-left wrapping grid.

function layoutNodes(
  assets: PromotionDetailData['assets']
): JourneyNode[] {
  const columnHeight = assets.length * NODE_HEIGHT + Math.max(0, assets.length - 1) * GRID_GAP_Y
  const startY = CANVAS_MID_Y - columnHeight / 2
  return assets.map((a, i) => {
    return {
      assetId: a.assetId,
      promotionAssetId: a.promotionAssetId,
      title: a.resource?.title || 'Untitled asset',
      thumbnailSrc: resolveNodeThumbnail(a.resource),
      x: CANVAS_MARGIN,
      y: Math.max(CANVAS_MARGIN, startY + i * (NODE_HEIGHT + GRID_GAP_Y)),
    }
  })
}

// ─── Observed-graph node visual type (additive) ────────────────────────────────
// journeyGraph.ts's GraphNode carries no title/type of its own (see its file
// header — node identity is just videoId). We resolve a *display* type via
// resolveAssetType.ts's broad asset_type category ('video' | 'campaign_element'
// | 'resource') for the node's first observed assetId. This deliberately does
// NOT attempt to guess a campaign-element sub-type (newsletter vs. landing
// page vs. sales call vs. consultation) — resolveAssetType.ts doesn't expose
// that, and inventing a sub-type from the videoId/title would violate "do not
// invent fake nodes." All campaign elements render with one shared visual
// until a real sub-type source is wired in.
type GraphNodeVisualType = 'video' | 'campaign_element' | 'resource' | 'unknown'

const GRAPH_TYPE_ACCENT: Record<GraphNodeVisualType, string> = {
  video: '#4f46e5',
  campaign_element: '#d97706',
  resource: '#475569',
  unknown: '#9ca3af',
}

const GRAPH_TYPE_LABEL: Record<GraphNodeVisualType, string> = {
  video: 'Video',
  campaign_element: 'Campaign element',
  resource: 'Imported resource',
  unknown: 'Unresolved type',
}

interface PositionedGraphNode {
  videoId: string
  observedAssetIds: string[]
  visualType: GraphNodeVisualType
  isTerminal: boolean // no outgoing observed edge — end of an observed path
  x: number
  y: number
}

// BFS layer-by-layer, left to right. NOT a general graph-layout engine —
// single pass, no edge-crossing minimization, no cycle solving beyond "don't
// revisit a node at a worse (larger) layer than already assigned." Good
// enough for the Video A -> {Newsletter, Sales Page} -> Thank You depth this
// step targets; a real layout engine is explicitly out of scope (see STEP 2
// instructions).
function layoutGraphNodes(
  graph: JourneyGraph,
  visualTypeByVideoId: Map<string, GraphNodeVisualType>,
): PositionedGraphNode[] {
  const { nodes, edges } = graph
  if (nodes.length === 0) return []

  const outgoingByVideoId = new Map<string, GraphEdge[]>()
  const hasIncoming = new Set<string>()
  for (const edge of edges) {
    if (!outgoingByVideoId.has(edge.fromVideoId)) outgoingByVideoId.set(edge.fromVideoId, [])
    outgoingByVideoId.get(edge.fromVideoId)!.push(edge)
    hasIncoming.add(edge.toVideoId)
  }

  const layerByVideoId = new Map<string, number>()

  // Roots: nodes nothing points to. If every node has an incoming edge (a
  // cycle with no clear start — shouldn't happen given journeyGraph.ts's
  // construction, but not assumed), fall back to graph order for the first
  // root so we still render a deterministic layout instead of nothing.
  let roots = nodes.filter((n) => !hasIncoming.has(n.videoId))
  if (roots.length === 0) roots = [nodes[0]]

  const queue: { videoId: string; layer: number }[] = roots.map((r) => ({ videoId: r.videoId, layer: 0 }))
  for (const r of roots) layerByVideoId.set(r.videoId, 0)

  while (queue.length > 0) {
    const { videoId, layer } = queue.shift()!
    for (const edge of outgoingByVideoId.get(videoId) ?? []) {
      const existingLayer = layerByVideoId.get(edge.toVideoId)
      const nextLayer = layer + 1
      if (existingLayer === undefined || nextLayer < existingLayer) {
        layerByVideoId.set(edge.toVideoId, nextLayer)
        queue.push({ videoId: edge.toVideoId, layer: nextLayer })
      }
    }
  }

  // Any node BFS never reached (disconnected from every root) still needs a
  // deterministic position — buildJourneyGraph()'s node list is rendered in
  // full, nothing gets silently dropped.
  for (const n of nodes) {
    if (!layerByVideoId.has(n.videoId)) layerByVideoId.set(n.videoId, 0)
  }

  const nodesByLayer = new Map<number, GraphNode[]>()
  for (const n of nodes) {
    const layer = layerByVideoId.get(n.videoId)!
    if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, [])
    nodesByLayer.get(layer)!.push(n)
  }

  const positioned: PositionedGraphNode[] = []
  for (const [layer, layerNodes] of nodesByLayer.entries()) {
    const layerHeight = layerNodes.length * GRAPH_NODE_HEIGHT + Math.max(0, layerNodes.length - 1) * GRAPH_ROW_GAP
    const startY = CANVAS_MID_Y - layerHeight / 2
    layerNodes.forEach((n, i) => {
      positioned.push({
        videoId: n.videoId,
        observedAssetIds: n.observedAssetIds,
        visualType: visualTypeByVideoId.get(n.videoId) ?? 'unknown',
        isTerminal: !(outgoingByVideoId.get(n.videoId)?.length),
        x: GRAPH_START_X + layer * (GRAPH_NODE_WIDTH + GRAPH_COL_GAP),
        y: Math.max(CANVAS_MARGIN, startY + i * (GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP)),
      })
    })
  }

  return positioned
}

// A promoted asset "connects into" the observed graph when the same assetId
// shows up in one of the graph's nodes (GraphNode.observedAssetIds — see
// journeyGraph.ts). This is an identity match ("this promoted asset IS this
// graph node"), not a fabricated GraphEdge. If no discovered journey ever
// touched a given promoted asset, no connector is drawn for it — the asset
// card just sits there with nothing observed downstream yet.
function findMatchingGraphNode(
  assetId: string,
  positionedGraphNodes: PositionedGraphNode[],
): PositionedGraphNode | undefined {
  return positionedGraphNodes.find((n) => n.observedAssetIds.includes(assetId))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PromotionJourneyMap() {
  const { promotionId } = useParams<{ promotionId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promotionTitle, setPromotionTitle] = useState<string>('Promotion')
  const [nodes, setNodes] = useState<JourneyNode[]>([])

  // Observed journey graph (additive — separate from promoted-asset state above)
  const [graph, setGraph] = useState<JourneyGraph | null>(null)
  const [graphLoading, setGraphLoading] = useState(true)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [nodeVisualTypes, setNodeVisualTypes] = useState<Map<string, GraphNodeVisualType>>(new Map())

  // Downstream resolution (additive — STEP 3). Structural only, no
  // conversion data. See journeyDownstreamResolver.ts.
  const [downstream, setDownstream] = useState<DownstreamResolution>({ nodes: [], edges: [] })

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

  // ── Load observed journey graph (additive — separate effect, does not touch
  // the promoted-asset loading effect above) ───────────────────────────────
  useEffect(() => {
    if (!promotionId) return
    let cancelled = false

    ;(async () => {
      setGraphLoading(true)
      setGraphError(null)
      try {
        const discovered = await discoverPromotionJourneys(promotionId)
        const built = buildJourneyGraph(discovered)
        if (cancelled) return

        // Best-effort display type per node — see GraphNodeVisualType comment
        // above for why this stops at the broad asset_type category. Run
        // alongside downstream resolution (STEP 3) — independent lookups,
        // no ordering dependency between them.
        const [visualTypeEntries, downstreamResolved] = await Promise.all([
          Promise.all(
            built.nodes.map(async (n) => {
              const assetId = n.observedAssetIds[0]
              if (!assetId) return [n.videoId, 'unknown' as GraphNodeVisualType] as const
              const resolved = await resolveAssetType(assetId)
              return [n.videoId, (resolved?.assetType ?? 'unknown') as GraphNodeVisualType] as const
            })
          ),
          resolveDownstreamNodes(built),
        ])
        if (cancelled) return

        setNodeVisualTypes(new Map(visualTypeEntries))
        setDownstream(downstreamResolved)
        setGraph(built)
      } catch (err: any) {
        if (!cancelled) setGraphError(err?.message || 'Could not load the observed journey graph.')
      } finally {
        if (!cancelled) setGraphLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [promotionId])

  const positionedGraphNodes = useMemo(
    () => (graph ? layoutGraphNodes(graph, nodeVisualTypes) : []),
    [graph, nodeVisualTypes]
  )

  // Video ids whose terminal step got a resolved downstream node — these no
  // longer render with the "end of path" terminal treatment, since we now
  // know what came next (see journeyDownstreamResolver.ts).
  const videoIdsWithDownstream = useMemo(
    () => new Set(downstream.edges.map((e) => e.fromVideoId)),
    [downstream]
  )

  // Downstream nodes (STEP 3, additive) — one column past their source
  // video, grouped/stacked when a source has more than one. Purely a
  // positioning pass; layoutGraphNodes() above is untouched.
  const positionedDownstreamNodes = useMemo(() => {
    if (positionedGraphNodes.length === 0 || downstream.nodes.length === 0) return []
    const bySource = new Map<string, DownstreamNode[]>()
    for (const n of downstream.nodes) {
      if (!bySource.has(n.sourceVideoId)) bySource.set(n.sourceVideoId, [])
      bySource.get(n.sourceVideoId)!.push(n)
    }
    const positioned: (DownstreamNode & { x: number; y: number })[] = []
    for (const [sourceVideoId, group] of bySource.entries()) {
      const source = positionedGraphNodes.find((p) => p.videoId === sourceVideoId)
      if (!source) continue
      const groupHeight = group.length * GRAPH_NODE_HEIGHT + Math.max(0, group.length - 1) * GRAPH_ROW_GAP
      const startY = source.y + GRAPH_NODE_HEIGHT / 2 - groupHeight / 2
      group.forEach((n, i) => {
        positioned.push({
          ...n,
          x: source.x + GRAPH_NODE_WIDTH + GRAPH_COL_GAP,
          y: startY + i * (GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP),
        })
      })
    }
    return positioned
  }, [positionedGraphNodes, downstream])

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
          {/* Edges — additive SVG layer, same coordinate space as the node divs
              below since it shares this transformed container. Two kinds:
              1. promoted-asset -> matching graph node (identity link, see
                 findMatchingGraphNode comment above — not a GraphEdge).
              2. graph.edges, exactly as returned by buildJourneyGraph() —
                 nothing inferred, nothing shortcut. */}
          <svg style={styles.edgesLayer}>
            <defs>
              <marker id="journeyArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#c7cbd1" />
              </marker>
            </defs>
            {nodes.map((node) => {
              const match = findMatchingGraphNode(node.assetId, positionedGraphNodes)
              if (!match) return null
              const x1 = node.x + NODE_WIDTH
              const y1 = node.y + NODE_HEIGHT / 2
              const x2 = match.x
              const y2 = match.y + GRAPH_NODE_HEIGHT / 2
              const midX = (x1 + x2) / 2
              return (
                <path
                  key={`start-${node.assetId}`}
                  d={`M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`}
                  fill="none"
                  stroke="#c7cbd1"
                  strokeWidth={1.6}
                  markerEnd="url(#journeyArrow)"
                />
              )
            })}
            {graph?.edges.map((edge) => {
              const from = positionedGraphNodes.find((n) => n.videoId === edge.fromVideoId)
              const to = positionedGraphNodes.find((n) => n.videoId === edge.toVideoId)
              if (!from || !to) return null
              const x1 = from.x + GRAPH_NODE_WIDTH
              const y1 = from.y + GRAPH_NODE_HEIGHT / 2
              const x2 = to.x
              const y2 = to.y + GRAPH_NODE_HEIGHT / 2
              const midX = (x1 + x2) / 2
              return (
                <g key={`${edge.fromVideoId}::${edge.toVideoId}`}>
                  <path
                    d={`M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`}
                    fill="none"
                    stroke="#c7cbd1"
                    strokeWidth={1.6}
                    markerEnd="url(#journeyArrow)"
                  />
                  {edge.observedCount > 1 && (
                    <text x={midX} y={(y1 + y2) / 2 - 6} fontSize={10} fill="#9ca3af" textAnchor="middle">
                      ×{edge.observedCount}
                    </text>
                  )}
                </g>
              )
            })}
            {/* STEP 3 (additive) — downstream edges: a terminal video's own
                observed redirect link resolved to a real campaign-element or
                resource node. See journeyDownstreamResolver.ts. No
                conversion data involved. */}
            {downstream.edges.map((edge) => {
              const from = positionedGraphNodes.find((n) => n.videoId === edge.fromVideoId)
              const to = positionedDownstreamNodes.find((n) => n.id === edge.toNodeId)
              if (!from || !to) return null
              const x1 = from.x + GRAPH_NODE_WIDTH
              const y1 = from.y + GRAPH_NODE_HEIGHT / 2
              const x2 = to.x
              const y2 = to.y + GRAPH_NODE_HEIGHT / 2
              const midX = (x1 + x2) / 2
              return (
                <path
                  key={`downstream-${edge.fromVideoId}::${edge.toNodeId}`}
                  d={`M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`}
                  fill="none"
                  stroke="#c7cbd1"
                  strokeWidth={1.6}
                  markerEnd="url(#journeyArrow)"
                />
              )
            })}
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

          {positionedGraphNodes.map((gNode) => {
            // A "terminal" video (per journeyGraph.ts's video->video edges)
            // may still have a resolved downstream node (STEP 3) — if so it
            // isn't really the end of the path, just the end of the
            // video->video portion of it.
            const stillTerminal = gNode.isTerminal && !videoIdsWithDownstream.has(gNode.videoId)
            return (
              <div
                key={gNode.videoId}
                style={{
                  ...styles.graphNode,
                  ...(stillTerminal ? styles.graphNodeTerminal : null),
                  left: gNode.x,
                  top: gNode.y,
                  width: GRAPH_NODE_WIDTH,
                  height: GRAPH_NODE_HEIGHT,
                  borderLeft: `3px solid ${GRAPH_TYPE_ACCENT[gNode.visualType]}`,
                }}
              >
                <div style={styles.graphNodeHead}>
                  <span style={{ ...styles.graphNodeTypeDot, background: GRAPH_TYPE_ACCENT[gNode.visualType] }} />
                  <span style={styles.graphNodeType}>
                    {GRAPH_TYPE_LABEL[gNode.visualType]}{stillTerminal ? ' · end of path' : ''}
                  </span>
                </div>
                <div style={styles.graphNodeVideoId} title={gNode.videoId}>{gNode.videoId}</div>
                {gNode.observedAssetIds[0] && (
                  <div style={styles.graphNodeDebug} title={gNode.observedAssetIds[0]}>
                    asset: {gNode.observedAssetIds[0]}
                  </div>
                )}
              </div>
            )
          })}

          {/* STEP 3 (additive) — downstream nodes resolved from a terminal
              video step's own observed redirect link. Structural only — no
              conversion/click/revenue numbers here yet (separate follow-up).
              See journeyDownstreamResolver.ts. */}
          {positionedDownstreamNodes.map((dNode) => (
            <div
              key={dNode.id}
              style={{
                ...styles.graphNode,
                ...styles.graphNodeTerminal,
                left: dNode.x,
                top: dNode.y,
                width: GRAPH_NODE_WIDTH,
                height: GRAPH_NODE_HEIGHT,
                borderLeft: `3px solid ${dNode.kind === 'resource' ? GRAPH_TYPE_ACCENT.resource : GRAPH_TYPE_ACCENT.campaign_element}`,
              }}
            >
              <div style={styles.graphNodeHead}>
                <span
                  style={{
                    ...styles.graphNodeTypeDot,
                    background: dNode.kind === 'resource' ? GRAPH_TYPE_ACCENT.resource : GRAPH_TYPE_ACCENT.campaign_element,
                  }}
                />
                <span style={styles.graphNodeType}>
                  {dNode.kind === 'resource' ? 'Imported resource' : 'Campaign element'} · end of path
                </span>
              </div>
              <div style={styles.graphNodeVideoId}>
                {dNode.elementType ? getElementTypeLabel(dNode.elementType) : 'Unlabeled'}
              </div>
              <div style={styles.graphNodeDebug} title={dNode.redirectLinkId}>
                {dNode.resolvedFrom === 'link_type'
                  ? 'resolved from redirect link_type (no asset_id on this link)'
                  : `asset: ${dNode.assetId}`}
              </div>
            </div>
          ))}

          {graphLoading && (
            <div style={{ ...styles.graphStatusBadge, left: GRAPH_START_X, top: CANVAS_MID_Y - 8 }}>
              Loading observed journeys…
            </div>
          )}
          {!graphLoading && graphError && (
            <div style={{ ...styles.graphStatusBadge, ...styles.graphErrorBadge, left: GRAPH_START_X, top: CANVAS_MID_Y - 8 }}>
              Could not load observed journeys: {graphError}
            </div>
          )}
          {!graphLoading && !graphError && graph && graph.nodes.length === 0 && (
            <div style={{ ...styles.graphStatusBadge, left: GRAPH_START_X, top: CANVAS_MID_Y - 8 }}>
              No observed journeys yet
            </div>
          )}
        </div>

        {nodes.length === 0 && (
          <div style={styles.emptyOverlay}>
            <p style={styles.emptyText}>No assets in this promotion yet.</p>
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

  // ── Observed-graph additions (STEP 2) ───────────────────────────────────
  edgesLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 4000,
    height: 3000,
    overflow: 'visible',
    pointerEvents: 'none',
  },
  graphNode: {
    position: 'absolute',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    overflow: 'hidden',
  },
  graphNodeTerminal: {
    background: '#ecfdf5',
    border: '1px dashed #a7f3d0',
    boxShadow: 'none',
  },
  graphNodeHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  graphNodeTypeDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  graphNodeType: {
    fontSize: 10.5,
    fontWeight: 600,
    color: '#6b7280',
  },
  graphNodeVideoId: {
    fontSize: 11,
    fontWeight: 600,
    color: '#111827',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  graphNodeDebug: {
    fontSize: 9.5,
    color: '#9ca3af',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  graphStatusBadge: {
    position: 'absolute',
    fontSize: 12,
    color: '#9ca3af',
    maxWidth: 260,
  },
  graphErrorBadge: {
    color: '#dc2626',
  },
}
