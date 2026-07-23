/**
 * src/services/promotion/promotionArchive.ts
 *
 * Personal (per-user) Archive state for Promotions.
 *
 * ARCHITECTURE LOCK: Archive is a VIEW-LEVEL annotation, not a business
 * action and not a Promotion property. A Promotion is visible to both
 * sides of a collaboration at once — the Sponsor
 * (promotions.owner_user_id) and the Collaborator
 * (promotions.assignment_collaborator_id -> assignment_collaborators ->
 * user_id). Archiving is scoped to (promotion_id, user_id): if Ali
 * (Sponsor) archives a promotion, it disappears only from Ali's My
 * Promotions list. WebMood (Collaborator) on the same promotion is
 * completely unaffected, and vice versa.
 *
 * This is why archive state does NOT live on the `promotions` table — a
 * column there would be a single shared value, which is wrong for an
 * object visible to multiple independent parties. It lives in its own
 * table, same shape as asset_user_states / assignment_user_states:
 *
 *   promotion_user_states
 *   ----------------------
 *   id            uuid primary key
 *   promotion_id  uuid references promotions(id)
 *   user_id       uuid references auth.users(id)
 *   archived_at   timestamptz null
 *   created_at    timestamptz not null default now()
 *   unique (promotion_id, user_id)
 *
 * archived_at IS NULL      -> active (not archived) for this user
 * archived_at IS NOT NULL  -> archived for this user
 *
 * Archiving is explicitly NOT any of: cancelling the promotion, stopping
 * or pausing promotion, deleting the promotion, removing a collaborator,
 * revoking access, or changing promotion status. Those are separate,
 * unrelated actions and this module never touches promotions.status,
 * promotion_assets, assignment_collaborators, redirect_links, tracking,
 * analytics, attribution, or Stripe/webhook logic.
 *
 * Deliberately implemented as small, independently-debuggable functions,
 * consistent with assetArchive.ts / assignmentArchive.ts's convention.
 * This module never queries `promotions` for display data (title,
 * status, etc.) and never returns any — callers already have that from
 * listMyPromotions / getPromotionDetail and merge this in as an
 * annotation, the same way archivedMap is merged into Assets.tsx and
 * Marketplace.tsx's Assignments tab today.
 *
 * NOT in scope here (explicitly deferred):
 *   - a global Visibility Context / workspace-wide "hide archived" toggle
 *   - a shared archive.ts helper / unified naming across Campaign/Video/
 *     Asset/Assignment/Promotion
 *   - any change to promotion status, promotion_assets, assignment
 *     lifecycle, redirect/tracking/analytics/attribution, or Stripe/
 *     webhook logic
 *
 * Callers:
 *   - pages/Marketplace.tsx        (getArchivedPromotionIdsForUser, archive/restore)
 *   - pages/PromotionDetail.tsx    (getPromotionArchiveState, restore)
 */

import { supabase } from '../../lib/supabase';

/**
 * All promotion ids the given user has personally archived, mapped to
 * the archived_at timestamp. Used to annotate the My Promotions list
 * client-side — same pattern as assetArchive.ts's
 * getArchivedAssetIdsForUser / assignmentArchive.ts's
 * getArchivedAssignmentIdsForUser.
 */
export async function getArchivedPromotionIdsForUser(
  userId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('promotion_user_states')
    .select('promotion_id, archived_at')
    .eq('user_id', userId)
    .not('archived_at', 'is', null);

  if (error) {
    throw new Error(`Failed to load archived promotions for user: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: any) => [row.promotion_id as string, row.archived_at as string])
  );
}

/**
 * Archive state for a single promotion, for the given user. Returns null
 * when the promotion is not archived by this user (including when no
 * promotion_user_states row exists at all yet).
 */
export async function getPromotionArchiveState(
  promotionId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('promotion_user_states')
    .select('archived_at')
    .eq('promotion_id', promotionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load promotion archive state: ${error.message}`);
  }

  return (data?.archived_at as string | null) ?? null;
}

/**
 * Archive is only ever triggered by an explicit user action in the UI —
 * there is no automatic/time-based archiving anywhere. Upsert on
 * (promotion_id, user_id) since this is the first archive action for
 * this pair as often as not (no existing row to update).
 */
export async function archivePromotionForUser(promotionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('promotion_user_states')
    .upsert(
      { promotion_id: promotionId, user_id: userId, archived_at: new Date().toISOString() },
      { onConflict: 'promotion_id,user_id' }
    );

  if (error) {
    throw new Error(`Failed to archive promotion: ${error.message}`);
  }
}

/**
 * Restore only ever clears the CURRENT user's own archive state — it can
 * never affect the other party's view of the same promotion, and never
 * touches promotion status, promotion_assets, or assignment/collaborator
 * relationships.
 */
export async function restorePromotionForUser(promotionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('promotion_user_states')
    .update({ archived_at: null })
    .eq('promotion_id', promotionId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to restore promotion: ${error.message}`);
  }
}
