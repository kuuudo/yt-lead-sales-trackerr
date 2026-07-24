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
 * `collaborator.status`, are now exposed so PromotionDetail.tsx can
 * render a Sponsor-only Remove Collaborator action (organization_id for
 * the isSponsor org-membership check, assignment_collaborator_id +
 * collaborator.id as the RPC's target row, collaborator.status to gate
 * the button). This module still only reads — it does not call
 * removeCollaborator() or the RPC itself, and still writes nothing.
 */

import { supabase } from '../../lib/supabase';
import { getAssetDetail } from '../asset/getAssetDetail';
import type { AssetResourceView } from '../asset/getAssetDetail';

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
  } | null;
  sponsor: {
    name: string;
    email: string | null;
  } | null;
  collaborator: {
    id: string;
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
   */
  assets: {
    promotionAssetId: string;
    assetId: string;
    resource: AssetResourceView | null;
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
  ] = await Promise.all([
    promotion.assignment_id
      ? supabase
          .from('assignments')
          .select('id, title')
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
  ]);

  if (assignmentErr) throw new Error(`Failed to load assignment: ${assignmentErr.message}`);
  if (sponsorErr) throw new Error(`Failed to load sponsor profile: ${sponsorErr.message}`);
  if (assetsErr) throw new Error(`Failed to load promoted assets: ${assetsErr.message}`);

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

  return {
    promotion: {
      id: promotion.id,
      status: promotion.status,
      created_at: promotion.created_at,
      assignment_id: promotion.assignment_id,
      organization_id: promotion.organization_id,
      assignment_collaborator_id: promotion.assignment_collaborator_id,
    },
    assignment: assignmentRow ? { id: assignmentRow.id, title: assignmentRow.title } : null,
    sponsor: sponsorProfile
      ? { name: sponsorProfile.full_name || sponsorProfile.email || 'Unknown User', email: sponsorProfile.email ?? null }
      : null,
    collaborator,
    assets,
  };
}
