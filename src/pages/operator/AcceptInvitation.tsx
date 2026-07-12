// ─────────────────────────────────────────────────────────────────────────────
// AcceptInvitation.tsx
//
// Calls the single accept_invitation RPC instead of doing separate select /
// insert / delete calls from the client. See migration 003.
//
// BEHAVIOR CHANGE from the previous version, caused directly by the RLS
// decision (not a redesign choice): this page can no longer pre-fetch the
// organization name or validate the token on page load, because the
// SELECT policy on member_invitations is owner-scoped only. The invitee's
// direct table read was already broken by that policy — it just hadn't
// been exercised yet. So:
//   - The page shows a generic "You've been invited" message on load,
//     not the organization's name.
//   - Token validity is only known AFTER the user clicks Accept and the
//     RPC responds — not before, as it was previously.
//
// Still a flagged placeholder: the unauthenticated branch's sign-in button.
// I still don't have your real sign-up/login route.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

type AcceptResult =
  | { success: true; organization_id: string; organization_name: string }
  | { success: false; error: 'invalid_token' | 'not_authenticated' | 'organization_not_found' | 'already_member'; }
  | { success: false; error: 'email_mismatch'; invited_email: string };

export default function AcceptInvitation() {
  const { token } = useParams();
  const { user, loading: authLoading } = useAuth();

  const [accepting, setAccepting] = useState(false);
  const [result, setResult] = useState<AcceptResult | null>(null);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);

    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });

    if (error) {
      console.error('accept_invitation RPC failed:', error);
      setResult({ success: false, error: 'invalid_token' });
      setAccepting(false);
      return;
    }

    setResult(data as AcceptResult);
    setAccepting(false);
  }

  function errorMessage(r: Extract<AcceptResult, { success: false }>): string {
    switch (r.error) {
      case 'invalid_token':          return 'This invitation link is invalid or has already been used.';
      case 'organization_not_found': return 'This organization no longer exists.';
      case 'already_member':         return 'You are already a member of this organization.';
      case 'not_authenticated':      return 'Please sign in to accept this invitation.';
      case 'email_mismatch':         return `This invitation was sent to ${r.invited_email}. Please sign in with that email to accept.`;
    }
  }

  if (authLoading) {
    return (
      <div className="max-w-sm mx-auto px-6 py-24 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Loading…</p>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-24">
      <div className="bento-card p-6 text-center">
        {result?.success ? (
          <>
            <p className="text-[11px] font-bold text-emerald-400 mb-1">You're in</p>
            <p className="text-[9px] font-bold text-zinc-600">Welcome to {result.organization_name}</p>
          </>
        ) : !user ? (
          <>
            <h1 className="label-caps !text-white mb-2">You've been invited</h1>
            <p className="text-[9px] font-bold text-zinc-600 mb-6">
              Sign in or create an account to view and accept this invitation.
            </p>
            {/* PLACEHOLDER — needs your real sign-up/login route */}
            <button
              onClick={() => alert('TODO: route to real sign-up/login page')}
              className="w-full bg-emerald-500 text-emerald-950 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl"
            >
              Sign in / Sign up
            </button>
          </>
        ) : (
          <>
            <h1 className="label-caps !text-white mb-2">You've been invited</h1>
            <p className="text-[9px] font-bold text-zinc-600 mb-6">
              You've been invited to join an organization on VS-Track.
            </p>
            {result && !result.success && (
              <p className="text-[10px] font-bold text-amber-500 mb-4">{errorMessage(result)}</p>
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
