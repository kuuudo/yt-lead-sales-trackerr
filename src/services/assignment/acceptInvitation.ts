/**
 * src/services/assignment/acceptInvitation.ts
 * Wraps the accept_assignment_invitation RPC (Migration 009).
 * Server-side enforces that invited_email matches the caller — this
 * function does not repeat that check, it just surfaces the result.
 */

import { supabase } from '../../lib/supabase';

export async function acceptInvitation(invitationId: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_assignment_invitation', {
    p_invitation_id: invitationId,
  });

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to accept invitation');
  }

  return data as string; // the new assignment_collaborators.id
}
