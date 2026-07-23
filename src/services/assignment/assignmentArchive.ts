/**
 * src/services/assignment/assignmentArchive.ts
 *
 * Personal (per-user) Archive state for Assignments.
 *
 * ARCHITECTURE LOCK: Archive is a VIEW-LEVEL annotation, not a business
 * action and not an Assignment property. An Assignment is visible to
 * both sides of a collaboration at once — the Sponsor (org that created
 * it) and the Marketer (collaborator on it). Archiving is scoped to
 * (assignment_id, user_id): if Ali (Sponsor) archives an assignment, it
 * disappears only from Ali's Assignments list. WebMood (Marketer) on the
 * same assignment is completely unaffected, and vice versa.
 *
 * This is why archive state does NOT live on the `assignments` table —
 * a column there would be a single shared value, which is wrong for an
 * object visible to multiple independent parties. It lives in its own
 * table, same shape as asset_user_states:
 *
 *   assignment_user_states
 *   -----------------------
 *   id            uuid primary key
 *   assignment_id uuid references assignments(id)
 *   user_id       uuid references auth.users(id)
 *   archived_at   timestamptz null
 *   created_at    timestamptz not null default now()
 *   unique (assignment_id, user_id)
 *
 * archived_at IS NULL      -> active (not archived) for this user
 * archived_at IS NOT NULL  -> archived for this user
 *
 * Archiving is explicitly NOT any of: cancelling the assignment, stopping
 * a collaboration, removing the assignment, stopping a promotion, or
 * revoking access. Those are separate, unrelated actions and this module
 * never touches assignments.status, assignment_collaborators,
 * assignment_invitations, promotions, or promotion_assets.
 *
 * Deliberately implemented as small, independently-debuggable functions,
 * consistent with getAssignedAssetSummaryForOwner.ts / assetArchive.ts's
 * convention. This module never queries `assignments` and never returns
 * display data (title, status, etc.) — callers already have that from
 * listOrgAssignments / listMyCollaborations and merge this in as an
 * annotation, the same way Assets.tsx merges in archivedMap today.
 *
 * NOT in scope here (explicitly deferred):
 *   - a global Visibility Context / workspace-wide "hide archived" toggle
 *   - a shared archive.ts helper / unified naming across Campaign/Video/
 *     Asset/Assignment
 *   - any change to assignment lifecycle/status, invitations, or
 *     promotion/asset-sharing logic
 *
 * Callers:
 *   - pages/Marketplace.tsx       (getArchivedAssignmentIdsForUser, archive/restore)
 *   - pages/AssignmentDetail.tsx  (getAssignmentArchiveState, restore)
 */

import { supabase } from '../../lib/supabase';

/**
 * All assignment ids the given user has personally archived, mapped to
 * the archived_at timestamp. Used to annotate the Assignments list
 * client-side — same pattern as assetArchive.ts's getArchivedAssetIdsForUser.
 */
export async function getArchivedAssignmentIdsForUser(
  userId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('assignment_user_states')
    .select('assignment_id, archived_at')
    .eq('user_id', userId)
    .not('archived_at', 'is', null);

  if (error) {
    throw new Error(`Failed to load archived assignments for user: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: any) => [row.assignment_id as string, row.archived_at as string])
  );
}

/**
 * Archive state for a single assignment, for the given user. Returns
 * null when the assignment is not archived by this user (including when
 * no assignment_user_states row exists at all yet).
 */
export async function getAssignmentArchiveState(
  assignmentId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('assignment_user_states')
    .select('archived_at')
    .eq('assignment_id', assignmentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load assignment archive state: ${error.message}`);
  }

  return (data?.archived_at as string | null) ?? null;
}

/**
 * Archive is only ever triggered by an explicit user action in the UI —
 * there is no automatic/time-based archiving anywhere. Upsert on
 * (assignment_id, user_id) since this is the first archive action for
 * this pair as often as not (no existing row to update).
 */
export async function archiveAssignmentForUser(assignmentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('assignment_user_states')
    .upsert(
      { assignment_id: assignmentId, user_id: userId, archived_at: new Date().toISOString() },
      { onConflict: 'assignment_id,user_id' }
    );

  if (error) {
    throw new Error(`Failed to archive assignment: ${error.message}`);
  }
}

/**
 * Restore only ever clears the CURRENT user's own archive state — it can
 * never affect another party's view of the same assignment, and never
 * touches assignment status, collaborators, invitations, or promotions.
 */
export async function restoreAssignmentForUser(assignmentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('assignment_user_states')
    .update({ archived_at: null })
    .eq('assignment_id', assignmentId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to restore assignment: ${error.message}`);
  }
}
