// ─────────────────────────────────────────────────────────────────────────────
// Overview.tsx
//
// Team KPIs and Top Performers now wired to real data via
// organization_members + profiles — same query pattern as Members.tsx.
//
// Recent Activity is STILL MOCK. It was not part of this step's scope
// (Team KPIs / Top Performers only), and its data doesn't come from
// organization_members/profiles anyway — it would need assets/
// assignment_collaborators/promotions queries, which is a separate step.
// Flagging this explicitly rather than silently leaving it mock.
//
// Same placeholder caveat as Members.tsx: revenue/conversions/cvr are 0
// for every member until analytics wiring happens later. KPIs and Top
// Performers will render, but with real member count and $0 numbers —
// that's correct, not broken.
//
// Owner is excluded from the member set, same as Members.tsx, per your
// confirmed decision.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { Users, DollarSign, Target, Activity, Search, Plus, BarChart3, X, Eye, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useOrganization } from '../../lib/useOrganization';
import { useViewing } from '../../lib/ViewingContext';
import { useAuth } from '../../lib/auth';
import { useTutorial } from '../../lib/tutorial-overlay';
import OnboardingVideoSection04 from '../../components/onboarding/OnboardingVideo/OnboardingVideoSection04';
import { workWithYourTeamGuide } from '../../lib/tutorials/workWithYourTeamGuide';
// POC: single hardcoded target user, same as Members.tsx.
// Kaksi's privileged operator identity — server-side enforcement lives in
// is_operator_for_user() and the RLS on kaksi_operator_access. This
// constant here is UI-branching only, not a security boundary.
const KAKSI_UUID = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14';

const ALIN_POC: { id: string; name: string; email: string } = {
  id: 'cd180432-44c5-4a20-b778-66b7753191f0',
  name: 'Alin (POC)',
  email: 'alinospam2020@gmail.com',
};

interface OperatorMember {
  id: string;
  name: string;
  email: string;
  revenue: number;      // placeholder — not wired yet
  conversions: number;  // placeholder — not wired yet
  cvr: number;           // placeholder — not wired yet
}

// Recent Activity stays mock — see file header note.
interface ActivityItem {
  id: string;
  memberName: string;
  action: string;
  timestamp: string;
}

const mockActivity: ActivityItem[] = [
  { id: 'a1', memberName: 'John', action: 'imported 2 assets',       timestamp: '5m ago' },
  { id: 'a2', memberName: 'Mary', action: 'accepted an assignment',  timestamp: '1d ago' },
  { id: 'a3', memberName: 'Alex', action: 'published 3 promotions',  timestamp: '2d ago' },
];

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function Overview() {
  const navigate = useNavigate();
  const { enterViewing } = useViewing();
  const { notify, start } = useTutorial();
  const { user } = useAuth();
  const { organizationId, loading: orgLoading } = useOrganization();
  const [members, setMembers] = useState<OperatorMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [enteringAccountId, setEnteringAccountId] = useState<string | null>(null);
  const [viewingError, setViewingError] = useState<string | null>(null);
  useEffect(() => {
    if (!organizationId) return;

    supabase
      .from('organization_members')
      .select('user_id, role, profiles(id, full_name, email)')
      .eq('organization_id', organizationId)
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load members:', error);
          setLoading(false);
          return;
        }

        const rows = (data ?? [])
          .filter(row => row.role !== 'owner') // exclude Owner, same as Members.tsx
          .map(row => {
            const profile = row.profiles as unknown as {
              id: string;
              full_name: string | null;
              email: string | null;
            } | null;

            return {
              id: row.user_id,
              name: profile?.full_name || 'Unnamed member',
              email: profile?.email || '',
              revenue: 0,       // placeholder — not wired yet
              conversions: 0,   // placeholder — not wired yet
              cvr: 0,            // placeholder — not wired yet
            };
          });

        // POC: same pattern as Members.tsx — UI-only entry, grants no
        // access by itself. Real authorization is enforced later by
        // is_operator_for_user()'s matching SQL bypass when View account
        // is clicked (enterViewing() -> resolve_member_organization()).
        const alinPoc: OperatorMember = {
          ...ALIN_POC,
          revenue: 0,
          conversions: 0,
          cvr: 0,
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
                  revenue: 0,       // placeholder — not wired yet
                  conversions: 0,   // placeholder — not wired yet
                  cvr: 0,            // placeholder — not wired yet
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

  if (orgLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Loading…</p>
      </div>
    );
  }

  const memberCount = members.length;
  const totalRevenue = members.reduce((sum, m) => sum + m.revenue, 0);
  const totalConversions = members.reduce((sum, m) => sum + m.conversions, 0);
  const avgCvr = members.length
    ? (members.reduce((sum, m) => sum + m.cvr, 0) / members.length).toFixed(1)
    : '0.0';

  const topPerformers = [...members].sort((a, b) => b.revenue - a.revenue).slice(0, 3);

  const filteredMembers = members.filter(m =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const handleViewAccount = async (member: OperatorMember) => {
    setViewingError(null);
    setEnteringAccountId(member.id);
    try {
      // ── Audit log: internal-only record of Kaksi viewing sessions.
      // Only inserted when the caller is Kaksi — RLS on kaksi_viewing_log
      // would reject an insert from anyone else anyway, but skipping the
      // call entirely for normal operators avoids a pointless request.
      // A logging failure does not block viewing — it's recorded
      // best-effort and surfaced only to the console, not the user.
      if (user?.id === KAKSI_UUID) {
        const { error: logError } = await supabase
          .from('kaksi_viewing_log')
          .insert({ target_user_id: member.id });
        if (logError) {
          console.error('Failed to write Kaksi viewing log:', logError);
        }
      }
      await enterViewing(member.id, member.name);
      if (member.id === ALIN_POC.id) {
        notify('operator-alin-viewing-entered');
      }
      navigate('/dashboard');
    } catch (err: any) {
      setViewingError(err.message || 'Could not enter viewing mode.');
    } finally {
      setEnteringAccountId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between mb-2">
  <div className="flex items-center gap-3">
    <h1 className="label-caps !text-white text-lg">Operator Overview</h1>
    <button
      onClick={() => setShowOnboarding(true)}
      className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-600 text-white text-sm flex items-center justify-center hover:bg-zinc-700 transition-colors"
      aria-label="Watch onboarding"
    >
      🦊
    </button>
  </div>
        
      </div>

      {/* ── Team KPI cards — wired ──────────────────────────────────────── */}
      <section className="grid grid-cols-4 gap-3">
        {[
          { label: 'Members',     value: memberCount,             icon: Users,       color: 'text-zinc-500' },
          { label: 'Revenue',     value: `$${totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-400' },
          { label: 'Conversions', value: totalConversions,        icon: Target,      color: 'text-zinc-500' },
          { label: 'Avg CVR',     value: `${avgCvr}%`,             icon: Activity,    color: 'text-zinc-500' },
        ].map(card => (
          <div key={card.label} className="bento-card py-6 px-4 flex flex-col justify-between min-h-[100px]">
            <span className="label-caps !text-zinc-600">{card.label}</span>
            <div className="flex items-center justify-between mt-auto">
              <span className={`text-xl font-black ${card.color === 'text-emerald-400' ? 'text-emerald-400' : 'text-white'}`}>
                {card.value}
              </span>
              <card.icon size={16} className={`${card.color} opacity-40`} />
            </div>
          </div>
        ))}
      </section>

      {/* ── All Members — moved here from Members.tsx ─────────────────────── */}
      <section className="bento-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-900/10 flex items-center justify-between">
          <h2 className="label-caps !text-white">All Members</h2>
          <Link
            to="/operator/members/invite"
            data-tutorial-id="operator-invite-member"
            className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:border-zinc-500 hover:text-white transition-all"
          >
            <Plus size={13} /> Invite member
          </Link>
        </div>

        <div className="px-6 pt-4">
          <div className="relative max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Search members"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">
              {members.length === 0 ? 'No members yet' : 'No members match your search'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900/50 mt-4">
            {filteredMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] font-black text-zinc-400">
                    {initials(m.name)}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-zinc-200">{m.name}</p>
                    <p className="text-[9px] font-bold text-zinc-600">{m.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <span className="text-sm font-black text-emerald-400 tabular-nums w-20 text-right">
                    ${m.revenue.toLocaleString()}
                  </span>
                  <button
                    onClick={() => handleViewAccount(m)}
                    disabled={enteringAccountId === m.id}
                    data-tutorial-id={m.id === ALIN_POC.id ? 'operator-view-account-alin' : undefined}
                    className="flex items-center gap-2 px-3 py-2 border border-zinc-800 rounded-lg text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-600 transition-all disabled:opacity-50"
                  >
                    {enteringAccountId === m.id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                    View account
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
            ))}
          </div>
        )}
        {viewingError && (
          <p className="text-[10px] font-bold text-red-500 text-center py-3">{viewingError}</p>
        )}
      </section>

      {/* ── Top Performers — wired ──────────────────────────────────────── */}
      <section className="bento-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-900/10 flex items-center justify-between">
          <h2 className="label-caps !text-white">Top Performers</h2>
          <Link
            to="/operator/members"
            className="text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            View all members →
          </Link>
        </div>
        {topPerformers.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">No members yet</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900/50">
            {topPerformers.map((m, idx) => (
              <div key={m.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black tabular-nums text-zinc-600 w-4">#{idx + 1}</span>
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] font-black text-zinc-400">
                    {initials(m.name)}
                  </div>
                  <span className="text-[11px] font-bold text-zinc-200">{m.name}</span>
                </div>
                <div className="flex items-center gap-6">
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
                    CVR <span className="text-zinc-300">{m.cvr}%</span>
                  </span>
                  <span className="text-sm font-black text-emerald-400 tabular-nums">
                    ${m.revenue.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Recent Activity — STILL MOCK, see file header note ───────────── */}
      <section className="bento-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-900/10">
          <h2 className="label-caps !text-white">Recent Activity</h2>
        </div>
        <div className="divide-y divide-zinc-900/50">
          {mockActivity.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-6 py-3">
              <div className="w-6 h-6 rounded-md bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[8px] font-black text-zinc-400 flex-shrink-0">
                {initials(item.memberName)}
              </div>
              <span className="text-[10px] text-zinc-400 font-bold">
                {item.memberName} {item.action}
              </span>
              <span className="text-[8px] text-zinc-700 font-bold ml-auto whitespace-nowrap">
                {item.timestamp}
              </span>
            </div>
          ))}
        </div>
      </section>
      {showOnboarding && (
  <div className="fixed inset-0 z-[20000] bg-white overflow-auto">
    {/* 
<button
  onClick={() => setShowOnboarding(false)}
  className="fixed top-4 right-4 z-[20001] w-10 h-10 rounded-full bg-white text-black border border-zinc-200 flex items-center justify-center text-lg shadow-lg"
  aria-label="Close video"
>
  ✕
</button>
*/}
    <button
      onClick={() => {
        setShowOnboarding(false);
        start(workWithYourTeamGuide);
      }}
      className="fixed top-4 left-4 z-[20001] max-w-[calc(100vw-32px)] sm:max-w-[280px] flex items-start gap-2 bg-white text-black border border-zinc-200 rounded-2xl text-left px-4 py-3 shadow-lg hover:bg-zinc-800 transition-colors"
    >
      <span className="text-base leading-none shrink-0">🎓</span>
      <span>
        <span className="block text-[10px] font-black uppercase tracking-widest mb-1">
          First Team Setup — Do It Yourself (Just a Demo)
        </span>
        <span className="block text-[10px] font-normal normal-case text-zinc-400 leading-snug">
          Don't worry if you don't have a teammate yet — this is just a demo. We'll add a creator account so you can see their account from an Operator's perspective.
        </span>
      </span>
    </button>
    <OnboardingVideoSection04
      onSkip={() => setShowOnboarding(false)}
      onComplete={() => setShowOnboarding(false)}
    />
  </div>
)}
    </div>
  );
}
