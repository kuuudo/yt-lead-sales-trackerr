/**
 * src/services/promotion/getPromotionDetail.ts
 *
 * Read-only loader for PromotionDetail.tsx (v1). Promotion Detail is the
 * EXECUTION layer — a snapshot of what got promoted, from whom, to whom,
 * and via which Assignment. It only reads existing relationships:
 *
 *   promotions            (the promotion itself)
 *   promotion_assets       -> asset_id (which assets were promoted)
 *   assignments             (the originating Assignment, for display only)
 *   assignment_collaborators -> user_id -> profiles  (the Collaborator)
 *   profiles                (the Sponsor, via promotions.owner_user_id)
 *
 * No new tables, no new columns, no lifecycle/status writes — this
 * module never calls .insert()/.update()/.delete() on anything.
 *
 * ASSET RESOLUTION: deliberately reuses getAssetDetail.ts's per-asset
 * resolver instead of writing a new one. getAssetDetail() already
 * branches correctly across the three asset kinds (video /
 * asset_resource / campaign_element) and returns the same
 * AssetResourceView shape used on AssetDetail.tsx. Calling it once per
 * promoted asset is an N+1 pattern rather than a single batched query
 * (unlike getAssignmentDetail.ts's toAssetOption, which is a private,
 * non-exported helper built for a Map-batched shape) — acceptable for a
 * first version given promotion_assets counts are small, and it
 * guarantees this page can never drift from AssetDetail.tsx's display
 * logic, since it's the literal same function.
 *
 * ACCESS: no new permission logic here. This module runs a handful of
 * plain selects and lets existing Supabase RLS decide what the calling
 * user can see, exactly like every other service in this codebase. Both
 * the Sponsor (owner_user_id) and the Collaborator
 * (assignment_collaborator_id -> user_id) are expected to already have
 * read access to `promotions`/`promotion_assets`/`assignments` under
 * current policies; this loader does not add or check anything itself,
 * and does not know or care which side of the collaboration is calling
 * it.
 *
 * NOT responsible for: promotion creation, assignment lifecycle,
 * invitations, tracking/redirect/analytics, archive state. None of those
 * are read or written here.
 *
 * PHASE 2A EXTENSION: `promotion.organization_id` and
 * `promotion.assignment_collaborator_id`, plus `collaborator.id` and
 * `collaborator.status`, are exposed so PromotionDetail.tsx can render a
 * Sponsor-only Remove Collaborator action. `assignment.created_by_user_id`
 * is also exposed — this is the LOCKED authorization boundary for who may
 * remove a collaborator (the Assignment's creator only, not organization
 * membership; `promotion.organization_id` is not used for this check —
 * it predates the locked rule and is left in place only because other
 * code may still read it, not because it gates Remove Collaborator).
 * This module still only reads — it does not call removeCollaborator()
 * or the RPC itself, and still writes nothing.
 *
 * PHASE 2C EXTENSION: added `assignedAssets`, a SEPARATE concept from
 * `assets` — do not merge them, do not repurpose one for the other:
 *
 *   `assets`         = promotion_assets  = "what this collaborator
 *                       actually promoted" (unchanged from before,
 *                       byte-for-byte same query/shape as always)
 *   `assignedAssets` = assignment_assets + assignment_asset_access_states
 *                     = "what this collaborator is currently allowed to
 *                       promote" (new)
 *
 * These are genuinely different sets — an asset can be assigned but
 * never promoted (shows in assignedAssets only), or in principle
 * promoted-then-later-revoked (shows in both, with assignedAssets
 * marking it revoked). Collapsing them into one list would make future
 * analytics ambiguous about which concept a given row represents — kept
 * deliberately separate per the locked decision. Still only reads —
 * this module does not call revokeAssetAccess()/restoreAssetAccess() or
 * either RPC itself.
 */

import { supabase } from '../../lib/supabase';
import { getAssetDetail } from '../asset/getAssetDetail';
import type { AssetResourceView } from '../asset/getAssetDetail';
import { getAssetAccessStatesForCollaborator } from '../assignment/assignmentAssetAccess';

export interface PromotionDetailData {
  promotion: {
    id: string;
    status: string;
    created_at: string;
    assignment_id: string | null;
    organization_id: string;
    assignment_collaborator_id: string | null;
  };
  assignment: {
    id: string;
    title: string;
    created_by_user_id: string;
  } | null;
  sponsor: {
    name: string;
    email: string | null;
  } | null;
  collaborator: {
    id: string;
    user_id: string;
    status: string;
    name: string;
    email: string | null;
  } | null;
  /**
   * One entry per promotion_assets row. `resource` is exactly what
   * getAssetDetail() already returns for this asset — same shape
   * AssetDetail.tsx already renders from, so display logic (thumbnail /
   * type resolution) can be lifted from that page as-is rather than
   * reinvented here.
   *
   * MEANING (unchanged): "what this collaborator actually promoted."
   * Do not confuse with `assignedAssets` below — see PHASE 2C EXTENSION
   * note in the file header.
   */
  assets: {
    promotionAssetId: string;
    assetId: string;
    resource: AssetResourceView | null;
  }[];
  /**
   * MEANING (new, Phase 2C): "what this collaborator is currently
   * allowed to promote" — the full assignment_assets list for
   * promotion.assignment_id, cross-referenced against
   * assignment_asset_access_states for promotion.assignment_collaborator_id.
   * Includes assets that were never promoted (e.g. Consultation in the
   * locked example). isRevoked is per-collaborator, per-asset — never
   * assignment-wide.
   */
  assignedAssets: {
    assetId: string;
    resource: AssetResourceView | null;
    isRevoked: boolean;
  }[];
}

export async function getPromotionDetail(promotionId: string): Promise<PromotionDetailData | null> {
  const { data: promotion, error: promotionErr } = await supabase
    .from('promotions')
    .select('id, status, created_at, assignment_id, owner_user_id, organization_id, assignment_collaborator_id')
    .eq('id', promotionId)
    .maybeSingle();

  if (promotionErr) {
    throw new Error(`Failed to load promotion: ${promotionErr.message}`);
  }
  if (!promotion) return null;

  const [
    { data: assignmentRow, error: assignmentErr },
    { data: sponsorProfile, error: sponsorErr },
    { data: promotionAssetRows, error: assetsErr },
    { data: assignmentAssetRows, error: assignmentAssetsErr },
  ] = await Promise.all([
    promotion.assignment_id
      ? supabase
          .from('assignments')
          .select('id, title, created_by_user_id')
          .eq('id', promotion.assignment_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', promotion.owner_user_id)
      .maybeSingle(),
    supabase
      .from('promotion_assets')
      .select('id, asset_id')
      .eq('promotion_id', promotionId),
    // Phase 2C — full authorized asset list for this Assignment, NOT
    // scoped to what was promoted. Only fetched when there's an
    // assignment_id to scope to (a direct org-owner promotion with no
    // Assignment has nothing to show here — assignedAssets stays empty
    // for that case, same "no Assignment involved" treatment already
    // used for `assignment: null`).
    promotion.assignment_id
      ? supabase
          .from('assignment_assets')
          .select('asset_id')
          .eq('assignment_id', promotion.assignment_id)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assignmentErr) throw new Error(`Failed to load assignment: ${assignmentErr.message}`);
  if (sponsorErr) throw new Error(`Failed to load sponsor profile: ${sponsorErr.message}`);
  if (assetsErr) throw new Error(`Failed to load promoted assets: ${assetsErr.message}`);
  if (assignmentAssetsErr) throw new Error(`Failed to load assigned assets: ${assignmentAssetsErr.message}`);

  // Collaborator: assignment_collaborator_id -> assignment_collaborators.user_id -> profiles.
  // Two small steps, same convention as listSharedAssetsForCollaborator.ts's
  // getAssignmentCreators/getSharerProfiles split.
  let collaborator: PromotionDetailData['collaborator'] = null;
  if (promotion.assignment_collaborator_id) {
    const { data: collabRow, error: collabErr } = await supabase
      .from('assignment_collaborators')
      .select('id, user_id, status')
      .eq('id', promotion.assignment_collaborator_id)
      .maybeSingle();

    if (collabErr) throw new Error(`Failed to load collaborator: ${collabErr.message}`);

    if (collabRow?.user_id) {
      const { data: collabProfile, error: collabProfileErr } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', collabRow.user_id)
        .maybeSingle();

      if (collabProfileErr) throw new Error(`Failed to load collaborator profile: ${collabProfileErr.message}`);

      if (collabProfile) {
        collaborator = {
          id: collabRow.id,
          user_id: collabRow.user_id,
          status: collabRow.status,
          name: collabProfile.full_name || collabProfile.email || 'Unknown User',
          email: collabProfile.email ?? null,
        };
      }
    }
  }

  // Reuse getAssetDetail() per promoted asset — see file header. Failures
  // for an individual asset don't fail the whole page; they just render
  // as a missing/untitled entry, same tolerance AssetDetail.tsx already
  // has for unresolved resources.
  const assets = await Promise.all(
    (promotionAssetRows ?? []).map(async (row: any) => {
      const detail = await getAssetDetail(row.asset_id).catch(err => {
        console.error('[getPromotionDetail] getAssetDetail failed for', row.asset_id, err);
        return null;
      });

      return {
        promotionAssetId: row.id as string,
        assetId: row.asset_id as string,
        resource: detail?.resource ?? null,
      };
    })
  );

  // Reuse getAssetDetail() per assigned asset — same reuse rationale as
  // the promoted-assets block above. Access state only needs fetching
  // when there's an assignment_collaborator_id to scope it to (a direct
  // org-owner promotion has no collaborator, so nothing can be revoked
  // from it — assignedAssets falls back to "everything active").
  const accessStateMap = promotion.assignment_collaborator_id
    ? await getAssetAccessStatesForCollaborator(promotion.assignment_collaborator_id)
    : new Map<string, string>();

  const assignedAssets = await Promise.all(
    (assignmentAssetRows ?? []).map(async (row: any) => {
      const detail = await getAssetDetail(row.asset_id).catch(err => {
        console.error('[getPromotionDetail] getAssetDetail failed for assigned asset', row.asset_id, err);
        return null;
      });

      return {
        assetId: row.asset_id as string,
        resource: detail?.resource ?? null,
        isRevoked: accessStateMap.has(row.asset_id as string),
      };
    })
  );

  return {
    promotion: {
      id: promotion.id,
      status: promotion.status,
      created_at: promotion.created_at,
      assignment_id: promotion.assignment_id,
      organization_id: promotion.organization_id,
      assignment_collaborator_id: promotion.assignment_collaborator_id,
    },
    assignment: assignmentRow
      ? { id: assignmentRow.id, title: assignmentRow.title, created_by_user_id: assignmentRow.created_by_user_id }
      : null,
    sponsor: sponsorProfile
      ? { name: sponsorProfile.full_name || sponsorProfile.email || 'Unknown User', email: sponsorProfile.email ?? null }
      : null,
    collaborator,
    assets,
    assignedAssets,
  };
}
