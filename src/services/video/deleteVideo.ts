/**
 * src/services/video/deleteVideo.ts
 *
 * Implements the Soft Delete Policy (Design Lock §1):
 *
 *   Video NOT in Library (asset.added_to_library_at IS NULL)
 *     → Hard Delete: delete `videos` row, then delete `assets` row
 *
 *   Video IS in Library (asset.added_to_library_at IS NOT NULL)
 *     → Soft Delete: videos.deleted_at = now(); `assets` row untouched
 *
 * Not responsible for:
 *   - Any UI feedback / confirmation dialogs (caller's job — VideoDetail.tsx,
 *     Videos.tsx, both still on the old raw `.delete()` call until the
 *     frontend phase wires this in)
 *   - Removing an Asset from the Library (that's a Library operation, not a delete)
 *   - A general-purpose checkAssetReferences() API — Design Lock §3 Step 2
 *     explicitly says this logic stays internal to the Video Module, not a
 *     separate exported file, since there's no second consumer for it yet.
 *
 * Callers (once wired in a later phase):
 *   - VideoDetail.tsx (line 637 today's raw delete)
 *   - Videos.tsx (line 1690 today's raw batch delete)
 */

import { supabase } from '../../lib/supabase';
import { getAsset } from '../asset/getAsset';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeleteVideoResult {
  deleted: true;
  mode: 'hard' | 'soft';
}

/**
 * Thrown only on the (should-not-happen) hard-delete path when a FK RESTRICT
 * fires. Design Lock §3 Step 4: "理論上此情境不該發生,因為未加入 Library
 * 的 asset 理應沒有其他引用" — this is a defensive translation of a raw DB
 * error into something a caller can render, not an expected steady-state path.
 */
export interface AssetInUseError {
  code: 'ASSET_IN_USE';
  references: {
    assignments: boolean;
    campaigns: boolean;
    redirectLinks: boolean;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function deleteVideo(videoId: string): Promise<DeleteVideoResult> {
  // 1. Fetch the video and resolve its asset.
  const { data: video, error: videoError } = await supabase
    .from('videos')
    .select('id, asset_id')
    .eq('id', videoId)
    .single();

  if (videoError || !video) {
    throw new Error(videoError?.message ?? `Video ${videoId} not found`);
  }

  const asset = await getAsset(video.asset_id);
  if (!asset) {
    // Every Video must have an Asset (Design Lock §1, Option A). If this
    // fires, something upstream is broken — surface it loudly rather than
    // silently guessing a delete mode.
    throw new Error(
      `[deleteVideo] Video ${videoId} references missing Asset ${video.asset_id}`
    );
  }

  // 2a. Soft delete — Asset is in the Library, keep both rows.
  if (asset.added_to_library_at !== null) {
    const { error: updateError } = await supabase
      .from('videos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', videoId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return { deleted: true, mode: 'soft' };
  }

  // 2b. Hard delete — Asset never entered the Library.
  const { error: deleteVideoError } = await supabase
    .from('videos')
    .delete()
    .eq('id', videoId);

  if (deleteVideoError) {
    // TODO: this catches ANY error on the videos delete as a potential
    // FK_RESTRICT, but `videos.id` is also referenced (NO ACTION, not
    // CASCADE) by sessions/events/leads/stripe_purchases/pixel_purchases/
    // video_metrics — tables the Design Lock doesn't mention in this
    // context. Today's existing raw `.delete()` call in VideoDetail.tsx has
    // the same exposure, so this isn't a new regression, but it means an
    // ASSET_IN_USE error could surface here for reasons unrelated to
    // assignments/campaigns/redirect_links. Flagging as an assumption
    // rather than pausing — the Design Lock's own text ("理論上此情境不該
    // 發生") only anticipates the asset-reference case below, not analytics
    // history. Revisit once this is wired to a real UI and we see what
    // actually fires in practice.
    if (isForeignKeyRestrictError(deleteVideoError)) {
      const references = await checkAssetReferences(asset.id);
      throw makeAssetInUseError(references);
    }
    throw new Error(deleteVideoError.message);
  }

  const { error: deleteAssetError } = await supabase
    .from('assets')
    .delete()
    .eq('id', asset.id);

  if (deleteAssetError) {
    if (isForeignKeyRestrictError(deleteAssetError)) {
      const references = await checkAssetReferences(asset.id);
      throw makeAssetInUseError(references);
    }
    throw new Error(deleteAssetError.message);
  }

  return { deleted: true, mode: 'hard' };
}

// ---------------------------------------------------------------------------
// Internal helpers — private to this file, per Design Lock §3 Step 2
// ---------------------------------------------------------------------------

/** Postgres foreign_key_violation SQLSTATE. */
const FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyRestrictError(error: { code?: string }): boolean {
  return error.code === FOREIGN_KEY_VIOLATION;
}

function makeAssetInUseError(references: AssetInUseError['references']): AssetInUseError {
  return { code: 'ASSET_IN_USE', references };
}

/**
 * Only invoked on the FK RESTRICT path, to turn a raw Postgres error into a
 * structured, renderable payload. Deliberately not exported / not a general
 * "check references" API.
 */
async function checkAssetReferences(
  assetId: string
): Promise<AssetInUseError['references']> {
  const [assignments, campaigns, redirectLinks] = await Promise.all([
    supabase
      .from('assignment_assets')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', assetId),
    supabase
      .from('campaign_assets')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', assetId),
    supabase
      .from('redirect_links')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', assetId),
  ]);

  return {
    assignments: (assignments.count ?? 0) > 0,
    campaigns: (campaigns.count ?? 0) > 0,
    redirectLinks: (redirectLinks.count ?? 0) > 0,
  };
}
