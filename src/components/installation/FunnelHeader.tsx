import React from 'react';
import type { FunnelState, TrackingState } from './installationHelpers';
import { StatusBadge } from './StatusBadge';

export const FunnelHeader = ({
  icon,
  title,
  funnelState,
  trackingState,
}: {
  icon: React.ReactNode;
  title: string;
  funnelState: FunnelState;
  trackingState: TrackingState;
}) => (
  <div className="flex items-center justify-between flex-wrap gap-2">
    <div className="flex items-center gap-2">
      <div className="text-zinc-500">{icon}</div>
      <span className="text-[11px] font-black uppercase tracking-widest text-white">
        {title}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Funnel</span>
        <StatusBadge state={funnelState} />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Tracking</span>
        <StatusBadge state={trackingState} />
      </div>
    </div>
  </div>
);