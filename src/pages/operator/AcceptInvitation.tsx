// ─────────────────────────────────────────────────────────────────────────────
// AcceptInvitation.tsx
//
// Standalone page, reached via /invite/:token — not nested under /operator,
// since the recipient isn't a member yet and may not be logged in.
// MOCK DATA ONLY — organizationName below stands in for a future
// GET /invitations/{token} lookup.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

export default function AcceptInvitation() {
  const { token } = useParams();
  const [accepted, setAccepted] = useState(false);

  // TODO: replace with a real lookup by token once member_invitations exists
  const organizationName = 'Robert Academy';

  function handleAccept() {
    // TODO: replace with real accept action —
    // creates organization_members row, deletes the invitation
    console.log('Invitation accepted (mock):', token);
    setAccepted(true);
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-24">
      <div className="bento-card p-6 text-center">
        {accepted ? (
          <>
            <p className="text-[11px] font-bold text-emerald-400 mb-1">You're in</p>
            <p className="text-[9px] font-bold text-zinc-600">Welcome to {organizationName}</p>
          </>
        ) : (
          <>
            <h1 className="label-caps !text-white mb-2">Join {organizationName}</h1>
            <p className="text-[9px] font-bold text-zinc-600 mb-6">
              You've been invited to join this organization on VS-Track.
            </p>
            <button
              onClick={handleAccept}
              className="w-full bg-emerald-500 text-emerald-950 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl"
            >
              Accept invitation
            </button>
          </>
        )}
      </div>
    </div>
  );
}
