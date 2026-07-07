import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createAssignment } from '../services/assignment/createAssignment';
import { inviteCollaborators } from '../services/assignment/inviteCollaborator';
import {
  listCampaignsForOrg,
  listAssetsForCampaign,
  type CampaignOption,
  type AssetOption,
} from '../services/assignment/listAssetsForAssignmentPicker';
import { getElementTypeLabel, resolveThumbnail, resolveElementThumbnail } from '../lib/videoFormatters';
import { AssetPicker } from '../services/assignment/AssetPicker';

export default function CreateAssignment() {
  const navigate = useNavigate();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // --- New: Library Asset Picker (additive, separate from the Campaign flow above) ---
  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
  const [librarySelectedAssetIds, setLibrarySelectedAssetIds] = useState<string[]>([]);
  const [draftLibrarySelection, setDraftLibrarySelection] = useState<string[]>([]);

  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);

  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not signed in'); setLoadingCampaigns(false); return; }
      setUserId(user.id);

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!membership?.organization_id) {
        setError('No organization found for this user');
        setLoadingCampaigns(false);
        return;
      }
      setOrganizationId(membership.organization_id);

      try {
        const orgCampaigns = await listCampaignsForOrg(membership.organization_id);
        setCampaigns(orgCampaigns);
        if (orgCampaigns.length > 0) setSelectedCampaignId(orgCampaigns[0].id);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingCampaigns(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) { setAssets([]); return; }
    setLoadingAssets(true);
    setSelectedAssetIds(new Set());
    listAssetsForCampaign(selectedCampaignId)
      .then(setAssets)
      .catch(e => setError(e.message))
      .finally(() => setLoadingAssets(false));
  }, [selectedCampaignId]);

  const toggleAsset = (assetId: string) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  // --- New: Library Asset Picker modal handlers ---
  const openLibraryPicker = () => {
    setDraftLibrarySelection(librarySelectedAssetIds);
    setIsLibraryPickerOpen(true);
  };

  const cancelLibraryPicker = () => {
    setIsLibraryPickerOpen(false);
    // draftLibrarySelection is discarded — librarySelectedAssetIds (committed) is untouched
  };

  const confirmLibraryPicker = () => {
    setLibrarySelectedAssetIds(draftLibrarySelection);
    setIsLibraryPickerOpen(false);
  };

  const addEmail = () => {
    const value = emailInput.trim().toLowerCase();
    if (value && value.includes('@') && !emails.includes(value)) {
      setEmails([...emails, value]);
    }
    setEmailInput('');
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter(e => e !== email));
  };

  const handleSubmit = async () => {
    if (!organizationId || !userId) return;
    setError(null);

    // Combine both selection sources. De-duplicated in case the same asset_id
    // is ever selectable via both paths (same org, could theoretically appear
    // in both a Campaign's assets and the Library).
    const combinedAssetIds = Array.from(
      new Set([...selectedAssetIds, ...librarySelectedAssetIds])
    );

    if (!title.trim()) return setError('Title is required');
    if (combinedAssetIds.length === 0) return setError('Select at least one Asset');
    if (emails.length === 0) return setError('Add at least one collaborator email');

    setSubmitting(true);
    try {
      const { assignmentId } = await createAssignment({
        organizationId,
        createdByUserId: userId,
        title,
        description: description || null,
        assetIds: combinedAssetIds,
      });

      const { failed } = await inviteCollaborators(assignmentId, userId, emails);
      if (failed.length > 0) {
        console.warn('Some invitations failed:', failed);
      }

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

        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Campaign <span className="normal-case text-zinc-600">(filters the Asset list below only)</span>
        </label>
        {loadingCampaigns ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-6">
            <Loader2 className="animate-spin" size={14} /> Loading campaigns…
          </div>
        ) : (
          <select
            value={selectedCampaignId ?? ''}
            onChange={e => setSelectedCampaignId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm mb-6"
          >
            {campaigns.length === 0 && <option value="">No campaigns found</option>}
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.campaign_name ?? c.id}</option>
            ))}
          </select>
        )}

        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Authorized Assets
        </label>
        {loadingAssets ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-6">
            <Loader2 className="animate-spin" size={14} /> Loading assets…
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {assets.length === 0 && (
              <div className="text-zinc-600 text-sm border border-dashed border-zinc-800 rounded-lg p-4 text-center">
                No assets in this Campaign
              </div>
            )}
            {assets.map(asset => (
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
                {asset.kind === 'video' ? (
                  <span className="text-sm text-zinc-200">
                    {asset.video_title ?? asset.asset_id}
                  </span>
                ) : (
                  <span className="text-sm text-zinc-200">
                    <span style={{ color: 'rgba(255, 69, 0, 0.7)' }}>{getElementTypeLabel(asset.element_type)}</span>
                    <span className="text-zinc-600 mx-1">•</span>
                    {asset.display_name}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        {/* --- New: Library Asset Picker (additive; existing Campaign flow above is unchanged) --- */}
        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Choose Library Assets <span className="normal-case text-zinc-600">(optional, in addition to Campaign Assets above)</span>
        </label>
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={openLibraryPicker}
            disabled={!organizationId}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
          >
            <Plus size={14} /> Select Assets
          </button>
          {librarySelectedAssetIds.length > 0 && (
            <span className="text-zinc-500 text-sm">
              {librarySelectedAssetIds.length} asset{librarySelectedAssetIds.length === 1 ? '' : 's'} selected from Library
            </span>
          )}
        </div>

        {isLibraryPickerOpen && organizationId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">Asset Library</h2>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <AssetPicker
                  organizationId={organizationId}
                  onSelectionChange={setDraftLibrarySelection}
                  initialSelectedAssetIds={librarySelectedAssetIds}
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

        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Invite Collaborators
        </label>
        <div className="flex gap-2 mb-3">
          <input
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
            placeholder="collaborator@email.com"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm"
          />
          <button
            onClick={addEmail}
            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase tracking-wider px-3 rounded-lg"
          >
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-8">
          {emails.map(email => (
            <span
              key={email}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1 text-xs text-zinc-300"
            >
              {email}
              <button onClick={() => removeEmail(email)} className="text-zinc-500 hover:text-white">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-lg"
        >
          {submitting ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
          Create Assignment &amp; Send Invitations
        </button>
      </div>
    </div>
  );
}
