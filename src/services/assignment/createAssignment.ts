/**
 * src/services/assignment/createAssignment.ts
 *
 * Organization side of the Collaboration flow: creates an Assignment and
 * authorizes it against a chosen set of Assets.
 *
 * Design Lock, restated here since this is exactly where it'd be easy to
 * violate:
 *   - Assignment does NOT own a Campaign. There is no campaign_id on
 *     assignments, and this function does not accept one.
 *   - "Select Campaign" in the UI is only a filter for picking Assets —
 *     it never gets written anywhere on the Assignment itself.
 *   - Assignment references Assets only, via assignment_assets.
 *
 * Status: created directly as 'active'. v1 has no separate draft/publish
 * step in this journey — an Assignment is usable the moment its assets
 * and invitations exist, matching the Simplicity Constraint (no approval
 * workflow). If you want a draft-before-inviting step later, that's an
 * additive change to this function, not a schema change.
 *
 * NOT responsible for:
 *   - Sending invitations (see inviteCollaborator.ts — called separately,
 *     once an assignmentId exists)..
 */

import { supabase } from '../../lib/supabase';

export interface CreateAssignmentInput {
  organizationId: string;
  createdByUserId: string;
  title: string;
  description?: string | null;
  assetIds: string[];
}

export interface CreateAssignmentResult {
  assignmentId: string;
}

export async function createAssignment({
  organizationId,
  createdByUserId,
  title,
  description = null,
  assetIds,
}: CreateAssignmentInput): Promise<CreateAssignmentResult> {
  if (!title.trim()) {
    throw new Error('Assignment title is required');
  }
  if (assetIds.length === 0) {
    throw new Error('At least one Asset must be selected');
  }

  const { data: assignment, error: assignmentErr } = await supabase
    .from('assignments')
    .insert({
      organization_id: organizationId,
      created_by_user_id: createdByUserId,
      title: title.trim(),
      description,
      status: 'active',
      visibility: 'private',
    })
    .select('id')
    .single();

  if (assignmentErr || !assignment) {
    throw new Error(assignmentErr?.message ?? 'Assignment insert returned no data');
  }

  const { error: assetsErr } = await supabase
    .from('assignment_assets')
    .insert(assetIds.map(assetId => ({ assignment_id: assignment.id, asset_id: assetId })));

  if (assetsErr) {
    // Compensate: the Assignment has no invitations/collaborators yet
    // (this is the very first write in its lifecycle), so it's safe to
    // delete outright — same pattern as createVideo.ts / createPromotion.ts.
    await supabase.from('assignments').delete().eq('id', assignment.id);
    throw new Error(`Failed to attach assets to Assignment: ${assetsErr.message}`);
  }

  return { assignmentId: assignment.id };
}
