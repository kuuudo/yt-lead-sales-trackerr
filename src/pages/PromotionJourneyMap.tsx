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
  type ResourceType,
  type CampaignElementType,
} from '../lib/videoFormatters'
import CanvasGrid from '../components/analytics/canvas/CanvasGrid'
import type { CanvasTransform } from '../components/analytics/store/useWorkspaceStore'

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

// ─── Initial layout — simple row/wrap grid. NOT an "Organize" algorithm. ──────

function layoutNodes(
  assets: PromotionDetailData['assets']
): JourneyNode[] {
  return assets.map((a, i) => {
    const col = i % NODES_PER_ROW
    const row = Math.floor(i / NODES_PER_ROW)
    return {
      assetId: a.assetId,
      promotionAssetId: a.promotionAssetId,
      title: a.resource?.title || 'Untitled asset',
      thumbnailSrc: resolveNodeThumbnail(a.resource),
      x: CANVAS_MARGIN + col * (NODE_WIDTH + GRID_GAP_X),
      y: CANVAS_MARGIN + row * (NODE_HEIGHT + GRID_GAP_Y),
    }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PromotionJourneyMap() {
  const { promotionId } = useParams<{ promotionId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promotionTitle, setPromotionTitle] = useState<string>('Promotion')
  const [nodes, setNodes] = useState<JourneyNode[]>([])

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
}
