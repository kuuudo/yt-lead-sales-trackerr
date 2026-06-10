/**
 * src/components/analytics/widgets/ArrowWidget.tsx
 *
 * A visual arrow shape widget — NOT a connector.
 * The arrow is a horizontal SVG pointing right by default.
 * It scales correctly with widget resize.
 * Rotation is stored in config.rotation and applied via CSS transform.
 *
 * Config fields (user-defined, persisted):
 *   config.color     — hex string, default 'transparent'
 *   config.rotation  — degrees, default 0
 *   config.headSize  — number 0–1 proportion, default 0.35
 *   config.opacity   — number 0–1, default 1
 *
 * data: {} (no machine-written data for shape widgets)
 *
 * Double-click to open style panel.
 * Rotation buttons rotate by ±15°.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { Widget } from '../store/useWorkspaceStore'

interface Props {
  widget: Widget
  onUpdate: (patch: Partial<Widget>) => void
}

export default function ArrowWidget({ widget, onUpdate }: Props) {
  const config = widget.config

  const color    = (config.color    as string) ?? 'transparent'
  const strokeColor = (config.strokeColor as string) ?? '#9ca3af'
  const strokeWidth = (config.strokeWidth as number) ?? 2
  const rotation = (config.rotation as number) ?? 0
  const headSize = (config.headSize as number) ?? 0.35
  const opacity  = (config.opacity  as number) ?? 1
  const effectiveFill =
  fillColor === 'transparent' ? 'none' : fillColor

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

  const rotate = useCallback(
    (delta: number) => {
      update('rotation', ((rotation + delta) % 360 + 360) % 360)
    },
    [rotation, update]
  )

  // Arrow SVG drawn in a 200×40 viewBox (proportional to the default widget size).
  // The arrowhead is a filled polygon; the shaft is a rect.
  // headSize controls what fraction of the total width the head takes.
  // Both are drawn at full height to scale naturally with resize.

  const VB_W = 200
  const VB_H = 40
  const headW = VB_W * headSize        // width of arrowhead triangle
  const shaftRight = VB_W - headW      // where shaft ends / head begins
  const shaftMidTop = VB_H * 0.3
  const shaftMidBot = VB_H * 0.7

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
      onDoubleClick={(e) => { e.stopPropagation(); setShowPanel(true) }}
    >
      {/* Arrow SVG — fills the widget, rotated via CSS */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `rotate(${rotation}deg)`,
          opacity,
        }}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Shaft */}
          <rect
            x={0}
            y={shaftMidTop}
            width={shaftRight}
            height={shaftMidBot - shaftMidTop}
            fill={effectiveFill}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
          {/* Arrowhead (triangle) */}
          <polygon
            points={`${shaftRight},0 ${VB_W},${VB_H / 2} ${shaftRight},${VB_H}`}
            fill={effectiveFill}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Config panel */}
      {showPanel && (
        <div
          ref={panelRef}
          style={panelStyles.panel}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p style={panelStyles.heading}>Arrow Style</p>

          <label style={panelStyles.row}>
            <span style={panelStyles.label}>Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => update('color', e.target.value)}
              style={panelStyles.colorInput}
            />
          </label>

          <label style={panelStyles.row}>
            <span style={panelStyles.label}>Head size</span>
            <input
              type="range" min={0.1} max={0.7} step={0.05}
              value={headSize}
              onChange={(e) => update('headSize', Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={panelStyles.val}>{Math.round(headSize * 100)}%</span>
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

          {/* Rotation */}
          <div style={panelStyles.row}>
            <span style={panelStyles.label}>Rotate</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
              <button style={panelStyles.rotBtn} onClick={() => rotate(-15)}>−15°</button>
              <span style={{ ...panelStyles.val, flex: 1, textAlign: 'center' }}>
                {rotation}°
              </span>
              <button style={panelStyles.rotBtn} onClick={() => rotate(15)}>+15°</button>
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
    minWidth: 60,
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
  rotBtn: {
    background: '#2a2a2a',
    border: 'none',
    borderRadius: 5,
    color: '#ccc',
    fontSize: 11,
    padding: '4px 8px',
    cursor: 'pointer',
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
