import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Mail, Rocket, Loader2, Plus, Archive, ArchiveRestore, X, BarChart2, Gamepad2, AlertTriangle, ExternalLink, Users, ChevronDown, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';
import { useEffectiveIdentity } from '../lib/useEffectiveIdentity';
import { useViewing } from '../lib/ViewingContext';
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
import {
  hidePromotionForUser,
  unhidePromotionForUser,
  getHiddenPromotionIdsForUser,
} from '../services/promotion/archiveUiVisibility';
import {
  getPromotionArchiveImpactForViewer,
  type PromotionArchiveImpact,
} from '../services/promotion/getPromotionArchiveImpactForViewer';
import { getAssetTitlesBulk } from '../services/asset/getAssetTitlesBulk';
import {
  getPromotionAssignmentGroups,
  type PromotionAssignmentGroups,
  type AssignmentGroup,
} from '../services/promotion/getPromotionAssignmentGroups';
import { marketplaceAssignmentsPageCache } from '../lib/marketplaceAssignmentsPageCache';
import { marketplacePromotionsPageCache } from '../lib/marketplacePromotionsPageCache';
import { marketplaceInvitationsPageCache } from '../lib/marketplaceInvitationsPageCache';
import OnboardingVideoSection03 from '../components/onboarding/OnboardingVideo/OnboardingVideoSection03';
import OnboardingVideoSection06 from '../components/onboarding/OnboardingVideo/OnboardingVideoSection06';
import TopPromotions from './TopPromotions'; 
import TopMarketers from './TopMarketers';
import TopRankings from './TopRankings';
import { useTutorial } from '../lib/tutorial-overlay';
import { marketplaceTutorial } from '../lib/tutorials/marketplaceTutorial';
import { startFirstCollabGuide } from '../lib/tutorials/startFirstCollabGuide';
type Tab = 'assignments' | 'invitations' | 'promotions';

const TABS: { key: Tab; label: string; icon: typeof Briefcase }[] = [
  { key: 'assignments', label: 'Assignments', icon: Briefcase },
  { key: 'invitations', label: 'Invitations', icon: Mail },
  { key: 'promotions', label: 'My Promotions', icon: Rocket },
];

export default function Marketplace() {
  const navigate = useNavigate();
  const { start: startTutorial, notify: notifyTutorial, tutorial: activeTutorial, stepIndex: tutorialStepIndex, status: tutorialStatus } = useTutorial();
  const [tab, setTab] = useState<Tab>('promotions');
  
  // Follow-Along ("Start Your First Collab") — force the Invitations
  // tab open when the guide reaches that step, since tab selection is
  // internal component state, not a route the runner can navigate to.
  useEffect(() => {
    const onCollabInviteStep =
      tutorialStatus === 'active' &&
      activeTutorial?.id === 'start-first-collab' &&
      activeTutorial.steps[tutorialStepIndex]?.id === 'open-your-invitation';
    if (onCollabInviteStep && tab !== 'invitations') {
      setTab('invitations');
    }

  // force My Promotions tab for the transition step
    const onGoToPromotionStep =
      tutorialStatus === 'active' &&
      activeTutorial?.id === 'start-first-collab' &&
      activeTutorial.steps[tutorialStepIndex]?.id === 'go-to-promotion-detail';
    if (onGoToPromotionStep && tab !== 'promotions') {
      setTab('promotions');
    }
  }, [tutorialStatus, activeTutorial, tutorialStepIndex, tab]);

  
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [promotions, setPromotions] = useState<PromotionSummary[]>([]);

  // Effective identity — the real authenticated user in normal mode, or
  // the viewed member's identity while an Operator is in viewing mode.
  // Replaces the old bootstrap that independently called
  // supabase.auth.getUser() + its own profiles/organization_members
  // lookups. userId is still needed for archive/restore actions, which
  // are scoped to (assignment_id, this identity's id) only — see
  // services/assignment/assignmentArchive.ts. isReadOnly gates those
  // actions so viewing mode can never write to the viewed member's
  // personal archive state.
  const { userId, email: profileEmail, organizationId: orgId, isReadOnly, loading: identityLoading } = useEffectiveIdentity();
  const { viewingOrgId } = useViewing();
  const effectiveOrgId = isReadOnly ? viewingOrgId : orgId;
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

  // Level 1 / Level 2 UI-visibility split for Promotion Surface A only.
  // hiddenPromotionSet is a SUBSET of archivedPromotionMap's keys — it
  // never adds or removes anything from archivedPromotionMap itself.
  // promotionsView switches the INLINE view within the 'promotions' tab
  // between My Promotions (active) and Level 1 (archived, not hidden);
  // Level 2 (hidden) stays a modal, same as before.
  const [hiddenPromotionSet, setHiddenPromotionSet] = useState<Set<string>>(new Set());
  // 'impact' added — Surface B (Archive Impact). Purely additive: does
  // not change 'active'/'level1' behavior or archivedPromotionMap/
  // hiddenPromotionSet at all.
  const [promotionsView, setPromotionsView] = useState<'active' | 'level1' | 'impact'>('active');
  const [hidingPromotionId, setHidingPromotionId] = useState<string | null>(null);

  // Surface B — Archive Impact, Marketplace-level. Diagnostic only:
  // never writes promotion_user_states or archive_ui_visibility, never
  // Hides/Unhides/Restores, never triggers automatic Remove/Revoke.
  // Scoped to My Promotions (activePromotions) only.
  const [archiveImpactMap, setArchiveImpactMap] = useState<Map<string, PromotionArchiveImpact>>(new Map());
  const [loadingArchiveImpact, setLoadingArchiveImpact] = useState(false);
  // Display-only. Populated from the asset ids already present in
  // archiveImpactMap — never drives which promotions/assets are shown,
  // only how each asset's row is labeled.
  const [assetTitleMap, setAssetTitleMap] = useState<Map<string, string | null>>(new Map());

  // ── Assigned to Me / Assigned by Me drill-down (My Promotions) ──────────
  // Pure navigation, not a grid filter: the leaf action is "go to this
  // promotion" — same destination as the existing Manage Promotion button
  // — not "apply a filter." The card grid below is untouched by this panel.
  const [assignTab, setAssignTab] = useState<'all' | 'toMe' | 'byMe'>('all');
  const [assignSelectedPersonId, setAssignSelectedPersonId] = useState<string | null>(null);
  const [assignmentGroups, setAssignmentGroups] = useState<PromotionAssignmentGroups | null>(null);
  const [assignmentGroupsLoading, setAssignmentGroupsLoading] = useState(false);

  // Fetches once the Promotions tab is up and userId is known — no
  // floating panel to lazy-trigger it anymore, so both person-pill rows
  // have data ready the moment someone taps a direction.
  useEffect(() => {
    if (tab !== 'promotions' || assignmentGroups || assignmentGroupsLoading || !userId) return;
    setAssignmentGroupsLoading(true);
    getPromotionAssignmentGroups(userId)
      .then(setAssignmentGroups)
      .catch(() => setAssignmentGroups({ assignedToMe: [], assignedByMe: [] }))
      .finally(() => setAssignmentGroupsLoading(false));
  }, [tab, assignmentGroups, assignmentGroupsLoading, userId]);

  const activeAssignGroupList: AssignmentGroup[] =
    assignTab === 'toMe' ? assignmentGroups?.assignedToMe ?? []
    : assignTab === 'byMe' ? assignmentGroups?.assignedByMe ?? []
    : [];

  // What the "My Promotions" active-view grid actually renders. [All] is
  // untouched (== activePromotions). Assigned to Me/by Me scope to the
  // union of that direction's promotions, or just one person's once a
  // pill is selected — ids cross-checked against activePromotions so
  // existing archive filtering is never bypassed.
  // ── Combined Archived / Archive Impact / Hidden menu ─────────────────────
  // Desktop: opens on hover (CSS group-hover). Mobile/touch: no real
  // :hover, so the click-toggled `manageOpen` state covers it — see the
  // combined className on the panel below.
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (manageRef.current && !manageRef.current.contains(e.target as Node)) {
        setManageOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'info' | 'danger' | 'success';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'info' });
  const handleStartMarketplaceTour = () => {
    setShowOnboarding(false);
    startTutorial(marketplaceTutorial);
  };

  const handleStartFirstCollabGuide = () => {
    setShowOnboarding(false);
    startTutorial(startFirstCollabGuide);
  };

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
    const [myPromos, archivedPromotionIds, hiddenPromotionIds] = await Promise.all([
      listMyPromotions(userId),
      getArchivedPromotionIdsForUser(userId),
      getHiddenPromotionIdsForUser(userId),
    ]);
    setPromotions(myPromos);
    setArchivedPromotionMap(archivedPromotionIds);
    setHiddenPromotionSet(hiddenPromotionIds);
  };

  // Bootstrap now just waits on useEffectiveIdentity() instead of doing its
  // own getUser()/profiles/organization_members lookups — in normal mode
  // this resolves to the real signed-in user (unchanged behavior); in
  // viewing mode it resolves to the viewed member's identity.
  useEffect(() => {
    if (identityLoading) return;

    const bootstrap = async () => {
      setLoading(true);
      setError(null);

      try {
        if (!userId) throw new Error('Not signed in');

        // ONLY load default tab
        await loadPromotions(userId);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load Collaboration Hub');
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [identityLoading, userId]);

  useEffect(() => {
    if (!userId) return;

    if (tab === 'assignments') {
    loadAssignments(effectiveOrgId, userId);
    }

    if (tab === 'invitations') {
      loadInvitations(profileEmail);
    }
  }, [tab, userId, orgId, profileEmail, effectiveOrgId]);

  // Archive is only ever triggered by an explicit user click below — there
  // is no automatic/time-based archiving anywhere. This only ever writes
  // a row scoped to (assignment_id, the CURRENT user's id) — it can never
  // affect the other party's view of the same assignment, and never
  // touches assignment status, collaborators, invitations, or promotions..
  const handleArchiveAssignment = (assignment: AssignmentSummary) => {
    if (!userId || isReadOnly) return;
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
    if (!userId || isReadOnly || selectedArchivedIds.length === 0) return;
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
    if (!userId || isReadOnly) return;
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

  // Level 1 -> Level 2. UI-visibility only — never touches
  // archivedPromotionMap / promotion_user_states.archived_at.
  const handleHidePromotion = (promotion: PromotionSummary) => {
    if (!userId || isReadOnly) return;
    setHidingPromotionId(promotion.id);
    hidePromotionForUser(promotion.id, userId)
      .then(() => {
        setHiddenPromotionSet(prev => new Set(prev).add(promotion.id));
      })
      .catch((err: any) => {
        showAlert('Hide Failed', err.message || 'Could not hide this promotion.', 'danger');
      })
      .finally(() => {
        setHidingPromotionId(null);
      });
  };

  // Level 1 -> My Promotions. Single-promotion Restore, used by the
  // inline Level 1 view. Clears BOTH archivedPromotionMap and (if
  // present) hiddenPromotionSet — a Promotion can't stay "hidden" once
  // it's no longer archived at all.
  const handleRestoreSinglePromotion = async (promotionId: string) => {
    if (!userId || isReadOnly) return;
    setRestoringPromotions(true);
    try {
      await restorePromotionForUser(promotionId, userId);
      setArchivedPromotionMap(prev => {
        const next = new Map(prev);
        next.delete(promotionId);
        return next;
      });
      setHiddenPromotionSet(prev => {
        const next = new Set(prev);
        next.delete(promotionId);
        return next;
      });
    } catch (err: any) {
      showAlert('Restore Failed', err.message || 'Could not restore this promotion.', 'danger');
    } finally {
      setRestoringPromotions(false);
    }
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

 // Level 2 -> Level 1 ONLY. Per locked IA, Unhide never returns a
  // Promotion to My Promotions — only deletes the archive_ui_visibility
  // row, archivedPromotionMap (Surface A truth) is untouched.
  const handleUnhideSelectedPromotions = async () => {
    if (!userId || isReadOnly || selectedArchivedPromotionIds.length === 0) return;
    setRestoringPromotions(true);
    try {
      await Promise.all(
        selectedArchivedPromotionIds.map(promotionId => unhidePromotionForUser(promotionId, userId))
      );
      setHiddenPromotionSet(prev => {
        const next = new Set(prev);
        selectedArchivedPromotionIds.forEach(id => next.delete(id));
        return next;
      });
      setSelectedArchivedPromotionIds([]);
    } catch (err: any) {
      showAlert('Unhide Failed', err.message, 'danger');
    } finally {
      setRestoringPromotions(false);
    }
  };

  const activePromotions = promotions.filter(p => !archivedPromotionMap.has(p.id));
  const archivedPromotions = promotions.filter(p => archivedPromotionMap.has(p.id));
  // Level 1/2 are a UI-visibility split of the SAME archived set — never
  // a second archive mechanism. Both stay subsets of archivedPromotions.
  const level1Promotions = archivedPromotions.filter(p => !hiddenPromotionSet.has(p.id));
  const level2Promotions = archivedPromotions.filter(p => hiddenPromotionSet.has(p.id));
  const archiveImpactCount = Array.from(archiveImpactMap.values()).filter(v => v.archivedAssetCount > 0).length;
  const filteredByAssign = useMemo(() => {
  if (assignTab === 'all') return activePromotions;

  const person = activeAssignGroupList.find(
    g => g.person.id === assignSelectedPersonId
  );

  const scopedIds = new Set(
    (person
      ? person.promotions
      : activeAssignGroupList.flatMap(g => g.promotions)
    ).map(p => p.id)
  );

  return activePromotions.filter(p => scopedIds.has(p.id));
}, [
  assignTab,
  assignSelectedPersonId,
  activeAssignGroupList,
  activePromotions,
]);
  // Surface B fetch — independent, non-blocking. Scoped to My
  // Promotions (activePromotions) only, per the design doc's own
  // example of Archive Impact shown alongside (never instead of) My
  // Promotions. Never touches archivedPromotionMap / hiddenPromotionSet.
  useEffect(() => {
    if (!userId || tab !== 'promotions') return;
    if (activePromotions.length === 0) {
      setArchiveImpactMap(new Map());
      return;
    }
    setLoadingArchiveImpact(true);
    getPromotionArchiveImpactForViewer(activePromotions.map(p => p.id), userId)
      .then(setArchiveImpactMap)
      .catch(err => {
        console.error('[Marketplace] getPromotionArchiveImpactForViewer failed:', err);
      })
      .finally(() => {
        setLoadingArchiveImpact(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab, promotions, archivedPromotionMap]);

  // Titles for the Archive Impact list — separate, non-blocking effect.
  // Depends only on archiveImpactMap, so it never re-fires unless the
  // underlying set of impacted assets actually changes.
  useEffect(() => {
    const allAssetIds = Array.from(archiveImpactMap.values()).flatMap(v => v.impacts.map(i => i.assetId));
    if (allAssetIds.length === 0) {
      setAssetTitleMap(new Map());
      return;
    }
    getAssetTitlesBulk(allAssetIds)
      .then(setAssetTitleMap)
      .catch(err => {
        console.error('[Marketplace] getAssetTitlesBulk failed:', err);
      });
  }, [archiveImpactMap]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-1">
  <div className="flex items-center gap-3">
    <span className="w-2 h-2 rounded-full bg-red-600" />
    <h1 className="text-2xl font-bold">Marketplace</h1>
    <button
      onClick={() => setShowOnboarding(true)}
      className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-600 text-white text-sm flex items-center justify-center hover:bg-zinc-700 hover:border-zinc-500 transition-colors"
      aria-label="Watch onboarding"
    >
      🦊
    </button>
  </div>
  <button
    onClick={() => navigate('/marketplace/marketer-analytics')}
    className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
  >
    Marketer Analytics
  </button>
</div>
        <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest mb-8">
          Collaboration Hub
        </p>
  
        <div className="hidden md:block">
          <TopRankings organizationId={effectiveOrgId} />
        </div>

     
        <div className="flex gap-2 mb-8 border-b border-zinc-800">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              data-tutorial-id={key === 'invitations' ? 'marketplace-invitations-tab' : undefined}
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
            <>

                  hover-opens via group/manage. Mobile: manageOpen click
                  state covers it (no real :hover on touch). */}
              <div className="relative group/manage" ref={manageRef}>
                <button
                  onClick={() => setManageOpen(o => !o)}
                  className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
                >
                  <Archive size={14} />
                  Manage
                  <ChevronDown size={12} className={`transition-transform ${manageOpen ? 'rotate-180' : ''}`} />
                </button>

                <div
                  className={`absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden py-2 ${
                    manageOpen ? 'block' : 'hidden'
                  } group-hover/manage:block`}
                >
                  <button
                    onClick={() => {
                      setPromotionsView(v => (v === 'level1' ? 'active' : 'level1'));
                      setManageOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 text-left"
                  >
                    <Archive size={14} />
                    Archived{level1Promotions.length > 0 ? ` (${level1Promotions.length})` : ''}
                  </button>
                  <button
                    onClick={() => {
                      setPromotionsView(v => (v === 'impact' ? 'active' : 'impact'));
                      setManageOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 text-left"
                  >
                    <AlertTriangle size={14} />
                    Archive Impact{archiveImpactCount > 0 ? ` (${archiveImpactCount})` : ''}
                  </button>
                  <button
                    onClick={() => {
                      openArchivedPromotionsModal();
                      setManageOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 text-left"
                  >
                    <Archive size={14} />
                    Hidden{level2Promotions.length > 0 ? ` (${level2Promotions.length})` : ''}
                  </button>
                </div>
              </div>
            </>
          )}
          {!isReadOnly && (
            <button
              onClick={() => navigate('/marketplace/assignments/new')}
              data-tutorial-id="marketplace-create-assignment"
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg"
            >
              <Plus size={14} />
              Create Assignment
            </button>
          )}
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
                {!isReadOnly && (
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
                )}
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
                onClick={() => {
                  notifyTutorial('collab-invitation-opened');
                  navigate(`/marketplace/assignments/${inv.assignment_id}`);
                }}
                data-tutorial-id="marketplace-pending-invitation"
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

        {!loading && !error && tab === 'promotions' && promotionsView !== 'active' && (
          <button
            onClick={() => setPromotionsView('active')}
            className="flex items-center gap-2 text-zinc-500 hover:text-white text-xs font-bold uppercase tracking-wider mb-4"
          >
            <ChevronLeft size={14} />
            Back to My Promotions
          </button>
        )}

        {/* Assigned to Me / Assigned by Me — inline pills, same two-row
            pattern as the Assets page's scope tabs. Row 2 (people) only
            appears once a direction is picked; clicking a person pill
            again deselects it back to "everyone in this direction". */}
        {!loading && !error && tab === 'promotions' && promotionsView === 'active' && (
          <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {([
                { key: 'all', label: 'All' },
                { key: 'toMe', label: 'Assigned to Me' },
                { key: 'byMe', label: 'Assigned by Me' },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => { setAssignTab(t.key); setAssignSelectedPersonId(null); }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    assignTab === t.key
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {(assignTab === 'toMe' || assignTab === 'byMe') && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {assignmentGroupsLoading && (
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Loading…</span>
                )}
                {!assignmentGroupsLoading && activeAssignGroupList.length === 0 && (
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Nobody here yet.</span>
                )}
                {!assignmentGroupsLoading && activeAssignGroupList.map(group => (
                  <button
                    key={group.person.id}
                    onClick={() => setAssignSelectedPersonId(id => (id === group.person.id ? null : group.person.id))}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      assignSelectedPersonId === group.person.id
                        ? 'bg-zinc-700 text-white'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white'
                    }`}
                  >
                    {group.person.name} ({group.promotions.length})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && !error && tab === 'promotions' && promotionsView === 'active' && (
          <div className="space-y-3">
            {filteredByAssign.length === 0 && <EmptyState label="No promotions yet" />}
            {filteredByAssign.map(p => (
              <div
                key={p.id}
                className="relative group w-full flex items-center justify-between text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5 pr-32"
              >
                <div className="absolute top-1/2 -translate-y-1/2 right-4 flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/marketplace/promotions/${p.id}/analytics`);
                    }}
                    title="Analytics"
                    className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                  >
                    <BarChart2 size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      notifyTutorial('collab-promotion-opened');  
                      navigate(`/marketplace/promotions/${p.id}`);
                    }}
                    title="Manage Promotion"
                    data-tutorial-id="marketplace-promotion-manage"  
                    className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                  >
                    <Gamepad2 size={14} />
                  </button>
                  {!isReadOnly && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchivePromotion(p);
                      }}
                      disabled={archivingPromotionId === p.id}
                      title="Archive"
                      className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    >
                      {archivingPromotionId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                    </button>
                  )}
                </div>
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

        {/* Level 1 — archived, not hidden. Restore returns to My
            Promotions; Hide moves to Level 2 (the Hidden modal below).
            Never shows anything from Level 2, and never shows anything
            that isn't already in archivedPromotionMap (Surface A). */}
        {!loading && !error && tab === 'promotions' && promotionsView === 'level1' && (
          <div className="space-y-3">
            {level1Promotions.length === 0 && <EmptyState label="No archived promotions" />}
            {level1Promotions.map(p => {
              const isBusy = restoringPromotions || hidingPromotionId === p.id;
              return (
                <div
                  key={p.id}
                  className="relative group w-full flex items-center justify-between text-left bg-zinc-900 border border-zinc-800 rounded-xl p-5 pr-32"
                >
                  <div className="absolute top-1/2 -translate-y-1/2 right-4 flex items-center gap-2">
                    {!isReadOnly && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestoreSinglePromotion(p.id);
                          }}
                          disabled={isBusy}
                          title="Restore"
                          className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600 hover:text-white transition-all disabled:opacity-50"
                        >
                          {restoringPromotions ? <Loader2 size={12} className="animate-spin" /> : <ArchiveRestore size={12} />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleHidePromotion(p);
                          }}
                          disabled={isBusy}
                          title="Hide"
                          className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600 hover:text-white transition-all disabled:opacity-50"
                        >
                          {hidingPromotionId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                        </button>
                      </>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{p.assignment?.title ?? p.campaign?.campaign_name ?? 'Promotion'}</h3>
                    <p className="text-zinc-500 text-xs mt-1">
                      Created {new Date(p.created_at).toLocaleDateString()}
                    </p>
                  </div>
                {p.status !== 'draft' && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                      {p.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Surface B — Archive Impact. Diagnostic/informational only: no
            promotion_user_states writes, no archive_ui_visibility
            writes, no Hide/Unhide/Restore, no automatic Remove/Revoke.
            Every Promotion shown here is ALSO still in My Promotions —
            this view never removes anything from that list. */}
        {!loading && !error && tab === 'promotions' && promotionsView === 'impact' && (
          <div className="space-y-3">
            {loadingArchiveImpact && (
              <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest text-center py-6">
                Checking promoted assets...
              </p>
            )}
            {!loadingArchiveImpact &&
              activePromotions.filter(p => (archiveImpactMap.get(p.id)?.archivedAssetCount ?? 0) > 0).length === 0 && (
                <EmptyState label="No promotions contain archived assets" />
              )}
            {!loadingArchiveImpact &&
              activePromotions
                .filter(p => (archiveImpactMap.get(p.id)?.archivedAssetCount ?? 0) > 0)
                .map(p => {
                  const impact = archiveImpactMap.get(p.id);
                  return (
                    <div
                      key={p.id}
                      className="w-full bg-zinc-900 border border-amber-500/20 rounded-xl p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold text-white">
                          {p.assignment?.title ?? p.campaign?.campaign_name ?? 'Promotion'}
                        </h3>
                        <button
                          onClick={() => navigate(`/marketplace/promotions/${p.id}`)}
                          title="Manage Promotion"
                          className="w-7 h-7 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-all shrink-0"
                        >
                          <Gamepad2 size={14} />
                        </button>
                      </div>
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-500 mt-2">
                        <AlertTriangle size={12} />
                        Contains {impact?.archivedAssetCount ?? 0} archived asset{(impact?.archivedAssetCount ?? 0) > 1 ? 's' : ''}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {impact?.impacts.map(({ assetId, context }) => (
                          <li key={assetId} className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                            <span>
                              {assetTitleMap.get(assetId) || `Asset ${assetId.slice(0, 8)}`} — Archived
                              {context.reasons.length > 0 && (
                                <span className="text-zinc-600">
                                  {' '}({context.reasons.map(r => r.sourceName ?? r.sourceType).join(', ')})
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => navigate(`/assets/${assetId}`)}
                              title="Go to Asset"
                              className="flex items-center gap-1 text-zinc-500 hover:text-white shrink-0"
                            >
                              <ExternalLink size={11} />
                              Go to Asset
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
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
                disabled={isReadOnly || selectedArchivedIds.length === 0 || restoring}
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
                  <Archive size={16} className="text-zinc-500" /> Hidden Promotions
                </h2>
                <button
                  onClick={() => setShowArchivedPromotionsModal(false)}
                  className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
                {level2Promotions.length === 0 ? (
                  <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest text-center py-10">
                    No hidden promotions
                  </p>
                ) : (
                  level2Promotions.map(p => (
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
                disabled={isReadOnly || selectedArchivedPromotionIds.length === 0 || restoringPromotions}
                onClick={handleUnhideSelectedPromotions}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {restoringPromotions ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={14} />}
                Unhide Selected{selectedArchivedPromotionIds.length > 0 ? ` (${selectedArchivedPromotionIds.length})` : ''}
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
    onStartTour={handleStartMarketplaceTour}
    onStartCollabGuide={handleStartFirstCollabGuide}
  />
)}
    </div>
  );
}

/* ── Marketplace mini onboarding controller (Section 03 + 06) ── */
function MarketplaceOnboarding({ onClose, onStartTour, onStartCollabGuide }: { onClose: () => void; onStartTour: () => void; onStartCollabGuide: () => void }) {
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
        zIndex: 20000,
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
          padding: '12px 20px',
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
          onClick={onStartTour}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            border: '1px solid #000000',
            background: '#000000',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Take the Interactive Tour
        </button>

        <button
          type="button"
          onClick={onStartCollabGuide}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            border: '1px solid #000000', 
            background: '#ffffff', 
            color: '#000000',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          🎓 First Collab — Start With Yourself, It’s Just a Test
        </button>

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
