// ─────────────────────────────────────────────────────────────────────────────
// useAnalyticsMobileLayout.ts
//
// Presentation-only mobile layout state for analytics pages.
// Golden Reference: AllAssetsAnalytics isMobileLandscape / mobileTab /
// mobileMenuOpen behavior.
//
// Does NOT know about assets, promotions, metrics, Supabase, or engines.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

export type AnalyticsMobileViewMode = 'cards' | 'table';

export interface AnalyticsMobileLayout {
  /** true when max-width 1023px AND orientation landscape */
  isMobileLandscape: boolean;
  viewMode: AnalyticsMobileViewMode;
  setViewMode: (mode: AnalyticsMobileViewMode) => void;
  filterOpen: boolean;
  setFilterOpen: (open: boolean) => void;
}

/**
 * Shared responsive chrome state.
 * Default viewMode is 'cards' (matches AllAssetsAnalytics).
 */
export function useAnalyticsMobileLayout(
  initialViewMode: AnalyticsMobileViewMode = 'cards',
): AnalyticsMobileLayout {
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);
  const [viewMode, setViewMode] = useState<AnalyticsMobileViewMode>(initialViewMode);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    // Only fires below the lg breakpoint — desktop is unaffected.
    const mq = window.matchMedia('(max-width: 1023px) and (orientation: landscape)');
    const update = () => setIsMobileLandscape(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return {
    isMobileLandscape,
    viewMode,
    setViewMode,
    filterOpen,
    setFilterOpen,
  };
}
