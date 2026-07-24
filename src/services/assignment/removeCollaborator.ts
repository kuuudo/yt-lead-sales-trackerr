/**
 * src/services/assignment/removeCollaborator.ts
 *
 * Wraps the remove_assignment_collaborator RPC (Phase 2A). Server-side
 * (SECURITY DEFINER) enforces that the caller is a member of the
 * Assignment's organization — same organization_members boundary
 * create_promotion already uses. This function does not repeat that
 * check, it just surfaces the result, same convention as
 * acceptInvitation.ts.
 *
 * This is a PERMISSION action, not an Archive action — it flips
 * assignment_collaborators.status from 'active' to 'removed'. It does
 * not delete the assignment, assets, promotions, promotion_assets, or
 * assignment_assets, and it never touches any *_user_states archive
 * table. Every existing RLS policy keyed on
 * assignment_collaborators.status = 'active' revokes access on its own,
 * on the next read — no cleanup call needed here.
 */

import { supabase } from '../../lib/supabase';

export async function removeCollaborator(assignmentCollaboratorId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_assignment_collaborator', {
    p_assignment_collaborator_id: assignmentCollaboratorId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to remove collaborator');
  }
}
