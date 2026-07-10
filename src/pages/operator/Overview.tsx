// ─────────────────────────────────────────────────────────────────────────────
// Overview.tsx
//
// Operator homepage. Team KPIs, Top Performers, Recent Activity.
// MOCK DATA ONLY — no Supabase calls yet. Swap `mockMembers` / `mockActivity`
// for real queries once Members.tsx's query shape is proven out.
//
// Intentionally NOT extracting a StatCard / TopPerformers / ActivityFeed
// component yet. Overview and MemberDetail will both want stat cards, but
// per YAGNI we wait until the UI is stable and duplication is confirmed
// before extracting — see matching comment in MemberDetail.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Users, DollarSign, Target, Activity } from 'lucide-react';

// ── Mock data (UI contract — matches the shape queries will eventually return) ──

interface OperatorMember {
  id: string;
  name: string;
  email: string;
  revenue: number;
  conversions: number;
  cvr: number;
}

interface ActivityItem {
  id: string;
  memberName: string;
  action: string;
  timestamp: string;
}

const mockMembers: OperatorMember[] = [
  { id: '1', name: 'John Doe',   email: 'john@gmail.com', revenue: 5420, conversions: 42, cvr: 24 },
  { id: '2', name: 'Mary Reyes', email: 'mary@gmail.com', revenue: 3820, conversions: 31, cvr: 17 },
  { id: '3', name: 'Alex Kim',   email: 'alex@gmail.com', revenue: 2900, conversions: 22, cvr: 14 },
];

const mockActivity: ActivityItem[] = [
  { id: 'a1', memberName: 'John', action: 'imported 2 assets',       timestamp: '5m ago' },
  { id: 'a2', memberName: 'Mary', action: 'accepted an assignment',  timestamp: '1d ago' },
  { id: 'a3', memberName: 'Alex', action: 'published 3 promotions',  timestamp: '2d ago' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function Overview() {
  // Aggregation is derived from mockMembers, same as it will be derived from
  // a real query later — keeps the mock path and real path identical in shape.
  const memberCount = mockMembers.length;
  const totalRevenue = mockMembers.reduce((sum, m) => sum + m.revenue, 0);
  const totalConversions = mockMembers.reduce((sum, m) => sum + m.conversions, 0);
  const avgCvr = mockMembers.length
    ? (mockMembers.reduce((sum, m) => sum + m.cvr, 0) / mockMembers.length).toFixed(1)
    : '0.0';

  const topPerformers = [...mockMembers].sort((a, b) => b.revenue - a.revenue).slice(0, 3);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <h1 className="label-caps !text-white text-lg mb-2">Operator Overview</h1>

      {/* ── Team KPI cards ────────────────────────────────────────────────── */}
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

      {/* ── Top Performers ────────────────────────────────────────────────── */}
      <section className="bento-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-900/10">
          <h2 className="label-caps !text-white">Top Performers</h2>
        </div>
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
      </section>

      {/* ── Recent Activity ───────────────────────────────────────────────── */}
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
    </div>
  );
}
