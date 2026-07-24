/**
 * src/services/asset/assetArchive.ts
 *
 * Personal (per-user) Archive state for Assets.
 *
 * ARCHITECTURE LOCK: Archive is a VIEW-LEVEL annotation, not an Asset
 * property. Assets are shared objects — the same asset_id can be visible
 * to an Owner (My Assets) and to one or more Collaborators (Shared
 * Assets) at once. Archiving is scoped to (asset_id, user_id): if Ali
 * archives an asset, it disappears only from Ali's views. WebMood's view
 * of the same asset is completely unaffected.
 *
 * This is why archive state does NOT live on the `assets` table — a
 * column there would be a single shared value, which is wrong for a
 * shared object. It lives in its own table:
 *
 *   asset_user_states
 *   -----------------
 *   id            uuid primary key
 *   asset_id      uuid references assets(id)
 *   user_id       uuid references auth.users(id)  -- or profiles(id)
 *   archived_at   timestamptz null
 *   created_at    timestamptz not null default now()
 *   unique (asset_id, user_id)
 *
 * archived_at IS NULL      -> active (not archived) for this user
 * archived_at IS NOT NULL  -> archived for this user
 *
 * This mirrors the Campaign/Video archive convention (archived_at null =
 * active, set = archived, restore sets it back to null — row is never
 * deleted), just scoped per-user instead of being a column on the shared
 * row itself.
 *
 * Deliberately implemented as small, independently-debuggable functions,
 * consistent with getAssignedAssetSummaryForOwner.ts's convention. This
 * module never queries `assets` and never returns display data (title,
 * thumbnail, etc.) — callers already have that from listAssetsByOrganization
 * / listSharedAssetsForCollaborator and merge this in as an annotation,
 * exactly the way Assigned is merged in today.
 *
 * NOT in scope here (explicitly deferred):
 *   - a global Visibility Context / workspace-wide "hide archived" toggle
 *   - a shared archive.ts helper / unified naming across Campaign/Video/Asset
 *   - revoking sharing, stopping assignments, or any permission change
 *
 * Callers:
 *   - pages/Assets.tsx        (getArchivedAssetIdsForUser, archive/restore)
 *   - pages/AssetDetail.tsx   (getAssetArchiveState, archive/restore)
 */

import { supabase } from '../../lib/supabase';

/**
 * All asset ids the given user has personally archived, mapped to the
 * archived_at timestamp. Used to annotate My/Shared rows client-side —
 * same pattern as getAssignedAssetSummaryForOwner's assetId -> count Map.
 */
export async function getArchivedAssetIdsForUser(
  userId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('asset_user_states')
    .select('asset_id, archived_at')
    .eq('user_id', userId)
    .not('archived_at', 'is', null);

  if (error) {
    throw new Error(`Failed to load archived assets for user: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: any) => [row.asset_id as string, row.archived_at as string])
  );
}

/**
 * Archive state for a single asset, for the given user. Returns null when
 * the asset is not archived by this user (including when no
 * asset_user_states row exists at all yet)..
 */
export async function getAssetArchiveState(
  assetId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('asset_user_states')
    .select('archived_at')
    .eq('asset_id', assetId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load archive state: ${error.message}`);
  }

  return (data?.archived_at as string | null) ?? null;
}

/**
 * Archive is only ever triggered by an explicit user action in the UI —
 * there is no automatic/time-based archiving anywhere. Upsert on
 * (asset_id, user_id) since this is the first archive action for this
 * pair as often as not (no existing row to update).
 */
export async function archiveAssetForUser(assetId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('asset_user_states')
    .upsert(
      { asset_id: assetId, user_id: userId, archived_at: new Date().toISOString() },
      { onConflict: 'asset_id,user_id' }
    );

  if (error) {
    throw new Error(`Failed to archive asset: ${error.message}`);
  }
}

/**
 * Restore only ever clears the CURRENT user's own archive state — it can
 * never affect another user's view of the same asset, and never touches
 * sharing, assignments, or ownership.
 */
export async function restoreAssetForUser(assetId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('asset_user_states')
    .update({ archived_at: null })
    .eq('asset_id', assetId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to restore asset: ${error.message}`);
  }
}
