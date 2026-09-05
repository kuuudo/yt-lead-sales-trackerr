/**
 * src/components/analytics/widgets/WidgetContainer.tsx
 *
 * Drag + resize + selection shell for every widget type.
 *
 * Responsibilities:
 *  - Render the widget at its canvas-space position (absolute positioning
 *    within the canvas layer, which applies the pan/zoom transform).
 *  - Emit drag start events from the header bar.
 *  - Emit resize start events from the four corner handles.
 *  - Render the inline-editable title.
 *  - Render the × delete button on hover/selection.
 *  - Route rendering to the correct widget component via WIDGET_REGISTRY.
 *  - Stop propagation on body mousedown so canvas panning is not triggered.
 *
 * All sizes and positions are in canvas-space coordinates.
 * The parent canvas layer's CSS transform handles screen projection.
 *
 * Props come from WorkspaceCanvas — WidgetContainer never touches the store directly.
 */

import React, { useState, useRef, useCallback } from 'react'
import { WIDGET_REGISTRY, TYPE_LABELS } from './WidgetRegistry'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import type { Widget } from '../store/useWorkspaceStore'
import type { ResizeHandle } from '../canvas/WorkspaceCanvas'
import type { AnalyticsResult } from '../types/analytics'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  widget: Widget
  selected: boolean
  onSelect: () => void
  onDragStart: (
    e: React.PointerEvent,
    widgetId: string,
    widgetX: number,
    widgetY: number
  ) => void
  onResizeStart: (
    e: React.PointerEvent,
    widgetId: string,
    handle: ResizeHandle,
    currentWidth: number,
    currentHeight: number,
    currentX: number,
    currentY: number
  ) => void
  onDelete: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WidgetContainer({
  widget,
  selected,
  onSelect,
  onDragStart,
  onResizeStart,
  onDelete,
}: Props) {
  const updateWidget = useWorkspaceStore((s) => s.updateWidget)
  const [hovered, setHovered] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(widget.title ?? '')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Resolve renderer from registry
  const WidgetRenderer = WIDGET_REGISTRY[widget.type]
  const displayTitle = widget.title ?? TYPE_LABELS[widget.type] ?? widget.type

  const isCanvasObject =
    widget.type === 'arrow' ||
    widget.type === 'rectangle' ||
    widget.type === 'circle' ||
    widget.type === 'text'

  // ── Drag handle (header) ────────────────────────────────────────────────
  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (editingTitle) return  // let the input handle it
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      onDragStart(e, widget.id, widget.x, widget.y)
    },
    [editingTitle, onDragStart, widget.id, widget.x, widget.y]
  )

  // ── Body mousedown — stop propagation, do not initiate drag ────────────
  const handleBodyPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    onSelect()
  }, [onSelect])

  // ── Resize handles ──────────────────────────────────────────────────────
  const makeResizeHandler = (handle: ResizeHandle) => (e: React.PointerEvent) => {
    // Resize stays desktop-only by design — ignore touch/pen input.
    if (e.pointerType !== 'mouse') return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    onResizeStart(
      e,
      widget.id,
      handle,
      widget.width,
      widget.height,
      widget.x,
      widget.y
    )
  }

  // ── Title edit ──────────────────────────────────────────────────────────
  const commitTitleEdit = () => {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    const next = trimmed === '' ? null : trimmed
    if (next !== widget.title) {
      updateWidget(widget.id, { title: next })
    }
  }

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setTitleDraft(widget.title ?? '')
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') commitTitleEdit()
  }

  // ── Widget update helper (passed to renderer) ───────────────────────────
  const handleWidgetUpdate = useCallback(
    (patch: Partial<Widget>) => {
      updateWidget(widget.id, patch)
    },
    [updateWidget, widget.id]
  )

  // analyticsResult is intentionally null.
  // Analytics widgets (DashboardWidget, etc.) fetch their own data internally.
  // Legacy widgets that consumed this prop (KPIWidget, ChartWidget, LineChartWidget)
  // can be migrated to self-fetch when needed.
  const analyticsResult: AnalyticsResult | null = null

  // ─── Render ───────────────────────────────────────────────────────────────

  const showControls = hovered || selected

  return (
    <div
      style={{
        ...styles.root,

        ...(isCanvasObject
          ? {
              background: 'transparent',
              boxShadow: 'none',
              borderRadius: 0,
              overflow: 'visible',
            }
          : {}),

        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        outline: selected
          ? '2px solid #6b7ff0'
          : hovered
          ? '1px solid #2e2e2e'
          : 'none',
        zIndex: selected ? 10 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={handleBodyPointerDown}
    >
      {/* Header — drag handle + title + delete */}
      <div
        style={{
          ...styles.header,

          ...(isCanvasObject
            ? {
                opacity: 0,
                height: '50%',
                minHeight: '50%',
                borderBottom: 'none',
                background: 'transparent',
                cursor: 'grab',
              }
            : {}),
        }}
        onPointerDown={handleHeaderPointerDown}
        onDoubleClick={handleTitleDoubleClick}
      >
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitleEdit}
            onKeyDown={handleTitleKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            style={styles.titleInput}
            maxLength={80}
            autoFocus
          />
        ) : (
          <span style={styles.title}>{displayTitle}</span>
        )}

        {showControls && !editingTitle && (
          <button
            style={styles.deleteBtn}
            onPointerDown={(e) => { e.stopPropagation(); onDelete() }}
            title="Delete widget"
          >
            ×
          </button>
        )}
      </div>

      {/* Widget body */}
      <div style={styles.body}>
        {WidgetRenderer ? (
          <WidgetRenderer
            widget={widget}
            analyticsResult={analyticsResult}
            onUpdate={handleWidgetUpdate}
            selected={selected}
          />
        ) : (
          <div style={styles.unknown}>Unknown widget type: {widget.type}</div>
        )}
      </div>

      {/* Resize handles — four corners only */}
      {showControls && (
        <>
          {(
            [
              ['nw', { top: -4, left: -4, cursor: 'nw-resize' }],
              ['ne', { top: -4, right: -4, cursor: 'ne-resize' }],
              ['se', { bottom: -4, right: -4, cursor: 'se-resize' }],
              ['sw', { bottom: -4, left: -4, cursor: 'sw-resize' }],
            ] as [ResizeHandle, React.CSSProperties][]
          ).map(([handle, pos]) => (
            <div
              key={handle}
              style={{ ...styles.resizeHandle, ...pos }}
              onPointerDown={makeResizeHandler(handle)}
            />
          ))}
        </>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    background: '#141414',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    transition: 'outline 0.1s',
  },
  header: {
    flexShrink: 0,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 10px 0 12px',
    cursor: 'grab',
    background: '#191919',
    borderBottom: '1px solid #1e1e1e',
    gap: 8,
    userSelect: 'none',
  },
  title: {
    fontSize: 11,
    fontWeight: 500,
    color: '#666',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  titleInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #6b7ff0',
    outline: 'none',
    color: '#ccc',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.04em',
    padding: '2px 0',
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ccc',
    fontSize: 16,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
    transition: 'color 0.15s',
  },
  body: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  unknown: {
    padding: 16,
    fontSize: 12,
    color: '#555',
  },
  resizeHandle: {
    position: 'absolute',
    width: 10,
    height: 10,
    background: '#6b7ff0',
    borderRadius: 2,
    zIndex: 20,
  },
}
