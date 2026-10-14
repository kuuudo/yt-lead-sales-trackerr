/**
 * src/components/analytics/widgets/TreeWidget.tsx
 *
 * Workspace canvas widget that hosts the full Tree page UI (campaign metrics
 * + 3D tree) inside a bounded widget container.
 *
 * Interaction contract:
 *   1. Widget chrome title-bar drag → moves the whole widget (Workspace)
 *   2. Pointer / wheel inside the widget → stay on Tree (OrbitControls orbit,
 *      selects, buttons) and do not pan/zoom the Workspace board
 *
 * Config (widget.config) — reserved for later persistence:
 *   selectedCampaignId, timePreset, pickedMonthStart
 * Tree currently owns that state internally (same as the full page).
 */

import React from 'react'
import { Tree } from '../../../pages/Tree'
import type { Widget } from '../store/useWorkspaceStore'

interface Props {
  widget: Widget
  onUpdate?: (patch: Partial<Widget>) => void
  analyticsResult?: unknown
}

export default function TreeWidget({ widget }: Props) {
  void widget // config reserved for a later pass

  return (
    <div
      style={styles.root}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <Tree embedded />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: '#0a0a0a',
  },
}
