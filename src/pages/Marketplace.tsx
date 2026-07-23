import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Mail, Rocket, Loader2, Plus, Archive, ArchiveRestore, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';
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
import {
  getArchivedAssignmentIdsForUser,
  archiveAssignmentForUser,
  restoreAssignmentForUser,
} from '../services/assignment/assignmentArchive';

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

  // Track the current user id — needed for archive/restore actions, which
  // are scoped to (assignment_id, this user's id) only. See
  // services/assignment/assignmentArchive.ts.
  const [userId, setUserId] = useState<string | null>(null);

  // Personal archive state — Map<assignment_id, archived_at>, scoped to
  // the current user only. Ali and WebMood each get their own Map;
  // archiving never mutates the assignment row itself, so it can never
  // affect what the other party sees.
  const [archivedMap, setArchivedMap] = useState<Map<string, string>>(new Map());
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<string[]>([]);
  const [restoring, setRestoring] = useState(false);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'info' | 'danger' | 'success';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'info' });

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info') => {
    setModalConfig({ isOpen: true, title, message, variant, onConfirm: undefined });
  };

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    variant: 'info' | 'danger' | 'success' = 'danger'
  ) => {
    setModalConfig({ isOpen: true, title, message, variant, onConfirm });
  };

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

        setUserId(user.id);

        const [orgAssignments, myCollabs, myInvites, myPromos, archivedIds] = await Promise.all([
          membership?.organization_id ? listOrgAssignments(membership.organization_id) : Promise.resolve([]),
          listMyCollaborations(user.id),
          profile?.email ? listMyInvitations(profile.email) : Promise.resolve([]),
          listMyPromotions(user.id),
          getArchivedAssignmentIdsForUser(user.id),
        ]);

        // De-dupe in case the current user is both the org creator and a collaborator.
        const byId = new Map<string, AssignmentSummary>();
        [...orgAssignments, ...myCollabs].forEach(a => byId.set(a.id, a));

        setAssignments(Array.from(byId.values()));
        setInvitations(myInvites);
        setPromotions(myPromos);
        setArchivedMap(archivedIds);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load Collaboration Hub');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Archive is only ever triggered by an explicit user click below — there
  // is no automatic/time-based archiving anywhere. This only ever writes
  // a row scoped to (assignment_id, the CURRENT user's id) — it can never
  // affect the other party's view of the same assignment, and never
  // touches assignment status, collaborators, invitations, or promotions.
  const handleArchiveAssignment = (assignment: AssignmentSummary) => {
    if (!userId) return;
    showConfirm(
      'Archive Assignment?',
      'Archived assignments will be hidden from your active list. You can restore them anytime.',
      async () => {
        setArchivingId(assignment.id);
        try {
          await archiveAssignmentForUser(assignment.id, userId);
          setArchivedMap(prev => new Map(prev).set(assignment.id, new Date().toISOString()));
        } catch (err: any) {
          showAlert('Archive Failed', err.message || 'Could not archive this assignment.', 'danger');
        } finally {
          setArchivingId(null);
        }
      },
      'info'
    );
  };

  const openArchivedModal = () => {
    setSelectedArchivedIds([]);
    setShowArchivedModal(true);
  };

  const toggleArchivedSelection = (assignmentId: string) => {
    setSelectedArchivedIds(prev =>
      prev.includes(assignmentId) ? prev.filter(x => x !== assignmentId) : [...prev, assignmentId]
    );
  };

  const handleRestoreSelected = async () => {
    if (!userId || selectedArchivedIds.length === 0) return;
    setRestoring(true);
    try {
      await Promise.all(
        selectedArchivedIds.map(assignmentId => restoreAssignmentForUser(assignmentId, userId))
      );
      setArchivedMap(prev => {
        const next = new Map(prev);
        selectedArchivedIds.forEach(id => next.delete(id));
        return next;
      });
      setSelectedArchivedIds([]);
    } catch (err: any) {
      showAlert('Restore Failed', err.message, 'danger');
    } finally {
      setRestoring(false);
    }
  };

  const activeAssignments = assignments.filter(a => !archivedMap.has(a.id));
  const archivedAssignments = assignments.filter(a => archivedMap.has(a.id));

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
        <div className="flex justify-end items-center gap-3 mb-6">
          {tab === 'assignments' && (
            <button
              onClick={openArchivedModal}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
            >
              <Archive size={14} />
              Archived{archivedAssignments.length > 0 ? ` (${archivedAssignments.length})` : ''}
            </button>
          )}
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
            {activeAssignments.length === 0 && <EmptyState label="No assignments yet" />}
            {activeAssignments.map(a => (
              <div
                key={a.id}
                onClick={() => navigate(`/marketplace/assignments/${a.id}`)}
                className="relative group text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5 pr-12 hover:border-zinc-700 transition-colors cursor-pointer"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchiveAssignment(a);
                  }}
                  disabled={archivingId === a.id}
                  title="Archive"
                  className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                >
                  {archivingId === a.id ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                </button>
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
              </div>
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
              <button
                key={p.id}
                onClick={() => navigate(`/marketplace/promotions/${p.id}`)}
                className="w-full flex items-center justify-between text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
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
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Archived assignments modal — shows ONLY assignments the CURRENT
          user has personally archived. The same assignment can be Active
          for one party (e.g. the Marketer) and Archived for the other
          (e.g. the Sponsor); this list never reflects anyone else's
          state. */}
      <AnimatePresence>
        {showArchivedModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowArchivedModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Archive size={16} className="text-zinc-500" /> Archived Assignments
                </h2>
                <button
                  onClick={() => setShowArchivedModal(false)}
                  className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
                {archivedAssignments.length === 0 ? (
                  <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest text-center py-10">
                    No archived assignments
                  </p>
                ) : (
                  archivedAssignments.map(a => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedArchivedIds.includes(a.id)}
                        onChange={() => toggleArchivedSelection(a.id)}
                        className="w-4 h-4 rounded accent-white shrink-0"
                      />
                      <button
                        onClick={() => {
                          setShowArchivedModal(false);
                          navigate(`/marketplace/assignments/${a.id}`);
                        }}
                        className="text-sm text-zinc-200 flex-1 truncate text-left hover:text-white"
                      >
                        {a.title}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button
                disabled={selectedArchivedIds.length === 0 || restoring}
                onClick={handleRestoreSelected}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {restoring ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={14} />}
                Restore Selected{selectedArchivedIds.length > 0 ? ` (${selectedArchivedIds.length})` : ''}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
        onConfirm={modalConfig.onConfirm}
      />
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
