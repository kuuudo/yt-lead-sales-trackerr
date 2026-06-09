/**
 * src/components/analytics/widgets/NoteWidget.tsx
 *
 * Editable text note widget.
 *
 * Features:
 *  - Full-body textarea with auto-save on change (debounced via updateWidget)
 *  - Placeholder text when empty
 *  - Mousedown on textarea is stopped from reaching the canvas
 *    (handled by WidgetContainer's body stopPropagation — no extra work needed here)
 *  - Wheel events inside the textarea stop propagating to prevent
 *    accidental canvas zoom when scrolling long notes
 *
 * The `data` field stores: { text: string }
 * The `config` field is unused for notes but preserved for future note config
 * (e.g. font size, color, pinned).
 */

import React, { useCallback, useRef } from 'react'
import type { Widget } from '../store/useWorkspaceStore'

interface Props {
  widget: Widget
  onUpdate: (patch: Partial<Widget>) => void
}

export default function NoteWidget({ widget, onUpdate }: Props) {
  const text = (widget.data.text as string) ?? ''
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ data: { ...widget.data, text: e.target.value } })
    },
    [onUpdate, widget.data]
  )

  // Prevent canvas zoom when scrolling inside a note
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={handleChange}
      onWheel={handleWheel}
      placeholder="Start writing…"
      style={styles.textarea}
      spellCheck={false}
    />
  )
}

const styles: Record<string, React.CSSProperties> = {
  textarea: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    color: '#c8c8c8',
    fontSize: 13,
    lineHeight: 1.6,
    padding: '12px 14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    caretColor: '#6b7ff0',
  },
}
