/**
 * resolvePartnerRelationshipPromotions.ts
 *
 * Maps a selected Partner (Marketer user id OR Sponsor org id) to the
 * promotion ids that belong to that exact Sponsor↔Marketer assignment
 * relationship — the same chain Top Sponsors / assignment_collaborators use.
 *
 * Does NOT use videos.user_id. Does NOT invent revenue.
 */

import { supabase } from '../../lib/supabase';

export type PartnerJourneyMode = 'marketers' | 'sponsors';

export type RelationshipPromotion = {
  promotionId: string;
  title: string;
};

/**
 * Promotions for the selected partner(s).
 *
 * Marketers mode (viewer is Sponsor, partnerId = marketer user id):
 *   promotions in viewer's org where assignment_collaborator.user_id = partnerId
 *
 * Sponsors mode (viewer is Marketer, partnerId = sponsor organization id):
 *   promotions in partner org where assignment_collaborator.user_id = viewerUserId
 */
export async function resolvePartnerRelationshipPromotions(args: {
  mode: PartnerJourneyMode;
  /** Selected partner ids from the Partner table. */
  partnerIds: string[];
  /** Logged-in (or viewing) user id — the marketer side of the relationship. */
  viewerUserId: string | null;
  /** Current organization id — the sponsor org when mode is marketers. */
  viewerOrganizationId: string | null;
}): Promise<RelationshipPromotion[]> {
  const { mode, partnerIds, viewerUserId, viewerOrganizationId } = args;
  if (partnerIds.length === 0) return [];

  if (mode === 'marketers') {
    // Viewer = Sponsor org. Partners = marketer user ids.
    if (!viewerOrganizationId) return [];
    return promotionsInOrgForMarketers(viewerOrganizationId, partnerIds);
  }

  // mode === 'sponsors': Viewer = Marketer. Partners = sponsor org ids.
  if (!viewerUserId) return [];
  return promotionsInOrgsForMarketer(partnerIds, viewerUserId);
}

async function promotionsInOrgForMarketers(
  organizationId: string,
  marketerUserIds: string[],
): Promise<RelationshipPromotion[]> {
  const { data: collabs, error: cErr } = await supabase
    .from('assignment_collaborators')
    .select('id, user_id')
    .in('user_id', marketerUserIds);
  if (cErr) {
    console.warn('[resolvePartnerRelationshipPromotions] collabs', cErr.message);
    return [];
  }
  const collabIds = (collabs ?? []).map((c: { id: string }) => c.id).filter(Boolean);
  if (collabIds.length === 0) return [];

  const { data: promos, error: pErr } = await supabase
    .from('promotions')
    .select('id, assignment_id, assignment_collaborator_id, organization_id')
    .eq('organization_id', organizationId)
    .in('assignment_collaborator_id', collabIds);
  if (pErr) {
    console.warn('[resolvePartnerRelationshipPromotions] promos', pErr.message);
    return [];
  }
  return attachTitles(promos ?? []);
}

async function promotionsInOrgsForMarketer(
  sponsorOrgIds: string[],
  marketerUserId: string,
): Promise<RelationshipPromotion[]> {
  const { data: collabs, error: cErr } = await supabase
    .from('assignment_collaborators')
    .select('id')
    .eq('user_id', marketerUserId);
  if (cErr) {
    console.warn('[resolvePartnerRelationshipPromotions] collabs', cErr.message);
    return [];
  }
  const collabIds = (collabs ?? []).map((c: { id: string }) => c.id).filter(Boolean);
  if (collabIds.length === 0) return [];

  const out: { id: string; assignment_id?: string | null }[] = [];
  for (let i = 0; i < sponsorOrgIds.length; i += 1) {
    const orgId = sponsorOrgIds[i];
    const { data: promos, error: pErr } = await supabase
      .from('promotions')
      .select('id, assignment_id, assignment_collaborator_id, organization_id')
      .eq('organization_id', orgId)
      .in('assignment_collaborator_id', collabIds);
    if (pErr) {
      console.warn('[resolvePartnerRelationshipPromotions] promos org', orgId, pErr.message);
      continue;
    }
    out.push(...(promos ?? []));
  }
  return attachTitles(out);
}

async function attachTitles(
  promos: { id: string; assignment_id?: string | null }[],
): Promise<RelationshipPromotion[]> {
  if (promos.length === 0) return [];
  const assignmentIds = Array.from(
    new Set(promos.map((p) => p.assignment_id).filter((id): id is string => !!id)),
  );
  const titleByAssignment = new Map<string, string>();
  if (assignmentIds.length > 0) {
    const { data: assigns } = await supabase
      .from('assignments')
      .select('id, title')
      .in('id', assignmentIds);
    for (const a of assigns ?? []) {
      const row = a as { id: string; title?: string | null };
      if (row.title) titleByAssignment.set(row.id, row.title);
    }
  }
  const seen = new Set<string>();
  const result: RelationshipPromotion[] = [];
  for (const p of promos) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    result.push({
      promotionId: p.id,
      title: (p.assignment_id && titleByAssignment.get(p.assignment_id)) || p.id,
    });
  }
  return result;
}
