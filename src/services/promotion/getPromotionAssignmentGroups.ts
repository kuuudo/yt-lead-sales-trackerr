/**
 * src/services/promotion/getPromotionAssignmentGroups.ts
 *
 * Composes listMyPromotionsGrouped() (collaborationHub.ts) with
 * listAssignmentCollaborators() into the person-grouped tree the
 * Promotion filter's Assigned to Me / Assigned by Me tabs render:
 *
 *   assignedToMe: grouped by Sponsor  (promotion.owner, already joined)
 *   assignedByMe: grouped by Marketer (resolved via the assignment's
 *                 collaborator roster — see below)
 *
 * Pure composition — no new table, no new query pattern beyond what
 * listMyPromotionsGrouped() and listAssignmentCollaborators() already
 * do. Loads zero asset data; Promotion + person identity only. Assets
 * load later, only when a specific Promotion is actually opened.
 *
 * De-dup rule for assignedByMe: listAssignmentCollaborators() is called
 * ONCE per distinct assignment_id, never once per promotion. A Sponsor
 * with 50 promotions under one Assignment still only costs one roster
 * fetch for that Assignment.
 */

import { listMyPromotionsGrouped, type PromotionSummary } from '../assignment/collaborationHub';
import { listAssignmentCollaborators } from '../assignment/listAssignmentCollaborators';

export interface AssignmentGroupPerson {
  id: string;
  name: string;
  email: string | null;
}

export interface AssignmentGroup {
  person: AssignmentGroupPerson;
  promotions: PromotionSummary[];
}

export interface PromotionAssignmentGroups {
  assignedToMe: AssignmentGroup[];
  assignedByMe: AssignmentGroup[];
}

export async function getPromotionAssignmentGroups(userId: string): Promise<PromotionAssignmentGroups> {
  const { assignedToMe, assignedByMe } = await listMyPromotionsGrouped(userId);

  // ── assignedToMe: group by Sponsor ──────────────────────────────────
  // Sponsor identity is already embedded via listMyPromotions()'s
  // `owner` join — no extra fetch needed.
  const toMeByOwner = new Map<string, AssignmentGroup>();
  for (const p of assignedToMe) {
    const ownerId = p.owner_user_id;
    if (!toMeByOwner.has(ownerId)) {
      toMeByOwner.set(ownerId, {
        person: {
          id: ownerId,
          name: p.owner?.full_name || p.owner?.email || 'Unknown User',
          email: p.owner?.email ?? null,
        },
        promotions: [],
      });
    }
    toMeByOwner.get(ownerId)!.promotions.push(p);
  }

  // ── assignedByMe: group by Marketer ─────────────────────────────────
  // Marketer identity is NOT embedded in listMyPromotions() (only
  // assignment_collaborator.status is selected there). Resolve it by
  // fetching each distinct Assignment's full roster once, then matching
  // each promotion's assignment_collaborator_id back to the right row.
  const distinctAssignmentIds = Array.from(
    new Set(assignedByMe.map(p => p.assignment_id).filter((id): id is string => !!id))
  );

  const rosterEntries = await Promise.all(
    distinctAssignmentIds.map(
      async (assignmentId) => [assignmentId, await listAssignmentCollaborators(assignmentId)] as const
    )
  );
  const rostersByAssignmentId = new Map(rosterEntries);

  const byMeByMarketer = new Map<string, AssignmentGroup>();
  for (const p of assignedByMe) {
    if (!p.assignment_id || !p.assignment_collaborator_id) continue;
    const roster = rostersByAssignmentId.get(p.assignment_id) ?? [];
    const collaborator = roster.find(c => c.id === p.assignment_collaborator_id);
    if (!collaborator) continue; // don't mislabel — skip rather than guess

    if (!byMeByMarketer.has(collaborator.user_id)) {
      byMeByMarketer.set(collaborator.user_id, {
        person: { id: collaborator.user_id, name: collaborator.name, email: collaborator.email },
        promotions: [],
      });
    }
    byMeByMarketer.get(collaborator.user_id)!.promotions.push(p);
  }

  return {
    assignedToMe: Array.from(toMeByOwner.values()),
    assignedByMe: Array.from(byMeByMarketer.values()),
  };
}