/**
 * src/components/analytics/widgets/NoteWidget.tsx
 *
 * Editable text note widget.
 *
 * Features:
 *  - Local textarea state for instant typing
 *  - Debounced Zustand updates (300ms)
 *  - Prevents canvas re-render on every keystroke
 *  - Placeholder text when empty
 *  - Wheel events inside textarea do not zoom canvas
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { Widget } from '../store/useWorkspaceStore'

interface Props {
  widget: Widget
  onUpdate: (patch: Partial<Widget>) => void
}

export default function NoteWidget({ widget, onUpdate }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Store value
  const storeText = (widget.data.text as string) ?? ''

  // Local state drives the textarea
  const [localText, setLocalText] = useState<string>(storeText)

  // Tracks our own writes so we don't overwrite typing
  const lastStorePush = useRef(storeText)

  useEffect(() => {
    if (storeText !== lastStorePush.current) {
      setLocalText(storeText)
      lastStorePush.current = storeText
    }
  }, [storeText])

  // Debounce Zustand writes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value

      // Instant UI update
      setLocalText(value)

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        lastStorePush.current = value

        onUpdate({
          data: {
            ...widget.data,
            text: value,
          },
        })
      }, 300)
    },
    [onUpdate, widget.data]
  )

  // Prevent canvas zoom when scrolling inside a note
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
  }, [])

  // Cleanup pending debounce if widget is removed
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return (
    <textarea
      ref={textareaRef}
      value={localText}
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