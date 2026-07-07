import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle2, Rocket, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAssignmentDetail, type AssignmentDetailData, type CampaignGroup } from '../services/assignment/getAssignmentDetail';
import { acceptInvitation } from '../services/assignment/acceptInvitation';
import { getElementTypeLabel, resolveThumbnail, resolveElementThumbnail } from '../lib/videoFormatters';

export default function AssignmentDetail() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<AssignmentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [starting, setStarting] = useState(false);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

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
      if (detail.campaignGroups.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(detail.campaignGroups[0].campaign_id);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load assignment');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [assignmentId]);

  const handleAccept = async (invitationId: string) => {
    setAccepting(true);
    try {
      await acceptInvitation(invitationId);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  const toggleAsset = (assetId: string) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const handleStartPromoting = async () => {
    if (!data || !selectedCampaignId || selectedAssetIds.size === 0) return;
    setStarting(true);
    setError(null);
    try {
      const { data: promotionId, error: rpcError } = await supabase.rpc('create_promotion', {
        p_organization_id: data.assignment.organization_id,
        p_campaign_id: selectedCampaignId,
        p_asset_ids: Array.from(selectedAssetIds),
        p_assignment_collaborator_id: data.myCollaboratorId,
      });

      if (rpcError || !promotionId) {
        throw new Error(rpcError?.message ?? 'Failed to create promotion');
      }

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

  const { assignment, myInvitation, myCollaboratorId, campaignGroups } = data;
  const activeGroup: CampaignGroup | undefined = campaignGroups.find(g => g.campaign_id === selectedCampaignId);
  const canAct = myCollaboratorId !== null;

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
        {assignment.description && (
          <p className="text-zinc-400 text-sm mb-6">{assignment.description}</p>
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

        {campaignGroups.length === 0 && (
          <div className="text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl p-6">
            This Assignment doesn't contain any Assets yet.
          </div>
        )}

        {campaignGroups.length > 0 && (
          <>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Assets in this Assignment
            </label>
            <div className="space-y-2 mb-6">
              {campaignGroups.flatMap(g => g.assets).map(asset => (
                <div
                  key={asset.asset_id}
                  className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3"
                >
                  <img
                    src={asset.kind === 'campaign_element' ? resolveElementThumbnail(asset.element_type ?? '') : resolveThumbnail(asset)}
                    alt=""
                    className="w-16 h-9 object-cover rounded bg-zinc-950 shrink-0"
                  />
                  <span className="text-sm text-zinc-200">
                    {asset.kind === 'campaign_element' ? (
                      <>
                        <span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>
                          {asset.element_type ? getElementTypeLabel(asset.element_type) : 'Asset'}
                        </span>
                        <span className="text-zinc-600 mx-1">•</span>
                        {asset.display_name}
                      </>
                    ) : (
                      asset.video_title ?? asset.asset_id
                    )}
                  </span>
                </div>
              ))}
            </div>

            {canAct && (
              <>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  Campaign
                </label>
                <select
                  value={selectedCampaignId ?? ''}
                  onChange={e => { setSelectedCampaignId(e.target.value); setSelectedAssetIds(new Set()); }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm mb-6"
                >
                  {campaignGroups.map(g => (
                    <option key={g.campaign_id} value={g.campaign_id}>
                      {g.campaign_name ?? g.campaign_id}
                    </option>
                  ))}
                </select>

                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  Select Assets to promote from this Campaign
                </label>
                <div className="space-y-2 mb-6">
                  {activeGroup?.assets.map(asset => (
                    <label
                      key={asset.asset_id}
                      className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-pointer hover:border-zinc-700"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAssetIds.has(asset.asset_id)}
                        onChange={() => toggleAsset(asset.asset_id)}
                        className="accent-red-600"
                      />
                      <img
                        src={asset.kind === 'campaign_element' ? resolveElementThumbnail(asset.element_type ?? '') : resolveThumbnail(asset)}
                        alt=""
                        className="w-16 h-9 object-cover rounded bg-zinc-950 shrink-0"
                      />
                      <span className="text-sm text-zinc-200">
                        {asset.kind === 'campaign_element' ? (
                          <>
                            <span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>
                              {asset.element_type ? getElementTypeLabel(asset.element_type) : 'Asset'}
                            </span>
                            <span className="text-zinc-600 mx-1">•</span>
                            {asset.display_name}
                          </>
                        ) : (
                          asset.video_title ?? asset.asset_id
                        )}
                      </span>
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleStartPromoting}
                  disabled={starting || selectedAssetIds.size === 0}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-lg"
                >
                  {starting ? <Loader2 className="animate-spin" size={14} /> : <Rocket size={14} />}
                  Start Promoting
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}