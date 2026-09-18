/**
 * Shared Path B promoted-asset panel (same behavior as Videos.tsx Track New Content):
 * - optional multi-Promotion chooser when an asset belongs to several promotions
 * - per-asset Marketer / Sponsor (read-only) / VSTRK domain controls from
 *   assignment_assets.allow_* + promotion_assets usage
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { PromotedAssetRow } from './PromotedAssetPicker';
import {
  loadPromotionAssetsForCreative,
  type CreativePromotionAssetRow,
} from '../services/promotion/listCreativeEligibleCampaigns';
import {
  resolvePromotionContextForAsset,
  toPromotionContext,
  type PromotionContext,
  type PromotionContextOption,
} from '../services/asset/resolvePromotionContextForAsset';
import {
  listVerifiedBrandedDomains,
  type VerifiedDomainOption,
} from '../services/domain/brandedDomains';

export interface LockedPromotionRef {
  promotionId: string;
  assignmentId: string;
  label?: string;
  assignmentCollaboratorId?: string | null;
}

export interface PromotedAssetsPathBPanelProps {
  organizationId: string;
  userId: string;
  /** When set, skip multi-promo chooser and load Path B for this promotion only */
  lockedPromotion?: LockedPromotionRef | null;
  assets: PromotedAssetRow[];
  onAssetsChange: (assets: PromotedAssetRow[]) => void;
  selectedDomainByAssetId: Map<string, string | null>;
  onSelectedDomainByAssetIdChange: (next: Map<string, string | null>) => void;
  /** Optional: expose chosen promotion context for generateAssetRedirectLinks */
  onPromotionContextChange?: (ctxByAssetId: Map<string, PromotionContext | null>) => void;
  /** Open parent asset picker */
  onRequestAddAssets?: () => void;
}

export function PromotedAssetsPathBPanel({
  organizationId,
  userId,
  lockedPromotion,
  assets,
  onAssetsChange,
  selectedDomainByAssetId,
  onSelectedDomainByAssetIdChange,
  onPromotionContextChange,
  onRequestAddAssets,
}: PromotedAssetsPathBPanelProps) {
  const [usageRows, setUsageRows] = useState<CreativePromotionAssetRow[]>([]);
  const [promoOptionsByAsset, setPromoOptionsByAsset] = useState<
    Map<string, PromotionContextOption[]>
  >(new Map());
  const [chosenPromoByAsset, setChosenPromoByAsset] = useState<Map<string, PromotionContext>>(
    new Map(),
  );
  const [marketerDomains, setMarketerDomains] = useState<VerifiedDomainOption[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    listVerifiedBrandedDomains(organizationId)
      .then(setMarketerDomains)
      .catch(() => setMarketerDomains([]));
  }, [organizationId]);

  // Locked promotion: load Path B for all current assets
  useEffect(() => {
    if (!lockedPromotion?.promotionId || !lockedPromotion.assignmentId) return;
    let cancelled = false;
    (async () => {
      setLoadingUsage(true);
      try {
        const rows = await loadPromotionAssetsForCreative(
          lockedPromotion.promotionId,
          lockedPromotion.assignmentId,
        );
        if (cancelled) return;
        setUsageRows(rows);

        const option = {
          promotionId: lockedPromotion.promotionId,
          assignmentId: lockedPromotion.assignmentId,
          assignmentCollaboratorId: lockedPromotion.assignmentCollaboratorId ?? null,
          label: lockedPromotion.label ?? 'Promotion',
        } as PromotionContextOption;
        const chosen = toPromotionContext(option);
        const ctxMap = new Map<string, PromotionContextOption[]>();
        const chosenMap = new Map<string, PromotionContext>();
        for (const a of assets) {
          ctxMap.set(a.asset_id, [option]);
          chosenMap.set(a.asset_id, chosen);
        }
        setPromoOptionsByAsset(ctxMap);
        setChosenPromoByAsset(chosenMap);

        const domainMap = new Map(selectedDomainByAssetId);
        for (const r of rows) {
          if (domainMap.has(r.asset_id)) continue;
          if (r.use_marketer_domain && r.selected_marketer_domain_id) {
            domainMap.set(r.asset_id, r.selected_marketer_domain_id);
          } else if (r.allow_vstrk_domain || r.use_vstrk_domain) {
            domainMap.set(r.asset_id, null);
          } else if (r.allow_sponsor_domain && r.selected_sponsor_domain_id) {
            domainMap.set(r.asset_id, r.selected_sponsor_domain_id);
          } else {
            domainMap.set(r.asset_id, null);
          }
        }
        onSelectedDomainByAssetIdChange(domainMap);
      } catch (e) {
        console.error('[PromotedAssetsPathBPanel] locked load failed', e);
      } finally {
        if (!cancelled) setLoadingUsage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedPromotion?.promotionId, lockedPromotion?.assignmentId, assets.map(a => a.asset_id).join(',')]);

  // Unlocked: resolve multi-promotion options per asset
  useEffect(() => {
    if (lockedPromotion?.promotionId || !userId || assets.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoadingUsage(true);
      try {
        const entries = await Promise.all(
          assets.map(async a => {
            const options = await resolvePromotionContextForAsset(a.asset_id, userId);
            return [a.asset_id, options] as const;
          }),
        );
        if (cancelled) return;
        const next = new Map<string, PromotionContextOption[]>();
        const chosen = new Map(chosenPromoByAsset);
        for (const [assetId, options] of entries) {
          next.set(assetId, options);
          if (options.length === 1) {
            chosen.set(assetId, toPromotionContext(options[0]));
          }
        }
        setPromoOptionsByAsset(next);
        setChosenPromoByAsset(chosen);

        // Load usage for resolved contexts
        const byPromo = new Map<string, { assignmentId: string; assetIds: string[] }>();
        for (const [assetId, options] of next.entries()) {
          const ctx =
            options.length === 1 ? toPromotionContext(options[0]) : chosen.get(assetId);
          if (!ctx?.promotionId || !ctx.assignmentId) continue;
          const cur = byPromo.get(ctx.promotionId) ?? {
            assignmentId: ctx.assignmentId,
            assetIds: [] as string[],
          };
          cur.assetIds.push(assetId);
          byPromo.set(ctx.promotionId, cur);
        }
        const merged: CreativePromotionAssetRow[] = [];
        for (const [promotionId, { assignmentId, assetIds }] of byPromo) {
          const rows = await loadPromotionAssetsForCreative(promotionId, assignmentId);
          for (const r of rows) {
            if (assetIds.includes(r.asset_id)) merged.push(r);
          }
        }
        if (!cancelled) setUsageRows(merged);
      } catch (e) {
        console.error('[PromotedAssetsPathBPanel] resolve failed', e);
      } finally {
        if (!cancelled) setLoadingUsage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedPromotion?.promotionId, userId, assets.map(a => a.asset_id).join(',')]);

  useEffect(() => {
    if (!onPromotionContextChange) return;
    const out = new Map<string, PromotionContext | null>();
    for (const a of assets) {
      out.set(a.asset_id, chosenPromoByAsset.get(a.asset_id) ?? null);
    }
    onPromotionContextChange(out);
  }, [assets, chosenPromoByAsset, onPromotionContextChange]);

  const removeAsset = (assetId: string) => {
    onAssetsChange(assets.filter(a => a.asset_id !== assetId));
  };

  const setDomain = (assetId: string, id: string | null) => {
    const next = new Map(selectedDomainByAssetId);
    next.set(assetId, id);
    onSelectedDomainByAssetIdChange(next);
  };

  const choosePromotion = (assetId: string, option: PromotionContextOption) => {
    const chosen = new Map(chosenPromoByAsset);
    chosen.set(assetId, toPromotionContext(option));
    setChosenPromoByAsset(chosen);
    // reload usage for this promo
    loadPromotionAssetsForCreative(option.promotionId, option.assignmentId)
      .then(rows => {
        setUsageRows(prev => {
          const others = prev.filter(r => r.asset_id !== assetId);
          const hit = rows.find(r => r.asset_id === assetId);
          return hit ? [...others, hit] : others;
        });
      })
      .catch(e => console.error(e));
  };

  if (assets.length === 0) {
    return (
      <div className="space-y-2">
        {onRequestAddAssets && (
          <button
            type="button"
            onClick={onRequestAddAssets}
            className="w-full border border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
          >
            + Select Asset
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loadingUsage && (
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Loading tracking options…</p>
      )}
      {assets.map(asset => {
        const label = asset.display_name || asset.asset_id;
        const options = promoOptionsByAsset.get(asset.asset_id) ?? [];
        const chosen = chosenPromoByAsset.get(asset.asset_id);
        const usage = usageRows.find(r => r.asset_id === asset.asset_id);

        if (!lockedPromotion && options.length > 1 && !chosen) {
          return (
            <div
              key={asset.asset_id}
              className="border border-dashed border-zinc-800 rounded-xl p-3 space-y-2"
            >
              <div className="flex justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{label}</p>
                <button type="button" className="text-zinc-500 hover:text-red-400" onClick={() => removeAsset(asset.asset_id)}>
                  ×
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                This asset is used in multiple promotions. Select which Promotion to track:
              </p>
              <div className="space-y-1">
                {options.map(opt => (
                  <button
                    key={opt.promotionId}
                    type="button"
                    onClick={() => choosePromotion(asset.asset_id, opt)}
                    className="w-full text-left text-xs px-3 py-2 rounded-xl border border-zinc-800 hover:border-zinc-600 text-zinc-200"
                  >
                    {(opt as any).label || opt.promotionId}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        if (!usage) {
          return (
            <div key={asset.asset_id} className="border border-zinc-800 rounded-xl p-3 flex justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{label}</p>
              <button type="button" className="text-zinc-500 hover:text-red-400" onClick={() => removeAsset(asset.asset_id)}>
                ×
              </button>
            </div>
          );
        }

        const currentDomainId = selectedDomainByAssetId.get(asset.asset_id) ?? null;
        const showMarketer = !!usage.allow_marketer_domain;
        const showSponsor = !!usage.allow_sponsor_domain;
        const showVstrk = !!usage.allow_vstrk_domain;
        const marketerSelected =
          currentDomainId && marketerDomains.some(d => d.id === currentDomainId)
            ? currentDomainId
            : usage.selected_marketer_domain_id &&
                marketerDomains.some(d => d.id === usage.selected_marketer_domain_id)
              ? usage.selected_marketer_domain_id
              : '';
        const usingSponsor =
          showSponsor &&
          !!usage.selected_sponsor_domain_id &&
          currentDomainId === usage.selected_sponsor_domain_id;
        const usingVstrk =
          showVstrk &&
          (currentDomainId === null || currentDomainId === '') &&
          !usingSponsor &&
          !(currentDomainId && marketerDomains.some(d => d.id === currentDomainId));

        return (
          <div key={asset.asset_id} className="border border-zinc-800 rounded-xl p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{label}</p>
              <button type="button" className="text-zinc-500 hover:text-red-400" onClick={() => removeAsset(asset.asset_id)}>
                ×
              </button>
            </div>
            <div className="space-y-2">
              {showMarketer && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                    Marketer&apos;s tracking domain
                  </p>
                  <select
                    value={marketerSelected || ''}
                    onChange={e => setDomain(asset.asset_id, e.target.value || null)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
                  >
                    <option value="">Select a domain</option>
                    {marketerDomains
                      .filter(d => d.id !== usage.selected_sponsor_domain_id)
                      .map(d => (
                        <option key={d.id} value={d.id}>
                          {d.hostname}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {showSponsor && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                    Sponsor&apos;s tracking domain
                  </p>
                  {usage.selected_sponsor_domain_id ? (
                    <button
                      type="button"
                      onClick={() => setDomain(asset.asset_id, usage.selected_sponsor_domain_id)}
                      className={`w-full text-left text-xs px-3 py-2 rounded-xl border ${
                        usingSponsor
                          ? 'border-red-600 bg-red-600/10 text-zinc-100'
                          : 'border-zinc-800 bg-zinc-900/80 text-zinc-300'
                      }`}
                    >
                      {usage.selected_sponsor_hostname ??
                        usage.selected_sponsor_domain_id.slice(0, 8) + '…'}
                      <span className="ml-2 text-[9px] uppercase tracking-widest text-zinc-500">
                        Read only · click to use
                      </span>
                    </button>
                  ) : (
                    <p className="text-xs text-zinc-500">Not configured by Sponsor</p>
                  )}
                </div>
              )}
              {showVstrk && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                    VSTRK tracking domain
                  </p>
                  <button
                    type="button"
                    onClick={() => setDomain(asset.asset_id, null)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-xl border ${
                      usingVstrk
                        ? 'border-red-600 bg-red-600/10 text-zinc-100'
                        : 'border-zinc-800 bg-zinc-900/80 text-zinc-300'
                    }`}
                  >
                    vstrk.com
                  </button>
                </div>
              )}
              {!showMarketer && !showSponsor && !showVstrk && (
                <p className="text-[10px] text-zinc-600">No tracking methods allowed for this asset.</p>
              )}
            </div>
          </div>
        );
      })}
      {onRequestAddAssets && (
        <button
          type="button"
          onClick={onRequestAddAssets}
          className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
        >
          + Add / Change assets
        </button>
      )}
    </div>
  );
}
