// ─────────────────────────────────────────────────────────────────────────────
// Members.tsx
//
// Real data via organization_members + profiles. Data logic unchanged —
// this version only changes the layout so it fits phone screens:
//   - tighter page/card padding on mobile (px-4, then px-6 from `sm:` up)
//   - Invite button collapses to a "+" icon on mobile
//   - member rows stack on mobile (identity on top, revenue + actions below)
//     and return to the single-line layout from `sm:` up
//   - initials() now ignores "(POC)" style parentheticals
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
import { Search, Plus, BarChart3, X, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOrganization } from '../../lib/useOrganization';
import { useMemberRevenues, formatMemberRevenue } from '../../services/analytics/memberRevenue';

// Kaksi's privileged operator identity — server-side enforcement lives in
// is_operator_for_user() and the RLS on kaksi_operator_access. This
// constant here is UI-branching only (which query to run), not a
// security boundary.
const KAKSI_UUID = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14';

interface OperatorMember {
  id: string;       // = organization_members.user_id
  name: string;
  email: string;
  status: 'connected' | 'no_analytics' | 'no_campaign';    // placeholder — not decided yet
}

function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, '') // drop "(POC)" etc.
    .trim()
    .split(/\s+/)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
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
  const { byMember, update: updateRevenue } = useMemberRevenues(members.map(m => m.id));

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
          status: 'no_analytics',
        };

        // ── Kaksi branch: third data source, only queried when the
        // logged-in user is Kaksi. This if-check controls UI visibility
        // only — real authorization is enforced by RLS on
        // kaksi_operator_access (SELECT is Kaksi-only), so a non-Kaksi
        // caller's query would return zero rows regardless of this check.
        if (user?.id === KAKSI_UUID) {
          supabase
            .from('kaksi_operator_access')
            .select('target_user_id, profiles(id, full_name, email)')
            .eq('status', 'active')
            .then(({ data: kaksiRows, error: kaksiError }) => {
              if (kaksiError) {
                console.error('Failed to load Kaksi-added members:', kaksiError);
                setMembers([...rows, alinPoc]);
                setLoading(false);
                return;
              }

              const kaksiMembers: OperatorMember[] = (kaksiRows ?? []).map(row => {
                const profile = row.profiles as unknown as {
                  id: string;
                  full_name: string | null;
                  email: string | null;
                } | null;

                return {
                  id: row.target_user_id,
                  name: profile?.full_name || profile?.email || 'Unnamed member',
                  email: profile?.email || '',
                  status: 'no_analytics' as const,  // placeholder — not decided yet
                };
              });

              setMembers([...rows, alinPoc, ...kaksiMembers]);
              setLoading(false);
            });
          return;
        }

        setMembers([...rows, alinPoc]);
        setLoading(false);
      });
  }, [organizationId, user?.id]);

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  if (orgLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Loading…</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <h1 className="label-caps !text-white text-lg">Members</h1>
        <Link
          to="/operator/members/invite"
          aria-label="Invite member"
          className="shrink-0 whitespace-nowrap flex items-center gap-2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] font-black uppercase tracking-widest px-3 sm:px-4 py-2.5 rounded-xl hover:border-zinc-500 hover:text-white transition-all"
        >
          <Plus size={13} />
          <span className="hidden sm:inline">Invite member</span>
        </Link>
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search members"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      <section className="bento-card p-0 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-zinc-900 bg-zinc-900/10 flex justify-between">
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
            {filtered.map(m => (
              <div
                key={m.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-3 hover:bg-white/[0.015] transition-colors cursor-pointer"
                onClick={() => navigate(`/operator/members/${m.id}`)}
              >
                {/* Identity */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] font-black text-zinc-400">
                    {initials(m.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-zinc-200 truncate">{m.name}</p>
                    <p className="text-[9px] font-bold text-zinc-600 truncate">{m.email}</p>
                  </div>
                </div>

                {/* Revenue + actions */}
                <div
                  className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 pl-11 sm:pl-0"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="text-sm font-black text-emerald-400 tabular-nums sm:w-20 sm:text-right">
                    {formatMemberRevenue(byMember[m.id])}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateRevenue(m.id)}
                      disabled={byMember[m.id]?.updating || byMember[m.id]?.loading}
                      title={byMember[m.id]?.error ?? 'Update revenue'}
                      aria-label={`Update ${m.name}'s revenue`}
                      className="p-2 border border-zinc-800 rounded-lg text-zinc-500 hover:text-white hover:border-zinc-700 transition-all disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={byMember[m.id]?.updating ? 'animate-spin' : ''} />
                    </button>
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
            ))}
          </div>
        )}
      </section>
    </div>
  );
}