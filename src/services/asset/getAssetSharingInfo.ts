/**
 * src/services/asset/getAssetSharingInfo.ts
 *
 * "Sharing Information" — who this Asset is shared with, from the current
 * viewer's perspective, via the Assignment/Collaborator authorization
 * layer. Independent from getAssetDetail.ts by design (see Architecture
 * Review discussion) — AssetDetail.tsx composes both with Promise.all,
 * mirroring the My/Shared/Assigned pattern already used in Assets.tsx.
 *
 * NAMING NOTE: this is deliberately not called getAssetSharingDetail.ts.
 * getAssetDetail() already owns "Detail" for the asset itself; this file
 * answers a narrower question ("who is this shared with") and returns it
 * as Sharing Information, not a second Detail.
 *
 * VOCABULARY: this file uses `sharedBy`, not `sponsor`. "Sponsor" is a
 * business-domain role name (Assignment creator); `sharedBy` is the
 * Asset-Detail-page framing of the same person — Asset Detail is written
 * from the Asset's point of view ("who shared this with me"), not from
 * the Assignment's point of view. Both names resolve to the exact same
 * person (assignments.created_by_user_id) — this is a display-vocabulary
 * choice, not a different data source. Assets still have no person-level
 * owner; do not reintroduce "Owner" here — assets.organization_id remains
 * the only ownership concept, and it's org-level, not person-level.
 *
 * VIEWER-DEPENDENT FILTERING — this is the core rule of this service:
 *   For each Assignment that references this asset:
 *     - if viewer.id === assignment.created_by_user_id
 *         → viewer is the sharer of THIS assignment
 *         → sees every Collaborator on it
 *     - else if viewer.id appears in this assignment's assignment_collaborators
 *         → viewer is a Collaborator of THIS assignment
 *         → sees only themselves in the collaborator list
 *     - else
 *         → viewer has no relation to this assignment
 *         → the assignment is DROPPED from the response entirely
 *           (not hidden in the UI — never sent to the client)
 *
 * Role is per-assignment, not per-asset. The same person can be the
 * sharer on one Assignment and a Collaborator on another Assignment,
 * both referencing the same Asset. Do not collapse this into a single
 * top-level viewerRole for the whole response.
 *
 * NO STATUS: Invitation / Assignment / Promotion / Collaboration status
 * are explicitly out of scope for this feature and must not be fetched
 * or returned here. That belongs to other domains.
 *
 * ORDERING: assignments are sorted by created_at ascending (oldest
 * assignment first — i.e. the order access was originally granted).
 * This is enforced in code after fetching, not left to whatever order
 * Postgres happens to return — do not remove this sort.
 *
 * PRIVACY NOTE: "a Collaborator must never learn about other
 * Collaborators" is a real product requirement, not just a display
 * nicety. assignment_collaborators / assignments currently have RLS
 * OFF, so this filtering is the ONLY place this rule is enforced today.
 * Any other code path that queries these tables directly bypasses it.
 * Flagged as higher-priority than other deferred RLS items.
 *
 * Deliberately small, independently-debuggable queries — same
 * reasoning as listSharedAssetsForCollaborator.ts. Do not collapse
 * into one nested embedded query.
 */

import { supabase } from '../../lib/supabase';

export interface SharingPerson {
  id: string;
  name: string;
  email: string | null;
}

export interface SharingAssignment {
  assignmentId: string;
  assignmentTitle: string;
  /** The person who shared this asset via this assignment (= assignments.created_by_user_id). */
  sharedBy: SharingPerson;
  /** Viewer's role on THIS assignment specifically, not on the asset as a whole. */
  viewerRole: 'sponsor' | 'collaborator';
  /** Convenience count — sponsor role: all collaborators on this assignment; collaborator role: always 1 (self only). */
  collaboratorCount: number;
  /** sponsor role → all collaborators on this assignment. collaborator role → only the viewer. */
  collaborators: SharingPerson[];
}

export interface AssetSharingInfo {
  assignments: SharingAssignment[];
}

// ---- Step 1: which assignments reference this asset ----
async function getAssignmentIdsForAsset(assetId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('assignment_assets')
    .select('assignment_id')
    .eq('asset_id', assetId);

  if (error) {
    throw new Error(`Failed to load assignments for asset: ${error.message}`);
  }

  return Array.from(new Set((data ?? []).map((row: any) => row.assignment_id as string)));
}

// ---- Step 2: load those assignments (title + creator + created_at for ordering) ----
async function getAssignments(
  assignmentIds: string[]
): Promise<{ id: string; title: string; created_by_user_id: string; created_at: string }[]> {
  if (assignmentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('assignments')
    .select('id, title, created_by_user_id, created_at')
    .in('id', assignmentIds);

  if (error) {
    throw new Error(`Failed to load assignments: ${error.message}`);
  }

  return (data ?? []) as {
    id: string;
    title: string;
    created_by_user_id: string;
    created_at: string;
  }[];
}

// ---- Step 3: load collaborators for those assignments ----
// Deliberately does NOT select a status column — status is out of scope.
async function getCollaboratorsByAssignment(
  assignmentIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (assignmentIds.length === 0) return map;

  const { data, error } = await supabase
    .from('assignment_collaborators')
    .select('assignment_id, user_id')
    .in('assignment_id', assignmentIds);

  if (error) {
    throw new Error(`Failed to load assignment collaborators: ${error.message}`);
  }

  for (const row of (data ?? []) as { assignment_id: string; user_id: string }[]) {
    const existing = map.get(row.assignment_id) ?? [];
    existing.push(row.user_id);
    map.set(row.assignment_id, existing);
  }

  return map;
}

// ---- Step 5: resolve display profiles for everyone who survives filtering ----
// Mirrors getSharerProfiles in listSharedAssetsForCollaborator.ts exactly —
// same fallback order (full_name -> email -> 'Unknown User').
async function getProfiles(
  userIds: string[]
): Promise<Map<string, { full_name: string | null; email: string | null }>> {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', uniqueIds);

  if (error) {
    throw new Error(`Failed to load profiles: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: any) => [
      row.id as string,
      { full_name: row.full_name as string | null, email: row.email as string | null },
    ])
  );
}

function toPerson(
  userId: string,
  profiles: Map<string, { full_name: string | null; email: string | null }>
): SharingPerson {
  const profile = profiles.get(userId);
  return {
    id: userId,
    name: profile?.full_name || profile?.email || 'Unknown User',
    email: profile?.email ?? null,
  };
}

export async function getAssetSharingInfo(
  assetId: string,
  viewerId: string
): Promise<AssetSharingInfo> {
  const assignmentIds = await getAssignmentIdsForAsset(assetId);
  const assignments = await getAssignments(assignmentIds);
  const collaboratorsByAssignment = await getCollaboratorsByAssignment(assignmentIds);

  // ---- Step 4: viewer-relevance filter (application layer, not SQL) ----
  // This is the one genuinely new piece of logic in this feature — every
  // prior service only ever fetched "my own" rows. Here we're filtering
  // OTHER people's assignment/collaborator rows down to what the viewer
  // is allowed to see. Two independent join paths ("I created it" OR
  // "I'm listed as a collaborator on it") — resolved in JS since the
  // row counts here are small and bounded to a single asset.
  type FilteredAssignment = {
    assignmentId: string;
    assignmentTitle: string;
    createdAt: string;
    sharedByUserId: string;
    viewerRole: 'sponsor' | 'collaborator';
    collaboratorUserIds: string[];
  };

  const filtered: FilteredAssignment[] = [];

  for (const assignment of assignments) {
    const collaboratorIds = collaboratorsByAssignment.get(assignment.id) ?? [];

    if (assignment.created_by_user_id === viewerId) {
      filtered.push({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        createdAt: assignment.created_at,
        sharedByUserId: assignment.created_by_user_id,
        viewerRole: 'sponsor',
        collaboratorUserIds: collaboratorIds,
      });
      continue;
    }

    if (collaboratorIds.includes(viewerId)) {
      filtered.push({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        createdAt: assignment.created_at,
        sharedByUserId: assignment.created_by_user_id,
        viewerRole: 'collaborator',
        // Collaborator role: only the viewer themselves, never the rest
        // of the list. This is the privacy rule — enforced here, before
        // any profile is even resolved.
        collaboratorUserIds: [viewerId],
      });
      continue;
    }

    // Viewer has no relation to this assignment — dropped entirely.
  }

  // Fixed ordering — oldest assignment (earliest created_at) first.
  // Do not rely on whatever order Postgres/PostgREST happens to return.
  filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // ---- Step 5: resolve everyone who survived filtering ----
  const allUserIds = filtered.flatMap(a => [a.sharedByUserId, ...a.collaboratorUserIds]);
  const profiles = await getProfiles(allUserIds);

  return {
    assignments: filtered.map(a => ({
      assignmentId: a.assignmentId,
      assignmentTitle: a.assignmentTitle,
      sharedBy: toPerson(a.sharedByUserId, profiles),
      viewerRole: a.viewerRole,
      collaboratorCount: a.collaboratorUserIds.length,
      collaborators: a.collaboratorUserIds.map(id => toPerson(id, profiles)),
    })),
  };
}
