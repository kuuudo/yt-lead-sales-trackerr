/**
 * src/services/campaign/archiveUiVisibility.ts
 *
 * Level 1 <-> Level 2 UI VISIBILITY ONLY for Campaign — not an archive
 * mechanism, not a reason source. See getCampaignArchiveContext.ts for
 * the resolver that decides *why* a Campaign is archived; this module
 * only decides whether an already-archived Campaign is shown (Level 1)
 * or hidden (Level 2) for the current viewer.
 *
 * Presence of an archive_ui_visibility row (entity_type='campaign') =
 * Level 2. Absence = Level 1. Same product decision as Asset/Video:
 * Unhide DELETES the row rather than nulling hidden_at.
 *
 * NEVER writes campaigns.archived_at. Hiding an already-archived
 * Campaign must never be confused with restoring it.
 *
 * Deliberately duplicated from services/video/archiveUiVisibility.ts
 * rather than generalized — same "duplicate, don't generalize"
 * principle used for Video vs Asset (Phase 2 decision, unchanged here).
 *
 * Callers:
 *   - pages/Campaigns.tsx (Level 1 Archive Tab Hide button, Level 2 Hidden modal Unhide button)
 *   - pages/CampaignDetail.tsx (Hide / Unhide action)
 */

import { supabase } from '../../lib/supabase';

const ENTITY_TYPE_CAMPAIGN = 'campaign' as const;

/**
 * Hide is only ever triggered by an explicit user action on an
 * already-archived Campaign — there is no automatic hiding.
 */
export async function hideCampaignForUser(campaignId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('archive_ui_visibility')
    .upsert(
      {
        entity_type: ENTITY_TYPE_CAMPAIGN,
        entity_id: campaignId,
        user_id: userId,
        hidden_at: new Date().toISOString(),
      },
      { onConflict: 'entity_type,entity_id,user_id' }
    );

  if (error) {
    throw new Error(`Failed to hide campaign: ${error.message}`);
  }
}

/**
 * Unhide DELETES the row (product decision — see file header). Only
 * ever acts on (campaignId, the CURRENT user's id).
 */
export async function unhideCampaignForUser(campaignId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('archive_ui_visibility')
    .delete()
    .eq('entity_type', ENTITY_TYPE_CAMPAIGN)
    .eq('entity_id', campaignId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to unhide campaign: ${error.message}`);
  }
}

/**
 * All campaign ids the given user has currently hidden (Level 2).
 */
export async function getHiddenCampaignIdsForUser(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('entity_id')
    .eq('entity_type', ENTITY_TYPE_CAMPAIGN)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to load hidden campaigns for user: ${error.message}`);
  }

  return new Set((data ?? []).map((row: any) => row.entity_id as string));
}