// components/analytics/AnalyticsDrillDownTable.tsx
// Reusable: real metrics table + hover highlight/dim + click → expand callback.
// Hover never expands. Click selects and calls onRowClick.

import React, { useState } from 'react';
import { ArrowUpDown } from 'lucide-react';

export type ColumnDef<T> = {
  key: string;
  label: string;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  className?: string;
};

type Props<T extends { id: string }> = {
  columns: ColumnDef<T>[];
  rows: T[];
  /** Currently expanded row (middle stage open for this id) */
  expandedId: string | null;
  onRowClick: (row: T) => void;
  /** Optional panel grown L→R from the expanded row */
  renderExpand?: (row: T) => React.ReactNode;
  emptyLabel?: string;
};

export default function AnalyticsDrillDownTable<T extends { id: string }>({
  columns,
  rows,
  expandedId,
  onRowClick,
  renderExpand,
  emptyLabel = 'No rows',
}: Props<T>) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find(c => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir;
      }
      if (av === bv) return 0;
      return (av as number) > (bv as number) ? dir : -dir;
    });
  }, [rows, sortKey, sortDir, columns]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const focusId = expandedId ?? hoveredId;

  return (
    <div className="relative w-full">
      <table className="min-w-full divide-y divide-zinc-900 border-collapse">
        <thead className="bg-zinc-950 sticky top-0 z-20">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => col.sortValue && handleSort(col.key)}
                className={`px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900 bg-zinc-950 ${
                  col.sortValue ? 'cursor-pointer hover:text-zinc-300' : ''
                } ${col.className ?? ''}`}
              >
                <div className="flex items-center gap-1.5">
                  {col.label}
                  {col.sortValue && (
                    <ArrowUpDown
                      size={10}
                      className={sortKey === col.key ? 'text-white' : 'text-zinc-700'}
                    />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-black divide-y divide-zinc-900">
          {sorted.map(row => {
            const isExpanded = expandedId === row.id;
            const isFocus = focusId === row.id;
            const isDimmed = focusId != null && !isFocus;

            return (
              <React.Fragment key={row.id}>
                <tr
                  onMouseEnter={() => !expandedId && setHoveredId(row.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onRowClick(row)}
                  className={[
                    'transition-all duration-150 cursor-pointer',
                    isExpanded
                      ? 'bg-zinc-900 ring-1 ring-inset ring-red-500/40'
                      : isFocus
                        ? 'bg-zinc-900/80'
                        : isDimmed
                          ? 'opacity-30'
                          : 'hover:bg-zinc-950',
                  ].join(' ')}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-6 py-3.5 whitespace-nowrap text-sm font-bold text-zinc-300 ${col.className ?? ''}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {/* L→R grow panel under expanded row */}
                {isExpanded && renderExpand && (
                  <tr className="bg-zinc-950/90">
                    <td colSpan={columns.length} className="px-6 py-5 border-b border-zinc-800">
                      <div className="flex items-stretch gap-0 overflow-x-auto">
                        {renderExpand(row)}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-6 py-16 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600"
              >
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}