// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsMobileFilterSheet.tsx
//
// Mobile red filter FAB + bottom sheet container.
// Golden Reference: AllAssetsAnalytics mobileMenuOpen sheet.
// Page owns all filter control content via children.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Menu, X } from 'lucide-react';

export interface AnalyticsMobileFilterButtonProps {
  onClick: () => void;
  className?: string;
}

/** Red circular Menu FAB — top-right mobile chrome. */
export function AnalyticsMobileFilterButton({
  onClick,
  className = '',
}: AnalyticsMobileFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`lg:hidden w-11 h-11 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg shrink-0 ${className}`}
      aria-label="Open filters"
    >
      <Menu size={20} />
    </button>
  );
}

export interface AnalyticsMobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Overlay + bottom sheet. Does not render FAB — use AnalyticsMobileFilterButton.
 * Closing: X button, or page can call onOpenChange(false) from Apply.
 */
export function AnalyticsMobileFilterSheet({
  open,
  onOpenChange,
  title = 'Filters & Sort',
  children,
}: AnalyticsMobileFilterSheetProps) {
  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-[9500] flex flex-col justify-end bg-black/70">
      <div className="max-h-[85vh] bg-zinc-950 border-t border-zinc-800 rounded-t-3xl overflow-y-auto custom-scrollbar px-6 pt-5 pb-8 space-y-8">
        <div className="flex items-center justify-between sticky top-0 bg-zinc-950 pb-3 -mt-5 pt-5 -mx-6 px-6 border-b border-zinc-900">
          <span className="text-xs font-black uppercase tracking-widest text-white">{title}</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400"
            aria-label="Close filters"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
