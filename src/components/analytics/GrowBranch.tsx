// components/analytics/GrowBranch.tsx
// Horizontal path nodes — same spatial idea as onboarding HubPathRow (node → node).
import React from 'react';

export function GrowConnector() {
  return (
    <div
      aria-hidden
      className="flex items-center justify-center self-center shrink-0 px-0.5 text-zinc-500 text-xs font-bold select-none"
    >
      →
    </div>
  );
}

export function GrowNode({
  label,
  sub,
  onClick,
  active,
  accent = 'border-zinc-700 hover:border-zinc-500',
}: {
  label: string;
  sub?: string;
  onClick?: () => void;
  active?: boolean;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
      className={[
        'text-left min-w-[10.5rem] max-w-[14rem] shrink-0 rounded-xl border px-3.5 py-2.5',
        'bg-zinc-900 transition-all duration-200 ease-out',
        active ? 'border-red-500/50 ring-1 ring-red-500/30' : accent,
        onClick ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      <div className="text-[10px] font-black uppercase tracking-tight text-white truncate">
        {label}
      </div>
      {sub && (
        <div className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5 truncate">
          {sub}
        </div>
      )}
    </button>
  );
}

/** Chain that grows from a parent label to the right */
export function GrowPath({
  parentLabel,
  parentSub,
  children,
}: {
  parentLabel: string;
  parentSub?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-0 min-w-max"
      style={{
        animation: 'analyticsGrowIn 180ms ease-out both',
      }}
    >
      <GrowNode label={parentLabel} sub={parentSub} active />
      <GrowConnector />
      {children}
    </div>
  );
}