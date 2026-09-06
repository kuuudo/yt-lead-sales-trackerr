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

import React, { useCallback, useEffect, useState, useRef } from 'react'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import { TOOLBAR_ITEMS, WIDGET_DEFAULTS } from '../widgets/WidgetRegistry'

interface Props {
  userId: string | null
}

const DOMAINS = [
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'content',   label: 'Content' },
  { id: 'assets',    label: 'Assets' },
  { id: 'collab',    label: 'Collab' },
  { id: 'operator',  label: 'Operator' },
]

const SHAPE_TYPES = ['rectangle', 'circle', 'arrow']

// Temporary domain → widget-type mapping, kept local to the toolbar until
// `domain` becomes a real field on WidgetRegistry entries.
const DOMAIN_WIDGET_TYPES: Record<string, string[]> = {
  campaigns: ['kpi', 'chart', 'line_chart'],
  content:   ['dashboard', 'indepth_analytics'],
  assets:    [],
  collab:    [],
  operator:  [],
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
  const selectedWidgetId    = useWorkspaceStore((s) => s.selectedWidgetId)
  const deleteWidget        = useWorkspaceStore((s) => s.deleteWidget)
  const setSelectedWidgetId = useWorkspaceStore((s) => s.setSelectedWidgetId)
  const [activeDomain, setActiveDomain] = useState(DOMAINS[0].id)
    const [shapeOpen, setShapeOpen] = useState(false)
  const [shapeModalOpen, setShapeModalOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const shapeRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (shapeRef.current && !shapeRef.current.contains(e.target as Node)) {
        setShapeOpen(false)
      }

    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])
  // ── Widget creation ───────────────────────────────────────────────────────
  const shapeItems = TOOLBAR_ITEMS.filter((item) => SHAPE_TYPES.includes(item.type))
  const addMenuItems = TOOLBAR_ITEMS.filter(
    (item) => item.type !== 'note' && item.type !== 'text' && !SHAPE_TYPES.includes(item.type)
  )
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
    <>
    <div style={styles.wrapper}>
      <div style={styles.toolbar}>
        <button style={styles.btn} onClick={() => setAddOpen(true)} title="Add widget">
          <span style={styles.icon}>+</span>
          <span style={styles.label}>Add</span>
        </button>

        <div style={styles.divider} />

        {DOMAINS.map((d) => (
          <button
            key={d.id}
            style={{
              ...styles.domainBtn,
              ...(activeDomain === d.id ? styles.domainBtnActive : {}),
            }}
            onClick={() => { setActiveDomain(d.id); setAddOpen(true) }}
          >
            {d.label}
          </button>
        ))}

        <div style={styles.divider} />

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

        <button
          style={{
            ...styles.btn,
            ...(!selectedWidgetId ? styles.btnDisabled : {}),
          }}
          onClick={() => {
            if (!selectedWidgetId) return
            deleteWidget(selectedWidgetId)
            setSelectedWidgetId(null)
          }}
          disabled={!selectedWidgetId}
          title="Delete selected widget"
        >
          <span style={styles.icon}>🗑</span>
          <span style={styles.label}>Delete</span>
        </button>

        <div style={styles.divider} />

        <button style={styles.btn} onClick={() => setShapeModalOpen(true)} title="Shape">
          <span style={styles.icon}>▭</span>
          <span style={styles.label}>Shape ▾</span>
        </button>

        <button style={styles.btn} onClick={() => handleAdd('text')} title="Add Text">
          <span style={styles.icon}>T</span>
          <span style={styles.label}>Text</span>
        </button>

        <button style={styles.btn} onClick={() => handleAdd('note')} title="Add Note">
          <span style={styles.icon}>📝</span>
          <span style={styles.label}>Note</span>
        </button>

        <div style={styles.divider} />

        <span style={styles.saveIndicator}>
          {isSaving ? (
            <span style={{ color: '#666' }}>Saving…</span>
          ) : (
            <span style={{ color: '#34d399' }}>● Saved</span>
          )}
        </span>
      </div>
    </div>

    {shapeModalOpen && (
      <div style={styles.modalBackdrop} onClick={() => setShapeModalOpen(false)}>
        <div style={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
          <div style={styles.modalHeader}>
            <span style={styles.modalTitle}>Add shape</span>
            <button style={styles.modalClose} onClick={() => setShapeModalOpen(false)}>×</button>
          </div>
          <div style={styles.modalGrid}>
            {shapeItems.map((item) => (
              <button
                key={item.type}
                style={styles.modalCard}
                onClick={() => { handleAdd(item.type); setShapeModalOpen(false) }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span style={styles.modalCardLabel}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}


    {addOpen && (
        <div style={styles.modalBackdrop} onClick={() => setAddOpen(false)}>
          <div style={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>
                Add {DOMAINS.find((d) => d.id === activeDomain)?.label} widget
              </span>
              <button style={styles.modalClose} onClick={() => setAddOpen(false)}>×</button>
            </div>
            <input
              style={styles.modalSearch}
              placeholder="Search widgets"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              autoFocus
            />
            <div style={styles.modalGrid}>
              {addMenuItems
                .filter((item) => DOMAIN_WIDGET_TYPES[activeDomain]?.includes(item.type))
                .filter((item) => item.label.toLowerCase().includes(addSearch.toLowerCase()))
                .map((item) => (
                  <button
                    key={item.type}
                    style={styles.modalCard}
                    onClick={() => { handleAdd(item.type); setAddOpen(false); setAddSearch('') }}
                  >
                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                    <span style={styles.modalCardLabel}>{item.label}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
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
    maxWidth: '92vw',
    overflowX: 'auto',
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
  domainBtn: {
    background: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '6px 10px',
    borderRadius: 7,
    fontFamily: 'inherit',
  },
  domainBtnActive: {
    background: '#2a2a3a',
    color: '#c7d2fe',
  },
  dropdown: {
    position: 'absolute',
    bottom: '110%',
    left: 0,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 140,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    zIndex: 300,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'transparent',
    border: 'none',
    color: '#ccc',
    fontSize: 12,
    cursor: 'pointer',
    padding: '8px 10px',
    borderRadius: 6,
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'all',
  },
  modalPanel: {
    width: 'min(1100px, 92vw)',
    height: 'min(820px, 90vh)',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 16,
    padding: '24px 28px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#eee',
  },
  modalClose: {
    background: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: 18,
    cursor: 'pointer',
    lineHeight: 1,
  },
  modalSearch: {
    width: '100%',
    boxSizing: 'border-box',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    color: '#eee',
    marginBottom: 14,
    outline: 'none',
  },
  modalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
    alignContent: 'start',
    flex: 1,
    overflowY: 'auto',
  },
  modalCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: '10px 12px',
    cursor: 'pointer',
    color: '#ccc',
  },
  modalCardLabel: {
    fontSize: 12,
  },
}
