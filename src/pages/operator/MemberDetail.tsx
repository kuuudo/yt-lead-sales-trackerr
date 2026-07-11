// ─────────────────────────────────────────────────────────────────────────────
// MemberDetail.tsx
//
// Real data via organization_members + profiles, scoped by both
// organization_id (from useOrganization) AND the :id route param — so this
// page can only ever load a member who actually belongs to the current
// Owner's organization, not an arbitrary user_id someone types into the URL.
//
// Data shape kept consistent with Members.tsx: id/name/email derived the
// same way (full_name -> email -> 'Unnamed member' fallback). Additional
// fields this page needs (views, conversions, ctr) that Members.tsx doesn't
// use are placeholders, same convention as revenue's placeholder there.
//
// NOT extracting a shared hook yet, per your instruction — this is now the
// third page running a similar organization_members + profiles query
// (Overview, Members, MemberDetail). Flagged at the bottom of this file's
// summary, not acted on.
//
// Analytics quick-action is intentionally NOT wired to InDepthAnalyticsTest
// yet — that component filters by useAuth()'s own user.id, not an arbitrary
// member. Reusing it here would require adding a memberId prop/filter to
// that component, which is a change to existing code, not a data-source
// swap. Left as a flagged blocker rather than silently faked.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, BarChart3, Folder, Megaphone, DollarSign, Eye, Target, Percent } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganization } from '../../lib/useOrganization';

interface MemberDetailData {
  id: string;
  name: string;
  email: string;
  revenue: number;      // placeholder — not wired yet
  views: number;        // placeholder — not wired yet
  conversions: number;  // placeholder — not wired yet
  ctr: number;           // placeholder — not wired yet
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organizationId, loading: orgLoading } = useOrganization();

  const [member, setMember] = useState<MemberDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!organizationId || !id) return;

    supabase
      .from('organization_members')
      .select('user_id, role, profiles(id, full_name, email)')
      .eq('organization_id', organizationId)
      .eq('user_id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load member:', error);
          setLoading(false);
          return;
        }

        if (!data) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const profile = data.profiles as unknown as {
          id: string;
          full_name: string | null;
          email: string | null;
        } | null;

        setMember({
          id: data.user_id,
          name: profile?.full_name || profile?.email || 'Unnamed member',
          email: profile?.email || '',
          revenue: 0,       // placeholder — not wired yet
          views: 0,         // placeholder — not wired yet
          conversions: 0,   // placeholder — not wired yet
          ctr: 0,            // placeholder — not wired yet
        });
        setLoading(false);
      });
  }, [organizationId, id]);

  if (orgLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Loading…</p>
      </div>
    );
  }

  if (notFound || !member) {
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

      {/* ── Stats (placeholders — see file header) ─────────────────────── */}
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
          {/* Not wired — see file header note on InDepthAnalyticsTest needing a memberId filter */}
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
