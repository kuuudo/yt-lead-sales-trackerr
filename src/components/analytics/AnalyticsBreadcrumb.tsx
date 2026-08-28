// components/analytics/AnalyticsBreadcrumb.tsx
import React from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useDrillDown, type BreadcrumbItem } from '../../lib/DrillDownContext';

export default function AnalyticsBreadcrumb() {
  const { state, goToBreadcrumb, clearAll } = useDrillDown();
  const crumbs = state.breadcrumbs;

  if (crumbs.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      {crumbs.map((item: BreadcrumbItem, i: number) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={`${item.level}-${item.label}-${i}`}>
            {i > 0 && (
              <ChevronRight size={12} className="text-zinc-700 shrink-0" />
            )}
            {isLast ? (
              <span className="text-[10px] font-black uppercase tracking-widest text-white truncate max-w-[160px]">
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => goToBreadcrumb(item)}
                className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors truncate max-w-[140px]"
              >
                {item.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
      <button
        type="button"
        onClick={clearAll}
        title="Clear drill-down context"
        className="ml-2 p-1 rounded-md border border-zinc-800 text-zinc-600 hover:text-white hover:border-zinc-600 transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}