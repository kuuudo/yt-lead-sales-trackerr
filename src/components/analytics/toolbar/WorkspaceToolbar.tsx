/**
 * src/components/analytics/toolbar/WorkspaceToolbar.tsx
 *
 * Floating add-widget toolbar — anchored at the bottom-centre of the viewport.
 *
 * Spawns widgets at the centre of the current viewport, converted to canvas space.
 * This means widgets always appear in the visible area regardless of zoom/pan.
 *
 * Formula:
 *   canvasCenter = toCanvasPoint(viewportWidth / 2, viewportHeight / 2)
 *   widgetOrigin = { x: canvasCenter.x - width/2, y: canvasCenter.y - height/2 }
 *
 * Save indicator lives here — it reads isSaving from the store.
 * Undo / Redo buttons live here — Ctrl+Z / Ctrl+Y keyboard shortcuts too.
 *
 * Dependencies:
 *   nanoid — npm install nanoid
 */

import React, { useCallback, useEffect } from 'react'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import { TOOLBAR_ITEMS, WIDGET_DEFAULTS } from '../widgets/WidgetRegistry'

interface Props {
  userId: string | null
}

export default function WorkspaceToolbar({ userId }: Props) {
  const activeBoardId = useWorkspaceStore((s) => s.activeBoardId)
  const addWidget    = useWorkspaceStore((s) => s.addWidget)
  const toCanvasPoint = useWorkspaceStore((s) => s.toCanvasPoint)
  const isSaving     = useWorkspaceStore((s) => s.isSaving)
  const canUndo      = useWorkspaceStore((s) => s.canUndo)
  const canRedo      = useWorkspaceStore((s) => s.canRedo)
  const undo         = useWorkspaceStore((s) => s.undo)
  const redo         = useWorkspaceStore((s) => s.redo)

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const mod = isMac ? e.metaKey : e.ctrlKey

      // Ignore shortcuts when the user is typing in an input / textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return
      }

      if (mod && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        undo()
      } else if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        // Ctrl+Y  or  Ctrl+Shift+Z (common on some OSes)
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [undo, redo])

  // ── Widget creation ───────────────────────────────────────────────────────
  const handleAdd = useCallback(
    (type: string) => {
      if (!activeBoardId) return

      const defaults = WIDGET_DEFAULTS[type]
      if (!defaults) return

      // Find the centre of the visible viewport in screen coordinates
      // (approximate — uses window dimensions, works for full-screen workspace)
      // A toolbar button is at the bottom so we aim slightly above centre.
      const vpCx = window.innerWidth / 2
      const vpCy = window.innerHeight / 2 - 60  // offset upward from bottom toolbar

      // Convert to canvas space
      const canvasCenter = toCanvasPoint(vpCx, vpCy)

      const now = new Date().toISOString()
      const widget = {
        id: crypto.randomUUID(),
        board_id: activeBoardId,
        user_id: userId ?? 'guest',
        title: null,
        type,
        x: canvasCenter.x - defaults.width / 2,
        y: canvasCenter.y - defaults.height / 2,
        width: defaults.width,
        height: defaults.height,
        category: defaults.category,
        config: { ...defaults.config },
        data: { ...defaults.data },
        created_at: now,
        updated_at: now,
      }

      addWidget(widget)
    },
    [activeBoardId, addWidget, toCanvasPoint, userId]
  )

  return (
    <div style={styles.wrapper}>
      <div style={styles.toolbar}>
        {/* ── Undo / Redo ─────────────────────────────────────────────────── */}
        <button
          style={{
            ...styles.btn,
            ...(!canUndo ? styles.btnDisabled : {}),
          }}
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <span style={styles.icon}>↶</span>
          <span style={styles.label}>Undo</span>
        </button>

        <button
          style={{
            ...styles.btn,
            ...(!canRedo ? styles.btnDisabled : {}),
          }}
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          <span style={styles.icon}>↷</span>
          <span style={styles.label}>Redo</span>
        </button>

        <div style={styles.divider} />

        {/* ── Widget add buttons ───────────────────────────────────────────── */}
        {TOOLBAR_ITEMS.map((item) => (
          <button
            key={item.type}
            style={styles.btn}
            onClick={() => handleAdd(item.type)}
            title={`Add ${item.label}`}
          >
            <span style={styles.icon}>{item.icon}</span>
            <span style={styles.label}>{item.label}</span>
          </button>
        ))}

        <div style={styles.divider} />

        {/* ── Save indicator ───────────────────────────────────────────────── */}
        <span style={styles.saveIndicator}>
          {isSaving ? (
            <span style={{ color: '#666' }}>Saving…</span>
          ) : (
            <span style={{ color: '#34d399' }}>● Saved</span>
          )}
        </span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 200,
    pointerEvents: 'none',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: '6px 10px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    pointerEvents: 'all',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '6px 10px',
    borderRadius: 7,
    transition: 'background 0.15s, color 0.15s',
    fontFamily: 'inherit',
  },
  btnDisabled: {
    color: '#444',
    cursor: 'default',
  },
  icon: {
    fontSize: 14,
    lineHeight: 1,
  },
  label: {
    letterSpacing: '0.02em',
  },
  divider: {
    width: 1,
    height: 20,
    background: '#2a2a2a',
    margin: '0 4px',
  },
  saveIndicator: {
    fontSize: 11,
    minWidth: 52,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
}
