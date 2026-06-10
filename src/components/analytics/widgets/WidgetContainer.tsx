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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  widget: Widget
  selected: boolean
  onSelect: () => void
  onDragStart: (
    e: React.MouseEvent,
    widgetId: string,
    widgetX: number,
    widgetY: number
  ) => void
  onResizeStart: (
    e: React.MouseEvent,
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

  // ── Drag handle (header) ────────────────────────────────────────────────
  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editingTitle) return  // let the input handle it
      e.stopPropagation()
      onDragStart(e, widget.id, widget.x, widget.y)
    },
    [editingTitle, onDragStart, widget.id, widget.x, widget.y]
  )

  // ── Body mousedown — stop propagation, do not initiate drag ────────────
  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect()
  }, [onSelect])

  // ── Resize handles ──────────────────────────────────────────────────────
  const makeResizeHandler = (handle: ResizeHandle) => (e: React.MouseEvent) => {
    e.stopPropagation()
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

  // ─── Render ───────────────────────────────────────────────────────────────

  const showControls = hovered || selected

  return (
    <div
      style={{
        ...styles.root,
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
        outline: selected
          ? '2px solid #6b7ff0'
          : hovered
          ? '1px solid rgba(255,255,255,0.15)'
          : 'none',
        zIndex: selected ? 10 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={handleBodyMouseDown}
    >
      {/* Invisible drag surface — covers full widget, sits behind content */}
      <div
        style={styles.dragSurface}
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={handleTitleDoubleClick}
      />

      {/* Widget body — fills the entire container */}
      <div style={styles.body}>
        {WidgetRenderer ? (
          <WidgetRenderer widget={widget} onUpdate={handleWidgetUpdate} />
        ) : (
          <div style={styles.unknown}>Unknown widget type: {widget.type}</div>
        )}
      </div>

      {/* Floating label + delete — only visible on hover/select */}
      {showControls && (
        <div style={styles.floatingBar} onMouseDown={(e) => e.stopPropagation()}>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={handleTitleKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              style={styles.titleInput}
              maxLength={80}
              autoFocus
            />
          ) : (
            <span
              style={styles.title}
              onDoubleClick={handleTitleDoubleClick}
            >
              {displayTitle}
            </span>
          )}

          {!editingTitle && (
            <button
              style={styles.deleteBtn}
              onMouseDown={(e) => { e.stopPropagation(); onDelete() }}
              title="Delete widget"
            >
              ×
            </button>
          )}
        </div>
      )}

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
              onMouseDown={makeResizeHandler(handle)}
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
    background: 'transparent',
    borderRadius: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'visible',
    boxShadow: 'none',
    transition: 'outline 0.1s',
  },
  // Invisible layer that captures drag + double-click for title edit
  dragSurface: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    cursor: 'grab',
  },
  // Floating pill that appears above the widget on hover/select
  floatingBar: {
    position: 'absolute',
    top: -26,
    left: 0,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 6,
    paddingRight: 4,
    background: 'rgba(20,20,20,0.85)',
    backdropFilter: 'blur(6px)',
    borderRadius: 5,
    border: '1px solid rgba(255,255,255,0.07)',
    zIndex: 30,
    pointerEvents: 'auto',
    whiteSpace: 'nowrap',
  },
  title: {
    fontSize: 10,
    fontWeight: 500,
    color: '#888',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'default',
    userSelect: 'none',
  },
  titleInput: {
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #6b7ff0',
    outline: 'none',
    color: '#ccc',
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: '0.05em',
    padding: '1px 0',
    width: 80,
  },
  deleteBtn: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    fontSize: 14,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
    transition: 'color 0.15s',
  },
  body: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    zIndex: 2,
  },
  unknown: {
    padding: 16,
    fontSize: 12,
    color: '#555',
  },
  resizeHandle: {
    position: 'absolute',
    width: 8,
    height: 8,
    background: '#6b7ff0',
    borderRadius: 2,
    zIndex: 20,
  },
}
