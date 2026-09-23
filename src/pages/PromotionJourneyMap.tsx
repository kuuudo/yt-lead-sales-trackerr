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
import { ArrowLeft, Loader2, Plus, Copy, Check, GripVertical, X as XIcon, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
// Separate analytics panel — vertical bar chart of observed transition
// volume from graph.edges. Does not participate in the canvas above.
import PromotionJourneyVolumeChart from './PromotionJourneyVolumeChart'
// STEP 6 (additive) — same URL builder VideoDetail.tsx uses for its own
// copyable redirect links. Reused here so the tracked link shown on the
// Test Your Journey card is built the exact same way, not reinvented.
import { buildTrackingLinkUrl } from '../services/redirect/getPromotedAssetDisplay'
// STEP 6 (additive) — needed only to re-resolve a single journey_id's
// current step count while "watching." Does not import getJourneysForEvent
// or getJourneysForSessionId — this page only ever knows a redirect_link_id
// and, once found, a journey_id, never an event_id or session_id.
import { getJourneyById } from '../lib/journey'
import { useAuth } from '../lib/auth'
import { useOrganization } from '../lib/useOrganization'
import { createVideo } from '../services/video/createVideo'
import { generateAssetRedirectLinks } from '../services/asset/generateAssetRedirectLinks'
import { PromotedAssetPicker, type PromotedAssetRow } from '../components/PromotedAssetPicker'
import { PromotedAssetsPathBPanel } from '../components/PromotedAssetsPathBPanel'
// STEP 6c (additive) — always-looping, fictional funnel illustration. See
// JourneyFunnelDemo.tsx's own header for why its numbers are NOT real.
import JourneyFunnelDemo from '../components/JourneyFunnelDemo'
import {
  listCreativeEligibleAssignmentsForMarketer,
  loadAssignmentAssetsForCreative,
  type CreativeEligibleAssignment,
} from '../services/promotion/listCreativeEligibleCampaigns'
import { resolvePromotionContextForAsset } from '../services/asset/resolvePromotionContextForAsset'
import type { CampaignLinkTypeKey } from '../services/video/createVideo'

import type { PromotionContext } from '../services/asset/resolvePromotionContextForAsset'

import { getPromotionDetail } from '../services/promotion/getPromotionDetail'
import type { PromotionDetailData } from '../services/promotion/getPromotionDetail'
import { getAssetDetail } from '../services/asset/getAssetDetail'
import {
  resolveAssetThumbnail,
  resolveElementThumbnail,
  resolveThumbnail,
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
import { resolveDownstreamNodes, resolveDownstreamForVideoIds, type DownstreamResolution, type DownstreamNode } from '../services/journey/journeyDownstreamResolver'

// ─── STEP 5 (additive, 2026-09-18) — "Unlinked" promoted videos ───────────────
// Videos created to promote one of THIS promotion's assets, found purely from
// redirect_links (promotion_id + asset_id). Read-only, single table, no
// events_journey involvement at any point. Does NOT touch journeyDiscovery.ts,
// journeyGraph.ts, journeyAnalyticsEngine.ts, attribution, conversions or
// revenue, and does NOT participate in the journey graph or its edges.

// ─── Local node model (Phase 1 — no edges, no persistence) ────────────────────

interface JourneyNode {
  assetId: string
  promotionAssetId: string
  title: string
  thumbnailSrc: string | null
  x: number
  y: number
  /** Video created via Creative mode and attached to this Promotion */
  isCreative?: boolean
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

// ─── "Unlinked" group layout (STEP 5, additive) ───────────────────────────────
// Its own region of the canvas, below the promoted-asset column. Deliberately
// NOT on the graph's x-axis and NOT connected to any edge. Cards are smaller
// than the promoted-asset cards (NODE_WIDTH 180) on purpose — this is a
// secondary group, it shouldn't compete visually with the promoted assets.
const UNLINKED_NODE_WIDTH = 124
const UNLINKED_NODE_HEIGHT = 102
const UNLINKED_THUMB_HEIGHT = 70
const UNLINKED_NODE_GAP = 18
const UNLINKED_MIN_RADIUS = 112
const UNLINKED_RING_PADDING = 22
const UNLINKED_GROUP_GAP_Y = 110

// Creative promoted assets — same ring idea as Unlinked, green palette, ABOVE the gold column
const CREATIVE_NODE_WIDTH = 124
const CREATIVE_NODE_HEIGHT = 102
const CREATIVE_THUMB_HEIGHT = 70
const CREATIVE_NODE_GAP = 18
const CREATIVE_MIN_RADIUS = 112
const CREATIVE_RING_PADDING = 22
const CREATIVE_GROUP_GAP_Y = 110

// A video reached only through redirect_links (promotion_id + asset_id).
// Display fields are best-effort — see the STEP 5 effect.
interface UnlinkedVideo {
  videoId: string
  title: string | null
  thumbnailUrl: string
  // STEP 6 additions — same redirect_links row STEP 5 already reads, just
  // two more columns off it. redirectLinkId is redirect_links.id (the FK
  // events_journey.redirect_link_id actually points at — NOT the token).
  // token is what buildTrackingLinkUrl() needs to render the copyable URL.
  redirectLinkId: string
  token: string
  // STEP 7 addition — same videos.platform_url column used for the node
  // card icon, so the tutorial/test card can also link to the original
  // content, not just the tracked redirect link.
  platformUrl: string | null
}

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

/** Shared vertical stack: Creative ring (optional) ABOVE gold column, no overlap. */
function measureCreativeRing(creativeCount: number): { diameter: number; ringRadius: number } | null {
  if (creativeCount <= 0) return null
  const ringRadius = Math.max(
    CREATIVE_MIN_RADIUS,
    (creativeCount * (CREATIVE_NODE_WIDTH + CREATIVE_NODE_GAP)) / (2 * Math.PI),
  )
  const diameter =
    ringRadius * 2 +
    Math.max(CREATIVE_NODE_WIDTH, CREATIVE_NODE_HEIGHT) +
    CREATIVE_RING_PADDING * 2
  return { diameter, ringRadius }
}

function layoutNodes(
  assets: Array<PromotionDetailData['assets'][number] & { isCreative?: boolean }>
): JourneyNode[] {
  // Gold column = non-Creative promoted assets only.
  // When Creative exists, the whole stack (ring + gap + column) is centered on
  // CANVAS_MID_Y so the green ring sits fully above the gold cards.
  const regular = assets.filter((a) => !a.isCreative)
  const creativeCount = assets.filter((a) => a.isCreative).length
  const ring = measureCreativeRing(creativeCount)

  const columnHeight =
    regular.length * NODE_HEIGHT + Math.max(0, regular.length - 1) * GRID_GAP_Y
  const stackHeight =
    (ring ? ring.diameter + CREATIVE_GROUP_GAP_Y : 0) + columnHeight
  const stackTop = CANVAS_MID_Y - stackHeight / 2
  const goldStartY = stackTop + (ring ? ring.diameter + CREATIVE_GROUP_GAP_Y : 0)

  return regular.map((a, i) => {
    return {
      assetId: a.assetId,
      promotionAssetId: a.promotionAssetId,
      title: a.resource?.title || 'Untitled asset',
      thumbnailSrc: resolveNodeThumbnail(a.resource),
      x: CANVAS_MARGIN,
      y: goldStartY + i * (NODE_HEIGHT + GRID_GAP_Y),
      isCreative: false,
    }
  })
}

function layoutCreativeNodes(
  assets: Array<PromotionDetailData['assets'][number] & { isCreative?: boolean }>,
  regularCount: number,
): { left: number; top: number; diameter: number; placed: JourneyNode[] } | null {
  const creative = assets.filter((a) => a.isCreative)
  if (creative.length === 0) return null

  const count = creative.length
  const ring = measureCreativeRing(count)!
  const { diameter, ringRadius } = ring
  const center = diameter / 2

  const columnHeight =
    regularCount * NODE_HEIGHT + Math.max(0, regularCount - 1) * GRID_GAP_Y
  const stackHeight = diameter + CREATIVE_GROUP_GAP_Y + columnHeight
  const stackTop = CANVAS_MID_Y - stackHeight / 2
  // Ring occupies the top of the stack; gold column starts below the gap.
  const top = stackTop
  // Horizontally align ring center with gold column center
  const left = CANVAS_MARGIN + NODE_WIDTH / 2 - diameter / 2

  const placed = creative.map((a, i) => {
    const angle = -Math.PI / 2 + (i / count) * 2 * Math.PI
    return {
      assetId: a.assetId,
      promotionAssetId: a.promotionAssetId,
      title: a.resource?.title || 'Untitled asset',
      thumbnailSrc: resolveNodeThumbnail(a.resource),
      x: left + center + ringRadius * Math.cos(angle) - CREATIVE_NODE_WIDTH / 2,
      y: top + center + ringRadius * Math.sin(angle) - CREATIVE_NODE_HEIGHT / 2,
      isCreative: true,
    }
  })

  return { left, top, diameter, placed }
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

// STEP 4 (additive) — merge two DownstreamResolution results, deduping by
// node id (stable — see journeyDownstreamResolver.ts's `redirect:${id}`
// scheme) and by (fromVideoId, toNodeId) edge pair. Needed because a
// promotion can have BOTH observed traffic (STEP 3) and directly-resolved
// redirect_links (STEP 4) touching the same redirect link.
function mergeDownstreamResolutions(a: DownstreamResolution, b: DownstreamResolution): DownstreamResolution {
  const nodeById = new Map(a.nodes.map((n) => [n.id, n]))
  for (const n of b.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n)

  const edgeKeys = new Set(a.edges.map((e) => `${e.fromVideoId}::${e.toNodeId}`))
  const edges = [...a.edges]
  for (const e of b.edges) {
    const key = `${e.fromVideoId}::${e.toNodeId}`
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key)
      edges.push(e)
    }
  }

  return { nodes: Array.from(nodeById.values()), edges }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PromotionJourneyMap() {
  const { promotionId } = useParams<{ promotionId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { organizationId } = useOrganization()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promotionTitle, setPromotionTitle] = useState<string>('Promotion')
  const [promotionDetail, setPromotionDetail] = useState<PromotionDetailData | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Track New Content (promotion locked to this page)
  const [showTrackModal, setShowTrackModal] = useState(false)
  const [trackUrl, setTrackUrl] = useState('')
  const [trackPlatform, setTrackPlatform] = useState<'youtube' | 'tiktok' | 'instagram' | 'linkedin' | 'x' | 'threads' | 'facebook' | 'reddit' | 'twitch'>('youtube')
  const [trackCampaignId, setTrackCampaignId] = useState('')
  const [trackCampaigns, setTrackCampaigns] = useState<Array<{ id: string; campaign_name: string }>>([])
  const [trackCampaignLocked, setTrackCampaignLocked] = useState(false)
  const [trackCreativeMode, setTrackCreativeMode] = useState<string | null>(null)
  const [trackSponsorOrgId, setTrackSponsorOrgId] = useState<string | null>(null)
  const [trackPromotedAssets, setTrackPromotedAssets] = useState<PromotedAssetRow[]>([])
  const [showTrackAssetPicker, setShowTrackAssetPicker] = useState(false)
  const [trackSaving, setTrackSaving] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)
  const [trackDomainByAssetId, setTrackDomainByAssetId] = useState<Map<string, string | null>>(new Map())
  const [trackPromoCtxByAssetId, setTrackPromoCtxByAssetId] = useState<Map<string, PromotionContext | null>>(new Map())
  const [trackAssetScope, setTrackAssetScope] = useState<'promotion_only' | 'allow_additional' | null>(null)
  const [creativeOnlyAssetIds, setCreativeOnlyAssetIds] = useState<string[]>([])
  const [creativeRestrictionsLoading, setCreativeRestrictionsLoading] = useState(false)
  const [creativeEligibleAssignments, setCreativeEligibleAssignments] = useState<CreativeEligibleAssignment[]>([])
  const [selectedCampaignLinkTypes, setSelectedCampaignLinkTypes] = useState<CampaignLinkTypeKey[]>([])
  const [showCampaignLinksPicker, setShowCampaignLinksPicker] = useState(false)
  const [nodes, setNodes] = useState<JourneyNode[]>([])
  const [creativeGroupLayout, setCreativeGroupLayout] = useState<{
    left: number
    top: number
    diameter: number
    placed: JourneyNode[]
  } | null>(null)

  // Observed journey graph (additive — separate from promoted-asset state above)
  const [graph, setGraph] = useState<JourneyGraph | null>(null)
  const [graphLoading, setGraphLoading] = useState(true)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [nodeVisualTypes, setNodeVisualTypes] = useState<Map<string, GraphNodeVisualType>>(new Map())
  // ── STEP 8 (additive) — display-layer resolution (title + thumbnail) for
  // journey graph / downstream nodes. Read-only joins against existing
  // tables/resolvers only — does NOT touch events_journey or journey_snapshot.
const [videoDisplayByVideoId, setVideoDisplayByVideoId] = useState<
  Map<string, { title: string; thumbnailUrl: string }>
>(new Map())
const [assetDisplayByAssetId, setAssetDisplayByAssetId] = useState<
  Map<string, { title: string; thumbnailUrl: string | null }>
>(new Map())

  // ── STEP 9 (additive) — node detail modal (click a graph/downstream node) ──
const [nodeDetailTarget, setNodeDetailTarget] = useState<
  { kind: 'video'; videoId: string } | { kind: 'asset'; assetId: string } | null
>(null)
  const [nodeDetailVideo, setNodeDetailVideo] = useState<{
    id: string
    title: string | null
    platform: string | null
    platformUrl: string | null
    status: string | null
    publishedDate: string | null
    assetId: string | null
  } | null>(null)
  const [nodeDetailAsset, setNodeDetailAsset] = useState<{
    assetId: string
    title: string
    thumbnailUrl: string | null
  } | null>(null)
  const [nodeDetailRedirectLinks, setNodeDetailRedirectLinks] = useState<{ id: string; token: string }[]>([])
  const [nodeDetailLoading, setNodeDetailLoading] = useState(false)

  // Downstream resolution (additive — STEP 3). Structural only, no
  // conversion data. See journeyDownstreamResolver.ts.
  const [downstream, setDownstream] = useState<DownstreamResolution>({ nodes: [], edges: [] })

  // STEP 4 (additive, 2026-09-15) — assetId -> videos.id for each promoted
  // asset whose resource.origin === 'video', via the existing getAssetDetail().
  // Used to (a) query redirect_links directly by video_id, no events_journey
  // required, and (b) anchor a resolved downstream node to the promoted
  // asset's own card when that video has no observed-graph position.
  const [promotedAssetVideoIds, setPromotedAssetVideoIds] = useState<Map<string, string>>(new Map())

  // STEP 5 (additive, 2026-09-18) — videos from redirect_links rows whose
  // promotion_id is this promotion AND whose asset_id is one of the assets
  // actually promoted here. Deduped, nulls dropped. No events_journey.
  // title/thumbnailUrl are a best-effort display lookup — if the `videos`
  // read fails, the card still renders with the id as its label.
  const [unlinkedCandidates, setUnlinkedCandidates] = useState<UnlinkedVideo[]>([])
  // STEP 7 (additive) — asset_id -> videos.platform_url, for the external-
  // link icon on every promoted/creative node card.
  const [platformUrlByAssetId, setPlatformUrlByAssetId] = useState<Map<string, string | null>>(new Map())

  // STEP 6 (additive, 2026-09-20) — "Test your journey" tutorial card. Real
  // and draggable, unlike the demo/onboarding animations discussed for this
  // page — every field here reflects this browser's own actions or actual
  // events_journey rows, never simulated progress. Always shown (2026-09-20
  // revision) rather than gated on picking a video, because its first two
  // steps (Track New Content, pick a video from Unlinked) happen BEFORE any
  // video is targeted. Steps 3-6 stay tied to exactly one targeted video
  // (testCardTarget) at a time — opening it for a different video replaces
  // the target and resets steps 3-6.
  const [hasClickedTrackNewContent, setHasClickedTrackNewContent] = useState(false)
  const [testCardTarget, setTestCardTarget] = useState<UnlinkedVideo | null>(null)
  const [testCardPos, setTestCardPos] = useState<{ x: number; y: number }>({
    x: CANVAS_MARGIN,
    y: CANVAS_MID_Y + 260,
  })
  const [testCardCopied, setTestCardCopied] = useState(false)
  // Persistent version of testCardCopied — that one flips back to false
  // after 2s (it only drives the button's "Copied" label), but step 3 of
  // the checklist needs to stay checked once it's ever happened.
  const [testCardEverCopied, setTestCardEverCopied] = useState(false)
  const [testCardWatching, setTestCardWatching] = useState(false)
  const [testCardWatchStartedAt, setTestCardWatchStartedAt] = useState<number | null>(null)
  // Set once STEP 6b's poll finds a NEW events_journey row on this link's
  // own redirect_link_id. Until then we don't have a journey_id to resolve.
  const [testCardJourneyId, setTestCardJourneyId] = useState<string | null>(null)
  const [testCardStepCount, setTestCardStepCount] = useState(0)

  // STEP 6d (additive, 2026-09-20 revision) — separate popup modal for the
  // actual link/copy/watch UI, brought back per feedback: the tutorial card
  // above stays put and just tracks the checklist; clicking a video in the
  // Unlinked ring pops this modal open near that video instead of folding
  // its content into the tutorial card. testCardTarget/Copied/Watching/etc.
  // above are still shared with this modal (it's the same underlying
  // progress), but position and open/closed state are separate so closing
  // this modal doesn't blank the tutorial card's checklist.
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkModalPos, setLinkModalPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // STEP 6c (additive, 2026-09-20 revision) — funnel demo is now draggable
  // and always shown (previously gated on unlinkedGroup existing). Position
  // is local-only, same as testCardPos — not persisted.
  const [funnelDemoPos, setFunnelDemoPos] = useState<{ x: number; y: number }>({
    x: CANVAS_MARGIN,
    y: CANVAS_MID_Y + 420,
  })

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
        setPromotionDetail(detail)
        {
          const scope = (detail as any)?.assignment?.asset_scope as string | undefined
          setTrackAssetScope(
            scope === 'allow_additional'
              ? 'allow_additional'
              : scope === 'promotion_only'
                ? 'promotion_only'
                : null,
          )
        }
        const assetIds = detail.assets.map((a) => a.assetId).filter(Boolean)
        let creativeAssetIds = new Set<string>()
        // STEP 7 (additive, 2026-09-20) — platform_url per promoted asset,
        // for the external-link icon on each node card. Folded into this
        // existing videos-by-asset_id query (same table, same ids) rather
        // than adding a second near-duplicate query — the only change from
        // before is two extra select columns and dropping the
        // created_via_creative filter so it also covers non-creative assets.
        const platformUrlMap = new Map<string, string | null>()
        if (assetIds.length > 0) {
          const { data: videoRows } = await supabase
            .from('videos')
            .select('asset_id, platform_url, created_via_creative')
            .in('asset_id', assetIds)
          for (const r of (videoRows ?? []) as { asset_id: string | null; platform_url: string | null; created_via_creative: boolean | null }[]) {
            if (!r.asset_id) continue
            platformUrlMap.set(r.asset_id, r.platform_url ?? null)
            if (r.created_via_creative) creativeAssetIds.add(r.asset_id)
          }
        }
        setPlatformUrlByAssetId(platformUrlMap)
        const tagged = detail.assets.map((a) => ({
          ...a,
          isCreative: creativeAssetIds.has(a.assetId),
        }))
        setNodes(layoutNodes(tagged))
        setCreativeGroupLayout(
          layoutCreativeNodes(
            tagged,
            tagged.filter((a) => !a.isCreative).length,
          ),
        )
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load this promotion.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [promotionId, reloadToken])

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
        // ── TEMPORARY DEBUG (remove after diagnosis — 2026-09-15) ───────────
        console.log('[PromotionJourneyMap] promotionId =', promotionId)
        console.log('[PromotionJourneyMap] discovered.length =', discovered.length)
        console.log(
          '[PromotionJourneyMap] discovered detail =',
          discovered.map((d) => ({ journeyId: d.journeyId, stepCount: d.path.steps.length })),
        )
        // ── end temporary debug ──────────────────────────────────────────────
        const built = buildJourneyGraph(discovered)
        if (cancelled) return

        // ── STEP 8 (additive) — same table/columns/helper as STEP 5's
        // "Unlinked" video lookup below (videos.id / video_title /
        // thumbnail_url / platform -> resolveThumbnail()), so YouTube /
        // Instagram / TikTok / etc. all use the same platform-correct
        // fallback already used elsewhere in this file.
        const graphVideoIds = Array.from(new Set(built.nodes.map((n) => n.videoId)))
        if (graphVideoIds.length > 0) {
          try {
            const { data: videoDisplayRows, error: videoDisplayError } = await supabase
              .from('videos')
              .select('id, video_title, thumbnail_url, platform')
              .in('id', graphVideoIds)
            if (videoDisplayError) throw videoDisplayError
            if (!cancelled) {
              const map = new Map<string, { title: string; thumbnailUrl: string }>()
              for (const v of (videoDisplayRows ?? []) as {
                id: string
                video_title: string | null
                thumbnail_url: string | null
                platform: string | null
              }[]) {
                map.set(v.id, {
                  title: v.video_title || 'Untitled video',
                  thumbnailUrl: resolveThumbnail({ thumbnail_url: v.thumbnail_url, platform: v.platform }),
                })
              }
              setVideoDisplayByVideoId(map)
            }
          } catch (videoDisplayErr: any) {
            // Additive display-only lookup — must not blank out the graph
            // itself (mirrors STEP 4/5's error handling).
            console.error('[PromotionJourneyMap] STEP 8 video display lookup failed:', videoDisplayErr?.message || videoDisplayErr)
          }
        }

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

  const allPromotedNodes = useMemo(
    () => [...nodes, ...(creativeGroupLayout?.placed ?? [])],
    [nodes, creativeGroupLayout],
  )

  // ── STEP 4 (additive, 2026-09-15) — direct promoted-asset downstream ─────
  // No events_journey / observed-traffic prerequisite. Runs whenever the
  // promoted-asset list changes, independent of the STEP 3 effect above.
  useEffect(() => {
    if (!promotionId || allPromotedNodes.length === 0) return
    let cancelled = false

    ;(async () => {
      // getAssetDetail() is existing, unmodified — same resolver
      // AssetDetail.tsx uses. Only video-origin assets have a videos.id to
      // give us (see journeyDownstreamResolver.ts header for why
      // campaign_element/resource assets don't have one).
      const entries = await Promise.all(
        allPromotedNodes.map(async (n) => {
          const detail = await getAssetDetail(n.assetId)
          if (detail?.resource?.origin === 'video') {
            return [n.assetId, detail.resource.originId] as const
          }
          return null
        }),
      )
      if (cancelled) return

      const videoIdMap = new Map(entries.filter((e): e is readonly [string, string] => e !== null))
      setPromotedAssetVideoIds(videoIdMap)

      const videoIds = Array.from(new Set(videoIdMap.values()))
      if (videoIds.length === 0) return

      try {
        const direct = await resolveDownstreamForVideoIds(videoIds, promotionId)
        if (cancelled) return
        setDownstream((prev) => mergeDownstreamResolutions(prev, direct))
      } catch (err: any) {
        // Additive path — a failure here should not blank out whatever
        // STEP 3 already resolved from observed traffic. Logged, not
        // surfaced as a page-level error (mirrors graphError's scope).
        console.error('[PromotionJourneyMap] STEP 4 direct downstream resolution failed:', err?.message || err)
      }
    })()

    return () => { cancelled = true }
  }, [promotionId, allPromotedNodes])

  const [graphNodeDragOverrides, setGraphNodeDragOverrides] = useState<Map<string, { x: number; y: number }>>(
    new Map(),
  )

  const positionedGraphNodes = useMemo(() => {
    const base = graph ? layoutGraphNodes(graph, nodeVisualTypes) : []
    if (graphNodeDragOverrides.size === 0) return base
    return base.map((n) => {
      const override = graphNodeDragOverrides.get(n.videoId)
      return override ? { ...n, x: override.x, y: override.y } : n
    })
  }, [graph, nodeVisualTypes, graphNodeDragOverrides])

  // ── STEP 8 (additive) — asset-based display fallback for nodes whose
  // content isn't itself a `videos` row (campaign elements, imported
  // resources — e.g. a Consultation or Landing Page). Reuses the exact same
  // resolver (getAssetDetail + resolveNodeThumbnail) already used for the
  // promoted-asset column — no second thumbnail system.
  const assetDisplayFetchedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const neededAssetIds = new Set<string>()
    for (const n of graph?.nodes ?? []) {
      if (n.observedAssetIds[0]) neededAssetIds.add(n.observedAssetIds[0])
    }
    for (const d of downstream.nodes) {
      if (d.assetId) neededAssetIds.add(d.assetId)
    }
    for (const n of allPromotedNodes) neededAssetIds.delete(n.assetId)
    for (const id of assetDisplayFetchedRef.current) neededAssetIds.delete(id)
    if (neededAssetIds.size === 0) return
    for (const id of neededAssetIds) assetDisplayFetchedRef.current.add(id)

    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        Array.from(neededAssetIds).map(async (assetId) => {
          try {
            const detail = await getAssetDetail(assetId)
            if (!detail?.resource) return null
            return [
              assetId,
              {
                title: detail.resource.title || 'Untitled asset',
                thumbnailUrl: resolveNodeThumbnail(detail.resource),
              },
            ] as const
          } catch {
            return null
          }
        }),
      )
      if (cancelled) return
      setAssetDisplayByAssetId((prev) => {
        const next = new Map(prev)
        for (const entry of entries) {
          if (entry) next.set(entry[0], entry[1])
        }
        return next
      })
    })()

    return () => { cancelled = true }
  }, [graph, downstream, allPromotedNodes])

  // Merges the two asset-display sources above: the already-loaded
  // promoted-asset column (free, no extra query) first, then the STEP 8
  // fallback fetch for assets that appear in the graph but aren't already a
  // promoted-asset card.
  const resolveGraphAssetDisplay = (
    assetId: string,
  ): { title: string; thumbnailUrl: string | null } | undefined => {
    const promoted = allPromotedNodes.find((n) => n.assetId === assetId)
    if (promoted) return { title: promoted.title, thumbnailUrl: promoted.thumbnailSrc }
    return assetDisplayByAssetId.get(assetId)
  }


  // ── STEP 9 (additive) — fetch full video/asset row + every redirect_link
  // pointing at this content, on demand when a node is clicked. Read-only,
  // no writes, does not touch events_journey or journey_snapshot.
  useEffect(() => {
    if (!nodeDetailTarget) {
      setNodeDetailVideo(null)
      setNodeDetailAsset(null)
      setNodeDetailRedirectLinks([])
      return
    }
    let cancelled = false
    setNodeDetailLoading(true)

    ;(async () => {
      try {
        if (nodeDetailTarget.kind === 'video') {
          const { data: videoRow, error: videoErr } = await supabase
            .from('videos')
            .select('id, video_title, platform, platform_url, status, published_date, asset_id')
            .eq('id', nodeDetailTarget.videoId)
            .maybeSingle()
          if (videoErr) throw videoErr
          if (cancelled) return
          setNodeDetailVideo(
            videoRow
              ? {
                  id: videoRow.id,
                  title: videoRow.video_title,
                  platform: videoRow.platform,
                  platformUrl: videoRow.platform_url,
                  status: videoRow.status,
                  publishedDate: videoRow.published_date,
                  assetId: videoRow.asset_id,
                }
              : null,
          )
          setNodeDetailAsset(null)

          const { data: linkRows, error: linkErr } = await supabase
            .from('redirect_links')
            .select('id, token')
            .eq('video_id', nodeDetailTarget.videoId)
          if (linkErr) throw linkErr
          if (!cancelled) setNodeDetailRedirectLinks((linkRows ?? []) as { id: string; token: string }[])
        } else {
          const detail = await getAssetDetail(nodeDetailTarget.assetId)
          if (cancelled) return
          setNodeDetailVideo(null)
          setNodeDetailAsset(
            detail?.resource
              ? {
                  assetId: nodeDetailTarget.assetId,
                  title: detail.resource.title || 'Untitled asset',
                  thumbnailUrl: resolveNodeThumbnail(detail.resource),
                }
              : null,
          )

          const { data: linkRows, error: linkErr } = await supabase
            .from('redirect_links')
            .select('id, token')
            .eq('asset_id', nodeDetailTarget.assetId)
          if (linkErr) throw linkErr
          if (!cancelled) setNodeDetailRedirectLinks((linkRows ?? []) as { id: string; token: string }[])
        }
      } catch (err: any) {
        console.error('[PromotionJourneyMap] STEP 9 node detail lookup failed:', err?.message || err)
        if (!cancelled) {
          setNodeDetailVideo(null)
          setNodeDetailAsset(null)
          setNodeDetailRedirectLinks([])
        }
      } finally {
        if (!cancelled) setNodeDetailLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [nodeDetailTarget])

  // Video ids whose terminal step got a resolved downstream node — these no
  // longer render with the "end of path" terminal treatment, since we now
  // know what came next (see journeyDownstreamResolver.ts).
  const videoIdsWithDownstream = useMemo(
    () => new Set(downstream.edges.map((e) => e.fromVideoId)),
    [downstream]
  )

  // STEP 4 (additive) — where a downstream node's source video actually is
  // on screen. Prefers an observed graph-node position (STEP 3); falls back
  // to the promoted asset's own card when this video never appeared in an
  // observed journey but IS one of this promotion's own promoted videos
  // (direct redirect_links path, no events_journey involved).
  const downstreamSourceAnchors = useMemo(() => {
    const assetIdByVideoId = new Map(
      Array.from(promotedAssetVideoIds.entries()).map(([assetId, videoId]) => [videoId, assetId]),
    )
    const anchors = new Map<string, { x: number; y: number; width: number; height: number }>()
    const sourceVideoIds = new Set(downstream.edges.map((e) => e.fromVideoId))
    for (const videoId of sourceVideoIds) {
      const graphSource = positionedGraphNodes.find((p) => p.videoId === videoId)
      if (graphSource) {
        anchors.set(videoId, { x: graphSource.x, y: graphSource.y, width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT })
        continue
      }
      const assetId = assetIdByVideoId.get(videoId)
      const assetSource = assetId ? allPromotedNodes.find((n) => n.assetId === assetId) : undefined
      if (assetSource) {
        anchors.set(videoId, {
          x: assetSource.x,
          y: assetSource.y,
          width: assetSource.isCreative ? CREATIVE_NODE_WIDTH : NODE_WIDTH,
          height: assetSource.isCreative ? CREATIVE_NODE_HEIGHT : NODE_HEIGHT,
        })
      }
    }
    return anchors
  }, [positionedGraphNodes, downstream, promotedAssetVideoIds, allPromotedNodes])

  // Downstream nodes (STEP 3 + STEP 4, additive) — one column past their
  // source's anchor, grouped/stacked when a source has more than one.
  // Purely a positioning pass; layoutGraphNodes() above is untouched.
  const positionedDownstreamNodes = useMemo(() => {
    if (downstream.nodes.length === 0) return []
    const bySource = new Map<string, DownstreamNode[]>()
    for (const n of downstream.nodes) {
      if (!bySource.has(n.sourceVideoId)) bySource.set(n.sourceVideoId, [])
      bySource.get(n.sourceVideoId)!.push(n)
    }
    const positioned: (DownstreamNode & { x: number; y: number })[] = []
    for (const [sourceVideoId, group] of bySource.entries()) {
      const anchor = downstreamSourceAnchors.get(sourceVideoId)
      if (!anchor) continue
      const groupHeight = group.length * GRAPH_NODE_HEIGHT + Math.max(0, group.length - 1) * GRAPH_ROW_GAP
      const startY = anchor.y + anchor.height / 2 - groupHeight / 2
      group.forEach((n, i) => {
        positioned.push({
          ...n,
          x: anchor.x + anchor.width + GRAPH_COL_GAP,
          y: startY + i * (GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP),
        })
      })
    }
    return positioned
  }, [downstreamSourceAnchors, downstream])

  // ── STEP 5 (additive, 2026-09-18) — "Unlinked" promoted videos ───────────
  // Identity constraint is promotion_id + asset_id, never campaign_id, and
  // never a global video search. Keyed off the promoted-asset IDs only (not
  // their x/y), so dragging a card does not refire the query.
  const promotedAssetIdsKey = useMemo(
    () => Array.from(new Set(allPromotedNodes.map((n) => n.assetId))).sort().join(','),
    [allPromotedNodes],
  )

  useEffect(() => {
    if (!promotionId || promotedAssetIdsKey === '') {
      setUnlinkedCandidates([])
      return
    }
    let cancelled = false
    const assetIds = promotedAssetIdsKey.split(',')

    ;(async () => {
      try {
        const { data, error: linkError } = await supabase
          .from('redirect_links')
          .select('id, video_id, asset_id, token')
          .eq('promotion_id', promotionId)
          .in('asset_id', assetIds)
          .not('video_id', 'is', null)
        if (cancelled) return
        if (linkError) throw linkError

        // STEP 6 addition — id/token per video_id, first-seen wins (same dedup
        // rule as `seen`/`ids` below; a video with more than one redirect_link
        // row for this promotion+asset pair is not expected, but if it
        // happens, the test card just uses whichever row we saw first).
        const linkByVideoId = new Map<string, { id: string; token: string }>()
        const seen = new Set<string>()
        const ids: string[] = []
        for (const row of (data ?? []) as { id: string; video_id: string | null; token: string }[]) {
          if (!row.video_id || seen.has(row.video_id)) continue
          seen.add(row.video_id)
          ids.push(row.video_id)
          linkByVideoId.set(row.video_id, { id: row.id, token: row.token })
        }
        if (ids.length === 0) {
          setUnlinkedCandidates([])
          return
        }

        // Display-only lookup, same table/columns/key as getAssetDetail.ts's
        // video branch: `videos.id` (not asset_id — redirect_links.video_id
        // IS videos.id directly) and `video_title` (not `title` — the videos
        // table has no `title` column, only `video_title`). Also resolves
        // platform, so resolveThumbnail() below can fall back to a
        // platform placeholder exactly like the promoted-asset cards do,
        // instead of showing a blank thumbnail when thumbnail_url is empty.
        const meta = new Map<string, { title: string | null; thumbnailUrl: string | null; platform: string | null; platformUrl: string | null }>()
        try {
          const { data: videoRows, error: videoError } = await supabase
            .from('videos')
            .select('id, video_title, thumbnail_url, platform, platform_url')
            .in('id', ids)
          if (videoError) throw videoError
          for (const v of (videoRows ?? []) as { id: string; video_title: string | null; thumbnail_url: string | null; platform: string | null; platform_url: string | null }[]) {
            meta.set(v.id, { title: v.video_title ?? null, thumbnailUrl: v.thumbnail_url ?? null, platform: v.platform ?? null, platformUrl: v.platform_url ?? null })
          }
        } catch (metaErr: any) {
          console.warn('[PromotionJourneyMap] STEP 5 video display lookup failed:', metaErr?.message || metaErr)
        }
        if (cancelled) return

        setUnlinkedCandidates(
          ids.flatMap((videoId) => {
            const link = linkByVideoId.get(videoId)
            // Shouldn't happen — every id in `ids` came from a row that also
            // populated linkByVideoId — but skip rather than render a test
            // card with no working link if it ever does.
            if (!link) return []
            const m = meta.get(videoId)
            return [{
              videoId,
              title: m?.title ?? null,
              thumbnailUrl: resolveThumbnail({ thumbnail_url: m?.thumbnailUrl ?? null, platform: m?.platform ?? null }),
              redirectLinkId: link.id,
              token: link.token,
              platformUrl: m?.platformUrl ?? null,
            }]
          }),
        )
      } catch (err: any) {
        // Additive, non-critical layer — a failure here must never blank out
        // the promoted assets or the observed graph (mirrors STEP 4).
        console.error('[PromotionJourneyMap] STEP 5 redirect_links lookup failed:', err?.message || err)
        if (!cancelled) setUnlinkedCandidates([])
      }
    })()

    return () => { cancelled = true }
  }, [promotionId, promotedAssetIdsKey])

  // "Unlinked" = has a promotion+asset redirect link but has not shown up as
  // an observed journey node. This is a *display* filter over data already
  // fetched above — it does not query or require events_journey. While the
  // graph is still loading, every redirect-link video shows as unlinked.
  const unlinkedVideos = useMemo(() => {
    const observed = new Set(positionedGraphNodes.map((n) => n.videoId))
    return unlinkedCandidates.filter((v) => !observed.has(v.videoId))
  }, [unlinkedCandidates, positionedGraphNodes])

  // One circular group placed below the promoted-asset column. Height is
  // derived from the asset *count*, not the cards' current positions, so the
  // group stays put while a card is being dragged.
  const unlinkedGroup = useMemo(() => {
    const count = unlinkedVideos.length
    if (count === 0) return null

    const ringRadius = Math.max(
      UNLINKED_MIN_RADIUS,
      (count * (UNLINKED_NODE_WIDTH + UNLINKED_NODE_GAP)) / (2 * Math.PI),
    )
    const diameter = ringRadius * 2 + Math.max(UNLINKED_NODE_WIDTH, UNLINKED_NODE_HEIGHT) + UNLINKED_RING_PADDING * 2
    const center = diameter / 2

    const columnHeight = nodes.length * NODE_HEIGHT + Math.max(0, nodes.length - 1) * GRID_GAP_Y
    const top = Math.max(CANVAS_MARGIN, CANVAS_MID_Y - columnHeight / 2) + columnHeight + UNLINKED_GROUP_GAP_Y

    const placed = unlinkedVideos.map((video, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count
      return {
        ...video,
        x: center + ringRadius * Math.cos(angle) - UNLINKED_NODE_WIDTH / 2,
        y: center + ringRadius * Math.sin(angle) - UNLINKED_NODE_HEIGHT / 2,
      }
    })

    return { left: CANVAS_MARGIN, top, diameter, placed }
  }, [unlinkedVideos, nodes.length])

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
    const nextX = ds.startNodeX + dxCanvas
    const nextY = ds.startNodeY + dyCanvas
    setNodes((prev) =>
      prev.map((n) =>
        n.assetId === ds.assetId ? { ...n, x: nextX, y: nextY } : n
      )
    )
    setCreativeGroupLayout((prev) => {
      if (!prev?.placed.some((n) => n.assetId === ds.assetId)) return prev
      return {
        ...prev,
        placed: prev.placed.map((n) =>
          n.assetId === ds.assetId ? { ...n, x: nextX, y: nextY } : n
        ),
      }
    })
  }, [transform.scale])

  const handleNodePointerUp = useCallback((e: React.PointerEvent, node: JourneyNode) => {
    const ds = dragState.current
    const wasDrag = ds.moved
    dragState.current.assetId = null
    if (!wasDrag) {
      navigate(`/assets/${node.assetId}`)
    }
  }, [navigate])

  const graphNodeDragState = useRef<{
    videoId: string | null
    startClientX: number
    startClientY: number
    startNodeX: number
    startNodeY: number
    moved: boolean
  }>({ videoId: null, startClientX: 0, startClientY: 0, startNodeX: 0, startNodeY: 0, moved: false })

  const handleGraphNodePointerDown = useCallback((e: React.PointerEvent, gNode: PositionedGraphNode) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    graphNodeDragState.current = {
      videoId: gNode.videoId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startNodeX: gNode.x,
      startNodeY: gNode.y,
      moved: false,
    }
  }, [])

  const handleGraphNodePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = graphNodeDragState.current
    if (!ds.videoId) return
    const dxScreen = e.clientX - ds.startClientX
    const dyScreen = e.clientY - ds.startClientY
    if (Math.hypot(dxScreen, dyScreen) > DRAG_THRESHOLD_PX) ds.moved = true
    const nextX = ds.startNodeX + dxScreen / transform.scale
    const nextY = ds.startNodeY + dyScreen / transform.scale
    setGraphNodeDragOverrides((prev) => {
      const next = new Map(prev)
      next.set(ds.videoId as string, { x: nextX, y: nextY })
      return next
    })
  }, [transform.scale])

  const handleGraphNodePointerUp = useCallback((e: React.PointerEvent, gNode: PositionedGraphNode) => {
    const ds = graphNodeDragState.current
    const wasDrag = ds.moved
    graphNodeDragState.current.videoId = null
    if (!wasDrag) {
      setNodeDetailTarget({ kind: 'video', videoId: gNode.videoId })
    }
  }, [])

  // ── STEP 6 (additive) — Test Your Journey card drag ──────────────────────
  // Deliberately separate from dragState above (which is keyed by assetId
  // and drags the whole promoted-asset card). This card has real buttons
  // inside it (Copy, "start watching"), so only its header/grip handle is
  // wired to pointer-down — dragging the card body would eat button clicks.
  const testCardDragState = useRef<{
    active: boolean
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    moved: boolean
  }>({ active: false, startClientX: 0, startClientY: 0, startX: 0, startY: 0, moved: false })

  const handleTestCardHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    testCardDragState.current = {
      active: true,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: testCardPos.x,
      startY: testCardPos.y,
      moved: false,
    }
  }, [testCardPos])

  const handleTestCardHandlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = testCardDragState.current
    if (!ds.active) return
    const dxScreen = e.clientX - ds.startClientX
    const dyScreen = e.clientY - ds.startClientY
    if (Math.hypot(dxScreen, dyScreen) > DRAG_THRESHOLD_PX) ds.moved = true
    setTestCardPos({
      x: ds.startX + dxScreen / transform.scale,
      y: ds.startY + dyScreen / transform.scale,
    })
  }, [transform.scale])

  const handleTestCardHandlePointerUp = useCallback(() => {
    testCardDragState.current.active = false
  }, [])

  // ── STEP 6d (additive) — popup link-modal drag ────────────────────────────
  // Same handle-only pattern, independent of testCardDragState above (that
  // one now drags the stable tutorial card; this drags the per-click popup).
  const linkModalDragState = useRef<{
    active: boolean
    startClientX: number
    startClientY: number
    startX: number
    startY: number
  }>({ active: false, startClientX: 0, startClientY: 0, startX: 0, startY: 0 })

  const handleLinkModalHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    linkModalDragState.current = {
      active: true,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: linkModalPos.x,
      startY: linkModalPos.y,
    }
  }, [linkModalPos])

  const handleLinkModalHandlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = linkModalDragState.current
    if (!ds.active) return
    setLinkModalPos({
      x: ds.startX + (e.clientX - ds.startClientX) / transform.scale,
      y: ds.startY + (e.clientY - ds.startClientY) / transform.scale,
    })
  }, [transform.scale])

  const handleLinkModalHandlePointerUp = useCallback(() => {
    linkModalDragState.current.active = false
  }, [])

  // ── STEP 6c (additive) — funnel demo drag ─────────────────────────────────
  // Same handle-only pattern as the test card above (its own pause button
  // needs to stay clickable, so only a drag strip is wired to pointer-down).
  const funnelDragState = useRef<{
    active: boolean
    startClientX: number
    startClientY: number
    startX: number
    startY: number
  }>({ active: false, startClientX: 0, startClientY: 0, startX: 0, startY: 0 })

  const handleFunnelHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    funnelDragState.current = {
      active: true,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: funnelDemoPos.x,
      startY: funnelDemoPos.y,
    }
  }, [funnelDemoPos])

  const handleFunnelHandlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = funnelDragState.current
    if (!ds.active) return
    setFunnelDemoPos({
      x: ds.startX + (e.clientX - ds.startClientX) / transform.scale,
      y: ds.startY + (e.clientY - ds.startClientY) / transform.scale,
    })
  }, [transform.scale])

  const handleFunnelHandlePointerUp = useCallback(() => {
    funnelDragState.current.active = false
  }, [])

  // Opens (or retargets) the card for one specific unlinked video, positioned
  // just to the right of that video's own ring position, and resets watch
  // state — a card left "watching" for video A must not silently keep
  // watching video A's link once it's been retargeted at video B.
  const openTestCard = useCallback((v: UnlinkedVideo & { x: number; y: number }) => {
    setTestCardTarget(v)
    setLinkModalPos({ x: v.x + UNLINKED_NODE_WIDTH + 28, y: v.y })
    setLinkModalOpen(true)
    setTestCardCopied(false)
    setTestCardEverCopied(false)
    setTestCardWatching(false)
    setTestCardWatchStartedAt(null)
    setTestCardJourneyId(null)
    setTestCardStepCount(0)
  }, [])

  // ── STEP 6b (additive) — poll for real progress on the ONE tested link ───
  // Two-phase, matches journey.ts's own canonical-row rule:
  //  1. No journey_id yet: look for the first events_journey row created
  //     after watching started whose redirect_link_id is this exact link.
  //     Scoped to one redirect_link_id, not the whole promotion — cheap
  //     enough to poll every few seconds without reusing
  //     discoverPromotionJourneys()'s promotion-wide query.
  //  2. Once a journey_id is known: re-resolve it via getJourneyById()
  //     (journey.ts's own latest-row-wins canonical read) and track how many
  //     steps have landed. Never reads or writes journeyGraph.ts/
  //     journeyDiscovery.ts — this stays a narrow, single-link poll.
  useEffect(() => {
    if (!testCardWatching || !testCardTarget || testCardWatchStartedAt === null) return
    let cancelled = false

    async function poll() {
      try {
        if (!testCardJourneyId) {
          const { data, error: pollError } = await supabase
            .from('events_journey')
            .select('journey_id, created_at')
            .eq('redirect_link_id', testCardTarget!.redirectLinkId)
            .gt('created_at', new Date(testCardWatchStartedAt!).toISOString())
            .order('created_at', { ascending: true })
            .limit(1)
          if (pollError) throw pollError
          const row = ((data ?? [])[0] as { journey_id: string } | undefined)
          if (row && !cancelled) setTestCardJourneyId(row.journey_id)
          return
        }
        const result = await getJourneyById(testCardJourneyId)
        if (!cancelled && result.found) setTestCardStepCount(result.journey.steps.length)
      } catch (err: any) {
        console.error('[PromotionJourneyMap] STEP 6b test-journey poll failed:', err?.message || err)
      }
    }

    poll()
    const intervalId = window.setInterval(poll, 3000)
    return () => { cancelled = true; window.clearInterval(intervalId) }
  }, [testCardWatching, testCardTarget, testCardWatchStartedAt, testCardJourneyId])

  const scalePercent = Math.round(transform.scale * 100)

  useEffect(() => {
    if (!user?.id) return
    listCreativeEligibleAssignmentsForMarketer(user.id)
      .then(setCreativeEligibleAssignments)
      .catch(() => setCreativeEligibleAssignments([]))
  }, [user?.id])

  useEffect(() => {
    if (!showTrackAssetPicker || !user?.id) {
      setCreativeRestrictionsLoading(false)
      return
    }
    let cancelled = false
    setCreativeRestrictionsLoading(true)
    ;(async () => {
      try {
        const creativeIds = new Set(creativeEligibleAssignments.map(a => a.assignmentId))
        if (creativeIds.size === 0) {
          if (!cancelled) setCreativeOnlyAssetIds([])
          return
        }
        const candidateIds = new Set<string>()
        for (const a of creativeEligibleAssignments) {
          try {
            const rows = await loadAssignmentAssetsForCreative(a.assignmentId)
            for (const r of rows) candidateIds.add(r.asset_id)
          } catch { /* ignore */ }
        }
        if (cancelled || candidateIds.size === 0) {
          if (!cancelled) setCreativeOnlyAssetIds([])
          return
        }
        const only: string[] = []
        await Promise.all(
          [...candidateIds].map(async assetId => {
            try {
              const options = await resolvePromotionContextForAsset(assetId, user.id)
              if (options.length > 0 && options.every(o => creativeIds.has(o.assignmentId))) {
                only.push(assetId)
              }
            } catch { /* ignore */ }
          }),
        )
        if (!cancelled) setCreativeOnlyAssetIds(only)
      } finally {
        if (!cancelled) setCreativeRestrictionsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [showTrackAssetPicker, user?.id, creativeEligibleAssignments])

  const isCreativePromotion = !!(
    trackCreativeMode === 'campaign_asset_only' ||
    trackCreativeMode === 'campaign_links_and_assets' ||
    (promotionDetail as any)?.assignment?.creative_creation_mode ||
    (promotionDetail as any)?.promotion?.creative_creation_mode
  )

  const openTrackModal = async () => {
    if (!promotionId || !promotionDetail) return
    setTrackError(null)
    setTrackUrl('')
    setTrackPlatform('youtube')
    const promoCampaignId =
      (promotionDetail as any).promotion?.campaign_id ||
      (promotionDetail as any).campaign_id ||
      ''
    setTrackCampaignId(promoCampaignId || '')
    // Pre-load this promotion's assets (same set shown on the map)
    const preselected: PromotedAssetRow[] = (promotionDetail.assets || []).map((a) => ({
      asset_id: a.assetId,
      display_name: a.resource?.title || 'Untitled asset',
      asset_type: (a.resource?.origin === 'video'
        ? 'video'
        : a.resource?.origin === 'campaign_element'
          ? 'campaign_element'
          : 'resource') as PromotedAssetRow['asset_type'],
      resource_type: (a.resource as any)?.resourceType ?? null,
      element_type: (a.resource as any)?.elementType ?? (a.resource as any)?.resourceType ?? null,
      thumbnail: resolveNodeThumbnail(a.resource),
    }))
    setTrackPromotedAssets(preselected)
    setTrackDomainByAssetId(new Map())
    {
      const scope = (promotionDetail as any)?.assignment?.asset_scope as string | undefined
      if (scope === 'allow_additional' || scope === 'promotion_only') {
        setTrackAssetScope(scope)
      } else {
        // Fallback: read assignments.asset_scope
        const aid =
          (promotionDetail as any)?.assignment?.id ||
          (promotionDetail as any)?.promotion?.assignment_id
        if (aid) {
          supabase
            .from('assignments')
            .select('asset_scope')
            .eq('id', aid)
            .maybeSingle()
            .then(({ data }) => {
              const sc = data?.asset_scope as string | undefined
              setTrackAssetScope(
                sc === 'allow_additional'
                  ? 'allow_additional'
                  : sc === 'promotion_only'
                    ? 'promotion_only'
                    : null,
              )
            })
        }
      }
    }

    // Campaign list — Creative Assignments only allow Sponsor creative campaigns
    const assignmentId =
      (promotionDetail as any)?.assignment?.id ||
      (promotionDetail as any)?.promotion?.assignment_id ||
      null
    let sponsorOrgId =
      (promotionDetail as any).promotion?.organization_id ||
      (promotionDetail as any).assignment?.organization_id ||
      null
    let creativeMode: string | null =
      (promotionDetail as any)?.assignment?.creative_creation_mode || null
    let creativeCampaignId: string | null =
      (promotionDetail as any)?.assignment?.creative_campaign_id || null

    if (assignmentId) {
      const { data: asg } = await supabase
        .from('assignments')
        .select('organization_id, creative_creation_mode, creative_campaign_id, asset_scope')
        .eq('id', assignmentId)
        .maybeSingle()
      if (asg) {
        sponsorOrgId = (asg.organization_id as string) || sponsorOrgId
        creativeMode = (asg.creative_creation_mode as string) || creativeMode
        creativeCampaignId = (asg.creative_campaign_id as string) || creativeCampaignId
        const scope = asg.asset_scope as string | undefined
        if (scope === 'allow_additional' || scope === 'promotion_only') {
          setTrackAssetScope(scope)
        }
      }
    }

    setTrackSponsorOrgId(sponsorOrgId)
    setTrackCreativeMode(creativeMode)

    const isCreative =
      creativeMode === 'campaign_asset_only' || creativeMode === 'campaign_links_and_assets'

    if (isCreative && sponsorOrgId) {
      // Only Sponsor ONLY PROMOTE ASSET (+ optional one normal creative_campaign_id)
      const { data: onlyPromote } = await supabase
        .from('campaigns')
        .select('id, campaign_name, is_system')
        .eq('organization_id', sponsorOrgId)
        .eq('is_system', true)
        .eq('campaign_name', 'ONLY PROMOTE ASSET')
        .maybeSingle()

      const allowed: Array<{ id: string; campaign_name: string }> = []
      if (onlyPromote?.id) {
        allowed.push({
          id: onlyPromote.id as string,
          campaign_name: (onlyPromote.campaign_name as string) || 'ONLY PROMOTE ASSET',
        })
      }

      if (creativeMode === 'campaign_links_and_assets' && creativeCampaignId) {
        const { data: extra } = await supabase
          .from('campaigns')
          .select('id, campaign_name, is_system, archived_at, organization_id')
          .eq('id', creativeCampaignId)
          .maybeSingle()
        if (
          extra &&
          extra.organization_id === sponsorOrgId &&
          !extra.is_system &&
          !extra.archived_at
        ) {
          allowed.push({
            id: extra.id as string,
            campaign_name: (extra.campaign_name as string) || 'Sponsor campaign',
          })
        }
      }

      setTrackCampaigns(allowed)
      setTrackCampaignLocked(true)
      // Prefer promotion.campaign_id if allowed, else creative_campaign_id, else ONLY PROMOTE ASSET
      const preferred =
        (promoCampaignId && allowed.some(c => c.id === promoCampaignId) && promoCampaignId) ||
        (creativeCampaignId && allowed.some(c => c.id === creativeCampaignId) && creativeCampaignId) ||
        allowed[0]?.id ||
        ''
      setTrackCampaignId(preferred)
    } else {
      // Non-creative promotion: Sponsor org campaigns (or viewer org fallback)
      const orgId = sponsorOrgId || organizationId
      setTrackCampaignLocked(false)
      if (orgId) {
        const { data: camps } = await supabase
          .from('campaigns')
          .select('id, campaign_name')
          .eq('organization_id', orgId)
          .is('archived_at', null)
          .order('campaign_name')
        setTrackCampaigns((camps as any[]) || [])
        if (!promoCampaignId && camps?.[0]?.id) setTrackCampaignId(camps[0].id)
        else if (promoCampaignId) setTrackCampaignId(promoCampaignId)
      }
    }
    setShowTrackModal(true)
  }

  const handleTrackSave = async () => {
    if (!user || !promotionId || !promotionDetail) return
    if (!trackUrl.trim()) {
      setTrackError('Enter a video / post URL')
      return
    }
    if (!trackCampaignId) {
      setTrackError('Select a campaign')
      return
    }
    setTrackSaving(true)
    setTrackError(null)
    try {
      const { data: campaignRow, error: campErr } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', trackCampaignId)
        .single()
      if (campErr || !campaignRow) throw new Error(campErr?.message || 'Campaign not found')

      const orgId =
        (isCreativePromotion && trackSponsorOrgId) ||
        (campaignRow as any).organization_id ||
        (promotionDetail as any).promotion?.organization_id ||
        (promotionDetail as any).assignment?.organization_id ||
        organizationId
      if (!orgId) throw new Error('Missing organization')

      const assignmentId =
        (promotionDetail as any).assignment?.id ||
        (promotionDetail as any).promotion?.assignment_id ||
        null

      const rawUrl = trackUrl.trim()
      let video_title = rawUrl
      let thumbnail_url: string | null = null
      let youtube_video_id: string | null = null
      let platform_post_id: string | null = null
      let platform_url = rawUrl

      if (trackPlatform === 'youtube') {
        const vidId = rawUrl.match(/(?:\/|v=)([0-9A-Za-z_-]{11})/)?.[1] || null
        youtube_video_id = vidId
        platform_post_id = vidId
        if (vidId) {
          platform_url = `https://www.youtube.com/watch?v=${vidId}`
          try {
            const response = await fetch(
              `https://www.youtube.com/oembed?url=${encodeURIComponent(platform_url)}&format=json`,
            )
            if (response.ok) {
              const data = await response.json()
              video_title = data.title || video_title
              thumbnail_url = data.thumbnail_url || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`
            } else {
              thumbnail_url = `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`
            }
          } catch {
            thumbnail_url = `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`
          }
        }
      }

      const { savedVideo } = await createVideo({
        payload: {
          platform: trackPlatform,
          platform_url,
          platform_post_id,
          youtube_video_id,
          video_title,
          thumbnail_url,
          campaign_id: trackCampaignId,
          video_goal: ['sales'],
          selected_lead_magnet_ids: null,
          status: 'no_data',
        } as any,
        campaign: campaignRow as any,
        organizationId: orgId,
        userId: user.id,
        campaignLinkTypes: selectedCampaignLinkTypes,
        createdViaCreative: isCreativePromotion,
        creativePromotionId: isCreativePromotion ? promotionId : null,
        creativeAssignmentId: isCreativePromotion ? assignmentId : null,
      } as any)

      if (isCreativePromotion && savedVideo?.asset_id && assignmentId) {
        const { error: attachErr } = await supabase.rpc('attach_creative_content_asset', {
          p_asset_id: savedVideo.asset_id,
          p_assignment_id: assignmentId,
          p_promotion_id: promotionId,
        })
        if (attachErr) console.warn('[JourneyMap] attach_creative_content_asset:', attachErr.message)
      }

      if (trackPromotedAssets.length > 0 && savedVideo?.id) {
        await generateAssetRedirectLinks({
          videoId: savedVideo.id,
          selectedAssets: trackPromotedAssets.map((asset) => ({
            asset_id: asset.asset_id,
            promotionContext: (trackPromoCtxByAssetId.get(asset.asset_id) || {
              promotionId,
              assignmentId,
            }) as any,
            trackingDomainId: trackDomainByAssetId.has(asset.asset_id)
              ? trackDomainByAssetId.get(asset.asset_id) ?? null
              : null,
          })),
        })
      }

      setShowTrackModal(false)
      setTrackPromotedAssets([])
      setReloadToken((t) => t + 1)
    } catch (e: any) {
      setTrackError(e?.message || 'Could not create content')
    } finally {
      setTrackSaving(false)
    }
  }


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
        <button
          type="button"
          onClick={() => {
            setHasClickedTrackNewContent(true)
            openTrackModal()
          }}
          style={styles.trackBtn}
          title="Track new content for this promotion"
        >
          <Plus size={14} /> Track New Content
        </button>
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
            {allPromotedNodes.map((node) => {
              const match = findMatchingGraphNode(node.assetId, positionedGraphNodes)
              if (!match) return null
              const nw = node.isCreative ? CREATIVE_NODE_WIDTH : NODE_WIDTH
              const nh = node.isCreative ? CREATIVE_NODE_HEIGHT : NODE_HEIGHT
              const x1 = node.x + nw
              const y1 = node.y + nh / 2
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
            {/* STEP 3 + STEP 4 (additive) — downstream edges: a video's own
                redirect link resolved to a real campaign-element or resource
                node, either from an observed journey step (STEP 3) or
                directly from the promoted asset's own redirect_links (STEP 4,
                no events_journey required). See journeyDownstreamResolver.ts.
                No conversion data involved either way. */}
            {downstream.edges.map((edge) => {
              const anchor = downstreamSourceAnchors.get(edge.fromVideoId)
              const to = positionedDownstreamNodes.find((n) => n.id === edge.toNodeId)
              if (!anchor || !to) return null
              const x1 = anchor.x + anchor.width
              const y1 = anchor.y + anchor.height / 2
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
              {/* STEP 7 (additive) — jump straight to the original content,
                  bypassing VideoDetail. stopPropagation on both pointerDown
                  and click so this doesn't arm the card's own drag state or
                  trigger its click-to-navigate. */}
              {platformUrlByAssetId.get(node.assetId) && (
                <a
                  href={platformUrlByAssetId.get(node.assetId) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.nodeExternalLinkIcon}
                  title="Open the original content"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          ))}

          {/* Creative promoted assets — green ring (like Unlinked, different palette) */}
          {creativeGroupLayout && creativeGroupLayout.placed.length > 0 && (
            <div
              style={{
                ...styles.creativeGroup,
                left: creativeGroupLayout.left,
                top: creativeGroupLayout.top,
                width: creativeGroupLayout.diameter,
                height: creativeGroupLayout.diameter,
              }}
            >
              <div style={styles.creativeGroupLabel}>
                <span style={styles.creativeGroupTitle}>Creative</span>
                <span style={styles.creativeGroupCount}>
                  {creativeGroupLayout.placed.length} asset
                  {creativeGroupLayout.placed.length === 1 ? '' : 's'}
                </span>
              </div>
              {creativeGroupLayout.placed.map((node) => (
                <div
                  key={node.assetId}
                  style={{
                    ...styles.creativeNode,
                    left: node.x - creativeGroupLayout.left,
                    top: node.y - creativeGroupLayout.top,
                    width: CREATIVE_NODE_WIDTH,
                    height: CREATIVE_NODE_HEIGHT,
                  }}
                  onPointerDown={(e) => handleNodePointerDown(e, node)}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={(e) => handleNodePointerUp(e, node)}
                >
                  <div style={{ ...styles.nodeThumb, height: CREATIVE_THUMB_HEIGHT }}>
                    {node.thumbnailSrc ? (
                      <img src={node.thumbnailSrc} style={styles.nodeThumbImg} draggable={false} />
                    ) : (
                      <div style={styles.nodeThumbFallback} />
                    )}
                  </div>
                  <div style={styles.creativeNodeTitle}>{node.title}</div>
                  {platformUrlByAssetId.get(node.assetId) && (
                    <a
                      href={platformUrlByAssetId.get(node.assetId) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.nodeExternalLinkIcon}
                      title="Open the original content"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

                  {positionedGraphNodes.map((gNode) => {
            // A "terminal" video (per journeyGraph.ts's video->video edges)
            // may still have a resolved downstream node (STEP 3) — if so it
            // isn't really the end of the path, just the end of the
            // video->video portion of it.
            const stillTerminal = gNode.isTerminal && !videoIdsWithDownstream.has(gNode.videoId)

            // ── STEP 8 (additive) — display resolution. Priority:
            // 1) videos table via resolveThumbnail() — YouTube/Instagram/
            //    TikTok/etc., same platform-correct fallback used elsewhere;
            // 2) promoted-asset / asset resolver via resolveNodeThumbnail()
            //    — campaign elements (e.g. Consultation) and other resource
            //    types; 3) generic type label as a last resort. Raw IDs move
            // to the tooltip only, never the primary label.
            const videoDisplay = videoDisplayByVideoId.get(gNode.videoId)
            const assetDisplay = gNode.observedAssetIds[0]
              ? resolveGraphAssetDisplay(gNode.observedAssetIds[0])
              : undefined
            const displayTitle = videoDisplay?.title ?? assetDisplay?.title ?? GRAPH_TYPE_LABEL[gNode.visualType]
            const displayThumbnail = videoDisplay?.thumbnailUrl ?? assetDisplay?.thumbnailUrl ?? null

            return (
              <div
                key={gNode.videoId}
                title={`video: ${gNode.videoId}${gNode.observedAssetIds[0] ? ` · asset: ${gNode.observedAssetIds[0]}` : ''}`}
                onPointerDown={(e) => handleGraphNodePointerDown(e, gNode)}
                onPointerMove={handleGraphNodePointerMove}
                onPointerUp={(e) => handleGraphNodePointerUp(e, gNode)}
                style={{
                  ...styles.graphNode,
                  cursor: 'grab',
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
                <div style={styles.graphNodeBody}>
                  <div style={styles.graphNodeThumbWrap}>
                    {displayThumbnail ? (
                      <img src={displayThumbnail} style={styles.graphNodeThumbImg} draggable={false} />
                    ) : null}
                  </div>
                  <div style={styles.graphNodeTitle}>{displayTitle}</div>
                </div>
              </div>
            )
          })}

          {/* STEP 3 (additive) — downstream nodes resolved from a terminal
              video step's own observed redirect link. Structural only — no
              conversion/click/revenue numbers here yet (separate follow-up).
              See journeyDownstreamResolver.ts. */}
          {positionedDownstreamNodes.map((dNode) => {
            const isThankYou = dNode.elementType === 'thank_you'
            const assetFallback = dNode.assetId ? resolveGraphAssetDisplay(dNode.assetId) : undefined
                        const displayTitle = dNode.label ? dNode.label : dNode.elementType
              ? getElementTypeLabel(dNode.elementType)
              : assetFallback?.title ?? (dNode.kind === 'resource' ? 'Imported resource' : 'Unlabeled')
            // Consultation / Landing Page / etc. use the existing fixed
            // Campaign Element thumbnails. A bare "resource" node with no
            // elementType falls back to the asset resolver. Thank You has no
            // existing image in VSTRK today, so it gets a small custom
            // visual instead — not a new thumbnail system, just this one card.
            const displayThumbnail = isThankYou
              ? null
              : dNode.elementType
              ? resolveElementThumbnail(dNode.elementType)
              : assetFallback?.thumbnailUrl ?? null
            const debugId = dNode.resolvedFrom === 'link_type' ? dNode.redirectLinkId : dNode.assetId

            return (
              <div
                key={dNode.id}
                title={debugId ?? undefined}
                onClick={() => {
                  if (dNode.assetId) setNodeDetailTarget({ kind: 'asset', assetId: dNode.assetId })
                }}
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
                <div style={styles.graphNodeBody}>
                  {isThankYou ? (
                    <div style={styles.thankYouThumbWrap}>
                      <Check size={20} strokeWidth={2.5} />
                    </div>
                  ) : (
                    <div style={styles.graphNodeThumbWrap}>
                      {displayThumbnail ? (
                        <img src={displayThumbnail} style={styles.graphNodeThumbImg} draggable={false} />
                      ) : null}
                    </div>
                  )}
                  <div style={styles.graphNodeTitle}>{displayTitle}</div>
                </div>
              </div>
            )
          })}



          {/* STEP 5 (additive) — "Unlinked" videos: a redirect_link exists for
              (this promotion + a promoted asset), but the video has not been
              connected into the observed Event Journey. Rendered as its own
              standalone circular group: no edges, no graph membership, not a
              journey node. Nothing here reads or writes events_journey. */}
          {unlinkedGroup && (
            <div
              style={{
                ...styles.unlinkedGroup,
                left: unlinkedGroup.left,
                top: unlinkedGroup.top,
                width: unlinkedGroup.diameter,
                height: unlinkedGroup.diameter,
              }}
            >
              <div style={styles.unlinkedGroupLabel}>
                <span style={styles.unlinkedGroupTitle}>Unlinked</span>
                <span style={styles.unlinkedGroupCount}>
                  {unlinkedGroup.placed.length} video{unlinkedGroup.placed.length === 1 ? '' : 's'}
                </span>
              </div>
              {unlinkedGroup.placed.map((v) => (
                <div
                  key={v.videoId}
                  style={{
                    ...styles.unlinkedNode,
                    left: v.x,
                    top: v.y,
                    width: UNLINKED_NODE_WIDTH,
                    height: UNLINKED_NODE_HEIGHT,
                    cursor: 'pointer',
                    outline: testCardTarget?.videoId === v.videoId ? '2px solid #ea580c' : undefined,
                  }}
                  title={v.title ? `${v.title}\n${v.videoId}\nClick to test this journey` : `${v.videoId}\nClick to test this journey`}
                  onClick={() => openTestCard(v)}
                >
                  <div style={{ ...styles.nodeThumb, height: UNLINKED_THUMB_HEIGHT }}>
                    <img src={v.thumbnailUrl} style={styles.nodeThumbImg} draggable={false} />
                  </div>
                  <div style={styles.unlinkedNodeTitle}>{v.title || v.videoId}</div>
                </div>
              ))}
            </div>
          )}

          {/* STEP 6c (additive, 2026-09-20 revision) — always shown now
              (previously gated on unlinkedGroup existing), and draggable via
              its own handle strip so it can be moved out of the way. */}
          <div style={{ position: 'absolute', left: funnelDemoPos.x, top: funnelDemoPos.y, width: 680 }}>
            <div
              style={styles.funnelDragHandle}
              onPointerDown={handleFunnelHandlePointerDown}
              onPointerMove={handleFunnelHandlePointerMove}
              onPointerUp={handleFunnelHandlePointerUp}
            >
              <span>This is what a fully tracked funnel looks like</span>
              <GripVertical size={14} style={{ color: '#9ca3af', cursor: 'grab', flexShrink: 0 }} />
            </div>
            <JourneyFunnelDemo />
          </div>

          {/* STEP 6 (additive, 2026-09-20 revision) — Test Your Journey
              tutorial card. Always shown, stays wherever it's dragged, and
              never changes position or content when a video is picked —
              it only ever shows the 6-step checklist. The actual
              link/copy/watch UI lives in the separate popup modal below. */}
          <div style={{ ...styles.testCard, left: testCardPos.x, top: testCardPos.y }}>
            <div
              style={styles.testCardHeader}
              onPointerDown={handleTestCardHandlePointerDown}
              onPointerMove={handleTestCardHandlePointerMove}
              onPointerUp={handleTestCardHandlePointerUp}
            >
              <span style={styles.testCardTitle}>Test your journey</span>
              <GripVertical size={14} style={{ color: '#9ca3af', cursor: 'grab', flexShrink: 0 }} />
            </div>

            {(() => {
              // Judgment call, documented rather than hidden: step 5 fires
              // the moment ANY events_journey row shows up for this link
              // (they clicked it themselves); step 6 waits for more than
              // just that first hop, so it actually means "the map lit up
              // beyond the entry point," not just "a row exists."
              const steps = [
                { label: 'Click "+ Track New Content"', done: hasClickedTrackNewContent },
                { label: 'Click the video inside Unlinked', done: testCardTarget !== null },
                { label: 'Copy the tracked link', done: testCardEverCopied },
                { label: 'Paste the redirect link into the content', done: testCardWatching },
                { label: 'Click it yourself', done: testCardJourneyId !== null },
                { label: 'Watch it light up', done: testCardStepCount > 1 },
              ]
              const doneCount = steps.filter((s) => s.done).length
              return (
                <>
                  <div style={styles.testCardProgressRow}>
                    <span style={styles.testCardSub}>{testCardTarget?.title || testCardTarget?.videoId || 'Get started'}</span>
                    <span style={styles.testCardProgressLabel}>{doneCount}/{steps.length}</span>
                  </div>
                  <div style={styles.testCardChecklist}>
                    {steps.map((s) => (
                      <div key={s.label} style={styles.testCardCheckRow}>
                        {s.done ? (
                          <Check size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                        ) : (
                          <span style={styles.testCardCheckCircle} />
                        )}
                        <span style={s.done ? styles.testCardCheckLabelDone : styles.testCardCheckLabel}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>

          {/* STEP 6d (additive, 2026-09-20 revision) — the popup modal,
              brought back per feedback. Opens near the clicked video (via
              openTestCard), independent of the tutorial card's position.
              Closing it (X) only hides it — testCardTarget/Copied/Watching
              stay as-is so the tutorial card's checklist doesn't lose
              progress. */}
          {linkModalOpen && testCardTarget && (
            <div style={{ ...styles.testCard, left: linkModalPos.x, top: linkModalPos.y }}>
              <div
                style={styles.testCardHeader}
                onPointerDown={handleLinkModalHandlePointerDown}
                onPointerMove={handleLinkModalHandlePointerMove}
                onPointerUp={handleLinkModalHandlePointerUp}
              >
                <span style={styles.testCardTitle}>Test your journey</span>
                <GripVertical size={14} style={{ color: '#9ca3af', cursor: 'grab', flexShrink: 0 }} />
              </div>

              <p style={styles.testCardSub}>{testCardTarget.title || testCardTarget.videoId}</p>

              <div style={styles.testCardLinkRow}>
                <span style={styles.testCardLinkText}>
                  {/* TODO: resolve this video's custom tracking domain the
                      same way getRedirectLinksDisplay() does for
                      VideoDetail.tsx (trackingHostname). Until that's
                      wired in here, this always falls back to the default
                      vstrk host inside buildTrackingLinkUrl(). */}
                  {buildTrackingLinkUrl(testCardTarget.token, null)}
                </span>
                <button
                  type="button"
                  style={styles.testCardCopyBtn}
                  onClick={() => {
                    navigator.clipboard.writeText(buildTrackingLinkUrl(testCardTarget.token, null))
                    setTestCardCopied(true)
                    setTestCardEverCopied(true)
                    setTimeout(() => setTestCardCopied(false), 2000)
                  }}
                >
                  {testCardCopied ? <Check size={12} /> : <Copy size={12} />}
                  {testCardCopied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {testCardTarget.platformUrl && (
                <a
                  href={testCardTarget.platformUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.testCardOriginalLink}
                >
                  Open original video ↗
                </a>
              )}

              <p style={styles.testCardHint}>
                Paste this into your video description or post. Then open it yourself to walk the journey.
              </p>

              {!testCardWatching ? (
                <button
                  type="button"
                  style={styles.testCardPrimaryBtn}
                  onClick={() => {
                    setTestCardWatching(true)
                    setTestCardWatchStartedAt(Date.now())
                  }}
                >
                  I've pasted it — start watching
                </button>
              ) : (
                <div style={styles.testCardWatchBox}>
                  <p style={styles.testCardWatchLabel}>
                    {testCardStepCount > 0 ? 'Journey detected' : 'Watching for your click…'}
                  </p>
                  {testCardStepCount > 0 && (
                    <p style={styles.testCardWatchCount}>
                      {testCardStepCount} step{testCardStepCount === 1 ? '' : 's'} observed so far
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                style={styles.testCardCloseBtn}
                onClick={() => setLinkModalOpen(false)}
                aria-label="Close"
              >
                <XIcon size={13} />
              </button>
            </div>
          )}

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

      {nodeDetailTarget && (
        <div style={styles.trackOverlay} onClick={() => setNodeDetailTarget(null)}>
          <div style={styles.nodeDetailModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.nodeDetailHeader}>
              <p style={styles.trackModalEyebrow}>
                {nodeDetailTarget.kind === 'video' ? 'Content details' : 'Asset details'}
              </p>
              <button style={styles.nodeDetailClose} onClick={() => setNodeDetailTarget(null)} title="Close">
                <XIcon size={16} />
              </button>
            </div>

            {nodeDetailLoading && <p style={styles.nodeDetailHint}>Loading…</p>}

            {!nodeDetailLoading && nodeDetailTarget.kind === 'video' && (
              <>
                <p style={styles.nodeDetailTitle}>{nodeDetailVideo?.title || 'Untitled video'}</p>
                {/* Public content URL — visible to everybody, no auth needed. */}
                {nodeDetailVideo?.platformUrl && (
                  <a
                    href={nodeDetailVideo.platformUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.nodeDetailLinkRow}
                  >
                    <ExternalLink size={13} /> Open original content
                  </a>
                )}
                {/* Internal pages — gated by the app's own existing routing/auth,
                    same as every other link to these routes in this file. */}
                <Link to={`/videos/${nodeDetailTarget.videoId}`} style={styles.nodeDetailLinkRow}>
                  <ExternalLink size={13} /> Open Video Detail (marketer only)
                </Link>
                {nodeDetailVideo?.assetId && (
                  <Link to={`/assets/${nodeDetailVideo.assetId}`} style={styles.nodeDetailLinkRow}>
                    <ExternalLink size={13} /> Open Asset Detail (marketer only)
                  </Link>
                )}
              </>
            )}

            {!nodeDetailLoading && nodeDetailTarget.kind === 'asset' && (
              <>
                <p style={styles.nodeDetailTitle}>{nodeDetailAsset?.title || 'Untitled asset'}</p>
                <Link to={`/assets/${nodeDetailTarget.assetId}`} style={styles.nodeDetailLinkRow}>
                  <ExternalLink size={13} /> Open Asset Detail (marketer only)
                </Link>
              </>
            )}

            <div style={styles.nodeDetailDivider} />

            <p style={styles.nodeDetailSectionLabel}>
              Redirect links ({nodeDetailRedirectLinks.length})
            </p>
            <p style={styles.nodeDetailWarning}>
              Be careful — not every link below was necessarily created by you. Double-check
              which one you mean to use before sharing it.
            </p>
            {nodeDetailRedirectLinks.length === 0 && !nodeDetailLoading && (
              <p style={styles.nodeDetailHint}>No redirect links found for this content.</p>
            )}
            {nodeDetailRedirectLinks.map((link) => (
              <div key={link.id} style={styles.nodeDetailRedirectRow}>
                <span style={styles.nodeDetailRedirectUrl}>{buildTrackingLinkUrl(link.token, null)}</span>
                <button
                  style={styles.nodeDetailCopyBtn}
                  onClick={() => navigator.clipboard.writeText(buildTrackingLinkUrl(link.token, null))}
                  title="Copy link"
                >
                  <Copy size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    

      {showTrackModal && (
        <div style={styles.trackOverlay}>
          <div style={styles.trackModal}>
            <p style={styles.trackModalEyebrow}>Track New Content</p>
            <p style={styles.trackModalHint}>
              Promotion is locked to this journey. Assets from the promotion are pre-selected.
            </p>

            <div style={styles.trackModalGridWide} className="track-modal-grid">
            <div>
            <label style={styles.trackLabel}>Platform</label>
            <select
              style={styles.trackInput}
              value={trackPlatform}
              onChange={(e) => setTrackPlatform(e.target.value as any)}
            >
              {['youtube','tiktok','instagram','linkedin','x','threads','facebook','reddit','twitch'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <label style={styles.trackLabel}>URL</label>
            <input
              style={styles.trackInput}
              value={trackUrl}
              onChange={(e) => setTrackUrl(e.target.value)}
              placeholder="https://..."
            />

            <label style={styles.trackLabel}>
              Campaign{trackCampaignLocked ? ' (Creative · limited)' : ''}
            </label>
            {trackCampaignLocked && trackCampaigns.length <= 1 ? (
              <div style={styles.trackLocked}>
                {trackCampaigns[0]?.campaign_name || 'ONLY PROMOTE ASSET'}
              </div>
            ) : (
              <select
                style={styles.trackInput}
                value={trackCampaignId}
                onChange={(e) => setTrackCampaignId(e.target.value)}
                disabled={trackCampaignLocked && trackCampaigns.length === 0}
              >
                <option value="">Select campaign</option>
                {trackCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.campaign_name}</option>
                ))}
              </select>
            )}
            {trackCampaignLocked && trackCreativeMode === 'campaign_links_and_assets' && trackCampaigns.length > 1 && (
              <p style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>
                Creative mode: ONLY PROMOTE ASSET or the one Sponsor campaign on this Assignment.
              </p>
            )}

            <label style={styles.trackLabel}>Promotion (locked)</label>
            <div style={styles.trackLocked}>
              {promotionTitle}{isCreativePromotion ? ' (CREATIVE)' : ''}
            </div>

            <label style={styles.trackLabel}>Promoted assets · tracking domains</label>
            <div className="text-zinc-200">
              <PromotedAssetsPathBPanel
                organizationId={
                  organizationId ||
                  (promotionDetail as any)?.promotion?.organization_id ||
                  (promotionDetail as any)?.assignment?.organization_id ||
                  ''
                }
                userId={user?.id || ''}
                lockedPromotion={
                  promotionId
                    ? {
                        promotionId,
                        assignmentId:
                          (promotionDetail as any)?.assignment?.id ||
                          (promotionDetail as any)?.promotion?.assignment_id ||
                          '',
                        label: promotionTitle,
                        assignmentCollaboratorId:
                          (promotionDetail as any)?.collaborator?.id || null,
                      }
                    : null
                }
                assetsLocked={trackAssetScope === 'promotion_only'}
                assets={trackPromotedAssets}
                onAssetsChange={setTrackPromotedAssets}
                selectedDomainByAssetId={trackDomainByAssetId}
                onSelectedDomainByAssetIdChange={setTrackDomainByAssetId}
                onPromotionContextChange={setTrackPromoCtxByAssetId}
                onRequestAddAssets={
                  trackAssetScope === 'promotion_only'
                    ? undefined
                    : () => setShowTrackAssetPicker(true)
                }
              />
            </div>

            
            <label style={styles.trackLabel}>Campaign links to include</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {([
                ['landing_page', 'Direct purchase / Landing'],
                ['newsletter', 'Newsletter'],
                ['consultation', 'Consultation'],
                ['sales_call', 'Sales call'],
              ] as const).map(([key, label]) => {
                const checked = selectedCampaignLinkTypes.includes(key)
                return (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#d4d4d8', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedCampaignLinkTypes(prev =>
                          checked ? prev.filter(k => k !== key) : [...prev, key],
                        )
                      }}
                    />
                    {label}
                  </label>
                )
              })}
            </div>
            <p style={{ fontSize: 11, color: '#71717a', marginBottom: 8 }}>
              Domain for each type comes from Campaign configuration (owner configures on Campaign).
            </p>

            {trackError && <p style={{ color: '#dc2626', fontSize: 12 }}>{trackError}</p>}


            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                style={styles.trackCancel}
                onClick={() => setShowTrackModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.trackSave}
                disabled={trackSaving}
                onClick={() => handleTrackSave()}
              >
                {trackSaving ? 'Saving…' : 'Save & Generate Links'}
              </button>
            </div>
            </div>
            <div style={styles.trackPreviewPane}>
              Generated link will appear here
              <br />
              <span style={{ fontWeight: 500, letterSpacing: '0.04em', textTransform: 'none', color: '#3f3f46', marginTop: 8, display: 'block' }}>
                Same layout as Videos → Track New Content
              </span>
            </div>
            </div>
          </div>
        </div>
      )}

      {showTrackAssetPicker && (organizationId || (promotionDetail as any)?.promotion?.organization_id) && (
        <PromotedAssetPicker
          organizationId={
            organizationId ||
            (promotionDetail as any)?.promotion?.organization_id ||
            (promotionDetail as any)?.assignment?.organization_id
          }
          initialSelectedAssetIds={trackPromotedAssets.map((a) => a.asset_id)}
          creativeOnlyAssetIds={creativeOnlyAssetIds}
          creativeRestrictionsLoading={creativeRestrictionsLoading}
          onClose={() => setShowTrackAssetPicker(false)}
          onSelect={(assets) => {
            setTrackPromotedAssets(assets)
            setShowTrackAssetPicker(false)
          }}
        />
      )}

      </div>

      <PromotionJourneyVolumeChart
        graph={graph}
        graphLoading={graphLoading}
        graphError={graphError}
        videoDisplayByVideoId={videoDisplayByVideoId}
        assetDisplayByAssetId={assetDisplayByAssetId}
        allPromotedNodes={allPromotedNodes}
        promotedAssetVideoIds={promotedAssetVideoIds}
      />
    </div>
  )
}

// ─── Styles — white canvas, no dark Workspace theme ───────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    // App.tsx's <Navigation /> is `fixed top-0 … z-50 h-14` (56px). Without
    // this offset the page's own header renders underneath it and the
    // promotion name is invisible.
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
    // Promoted-asset cards: gold edge. Same 1px weight as before so the
    // card size/layout is untouched — only the colour changes.
    border: '1px solid #d4af37',
    borderRadius: 10,
    overflow: 'hidden',
    cursor: 'grab',
    boxShadow: '0 0 0 2px rgba(212,175,55,0.14), 0 1px 3px rgba(0,0,0,0.06)',
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
  // STEP 7 — external-link icon on node/creativeNode cards (both already
  // position:absolute, which is enough of a containing block for this).
  nodeExternalLinkIcon: {
    position: 'absolute',
    top: 5,
    right: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    borderRadius: 5,
    background: 'rgba(255,255,255,0.9)',
    border: '1px solid #e5e7eb',
    color: '#6b7280',
    cursor: 'pointer',
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
    cursor: 'pointer',
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
    graphNodeBody: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minHeight: 0,
  },
  graphNodeThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
    flexShrink: 0,
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphNodeThumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
  },
  graphNodeTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#111827',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    lineHeight: 1.25,
    flex: 1,
    minWidth: 0,
  },
  // Thank You has no existing thumbnail image in VSTRK — this is the one
  // custom visual this patch adds, reusing the same green terminal palette
  // already used for graphNodeTerminal so it stays visually consistent.
  thankYouThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 6,
    flexShrink: 0,
    background: 'linear-gradient(135deg, #34d399, #059669)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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

  // ── "Unlinked" group additions (STEP 5) ─────────────────────────────────
  unlinkedGroup: {
    position: 'absolute',
    borderRadius: '50%',
    border: '1px dashed #fca5a5',
    background: 'rgba(254,242,242,0.55)',
  },
  unlinkedGroupLabel: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    textAlign: 'center',
    pointerEvents: 'none',
  },
  unlinkedGroupTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#b91c1c',
  },
  unlinkedGroupCount: {
    fontSize: 10.5,
    color: '#9ca3af',
  },
  unlinkedNode: {
    position: 'absolute',
    borderRadius: 10,
    background: '#ffffff',
    border: '1px solid #ef4444',
    boxShadow: '0 0 0 2px rgba(239,68,68,0.12), 0 1px 3px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  unlinkedNodeTitle: {
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 500,
    color: '#111827',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  // ── STEP 6 — Test Your Journey card ─────────────────────────────────────
  testCard: {
    position: 'absolute',
    width: 250,
    borderRadius: 12,
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
    padding: '12px 14px 14px',
  },
  testCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    cursor: 'grab',
    marginBottom: 6,
  },
  testCardTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: '#111827',
  },
  testCardProgressRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  testCardSub: {
    fontSize: 11,
    color: '#6b7280',
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
    minWidth: 0,
  },
  testCardProgressLabel: {
    fontSize: 11,
    color: '#9ca3af',
    flexShrink: 0,
  },
  testCardChecklist: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    marginBottom: 12,
  },
  testCardCheckRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
  },
  testCardCheckCircle: {
    width: 13,
    height: 13,
    borderRadius: '50%',
    border: '1.5px solid #d1d5db',
    flexShrink: 0,
  },
  testCardCheckLabel: {
    fontSize: 11.5,
    color: '#6b7280',
  },
  testCardCheckLabelDone: {
    fontSize: 11.5,
    color: '#111827',
  },
  testCardOriginalLink: {
    display: 'inline-block',
    fontSize: 10.5,
    color: '#5b3df0',
    textDecoration: 'none',
    marginBottom: 10,
  },
  testCardLinkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  testCardLinkText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: '#374151',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    padding: '5px 7px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  testCardCopyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    fontSize: 10.5,
    fontWeight: 600,
    color: '#374151',
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '5px 8px',
    cursor: 'pointer',
  },
  testCardHint: {
    fontSize: 10.5,
    lineHeight: 1.5,
    color: '#6b7280',
    margin: '0 0 10px',
  },
  testCardPrimaryBtn: {
    width: '100%',
    fontSize: 11,
    fontWeight: 700,
    color: '#ffffff',
    background: '#09090b',
    border: 'none',
    borderRadius: 8,
    padding: '9px 10px',
    cursor: 'pointer',
  },
  testCardWatchBox: {
    borderTop: '1px solid #e5e7eb',
    paddingTop: 9,
  },
  testCardWatchLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#ea580c',
    margin: 0,
  },
  testCardWatchCount: {
    fontSize: 10.5,
    color: '#6b7280',
    margin: '3px 0 0',
  },
  testCardCloseBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    border: 'none',
    background: 'transparent',
    color: '#9ca3af',
    cursor: 'pointer',
  },

  // ── STEP 6c — funnel demo drag handle strip ─────────────────────────────
  funnelDragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 10.5,
    color: '#9ca3af',
    cursor: 'grab',
    padding: '0 2px 6px',
  },

  // ── Creative promoted assets (green ring) ───────────────────────────────
  creativeGroup: {
    position: 'absolute',
    borderRadius: '50%',
    border: '1px dashed #6ee7b7',
    background: 'rgba(236,253,245,0.65)',
  },
  creativeGroupLabel: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    textAlign: 'center',
    pointerEvents: 'none',
  },
  creativeGroupTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#047857',
  },
  creativeGroupCount: {
    fontSize: 10.5,
    color: '#6b7280',
  },
  creativeNode: {
    position: 'absolute',
    borderRadius: 10,
    background: '#ffffff',
    border: '1px solid #10b981',
    boxShadow: '0 0 0 2px rgba(16,185,129,0.16), 0 1px 3px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    cursor: 'grab',
  },
  creativeNodeTitle: {
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 500,
    color: '#111827',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  trackBtn: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #18181b',
    background: '#09090b',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },

  nodeDetailModal: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80vh',
    overflowY: 'auto',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    padding: 20,
    boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
  },
  nodeDetailHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  nodeDetailClose: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
  },
  nodeDetailHint: {
    fontSize: 12,
    color: '#9ca3af',
  },
  nodeDetailTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#111827',
    margin: '4px 0 12px',
  },
  nodeDetailLinkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12.5,
    fontWeight: 600,
    color: '#4f46e5',
    textDecoration: 'none',
    padding: '6px 0',
  },
  nodeDetailDivider: {
    height: 1,
    background: '#e5e7eb',
    margin: '14px 0',
  },
  nodeDetailSectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#6b7280',
    marginBottom: 6,
  },
  nodeDetailWarning: {
    fontSize: 11.5,
    color: '#b45309',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 8,
    padding: '8px 10px',
    marginBottom: 10,
    lineHeight: 1.4,
  },
  nodeDetailRedirectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  nodeDetailRedirectUrl: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: '#374151',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nodeDetailCopyBtn: {
    background: 'transparent',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    padding: 4,
    cursor: 'pointer',
    color: '#6b7280',
    display: 'flex',
  },

  trackOverlay: {
    position: 'fixed',
    inset: 0,
    // Below PromotedAssetPicker (z-50) so CHANGE can open on top
    zIndex: 40,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  trackModal: {
    width: '100%',
    maxWidth: 960,
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#09090b',
    border: '1px solid #27272a',
    borderRadius: 16,
    padding: 20,
    color: '#e4e4e7',
  },
  trackModalGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 24,
  },
  trackModalGridWide: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
  },
  trackPreviewPane: {
    border: '1px solid #27272a',
    borderRadius: 16,
    background: '#0c0c0e',
    minHeight: 280,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    color: '#52525b',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  trackModalEyebrow: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#71717a',
    marginBottom: 6,
  },
  trackModalHint: {
    fontSize: 12,
    color: '#a1a1aa',
    marginBottom: 14,
  },
  trackLabel: {
    display: 'block',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#71717a',
    marginTop: 10,
    marginBottom: 4,
  },
  trackInput: {
    width: '100%',
    borderRadius: 10,
    border: '1px solid #3f3f46',
    background: '#18181b',
    color: '#fafafa',
    padding: '10px 12px',
    fontSize: 13,
  },
  trackLocked: {
    borderRadius: 10,
    border: '1px solid #3f3f46',
    background: '#14532d33',
    color: '#6ee7b7',
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 600,
  },
  trackAssetChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    padding: '4px 8px',
    borderRadius: 8,
    border: '1px solid #3f3f46',
    background: '#18181b',
    fontSize: 11,
  },
  trackChipX: {
    border: 'none',
    background: 'transparent',
    color: '#a1a1aa',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
  },
  trackLinkBtn: {
    border: 'none',
    background: 'transparent',
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  trackDashedBtn: {
    width: '100%',
    border: '1px dashed #3f3f46',
    borderRadius: 12,
    padding: '12px',
    background: 'transparent',
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  trackCancel: {
    flex: 1,
    borderRadius: 12,
    border: '1px solid #3f3f46',
    background: 'transparent',
    color: '#a1a1aa',
    padding: '10px',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  trackSave: {
    flex: 1,
    borderRadius: 12,
    border: 'none',
    background: '#ea580c',
    color: '#fff',
    padding: '10px',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
}
