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
  listPromotedAssignmentIdsForUser,
  type AssignmentSummary,
  type InvitationSummary,
  type PromotionSummary,
} from '../services/assignment/collaborationHub';
import {
  getArchivedAssignmentIdsForUser,
  archiveAssignmentForUser,
  restoreAssignmentForUser,
} from '../services/assignment/assignmentArchive';
import {
  getArchivedPromotionIdsForUser,
  archivePromotionForUser,
  restorePromotionForUser,
} from '../services/promotion/promotionArchive';
import { marketplaceAssignmentsPageCache } from '../lib/marketplaceAssignmentsPageCache';
import { marketplacePromotionsPageCache } from '../lib/marketplacePromotionsPageCache';
import { marketplaceInvitationsPageCache } from '../lib/marketplaceInvitationsPageCache';
import OnboardingVideoSection03 from '../components/onboarding/OnboardingVideo/OnboardingVideoSection03';
import OnboardingVideoSection06 from '../components/onboarding/OnboardingVideo/OnboardingVideoSection06';
type Tab = 'assignments' | 'invitations' | 'promotions';

const TABS: { key: Tab; label: string; icon: typeof Briefcase }[] = [
  { key: 'assignments', label: 'Assignments', icon: Briefcase },
  { key: 'invitations', label: 'Invitations', icon: Mail },
  { key: 'promotions', label: 'My Promotions', icon: Rocket },
];

export default function Marketplace() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('promotions');
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Captured once at bootstrap, reused by loadAssignments/loadInvitations
  // when the user opens those tabs (so we don't repeat the getUser/profile/
  // membership lookup for every tab switch).
  
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [promotions, setPromotions] = useState<PromotionSummary[]>([]);

  // Track the current user id — needed for archive/restore actions, which
  // are scoped to (assignment_id, this user's id) only. See
  // services/assignment/assignmentArchive.ts.
  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);

  // Personal archive state — Map<assignment_id, archived_at>, scoped to
  // the current user only. Ali and WebMood each get their own Map;
  // archiving never mutates the assignment row itself, so it can never
  // affect what the other party sees..
  const [archivedMap, setArchivedMap] = useState<Map<string, string>>(new Map());
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<string[]>([]);
  const [restoring, setRestoring] = useState(false);

  // Personal archive state for PROMOTIONS — Map<promotion_id, archived_at>,
  // completely separate from the Assignment archive state above. Ali and
  // WebMood each get their own Map; archiving never mutates the promotion
  // row itself, so it can never affect what the other party sees.
  const [archivedPromotionMap, setArchivedPromotionMap] = useState<Map<string, string>>(new Map());
  const [archivingPromotionId, setArchivingPromotionId] = useState<string | null>(null);
  const [showArchivedPromotionsModal, setShowArchivedPromotionsModal] = useState(false);
  const [selectedArchivedPromotionIds, setSelectedArchivedPromotionIds] = useState<string[]>([]);
  const [restoringPromotions, setRestoringPromotions] = useState(false);

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

  // ── Assignments tab loader — same queries + de-dupe logic as before, just moved ──
  const loadAssignments = async (organizationId: string | null, userId: string) => {
    const [orgAssignments, myCollabs, archivedIds, promotedAssignmentIds] = await Promise.all([
      organizationId ? listOrgAssignments(organizationId) : Promise.resolve([]),
      listMyCollaborations(userId),
      getArchivedAssignmentIdsForUser(userId),
      listPromotedAssignmentIdsForUser(userId),
    ]);

    // De-dupe in case the current user is both the org creator and a collaborator.
    const byId = new Map<string, AssignmentSummary>();
    [...orgAssignments, ...myCollabs].forEach(a => byId.set(a.id, a));

    // Once the CURRENT user already has a promotion tied to an
    // Assignment (as Sponsor or as the specific Collaborator who
    // started it), that Assignment moves to My Promotions and drops
    // out of the active Assignments list — for this user only. A
    // different collaborator on the same Assignment who hasn't
    // promoted yet is unaffected; see listPromotedAssignmentIdsForUser.
    promotedAssignmentIds.forEach(id => byId.delete(id));

    setAssignments(Array.from(byId.values()));
    setArchivedMap(archivedIds);
  };

  // ── Invitations tab loader ──────────────────────────────────────────────
  const loadInvitations = async (email: string | null) => {
    const myInvites = email ? await listMyInvitations(email) : [];
    setInvitations(myInvites);
  };

  // ── Promotions tab loader ───────────────────────────────────────────────
  const loadPromotions = async (userId: string) => {
    const [myPromos, archivedPromotionIds] = await Promise.all([
      listMyPromotions(userId),
      getArchivedPromotionIdsForUser(userId),
    ]);
    setPromotions(myPromos);
    setArchivedPromotionMap(archivedPromotionIds);
  };

  useEffect(() => {
  const bootstrap = async () => {
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

      setOrgId(membership?.organization_id ?? null);

      setProfileEmail(profile?.email ?? null);


      // ONLY load default tab
      await loadPromotions(user.id);


    } catch (e: any) {
      setError(e.message ?? 'Failed to load Collaboration Hub');

    } finally {
      setLoading(false);
    }
  };


  bootstrap();

}, []);

useEffect(() => {

  if (!userId) return;


  if (tab === 'assignments') {
    loadAssignments(orgId, userId);
  }


  if (tab === 'invitations') {
    loadInvitations(profileEmail);
  }


}, [tab, userId, orgId, profileEmail]);

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

  // Archive is only ever triggered by an explicit user click below — there
  // is no automatic/time-based archiving anywhere. This only ever writes
  // a row scoped to (promotion_id, the CURRENT user's id) — it can never
  // affect the other party's view of the same promotion, and never
  // touches promotion status, promotion_assets, or assignment/collaborator
  // relationships.
  const handleArchivePromotion = (promotion: PromotionSummary) => {
    if (!userId) return;
    showConfirm(
      'Archive Promotion?',
      'Archived promotions will be hidden from your active list. You can restore them anytime.',
      async () => {
        setArchivingPromotionId(promotion.id);
        try {
          await archivePromotionForUser(promotion.id, userId);
          setArchivedPromotionMap(prev => new Map(prev).set(promotion.id, new Date().toISOString()));
        } catch (err: any) {
          showAlert('Archive Failed', err.message || 'Could not archive this promotion.', 'danger');
        } finally {
          setArchivingPromotionId(null);
        }
      },
      'info'
    );
  };

  const openArchivedPromotionsModal = () => {
    setSelectedArchivedPromotionIds([]);
    setShowArchivedPromotionsModal(true);
  };

  const toggleArchivedPromotionSelection = (promotionId: string) => {
    setSelectedArchivedPromotionIds(prev =>
      prev.includes(promotionId) ? prev.filter(x => x !== promotionId) : [...prev, promotionId]
    );
  };

  const handleRestoreSelectedPromotions = async () => {
    if (!userId || selectedArchivedPromotionIds.length === 0) return;
    setRestoringPromotions(true);
    try {
      await Promise.all(
        selectedArchivedPromotionIds.map(promotionId => restorePromotionForUser(promotionId, userId))
      );
      setArchivedPromotionMap(prev => {
        const next = new Map(prev);
        selectedArchivedPromotionIds.forEach(id => next.delete(id));
        return next;
      });
      setSelectedArchivedPromotionIds([]);
    } catch (err: any) {
      showAlert('Restore Failed', err.message, 'danger');
    } finally {
      setRestoringPromotions(false);
    }
  };

  const activePromotions = promotions.filter(p => !archivedPromotionMap.has(p.id));
  const archivedPromotions = promotions.filter(p => archivedPromotionMap.has(p.id));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-1">
  <span className="w-2 h-2 rounded-full bg-red-600" />
  <h1 className="text-2xl font-bold">Marketplace</h1>
  <button
    onClick={() => setShowOnboarding(true)}
    className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-600 text-white text-sm flex items-center justify-center hover:bg-zinc-700 hover:border-zinc-500 transition-colors"
    aria-label="Watch onboarding"
  >
    ▶
  </button>
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
          {tab === 'promotions' && (
            <button
              onClick={openArchivedPromotionsModal}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
            >
              <Archive size={14} />
              Archived{archivedPromotions.length > 0 ? ` (${archivedPromotions.length})` : ''}
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
            {activePromotions.length === 0 && <EmptyState label="No promotions yet" />}
            {activePromotions.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/marketplace/promotions/${p.id}`)}
                className="relative group w-full flex items-center justify-between text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5 pr-14 hover:border-zinc-700 transition-colors cursor-pointer"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchivePromotion(p);
                  }}
                  disabled={archivingPromotionId === p.id}
                  title="Archive"
                  className="absolute top-1/2 -translate-y-1/2 right-4 w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                >
                  {archivingPromotionId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                </button>
                <div>
                  <h3 className="font-bold text-white">{p.assignment?.title ?? p.campaign?.campaign_name ?? 'Promotion'}</h3>
                  <p className="text-zinc-500 text-xs mt-1">
  Created {new Date(p.created_at).toLocaleDateString()}
</p>

{p.owner && (
  <p className={`text-xs mt-1 ${p.assignment_collaborator && p.assignment_collaborator.status !== 'active' ? 'text-red-500' : 'text-orange-400'}`}>
    {p.assignment_collaborator && p.assignment_collaborator.status !== 'active' ? 'Removed by' : 'Assigned by'} {p.owner.full_name ?? 'Unknown'}
  </p>
)}
                </div>
                {p.status !== 'draft' && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {p.status}
                  </span>
                )}
              </div>
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

      {/* Archived promotions modal — shows ONLY promotions the CURRENT
          user has personally archived. The same promotion can be Active
          for one party (e.g. the Collaborator) and Archived for the
          other (e.g. the Sponsor); this list never reflects anyone
          else's state. */}
      <AnimatePresence>
        {showArchivedPromotionsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowArchivedPromotionsModal(false)}
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
                  <Archive size={16} className="text-zinc-500" /> Archived Promotions
                </h2>
                <button
                  onClick={() => setShowArchivedPromotionsModal(false)}
                  className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
                {archivedPromotions.length === 0 ? (
                  <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest text-center py-10">
                    No archived promotions
                  </p>
                ) : (
                  archivedPromotions.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedArchivedPromotionIds.includes(p.id)}
                        onChange={() => toggleArchivedPromotionSelection(p.id)}
                        className="w-4 h-4 rounded accent-white shrink-0"
                      />
                      <button
                        onClick={() => {
                          setShowArchivedPromotionsModal(false);
                          navigate(`/marketplace/promotions/${p.id}`);
                        }}
                        className="text-sm text-zinc-200 flex-1 truncate text-left hover:text-white"
                      >
                        {p.assignment?.title ?? p.campaign?.campaign_name ?? 'Promotion'}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <button
                disabled={selectedArchivedPromotionIds.length === 0 || restoringPromotions}
                onClick={handleRestoreSelectedPromotions}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {restoringPromotions ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={14} />}
                Restore Selected{selectedArchivedPromotionIds.length > 0 ? ` (${selectedArchivedPromotionIds.length})` : ''}
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
      {showOnboarding && (
  <MarketplaceOnboarding
    onClose={() => setShowOnboarding(false)}
  />
)}
    </div>
  );
}

/* ── Marketplace mini onboarding controller (Section 03 + 06) ── */
function MarketplaceOnboarding({ onClose }: { onClose: () => void }) {
  const SECTIONS = [
    {
      id: 1,
      label: '01 How Promotion works',
      short: 'Promotion',
      component: OnboardingVideoSection03,
    },
    {
      id: 2,
      label: '02 Marketplace',
      short: 'Marketplace',
      component: OnboardingVideoSection06,
    },
  ];

  const [currentIndex, setCurrentIndex] = React.useState(0);
  const current = SECTIONS[currentIndex];
  const CurrentSection = current.component;

  const goTo = (index: number) => {
    if (index < 0 || index >= SECTIONS.length) return;
    setCurrentIndex(index);
  };

  const goNext = () => {
    if (currentIndex < SECTIONS.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      onClose();
    }
  };

  const goBack = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      }}
    >
      {/* Top bar — section pills + close */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          // Extra top padding so this bar (and the close button inside it)
          // clears the app's fixed black nav bar instead of rendering
          // underneath it.
          padding: '60px 20px 12px 20px',
          borderBottom: '1px solid #e8e8ee',
          background: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {SECTIONS.map((s, i) => {
            const isActive = i === currentIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: isActive ? '1px solid #5b3df0' : '1px solid #d9d9e3',
                  background: isActive ? '#5b3df0' : '#ffffff',
                  color: isActive ? '#ffffff' : '#6b6b78',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {s.short}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid #d9d9e3',
            background: '#ffffff',
            color: '#6b6b78',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Current section */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <CurrentSection
          key={current.id}
          onSkip={goNext}
          onComplete={goNext}
        />
      </div>

      {/* Bottom bar — Back / Next */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderTop: '1px solid #e8e8ee',
          background: '#fafafa',
        }}
      >
        <button
          type="button"
          onClick={goBack}
          disabled={currentIndex === 0}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid #d9d9e3',
            background: currentIndex === 0 ? '#f3f3f7' : '#ffffff',
            color: currentIndex === 0 ? '#b0b0bc' : '#15151f',
            fontSize: 13,
            fontWeight: 600,
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          ← Back
        </button>

        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: '#9a9aa8',
          }}
        >
          {current.label} · {currentIndex + 1} / {SECTIONS.length}
        </span>

        <button
          type="button"
          onClick={goNext}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#5b3df0',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 6px 16px rgba(91,61,240,0.3)',
          }}
        >
          {currentIndex === SECTIONS.length - 1 ? 'Finish' : 'Next →'}
        </button>
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