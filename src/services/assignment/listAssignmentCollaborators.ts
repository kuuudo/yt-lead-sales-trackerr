/**
 * src/services/assignment/listAssignmentCollaborators.ts
 *
 * Full collaborator roster for one Assignment — the Sponsor-side view.
 * Did not exist before Phase 2A: getAssignmentDetail.ts only resolves
 * the VIEWER's own collaborator row (myCollaboratorId), never the full
 * list. This is a separate, additive query, not a change to that file.
 *
 * Read-only. Does not check "is the caller allowed to see this roster" —
 * that's a page-level (AssignmentDetail.tsx) UI decision (isSponsor),
 * backed by whatever RLS already permits on assignment_collaborators for
 * SELECT. This function does not add authorization logic, consistent
 * with removeCollaborator.ts leaving authorization to the RPC alone.
 */

import { supabase } from '../../lib/supabase';

export interface AssignmentCollaboratorRow {
  id: string;
  user_id: string;
  status: string;
  joined_at: string;
  name: string;
  email: string | null;
}

export async function listAssignmentCollaborators(
  assignmentId: string
): Promise<AssignmentCollaboratorRow[]> {
  const { data, error } = await supabase
    .from('assignment_collaborators')
    .select('id, user_id, status, joined_at, profiles(full_name, email)')
    .eq('assignment_id', assignmentId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load assignment collaborators: ${error.message}`);
  }

  return (data ?? []).map((row: any) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      status: row.status as string,
      joined_at: row.joined_at as string,
      name: profile?.full_name || profile?.email || 'Unknown User',
      email: profile?.email ?? null,
    };
  });
}
