/**
 * src/services/video/archiveUiVisibility.ts
 *
 * Level 1 <-> Level 2 UI VISIBILITY ONLY for Video — not an archive
 * mechanism, not a reason source. See getVideoArchiveContext.ts for the
 * actual resolver that decides *why* a Video is archived; this module
 * only decides whether an already-archived Video is shown (Level 1) or
 * hidden (Level 2) for the current viewer.
 *
 * Presence of an archive_ui_visibility row (entity_type='video') = Level 2.
 * Absence = Level 1. Same product decision as Asset (§11a Implementation
 * Decision 1): Unhide DELETES the row rather than nulling hidden_at —
 * hidden_at is NOT NULL in the LOCKED schema, and "no row" is the
 * canonical Level 1 state.
 *
 * NEVER writes videos.archived_at or campaigns.archived_at. Hiding an
 * already-archived Video must never be confused with restoring it —
 * Hide/Unhide and Archive/Restore are completely separate actions
 * operating on completely separate tables (§8, §12 "Hide" section).
 *
 * Deliberately duplicated from services/asset/archiveUiVisibility.ts
 * rather than generalized — Phase 2 product decision: the verified
 * Phase 1 Asset implementation stays untouched. Revisit only if a
 * dedicated refactor is explicitly requested after Phase 3/4.
 *
 * Callers:
 *   - pages/Videos.tsx (Level 1 Archive Tab Hide button, Level 2 Hidden modal Unhide button)
 *   - pages/VideoDetail.tsx (Hide / Unhide action)
 */

import { supabase } from '../../lib/supabase';

const ENTITY_TYPE_VIDEO = 'video' as const;

/**
 * Hide is only ever triggered by an explicit user action on an
 * already-archived Video — there is no automatic hiding. Upsert since a
 * prior row for this pair may or may not exist (Unhide deletes it, so a
 * re-hide after re-archival is a fresh insert as often as not).
 */
export async function hideVideoForUser(videoId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('archive_ui_visibility')
    .upsert(
      {
        entity_type: ENTITY_TYPE_VIDEO,
        entity_id: videoId,
        user_id: userId,
        hidden_at: new Date().toISOString(),
      },
      { onConflict: 'entity_type,entity_id,user_id' }
    );

  if (error) {
    throw new Error(`Failed to hide video: ${error.message}`);
  }
}

/**
 * Unhide DELETES the row (product decision — see file header). Only ever
 * acts on (videoId, the CURRENT user's id) — can never affect another
 * viewer's Level 1/Level 2 state for the same Video.
 */
export async function unhideVideoForUser(videoId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('archive_ui_visibility')
    .delete()
    .eq('entity_type', ENTITY_TYPE_VIDEO)
    .eq('entity_id', videoId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to unhide video: ${error.message}`);
  }
}

/**
 * All video ids the given user has currently hidden (Level 2), for
 * annotating a list client-side — same Map/Set-bulk pattern as
 * getVideoArchiveContextsForViewer's internal hidden-set lookup.
 * Exposed for callers that need hidden state alone without the full
 * archive context (e.g. a lightweight badge or the "HIDDEN (n)" count).
 */
export async function getHiddenVideoIdsForUser(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('entity_id')
    .eq('entity_type', ENTITY_TYPE_VIDEO)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to load hidden videos for user: ${error.message}`);
  }

  return new Set((data ?? []).map((row: any) => row.entity_id as string));
}
