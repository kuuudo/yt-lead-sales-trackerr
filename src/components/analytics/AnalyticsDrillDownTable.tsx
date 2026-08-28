// components/analytics/AnalyticsDrillDownTable.tsx
// Hover = identity item only. Click = parent node + path grows RIGHT from it.
import React, { useState } from 'react';
import { ArrowUpDown } from 'lucide-react';

export type ColumnDef<T> = {
  key: string;
  label: string;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  className?: string;
  interactive?: boolean;
};

type Props<T extends { id: string }> = {
  columns: ColumnDef<T>[];
  rows: T[];
  expandedId: string | null;
  onRowClick: (row: T) => void;
  /** Nodes to the RIGHT of the selected identity (connectors included by caller or GrowPath) */
  renderGrowPath?: (row: T) => React.ReactNode;
  emptyLabel?: string;
};

export default function AnalyticsDrillDownTable<T extends { id: string }>({
  columns,
  rows,
  expandedId,
  onRowClick,
  renderGrowPath,
  emptyLabel = 'No rows',
}: Props<T>) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const interactiveKey =
    columns.find(c => c.interactive)?.key ?? columns[0]?.key ?? null;

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

  return (
    <div className="relative w-full overflow-x-auto">
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
            const isDimmed = expandedId != null && !isExpanded;

            return (
              <tr
                key={row.id}
                className={[
                  'transition-opacity duration-150',
                  isDimmed ? 'opacity-30 pointer-events-none' : '',
                ].join(' ')}
              >
                {columns.map(col => {
                  const isInteractive = col.key === interactiveKey;

                  if (isInteractive) {
                    return (
                      <td
                        key={col.key}
                        className={`px-6 py-3.5 align-middle relative ${col.className ?? ''}`}
                      >
                        {/* Identity: hover target only */}
                        <button
                          type="button"
                          onMouseEnter={() => setHoveredId(row.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          onClick={() => onRowClick(row)}
                          className={[
                            'relative z-10 text-left rounded-lg px-2.5 py-1.5 -mx-2.5 -my-1',
                            'text-sm font-bold transition-colors duration-150 max-w-[220px]',
                            isExpanded
                              ? 'bg-red-500/15 text-white ring-1 ring-red-500/40'
                              : hoveredId === row.id
                                ? 'bg-zinc-800 text-white'
                                : 'text-zinc-200 hover:bg-zinc-800/80 hover:text-white',
                          ].join(' ')}
                        >
                          <span className="truncate block">{col.render(row)}</span>
                        </button>

                        {/* Grow FROM this item → RIGHT (overlay, not under-row panel) */}
                        {isExpanded && renderGrowPath && (
                          <div
                            className="absolute left-full top-1/2 -translate-y-1/2 z-30 pl-1 flex items-center"
                            style={{
                              animation: 'analyticsGrowIn 180ms ease-out both',
                            }}
                          >
                            <span className="text-zinc-500 text-xs font-bold px-1 select-none">→</span>
                            <div className="flex items-center gap-0 rounded-2xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-2 py-2 shadow-xl shadow-black/40">
                              {renderGrowPath(row)}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  }

                  return (
                    <td
                      key={col.key}
                      className={`px-6 py-3.5 whitespace-nowrap text-sm font-bold text-zinc-400 tabular-nums ${
                        isExpanded ? 'opacity-20' : ''
                      } ${col.className ?? ''}`}
                    >
                      {col.render(row)}
                    </td>
                  );
                })}
              </tr>
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