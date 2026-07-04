/**
 * src/services/asset/listAssetsByOrganization.ts
 *
 * Returns Library-visible assets (added_to_library_at IS NOT NULL) joined
 * with `videos` for display metadata (Design Lock §3 Step 6).
 *
 * Consumer: Assets.tsx (Frontend Phase). Includes `videos.id` in the embed —
 * not in the original Design Lock query sketch, added because Assets.tsx
 * needs it to link each row to the existing VideoDetail.tsx route
 * (`/videos/:id`). This is filling in a real gap the sketch left open, not a
 * redesign of the query shape.
 *
 * NOTE: the embedded-resource syntax below (`videos!inner(...)`) selects
 * from `assets` and reaches across the `videos.asset_id -> assets.id`
 * foreign key in the reverse direction. This has NOT been verified against
 * the live PostgREST schema cache yet. If it 400s in integration testing,
 * the likely fix is switching to the FK-constraint-name form of the embed
 * (e.g. `videos!videos_asset_id_fkey(...)`) — PostgREST sometimes requires
 * the explicit constraint name when a table has more than one relationship
 * to the target. Deferred to Integration Testing per instruction, not a
 * blocker for writing this code.
 *
 * Only the `video` asset_type branch is implemented, per Import Philosophy
 * point 5 (new types are introduced only when a concrete consumer exists).
 */

import { supabase } from '../../lib/supabase';
import type { ListAssetsByOrganizationInput } from './types';

export async function listAssetsByOrganization({
  organizationId,
  filters,
}: ListAssetsByOrganizationInput) {
  let query = supabase
    .from('assets')
    .select('*, videos!inner(id, video_title, thumbnail_url, platform, deleted_at)')
    .eq('organization_id', organizationId)
    .not('added_to_library_at', 'is', null);

  if (filters?.assetType) {
    query = query.eq('asset_type', filters.assetType);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
