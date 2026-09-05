/**
 * src/components/analytics/canvas/SessionCanvas.tsx
 *
 * A minimal canvas that renders `tempWidgets` from the Zustand store.
 * Used exclusively by /workspace (the temp session route).
 *
 * This component:
 *  - Reads `tempWidgets` from the store (pure Zustand, never touches Supabase)
 *  - Renders each temp widget at its canvas-space position
 *  - Reuses the same pan/zoom transform state as WorkspaceCanvas
 *  - Shows an empty state when there are no widgets yet
 *
 * It does NOT handle widget persistence — that happens in saveSessionAsBoard().
 *
 * If you already have a WorkspaceCanvas component that renders widgets from
 * `activeWidgets()`, you can keep it and just swap the data source here.
 * This file is intentionally standalone to avoid coupling temp state
 * with the real board canvas.
 */

import React, { useRef, useCallback, useState } from 'react'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import CanvasGrid from './CanvasGrid'
export default function SessionCanvas() {
  const tempWidgets = useWorkspaceStore((s) => s.tempWidgets)
  const transform = useWorkspaceStore((s) => s.transform)
  const pan = useWorkspaceStore((s) => s.pan)
  const zoom = useWorkspaceStore((s) => s.zoom)
  const resetView = useWorkspaceStore((s) => s.resetView)

const BG_COLORS = [
  { label: 'Dark', value: '#111827' },
  { label: 'White', value: '#ffffff' },
  { label: 'Gray', value: '#f3f4f6' },
  { label: 'Blue', value: '#dbeafe' },
  { label: 'Green', value: '#dcfce7' },
]

const [sessionColor, setSessionColor] = useState('#ffffff')
const vpCx = window.innerWidth / 2
const vpCy = window.innerHeight / 2

const zoomIn = () => zoom(1, vpCx, vpCy)
const zoomOut = () => zoom(-1, vpCx, vpCy)

const scalePercent = Math.round(transform.scale * 100)

  const isPanning = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const lastPinchDist = useRef<number | null>(null)

  // ── Pan via mouse drag ─────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointers.current.size >= 2) {
      lastPinchDist.current = null
      isPanning.current = false
      return
    }

    // Only pan on middle-click or when no widget is being targeted
    if (e.button !== 1 && (e.target as HTMLElement).dataset.widget) return
    isPanning.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values())
      const dx = pts[0].x - pts[1].x
      const dy = pts[0].y - pts[1].y
      const dist = Math.hypot(dx, dy)
      const midX = (pts[0].x + pts[1].x) / 2
      const midY = (pts[0].y + pts[1].y) / 2

      if (lastPinchDist.current != null) {
        if (dist > lastPinchDist.current) zoom(1, midX, midY)
        else if (dist < lastPinchDist.current) zoom(-1, midX, midY)
      }
      lastPinchDist.current = dist
      return
    }

    if (!isPanning.current) return
    pan(e.clientX - lastPos.current.x, e.clientY - lastPos.current.y)
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [pan, zoom])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size < 2) {
      lastPinchDist.current = null
    }
    isPanning.current = false
  }, [])

  // ── Zoom via wheel ─────────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    zoom(-e.deltaY, e.clientX, e.clientY)
  }, [zoom])

return (
  <div
    style={{ ...styles.container, background: sessionColor, touchAction: 'none' }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    onPointerLeave={onPointerUp}
    onWheel={onWheel}
  >
    <CanvasGrid transform={transform} />
      {/* Canvas transform layer */}
      <div
        style={{
          ...styles.canvas,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {tempWidgets.map((tw) => (
          <div
            key={tw.id}
            data-widget="true"
            style={{
              position: 'absolute',
              left: tw.x,
              top: tw.y,
              width: tw.width,
              height: tw.height,
              background: '#1a1a2e',
              border: '1px solid #3a3a6a',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#aaa',
              fontSize: 13,
              userSelect: 'none',
            }}
          >
            {tw.title ?? tw.type}
          </div>
        ))}
      </div>

    {/* Zoom controls */}
<div style={styles.zoomControls}>
  <button style={styles.zoomBtn} onClick={zoomIn}>
    +
  </button>

  <span style={styles.zoomLabel}>
    {scalePercent}%
  </span>

  <button style={styles.zoomBtn} onClick={zoomOut}>
    −
  </button>

  <button
    style={{ ...styles.zoomBtn, ...styles.zoomReset }}
    onClick={resetView}
  >
    ⌂
  </button>

  <div style={styles.colorSeparator} />

  {BG_COLORS.map((c) => (
    <button
      key={c.value}
      title={c.label}
      style={{
        ...styles.colorSwatch,
        background: c.value,
        border:
          sessionColor === c.value
            ? '2px solid #6366f1'
            : '2px solid #3a3a3a',
      }}
      onClick={() => setSessionColor(c.value)}
    />
  ))}
</div>

      
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    cursor: 'grab',
    userSelect: 'none',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    pointerEvents: 'none',
  },
  emptyTitle: {
    fontSize: 18,
    color: '#d1d5db', // light gray (visible on dark bg)
    margin: 0,
    fontWeight: 600,
  },
  emptyHint: {
    fontSize: 13,
    color: '#9ca3af', // softer gray
    margin: 0,
    maxWidth: 320,
    textAlign: 'center',
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
  color: '#e5e7eb',
  minWidth: 36,
  textAlign: 'center',
},

zoomReset: {
  borderLeft: '1px solid #2a2a2a',
  marginLeft: 2,
  paddingLeft: 2,
},

colorSeparator: {
  width: 1,
  height: 18,
  background: '#2a2a2a',
  marginLeft: 4,
  marginRight: 2,
},

colorSwatch: {
  width: 16,
  height: 16,
  borderRadius: 4,
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
},
}
