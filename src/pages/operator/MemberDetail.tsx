// ─────────────────────────────────────────────────────────────────────────────
// MemberDetail.tsx
//
// MOCK DATA ONLY, looked up by :id from the same mock shape Members.tsx uses.
//
// Stat card JSX below is intentionally duplicated from Overview.tsx rather
// than imported from a shared component. Per YAGNI, wait until this is
// confirmed stable in both places before extracting — don't decide the
// shared shape prematurely.
//
// Assets / Campaigns quick actions are stubbed (disabled) — those domains
// aren't wired to member-scoped views yet. Analytics is the only live action,
// and will eventually reuse InDepthAnalyticsTest.tsx filtered by this member.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, BarChart3, Folder, Megaphone, DollarSign, Eye, Target, Percent } from 'lucide-react';

interface OperatorMember {
  id: string;
  name: string;
  email: string;
  revenue: number;
  views: number;
  conversions: number;
  ctr: number;
}

const mockMembers: OperatorMember[] = [
  { id: '1', name: 'John Doe',   email: 'john@gmail.com', revenue: 5420, views: 18200, conversions: 42, ctr: 4.1 },
  { id: '2', name: 'Mary Reyes', email: 'mary@gmail.com', revenue: 3820, views: 12400, conversions: 31, ctr: 3.6 },
  { id: '3', name: 'Alex Kim',   email: 'alex@gmail.com', revenue: 2900, views: 9800,  conversions: 22, ctr: 3.1 },
];

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const member = mockMembers.find(m => m.id === id);

  if (!member) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">
          Member not found
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <button
        onClick={() => navigate('/operator/members')}
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors"
      >
        <ChevronLeft size={13} /> Back to members
      </button>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-sm font-black text-zinc-300">
          {initials(member.name)}
        </div>
        <div>
          <h1 className="text-lg font-black text-white">{member.name}</h1>
          <p className="text-[10px] font-bold text-zinc-600">{member.email}</p>
        </div>
      </div>

      {/* ── Stats (duplicated from Overview.tsx — see file header note) ───── */}
      <section className="grid grid-cols-4 gap-3">
        {[
          { label: 'Revenue',     value: `$${member.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-400' },
          { label: 'Views',       value: member.views.toLocaleString(),         icon: Eye,         color: 'text-white' },
          { label: 'Conversions', value: member.conversions,                    icon: Target,      color: 'text-white' },
          { label: 'CTR',         value: `${member.ctr}%`,                       icon: Percent,     color: 'text-white' },
        ].map(card => (
          <div key={card.label} className="bento-card py-6 px-4 flex flex-col justify-between min-h-[100px]">
            <span className="label-caps !text-zinc-600">{card.label}</span>
            <div className="flex items-center justify-between mt-auto">
              <span className={`text-xl font-black ${card.color}`}>{card.value}</span>
              <card.icon size={16} className={`${card.color} opacity-40`} />
            </div>
          </div>
        ))}
      </section>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <section className="bento-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-900/10">
          <h2 className="label-caps !text-white">Quick actions</h2>
        </div>
        <div className="grid grid-cols-3 gap-3 p-6">
          <button className="flex items-center gap-2 justify-center px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-200 hover:border-zinc-500 transition-all">
            <BarChart3 size={13} /> Analytics
          </button>
          <button disabled className="flex items-center gap-2 justify-center px-4 py-3 bg-zinc-950 border border-zinc-900 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-700 cursor-not-allowed">
            <Folder size={13} /> Assets
          </button>
          <button disabled className="flex items-center gap-2 justify-center px-4 py-3 bg-zinc-950 border border-zinc-900 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-700 cursor-not-allowed">
            <Megaphone size={13} /> Campaigns
          </button>
        </div>
      </section>
    </div>
  );
}
