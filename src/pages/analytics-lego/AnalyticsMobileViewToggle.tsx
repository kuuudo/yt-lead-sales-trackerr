// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsMobileViewToggle.tsx
//
// Cards | Table switch — visual/behavior match AllAssetsAnalytics.
// Presentation only; no knowledge of row types or metrics.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import type { AnalyticsMobileViewMode } from './useAnalyticsMobileLayout';

export interface AnalyticsMobileViewToggleProps {
  mode: AnalyticsMobileViewMode;
  onChange: (mode: AnalyticsMobileViewMode) => void;
  /** When true (mobile landscape), render nothing — Golden Reference behavior. */
  hidden?: boolean;
}

export function AnalyticsMobileViewToggle({
  mode,
  onChange,
  hidden = false,
}: AnalyticsMobileViewToggleProps) {
  if (hidden) return null;

  return (
    <div className="lg:hidden flex items-center gap-2 px-6 py-3 bg-zinc-950 border-b border-zinc-900">
      <button
        type="button"
        onClick={() => onChange('cards')}
        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
          mode === 'cards' ? 'bg-red-600 text-white' : 'border border-zinc-800 text-zinc-500'
        }`}
      >
        Cards
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
          mode === 'table' ? 'bg-red-600 text-white' : 'border border-zinc-800 text-zinc-500'
        }`}
      >
        Table
      </button>
    </div>
  );
}
