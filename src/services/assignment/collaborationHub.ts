/**
 * src/services/assignment/collaborationHub.ts
 *
 * Read-side queries for the Marketplace (Collaboration Hub) page.
 * v1 scope only: Assignments / Invitations / My Promotions.
 * No search, no discovery, no public listings — per the locked Design.
 */

import { supabase } from '../../lib/supabase';

export interface AssignmentSummary {
  id: string;
  title: string;
  description: string | null;
  status: string;
  visibility: string;
  created_at: string;
}

export interface InvitationSummary {
  id: string;
  assignment_id: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  assignment: { title: string } | null;
}

export interface PromotionSummary {
  id: string;
  campaign_id: string;
  status: string;
  created_at: string;

  /**
   * Raw ids — added alongside the existing nested joins below (not a
   * replacement for them) so callers can bucket a promotion as
   * "assigned to me" / "assigned by me" without a second query. See
   * listMyPromotionsGrouped() below. Existing consumers of this
   * interface (Marketplace.tsx) are unaffected — these are additive
   * fields, nothing removed or renamed.
   */
  owner_user_id: string;
  assignment_id: string | null;
  assignment_collaborator_id: string | null;

  assignment: {
    id: string;
    title: string;
    /**
     * The personal (not org-wide) authorization boundary already used
     * elsewhere in the codebase for "who may act as this Assignment's
     * Sponsor" (see getPromotionDetail.ts's Remove Collaborator note).
     * Used by listMyPromotionsGrouped() to scope "Assigned by Me" to
     * assignments *I personally* created — deliberately NOT the same
     * as listOrgAssignments()'s organization-wide scope.
     */
    created_by_user_id: string;
  } | null;

  campaign: {
    campaign_name: string | null;
  } | null;

  owner: {
    full_name: string | null;
    email: string | null;
  } | null;

  /**
   * Present only when this promotion was started via an Assignment
   * (assignment_collaborator_id is set). Null for a direct org-owner
   * promotion with no Assignment involved. Exposes ONLY status — no
   * new query, no new authorization surface — so Marketplace.tsx can
   * label a historical promotion "Removed by {owner}" instead of
   * "Assigned by {owner}" without needing to open Promotion Detail.
   */
  assignment_collaborator: {
    status: string;
  } | null;
}

/** Assignments this Organization created (the "creating org" side of the Hub). */
export async function listOrgAssignments(organizationId: string): Promise<AssignmentSummary[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('id, title, description, status, visibility, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load assignments: ${error.message}`);
  return data ?? [];
}

/** Assignments the current user is actively collaborating on (the "promoter" side). */
export async function listMyCollaborations(userId: string): Promise<AssignmentSummary[]> {
  const { data, error } = await supabase
    .from('assignment_collaborators')
    .select('assignment:assignments(id, title, description, status, visibility, created_at)')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) throw new Error(`Failed to load collaborations: ${error.message}`);
  return (data ?? [])
    .map((row: any) => row.assignment)
    .filter(Boolean);
}

/** Pending invitations addressed to the current user's email. */
export async function listMyInvitations(email: string): Promise<InvitationSummary[]> {
  const { data, error } = await supabase
    .from('assignment_invitations')
    .select('id, assignment_id, status, created_at, expires_at, assignment:assignments(title)')
    .eq('status', 'pending')
    .ilike('invited_email', email);

  if (error) throw new Error(`Failed to load invitations: ${error.message}`);
  return data ?? [];
}

/**
 * assignment_collaborators.id[] belonging to this user — the bridge
 * between a user and promotions.assignment_collaborator_id (which points
 * to assignment_collaborators.id, not directly to a user_id). Small,
 * independently-debuggable step, reused by listMyPromotions and
 * listPromotedAssignmentIdsForUser below — do not inline this into either.
 */
async function getMyAssignmentCollaboratorIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('assignment_collaborators')
    .select('id')
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to load assignment collaborator ids: ${error.message}`);
  return (data ?? []).map((row: any) => row.id as string);
}

/**
 * Promotions the current user owns — "My Promotions" section.
 *
 * A user can reach a promotion two ways: as the Sponsor
 * (promotions.owner_user_id) or as the Collaborator who started it
 * (promotions.assignment_collaborator_id -> assignment_collaborators.id,
 * scoped to rows where assignment_collaborators.user_id = this user).
 * Both are "my promotions" from this user's point of view.
 */
export async function listMyPromotions(userId: string): Promise<PromotionSummary[]> {
  const myCollaboratorIds = await getMyAssignmentCollaboratorIds(userId);

  let query = supabase
    .from('promotions')
    .select(`
  id,
  campaign_id,
  status,
  created_at,
  owner_user_id,
  assignment_id,
  assignment_collaborator_id,
  assignment:assignments(id, title, created_by_user_id),
  campaign:campaigns(campaign_name),
  owner:profiles!promotions_owner_user_id_fkey(
    full_name,
    email
  ),
  assignment_collaborator:assignment_collaborators(
    status
  )
`);

  query = myCollaboratorIds.length > 0
    ? query.or(`owner_user_id.eq.${userId},assignment_collaborator_id.in.(${myCollaboratorIds.join(',')})`)
    : query.eq('owner_user_id', userId);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load promotions: ${error.message}`);
  return data ?? [];
}

/**
 * Assignment ids that already have a promotion tied to THIS user's own
 * relationship to that assignment — either as the Sponsor who created
 * the promotion, or as the specific Collaborator who started promoting.
 *
 * Deliberately per-user, not "does any promotion exist for this
 * assignment at all": an Assignment can have several collaborators, each
 * independently promoting. If only one has started, the Assignment must
 * still show as available for the others — hiding it globally would be
 * wrong. This mirrors listMyPromotions' own OR condition, since "I
 * already have a promotion from this Assignment" and "this promotion is
 * mine" are the same underlying relationship.
 *
 * Used by Marketplace.tsx to filter the Assignments tab only — does not
 * touch assignment status/visibility, does not affect any other user's
 * view.
 */
export async function listPromotedAssignmentIdsForUser(userId: string): Promise<Set<string>> {
  const myCollaboratorIds = await getMyAssignmentCollaboratorIds(userId);

  let query = supabase
    .from('promotions')
    .select('assignment_id');

  query = myCollaboratorIds.length > 0
    ? query.or(`owner_user_id.eq.${userId},assignment_collaborator_id.in.(${myCollaboratorIds.join(',')})`)
    : query.eq('owner_user_id', userId);

  const { data, error } = await query;

  if (error) throw new Error(`Failed to load promoted assignment ids: ${error.message}`);

  return new Set(
    (data ?? [])
      .map((row: any) => row.assignment_id as string | null)
      .filter((id): id is string => !!id)
  );
}

/**
 * Splits listMyPromotions()'s existing OR into two explicit buckets
 * instead of a flat list the caller has to re-derive by hand.
 *
 * assignedToMe: rows reached via the Collaborator branch — my
 * assignment_collaborator_id is one of mine, i.e. someone else assigned
 * this to me. Sponsor identity is already embedded via the existing
 * `owner` join, so no extra fetch needed for this bucket.
 *
 * assignedByMe: rows where I personally created the Assignment
 * (assignment.created_by_user_id === userId) — the personal, not
 * org-wide, boundary (see PromotionSummary.assignment's doc comment
 * above). Marketer identity is deliberately NOT resolved here — that
 * composition happens in getPromotionAssignmentGroups.ts via
 * listAssignmentCollaborators(), to keep this function a pure bucket
 * split with no new query shape.
 *
 * A promotion can appear in neither bucket (e.g. a direct org-owner
 * promotion with no assignment at all) — those belong under [All]
 * only, not either assignment-direction tab.
 */
export async function listMyPromotionsGrouped(userId: string): Promise<{
  assignedToMe: PromotionSummary[];
  assignedByMe: PromotionSummary[];
}> {
  const [all, myCollaboratorIds] = await Promise.all([
    listMyPromotions(userId),
    getMyAssignmentCollaboratorIds(userId),
  ]);

  const assignedToMe = all.filter(
    p => !!p.assignment_collaborator_id && myCollaboratorIds.includes(p.assignment_collaborator_id)
  );

  const assignedByMe = all.filter(
    p => p.assignment?.created_by_user_id === userId
  );

  return { assignedToMe, assignedByMe };
}