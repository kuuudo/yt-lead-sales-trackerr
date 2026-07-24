/**
 * src/services/assignment/restoreCollaborator.ts
 *
 * Wraps the restore_assignment_collaborator RPC — the mirror-image
 * counterpart to removeCollaborator.ts. Server-side (SECURITY DEFINER)
 * enforces the SAME authorization boundary as Remove:
 * assignments.created_by_user_id = auth.uid() only. This function does
 * not repeat that check, it just surfaces the result, same convention
 * as acceptInvitation.ts / removeCollaborator.ts.
 *
 * This is a PERMISSION action, not an Archive action — it flips
 * assignment_collaborators.status from 'removed' back to 'active'. It
 * does not touch promotions, promotion_assets, assignment_assets,
 * redirect_links, or any *_user_states archive table. Every existing
 * read-time filter keyed on assignment_collaborators.status = 'active'
 * (Shared Assets, Assignment Detail access, the Marketplace "Removed
 * by" label) picks this back up automatically on the next read — no
 * additional call needed here.
 */

import { supabase } from '../../lib/supabase';

export async function restoreCollaborator(assignmentCollaboratorId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_assignment_collaborator', {
    p_assignment_collaborator_id: assignmentCollaboratorId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to restore collaborator');
  }
}
