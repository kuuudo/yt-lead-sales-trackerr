// ─────────────────────────────────────────────────────────────────────────────
// InviteMember.tsx
//
// Real invitation flow: no email sending. Creates a member_invitations row,
// generates a shareable link, shows it with a Copy button. Owner sends the
// link themselves via whatever channel they want — per your product decision,
// email/notification delivery is explicitly out of scope for Operator.
//
// Duplicate-invite guards (your explicit requirement):
// 1. Reject if the email already belongs to a current member of this org.
// 2. Reject if a pending invitation already exists for this email in this org.
//
// Reuses useOrganization()/useAuth()/supabase exactly as before. No new hooks.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Copy, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOrganization } from '../../lib/useOrganization';

// POC: single hardcoded bypass email — see is_operator_for_user() SQL bypass.
const ALIN_POC_EMAIL = 'alinospam2020@gmail.com';

export default function InviteMember() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organizationId } = useOrganization();

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pocSuccess, setPocSuccess] = useState(false);

  async function handleInvite() {
    if (!organizationId || !user) return;
    setSubmitting(true);
    setError(null);

        const normalizedEmail = email.trim().toLowerCase();

    // ── POC bypass: alinospam2020@gmail.com skips invitation/accept
    // entirely. No member_invitations row, no token, no link generated.
    // She's already visible via the Members.tsx POC entry; the real
    // access check is enforced later by is_operator_for_user()'s
    // matching SQL bypass. This branch does not grant any access.
    if (normalizedEmail === ALIN_POC_EMAIL) {
      setPocSuccess(true);
      setSubmitting(false);
      return;
    }

    // 1. Already a member? — look up the profile by email, then check
    //    organization_members for that user_id in this org.
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingProfile) {
      const { data: existingMembership } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId)
        .eq('user_id', existingProfile.id)
        .maybeSingle();

      if (existingMembership) {
        setError('This person is already a member.');
        setSubmitting(false);
        return;
      }
    }

    // 2. Already a pending invitation for this email in this org?
    const { data: existingInvite } = await supabase
      .from('member_invitations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('invited_email', normalizedEmail)
      .maybeSingle();

    if (existingInvite) {
      setError('An invitation is already pending for this email.');
      setSubmitting(false);
      return;
    }

    // 3. Create the invitation.
    const token = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from('member_invitations')
      .insert({
        organization_id: organizationId,
        invited_email: normalizedEmail,
        token,
        invited_by_user_id: user.id,
      });

    if (insertError) {
      console.error('Failed to create invitation:', insertError);
      setError('Something went wrong creating the invitation.');
      setSubmitting(false);
      return;
    }

    setInviteLink(`${window.location.origin}/invite/${token}`);
    setSubmitting(false);
  }

  function handleCopy() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <button
        onClick={() => navigate('/operator')}
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors mb-8"
      >
        <ChevronLeft size={13} /> Back to members
      </button>

      <div className="bento-card p-6">
        <h1 className="label-caps !text-white mb-6">Invite member</h1>

        {pocSuccess ? (
          <>
            <p className="text-[11px] font-bold text-emerald-400 mb-1">Alin added</p>
            <p className="text-[9px] font-bold text-zinc-600 mb-5">
              alinospam2020@gmail.com is now an Operator Member — no action needed from them.
            </p>
            <button
              onClick={() => navigate('/operator/members')}
              className="w-full bg-emerald-500 text-emerald-950 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-colors"
            >
              Go to Members
            </button>
          </>
        ) : inviteLink ? (
          <>
            <p className="text-[11px] font-bold text-emerald-400 mb-1">Invitation created</p>
            <p className="text-[9px] font-bold text-zinc-600 mb-5">
              Share this link with {email} however you'd like — email, chat, DM.
            </p>
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 mb-3">
              <span className="text-[10px] text-zinc-300 truncate flex-1">{inviteLink}</span>
            </div>
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-emerald-950 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-colors"
            >
              {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy invite link</>}
            </button>
          </>
        ) : (
          <>
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 block mb-2">
              Email
            </label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 mb-3"
            />
            {error && (
              <p className="text-[10px] font-bold text-amber-500 mb-3">{error}</p>
            )}
            <button
              onClick={handleInvite}
              disabled={!email || submitting}
              className="w-full bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-emerald-950 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-colors"
            >
              {submitting ? 'Creating…' : 'Create invitation'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
