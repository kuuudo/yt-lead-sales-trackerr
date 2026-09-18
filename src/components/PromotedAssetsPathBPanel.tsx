/**
 * Shared Path B promoted-asset panel (Videos.tsx Track New Content parity):
 * multi-Promotion chooser + per-asset Marketer / Sponsor / VSTRK domains.
 */
import React, { useEffect, useState } from 'react';
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
import { supabase } from '../lib/supabase';

export interface LockedPromotionRef {
  promotionId: string;
  assignmentId: string;
  label?: string;
  assignmentCollaboratorId?: string | null;
}

export interface PromotedAssetsPathBPanelProps {
  organizationId: string;
  userId: string;
  lockedPromotion?: LockedPromotionRef | null;
  /** When true, hide + Add / Change (promotion_only asset scope) */
  assetsLocked?: boolean;
  assets: PromotedAssetRow[];
  onAssetsChange: (assets: PromotedAssetRow[]) => void;
  selectedDomainByAssetId: Map<string, string | null>;
  onSelectedDomainByAssetIdChange: (next: Map<string, string | null>) => void;
  onPromotionContextChange?: (ctxByAssetId: Map<string, PromotionContext | null>) => void;
  onRequestAddAssets?: () => void;
}

function applyDefaultDomains(
  rows: CreativePromotionAssetRow[],
  prev: Map<string, string | null>,
): Map<string, string | null> {
  const domainMap = new Map(prev);
  for (const r of rows) {
    if (domainMap.has(r.asset_id)) continue;
    if (r.use_marketer_domain && r.selected_marketer_domain_id) {
      domainMap.set(r.asset_id, r.selected_marketer_domain_id);
    } else if (r.allow_sponsor_domain && r.selected_sponsor_domain_id && !r.allow_marketer_domain && !r.allow_vstrk_domain) {
      domainMap.set(r.asset_id, r.selected_sponsor_domain_id);
    } else if (r.allow_vstrk_domain || r.use_vstrk_domain) {
      domainMap.set(r.asset_id, null);
    } else {
      domainMap.set(r.asset_id, null);
    }
  }
  return domainMap;
}

/** Fallback when promotion_assets row is missing but assignment_assets has allow_* */
async function loadAllowFallback(
  assignmentId: string,
  assetIds: string[],
): Promise<CreativePromotionAssetRow[]> {
  if (!assignmentId || assetIds.length === 0) return [];
  const { data: allowRows } = await supabase
    .from('assignment_assets')
    .select(
      'asset_id, allow_marketer_domain, allow_sponsor_domain, allow_vstrk_domain, selected_sponsor_domain_id',
    )
    .eq('assignment_id', assignmentId)
    .in('asset_id', assetIds);

  const sponsorIds = (allowRows ?? [])
    .map((r: any) => r.selected_sponsor_domain_id)
    .filter(Boolean) as string[];
  let hostById = new Map<string, string>();
  if (sponsorIds.length) {
    const { data: domains } = await supabase
      .from('branded_tracking_domains')
      .select('id, hostname')
      .in('id', sponsorIds);
    hostById = new Map((domains ?? []).map((d: any) => [d.id, d.hostname]));
  }

  return (allowRows ?? []).map((r: any) => ({
    asset_id: r.asset_id,
    title: '',
    thumbnail_url: null,
    allow_marketer_domain: !!r.allow_marketer_domain,
    allow_sponsor_domain: !!r.allow_sponsor_domain,
    allow_vstrk_domain: !!r.allow_vstrk_domain,
    use_marketer_domain: false,
    use_vstrk_domain: !!r.allow_vstrk_domain,
    selected_sponsor_domain_id: r.selected_sponsor_domain_id ?? null,
    selected_sponsor_hostname: r.selected_sponsor_domain_id
      ? hostById.get(r.selected_sponsor_domain_id) ?? null
      : null,
    selected_marketer_domain_id: null,
    selected_marketer_hostname: null,
  }));
}

export function PromotedAssetsPathBPanel({
  organizationId,
  userId,
  lockedPromotion,
  assetsLocked = false,
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
  const [resolvedAssignmentId, setResolvedAssignmentId] = useState<string | null>(
    lockedPromotion?.assignmentId || null,
  );

  const isFullyLocked = !!(
    lockedPromotion?.promotionId && (lockedPromotion.assignmentId || resolvedAssignmentId)
  );

  useEffect(() => {
    if (!organizationId) return;
    listVerifiedBrandedDomains(organizationId)
      .then(setMarketerDomains)
      .catch(() => setMarketerDomains([]));
  }, [organizationId]);

  // Resolve assignment_id from promotions if parent only passed promotionId
  useEffect(() => {
    if (!lockedPromotion?.promotionId) {
      setResolvedAssignmentId(null);
      return;
    }
    if (lockedPromotion.assignmentId) {
      setResolvedAssignmentId(lockedPromotion.assignmentId);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('promotions')
        .select('assignment_id')
        .eq('id', lockedPromotion.promotionId)
        .maybeSingle();
      if (!cancelled) setResolvedAssignmentId((data?.assignment_id as string) || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [lockedPromotion?.promotionId, lockedPromotion?.assignmentId]);

  const assetKey = assets.map(a => a.asset_id).sort().join(',');

  // Locked promotion Path B
  useEffect(() => {
    const assignmentId = lockedPromotion?.assignmentId || resolvedAssignmentId;
    if (!lockedPromotion?.promotionId || !assignmentId || assets.length === 0) return;

    let cancelled = false;
    (async () => {
      setLoadingUsage(true);
      try {
        let rows = await loadPromotionAssetsForCreative(
          lockedPromotion.promotionId,
          assignmentId,
        );
        const missing = assets
          .map(a => a.asset_id)
          .filter(id => !rows.some(r => r.asset_id === id));
        if (missing.length) {
          const fallback = await loadAllowFallback(assignmentId, missing);
          rows = [...rows, ...fallback];
        }
        if (cancelled) return;
        setUsageRows(rows);

        const option = {
          promotionId: lockedPromotion.promotionId,
          assignmentId,
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
        onSelectedDomainByAssetIdChange(applyDefaultDomains(rows, selectedDomainByAssetId));
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
  }, [lockedPromotion?.promotionId, lockedPromotion?.assignmentId, resolvedAssignmentId, assetKey]);

  // Unlocked: resolve promotions per asset, then Path B usage
  useEffect(() => {
    // Only when NOT locked to a specific promotion
    if (lockedPromotion?.promotionId) return;
    if (!userId || assets.length === 0) {
      setPromoOptionsByAsset(new Map());
      setUsageRows([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingUsage(true);
      try {
        const entries = await Promise.all(
          assets.map(async a => {
            try {
              const options = await resolvePromotionContextForAsset(a.asset_id, userId);
              return [a.asset_id, options ?? []] as const;
            } catch (e) {
              console.error('[PathB] resolvePromotionContextForAsset', a.asset_id, e);
              return [a.asset_id, [] as PromotionContextOption[]] as const;
            }
          }),
        );
        if (cancelled) return;

        const nextOpts = new Map<string, PromotionContextOption[]>();
        const nextChosen = new Map<string, PromotionContext>();
        for (const [assetId, options] of entries) {
          nextOpts.set(assetId, options);
          if (options.length === 1) {
            nextChosen.set(assetId, toPromotionContext(options[0]));
          } else if (options.length > 1) {
            // keep prior choice if still valid
            const prev = chosenPromoByAsset.get(assetId);
            if (prev && options.some(o => o.promotionId === prev.promotionId)) {
              nextChosen.set(assetId, prev);
            }
          }
        }
        setPromoOptionsByAsset(nextOpts);
        setChosenPromoByAsset(nextChosen);

        const byPromo = new Map<string, { assignmentId: string; assetIds: string[] }>();
        for (const [assetId, options] of nextOpts.entries()) {
          const ctx =
            options.length === 1
              ? toPromotionContext(options[0])
              : nextChosen.get(assetId);
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
          let rows = await loadPromotionAssetsForCreative(promotionId, assignmentId);
          const missing = assetIds.filter(id => !rows.some(r => r.asset_id === id));
          if (missing.length) {
            rows = [...rows, ...(await loadAllowFallback(assignmentId, missing))];
          }
          for (const r of rows) {
            if (assetIds.includes(r.asset_id)) merged.push(r);
          }
        }
        if (cancelled) return;
        setUsageRows(merged);
        onSelectedDomainByAssetIdChange(applyDefaultDomains(merged, selectedDomainByAssetId));
      } catch (e) {
        console.error('[PromotedAssetsPathBPanel] unlock resolve failed', e);
      } finally {
        if (!cancelled) setLoadingUsage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedPromotion?.promotionId, userId, assetKey]);

  useEffect(() => {
    if (!onPromotionContextChange) return;
    const out = new Map<string, PromotionContext | null>();
    for (const a of assets) {
      out.set(a.asset_id, chosenPromoByAsset.get(a.asset_id) ?? null);
    }
    onPromotionContextChange(out);
  }, [assets, chosenPromoByAsset, onPromotionContextChange]);

  const removeAsset = (assetId: string) => {
    if (assetsLocked) return;
    onAssetsChange(assets.filter(a => a.asset_id !== assetId));
  };

  const setDomain = (assetId: string, id: string | null) => {
    const next = new Map(selectedDomainByAssetId);
    next.set(assetId, id);
    onSelectedDomainByAssetIdChange(next);
  };

  const choosePromotion = async (assetId: string, option: PromotionContextOption) => {
    const chosen = new Map(chosenPromoByAsset);
    chosen.set(assetId, toPromotionContext(option));
    setChosenPromoByAsset(chosen);
    try {
      let rows = await loadPromotionAssetsForCreative(option.promotionId, option.assignmentId);
      if (!rows.some(r => r.asset_id === assetId)) {
        rows = [
          ...rows,
          ...(await loadAllowFallback(option.assignmentId, [assetId])),
        ];
      }
      setUsageRows(prev => {
        const others = prev.filter(r => r.asset_id !== assetId);
        const hit = rows.find(r => r.asset_id === assetId);
        return hit ? [...others, hit] : others;
      });
      const hit = rows.find(r => r.asset_id === assetId);
      if (hit) {
        onSelectedDomainByAssetIdChange(
          applyDefaultDomains([hit], selectedDomainByAssetId),
        );
      }
    } catch (e) {
      console.error('[PathB] choosePromotion', e);
    }
  };

  if (assets.length === 0) {
    return (
      <div className="space-y-2">
        {!assetsLocked && onRequestAddAssets && (
          <button
            type="button"
            onClick={onRequestAddAssets}
            className="w-full border border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
          >
            + Select Asset
          </button>
        )}
        {assetsLocked && (
          <p className="text-[10px] text-zinc-600">No assets in this promotion.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loadingUsage && (
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
          Loading promotion / tracking options…
        </p>
      )}
      {assets.map(asset => {
        const label = asset.display_name || asset.asset_id;
        const options = promoOptionsByAsset.get(asset.asset_id) ?? [];
        const chosen = chosenPromoByAsset.get(asset.asset_id);
        const usage = usageRows.find(r => r.asset_id === asset.asset_id);

        // Multi-promotion gate (unlocked only)
        if (!isFullyLocked && options.length > 1 && !chosen) {
          return (
            <div
              key={asset.asset_id}
              className="border border-dashed border-amber-800/50 rounded-xl p-3 space-y-2"
            >
              <div className="flex justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                  {label}
                </p>
                {!assetsLocked && (
                  <button
                    type="button"
                    className="text-zinc-500 hover:text-red-400"
                    onClick={() => removeAsset(asset.asset_id)}
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                This asset is used in multiple collaborations. Select which Promotion to track:
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

        if (!usage && !loadingUsage) {
          // Videos.tsx old branch: MY assets (no promotion context) → simple Tracking Domain select
          if (options.length === 0) {
            const currentValue = selectedDomainByAssetId.get(asset.asset_id) ?? '';
            return (
              <div
                key={asset.asset_id}
                className="border border-zinc-800 rounded-xl p-3 space-y-2"
              >
                <div className="flex justify-between gap-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                    {label} — Tracking Domain
                  </p>
                  {!assetsLocked && (
                    <button
                      type="button"
                      className="text-zinc-500 hover:text-red-400"
                      onClick={() => removeAsset(asset.asset_id)}
                    >
                      ×
                    </button>
                  )}
                </div>
                <select
                  value={currentValue}
                  onChange={e => setDomain(asset.asset_id, e.target.value || null)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
                >
                  <option value="">vstrk.com</option>
                  {marketerDomains.length > 0 && (
                    <optgroup label="Your Domains">
                      {marketerDomains.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.hostname}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            );
          }
          return (
            <div
              key={asset.asset_id}
              className="border border-zinc-800 rounded-xl p-3 space-y-1"
            >
              <div className="flex justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                  {label}
                </p>
                {!assetsLocked && (
                  <button
                    type="button"
                    className="text-zinc-500 hover:text-red-400"
                    onClick={() => removeAsset(asset.asset_id)}
                  >
                    ×
                  </button>
                )}
              </div>
              <p className="text-[10px] text-zinc-600">Loading tracking methods…</p>
            </div>
          );
        }

        if (!usage) {
          return (
            <div key={asset.asset_id} className="border border-zinc-800 rounded-xl p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                {label}
              </p>
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
        const usingMarketer =
          !!currentDomainId && marketerDomains.some(d => d.id === currentDomainId);
        const usingVstrk =
          showVstrk && (currentDomainId === null || currentDomainId === '') && !usingSponsor && !usingMarketer;

        return (
          <div key={asset.asset_id} className="border border-zinc-800 rounded-xl p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                {label}
              </p>
              {!assetsLocked && (
                <button
                  type="button"
                  className="text-zinc-500 hover:text-red-400"
                  onClick={() => removeAsset(asset.asset_id)}
                >
                  ×
                </button>
              )}
            </div>
            {chosen && options.length > 1 && (
              <p className="text-[10px] text-zinc-600">
                Promotion: {(options.find(o => o.promotionId === chosen.promotionId) as any)?.label || chosen.promotionId}
              </p>
            )}
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
                          ? 'border-orange-600 bg-orange-600/10 text-zinc-100'
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
                        ? 'border-orange-600 bg-orange-600/10 text-zinc-100'
                        : 'border-zinc-800 bg-zinc-900/80 text-zinc-300'
                    }`}
                  >
                    vstrk.com
                  </button>
                </div>
              )}
              {!showMarketer && !showSponsor && !showVstrk && (
                <p className="text-[10px] text-zinc-600">
                  No tracking methods allowed for this asset.
                </p>
              )}
            </div>
          </div>
        );
      })}
      {!assetsLocked && onRequestAddAssets && (
        <button
          type="button"
          onClick={onRequestAddAssets}
          className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
        >
          + Add / Change assets
        </button>
      )}
      {assetsLocked && (
        <p className="text-[10px] text-zinc-600">
          Asset scope is promotion-only — assets are fixed to this promotion.
        </p>
      )}
    </div>
  );
}
