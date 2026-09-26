// ─────────────────────────────────────────────────────────────────────────────
// PromotionAssetsCell.tsx
//
// Compact "N Assets" trigger + modal list (thumbnail / title / type).
// Presentation only — data passed in from page.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { PromotionAssetIdentity } from './resolvePromotionAssets';

export interface PromotionAssetsCellProps {
  assets: PromotionAssetIdentity[];
  promotionTitle?: string;
}

export function PromotionAssetsCell({ assets, promotionTitle }: PromotionAssetsCellProps) {
  const [open, setOpen] = useState(false);
  const n = assets.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-lg px-2.5 py-1.5 transition-colors"
        disabled={n === 0}
      >
        {n === 0 ? '0 Assets' : `${n} Asset${n === 1 ? '' : 's'}`}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9600] flex items-end sm:items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[80vh] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Assets
                </div>
                <div className="text-xs font-bold text-white truncate">
                  {promotionTitle ?? 'Promotion'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-3.5rem)] p-3 space-y-2">
              {n === 0 && (
                <div className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  No assets on this promotion
                </div>
              )}
              {assets.map(a => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-zinc-900 bg-zinc-900/40"
                >
                  {a.thumbnailUrl ? (
                    <img
                      src={a.thumbnailUrl}
                      alt=""
                      className="w-12 h-9 object-cover rounded-lg border border-zinc-800 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-9 rounded-lg border border-zinc-800 bg-zinc-950 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-zinc-200 truncate">{a.title}</div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mt-0.5">
                      {(a.assetType ?? 'asset').replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
