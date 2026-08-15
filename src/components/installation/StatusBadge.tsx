import React from 'react';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import type { FunnelState, TrackingState } from './installationHelpers';

export const StatusBadge = ({
  state,
  label,
}: {
  state: FunnelState | TrackingState;
  label?: string;
}) => {
  const configs = {
    active: {
      color: 'text-green-400 bg-green-500/10 border-green-500/20',
      icon: <CheckCircle2 size={10} />,
      text: label ?? 'Active',
    },
    partial: {
      color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
      icon: <AlertCircle size={10} />,
      text: label ?? 'Partial',
    },
    pending: {
      color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
      icon: <AlertCircle size={10} />,
      text: label ?? 'Pending',
    },
    inactive: {
      color: 'text-red-400 bg-red-500/10 border-red-500/20',
      icon: <XCircle size={10} />,
      text: label ?? 'Inactive',
    },
  };
  const c = configs[state];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${c.color}`}
    >
      {c.icon} {c.text}
    </span>
  );
};