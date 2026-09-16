import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle2, Rocket, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAssignmentDetail, type AssignmentDetailData } from '../services/assignment/getAssignmentDetail';
import { acceptInvitation } from '../services/assignment/acceptInvitation';
import { useTutorial } from '../lib/tutorial-overlay';
import { getElementTypeLabel, resolveThumbnail, resolveElementThumbnail } from '../lib/videoFormatters';
import {
  listVerifiedBrandedDomains,
  type VerifiedDomainOption,
} from '../services/domain/brandedDomains';

export default function AssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<AssignmentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [starting, setStarting] = useState(false);

  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // Path B: Marketer actual usage per selected asset (not locked from allow_*).
  // allow_* = Sponsor permission; use_*/selected_* = Marketer choice.
  type AssetUsageState = {
    useMarketerDomain: boolean;
    selectedMarketerDomainId: string | null;
    selectedSponsorDomainId: string | null;
    useVstrkDomain: boolean;
  };
  const DEFAULT_USAGE: AssetUsageState = {
    useMarketerDomain: false,
    selectedMarketerDomainId: null,
    selectedSponsorDomainId: null,
    useVstrkDomain: false,
  };
  const [assetUsageById, setAssetUsageById] = useState<Map<string, AssetUsageState>>(new Map());
  // Marketer org verified domains (for selected_marketer_domain_id).
  const [marketerVerifiedDomains, setMarketerVerifiedDomains] = useState<VerifiedDomainOption[]>([]);

  const { notify: notifyTutorial } = useTutorial();
  const load = async () => {
    if (!assignmentId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single();

      const detail = await getAssignmentDetail(assignmentId, user.id, profile?.email ?? '');
      setData(detail);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load assignment');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [assignmentId]);

  // Marketer's own verified domains (caller org membership — not Sponsor org).
  useEffect(() => {
    if (!data?.myCollaboratorId) {
      setMarketerVerifiedDomains([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data: mems, error } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id);
        if (error || !mems?.length) {
          if (!cancelled) setMarketerVerifiedDomains([]);
          return;
        }
        const sponsorOrg = data.assignment.organization_id;
        const marketerOrgIds = mems
          .map(m => m.organization_id as string)
          .filter(id => id && id !== sponsorOrg);
        if (marketerOrgIds.length === 0) {
          if (!cancelled) setMarketerVerifiedDomains([]);
          return;
        }
        const lists = await Promise.all(
          marketerOrgIds.map(id => listVerifiedBrandedDomains(id).catch(() => []))
        );
        const seen = new Set<string>();
        const merged: VerifiedDomainOption[] = [];
        for (const list of lists) {
          for (const d of list) {
            if (!seen.has(d.id)) {
              seen.add(d.id);
              merged.push(d);
            }
          }
        }
        if (!cancelled) setMarketerVerifiedDomains(merged);
      } catch (e) {
        console.error('Failed to load Marketer verified domains', e);
        if (!cancelled) setMarketerVerifiedDomains([]);
      }
    })();
    return () => { cancelled = true; };
  }, [data?.myCollaboratorId, data?.assignment.organization_id]);

  const handleAccept = async (invitationId: string) => {
    setAccepting(true);
    try {
      await acceptInvitation(invitationId);
      await load();
      notifyTutorial('collab-invitation-accepted');
    } catch (e: any) {
      setError(e.message ?? 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  const toggleAsset = (assetId: string) => {
    const asset = data?.assignmentAssets.find(a => a.asset_id === assetId);
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
    setAssetUsageById(prev => {
      const next = new Map(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        // Defaults OFF for Marketer/VSTRK; Sponsor domain is fixed from Assignment.
        next.set(assetId, {
          ...DEFAULT_USAGE,
          selectedSponsorDomainId: asset?.selected_sponsor_domain_id ?? null,
        });
      }
      return next;
    });
  };

  const patchAssetUsage = (assetId: string, patch: Partial<AssetUsageState>) => {
    setAssetUsageById(prev => {
      const next = new Map(prev);
      const current = next.get(assetId) ?? { ...DEFAULT_USAGE };
      next.set(assetId, { ...current, ...patch });
      return next;
    });
  };

  const handleStartPromoting = async () => {
  if (!data || !promotionCampaignId || selectedAssetIds.size === 0) return;

  const { data: { user } } = await supabase.auth.getUser();

  console.log("CURRENT USER", user?.id);

  console.log("MY COLLABORATOR ID", data.myCollaboratorId);

  console.log("ASSIGNMENT ID", data.assignment.id);

  console.log("SELECTED ASSET IDS", Array.from(selectedAssetIds));

  console.log("CAMPAIGN ID", promotionCampaignId);

  setStarting(true);
    setError(null);
    try {
      const p_asset_usage = Array.from(selectedAssetIds).map(assetId => {
        const asset = data.assignmentAssets.find(a => a.asset_id === assetId);
        const u = assetUsageById.get(assetId) ?? DEFAULT_USAGE;
        const useMarketer =
          !!asset?.allow_marketer_domain &&
          !!u.useMarketerDomain &&
          !!u.selectedMarketerDomainId;
        const useVstrk = !!asset?.allow_vstrk_domain && !!u.useVstrkDomain;
        // Option A: Sponsor domain is fixed at Create Assignment — Marketer cannot change it.
        const sponsorId =
          asset?.allow_sponsor_domain && asset.selected_sponsor_domain_id
            ? asset.selected_sponsor_domain_id
            : null;
        return {
          asset_id: assetId,
          use_marketer_domain: useMarketer,
          selected_marketer_domain_id: useMarketer ? u.selectedMarketerDomainId : null,
          selected_sponsor_domain_id: sponsorId,
          use_vstrk_domain: useVstrk,
        };
      });

      const { data: promotionId, error: rpcError } = await supabase.rpc('create_promotion', {
        p_organization_id: data.assignment.organization_id,
        p_campaign_id: promotionCampaignId,
        p_asset_ids: Array.from(selectedAssetIds),
        p_assignment_collaborator_id: data.myCollaboratorId,
        p_asset_usage,
      });

      if (rpcError || !promotionId) {
        throw new Error(rpcError?.message ?? 'Failed to create promotion');
      }

      notifyTutorial('collab-promotion-started');
      navigate(`/marketplace/promotions/${promotionId}`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to start promoting');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="text-red-600 animate-spin" size={28} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-3">
        <AlertCircle className="text-red-500" size={28} />
        <p className="text-zinc-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { assignment, myInvitation, myCollaboratorId, assignmentAssets, campaignGroups } = data;
  const canAct = myCollaboratorId !== null;

  // MVP: Collaborators never choose a Campaign. We deterministically use
  // the first campaign group as the required promotion.campaign_id.
  //
  // TODO (Future Analytics):
  // promotion.campaign_id 目前僅作為建立 Promotion 的必要欄位，不應作為
  // Campaign Analytics 的唯一依據；Analytics 應依據
  // promotion_assets → asset → campaign 進行歸屬。
  const promotionCampaignId = campaignGroups[0]?.campaign_id ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate('/marketplace')}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-xs font-bold uppercase tracking-wider mb-6"
        >
          <ArrowLeft size={14} />
          Back to Marketplace
        </button>

        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {assignment.status}
        </span>
        <h1 className="text-2xl font-bold mt-1 mb-2">{assignment.title}</h1>
        {assignment.sponsor_name && (
          <div className="text-xs text-zinc-500 mb-2">
            <div className="uppercase tracking-widest font-bold text-[10px] text-zinc-600">Assigned by</div>
            <div>{assignment.sponsor_name}</div>
          </div>
        )}
        {assignment.description && (
          <p className="text-zinc-400 text-sm mb-4">{assignment.description}</p>
        )}

        <div className="mb-6 border border-zinc-800 rounded-xl p-4 bg-zinc-900/50" data-tutorial-id="assignment-creative-content">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
            Creative Content
          </p>
          {!assignment.creative_creation_mode ? (
            <p className="text-sm text-zinc-400">No content creation access</p>
          ) : assignment.creative_creation_mode === 'campaign_asset_only' ? (
            <div className="space-y-1">
              <p className="text-sm text-zinc-200 font-medium">Campaign + asset only</p>
              <p className="text-xs text-zinc-400">
                You can create content using the Sponsor&apos;s{' '}
                <span className="text-zinc-200">{assignment.only_promote_asset_name ?? 'ONLY PROMOTE ASSET'}</span>
                {' '}campaign.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-zinc-200 font-medium">Campaign + links + assets</p>
              <p className="text-xs text-zinc-400">
                You can create content using the Sponsor&apos;s{' '}
                <span className="text-zinc-200">{assignment.only_promote_asset_name ?? 'ONLY PROMOTE ASSET'}</span>
                {assignment.creative_campaign_name ? (
                  <>
                    {' '}and{' '}
                    <span className="text-zinc-200">{assignment.creative_campaign_name}</span>
                  </>
                ) : (
                  ' and the Sponsor-selected campaign'
                )}
                .
              </p>
            </div>
          )}
        </div>

        {/* Read-only. No Add/Remove, no editing — this PR only surfaces
            what was already selected at Create Assignment time.
            assignment_tracking_domains is the source of truth; this
            block does not touch redirect_links (unrelated, historical). */}
        {data.trackingDomains.length > 0 && (
          <div className="mb-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Tracking Domains
            </div>
            <div className="space-y-1.5">
              {data.trackingDomains.map(domain => (
                <div key={domain.id} className="flex items-center gap-2 text-sm text-zinc-300">
                  <CheckCircle2 size={13} className="text-red-600 shrink-0" />
                  {domain.hostname}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-sm border border-red-900 bg-red-950/30 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {myInvitation && myInvitation.status === 'pending' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6 flex items-center justify-between">
            <p className="text-sm text-zinc-300">You've been invited to collaborate on this Assignment.</p>
            <button
              onClick={() => handleAccept(myInvitation.id)}
              disabled={accepting}
              data-tutorial-id="assignment-accept-invitation"
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
            >
              {accepting ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
              Accept Invitation
            </button>
          </div>
        )}

        {!canAct && !myInvitation && (
          <div className="text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl p-6">
            You don't have an active collaboration on this Assignment.
          </div>
        )}

       {assignmentAssets.length > 0 && (
  <>
    {!canAct && (
      <>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Assignment Assets
        </label>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-xl">
              📦
            </div>
            <div>
              <div className="text-white font-medium">
                {assignmentAssets.length} Asset{assignmentAssets.length !== 1 ? 's' : ''}
              </div>
              <div className="text-xs text-zinc-500">
                Accept this assignment to start promoting.
              </div>
            </div>
          </div>
          <ul className="space-y-2 border-t border-zinc-800 pt-3">
            {assignmentAssets.map(asset => (
              <li key={asset.asset_id} className="flex items-center gap-3 text-sm text-zinc-300">
                <img
                  src={
                    asset.kind === 'campaign_element'
                      ? resolveElementThumbnail(asset.element_type ?? '')
                      : resolveThumbnail(asset)
                  }
                  alt=""
                  className="w-12 h-7 object-cover rounded bg-zinc-950 shrink-0"
                />
                <span className="truncate">
                  {asset.kind === 'campaign_element'
                    ? (asset.display_name || asset.element_type || 'Element')
                    : (asset.display_name || asset.title || asset.asset_id)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </>
    )}

    {canAct && (
      <>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Select Assets to Promote
        </label>

        <div className="space-y-2 mb-6" data-tutorial-id="assignment-select-assets">
          {assignmentAssets.map(asset => {
            const selected = selectedAssetIds.has(asset.asset_id);
            const usage = assetUsageById.get(asset.asset_id) ?? DEFAULT_USAGE;
            return (
              <div
                key={asset.asset_id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700"
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleAsset(asset.asset_id)}
                    className="accent-red-600"
                  />

                  <img
                    src={
                      asset.kind === 'campaign_element'
                        ? resolveElementThumbnail(asset.element_type ?? '')
                        : resolveThumbnail(asset)
                    }
                    alt=""
                    className="w-16 h-9 object-cover rounded bg-zinc-950 shrink-0"
                  />

                  <span className="text-sm text-zinc-200">
                    {asset.kind === 'campaign_element' ? (
                      <>
                        <span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>
                          {asset.element_type
                            ? getElementTypeLabel(asset.element_type)
                            : 'Asset'}
                        </span>

                        <span className="text-zinc-600 mx-1">•</span>

                        {asset.display_name}
                      </>
                    ) : (
                      asset.video_title ?? asset.asset_id
                    )}
                  </span>
                </label>

                {selected && (asset.allow_marketer_domain || asset.allow_sponsor_domain || asset.allow_vstrk_domain) && (
                  <div className="mt-3 ml-8 space-y-3 border-t border-zinc-800 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      Promotion methods
                    </p>
                    {asset.allow_marketer_domain && (
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Marketer&apos;s tracking domain
                        </label>
                        <select
                          value={usage.selectedMarketerDomainId ?? ''}
                          onChange={e => {
                            const id = e.target.value || null;
                            patchAssetUsage(asset.asset_id, {
                              selectedMarketerDomainId: id,
                              useMarketerDomain: !!id,
                            });
                          }}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100"
                        >
                          <option value="">None</option>
                          {marketerVerifiedDomains.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.hostname}
                            </option>
                          ))}
                        </select>
                        {marketerVerifiedDomains.length === 0 && (
                          <p className="text-[9px] text-zinc-600">
                            No verified Marketer domains found. Set one up in Tracking Domains settings.
                          </p>
                        )}
                      </div>
                    )}
                    {asset.allow_sponsor_domain && (
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Sponsor&apos;s tracking domain
                        </label>
                        <div className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono">
                          {asset.selected_sponsor_hostname
                            ?? (asset.selected_sponsor_domain_id
                              ? asset.selected_sponsor_domain_id.slice(0, 8) + '…'
                              : 'Not set by Sponsor')}
                        </div>
                        <p className="text-[9px] text-zinc-600">
                          Set by Sponsor at Create Assignment — cannot be changed.
                        </p>
                        {!asset.selected_sponsor_domain_id && (
                          <p className="text-[9px] text-amber-600/90">
                            Legacy/incomplete: Sponsor enabled this method without selecting a domain.
                          </p>
                        )}
                      </div>
                    )}
                    {asset.allow_vstrk_domain && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!usage.useVstrkDomain}
                          onChange={e =>
                            patchAssetUsage(asset.asset_id, { useVstrkDomain: e.target.checked })
                          }
                          className="accent-red-600"
                        />
                        <span className="text-xs text-zinc-300">VSTRK tracking domain</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleStartPromoting}
          disabled={starting || selectedAssetIds.size === 0}
          data-tutorial-id="assignment-start-promoting"
          className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-lg"
        >
          {starting ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Rocket size={14} />
          )}

          Start Promoting
        </button>
      </>
    )}

    {canAct && campaignGroups.length === 0 && (
      <div className="text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl p-6">
        None of this Assignment's Assets have Campaign provenance, so there's nothing available to promote yet.
      </div>
    )}
  </>
)}
      </div>
    </div>
  );
}