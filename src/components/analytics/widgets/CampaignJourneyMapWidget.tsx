/**
 * src/components/analytics/widgets/CampaignJourneyMapWidget.tsx
 *
 * Workspace canvas widget that hosts the full CampaignJourneyMap UI
 * (presentation="tree") inside a bounded widget container.
 *
 * Interaction contract (three levels):
 *   1. Widget chrome title-bar drag  → moves the whole widget (Workspace)
 *   2. Map background drag / wheel   → pans / zooms the map only
 *   3. Node drag                     → moves that node inside the map
 *
 * Event isolation: pointer and wheel events that originate inside the map
 * are stopped from bubbling to the Workspace board so they cannot start a
 * board pan or widget drag. The Workspace title-bar / drag handle lives
 * *outside* this component, so widget repositioning is unaffected.
 */

import React from 'react'
import CampaignJourneyMap from '../../../pages/CampaignJourneyMap'
import type { Widget } from '../store/useWorkspaceStore'

interface Props {
  widget: Widget
  onUpdate?: (patch: Partial<Widget>) => void
  analyticsResult?: unknown
}

export default function CampaignJourneyMapWidget({ widget }: Props) {
  // Optional future: drive selectedCampaignId from widget.config
  // const selectedCampaignId = (widget.config?.selectedCampaignId as string) ?? undefined

  return (
    <div
      style={styles.root}
      // Keep map gestures from reaching the Workspace board / widget frame.
      // Title-bar drag is outside this root, so the widget can still be moved.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <CampaignJourneyMap presentation="tree" embedded />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    // Ensures the map's absolute/fixed descendants are contained.
    // CampaignJourneyMap switches its page shell to absolute fill when
    // presentation="tree" or embedded=true (see that file).
    background: '#0a0a0a',
  },
}
