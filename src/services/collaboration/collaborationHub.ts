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
  campaign: { campaign_name: string | null } | null;
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

/** Promotions the current user owns — "My Promotions" section. */
export async function listMyPromotions(userId: string): Promise<PromotionSummary[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('id, campaign_id, status, created_at, campaign:campaigns(campaign_name)')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load promotions: ${error.message}`);
  return data ?? [];
}
