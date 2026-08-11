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
import { Users, DollarSign, Target, Activity, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useOrganization } from '../../lib/useOrganization';
import OnboardingVideoSection04 from '../../components/onboarding/OnboardingVideo/OnboardingVideoSection04';

interface OperatorMember {
  id: string;
  name: string;
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
  const { organizationId, loading: orgLoading } = useOrganization();
  const [members, setMembers] = useState<OperatorMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
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
              revenue: 0,       // placeholder — not wired yet
              conversions: 0,   // placeholder — not wired yet
              cvr: 0,            // placeholder — not wired yet
            };
          });

        setMembers(rows);
        setLoading(false);
      });
  }, [organizationId]);

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
        <Link
          to="/operator/members"
          className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:border-zinc-500 hover:text-white transition-all"
        >
          Manage members <ArrowRight size={13} />
        </Link>
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
  className="fixed top-4 right-4 z-[20001] w-10 h-10 rounded-full bg-zinc-900 text-white border border-zinc-700 flex items-center justify-center text-lg shadow-lg"
  aria-label="Close video"
>
  ✕
</button>
*/}
    <OnboardingVideoSection04
      onSkip={() => setShowOnboarding(false)}
      onComplete={() => setShowOnboarding(false)}
    />
  </div>
)}
    </div>
  );
}
