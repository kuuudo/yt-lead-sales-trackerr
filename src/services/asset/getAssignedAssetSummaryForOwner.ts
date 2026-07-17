/**
 * src/services/asset/getAssignedAssetSummaryForOwner.ts
 *
 * "Assigned" workspace annotation — for a Sponsor (Assignment creator),
 * which of MY assets have I authorized out via an Assignment, and to
 * how many collaborators.
 *
 * Architecture lock: Assigned is NOT a third Asset source. It is a thin
 * annotation layer over My Assets (listAssetsByOrganization). This
 * service never queries `assets` and never returns display data (title,
 * thumbnail, etc.) — that data already exists in the caller's My Assets
 * rows. Returning full rows here would tempt callers to union this into
 * `All` the way Shared is unioned, which would violate the "no dedup in
 * UI, disjoint queries only" rule, since every Assigned asset is by
 * definition already present in My (an Assignment can only reference
 * assets you already own — see AssetPicker.tsx's My-only scope, the
 * anti-re-share boundary).
 *
 * Gate condition: existence of an assignment_assets row referencing the
 * asset, scoped to Assignments this user created. Deliberately does NOT
 * require a Promotion / promotion_assets row to exist — "I've authorized
 * this out" is an Authorization-layer fact (Assignment), independent of
 * whether any collaborator has started Activation (Promotion). Do not
 * gate this on promotions.
 *
 * collaboratorCount = distinct collaborator user_ids across ALL of this
 * user's Assignments that reference the asset (an asset can be
 * referenced by multiple Assignments, each with multiple collaborators;
 * we count distinct people, not distinct assignment_collaborators rows).
 *
 * Implemented as small, independently-debuggable steps, consistent with
 * listSharedAssetsForCollaborator.ts's convention. Do not collapse into
 * a single nested query.
 */

import { supabase } from '../../lib/supabase';

export interface AssignedAssetSummary {
  assetId: string;
  collaboratorCount: number;
}

// ---- Step 1: assignments I created ----
async function getMyAssignmentIds(ownerUserId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('id')
    .eq('created_by_user_id', ownerUserId);

  if (error) {
    throw new Error(`Failed to load assignments for owner: ${error.message}`);
  }

  return (data ?? []).map((row: any) => row.id as string);
}

// ---- Step 2: which assets those assignments authorize, keeping the assignment_id link ----
async function getAssetAssignmentPairs(
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

// ---- Step 3: collaborators per assignment ----
async function getCollaboratorsForAssignments(
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
  ownerUserId: string
): Promise<AssignedAssetSummary[]> {
  const assignmentIds = await getMyAssignmentIds(ownerUserId);
  if (assignmentIds.length === 0) return [];

  const assetAssignmentPairs = await getAssetAssignmentPairs(assignmentIds);
  if (assetAssignmentPairs.length === 0) return [];

  const collaboratorPairs = await getCollaboratorsForAssignments(assignmentIds);

  // assignment_id -> Set<user_id>
  const collaboratorsByAssignment = new Map<string, Set<string>>();
  for (const c of collaboratorPairs) {
    if (!collaboratorsByAssignment.has(c.assignment_id)) {
      collaboratorsByAssignment.set(c.assignment_id, new Set());
    }
    collaboratorsByAssignment.get(c.assignment_id)!.add(c.user_id);
  }

  // asset_id -> Set<user_id> (distinct collaborators across ALL assignments referencing this asset)
  const collaboratorsByAsset = new Map<string, Set<string>>();
  for (const pair of assetAssignmentPairs) {
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

  return Array.from(collaboratorsByAsset.entries()).map(([assetId, userSet]) => ({
    assetId,
    collaboratorCount: userSet.size,
  }));
}