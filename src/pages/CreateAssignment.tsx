import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createAssignment } from '../services/assignment/createAssignment';
import { inviteCollaborator } from '../services/assignment/inviteCollaborator';
import { useTutorial } from '../lib/tutorial-overlay';
import { AssetPicker } from '../services/assignment/AssetPicker';

type CreativeCreationMode = 'none' | 'campaign_asset_only' | 'campaign_links_and_assets';

interface AssetPermissionState {
  allowMarketerDomain: boolean;
  allowSponsorDomain: boolean;
  allowVstrkDomain: boolean;
}

const DEFAULT_PERMISSIONS: AssetPermissionState = {
  allowMarketerDomain: false,
  allowSponsorDomain: false,
  allowVstrkDomain: false,
};

export default function CreateAssignment() {
  const navigate = useNavigate();

  const { notify: notifyTutorial } = useTutorial();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Per-asset promotion-method permissions.
  // Keyed by asset_id. Only assets present in librarySelectedAssetIds
  // should have entries; removing an asset removes its entry.
  const [assetPermissions, setAssetPermissions] = useState<
    Map<string, AssetPermissionState>
  >(new Map());

  // Creative / Content Creation capability — Assignment-scoped.
  const [creativeCreationMode, setCreativeCreationMode] =
    useState<CreativeCreationMode>('none');

  // Library Asset Picker
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

  // Keep assetPermissions Map in sync with librarySelectedAssetIds:
  // - new asset → default false/false/false
  // - removed asset → drop its entry
  useEffect(() => {
    setAssetPermissions(prev => {
      const next = new Map<string, AssetPermissionState>();
      for (const assetId of librarySelectedAssetIds) {
        next.set(assetId, prev.get(assetId) ?? { ...DEFAULT_PERMISSIONS });
      }
      return next;
    });
  }, [librarySelectedAssetIds]);

  const openLibraryPicker = () => {
    setDraftLibrarySelection(librarySelectedAssetIds);
    setIsLibraryPickerOpen(true);
  };

  const cancelLibraryPicker = () => {
    setIsLibraryPickerOpen(false);
  };

  const confirmLibraryPicker = () => {
    setLibrarySelectedAssetIds(draftLibrarySelection);
    setIsLibraryPickerOpen(false);
  };

  const setAssetPermission = (
    assetId: string,
    key: keyof AssetPermissionState,
    value: boolean
  ) => {
    setAssetPermissions(prev => {
      const next = new Map(prev);
      const current = next.get(assetId) ?? { ...DEFAULT_PERMISSIONS };
      next.set(assetId, { ...current, [key]: value });
      return next;
    });
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
        assetPermissions: librarySelectedAssetIds.map(assetId => {
          const p = assetPermissions.get(assetId) ?? DEFAULT_PERMISSIONS;
          return {
            assetId,
            allowMarketerDomain: p.allowMarketerDomain,
            allowSponsorDomain: p.allowSponsorDomain,
            allowVstrkDomain: p.allowVstrkDomain,
          };
        }),
        domainIds: [],
        creativeCreationMode:
          creativeCreationMode === 'none' ? null : creativeCreationMode,
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

        {/* Assets — unified AssetPicker only. Campaign is determined automatically. */}
        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
          Assets
        </label>
        <div className="flex items-center gap-3 mb-2">
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
        <p className="text-[10px] text-zinc-600 mb-6">
          Campaign is determined automatically from the asset you pick.
        </p>

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

        {/* Per-asset promotion methods — only after Assets are selected.
            Each Asset gets its own independent checkbox group. */}
        {librarySelectedAssetIds.length > 0 && (
          <div data-tutorial-id="marketplace-promotion-methods" className="mb-6 space-y-4">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              How should the marketer promote each asset?
            </label>
            {librarySelectedAssetIds.map(assetId => {
              const p = assetPermissions.get(assetId) ?? DEFAULT_PERMISSIONS;
              return (
                <div
                  key={assetId}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2"
                >
                  <p className="text-xs font-bold text-zinc-300 truncate mb-1">
                    Asset {assetId.slice(0, 8)}…
                  </p>
                  <label className="flex items-center gap-3 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={p.allowMarketerDomain}
                      onChange={e =>
                        setAssetPermission(assetId, 'allowMarketerDomain', e.target.checked)
                      }
                      className="accent-red-600"
                    />
                    <span className="text-sm text-zinc-200">Marketer&apos;s tracking domain</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={p.allowSponsorDomain}
                      onChange={e =>
                        setAssetPermission(assetId, 'allowSponsorDomain', e.target.checked)
                      }
                      className="accent-red-600"
                    />
                    <span className="text-sm text-zinc-200">Sponsor&apos;s tracking domain</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={p.allowVstrkDomain}
                      onChange={e =>
                        setAssetPermission(assetId, 'allowVstrkDomain', e.target.checked)
                      }
                      className="accent-red-600"
                    />
                    <span className="text-sm text-zinc-200">VSTRK tracking domain</span>
                  </label>
                </div>
              );
            })}
            <p className="text-[10px] text-zinc-600">
              The marketer chooses their actual branded domain later, when they set up the assignment.
            </p>
          </div>
        )}

        {/* Creative / Content Creation capability — Assignment-level */}
        <div data-tutorial-id="marketplace-content-creation" className="mb-6">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
            Content Creation
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-pointer hover:border-zinc-700">
              <input
                type="radio"
                name="creativeCreationMode"
                checked={creativeCreationMode === 'none'}
                onChange={() => setCreativeCreationMode('none')}
                className="accent-red-600"
              />
              <span className="text-sm text-zinc-200">No content creation</span>
            </label>
            <label className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-pointer hover:border-zinc-700">
              <input
                type="radio"
                name="creativeCreationMode"
                checked={creativeCreationMode === 'campaign_asset_only'}
                onChange={() => setCreativeCreationMode('campaign_asset_only')}
                className="accent-red-600"
              />
              <span className="text-sm text-zinc-200">Campaign + asset only</span>
            </label>
            <label className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-pointer hover:border-zinc-700">
              <input
                type="radio"
                name="creativeCreationMode"
                checked={creativeCreationMode === 'campaign_links_and_assets'}
                onChange={() => setCreativeCreationMode('campaign_links_and_assets')}
                className="accent-red-600"
              />
              <span className="text-sm text-zinc-200">Campaign + links + assets</span>
            </label>
          </div>
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
