// ─────────────────────────────────────────────────────────────────────────────
// AcceptInvitation.tsx
//
// Real token lookup + accept action. On accept: creates organization_members,
// deletes the member_invitations row (invitation is disposable, per your
// decision — not archived).
//
// BLOCKED / FLAGGED, not invented:
// The "no account yet" branch needs a real sign-up route to redirect to,
// ideally pre-filled with the invited email. I don't have that route in
// anything I've been given — the button below is a clearly-marked
// placeholder. Tell me the actual route (e.g. /signup?email=...) and I'll
// wire it for real.
//
// Light guard added: if the authenticated user's email doesn't match the
// invitation's invited_email, acceptance is blocked with a message, rather
// than silently letting anyone with a valid session claim someone else's
// invite. This wasn't explicitly requested but follows directly from why
// invited_email exists on the table (see migration comment) — flagging it
// here in case you want it removed or handled differently.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

interface InvitationInfo {
  id: string;
  organizationId: string;
  organizationName: string;
  invitedEmail: string;
}

export default function AcceptInvitation() {
  const { token } = useParams();
  const { user, loading: authLoading } = useAuth();

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    supabase
      .from('member_invitations')
      .select('id, organization_id, invited_email, organizations(name)')
      .eq('token', token)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const org = data.organizations as unknown as { name: string } | null;

        setInvitation({
          id: data.id,
          organizationId: data.organization_id,
          organizationName: org?.name || 'this organization',
          invitedEmail: data.invited_email,
        });
        setLoading(false);
      });
  }, [token]);

  async function handleAccept() {
    if (!invitation || !user) return;

    if (user.email?.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
      setError(`This invitation was sent to ${invitation.invitedEmail}. Please sign in with that email to accept.`);
      return;
    }

    setAccepting(true);
    setError(null);

    const { error: insertError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: invitation.organizationId,
        user_id: user.id,
        role: 'member',
      });

    if (insertError) {
      console.error('Failed to accept invitation:', insertError);
      setError('Something went wrong accepting the invitation.');
      setAccepting(false);
      return;
    }

    await supabase.from('member_invitations').delete().eq('id', invitation.id);

    setAccepted(true);
    setAccepting(false);
  }

  if (loading || authLoading) {
    return (
      <div className="max-w-sm mx-auto px-6 py-24 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Loading…</p>
      </div>
    );
  }

  if (notFound || !invitation) {
    return (
      <div className="max-w-sm mx-auto px-6 py-24">
        <div className="bento-card p-6 text-center">
          <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">
            This invitation link is invalid or has already been used.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-24">
      <div className="bento-card p-6 text-center">
        {accepted ? (
          <>
            <p className="text-[11px] font-bold text-emerald-400 mb-1">You're in</p>
            <p className="text-[9px] font-bold text-zinc-600">Welcome to {invitation.organizationName}</p>
          </>
        ) : !user ? (
          <>
            <h1 className="label-caps !text-white mb-2">Join {invitation.organizationName}</h1>
            <p className="text-[9px] font-bold text-zinc-600 mb-6">
              You've been invited as {invitation.invitedEmail}. Sign in or create an account to continue.
            </p>
            {/* PLACEHOLDER — needs your real sign-up/login route, see file header */}
            <button
              onClick={() => alert('TODO: route to real sign-up/login page, pre-filled with ' + invitation.invitedEmail)}
              className="w-full bg-emerald-500 text-emerald-950 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl"
            >
              Sign in / Sign up
            </button>
          </>
        ) : (
          <>
            <h1 className="label-caps !text-white mb-2">Join {invitation.organizationName}</h1>
            <p className="text-[9px] font-bold text-zinc-600 mb-6">
              You've been invited to join this organization on VS-Track.
            </p>
            {error && (
              <p className="text-[10px] font-bold text-amber-500 mb-4">{error}</p>
            )}
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full bg-emerald-500 disabled:bg-zinc-800 text-emerald-950 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl"
            >
              {accepting ? 'Joining…' : 'Accept invitation'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
