/**
 * src/services/asset/archiveUiVisibility.ts
 *
 * Level 1 <-> Level 2 UI VISIBILITY ONLY — not an archive mechanism, not a
 * reason source. See getAssetArchiveContext.ts for the actual resolver
 * that decides *why* an Asset is archived; this module only decides
 * whether an already-archived Asset is shown (Level 1) or hidden
 * (Level 2) for the current viewer.
 *
 * Presence of an archive_ui_visibility row (entity_type='asset') = Level 2.
 * Absence = Level 1. Per product decision, Unhide DELETES the row rather
 * than nulling hidden_at — hidden_at is NOT NULL in the LOCKED schema,
 * and "no row" is the canonical Level 1 state.
 *
 * NEVER writes asset_user_states.archived_at, videos.archived_at, or
 * campaigns.archived_at. Hiding an already-archived Asset must never be
 * confused with restoring it — Hide/Unhide and Archive/Restore are
 * completely separate actions operating on completely separate tables.
 *
 * Callers:
 *   - pages/Assets.tsx (Level 1 Hide button, Level 2 modal Unhide button)
 */

import { supabase } from '../../lib/supabase';

const ENTITY_TYPE_ASSET = 'asset' as const;

/**
 * Hide is only ever triggered by an explicit user action on an
 * already-archived Asset — there is no automatic hiding. Upsert since a
 * prior row for this pair may or may not exist (Unhide deletes it, so a
 * re-hide after re-archival is a fresh insert as often as not).
 */
export async function hideAssetForUser(assetId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('archive_ui_visibility')
    .upsert(
      {
        entity_type: ENTITY_TYPE_ASSET,
        entity_id: assetId,
        user_id: userId,
        hidden_at: new Date().toISOString(),
      },
      { onConflict: 'entity_type,entity_id,user_id' }
    );

  if (error) {
    throw new Error(`Failed to hide asset: ${error.message}`);
  }
}

/**
 * Unhide DELETES the row (product decision — see file header). Only ever
 * acts on (assetId, the CURRENT user's id) — can never affect another
 * viewer's Level 1/Level 2 state for the same Asset.
 */
export async function unhideAssetForUser(assetId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('archive_ui_visibility')
    .delete()
    .eq('entity_type', ENTITY_TYPE_ASSET)
    .eq('entity_id', assetId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to unhide asset: ${error.message}`);
  }
}

/**
 * All asset ids the given user has currently hidden (Level 2), for
 * annotating a list client-side — same Map/Set-bulk pattern as
 * assetArchive.ts's getArchivedAssetIdsForUser. Exposed for callers that
 * need hidden state alone without the full archive context (e.g. a
 * lightweight badge); getAssetArchiveContextsForViewer already includes
 * this signal in `isHiddenByViewer` / `level` for the main list flow.
 */
export async function getHiddenAssetIdsForUser(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('entity_id')
    .eq('entity_type', ENTITY_TYPE_ASSET)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to load hidden assets for user: ${error.message}`);
  }

  return new Set((data ?? []).map((row: any) => row.entity_id as string));
}
