// components/analytics/GrowBranch.tsx
// Horizontal grow nodes used inside expand panels.

import React from 'react';
import { ChevronRight } from 'lucide-react';

export function GrowConnector() {
  return (
    <div className="flex items-center self-center shrink-0 px-1 text-zinc-600">
      <div className="w-6 h-px bg-zinc-600" />
      <ChevronRight size={14} className="text-zinc-600 -ml-1" />
    </div>
  );
}

export function GrowNode({
  label,
  sub,
  onClick,
  accent = 'border-zinc-700 hover:border-zinc-500',
}: {
  label: string;
  sub?: string;
  onClick?: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`text-left w-48 shrink-0 rounded-xl border bg-zinc-900 px-4 py-3 transition-all duration-150 ${accent} ${
        onClick ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="text-[11px] font-black uppercase tracking-tight text-white truncate">
        {label}
      </div>
      {sub && (
        <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
          {sub}
        </div>
      )}
    </button>
  );
}