/**
 * src/components/MobileRankingsButton.tsx
 *
 * Mobile-only floating action button ("Root" icon) + modal that lets small
 * screens switch between the three existing ranking components instead of
 * showing all three stacked full-height charts in the normal page flow.
 *
 * Reuses, unmodified:
 *   - TopPromotions.tsx  (src/pages)
 *   - TopMarketers.tsx   (src/pages)
 *   - TopAssetsRanking   (src/components/assets)
 *
 * TopRankings.tsx is intentionally NOT used here — it bundles its own
 * Promotions/Marketers toggle internally, which would fight with this
 * component's own 3-way tab switcher. TopPromotions/TopMarketers exist
 * standalone specifically for cases like this (see TopRankings.tsx's own
 * file header). TopRankings.tsx itself is untouched and keeps running
 * as-is on desktop.
 *
 * Data note: TopAssetsRanking needs a pre-fetched `AssetLibraryRow[]`.
 * Assets.tsx already has this in state and can pass it straight in via
 * `assetRows`. Marketplace.tsx does not have it, so when `assetRows` is
 * omitted this component lazily calls the SAME existing
 * listAssetsByOrganization() service — only once, and only if the user
 * actually opens the Assets tab inside the modal. No ranking logic,
 * queries, or sorting are duplicated anywhere.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Castle, TrendingUp, Users, Library, X, Loader2 } from 'lucide-react';
import TopPromotions from '../pages/TopPromotions';
import TopMarketers from '../pages/TopMarketers';
import TopAssetsRanking from './assets/TopAssetsRanking';
import { listAssetsByOrganization } from '../services/asset/listAssetsByOrganization';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';

type RankingKey = 'promotions' | 'marketers' | 'assets';

const TABS: { key: RankingKey; label: string; icon: typeof TrendingUp }[] = [
  { key: 'promotions', label: 'Top Promotions', icon: TrendingUp },
  { key: 'marketers', label: 'Top Marketers', icon: Users },
  { key: 'assets', label: 'Top Assets', icon: Library },
];

interface MobileRankingsButtonProps {
  organizationId: string | null;
  /** Which tab is selected the moment the modal opens. User can still switch freely afterward. */
  defaultRanking: RankingKey;
  /** Pass this in if the host page already has the org's asset rows (e.g. Assets.tsx) to avoid a refetch. */
  assetRows?: AssetLibraryRow[];
}

export default function MobileRankingsButton({
  organizationId,
  defaultRanking,
  assetRows,
}: MobileRankingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<RankingKey>(defaultRanking);

  // Only used when the host page didn't already pass assetRows (Marketplace.tsx case).
  const [fetchedAssetRows, setFetchedAssetRows] = useState<AssetLibraryRow[] | null>(null);
  const [assetRowsLoading, setAssetRowsLoading] = useState(false);
  const [assetRowsError, setAssetRowsError] = useState<string | null>(null);

  // Reset to the page's preferred default every time the modal is (re)opened.
  useEffect(() => {
    if (open) setActiveTab(defaultRanking);
  }, [open, defaultRanking]);

  // Lazy, one-time fetch of asset rows — only if needed and not already provided.
  useEffect(() => {
    if (!open || activeTab !== 'assets') return;
    if (assetRows || fetchedAssetRows || assetRowsLoading || !organizationId) return;

    let cancelled = false;
    setAssetRowsLoading(true);
    setAssetRowsError(null);
    listAssetsByOrganization({ organizationId })
      .then(rows => {
        if (!cancelled) setFetchedAssetRows(rows);
      })
      .catch((err: any) => {
        if (!cancelled) setAssetRowsError(err?.message ?? 'Could not load asset rankings.');
      })
      .finally(() => {
        if (!cancelled) setAssetRowsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeTab, assetRows, fetchedAssetRows, assetRowsLoading, organizationId]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Prevent background scroll while the modal is open.
  useEffect(() => {
    if (open) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [open]);

  const resolvedAssetRows = assetRows ?? fetchedAssetRows;

  return (
    <>
      {/* Floating button — mobile only, matches the project's existing md: breakpoint convention */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open rankings"
        className="md:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-zinc-900 border border-zinc-700 shadow-[0_8px_24px_rgba(0,0,0,0.5)] flex items-center justify-center text-red-500 hover:border-zinc-500 hover:text-red-400 active:scale-95 transition-all"
      >
        <Castle size={22} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                  <Castle size={16} className="text-red-500" /> Rankings
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close rankings"
                  className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 mb-4 shrink-0 overflow-x-auto">
                {TABS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${
                      activeTab === key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Icon size={12} className={activeTab === key ? 'text-red-500' : ''} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto -mx-1 px-1">
                {activeTab === 'promotions' && <TopPromotions organizationId={organizationId} />}
                {activeTab === 'marketers' && <TopMarketers organizationId={organizationId} />}
                {activeTab === 'assets' && (
                  <>
                    {assetRowsLoading && (
                      <div className="flex items-center gap-2 text-zinc-500 text-xs py-6 justify-center">
                        <Loader2 className="animate-spin" size={14} /> Loading…
                      </div>
                    )}
                    {!assetRowsLoading && assetRowsError && (
                      <div className="text-red-500 text-xs border border-red-900 bg-red-950/30 rounded-lg p-3">
                        {assetRowsError}
                      </div>
                    )}
                    {!assetRowsLoading && !assetRowsError && organizationId && resolvedAssetRows && (
                      <TopAssetsRanking organizationId={organizationId} rows={resolvedAssetRows} />
                    )}
                    {!assetRowsLoading && !assetRowsError && (!organizationId || !resolvedAssetRows) && (
                      <div className="text-zinc-600 text-xs text-center py-6">No asset data yet</div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
