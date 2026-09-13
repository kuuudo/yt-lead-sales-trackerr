import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Send, HelpCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createAssignment } from '../services/assignment/createAssignment';
import { inviteCollaborator } from '../services/assignment/inviteCollaborator';
import { useTutorial } from '../lib/tutorial-overlay';
import { AssetPicker } from '../services/assignment/AssetPicker';
import {
  listVerifiedBrandedDomains,
  type VerifiedDomainOption,
} from '../services/domain/brandedDomains';

export default function CreateAssignment() {
  const navigate = useNavigate();

  const { notify: notifyTutorial } = useTutorial();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // --- New: Tracking Domains (Assignment configuration, NOT an Asset —
  // deliberately not routed through AssetPicker or any Asset-shaped
  // state. A plain checkbox list over the org's own verified domains). ---
  const [domains, setDomains] = useState<VerifiedDomainOption[]>([]);
  const [selectedDomainIds, setSelectedDomainIds] = useState<Set<string>>(new Set());
  const [loadingDomains, setLoadingDomains] = useState(true);

  // --- New: Library Asset Picker (additive, separate from the Campaign flow above) ---
  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
  const [librarySelectedAssetIds, setLibrarySelectedAssetIds] = useState<string[]>([]);
  const [draftLibrarySelection, setDraftLibrarySelection] = useState<string[]>([]);

  const [email, setEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not signed in'); return; }
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

  // --- New: load this organization's verified Tracking Domains once
  // organizationId is known. Independent of Campaign/Asset selection —
  // domains are Assignment-level configuration, not filtered by Campaign. ---
  useEffect(() => {
    if (!organizationId) return;
    setLoadingDomains(true);
    listVerifiedBrandedDomains(organizationId)
      .then(setDomains)
      .catch(e => setError(e.message))
      .finally(() => setLoadingDomains(false));
  }, [organizationId]);

  const toggleDomain = (domainId: string) => {
    setSelectedDomainIds(prev => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId);
      else next.add(domainId);
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

  const handleSubmit = async () => {
    if (!organizationId || !userId) return;
    setError(null);

    if (!title.trim()) return setError('Title is required');
    if (librarySelectedAssetIds.length === 0) return setError('Select at least one Asset');
    if (!email.trim()) return setError('Add a collaborator email');

    setSubmitting(true);
    try {
      const { assignmentId } = await createAssignment({
        organizationId,
        createdByUserId: userId,
        title,
        description: description || null,
        assetIds: librarySelectedAssetIds,
        domainIds: Array.from(selectedDomainIds),
      });

      await inviteCollaborator({ assignmentId, invitedByUserId: userId, invitedEmail: email });

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

        {/* --- New: Tracking Domains. Assignment configuration, NOT an
            Asset — deliberately a plain checkbox list, no thumbnails,
            no filters, no AssetPicker. Zero selected is valid. --- */}
        <div data-tutorial-id="marketplace-tracking-domains">
        <div className="flex items-center gap-1.5 mb-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Tracking Domains <span className="normal-case text-zinc-600">(optional)</span>
          </label>
          <span
            title="Select one or more of your verified tracking domains to make available to your collaborator. When they generate a tracking link, they can choose one of these instead of the default — e.g. go.yourdomain.com/token instead of vstrk.com/token."
            className="text-zinc-600 hover:text-zinc-400 cursor-help"
          >
            <HelpCircle size={12} />
          </span>
        </div>
        {loadingDomains ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-6">
            <Loader2 className="animate-spin" size={14} /> Loading tracking domains…
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {domains.length === 0 && (
              <div className="text-zinc-600 text-sm border border-dashed border-zinc-800 rounded-lg p-4 text-center">
                No verified tracking domains yet
              </div>
            )}
            {domains.map(domain => (
              <label
                key={domain.id}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-pointer hover:border-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={selectedDomainIds.has(domain.id)}
                  onChange={() => toggleDomain(domain.id)}
                  className="accent-red-600"
                />
                <span className="text-sm text-zinc-200">{domain.hostname}</span>
              </label>
            ))}
          </div>
        )}

        </div>

        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Assets
        </label>
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={openLibraryPicker}
            disabled={!organizationId}
            data-tutorial-id="marketplace-select-assets"
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
          Create Assignment &amp; Send Invitations
        </button>
      </div>
    </div>
  );
}
