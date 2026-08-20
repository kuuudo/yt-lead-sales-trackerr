// ─────────────────────────────────────────────────────────────────────────────
// Members.tsx
//
// Real data via organization_members + profiles. UI/JSX unchanged from the
// mock version — only the data source changed.
//
// Reuses useOrganization() and useAuth() exactly as they exist. No new hooks,
// no new tables, no migrations.
//
// Notes on this wiring:
//
// 1. useOrganization() only resolves organizationId when the current user
//    has role = 'owner' in organization_members (see useOrganization.ts).
//    That matches this page's expected use — only the Owner views Members —
//    so nothing extra is needed here, but it's worth naming: this page will
//    render nothing useful for a non-Owner Member, by the hook's own design.
//
// 2. The query excludes the Owner's own row from the list. Rationale: the
//    Owner isn't a "Member added under them" (per Operator Domain Boundary
//    v3 §1) — they're the person doing the managing, not a managed Member.
//    This is an assumption, not a locked decision — trivial to remove the
//    filter if you want the Owner to appear in their own list.
//
// 3. `revenue` and `status` are NOT present in organization_members or
//    profiles. Per instruction, these stay as placeholder values rather than
//    triggering a new table/migration — they are NOT wired to real analytics
//    yet. That's a later step, not this one.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Plus, BarChart3, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOrganization } from '../../lib/useOrganization';

interface OperatorMember {
  id: string;       // = organization_members.user_id
  name: string;
  email: string;
  revenue: number;                                        // placeholder — not wired yet
  status: 'connected' | 'no_analytics' | 'no_campaign';    // placeholder — not decided yet
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function statusLabel(status: OperatorMember['status']): { text: string; color: string } {
  switch (status) {
    case 'connected':    return { text: 'Connected',     color: 'text-emerald-400' };
    case 'no_analytics': return { text: 'No analytics',  color: 'text-amber-500'   };
    case 'no_campaign':  return { text: 'No campaign',   color: 'text-amber-500'   };
  }
}

export default function Members() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organizationId, loading: orgLoading } = useOrganization();

  const [members, setMembers] = useState<OperatorMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!organizationId) return;

    supabase
      .from('organization_members')
      .select('user_id, role, profiles(id, full_name, email, avatar_url)')
      .eq('organization_id', organizationId)
      .then(({ data, error }) => {
  console.log("=== MEMBERS RAW RESPONSE ===");
  console.log("error:", error);
  console.log("data:", data);

  if (error) {
    console.error('Failed to load members:', error);
    setLoading(false);
    return;
  }

  const rows = (data ?? [])
          // Exclude the Owner's own row — see file header note #2.
          .filter(row => row.role !== 'owner')
          .map(row => {
  console.log("ROW");
  console.log(row);

  console.log("PROFILE");
  console.log(row.profiles);
            // Supabase returns the joined relation as an object here since
            // user_id -> profiles.id is a many-to-one relationship.
            const profile = row.profiles as unknown as {
              id: string;
              full_name: string | null;
              email: string | null;
              avatar_url: string | null;
            } | null;

            return {
              id: row.user_id,
              name: profile?.full_name || profile?.email || 'Unnamed member',
              email: profile?.email || '',
              revenue: 0,                 // placeholder — not wired yet
              status: 'no_analytics' as const, // placeholder — not decided yet
            };
          });

        // ── POC: hardcoded UI entry for Alin ──────────────────────
        // This does NOT grant access by itself. It only makes her
        // show up in the list. Real authorization happens entirely
        // in is_operator_for_user() in the database — this array
        // has zero power to unlock her data.
        const alinPoc: OperatorMember = {
          id: 'cd180432-44c5-4a20-b778-66b7753191f0',
          name: 'Alin (POC)',
          email: 'alinospam2020@gmail.com',
          revenue: 0,
          status: 'no_analytics',
        };

        setMembers([...rows, alinPoc]);
        setLoading(false);
      });
  }, [organizationId]);

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  if (orgLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Loading…</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="label-caps !text-white text-lg">Members</h1>
        <Link
          to="/operator/members/invite"
          className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:border-zinc-500 hover:text-white transition-all"
        >
          <Plus size={13} /> Invite member
        </Link>
      </div>

      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search members"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      <section className="bento-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-900/10 flex justify-between">
          <h2 className="label-caps !text-white">All Members</h2>
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
            {filtered.length} of {members.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">
              {members.length === 0 ? 'No members yet' : 'No members match your search'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900/50">
            {filtered.map(m => {
              const status = statusLabel(m.status);
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-6 py-3 hover:bg-white/[0.015] transition-colors cursor-pointer"
                  onClick={() => navigate(`/operator/members/${m.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] font-black text-zinc-400">
                      {initials(m.name)}
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-zinc-200">{m.name}</p>
                      <p className="text-[9px] font-bold text-zinc-600">{m.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6" onClick={e => e.stopPropagation()}>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${status.color}`}>
                      {status.text}
                    </span>
                    <span className="text-sm font-black text-emerald-400 tabular-nums w-20 text-right">
                      ${m.revenue.toLocaleString()}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => navigate(`/operator/members/${m.id}`)}
                        className="p-2 border border-zinc-800 rounded-lg text-zinc-500 hover:text-white hover:border-zinc-700 transition-all"
                        aria-label={`View ${m.name}'s analytics`}
                      >
                        <BarChart3 size={13} />
                      </button>
                      <button
                        onClick={() => { /* TODO: remove confirmation via existing <Modal /> */ }}
                        className="p-2 border border-zinc-800 rounded-lg text-zinc-600 hover:text-red-400 hover:border-red-900 transition-all"
                        aria-label={`Remove ${m.name}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
