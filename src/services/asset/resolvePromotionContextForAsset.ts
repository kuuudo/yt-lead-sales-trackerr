/**
 * src/services/asset/resolvePromotionContextForAsset.ts
 *
 * READ ONLY. Never creates a Promotion — per locked business rule:
 * "Assignment -> Invitation -> Promotion -> Add/Track Content."
 * A Promotion must already exist before this resolver is ever called from
 * +Track New Content. If none exists for a given shared asset, that is a
 * terminal invalid state for this flow, not something this function (or
 * any caller of it) is allowed to fix by creating one.
 *
 * Answers exactly one question: "For this asset, which Promotion(s) has
 * the CURRENT VIEWER already started, via an assignment they collaborate
 * on, that actually include this asset?"
 *
 * Scope: only meaningful for Shared assets (asset's org != viewer's org).
 * For My/Assigned assets this will naturally return [] (see below) —
 * callers must not treat an empty result as "invalid" for those
 * categories; that interpretation is scoped to Shared assets only and is
 * this function's callers' responsibility, not this function's.
 *
 * Reuses:
 *   - getAssetSharingInfo() — supplies the privacy-correct list of
 *     assignments this viewer collaborates on for this asset, with
 *     assignmentTitle + sharedBy already resolved. Only assignments
 *     where viewerRole === 'collaborator' are relevant here — a
 *     'sponsor'-role assignment means the viewer OWNS the asset/
 *     assignment (My/Assigned case), not the shared-with-me case this
 *     resolver exists for.
 *
 * Does NOT:
 *   - call createPromotion() or any insert/update/delete
 *   - touch provenance-campaign resolvers (resolveAssetCampaign.ts,
 *     resolvePromotionCampaign.ts, ensureResourcePromotionCampaign.ts) —
 *     those answer "where did this asset come from," a different
 *     question from "which tracking Promotion is this asset already
 *     attached to."
 *   - expose or compute a tracking domain/hostname — not wired yet,
 *     deliberately out of scope for this pass.
 */

import { supabase } from '../../lib/supabase';
import { getAssetSharingInfo } from './getAssetSharingInfo';

export interface PromotionContextOption {
  promotionId: string;
  assignmentId: string;
  assignmentTitle: string;
  sharedByName: string;
}

/** The subset of a PromotionContextOption that gets stored/threaded through
 *  once a choice is made (auto-resolved or user-picked) — display-only
 *  fields (assignmentTitle, sharedByName) are dropped at that point since
 *  nothing downstream of selection needs them. */
export interface PromotionContext {
  promotionId: string;
  assignmentId: string;
}

export function toPromotionContext(option: PromotionContextOption): PromotionContext {
  return { promotionId: option.promotionId, assignmentId: option.assignmentId };
}

export async function resolvePromotionContextForAsset(
  assetId: string,
  viewerId: string
): Promise<PromotionContextOption[]> {
  // ── Step 1 (reused): privacy-correct assignment list for this asset ──────
  const sharingInfo = await getAssetSharingInfo(assetId, viewerId);
  const collaboratorAssignments = sharingInfo.assignments.filter(
    a => a.viewerRole === 'collaborator'
  );

  if (collaboratorAssignments.length === 0) {
    // Either not a shared asset, or viewer has no collaborator relation
    // to any assignment referencing it. Not this function's job to
    // decide what that means — callers interpret based on asset category.
    return [];
  }

  const relevantAssignmentIds = collaboratorAssignments.map(a => a.assignmentId);
  const assignmentInfoById = new Map(
    collaboratorAssignments.map(a => [
      a.assignmentId,
      { assignmentTitle: a.assignmentTitle, sharedByName: a.sharedBy.name },
    ])
  );

  // ── Step 2: viewer's own assignment_collaborators row(s) for these ───────
  const { data: collabRows, error: collabErr } = await supabase
    .from('assignment_collaborators')
    .select('id, assignment_id')
    .eq('user_id', viewerId)
    .in('assignment_id', relevantAssignmentIds);

  if (collabErr) {
    throw new Error(`Failed to load assignment_collaborators: ${collabErr.message}`);
  }

  const collaboratorIds = (collabRows ?? []).map((r: any) => r.id as string);
  const assignmentIdByCollaboratorId = new Map(
    (collabRows ?? []).map((r: any) => [r.id as string, r.assignment_id as string])
  );

  if (collaboratorIds.length === 0) return [];

  // ── Step 3: promotions started via one of these collaborator rows ────────
  const { data: promotionRows, error: promotionErr } = await supabase
    .from('promotions')
    .select('id, assignment_collaborator_id')
    .in('assignment_collaborator_id', collaboratorIds);

  if (promotionErr) {
    throw new Error(`Failed to load promotions: ${promotionErr.message}`);
  }

  const candidatePromotions = promotionRows ?? [];
  if (candidatePromotions.length === 0) return [];

  const candidatePromotionIds = candidatePromotions.map((r: any) => r.id as string);

  // ── Step 4: confirm the promotion actually includes THIS asset ───────────
  const { data: promotionAssetRows, error: promotionAssetErr } = await supabase
    .from('promotion_assets')
    .select('promotion_id')
    .eq('asset_id', assetId)
    .in('promotion_id', candidatePromotionIds);

  if (promotionAssetErr) {
    throw new Error(`Failed to load promotion_assets: ${promotionAssetErr.message}`);
  }

  const confirmedPromotionIds = new Set(
    (promotionAssetRows ?? []).map((r: any) => r.promotion_id as string)
  );

  // ── Assemble ───────────────────────────────────────────────────────────
  const results: PromotionContextOption[] = [];
  for (const promo of candidatePromotions as any[]) {
    if (!confirmedPromotionIds.has(promo.id)) continue;

    const assignmentId = assignmentIdByCollaboratorId.get(promo.assignment_collaborator_id);
    if (!assignmentId) continue;

    const info = assignmentInfoById.get(assignmentId);
    if (!info) continue;

    results.push({
      promotionId: promo.id,
      assignmentId,
      assignmentTitle: info.assignmentTitle,
      sharedByName: info.sharedByName,
    });
  }

  return results;
}