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

  assignment: {
    title: string;
  } | null;

  campaign: {
    campaign_name: string | null;
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
  assignment:assignments(title),
  campaign:campaigns(campaign_name)
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
