/**
 * src/pages/CampaignStructureMap.tsx
 *
 * Route: /marketplace/campaigns/:campaignId/structure
 *
 * Purpose: a Miro/FigJam-style canvas showing a Campaign's ORGANIZATIONAL
 * STRUCTURE — Campaign at the root, branching down into Content / Own Assets
 * / Marketers, with Marketers branching further into Promotions and then
 * Assets.
 *
 * This is explicitly NOT a user/visitor journey view. It does not use and
 * must never be wired to: events_journey, journeyDiscovery.ts,
 * journeyGraph.ts, journeyDownstreamResolver.ts, click paths, attribution,
 * or any downstream/conversion analytics. See CampaignJourneyMap.tsx for
 * that concept — it is a separate page and is not touched by this file.
 *
 * Current state: 100% static mock data. No Supabase. No queries. No
 * aggregation. The goal of this pass is the visual hierarchy / canvas UX,
 * not real data — swapping MOCK_CAMPAIGN for a resolved campaign tree is a
 * future, separate change.
 *
 * Reused from CampaignJourneyMap.tsx (generic canvas infra only, not its
 * journey-specific layout):
 *   1. The canvas-space coordinate model (translate+scale transform,
 *      screen<->canvas conversion, wheel-to-zoom-at-cursor math).
 *   2. <CanvasGrid /> — stateless dot-grid background.
 *   3. curvePath() — bezier connector between two points.
 *   4. The card visual language (color dot + label, dim-on-hover).
 *
 * The layout itself is new: a layered top-down tree (root at top, rows by
 * depth), not the hub-and-spoke radial layout CampaignJourneyMap uses.
 *
 * This page does NOT use useWorkspaceStore and does NOT write to the
 * `widgets` table — same as CampaignJourneyMap.tsx / PromotionJourneyMap.tsx.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Network, Sparkles } from 'lucide-react'
import CanvasGrid from '../components/analytics/canvas/CanvasGrid'
import type { CanvasTransform } from '../components/analytics/store/useWorkspaceStore'
import { Campaign, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useViewing } from '../lib/ViewingContext'
// Phase 1B-a: same asset↔campaign resolver AllAssetsAnalytics.tsx uses.
// Reusing the function directly (not re-deriving its join) so this page
// can never define campaign-membership differently from AllAssetsAnalytics.
import { getAssetAnalyticsRows } from '../services/asset/getAssetAnalyticsRows'

// ─── Real-data hooks (Phase 1A only: name + switcher) ───────────────────
// Copied from AllAssetsAnalytics.tsx's useCampaignOptions — same query,
// same viewer-id resolution. Not imported because it isn't exported from
// that file; kept identical on purpose so both pages stay in sync.
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

// ─── Phase 1B-a: real Marketer / Promotion nodes ────────────────────────
// Copied from AllAssetsAnalytics.tsx's resolveOrgAndViewer — same
// operator-mode-aware org/viewer resolution. Not imported because it isn't
// exported from that file (same situation as useCampaignOptions above).
async function resolveOrgAndViewer(viewing?: {
  viewingMemberId: string | null
  viewingOrgId: string | null
}): Promise<{ organizationId: string; viewerId: string }> {
  if (viewing?.viewingMemberId && viewing?.viewingOrgId) {
    return { organizationId: viewing.viewingOrgId, viewerId: viewing.viewingMemberId }
  }
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) {
    throw new Error('Not authenticated')
  }
  const viewerId = auth.user.id
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', viewerId)
    .limit(1)
    .maybeSingle()
  if (membership?.organization_id) {
    return { organizationId: membership.organization_id as string, viewerId }
  }
  const { data: asset } = await supabase
    .from('assets')
    .select('organization_id')
    .limit(1)
    .maybeSingle()
  if (!asset?.organization_id) {
    throw new Error('Could not resolve organizationId')
  }
  return { organizationId: asset.organization_id as string, viewerId }
}

const MARKETER_PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#ef4444']

/**
 * Real Marketer / Promotion nodes for the current campaign, or null while
 * loading/unavailable (caller falls back to MOCK_CAMPAIGN's mock marketers
 * in that case — see the campaignTree useMemo in the component below).
 *
 * Semantics (per Phase 1B-a spec, nothing invented here):
 *  - Reuses getAssetAnalyticsRows() verbatim — the exact same call
 *    AllAssetsAnalytics.tsx makes — then filters to rows whose LOCKED
 *    r.assetCampaign.campaignId matches this campaign. Never uses
 *    redirect_links.campaign_id.
 *  - Real Marketer = owner (videos.user_id) of a promoting video that
 *    appears in one of those filtered rows — same identity source as
 *    AllAssetsAnalytics' Content Owner column.
 *  - Real Promotion = r.promotionIds[0] on one of those filtered rows —
 *    same field AllAssetsAnalytics maps to `promotion_id`.
 *  - Promotion display name = assignments.title, fallback
 *    campaigns.campaign_name — same resolution AllAssetsAnalytics' Promotion
 *    filter panel uses (promotions has no title column of its own).
 */
function useCampaignMarketerNodes(
  campaignId: string | undefined,
  viewerId: string | null,
): TreeNode[] | null {
  const [marketerNodes, setMarketerNodes] = useState<TreeNode[] | null>(null)

  useEffect(() => {
    if (!campaignId || !viewerId) {
      setMarketerNodes(null)
      return
    }
    let cancelled = false

    ;(async () => {
      try {
        const { organizationId, viewerId: resolvedViewerId } = await resolveOrgAndViewer()
        const result = await getAssetAnalyticsRows({
          organizationId,
          viewerId: resolvedViewerId,
          dateRange: 'lifetime',
          customRange: null,
          activeSource: 'total',
        })

        const campaignRows = (result.rows as any[]).filter(
          (r) => r.assetCampaign?.campaignId === campaignId,
        )
        if (campaignRows.length === 0) {
          if (!cancelled) setMarketerNodes([])
          return
        }

        const videoIds = Array.from(new Set(campaignRows.map((r) => r.video_id)))
        const { data: videoRows } = videoIds.length
          ? await supabase.from('videos').select('id, user_id').in('id', videoIds)
          : { data: [] as any[] }
        const ownerIdByVideoId = new Map(
          (videoRows ?? []).map((v: any) => [v.id, v.user_id as string | null]),
        )

        const ownerIds = Array.from(
          new Set(Array.from(ownerIdByVideoId.values()).filter((id): id is string => !!id)),
        )
        const { data: ownerProfiles } = ownerIds.length
          ? await supabase.from('profiles').select('id, email, full_name').in('id', ownerIds)
          : { data: [] as any[] }
        const profileByUserId = new Map((ownerProfiles ?? []).map((p: any) => [p.id, p]))

        const promotionIds = Array.from(
          new Set(
            campaignRows
              .map((r) => r.promotionIds?.[0] ?? null)
              .filter((id: string | null): id is string => !!id),
          ),
        )
        const { data: promoRows } = promotionIds.length
          ? await supabase.from('promotions').select('id, assignment_id, campaign_id').in('id', promotionIds)
          : { data: [] as any[] }
        const assignmentIds = Array.from(
          new Set((promoRows ?? []).map((p: any) => p.assignment_id).filter(Boolean)),
        )
        const promoCampaignIds = Array.from(
          new Set((promoRows ?? []).map((p: any) => p.campaign_id).filter(Boolean)),
        )
        const [{ data: assignmentRows }, { data: campaignNameRows }] = await Promise.all([
          assignmentIds.length
            ? supabase.from('assignments').select('id, title').in('id', assignmentIds)
            : Promise.resolve({ data: [] as any[] }),
          promoCampaignIds.length
            ? supabase.from('campaigns').select('id, campaign_name').in('id', promoCampaignIds)
            : Promise.resolve({ data: [] as any[] }),
        ])
        const titleByAssignmentId = new Map(
          (assignmentRows ?? []).map((a: any) => [a.id, a.title as string]),
        )
        const nameByCampaignId = new Map(
          (campaignNameRows ?? []).map((c: any) => [c.id, c.campaign_name as string]),
        )
        const promotionNameById = new Map<string, string>()
        for (const p of promoRows ?? []) {
          const name =
            (p.assignment_id && titleByAssignmentId.get(p.assignment_id)) ??
            (p.campaign_id && nameByCampaignId.get(p.campaign_id)) ??
            null
          if (name) promotionNameById.set(p.id, name)
        }

        const marketerMap = new Map<string, Set<string>>()
        for (const r of campaignRows) {
          const ownerId = ownerIdByVideoId.get(r.video_id) ?? null
          const promoId = r.promotionIds?.[0] ?? null
          if (!ownerId || !promoId) continue
          if (!marketerMap.has(ownerId)) marketerMap.set(ownerId, new Set())
          marketerMap.get(ownerId)!.add(promoId)
        }

        const nodes: TreeNode[] = Array.from(marketerMap.entries()).map(([ownerId, promoIdSet], i) => {
          const color = MARKETER_PALETTE[i % MARKETER_PALETTE.length]
          const profile = profileByUserId.get(ownerId)
          const marketerName = profile?.full_name?.trim() || profile?.email || 'Marketer'
          return {
            id: `marketer_${ownerId}`,
            label: marketerName,
            kind: 'marketer',
            color,
            children: Array.from(promoIdSet).map((promoId) => ({
              id: `promo_${promoId}`,
              label: promotionNameById.get(promoId) ?? 'Promotion',
              kind: 'promotion',
              color,
            })),
          }
        })

        if (!cancelled) setMarketerNodes(nodes)
      } catch (err) {
        // Fail closed to null -> caller falls back to mock marketers.
        // Never show a broken/partial map.
        console.error('[CampaignStructureMap] useCampaignMarketerNodes failed:', err)
        if (!cancelled) setMarketerNodes(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [campaignId, viewerId])

  return marketerNodes
}

// ─── Static mock data model ─────────────────────────────────────────────
// Deliberately NOT fetched from anywhere. Swapping this for a real,
// resolved campaign/marketer/promotion/asset tree is future work.

type NodeKind = 'campaign' | 'branch' | 'marketer' | 'promotion' | 'asset'

interface TreeNode {
  id: string
  label: string
  kind: NodeKind
  color: string
  children?: TreeNode[]
}

// Per-marketer accent colors so each Marketer -> Promotions -> Assets
// branch reads as its own visual lane on the canvas.
const MARKETER_A = '#6366f1' // indigo
const MARKETER_B = '#ec4899' // pink
const MARKETER_C = '#f59e0b' // amber

const MOCK_CAMPAIGN: TreeNode = {
  id: 'campaign_a',
  label: 'Campaign A',
  kind: 'campaign',
  color: '#111827',
  children: [
    { id: 'content', label: 'Content', kind: 'branch', color: '#0ea5e9' },
    { id: 'own_assets', label: 'Own Assets', kind: 'branch', color: '#10b981' },
    {
      id: 'marketers',
      label: 'Marketers',
      kind: 'branch',
      color: '#8b5cf6',
      children: [
        {
          id: 'marketer_a',
          label: 'Marketer A',
          kind: 'marketer',
          color: MARKETER_A,
          children: [
            {
              id: 'promo_a',
              label: 'Promotion A',
              kind: 'promotion',
              color: MARKETER_A,
              children: [
                { id: 'asset_a', label: 'Asset A', kind: 'asset', color: MARKETER_A },
                { id: 'asset_b', label: 'Asset B', kind: 'asset', color: MARKETER_A },
              ],
            },
            {
              id: 'promo_b',
              label: 'Promotion B',
              kind: 'promotion',
              color: MARKETER_A,
              children: [{ id: 'asset_c', label: 'Asset C', kind: 'asset', color: MARKETER_A }],
            },
          ],
        },
        {
          id: 'marketer_b',
          label: 'Marketer B',
          kind: 'marketer',
          color: MARKETER_B,
          children: [
            {
              id: 'promo_c',
              label: 'Promotion C',
              kind: 'promotion',
              color: MARKETER_B,
              children: [
                { id: 'asset_d', label: 'Asset D', kind: 'asset', color: MARKETER_B },
                { id: 'asset_e', label: 'Asset E', kind: 'asset', color: MARKETER_B },
              ],
            },
            {
              id: 'promo_d',
              label: 'Promotion D',
              kind: 'promotion',
              color: MARKETER_B,
              children: [{ id: 'asset_f', label: 'Asset F', kind: 'asset', color: MARKETER_B }],
            },
          ],
        },
        {
          id: 'marketer_c',
          label: 'Marketer C',
          kind: 'marketer',
          color: MARKETER_C,
          children: [
            {
              id: 'promo_e',
              label: 'Promotion E',
              kind: 'promotion',
              color: MARKETER_C,
              children: [{ id: 'asset_g', label: 'Asset G', kind: 'asset', color: MARKETER_C }],
            },
          ],
        },
      ],
    },
  ],
}

// ─── Layout constants ───────────────────────────────────────────────────────

const ROW_HEIGHT = 190
const LEAF_GAP = 190
const PADDING_X = 100
const PADDING_TOP = 70
const PADDING_BOTTOM = 120

const NODE_SIZE: Record<NodeKind, { w: number; h: number }> = {
  campaign: { w: 230, h: 72 },
  branch: { w: 190, h: 60 },
  marketer: { w: 190, h: 58 },
  promotion: { w: 168, h: 52 },
  asset: { w: 148, h: 46 },
}

const NODE_KIND_LABEL: Record<NodeKind, string> = {
  campaign: 'Campaign',
  branch: 'Branch',
  marketer: 'Marketer',
  promotion: 'Promotion',
  asset: 'Asset',
}

const MIN_SCALE = 0.4
const MAX_SCALE = 2.2
const ZOOM_STEP = 0.15

// ─── Geometry helpers ───────────────────────────────────────────────────────

type Pt = { x: number; y: number }

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

interface PositionedNode {
  id: string
  label: string
  kind: NodeKind
  color: string
  center: Pt
  w: number
  h: number
  depth: number
  /** id of the top-level lane this node belongs to (content / own_assets /
   *  a specific marketer) — used to dim unrelated branches on hover. */
  branchId: string
}

interface Edge {
  fromId: string
  toId: string
  color: string
  branchId: string
}

/**
 * Layered top-down tree layout: y = depth * row height. x is assigned by
 * walking the tree depth-first — each leaf gets the next slot on a fixed
 * horizontal grid, and each internal node is centered over its children.
 */
function layoutTree(root: TreeNode) {
  const nodes: PositionedNode[] = []
  const edges: Edge[] = []
  let leafCursor = 0

  function place(node: TreeNode, depth: number, parentBranch: string | null): { x: number; branchId: string } {
    // Depth-1 nodes (Content / Own Assets / Marketers) start their own lane.
    // Marketer nodes (children of the "marketers" branch) start their own
    // sub-lane so each marketer's promotions/assets read as one branch.
    const branchId = depth === 1 ? node.id : parentBranch === 'marketers' ? node.id : parentBranch ?? node.id

    let x: number
    if (!node.children || node.children.length === 0) {
      x = leafCursor * LEAF_GAP
      leafCursor += 1
    } else {
      const childCenters = node.children.map((child) => place(child, depth + 1, branchId).x)
      x = (childCenters[0] + childCenters[childCenters.length - 1]) / 2
    }

    const { w, h } = NODE_SIZE[node.kind]
    nodes.push({
      id: node.id,
      label: node.label,
      kind: node.kind,
      color: node.color,
      center: { x, y: depth * ROW_HEIGHT },
      w,
      h,
      depth,
      branchId,
    })
    return { x, branchId }
  }

  place(root, 0, null)

  const byId = new Map(nodes.map((n) => [n.id, n]))
  function walkEdges(node: TreeNode) {
    node.children?.forEach((child) => {
      const c = byId.get(child.id)!
      edges.push({ fromId: node.id, toId: child.id, color: c.color, branchId: c.branchId })
      walkEdges(child)
    })
  }
  walkEdges(root)
    

  // Normalize so the leftmost node starts at PADDING_X, and the root row
  // starts at PADDING_TOP, regardless of tree shape.
  const minX = Math.min(...nodes.map((n) => n.center.x - n.w / 2))
  const maxX = Math.max(...nodes.map((n) => n.center.x + n.w / 2))
  const maxY = Math.max(...nodes.map((n) => n.center.y + n.h / 2))
  const offsetX = PADDING_X - minX

  const shift = (p: Pt) => ({ x: p.x + offsetX, y: p.y + PADDING_TOP })
  const shiftedNodes = nodes.map((n) => ({ ...n, center: shift(n.center) }))
  

  return {
    nodes: shiftedNodes,
    edges,
    canvasW: maxX - minX + PADDING_X * 2,
    canvasH: maxY + PADDING_TOP + PADDING_BOTTOM,
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CampaignStructureMap() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // Phase 1A: real campaign name + switcher only. Same viewer-id
  // resolution as AllAssetsAnalytics (Operator-Mode-aware).
  const { user } = useAuth()
  const { viewingMemberId, isReadOnly } = useViewing()
  const effectiveViewerId = isReadOnly ? viewingMemberId : (user?.id ?? null)
  const campaignOptions = useCampaignOptions(effectiveViewerId)
  const currentCampaignName = useMemo(
    () => campaignOptions.find((c) => c.id === campaignId)?.campaign_name ?? null,
    [campaignOptions, campaignId]
  )

  // Phase 1B-a: real Marketer/Promotion nodes, everything else from
  // MOCK_CAMPAIGN unchanged. null (loading/unavailable) falls back to
  // MOCK_CAMPAIGN's own mock marketers -> no blank/broken state.
  const realMarketerNodes = useCampaignMarketerNodes(campaignId, effectiveViewerId)
  const campaignTree = useMemo<TreeNode>(
    () => ({
      ...MOCK_CAMPAIGN,
      label: currentCampaignName ?? MOCK_CAMPAIGN.label,
      children: MOCK_CAMPAIGN.children!.map((branch) =>
        branch.id === 'marketers' && realMarketerNodes
          ? { ...branch, children: realMarketerNodes }
          : branch,
      ),
    }),
    [currentCampaignName, realMarketerNodes],
  )
  const { nodes, edges, canvasW, canvasH } = useMemo(() => layoutTree(campaignTree), [campaignTree])

  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 0.85 })
  const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null)
  const [hasCentered, setHasCentered] = useState(false)
  const [dragPositions, setDragPositions] = useState<Record<string, Pt>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragState = useRef<{ id: string; startClientX: number; startClientY: number; startCenter: Pt } | null>(null)
  // Center the tree in the viewport on first mount, once we know the
  // container's actual size (tree width varies with mock-data shape).
  useLayoutEffect(() => {
    if (hasCentered) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const scale = 0.85
    const x = rect.width / 2 - (canvasW / 2) * scale
    const y = 24
    setTransform({ x, y, scale })
    setHasCentered(true)
  }, [canvasW, hasCentered])

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

  const resetView = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    const scale = 0.85
    const x = (rect?.width ?? 1200) / 2 - (canvasW / 2) * scale
    setTransform({ x, y: 24, scale })
  }, [canvasW])

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


  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, node: PositionedNode) => {
      e.stopPropagation()
      dragState.current = { id: node.id, startClientX: e.clientX, startClientY: e.clientY, startCenter: dragPositions[node.id] ?? node.center }
      setDraggingId(node.id)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [dragPositions]
  )
  const handleNodePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragState.current
      if (!drag) return
      e.stopPropagation()
      const dx = (e.clientX - drag.startClientX) / transform.scale
      const dy = (e.clientY - drag.startClientY) / transform.scale
      setDragPositions((prev) => ({ ...prev, [drag.id]: { x: drag.startCenter.x + dx, y: drag.startCenter.y + dy } }))
    },
    [transform.scale]
  )
  const handleNodePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    dragState.current = null
    setDraggingId(null)
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

  // Legend = one chip per top-level lane (Content, Own Assets, each Marketer).
  const legendItems = useMemo(
    () => [
      { branchId: 'content', label: 'Content', color: '#0ea5e9' },
      { branchId: 'own_assets', label: 'Own Assets', color: '#10b981' },
      { branchId: 'marketer_a', label: 'Marketer A', color: MARKETER_A },
      { branchId: 'marketer_b', label: 'Marketer B', color: MARKETER_B },
      { branchId: 'marketer_c', label: 'Marketer C', color: MARKETER_C },
    ],
    []
  )

  const liveNodes = nodes.map((n) => ({ ...n, center: dragPositions[n.id] ?? n.center }))
  const liveNodeById = new Map(liveNodes.map((n) => [n.id, n]))

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <Link to={`/campaigns/${campaignId ?? ''}`} style={styles.backLink}>
          <ArrowLeft size={14} /> Back to campaign
        </Link>
        <div style={styles.titleBlock}>
          <span style={styles.title}>Campaign Structure Map</span>
          <span style={styles.subtitle}>{currentCampaignName ?? campaignId ?? 'Untitled Campaign'}</span>
        </div>
        <span style={styles.phaseBadge}>
          <Sparkles size={12} /> Structure preview — static mock data, not connected to live data
        </span>
        <div style={styles.campaignSwitcherWrap}>
          <select
            value={campaignId ?? ''}
            onChange={(e) => navigate(`/marketplace/campaigns/${e.target.value}/structure`)}
            style={styles.campaignSwitcher}
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
          <ChevronDown size={12} style={styles.campaignSwitcherIcon} />
        </div>
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
          <svg style={{ ...styles.edgesLayer, width: canvasW, height: canvasH }}>
            <defs>
              {legendItems.map((item) => (
                <marker
                  key={item.branchId}
                  id={`arrow-${item.branchId}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill={item.color} />
                </marker>
              ))}
              <marker id="arrow-default" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#9ca3af" />
              </marker>
            </defs>

                        {edges.map((e, i) => {
              const parent = liveNodeById.get(e.fromId)!
              const child = liveNodeById.get(e.toId)!
              const from = { x: parent.center.x, y: parent.center.y + parent.h / 2 }
              const to = { x: child.center.x, y: child.center.y - child.h / 2 }
              const dimmed = hoveredBranchId !== null && hoveredBranchId !== e.branchId
              const hasMarker = legendItems.some((l) => l.branchId === e.branchId)
              return (
                <path
                  key={i}
                  d={curvePath(from, to)}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={dimmed ? 1.4 : 2}
                  strokeOpacity={dimmed ? 0.18 : 0.55}
                  markerEnd={`url(#${hasMarker ? `arrow-${e.branchId}` : 'arrow-default'})`}
                  style={{ transition: 'stroke-opacity 150ms ease, stroke-width 150ms ease' }}
                />
              )
            })}
          </svg>

          {liveNodes.map((node) => {
            const dimmed = hoveredBranchId !== null && hoveredBranchId !== node.branchId
            const isRoot = node.kind === 'campaign'
            const isDragging = draggingId === node.id
            return (
              <div
                key={node.id}
                onMouseEnter={() => setHoveredBranchId(node.branchId)}
                onMouseLeave={() => setHoveredBranchId(null)}
                onPointerDown={(e) => handleNodePointerDown(e, node)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
                style={{
                  ...(isRoot ? styles.rootNode : node.kind === 'asset' ? styles.assetNode : styles.cardNode),
                  left: node.center.x - node.w / 2,
                  top: node.center.y - node.h / 2,
                  width: node.w,
                  height: node.h,
                  borderColor: isRoot ? 'transparent' : node.kind === 'asset' ? `${node.color}66` : node.color,
                  boxShadow: isRoot
                    ? '0 12px 28px rgba(17,24,39,0.25)'
                    : node.kind === 'asset'
                    ? '0 2px 6px rgba(15,23,42,0.04)'
                    : `0 0 0 2px ${node.color}1f, 0 4px 10px rgba(15,23,42,0.06)`,
                                    opacity: dimmed ? 0.35 : 1,
                  cursor: isDragging ? 'grabbing' : 'grab',
                  zIndex: isDragging ? 10 : 1,
                  touchAction: 'none',
                }}
              >
                {!isRoot && <span style={{ ...styles.nodeDot, background: node.color }} />}
                <div style={styles.nodeTextCol}>
                  <span style={isRoot ? styles.nodeLabelRoot : styles.nodeLabelCard}>{node.label}</span>
                  {!isRoot && (
                    <span style={{ ...styles.nodeKind, color: node.color }}>{NODE_KIND_LABEL[node.kind]}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div style={styles.legend}>
          {legendItems.map((item) => {
            const active = hoveredBranchId === item.branchId
            return (
              <button
                key={item.branchId}
                style={{
                  ...styles.legendChip,
                  borderColor: active ? item.color : '#e5e7eb',
                  background: active ? `${item.color}0f` : '#ffffff',
                }}
                onMouseEnter={() => setHoveredBranchId(item.branchId)}
                onMouseLeave={() => setHoveredBranchId(null)}
              >
                <Network size={12} color={item.color} />
                <span style={{ color: active ? item.color : '#374151' }}>{item.label}</span>
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
    overflow: 'visible',
    pointerEvents: 'none',
  },
  rootNode: {
    position: 'absolute',
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 20px',
    textAlign: 'center',
    background: 'linear-gradient(160deg, #111827 0%, #312e81 100%)',
    color: '#ffffff',
    cursor: 'default',
    border: '1.5px solid transparent',
  },
  cardNode: {
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
  assetNode: {
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
    fontSize: 14,
    fontWeight: 700,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nodeLabelCard: {
    fontSize: 12.5,
    fontWeight: 700,
    color: '#111827',
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
    maxWidth: 360,
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
