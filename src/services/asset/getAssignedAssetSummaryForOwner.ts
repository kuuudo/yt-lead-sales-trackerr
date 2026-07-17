/**
 * src/services/asset/getAssignedAssetSummaryForOwner.ts
 *
 * "Assigned" — the Sponsor-side counterpart to listSharedAssetsForCollaborator.ts.
 * Answers: "which of MY OWN assets have I authorized out via an Assignment,
 * and to how many people?"
 *
 * ARCHITECTURE LOCK (do not restructure without re-opening this discussion):
 *   Workspace has exactly two real Asset sources: My Assets and Shared Assets.
 *     All = My + Shared
 *   Assigned is NOT a third source. It is an annotation over My:
 *     Assigned = My.filter(isAssigned)
 *   This service therefore:
 *     - does NOT query `assets` at all
 *     - does NOT return display fields (title, thumbnail, etc.)
 *     - returns only { assetId, collaboratorCount } pairs, to be merged
 *       onto rows the caller already has from listAssetsByOrganization.ts
 *   If a future change makes this function return full asset rows or a
 *   query against `assets`, that is a sign the Workspace Model itself is
 *   being redesigned — stop and confirm before proceeding, don't just
 *   extend this file.
 *
 * SCOPE — gates on assignment_assets EXISTENCE only, same principle as
 * the Shared side gating on Promotion existence, not status:
 *   - Does NOT require a Promotion to exist. "Assigned" is an
 *     Authorization-layer fact (I created an Assignment referencing this
 *     asset), not an Activation-layer one. A Sponsor sees an asset as
 *     Assigned the moment the Assignment is created, regardless of
 *     whether any Collaborator has accepted or started Promoting.
 *   - Does NOT touch `promotions` / `promotion_assets` at all.
 *   - Does NOT return or query any `status` field (assignment_collaborators
 *     status, invitation status, etc.) — Status is explicitly out of scope
 *     for the Workspace/Asset Detail feature; it belongs to the
 *     Invitation/Assignment/Promotion/Collaboration domains.
 *
 * An asset referenced by MULTIPLE assignments counts collaborators as the
 * distinct union of every collaborator across all of the viewer's
 * assignments that reference that asset — not per-assignment. Card UI
 * only needs a single number; per-assignment breakdown is Asset Detail's
 * job, not this service's.
 *
 * Deliberately three small, independently-debuggable queries rather than
 * one nested embedded query — same convention as
 * listSharedAssetsForCollaborator.ts, for the same reasons: each step is
 * a different table/relationship and each can be inspected on its own
 * when something looks wrong.
 *
 * RLS note: `assignments` and `assignment_collaborators` currently have
 * RLS OFF (see handoff §2.7 / §9 RLS review notes). This function's own
 * WHERE clause (`created_by_user_id = ownerId`) enforces correct scoping
 * for the happy path today, but does not substitute for the deferred RLS
 * policies — do not treat this file as fixing that gap.
 */

import { supabase } from '../../lib/supabase';

export interface AssignedAssetSummary {
  assetId: string;
  collaboratorCount: number;
}

// ---- Step 1: resolve assignments I created ----
async function getMyAssignments(ownerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('id')
    .eq('created_by_user_id', ownerId);

  if (error) {
    throw new Error(`Failed to load assignments for owner: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.id as string);
}

// ---- Step 2: resolve which assets those assignments reference ----
async function getAssignedAssetPairs(
  assignmentIds: string[]
): Promise<{ asset_id: string; assignment_id: string }[]> {
  if (assignmentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('assignment_assets')
    .select('asset_id, assignment_id')
    .in('assignment_id', assignmentIds);

  if (error) {
    throw new Error(`Failed to load assignment assets: ${error.message}`);
  }

  return (data ?? []) as { asset_id: string; assignment_id: string }[];
}

// ---- Step 3: resolve collaborators per assignment (no status column — deliberately excluded) ----
async function getAssignmentCollaboratorPairs(
  assignmentIds: string[]
): Promise<{ assignment_id: string; user_id: string }[]> {
  if (assignmentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('assignment_collaborators')
    .select('assignment_id, user_id')
    .in('assignment_id', assignmentIds);

  if (error) {
    throw new Error(`Failed to load assignment collaborators: ${error.message}`);
  }

  return (data ?? []) as { assignment_id: string; user_id: string }[];
}

export async function getAssignedAssetSummaryForOwner(
  ownerId: string
): Promise<AssignedAssetSummary[]> {
  const assignmentIds = await getMyAssignments(ownerId);
  if (assignmentIds.length === 0) return [];

  const [assetPairs, collaboratorPairs] = await Promise.all([
    getAssignedAssetPairs(assignmentIds),
    getAssignmentCollaboratorPairs(assignmentIds),
  ]);

  // assignment_id -> distinct collaborator user_ids
  const collaboratorsByAssignment = new Map<string, Set<string>>();
  for (const pair of collaboratorPairs) {
    if (!collaboratorsByAssignment.has(pair.assignment_id)) {
      collaboratorsByAssignment.set(pair.assignment_id, new Set());
    }
    collaboratorsByAssignment.get(pair.assignment_id)!.add(pair.user_id);
  }

  // asset_id -> distinct collaborator user_ids, unioned across every
  // assignment (of mine) that references this asset
  const collaboratorsByAsset = new Map<string, Set<string>>();
  for (const pair of assetPairs) {
    if (!collaboratorsByAsset.has(pair.asset_id)) {
      collaboratorsByAsset.set(pair.asset_id, new Set());
    }
    const assignmentCollaborators = collaboratorsByAssignment.get(pair.assignment_id);
    if (assignmentCollaborators) {
      for (const userId of assignmentCollaborators) {
        collaboratorsByAsset.get(pair.asset_id)!.add(userId);
      }
    }
  }

  return Array.from(collaboratorsByAsset.entries()).map(([assetId, collaborators]) => ({
    assetId,
    collaboratorCount: collaborators.size,
  }));
}
