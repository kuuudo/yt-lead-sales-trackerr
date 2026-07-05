import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Mail, Rocket, Loader2, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  listOrgAssignments,
  listMyCollaborations,
  listMyInvitations,
  listMyPromotions,
  type AssignmentSummary,
  type InvitationSummary,
  type PromotionSummary,
} from '../services/assignment/collaborationHub';

type Tab = 'assignments' | 'invitations' | 'promotions';

const TABS: { key: Tab; label: string; icon: typeof Briefcase }[] = [
  { key: 'assignments', label: 'Assignments', icon: Briefcase },
  { key: 'invitations', label: 'Invitations', icon: Mail },
  { key: 'promotions', label: 'My Promotions', icon: Rocket },
];

export default function Marketplace() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('assignments');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [promotions, setPromotions] = useState<PromotionSummary[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not signed in');

        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', user.id)
          .single();

        const { data: membership } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        const [orgAssignments, myCollabs, myInvites, myPromos] = await Promise.all([
          membership?.organization_id ? listOrgAssignments(membership.organization_id) : Promise.resolve([]),
          listMyCollaborations(user.id),
          profile?.email ? listMyInvitations(profile.email) : Promise.resolve([]),
          listMyPromotions(user.id),
        ]);

        // De-dupe in case the current user is both the org creator and a collaborator.
        const byId = new Map<string, AssignmentSummary>();
        [...orgAssignments, ...myCollabs].forEach(a => byId.set(a.id, a));

        setAssignments(Array.from(byId.values()));
        setInvitations(myInvites);
        setPromotions(myPromos);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load Collaboration Hub');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-red-600" />
          <h1 className="text-2xl font-bold">Marketplace</h1>
        </div>
        <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest mb-8">
          Collaboration Hub
        </p>

        <div className="flex gap-2 mb-8 border-b border-zinc-800">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                tab === key
                  ? 'text-white border-red-600'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <div className="flex justify-end mb-6">
          <button
            onClick={() => navigate('/marketplace/assignments/new')}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
          >
            <Plus size={14} />
            Create Assignment
          </button>
        </div>
        
        {loading && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Loader2 className="animate-spin" size={16} /> Loading…
          </div>
        )}

        {error && (
          <div className="text-red-500 text-sm border border-red-900 bg-red-950/30 rounded-lg p-4">
            {error}
          </div>
        )}

        {!loading && !error && tab === 'assignments' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {assignments.length === 0 && <EmptyState label="No assignments yet" />}
            {assignments.map(a => (
              <button
                key={a.id}
                onClick={() => navigate(`/marketplace/assignments/${a.id}`)}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {a.status}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                    {a.visibility}
                  </span>
                </div>
                <h3 className="font-bold text-white">{a.title}</h3>
                {a.description && (
                  <p className="text-zinc-500 text-sm mt-1 line-clamp-2">{a.description}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {!loading && !error && tab === 'invitations' && (
          <div className="space-y-3">
            {invitations.length === 0 && <EmptyState label="No pending invitations" />}
            {invitations.map(inv => (
              <button
                key={inv.id}
                onClick={() => navigate(`/marketplace/assignments/${inv.assignment_id}`)}
                className="w-full text-left flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
              >
                <div>
                  <h3 className="font-bold text-white">{inv.assignment?.title ?? 'Assignment'}</h3>
                  <p className="text-zinc-500 text-xs mt-1">Invited {new Date(inv.created_at).toLocaleDateString()}</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                  Pending
                </span>
              </button>
            ))}
          </div>
        )}

        {!loading && !error && tab === 'promotions' && (
          <div className="space-y-3">
            {promotions.length === 0 && <EmptyState label="No promotions yet" />}
            {promotions.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-5"
              >
                <div>
                  <h3 className="font-bold text-white">{p.campaign?.campaign_name ?? 'Campaign'}</h3>
                  <p className="text-zinc-500 text-xs mt-1">
                    Created {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="col-span-full text-zinc-600 text-sm border border-dashed border-zinc-800 rounded-xl p-8 text-center">
      {label}
    </div>
  );
}
