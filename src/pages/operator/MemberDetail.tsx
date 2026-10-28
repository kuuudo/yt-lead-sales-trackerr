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
//
// MOBILE LAYOUT (UI only, no data/logic changes):
// Below the `md` breakpoint the stats become a full-width Revenue hero card
// plus a 2x2 grid for the other four stats, and the update-revenue row stacks
// with a full-width button. At `md` and above the layout is identical to the
// previous desktop version (5-column grid, right-aligned update row).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, DollarSign, Eye, ShoppingCart, PhoneCall, Mail, CalendarCheck, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganization } from '../../lib/useOrganization';
import { useViewing } from '../../lib/ViewingContext';
import { useAuth } from '../../lib/auth';
import { useMemberRevenues, formatMemberRevenue, formatMemberCount } from '../../services/analytics/memberRevenue';

// POC: single hardcoded target user, see is_operator_for_user() SQL bypass.
const ALIN_POC_ID = 'cd180432-44c5-4a20-b778-66b7753191f0';
// Kaksi's privileged operator identity — server-side enforcement lives in
// is_operator_for_user() and the RLS on kaksi_operator_access. This
// constant here is UI-branching only.
const KAKSI_UUID = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14';



interface MemberDetailData {
  id: string;
  name: string;
  email: string;
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
  const { user } = useAuth();
  const { enterViewing } = useViewing();

  const [member, setMember] = useState<MemberDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [enteringViewing, setEnteringViewing] = useState(false);
  const [viewingError, setViewingError] = useState<string | null>(null);
  const { byMember, update: updateRevenue } = useMemberRevenues(member ? [member.id] : []);

  useEffect(() => {
    if (!organizationId || !id) return;

    // ── POC bypass: Alin does not need a row in the current Operator's
    // organization_members. Load her real profile directly instead.
    // Real authorization still happens later — enterViewing() calls
    // resolve_member_organization() -> is_operator_for_user(), which
    // already has the matching UUID bypass deployed in SQL. This branch
    // only decides whether the page RENDERS; it grants nothing itself.
    if (id === ALIN_POC_ID) {
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', ALIN_POC_ID)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) {
            setNotFound(true);
            setLoading(false);
            return;
          }
          setMember({
            id: data.id,
            name: data.full_name || 'Unnamed member',
            email: data.email || '',
            views: 0,
            conversions: 0,
            ctr: 0,
          });
          setLoading(false);
        });
      return;
    }

    // ── Kaksi branch: table-driven, not UUID-specific. Any target with
    // an ACTIVE row in kaksi_operator_access renders here, loaded from
    // profiles directly — same shape as the Alin branch above. This
    // block only decides whether the page RENDERS; real authorization
    // still happens later via enterViewing() -> resolve_member_organization()
    // -> is_operator_for_user(), which has the matching table-gated
    // branch deployed in SQL (Step 2). RLS on kaksi_operator_access
    // means a non-Kaksi caller gets zero rows back from this query no
    // matter what id is in the URL — this if-check is UI convenience,
    // not the security boundary.
    if (user?.id === KAKSI_UUID) {
      supabase
        .from('kaksi_operator_access')
        .select('target_user_id')
        .eq('target_user_id', id)
        .eq('status', 'active')
        .maybeSingle()
        .then(({ data: accessRow, error: accessError }) => {
          if (accessError || !accessRow) {
            setNotFound(true);
            setLoading(false);
            return;
          }
          supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', id)
            .maybeSingle()
            .then(({ data, error }) => {
              if (error || !data) {
                setNotFound(true);
                setLoading(false);
                return;
              }
              setMember({
                id: data.id,
                name: data.full_name || 'Unnamed member',
                email: data.email || '',
                views: 0,
                conversions: 0,
                ctr: 0,
              });
              setLoading(false);
            });
        });
      return;
    }

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
          name: profile?.full_name || 'Unnamed member',
          email: profile?.email || '',
          views: 0,         // placeholder — not wired yet
          conversions: 0,   // placeholder — not wired yet
          ctr: 0,            // placeholder — not wired yet
        });
        setLoading(false);
      });
  }, [organizationId, id, user?.id]);

  const handleViewAccount = async () => {
    if (!member) return;
    setViewingError(null);
    setEnteringViewing(true);
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
      navigate('/tree');
    } catch (err: any) {
      setViewingError(err.message || 'Could not enter viewing mode.');
    } finally {
      setEnteringViewing(false);
    }
  };

  if (orgLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-20 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Loading…</p>
      </div>
    );
  }

  if (notFound || !member) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-20 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">
          Member not found
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-5 md:space-y-6 overflow-x-hidden">
      <button
        onClick={() => navigate('/operator/members')}
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors"
      >
        <ChevronLeft size={13} /> Back to members
      </button>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 shrink-0 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-sm font-black text-zinc-300">
          {initials(member.name)}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-black text-white truncate">{member.name}</h1>
          <p className="text-[10px] font-bold text-zinc-600 truncate">{member.email}</p>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────
          Mobile: Revenue spans both columns (hero), the other four sit in a
          2x2 grid. md and up: back to the original 5-column row. */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Revenue',       value: formatMemberRevenue(byMember[member.id]),                      icon: DollarSign,    color: 'text-emerald-400', hero: true },
          { label: 'Purchases',     value: formatMemberCount(byMember[member.id], 'purchases'),           icon: ShoppingCart,  color: 'text-white',       hero: false },
          { label: 'Sales Calls',   value: formatMemberCount(byMember[member.id], 'salesCalls'),          icon: PhoneCall,     color: 'text-white',       hero: false },
          { label: 'Newsletter',    value: formatMemberCount(byMember[member.id], 'newsletterOptins'),    icon: Mail,          color: 'text-white',       hero: false },
          { label: 'Consultations', value: formatMemberCount(byMember[member.id], 'consultations'),       icon: CalendarCheck, color: 'text-white',       hero: false },
        ].map(card => (
          <div
            key={card.label}
            className={`bento-card min-w-0 flex flex-col justify-between ${
              card.hero
                ? 'col-span-2 md:col-span-1 py-5 md:py-6 px-4 min-h-[96px] md:min-h-[100px]'
                : 'py-4 md:py-6 px-4 min-h-[88px] md:min-h-[100px]'
            }`}
          >
            <span className="label-caps !text-zinc-600">{card.label}</span>
            <div className="flex items-center justify-between gap-2 mt-auto">
              <span className={`font-black truncate ${card.color} ${card.hero ? 'text-3xl md:text-xl' : 'text-xl'}`}>
                {card.value}
              </span>
              <card.icon size={card.hero ? 20 : 16} className={`${card.color} opacity-40 shrink-0`} />
            </div>
          </div>
        ))}
      </section>

      {/* ── Update revenue row ───────────────────────────────────────────
          Mobile: stacked, button full width. md and up: original
          right-aligned single row. */}
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-end md:gap-3 -mt-2 md:-mt-3">
        {byMember[member.id]?.result?.asOf && (
          <span className="text-[9px] font-bold text-zinc-600">
            Revenue as of {new Date(byMember[member.id]!.result!.asOf!).toLocaleString()}
          </span>
        )}
        {byMember[member.id]?.error && (
          <span className="text-[9px] font-bold text-red-500">{byMember[member.id]!.error}</span>
        )}
        <button
          onClick={() => updateRevenue(member.id)}
          disabled={byMember[member.id]?.updating || byMember[member.id]?.loading}
          className="w-full md:w-auto justify-center flex items-center gap-2 px-3 py-2.5 md:py-2 border border-zinc-800 rounded-lg text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-600 transition-all disabled:opacity-50"
        >
          <RefreshCw size={13} className={byMember[member.id]?.updating ? 'animate-spin' : ''} />
          {byMember[member.id]?.updating ? 'Updating…' : 'Update revenue'}
        </button>
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <section className="bento-card p-0 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-zinc-900 bg-zinc-900/10">
          <h2 className="label-caps !text-white">Quick actions</h2>
        </div>
        <div className="p-4 md:p-6 space-y-3">
          {/* Replaces the previous three disabled placeholder buttons. Once
              viewing mode is entered, the member's Dashboard, Campaigns,
              Videos, Assets, Analytics, and Workspace pages are all
              reachable through normal navigation — no separate per-page
              quick action is needed. */}
          <button
            onClick={handleViewAccount}
            disabled={enteringViewing}
            className="w-full flex items-center gap-2 justify-center px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-200 hover:border-zinc-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enteringViewing ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
            View account
          </button>
          {viewingError && (
            <p className="text-[10px] font-bold text-red-500 text-center">{viewingError}</p>
          )}
        </div>
      </section>
    </div>
  );
}