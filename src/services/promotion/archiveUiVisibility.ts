/**
 * src/services/promotion/archiveUiVisibility.ts
 *
 * Level 1 <-> Level 2 UI VISIBILITY ONLY for Promotion Surface A — not an
 * archive mechanism, not a reason source. See getPromotionArchiveContext.ts
 * for the resolver that decides *whether* a Promotion is archived (Surface
 * A, `promotion_user_states.archived_at`); this module only decides
 * whether an already-archived Promotion is shown (Level 1) or hidden
 * (Level 2) for the current viewer.
 *
 * Explicitly Surface A ONLY. Has nothing to do with Surface B (Asset
 * Archive Impact) — Archive Impact never has Level 1/Level 2, is never
 * written here, and never touches this table. Do not conflate the two.
 *
 * Presence of an archive_ui_visibility row (entity_type='promotion') =
 * Level 2. Absence = Level 1. Same product decision as Asset/Video/
 * Campaign: Unhide DELETES the row rather than nulling hidden_at.
 *
 * NEVER writes promotion_user_states.archived_at. Hiding an
 * already-archived Promotion must never be confused with restoring it —
 * Restore is only ever available at Level 1 (see promotionArchive.ts's
 * restorePromotionForUser, unchanged, called from Level 1 UI only).
 *
 * Deliberately duplicated from services/campaign/archiveUiVisibility.ts
 * rather than generalized — same "duplicate, don't generalize"
 * principle used for Video vs Asset vs Campaign (unchanged here).
 *
 * Callers:
 *   - pages/Marketplace.tsx (Level 1 inline Archived Promotions view — Hide;
 *                             Level 2 Hidden Promotions modal — Unhide)
 *   - pages/PromotionDetail.tsx (Hide / Unhide action at the detail level)
 */

import { supabase } from '../../lib/supabase';

const ENTITY_TYPE_PROMOTION = 'promotion' as const;

/**
 * Hide is only ever triggered by an explicit user action on an
 * already-archived Promotion (Level 1) — there is no automatic hiding.
 */
export async function hidePromotionForUser(promotionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('archive_ui_visibility')
    .upsert(
      {
        entity_type: ENTITY_TYPE_PROMOTION,
        entity_id: promotionId,
        user_id: userId,
        hidden_at: new Date().toISOString(),
      },
      { onConflict: 'entity_type,entity_id,user_id' }
    );

  if (error) {
    throw new Error(`Failed to hide promotion: ${error.message}`);
  }
}

/**
 * Unhide DELETES the row (product decision — see file header). Only
 * ever acts on (promotionId, the CURRENT user's id). Returns the
 * Promotion to Level 1 — it does NOT touch promotion_user_states, so it
 * never returns the Promotion to My Promotions.
 */
export async function unhidePromotionForUser(promotionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('archive_ui_visibility')
    .delete()
    .eq('entity_type', ENTITY_TYPE_PROMOTION)
    .eq('entity_id', promotionId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to unhide promotion: ${error.message}`);
  }
}

/**
 * All promotion ids the given user has currently hidden (Level 2).
 */
export async function getHiddenPromotionIdsForUser(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('entity_id')
    .eq('entity_type', ENTITY_TYPE_PROMOTION)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to load hidden promotions for user: ${error.message}`);
  }

  return new Set((data ?? []).map((row: any) => row.entity_id as string));
}