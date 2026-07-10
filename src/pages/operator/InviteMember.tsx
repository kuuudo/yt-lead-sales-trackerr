// ─────────────────────────────────────────────────────────────────────────────
// InviteMember.tsx
//
// Standalone page (not a modal), per decision to keep Invite reusable for
// future Collaborator / Team invite flows. Mock submit only — no Supabase,
// no member_invitations insert yet.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function InviteMember() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  function handleInvite() {
    // TODO: replace with member_invitations insert once migration exists
    console.log('Invite sent (mock):', email);
    setSent(true);
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <button
        onClick={() => navigate('/operator/members')}
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors mb-8"
      >
        <ChevronLeft size={13} /> Back to members
      </button>

      <div className="bento-card p-6">
        <h1 className="label-caps !text-white mb-6">Invite member</h1>

        {sent ? (
          <div className="py-6 text-center">
            <p className="text-[11px] font-bold text-emerald-400 mb-1">Invite sent</p>
            <p className="text-[9px] font-bold text-zinc-600">{email}</p>
          </div>
        ) : (
          <>
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 block mb-2">
              Email
            </label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 mb-5"
            />
            <button
              onClick={handleInvite}
              disabled={!email}
              className="w-full bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-emerald-950 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-colors"
            >
              Send invite
            </button>
          </>
        )}
      </div>
    </div>
  );
}
