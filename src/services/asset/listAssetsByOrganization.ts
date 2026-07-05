/**
 * src/services/asset/listAssetsByOrganization.ts
 *
 * Returns Library-visible assets (added_to_library_at IS NOT NULL) joined
 * with `videos` for display metadata (Design Lock §3 Step 6).
 *
 * Consumer: Assets.tsx.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INTEGRATION TESTING FIX (root cause, confirmed):
 *
 * `videos.asset_id -> assets.id` has a regular index but NO UNIQUE
 * constraint. Design Lock §1 (Option A) guarantees "exactly one Video per
 * Asset" as an APPLICATION-level invariant, but PostgREST only looks at the
 * FK/index shape in the DB — without a UNIQUE constraint it cannot infer
 * the relationship is 1:1, so it always embeds `videos` as an ARRAY, even
 * though in practice there is ever only one match.
 *
 * The original version of this file did `row.videos.video_title` — treating
 * the embed as a single object — which silently returned `undefined` for
 * every field (arrays don't have `.video_title`), surfacing in Assets.tsx as
 * "Untitled" / no thumbnail / no platform. The join itself was working the
 * whole time; the shape assumption was wrong.
 *
 * Fix: normalize the array here (take the first/only match) and flatten it
 * onto the asset, so the returned shape matches the ORIGINAL Design Lock §5
 * API Contract exactly — `Array<Asset & { video_title, thumbnail_url,
 * platform }>` — not a nested `videos` object/array. (The previous version
 * of this file had drifted from that contract into a nested shape, which is
 * what made the array-vs-object mismatch possible in the first place.)
 *
 * Not fixed at the schema level (no UNIQUE constraint added) — that would be
 * a DB/architecture change outside this pass's scope, not just an
 * integration bug fix. Flagging it here as a real gap worth a deliberate
 * decision later, not something to slip in silently:
 *   TODO(future): consider `ALTER TABLE videos ADD CONSTRAINT
 *   videos_asset_id_unique UNIQUE (asset_id);` to make the 1:1 invariant
 *   enforceable at the DB level and let PostgREST embed it as an object
 *   natively. Requires your explicit sign-off since it's a schema change.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Only the `video` asset_type branch is implemented, per Import Philosophy
 * point 5 (new types are introduced only when a concrete consumer exists).
 */

import { supabase } from '../../lib/supabase';
import type { Asset } from '../../lib/supabase';
import type { ListAssetsByOrganizationInput } from './types';

export interface AssetLibraryRow extends Asset {
  video_id: string | null;
  video_title: string | null;
  thumbnail_url: string | null;
  platform: string | null;
  deleted_at: string | null;
}

interface EmbeddedVideo {
  id: string;
  video_title: string | null;
  thumbnail_url: string | null;
  platform: string | null;
  deleted_at: string | null;
}

export async function listAssetsByOrganization({
  organizationId,
  filters,
}: ListAssetsByOrganizationInput): Promise<AssetLibraryRow[]> {
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

  return (data ?? []).map((row: any) => {
    // Normalize: PostgREST gives us an array here (see comment above).
    // `!inner` guarantees at least one match, and the domain invariant
    // (Design Lock §1, Option A) guarantees there's never more than one —
    // so [0] is safe, not a guess.
    const rawVideo = row.videos;
    const video: EmbeddedVideo | undefined = Array.isArray(rawVideo) ? rawVideo[0] : rawVideo;

    const { videos: _omit, ...asset } = row;

    return {
      ...asset,
      video_id: video?.id ?? null,
      video_title: video?.video_title ?? null,
      thumbnail_url: video?.thumbnail_url ?? null,
      platform: video?.platform ?? null,
      deleted_at: video?.deleted_at ?? null,
    } as AssetLibraryRow;
  });
}
