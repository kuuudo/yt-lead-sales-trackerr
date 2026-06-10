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

import React, { useRef, useCallback } from 'react'
import { useWorkspaceStore } from '../store/useWorkspaceStore'

export default function SessionCanvas() {
  const tempWidgets = useWorkspaceStore((s) => s.tempWidgets)
  const transform = useWorkspaceStore((s) => s.transform)
  const pan = useWorkspaceStore((s) => s.pan)
  const zoom = useWorkspaceStore((s) => s.zoom)

  const isPanning = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  // ── Pan via mouse drag ─────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on middle-click or when no widget is being targeted
    if (e.button !== 1 && (e.target as HTMLElement).dataset.widget) return
    isPanning.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return
    pan(e.clientX - lastPos.current.x, e.clientY - lastPos.current.y)
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [pan])

  const onMouseUp = useCallback(() => { isPanning.current = false }, [])

  // ── Zoom via wheel ─────────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    zoom(-e.deltaY, e.clientX, e.clientY)
  }, [zoom])

  return (
    <div
      style={styles.container}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
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

      {/* Empty state */}
      {tempWidgets.length === 0 && (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>Blank Canvas</p>
          <p style={styles.emptyHint}>
            Use the toolbar to add widgets. Nothing is saved until you click "Save as Board".
          </p>
        </div>
      )}

      {/* Zoom level badge */}
      <div style={styles.zoomBadge}>
        {Math.round(transform.scale * 100)}%
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
    color: '#333',
    margin: 0,
    fontWeight: 600,
  },
  emptyHint: {
    fontSize: 13,
    color: '#2e2e2e',
    margin: 0,
    maxWidth: 320,
    textAlign: 'center',
  },
  zoomBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    background: '#111',
    border: '1px solid #222',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    color: '#444',
    pointerEvents: 'none',
  },
}
