import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, Loader2, Plus, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  createAssignment,
  type AssignmentMode,
} from '../services/assignment/createAssignment';
import { inviteCollaborator } from '../services/assignment/inviteCollaborator';
import { useTutorial } from '../lib/tutorial-overlay';
import {
  AssetPicker,
  type AssetPickerSelectedItem,
} from '../services/assignment/AssetPicker';
import {
  listVerifiedBrandedDomains,
  type VerifiedDomainOption,
} from '../services/domain/brandedDomains';
import {
  listNormalSponsorCampaigns,
  type SponsorCampaignOption,
} from '../services/campaign/listSponsorCreativeCampaigns';
import {
  BLACK_BOX_ELEMENT_LABELS,
  BLACK_BOX_ELEMENT_TYPES,
  listCampaignElementAssetsForBlackBox,
  type BlackBoxElementAsset,
  type BlackBoxElementType,
} from '../services/asset/listCampaignElementAssetsForBlackBox';

type AssetScope = 'promotion_only' | 'allow_additional';

interface AssetPermissionState {
  allowMarketerDomain: boolean;
  allowSponsorDomain: boolean;
  allowVstrkDomain: boolean;
  selectedSponsorDomainId: string | null;
}

const DEFAULT_PERMISSIONS: AssetPermissionState = {
  allowMarketerDomain: false,
  allowSponsorDomain: false,
  allowVstrkDomain: false,
  selectedSponsorDomainId: null,
};

const BLACK_BOX_MAX = 4;

export default function CreateAssignment() {
  const navigate = useNavigate();
  const { notify: notifyTutorial } = useTutorial();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Library (+ Select Asset) selection
  const [selectedAssets, setSelectedAssets] = useState<AssetPickerSelectedItem[]>([]);
  const [draftSelection, setDraftSelection] = useState<AssetPickerSelectedItem[]>([]);

  // Black Box: selected campaign-element asset ids (0–4)
  const [blackBoxSelectedIds, setBlackBoxSelectedIds] = useState<string[]>([]);
  const [blackBoxCatalog, setBlackBoxCatalog] = useState<BlackBoxElementAsset[]>([]);
  const [loadingBlackBox, setLoadingBlackBox] = useState(false);

  const [assetPermissions, setAssetPermissions] = useState<
    Map<string, AssetPermissionState>
  >(new Map());

  const [sponsorVerifiedDomains, setSponsorVerifiedDomains] = useState<
    VerifiedDomainOption[]
  >([]);

  // PHASE 2: Regular | Creative (replaces none / campaign_asset_only / campaign_links_and_assets)
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('regular');
  const [assetScope, setAssetScope] = useState<AssetScope>('promotion_only');
  const [creativeCampaignId, setCreativeCampaignId] = useState<string | null>(null);
  const [normalSponsorCampaigns, setNormalSponsorCampaigns] = useState<SponsorCampaignOption[]>(
    []
  );
  const [loadingCreativeCampaigns, setLoadingCreativeCampaigns] = useState(false);

  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Not signed in');
        return;
      }
      setUserId(user.id);

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!membership?.organization_id) {
        setError('No organization found for this user');
        return;
      }
      setOrganizationId(membership.organization_id);
    };
    init();
  }, []);

  // Black Box catalog (Sponsor org published campaign-element assets)
  useEffect(() => {
    if (!organizationId) {
      setBlackBoxCatalog([]);
      return;
    }
    let cancelled = false;
    setLoadingBlackBox(true);
    listCampaignElementAssetsForBlackBox(organizationId)
      .then(rows => {
        if (!cancelled) setBlackBoxCatalog(rows);
      })
      .catch(e => {
        console.error('Black Box load failed', e);
        if (!cancelled) setBlackBoxCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBlackBox(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // Union of Black Box + library assets (deduped) for permission cards + submit
  const unifiedSelectedAssets: AssetPickerSelectedItem[] = useMemo(() => {
    const map = new Map<string, AssetPickerSelectedItem>();
    for (const id of blackBoxSelectedIds) {
      const bb = blackBoxCatalog.find(x => x.assetId === id);
      if (!bb) continue;
      map.set(id, {
        assetId: id,
        title: bb.title,
        thumbnail: bb.thumbnail,
      });
    }
    for (const a of selectedAssets) {
      if (!map.has(a.assetId)) {
        map.set(a.assetId, a);
      }
    }
    return Array.from(map.values());
  }, [blackBoxSelectedIds, blackBoxCatalog, selectedAssets]);

  // Keep permissions Map aligned with unified selection
  useEffect(() => {
    setAssetPermissions(prev => {
      const next = new Map<string, AssetPermissionState>();
      for (const a of unifiedSelectedAssets) {
        next.set(a.assetId, prev.get(a.assetId) ?? { ...DEFAULT_PERMISSIONS });
      }
      return next;
    });
  }, [unifiedSelectedAssets]);

  useEffect(() => {
    if (!organizationId) {
      setSponsorVerifiedDomains([]);
      return;
    }
    let cancelled = false;
    listVerifiedBrandedDomains(organizationId)
      .then(domains => {
        if (!cancelled) setSponsorVerifiedDomains(domains);
      })
      .catch(e => {
        console.error('Failed to load Sponsor verified domains', e);
        if (!cancelled) setSponsorVerifiedDomains([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // Creative Mode: load Sponsor normal campaigns (no ONLY PROMOTE ASSET)
  useEffect(() => {
    if (!organizationId || assignmentMode !== 'creative') {
      setNormalSponsorCampaigns([]);
      if (assignmentMode !== 'creative') setCreativeCampaignId(null);
      return;
    }
    let cancelled = false;
    setLoadingCreativeCampaigns(true);
    listNormalSponsorCampaigns(organizationId)
      .then(rows => {
        if (!cancelled) setNormalSponsorCampaigns(rows);
      })
      .catch(e => {
        console.error('Failed to load Sponsor campaigns', e);
        if (!cancelled) setNormalSponsorCampaigns([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCreativeCampaigns(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, assignmentMode]);

  const openLibraryPicker = () => {
    setDraftSelection(selectedAssets);
    setIsLibraryPickerOpen(true);
  };

  const cancelLibraryPicker = () => setIsLibraryPickerOpen(false);

  const confirmLibraryPicker = () => {
    // Dedupe against Black Box — keep library list but unifiedSelected handles uniqueness
    setSelectedAssets(draftSelection);
    setIsLibraryPickerOpen(false);
  };

  const toggleBlackBoxAsset = (assetId: string) => {
    setBlackBoxSelectedIds(prev => {
      if (prev.includes(assetId)) {
        return prev.filter(id => id !== assetId);
      }
      if (prev.length >= BLACK_BOX_MAX) {
        setError(`Black Box allows at most ${BLACK_BOX_MAX} Campaign Element Assets`);
        return prev;
      }
      setError(null);
      return [...prev, assetId];
    });
  };

  const setAssetPermission = (
    assetId: string,
    key: 'allowMarketerDomain' | 'allowSponsorDomain' | 'allowVstrkDomain',
    value: boolean
  ) => {
    setAssetPermissions(prev => {
      const next = new Map(prev);
      const current = next.get(assetId) ?? { ...DEFAULT_PERMISSIONS };
      const updated: AssetPermissionState = { ...current, [key]: value };
      if (key === 'allowSponsorDomain' && !value) {
        updated.selectedSponsorDomainId = null;
      }
      next.set(assetId, updated);
      return next;
    });
  };

  const setSelectedSponsorDomain = (assetId: string, domainId: string | null) => {
    setAssetPermissions(prev => {
      const next = new Map(prev);
      const current = next.get(assetId) ?? { ...DEFAULT_PERMISSIONS };
      next.set(assetId, { ...current, selectedSponsorDomainId: domainId });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!organizationId || !userId) return;
    setError(null);

    if (!title.trim()) return setError('Title is required');
    if (unifiedSelectedAssets.length === 0) {
      return setError('Select at least one Asset (Black Box and/or + Select Asset)');
    }
    if (!email.trim()) return setError('Add a collaborator email');

    for (const a of unifiedSelectedAssets) {
      const p = assetPermissions.get(a.assetId) ?? DEFAULT_PERMISSIONS;
      if (p.allowSponsorDomain && !p.selectedSponsorDomainId) {
        return setError(
          'Select a Sponsor tracking domain for each asset with Sponsor tracking enabled'
        );
      }
    }

    if (assignmentMode === 'creative' && !creativeCampaignId) {
      return setError('Creative Mode requires one Sponsor campaign');
    }

    setSubmitting(true);
    try {
      const { assignmentId } = await createAssignment({
        organizationId,
        createdByUserId: userId,
        title,
        description: description || null,
        assetPermissions: unifiedSelectedAssets.map(a => {
          const p = assetPermissions.get(a.assetId) ?? DEFAULT_PERMISSIONS;
          return {
            assetId: a.assetId,
            allowMarketerDomain: p.allowMarketerDomain,
            allowSponsorDomain: p.allowSponsorDomain,
            allowVstrkDomain: p.allowVstrkDomain,
            selectedSponsorDomainId: p.allowSponsorDomain
              ? p.selectedSponsorDomainId
              : null,
          };
        }),
        domainIds: [],
        assignmentMode,
        creativeCampaignId:
          assignmentMode === 'creative' ? creativeCampaignId : null,
        assetScope,
      });

      await inviteCollaborator({
        assignmentId,
        invitedByUserId: userId,
        invitedEmail: email,
      });

      notifyTutorial('collab-assignment-created');
      navigate(`/marketplace/assignments/${assignmentId}`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create assignment');
    } finally {
      setSubmitting(false);
    }
  };

  const assetsByElementType = useMemo(() => {
    const m = new Map<BlackBoxElementType, BlackBoxElementAsset[]>();
    for (const t of BLACK_BOX_ELEMENT_TYPES) m.set(t, []);
    for (const row of blackBoxCatalog) {
      m.get(row.elementType)?.push(row);
    }
    return m;
  }, [blackBoxCatalog]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-red-600" />
          <h1 className="text-2xl font-bold">Create Assignment</h1>
        </div>
        <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest mb-8">
          Marketplace / Collaboration Hub
        </p>

        {error && (
          <div className="text-red-500 text-sm border border-red-900 bg-red-950/30 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Title
        </label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Summer Sale Promotion"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm mb-5"
        />

        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm mb-6"
        />

        {/* Assignment Type: Regular / Creative */}
        <div data-tutorial-id="marketplace-assignment-type" className="mb-6">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
            Assignment Type
          </label>
          <div className="space-y-2">
            <label
              className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${
                assignmentMode === 'regular'
                  ? 'border-red-600 bg-red-600/10'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
              }`}
            >
              <input
                type="radio"
                name="assignmentMode"
                checked={assignmentMode === 'regular'}
                onChange={() => {
                  setAssignmentMode('regular');
                  setCreativeCampaignId(null);
                }}
                className="mt-1 accent-red-600"
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm text-zinc-100">
                  Regular Mode
                  <span className="relative group/tip">
                    <HelpCircle size={12} className="text-zinc-600" />
                    <span className="hidden group-hover/tip:block absolute left-0 top-4 z-20 w-56 p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] text-zinc-400">
                      Marketer creates content under their own campaign. They pick that
                      campaign after accepting the invitation.
                    </span>
                  </span>
                </span>
                <span className="block text-[11px] text-zinc-500 mt-0.5">
                  Marketer creates content under their own campaign
                </span>
              </span>
            </label>
            <label
              className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${
                assignmentMode === 'creative'
                  ? 'border-red-600 bg-red-600/10'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
              }`}
            >
              <input
                type="radio"
                name="assignmentMode"
                checked={assignmentMode === 'creative'}
                onChange={() => setAssignmentMode('creative')}
                className="mt-1 accent-red-600"
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm text-zinc-100">
                  Creative Mode
                  <span className="relative group/tip">
                    <HelpCircle size={12} className="text-zinc-600" />
                    <span className="hidden group-hover/tip:block absolute left-0 top-4 z-20 w-56 p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-[10px] text-zinc-400">
                      Marketer creates content under the Sponsor&apos;s campaign. Content
                      becomes an Asset the Marketer can keep promoting.
                    </span>
                  </span>
                </span>
                <span className="block text-[11px] text-zinc-500 mt-0.5">
                  Marketer creates content under the Sponsor&apos;s campaign
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Creative Mode: Sponsor campaign (required) */}
        {assignmentMode === 'creative' && (
          <div data-tutorial-id="marketplace-creative-campaign" className="mb-6">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Sponsor Campaign (required)
            </label>
            {loadingCreativeCampaigns ? (
              <p className="text-xs text-zinc-500 flex items-center gap-2">
                <Loader2 className="animate-spin" size={14} /> Loading campaigns…
              </p>
            ) : (
              <select
                value={creativeCampaignId ?? ''}
                onChange={e => setCreativeCampaignId(e.target.value || null)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100"
              >
                <option value="">Select one campaign</option>
                {normalSponsorCampaigns.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.campaign_name}
                  </option>
                ))}
              </select>
            )}
            {normalSponsorCampaigns.length === 0 && !loadingCreativeCampaigns && (
              <p className="text-xs text-zinc-500 mt-1">
                No active non-system campaigns found for this organization.
              </p>
            )}
          </div>
        )}

        {/* Black Box: Campaign Element Assets 0–4 */}
        <div data-tutorial-id="marketplace-black-box" className="mb-6">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
            Campaign Element Assets
          </label>
          <p className="text-[11px] text-zinc-500 mb-3">
            Select up to {BLACK_BOX_MAX}. Unpublished elements show as not available — that does
            not block creating the Assignment. Selected: {blackBoxSelectedIds.length} /{' '}
            {BLACK_BOX_MAX}
          </p>
          {loadingBlackBox ? (
            <p className="text-xs text-zinc-500 flex items-center gap-2">
              <Loader2 className="animate-spin" size={14} /> Loading elements…
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {BLACK_BOX_ELEMENT_TYPES.map(et => {
                const options = assetsByElementType.get(et) ?? [];
                const available = options.length > 0;
                return (
                  <div
                    key={et}
                    className="border border-zinc-800 rounded-lg p-3 bg-zinc-900/50 space-y-2"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      {BLACK_BOX_ELEMENT_LABELS[et]}
                    </p>
                    {!available ? (
                      <p className="text-[11px] text-zinc-600">
                        Not available yet — publish via Campaign Detail → Turn into Asset
                      </p>
                    ) : (
                      options.map(opt => {
                        const checked = blackBoxSelectedIds.includes(opt.assetId);
                        return (
                          <label
                            key={opt.assetId}
                            className="flex items-start gap-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBlackBoxAsset(opt.assetId)}
                              className="mt-0.5 accent-red-600"
                            />
                            <span className="text-[12px] text-zinc-200 leading-snug">
                              {opt.title}
                              {opt.campaignName ? (
                                <span className="block text-[10px] text-zinc-600">
                                  {opt.campaignName}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* + Select Asset (library) */}
        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Additional Assets
        </label>
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            onClick={openLibraryPicker}
            disabled={!organizationId}
            data-tutorial-id="marketplace-select-assets"
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
          >
            <Plus size={14} /> Select Asset
          </button>
          {selectedAssets.length > 0 && (
            <span className="text-zinc-500 text-sm">
              {selectedAssets.length} from library
            </span>
          )}
        </div>
        <p className="text-[10px] text-zinc-600 mb-6">
          Black Box and library assets are merged by asset id (no duplicates).
        </p>

        {isLibraryPickerOpen && organizationId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">
                  Asset Library
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <AssetPicker
                  organizationId={organizationId}
                  onSelectionChange={setDraftSelection}
                  initialSelectedAssetIds={selectedAssets.map(a => a.assetId)}
                />
              </div>
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={cancelLibraryPicker}
                  className="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmLibraryPicker}
                  className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Per-asset domain permissions */}
        {unifiedSelectedAssets.length > 0 && (
          <div data-tutorial-id="marketplace-promotion-methods" className="mb-6 space-y-3">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Selected Assets ({unifiedSelectedAssets.length})
            </label>
            {unifiedSelectedAssets.map(asset => {
              const p = assetPermissions.get(asset.assetId) ?? DEFAULT_PERMISSIONS;
              const fromBlackBox = blackBoxSelectedIds.includes(asset.assetId);
              return (
                <div
                  key={asset.assetId}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-16 h-9 rounded bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                      {asset.thumbnail ? (
                        <img
                          src={asset.thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-600">—</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">
                        {asset.title || 'Untitled'}
                      </p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mt-0.5">
                        {fromBlackBox ? 'Campaign Element' : 'Asset'}
                      </p>
                    </div>
                  </div>

                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                    Promotion Methods
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.allowMarketerDomain}
                        onChange={e =>
                          setAssetPermission(
                            asset.assetId,
                            'allowMarketerDomain',
                            e.target.checked
                          )
                        }
                        className="accent-red-600"
                      />
                      <span className="text-sm text-zinc-200">
                        Marketer&apos;s tracking domain
                      </span>
                    </label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.allowSponsorDomain}
                          onChange={e =>
                            setAssetPermission(
                              asset.assetId,
                              'allowSponsorDomain',
                              e.target.checked
                            )
                          }
                          className="accent-red-600"
                        />
                        <span className="text-sm text-zinc-200">
                          Sponsor&apos;s tracking domain
                        </span>
                      </label>
                      {p.allowSponsorDomain && (
                        <select
                          value={p.selectedSponsorDomainId ?? ''}
                          onChange={e =>
                            setSelectedSponsorDomain(
                              asset.assetId,
                              e.target.value || null
                            )
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100"
                        >
                          <option value="">Select Sponsor tracking domain</option>
                          {sponsorVerifiedDomains.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.hostname}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.allowVstrkDomain}
                        onChange={e =>
                          setAssetPermission(
                            asset.assetId,
                            'allowVstrkDomain',
                            e.target.checked
                          )
                        }
                        className="accent-red-600"
                      />
                      <span className="text-sm text-zinc-200">VSTRK tracking domain</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Asset Usage — BOTH modes */}
        <div className="mb-6 space-y-2" data-tutorial-id="create-assignment-asset-scope">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Asset Usage
          </label>
          <p className="text-[11px] text-zinc-500 mb-2">
            When the Marketer creates content under this Assignment, which assets may they use?
          </p>
          <label
            className={`flex items-start gap-3 border rounded-xl px-3 py-3 cursor-pointer ${
              assetScope === 'promotion_only'
                ? 'border-red-600 bg-red-600/10'
                : 'border-zinc-800 bg-zinc-950'
            }`}
          >
            <input
              type="radio"
              name="assetScope"
              className="mt-1 accent-red-600"
              checked={assetScope === 'promotion_only'}
              onChange={() => setAssetScope('promotion_only')}
            />
            <span>
              <span className="block text-sm text-zinc-100">Promotion assets only</span>
              <span className="block text-[11px] text-zinc-500 mt-0.5">
                Marketer can only use assets associated with this Promotion. CHANGE deselects
                only — no asset library.
              </span>
            </span>
          </label>
          <label
            className={`flex items-start gap-3 border rounded-xl px-3 py-3 cursor-pointer ${
              assetScope === 'allow_additional'
                ? 'border-red-600 bg-red-600/10'
                : 'border-zinc-800 bg-zinc-950'
            }`}
          >
            <input
              type="radio"
              name="assetScope"
              className="mt-1 accent-red-600"
              checked={assetScope === 'allow_additional'}
              onChange={() => setAssetScope('allow_additional')}
            />
            <span>
              <span className="block text-sm text-zinc-100">Allow additional assets</span>
              <span className="block text-[11px] text-zinc-500 mt-0.5">
                Marketer can use this Promotion&apos;s assets and other assets they are already
                permitted to promote.
              </span>
            </span>
          </label>
        </div>

        <div data-tutorial-id="marketplace-invite-collaborators">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
            Invite Collaborator
          </label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="collaborator@email.com"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm mb-8"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          data-tutorial-id="marketplace-submit"
          className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-lg"
        >
          {submitting ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
          Create Assignment &amp; Send Invitation
        </button>
      </div>
    </div>
  );
}
