// ─────────────────────────────────────────────────────────────────────────────
// Members.tsx
//
// MOCK DATA ONLY. Search, Invite (nav to a page, not a modal), Member table.
//
// Intentionally NOT extracted into MemberTable / MemberRow / StatusBadge /
// ActionButtons components yet. Status values below (`connected` /
// `no_analytics` / `no_campaign`) are placeholders to unblock the UI —
// the real status vocabulary hasn't been decided, so don't treat this
// union type as settled; it's here only so the page renders something.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Plus, BarChart3, X } from 'lucide-react';

interface OperatorMember {
  id: string;
  name: string;
  email: string;
  revenue: number;
  status: 'connected' | 'no_analytics' | 'no_campaign'; // placeholder only, not decided
}

const mockMembers: OperatorMember[] = [
  { id: '1', name: 'John Doe',   email: 'john@gmail.com', revenue: 5420, status: 'connected' },
  { id: '2', name: 'Mary Reyes', email: 'mary@gmail.com', revenue: 3820, status: 'no_analytics' },
  { id: '3', name: 'Alex Kim',   email: 'alex@gmail.com', revenue: 2900, status: 'no_campaign' },
];

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
  const [search, setSearch] = useState('');

  const filtered = mockMembers.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

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
            {filtered.length} of {mockMembers.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">
              No members match your search
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
