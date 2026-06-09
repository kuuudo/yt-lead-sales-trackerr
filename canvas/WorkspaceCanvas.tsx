/**
 * src/components/analytics/canvas/WorkspaceCanvas.tsx
 *
 * Infinite canvas engine — pan, zoom, grid background, widget rendering.
 *
 * Coordinate model
 * ─────────────────
 * All widget positions are stored in CANVAS SPACE (independent of zoom/pan).
 * A single CSS transform on the canvas layer converts canvas → screen:
 *
 *   screenX = canvasX * scale + panX
 *   screenY = canvasY * scale + panY
 *
 * Implemented as:  transform: translate(panX px, panY px) scale(scale)
 *
 * Interaction model (pointer mode gate)
 * ───────────────────────────────────────
 * Only one pointer mode is active at a time:
 *   'idle' | 'panning' | 'dragging-widget' | 'resizing-widget'
 *
 * - Mousedown on widget header   → 'dragging-widget'  + stopPropagation
 * - Mousedown on resize handle   → 'resizing-widget'  + stopPropagation
 * - Mousedown on widget body     → (idle)              + stopPropagation
 * - Mousedown on bare canvas     → 'panning'
 * - Wheel anywhere on canvas     → zoom (ignores pointer mode)
 *
 * mousemove and mouseup are attached to window so fast pointer moves
 * never lose their drag/resize target.
 *
 * Dependencies:
 *   Built-in React + DOM — no canvas library required.
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
} from 'react'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import WidgetContainer from '../widgets/WidgetContainer'
import CanvasGrid from './CanvasGrid'

// ─── Pointer Mode ─────────────────────────────────────────────────────────────

type PointerMode = 'idle' | 'panning' | 'dragging-widget' | 'resizing-widget'

// Shared mutable ref — lives outside React state to avoid render cost
interface PointerState {
  mode: PointerMode
  startX: number
  startY: number
  // panning
  panStartX: number
  panStartY: number
  // widget drag
  dragWidgetId: string | null
  dragWidgetStartX: number
  dragWidgetStartY: number
  // widget resize
  resizeWidgetId: string | null
  resizeHandle: ResizeHandle | null
  resizeStartWidth: number
  resizeStartHeight: number
  resizeStartX: number
  resizeStartY: number
  resizeWidgetOriginX: number
  resizeWidgetOriginY: number
}

export type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw'

const initialPointerState = (): PointerState => ({
  mode: 'idle',
  startX: 0,
  startY: 0,
  panStartX: 0,
  panStartY: 0,
  dragWidgetId: null,
  dragWidgetStartX: 0,
  dragWidgetStartY: 0,
  resizeWidgetId: null,
  resizeHandle: null,
  resizeStartWidth: 0,
  resizeStartHeight: 0,
  resizeStartX: 0,
  resizeStartY: 0,
  resizeWidgetOriginX: 0,
  resizeWidgetOriginY: 0,
})

// ─── Zoom controls ─────────────────────────────────────────────────────────────

const ZOOM_STEP = 0.15
const MIN_SCALE = 0.1
const MAX_SCALE = 4.0

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkspaceCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const ptr = useRef<PointerState>(initialPointerState())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const transform = useWorkspaceStore((s) => s.transform)
  const pan = useWorkspaceStore((s) => s.pan)
  const zoom = useWorkspaceStore((s) => s.zoom)
  const resetView = useWorkspaceStore((s) => s.resetView)
  const activeWidgets = useWorkspaceStore((s) => s.activeWidgets)
  const updateWidget = useWorkspaceStore((s) => s.updateWidget)
  const deleteWidget = useWorkspaceStore((s) => s.deleteWidget)
  const toCanvasPoint = useWorkspaceStore((s) => s.toCanvasPoint)

  const widgets = activeWidgets()

  // ─── Global mousemove ────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const p = ptr.current
      const dx = e.clientX - p.startX
      const dy = e.clientY - p.startY

      if (p.mode === 'panning') {
        pan(dx, dy)
        p.startX = e.clientX
        p.startY = e.clientY
        return
      }

      if (p.mode === 'dragging-widget' && p.dragWidgetId) {
        // Convert screen delta to canvas delta
        const canvasDx = dx / transform.scale
        const canvasDy = dy / transform.scale
        updateWidget(p.dragWidgetId, {
          x: p.dragWidgetStartX + canvasDx,
          y: p.dragWidgetStartY + canvasDy,
        })
        return
      }

      if (p.mode === 'resizing-widget' && p.resizeWidgetId && p.resizeHandle) {
        const canvasDx = dx / transform.scale
        const canvasDy = dy / transform.scale
        const handle = p.resizeHandle
        const MIN_W = 120
        const MIN_H = 80

        let newWidth = p.resizeStartWidth
        let newHeight = p.resizeStartHeight
        let newX = p.resizeWidgetOriginX
        let newY = p.resizeWidgetOriginY

        if (handle === 'se') {
          newWidth = Math.max(MIN_W, p.resizeStartWidth + canvasDx)
          newHeight = Math.max(MIN_H, p.resizeStartHeight + canvasDy)
        } else if (handle === 'sw') {
          newWidth = Math.max(MIN_W, p.resizeStartWidth - canvasDx)
          newHeight = Math.max(MIN_H, p.resizeStartHeight + canvasDy)
          newX = p.resizeWidgetOriginX + (p.resizeStartWidth - newWidth)
        } else if (handle === 'ne') {
          newWidth = Math.max(MIN_W, p.resizeStartWidth + canvasDx)
          newHeight = Math.max(MIN_H, p.resizeStartHeight - canvasDy)
          newY = p.resizeWidgetOriginY + (p.resizeStartHeight - newHeight)
        } else if (handle === 'nw') {
          newWidth = Math.max(MIN_W, p.resizeStartWidth - canvasDx)
          newHeight = Math.max(MIN_H, p.resizeStartHeight - canvasDy)
          newX = p.resizeWidgetOriginX + (p.resizeStartWidth - newWidth)
          newY = p.resizeWidgetOriginY + (p.resizeStartHeight - newHeight)
        }

        updateWidget(p.resizeWidgetId, {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        })
        return
      }
    },
    [pan, zoom, transform.scale, updateWidget]
  )

  // ─── Global mouseup ──────────────────────────────────────────────────────

  const handleMouseUp = useCallback(() => {
    ptr.current = initialPointerState()
  }, [])

  // ─── Wheel (zoom) ────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const originX = e.clientX - rect.left
      const originY = e.clientY - rect.top
      zoom(e.deltaY > 0 ? -1 : 1, originX, originY)
    },
    [zoom]
  )

  // ─── Canvas mousedown (panning) ──────────────────────────────────────────

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    ptr.current.mode = 'panning'
    ptr.current.startX = e.clientX
    ptr.current.startY = e.clientY
    ptr.current.panStartX = transform.x
    ptr.current.panStartY = transform.y
    setSelectedId(null)
  }, [transform.x, transform.y])

  // ─── Widget drag start (called from WidgetContainer) ─────────────────────

  const handleWidgetDragStart = useCallback(
    (
      e: React.MouseEvent,
      widgetId: string,
      widgetX: number,
      widgetY: number
    ) => {
      e.stopPropagation()
      ptr.current.mode = 'dragging-widget'
      ptr.current.startX = e.clientX
      ptr.current.startY = e.clientY
      ptr.current.dragWidgetId = widgetId
      ptr.current.dragWidgetStartX = widgetX
      ptr.current.dragWidgetStartY = widgetY
      setSelectedId(widgetId)
    },
    []
  )

  // ─── Widget resize start (called from WidgetContainer) ───────────────────

  const handleWidgetResizeStart = useCallback(
    (
      e: React.MouseEvent,
      widgetId: string,
      handle: ResizeHandle,
      currentWidth: number,
      currentHeight: number,
      currentX: number,
      currentY: number
    ) => {
      e.stopPropagation()
      ptr.current.mode = 'resizing-widget'
      ptr.current.startX = e.clientX
      ptr.current.startY = e.clientY
      ptr.current.resizeWidgetId = widgetId
      ptr.current.resizeHandle = handle
      ptr.current.resizeStartWidth = currentWidth
      ptr.current.resizeStartHeight = currentHeight
      ptr.current.resizeWidgetOriginX = currentX
      ptr.current.resizeWidgetOriginY = currentY
      setSelectedId(widgetId)
    },
    []
  )

  // ─── Keyboard: delete selected widget ────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const activeEl = document.activeElement
        const isEditing =
          activeEl?.tagName === 'INPUT' ||
          activeEl?.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement)?.isContentEditable
        if (!isEditing) {
          deleteWidget(selectedId)
          setSelectedId(null)
        }
      }
      if (e.key === 'Escape') setSelectedId(null)
    },
    [selectedId, deleteWidget]
  )

  // ─── Event listener registration ─────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown)
    el.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('keydown', handleKeyDown)
      el.removeEventListener('wheel', handleWheel)
    }
  }, [handleMouseMove, handleMouseUp, handleKeyDown, handleWheel])

  // ─── Zoom button handlers ─────────────────────────────────────────────────

  const rect = containerRef.current?.getBoundingClientRect()
  const vpCx = rect ? rect.width / 2 : 400
  const vpCy = rect ? rect.height / 2 : 300

  const zoomIn = () => zoom(1, vpCx, vpCy)
  const zoomOut = () => zoom(-1, vpCx, vpCy)

  const scalePercent = Math.round(transform.scale * 100)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onMouseDown={handleCanvasMouseDown}
    >
      {/* Grid — rendered in screen space, tiles behind the canvas layer */}
      <CanvasGrid transform={transform} />

      {/* Canvas layer — all widgets live here, transformed together */}
      <div
        style={{
          ...styles.canvasLayer,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {widgets.map((widget) => (
          <WidgetContainer
            key={widget.id}
            widget={widget}
            selected={selectedId === widget.id}
            onSelect={() => setSelectedId(widget.id)}
            onDragStart={handleWidgetDragStart}
            onResizeStart={handleWidgetResizeStart}
            onDelete={() => {
              deleteWidget(widget.id)
              setSelectedId(null)
            }}
          />
        ))}
      </div>

      {/* Zoom controls — fixed over the canvas */}
      <div style={styles.zoomControls}>
        <button style={styles.zoomBtn} onClick={zoomIn} title="Zoom in">
          +
        </button>
        <span style={styles.zoomLabel}>{scalePercent}%</span>
        <button style={styles.zoomBtn} onClick={zoomOut} title="Zoom out">
          −
        </button>
        <button style={{ ...styles.zoomBtn, ...styles.zoomReset }} onClick={resetView} title="Reset view">
          ⌂
        </button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    cursor: 'grab',
    userSelect: 'none',
  },
  canvasLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    // overflow: visible — widgets can extend outside this 0×0 origin box
  },
  zoomControls: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: '4px 6px',
    zIndex: 100,
  },
  zoomBtn: {
    background: 'transparent',
    border: 'none',
    color: '#aaa',
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
    color: '#555',
    minWidth: 36,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  zoomReset: {
    borderLeft: '1px solid #2a2a2a',
    marginLeft: 2,
    paddingLeft: 2,
  },
}
