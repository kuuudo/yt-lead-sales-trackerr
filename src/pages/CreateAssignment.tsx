import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createAssignment } from '../services/assignment/createAssignment';
import { inviteCollaborators } from '../services/assignment/inviteCollaborator';
import { AssetPicker } from '../services/assignment/AssetPicker';

export default function CreateAssignment() {
  const navigate = useNavigate();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);

  const [loadingOrg, setLoadingOrg] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not signed in'); setLoadingOrg(false); return; }
      setUserId(user.id);

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!membership?.organization_id) {
        setError('No organization found for this user');
        setLoadingOrg(false);
        return;
      }
      setOrganizationId(membership.organization_id);
      setLoadingOrg(false);
    };
    init();
  }, []);


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

    if (!title.trim()) return setError('Title is required');
    if (selectedAssetIds.length === 0) return setError('Select at least one Asset');
    if (emails.length === 0) return setError('Add at least one collaborator email');

    setSubmitting(true);
    try {
      const { assignmentId } = await createAssignment({
        organizationId,
        createdByUserId: userId,
        title,
        description: description || null,
        assetIds: selectedAssetIds,
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
          Choose Assets
        </label>
        {!organizationId ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-6">
            <Loader2 className="animate-spin" size={14} /> Loading…
          </div>
        ) : (
          <div className="mb-6">
            <AssetPicker
              organizationId={organizationId}
              onSelectionChange={setSelectedAssetIds}
            />
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
