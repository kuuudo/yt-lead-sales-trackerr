/**
 * src/components/analytics/widgets/TextWidget.tsx
 *
 * Editable text widget with color and font size support.
 *
 * Config fields (user-defined, persisted):
 *   config.text      — string, default 'New Text'
 *   config.color     — hex string, default '#000000'
 *   config.fontSize  — number (px), default 24
 *   config.fontWeight — 'normal' | 'bold', default 'bold'
 *   config.align     — 'left' | 'center' | 'right', default 'left'
 *
 * data: {} (no machine-written data)
 *
 * Editing:
 *   - Double-click to enter edit mode (contenteditable div)
 *   - Enter  → save & exit edit mode
 *   - Escape → cancel (revert to stored text) & exit edit mode
 *   - Blur   → save & exit edit mode
 *
 * The widget header (drag handle) is managed by WidgetContainer as usual.
 * In display mode, wheel events are not blocked (no scroll content).
 * In edit mode, the textarea blocks canvas zoom via stopPropagation.
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react'
import type { Widget } from '../store/useWorkspaceStore'

interface Props {
  widget: Widget
  onUpdate: (patch: Partial<Widget>) => void
}

export default function TextWidget({ widget, onUpdate }: Props) {
  const config = widget.config

  const storedText   = (config.text       as string) ?? 'New Text'
  const color        = (config.color      as string) ?? '#000000'
  const fontSize     = (config.fontSize   as number) ?? 24
  const fontWeight   = (config.fontWeight as string) ?? 'bold'
  const align        = (config.align      as string) ?? 'left'

  const [editing, setEditing]     = useState(false)
  const [draft, setDraft]         = useState(storedText)
  const [showPanel, setShowPanel] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef    = useRef<HTMLDivElement>(null)

  // Keep draft in sync if the store updates externally (undo/redo)
  const lastPushed = useRef(storedText)
  useEffect(() => {
    if (storedText !== lastPushed.current && !editing) {
      setDraft(storedText)
      lastPushed.current = storedText
    }
  }, [storedText, editing])

  // Focus the textarea when edit mode begins
  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }
  }, [editing])

  // Close style panel on outside click
  useEffect(() => {
    if (!showPanel) return
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPanel])

  const saveText = useCallback(
    (value: string) => {
      const trimmed = value.trim() === '' ? 'New Text' : value
      lastPushed.current = trimmed
      onUpdate({ config: { ...widget.config, text: trimmed } })
      setDraft(trimmed)
      setEditing(false)
    },
    [onUpdate, widget.config]
  )

  const cancelEdit = useCallback(() => {
    setDraft(storedText)
    setEditing(false)
  }, [storedText])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
      // Allow Enter for newlines; Ctrl/Cmd+Enter saves
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        saveText(draft)
      }
    },
    [cancelEdit, saveText, draft]
  )

  const updateConfig = useCallback(
    (key: string, value: unknown) => {
      onUpdate({ config: { ...widget.config, [key]: value } })
    },
    [onUpdate, widget.config]
  )

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        overflow: 'hidden',
        padding: 4,
        boxSizing: 'border-box',
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (!showPanel) setEditing(true)
      }}
    >
      {editing ? (
        /* ── Edit mode ── */
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => saveText(draft)}
          onKeyDown={handleKeyDown}
          onWheel={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            inset: 4,
            background: 'rgba(255,255,255,0.04)',
            border: '1.5px solid #6b7ff0',
            borderRadius: 4,
            outline: 'none',
            resize: 'none',
            color,
            fontSize,
            fontWeight,
            textAlign: align as React.CSSProperties['textAlign'],
            lineHeight: 1.3,
            padding: '6px 8px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            caretColor: '#6b7ff0',
          }}
        />
      ) : (
        /* ── Display mode ── */
        <div
          style={{
            position: 'absolute',
            inset: 4,
            color,
            fontSize,
            fontWeight,
            textAlign: align as React.CSSProperties['textAlign'],
            lineHeight: 1.3,
            padding: '6px 8px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden',
            userSelect: 'none',
            cursor: 'default',
          }}
        >
          {storedText}
        </div>
      )}

      {/* ── Style panel trigger (gear icon, top-right) ── */}
      {!editing && (
        <button
          style={styles.gearBtn}
          title="Text style"
          onMouseDown={(e) => { e.stopPropagation(); setShowPanel((v) => !v) }}
        >
          ⚙
        </button>
      )}

      {/* ── Style panel ── */}
      {showPanel && !editing && (
        <div
          ref={panelRef}
          style={panelStyles.panel}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p style={panelStyles.heading}>Text Style</p>

          <label style={panelStyles.row}>
            <span style={panelStyles.label}>Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => updateConfig('color', e.target.value)}
              style={panelStyles.colorInput}
            />
            <span style={panelStyles.val}>{color}</span>
          </label>

          <label style={panelStyles.row}>
            <span style={panelStyles.label}>Size</span>
            <input
              type="range" min={8} max={96} step={1}
              value={fontSize}
              onChange={(e) => updateConfig('fontSize', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={panelStyles.val}>{fontSize}px</span>
          </label>

          {/* Weight toggle */}
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Weight</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['normal', 'bold'] as const).map((w) => (
                <button
                  key={w}
                  style={{
                    ...panelStyles.toggleBtn,
                    background: fontWeight === w ? '#6b7ff0' : '#2a2a2a',
                    color: fontWeight === w ? '#fff' : '#aaa',
                  }}
                  onClick={() => updateConfig('fontWeight', w)}
                >
                  {w === 'bold' ? 'B' : 'N'}
                </button>
              ))}
            </div>
          </div>

          {/* Align toggle */}
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Align</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  style={{
                    ...panelStyles.toggleBtn,
                    background: align === a ? '#6b7ff0' : '#2a2a2a',
                    color: align === a ? '#fff' : '#aaa',
                  }}
                  onClick={() => updateConfig('align', a)}
                >
                  {a === 'left' ? '≡' : a === 'center' ? '≡' : '≡'}
                  {/* simple label */}
                  {a[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <button
            style={panelStyles.closeBtn}
            onClick={() => setShowPanel(false)}
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  gearBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    background: 'transparent',
    border: 'none',
    color: '#555',
    fontSize: 13,
    cursor: 'pointer',
    padding: 2,
    lineHeight: 1,
    zIndex: 10,
    transition: 'color 0.15s',
  },
}

const panelStyles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 28,
    right: 6,
    zIndex: 50,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '14px 16px',
    width: 230,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  heading: {
    margin: 0,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#888',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: '#ccc',
  },
  label: {
    minWidth: 46,
    fontSize: 11,
    color: '#888',
  },
  val: {
    minWidth: 36,
    textAlign: 'right',
    fontSize: 11,
    color: '#aaa',
    fontVariantNumeric: 'tabular-nums',
  },
  colorInput: {
    width: 32,
    height: 24,
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    background: 'transparent',
    borderRadius: 4,
  },
  toggleBtn: {
    border: 'none',
    borderRadius: 5,
    fontSize: 11,
    padding: '4px 8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  closeBtn: {
    marginTop: 4,
    background: '#2a2a2a',
    border: 'none',
    borderRadius: 6,
    color: '#ccc',
    fontSize: 12,
    padding: '6px 0',
    cursor: 'pointer',
    fontWeight: 500,
  },
}
