/**
 * src/components/analytics/widgets/CircleWidget.tsx
 *
 * A coloured circle (ellipse) shape widget.
 * Rendered via borderRadius: '50%' — becomes a perfect circle when
 * width === height (which the defaults enforce).
 *
 * Config fields (user-defined, persisted):
 *   config.fillColor   — hex string, default '#8b5cf6'
 *   config.strokeColor — hex string, default '#a78bfa'
 *   config.strokeWidth — number, default 2
 *   config.opacity     — number 0–1, default 1
 *
 * data: {} (no machine-written data for shape widgets)
 *
 * Double-click the widget body to open the style panel.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { Widget } from '../store/useWorkspaceStore'

interface Props {
  widget: Widget
  onUpdate: (patch: Partial<Widget>) => void
}

export default function CircleWidget({ widget, onUpdate }: Props) {
  const config = widget.config

  const fillColor   = (config.fillColor   as string) ?? '#8b5cf6'
  const strokeColor = (config.strokeColor as string) ?? '#a78bfa'
  const strokeWidth = (config.strokeWidth as number) ?? 2
  const opacity     = (config.opacity     as number) ?? 1

  const [showPanel, setShowPanel] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

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

  const update = useCallback(
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
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onDoubleClick={(e) => { e.stopPropagation(); setShowPanel(true) }}
    >
      {/* Circle shape — fills the widget bounds */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: fillColor,
          borderRadius: '50%',
          border: `${strokeWidth}px solid ${strokeColor}`,
          opacity,
          boxSizing: 'border-box',
        }}
      />

      {/* Config panel */}
      {showPanel && (
        <div
          ref={panelRef}
          style={panelStyles.panel}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p style={panelStyles.heading}>Circle Style</p>

          <label style={panelStyles.row}>
            <span style={panelStyles.label}>Fill</span>
            <input
              type="color"
              value={fillColor}
              onChange={(e) => update('fillColor', e.target.value)}
              style={panelStyles.colorInput}
            />
          </label>

          <label style={panelStyles.row}>
            <span style={panelStyles.label}>Stroke</span>
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => update('strokeColor', e.target.value)}
              style={panelStyles.colorInput}
            />
          </label>

          <label style={panelStyles.row}>
            <span style={panelStyles.label}>Stroke W.</span>
            <input
              type="range" min={0} max={16} step={1}
              value={strokeWidth}
              onChange={(e) => update('strokeWidth', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={panelStyles.val}>{strokeWidth}px</span>
          </label>

          <label style={panelStyles.row}>
            <span style={panelStyles.label}>Opacity</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={opacity}
              onChange={(e) => update('opacity', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={panelStyles.val}>{Math.round(opacity * 100)}%</span>
          </label>

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

const panelStyles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 50,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '14px 16px',
    width: 210,
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
    minWidth: 56,
    fontSize: 11,
    color: '#888',
  },
  val: {
    minWidth: 34,
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
