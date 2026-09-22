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
  listVerifiedBrandedDomainsForCampaign,
  type VerifiedDomainOption,
} from '../services/domain/brandedDomains';
import {
  listNormalSponsorCampaigns,
  type SponsorCampaignOption,
} from '../services/campaign/listSponsorCreativeCampaigns';
import {
  BLACK_BOX_ELEMENT_LABELS,
  listCampaignElementBlackBoxCatalog,
  type BlackBoxCampaignOption,
  type BlackBoxPublishedAsset,
  type BlackBoxRow,
  type BlackBoxUnpublishedLink,
} from '../services/asset/listCampaignElementAssetsForBlackBox';
import { PublishAssetButton } from '../components/PublishAssetButton';

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

  // Black Box: selected campaign-element asset ids (0–4), across campaigns
  const [blackBoxSelectedIds, setBlackBoxSelectedIds] = useState<string[]>([]);
  const [blackBoxRows, setBlackBoxRows] = useState<BlackBoxRow[]>([]);
  const [blackBoxCampaigns, setBlackBoxCampaigns] = useState<BlackBoxCampaignOption[]>([]);
  const [blackBoxCampaignFilter, setBlackBoxCampaignFilter] = useState<string>(''); // '' = first campaign
  const [loadingBlackBox, setLoadingBlackBox] = useState(false);

  const [assetPermissions, setAssetPermissions] = useState<
    Map<string, AssetPermissionState>
  >(new Map());

  /** Org-wide verified domains (fallback + hostname lookup). */
  const [sponsorVerifiedDomains, setSponsorVerifiedDomains] = useState<
    VerifiedDomainOption[]
  >([]);
  /**
   * Per normal (non–campaign-element) asset: Sponsor domain options scoped
   * to that Asset's Campaign root_domain. Campaign Element Assets do NOT
   * use this map — they use Configure Campaign Links on the Black Box row.
   */
  const [normalAssetSponsorDomains, setNormalAssetSponsorDomains] = useState<
    Map<string, VerifiedDomainOption[]>
  >(new Map());

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

  const reloadBlackBox = async (orgId: string) => {
    setLoadingBlackBox(true);
    try {
      const catalog = await listCampaignElementBlackBoxCatalog(orgId);
      setBlackBoxCampaigns(catalog.campaigns);
      setBlackBoxRows(catalog.rows);
      setBlackBoxCampaignFilter(prev => {
        if (prev && catalog.campaigns.some(c => c.id === prev)) return prev;
        return catalog.campaigns[0]?.id ?? '';
      });
    } catch (e) {
      console.error('Black Box load failed', e);
      setBlackBoxCampaigns([]);
      setBlackBoxRows([]);
    } finally {
      setLoadingBlackBox(false);
    }
  };

  // Black Box catalog (campaigns + published assets + unpublished links)
  useEffect(() => {
    if (!organizationId) {
      setBlackBoxCampaigns([]);
      setBlackBoxRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await reloadBlackBox(organizationId);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // Union of Black Box + library assets (deduped) for permission cards + submit
  const publishedBlackBoxById = useMemo(() => {
    const m = new Map<string, BlackBoxPublishedAsset>();
    for (const r of blackBoxRows) {
      if (r.kind === 'published') m.set(r.assetId, r);
    }
    return m;
  }, [blackBoxRows]);

  const unifiedSelectedAssets: AssetPickerSelectedItem[] = useMemo(() => {
    const map = new Map<string, AssetPickerSelectedItem>();
    for (const id of blackBoxSelectedIds) {
      const bb = publishedBlackBoxById.get(id);
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
  }, [blackBoxSelectedIds, publishedBlackBoxById, selectedAssets]);

  const filteredBlackBoxRows = useMemo(() => {
    if (!blackBoxCampaignFilter) return blackBoxRows;
    return blackBoxRows.filter(r => r.campaignId === blackBoxCampaignFilter);
  }, [blackBoxRows, blackBoxCampaignFilter]);

  // Keep permissions Map aligned with unified selection.
  // Campaign Element Assets: if Sponsor domain already allowed and Configure
  // Campaign Links has a domain, keep/seed selectedSponsorDomainId from config.
  useEffect(() => {
    setAssetPermissions(prev => {
      const next = new Map<string, AssetPermissionState>();
      for (const a of unifiedSelectedAssets) {
        const existing = prev.get(a.assetId) ?? { ...DEFAULT_PERMISSIONS };
        const bb = publishedBlackBoxById.get(a.assetId);
        if (
          bb &&
          existing.allowSponsorDomain &&
          !existing.selectedSponsorDomainId &&
          bb.configuredSponsorDomainId
        ) {
          next.set(a.assetId, {
            ...existing,
            selectedSponsorDomainId: bb.configuredSponsorDomainId,
          });
        } else {
          next.set(a.assetId, existing);
        }
      }
      return next;
    });
  }, [unifiedSelectedAssets, publishedBlackBoxById]);

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

  // Normal Assets only: load Sponsor domains scoped to each Asset's Campaign
  // (root_domain match). Campaign Element Assets skip this path.
  useEffect(() => {
    if (!organizationId) {
      setNormalAssetSponsorDomains(new Map());
      return;
    }
    const normalIds = unifiedSelectedAssets
      .map(a => a.assetId)
      .filter(id => !publishedBlackBoxById.has(id));
    if (normalIds.length === 0) {
      setNormalAssetSponsorDomains(new Map());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const campaignByAsset = new Map<string, string>();

        // 1) campaign_element_assets (edge case if selected via library)
        const { data: elRows } = await supabase
          .from('campaign_element_assets')
          .select('asset_id, campaign_id')
          .in('asset_id', normalIds);
        for (const r of elRows ?? []) {
          if (r.campaign_id) campaignByAsset.set(r.asset_id as string, r.campaign_id as string);
        }

        // 2) videos.campaign_id
        const still = normalIds.filter(id => !campaignByAsset.has(id));
        if (still.length > 0) {
          const { data: videoRows } = await supabase
            .from('videos')
            .select('asset_id, campaign_id')
            .in('asset_id', still);
          for (const r of videoRows ?? []) {
            if (r.asset_id && r.campaign_id) {
              campaignByAsset.set(r.asset_id as string, r.campaign_id as string);
            }
          }
        }

        // 3) campaign_assets
        const still2 = normalIds.filter(id => !campaignByAsset.has(id));
        if (still2.length > 0) {
          const { data: caRows } = await supabase
            .from('campaign_assets')
            .select('asset_id, campaign_id')
            .in('asset_id', still2);
          for (const r of caRows ?? []) {
            if (r.asset_id && r.campaign_id) {
              campaignByAsset.set(r.asset_id as string, r.campaign_id as string);
            }
          }
        }

        const uniqueCampaignIds = Array.from(new Set(campaignByAsset.values()));
        const domainsByCampaign = new Map<string, VerifiedDomainOption[]>();
        await Promise.all(
          uniqueCampaignIds.map(async cid => {
            const opts = await listVerifiedBrandedDomainsForCampaign(
              organizationId,
              cid
            );
            domainsByCampaign.set(cid, opts);
          })
        );

        if (cancelled) return;
        const next = new Map<string, VerifiedDomainOption[]>();
        for (const assetId of normalIds) {
          const cid = campaignByAsset.get(assetId);
          next.set(assetId, cid ? domainsByCampaign.get(cid) ?? [] : []);
        }
        setNormalAssetSponsorDomains(next);
      } catch (e) {
        console.error('Failed to load per-asset Sponsor domains', e);
        if (!cancelled) setNormalAssetSponsorDomains(new Map());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, unifiedSelectedAssets, publishedBlackBoxById]);

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
      // Campaign Element: Sponsor domain is the Configure Campaign Links value
      if (key === 'allowSponsorDomain' && value) {
        const bb = publishedBlackBoxById.get(assetId);
        if (bb?.configuredSponsorDomainId) {
          updated.selectedSponsorDomainId = bb.configuredSponsorDomainId;
        }
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
        const bb = publishedBlackBoxById.get(a.assetId);
        if (bb) {
          return setError(
            `Campaign Element "${a.title}" has Sponsor tracking enabled but this Campaign has no Configure Campaign Links domain for ${bb.elementType}. Configure it on the Campaign first, or uncheck Sponsor's tracking domain.`
          );
        }
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

        {/* Black Box: Campaign Element Assets 0–4 (across campaigns) */}
        <div data-tutorial-id="marketplace-black-box" className="mb-6">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
            Campaign Element Assets
          </label>
          <p className="text-[11px] text-zinc-500 mb-3">
            Select Campaign Element Assets from any of your Campaigns (no limit). If a link
            is not an Asset yet, use Publish as Asset first. Selected:{' '}
            {blackBoxSelectedIds.length}
          </p>

          {blackBoxCampaigns.length > 0 && (
            <div className="mb-3">
              <label className="block text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">
                Campaign filter
              </label>
              <select
                value={blackBoxCampaignFilter}
                onChange={e => setBlackBoxCampaignFilter(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100"
              >
                {blackBoxCampaigns.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.campaignName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {loadingBlackBox ? (
            <p className="text-xs text-zinc-500 flex items-center gap-2">
              <Loader2 className="animate-spin" size={14} /> Loading elements…
            </p>
          ) : filteredBlackBoxRows.length === 0 ? (
            <p className="text-[11px] text-zinc-600 border border-zinc-800 rounded-lg p-3">
              {blackBoxCampaigns.length === 0
                ? 'No active campaigns found. Create a campaign and add conversion URLs first.'
                : 'No Campaign Element Assets or unpublished links in this campaign.'}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                {blackBoxCampaigns.find(c => c.id === blackBoxCampaignFilter)?.campaignName ??
                  'Campaign'}
              </p>
              {filteredBlackBoxRows.map(row => {
                if (row.kind === 'published') {
                  const checked = blackBoxSelectedIds.includes(row.assetId);
                  return (
                    <div
                      key={row.assetId}
                      className={`flex items-center gap-3 border rounded-lg p-3 ${
                        checked
                          ? 'border-red-600/60 bg-red-600/5'
                          : 'border-zinc-800 bg-zinc-900/40'
                      }`}
                    >
                      <div className="w-14 h-14 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                        {row.thumbnail ? (
                          <img
                            src={row.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[9px] font-bold uppercase text-zinc-600 px-1 text-center">
                            {BLACK_BOX_ELEMENT_LABELS[row.elementType]}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-100 truncate">{row.title}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                          {BLACK_BOX_ELEMENT_LABELS[row.elementType]}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleBlackBoxAsset(row.assetId)}
                        className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border transition-all ${
                          checked
                            ? 'border-red-600 bg-red-600 text-white'
                            : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        {checked ? 'Selected' : 'Select'}
                      </button>
                    </div>
                  );
                }

                // unpublished link → Publish as Asset
                const u = row as BlackBoxUnpublishedLink;
                return (
                  <div
                    key={`unpub-${u.campaignId}-${u.elementType}`}
                    className="flex items-center gap-3 border border-dashed border-zinc-700 rounded-lg p-3 bg-zinc-950/50"
                  >
                    <div className="w-14 h-14 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0 flex items-center justify-center">
                      <span className="text-[9px] font-bold uppercase text-zinc-600 px-1 text-center">
                        Link
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200 truncate">
                        {BLACK_BOX_ELEMENT_LABELS[u.elementType]}
                      </p>
                      <p className="text-[10px] text-zinc-600 truncate mt-0.5">{u.currentUrl}</p>
                      <p className="text-[10px] text-amber-600/90 mt-1">Not yet an Asset</p>
                    </div>
                    <div className="shrink-0">
                      <PublishAssetButton
                        campaignId={u.campaignId}
                        elementType={u.elementType}
                        sourceField={u.sourceField}
                        currentUrl={u.currentUrl}
                        defaultDisplayName={u.defaultDisplayName}
                        published={undefined}
                        onPublished={async () => {
                          if (organizationId) await reloadBlackBox(organizationId);
                        }}
                      />
                    </div>
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
              const bb = publishedBlackBoxById.get(asset.assetId);
              const fromBlackBox = Boolean(bb);
              // Campaign Element → Configure Campaign Links for that link type
              // Normal Asset → domains under that Asset's Campaign (root_domain)
              const elementConfiguredId = bb?.configuredSponsorDomainId ?? null;
              const elementConfiguredHostname =
                elementConfiguredId
                  ? sponsorVerifiedDomains.find(d => d.id === elementConfiguredId)
                      ?.hostname ?? elementConfiguredId
                  : null;
              const normalOptions =
                normalAssetSponsorDomains.get(asset.assetId) ?? [];
              const sponsorOptions: VerifiedDomainOption[] = fromBlackBox
                ? elementConfiguredId
                  ? [
                      {
                        id: elementConfiguredId,
                        hostname:
                          elementConfiguredHostname || elementConfiguredId,
                      },
                    ]
                  : []
                : normalOptions;

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
                        {fromBlackBox
                          ? `Campaign Element · ${bb?.elementType ?? ''}`
                          : 'Asset'}
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
                        fromBlackBox ? (
                          <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100">
                            {elementConfiguredHostname ? (
                              <>
                                <span className="text-zinc-200">
                                  {elementConfiguredHostname}
                                </span>
                                <span className="block text-[10px] text-zinc-500 mt-0.5">
                                  From Campaign Configure Campaign Links (
                                  {bb?.elementType}) — read only
                                </span>
                              </>
                            ) : (
                              <span className="text-amber-400">
                                No domain configured for this link type on the
                                Campaign. Open Configure Campaign Links first.
                              </span>
                            )}
                          </div>
                        ) : (
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
                            {sponsorOptions.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.hostname}
                              </option>
                            ))}
                          </select>
                        )
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
