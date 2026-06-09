/**
 * src/components/analytics/canvas/CanvasGrid.tsx
 *
 * Dot-grid background that tiles seamlessly with pan/zoom.
 *
 * Rendered as a fixed SVG pattern in screen space.
 * The pattern origin is offset by (panX mod gridSize, panY mod gridSize)
 * so dots appear to move with the canvas without needing to re-render
 * a huge SVG.
 *
 * The dot size and spacing scale with zoom level so the grid
 * stays readable at all scales.
 */

import React from 'react'
import type { CanvasTransform } from '../store/useWorkspaceStore'

interface Props {
  transform: CanvasTransform
}

export default function CanvasGrid({ transform }: Props) {
  const { x, y, scale } = transform

  // Base grid size in canvas units.
  // At scale 1.0 → 24px between dots.
  // Scale naturally with zoom until too dense or too sparse → switch tier.
  const BASE_GRID = 24

  let gridSize = BASE_GRID * scale
  // If grid would be < 12px, double the base unit
  while (gridSize < 12) gridSize *= 2
  // If grid would be > 80px, halve
  while (gridSize > 80) gridSize /= 2

  // Dot radius scales with zoom but stays readable
  const dotRadius = Math.max(0.6, Math.min(1.8, scale * 0.9))

  // Offset so dots move with the canvas
  const offsetX = ((x % gridSize) + gridSize) % gridSize
  const offsetY = ((y % gridSize) + gridSize) % gridSize

  const patternId = 'canvas-dot-grid'

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <defs>
        <pattern
          id={patternId}
          x={offsetX}
          y={offsetY}
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={gridSize / 2} cy={gridSize / 2} r={dotRadius} fill="#222" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
