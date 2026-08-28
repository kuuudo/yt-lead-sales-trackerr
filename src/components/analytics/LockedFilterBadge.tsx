// components/analytics/LockedFilterBadge.tsx
import React from 'react';
import { Lock } from 'lucide-react';

interface Props {
  label: string;
  value: string;
}

/** Visual locked filter chip — used when a dimension arrived via drill-down */
export default function LockedFilterBadge({ label, value }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
        <Lock size={10} className="text-amber-500/80" />
        {label}
      </label>
      <div className="w-full bg-zinc-900/80 border border-amber-500/30 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-amber-200/90 flex items-center gap-2 cursor-not-allowed select-none">
        <Lock size={11} className="text-amber-500/70 shrink-0" />
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}