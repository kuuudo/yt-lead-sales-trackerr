/**
 * Phase 2 — Assignment-level Creative Mode + Asset Scope updates.
 *
 * Source of truth: assignments.creative_creation_mode / asset_scope /
 * creative_campaign_id. Service-layer transition guards (do not rely on UI alone).
 *
 * Locked transitions:
 *   NULL → only NULL (cannot enter Creative)
 *   campaign_asset_only ↔ campaign_links_and_assets
 *   Creative → NULL forbidden
 *   asset_scope only when mode is Creative; NULL mode forces asset_scope NULL
 *
 * creative_campaign_id:
 *   campaign_asset_only → always cleared to NULL
 *   campaign_links_and_assets → must already have a non-null id (no auto-pick)
 *   ONLY PROMOTE ASSET must never be written as creative_campaign_id
 */

import { supabase } from '../../lib/supabase';

export type CreativeCreationMode =
  | null
  | 'campaign_asset_only'
  | 'campaign_links_and_assets';

export type AssetScope = null | 'promotion_only' | 'allow_additional';

export interface AssignmentCreativeSettings {
  creative_creation_mode: CreativeCreationMode;
  asset_scope: AssetScope;
  creative_campaign_id: string | null;
}

export interface UpdateAssignmentCreativeSettingsInput {
  assignmentId: string;
  /** Desired mode; omit to leave unchanged */
  creative_creation_mode?: CreativeCreationMode;
  /** Desired scope; omit to leave unchanged (or force NULL when mode is NULL) */
  asset_scope?: AssetScope;
}

function normalizeMode(raw: string | null | undefined): CreativeCreationMode {
  if (raw === 'campaign_asset_only' || raw === 'campaign_links_and_assets') return raw;
  return null;
}

function normalizeScope(raw: string | null | undefined): AssetScope {
  if (raw === 'promotion_only' || raw === 'allow_additional') return raw;
  return null;
}

/**
 * Apply Creative Mode / Asset Scope change with transition validation.
 * Caller must already be authorized (Sponsor); RLS still applies on UPDATE.
 */
export async function updateAssignmentCreativeSettings(
  input: UpdateAssignmentCreativeSettingsInput
): Promise<AssignmentCreativeSettings> {
  const { assignmentId } = input;
  if (!assignmentId) {
    throw new Error('assignmentId is required');
  }

  const { data: row, error: fetchError } = await supabase
    .from('assignments')
    .select('id, creative_creation_mode, asset_scope, creative_campaign_id')
    .eq('id', assignmentId)
    .single();

  if (fetchError || !row) {
    throw new Error(fetchError?.message ?? 'Assignment not found');
  }

  const currentMode = normalizeMode(row.creative_creation_mode as string | null);
  const currentScope = normalizeScope(row.asset_scope as string | null);
  let currentCampaignId = (row.creative_campaign_id as string | null) ?? null;

  const nextMode: CreativeCreationMode =
    input.creative_creation_mode !== undefined
      ? input.creative_creation_mode
      : currentMode;

  // ── Mode transition guards ──────────────────────────────────────────
  if (currentMode === null && nextMode !== null) {
    throw new Error(
      'Cannot enable Creative Mode on an Assignment that was created without content creation'
    );
  }
  if (currentMode !== null && nextMode === null) {
    throw new Error('Cannot disable Creative Mode once it has been enabled');
  }
  if (
    nextMode !== null &&
    nextMode !== 'campaign_asset_only' &&
    nextMode !== 'campaign_links_and_assets'
  ) {
    throw new Error(`Invalid creative_creation_mode: ${String(nextMode)}`);
  }

  // ── creative_campaign_id ────────────────────────────────────────────
  let nextCampaignId: string | null = currentCampaignId;
  if (nextMode === 'campaign_asset_only') {
    nextCampaignId = null;
  } else if (nextMode === 'campaign_links_and_assets') {
    if (!nextCampaignId) {
      throw new Error(
        'Campaign + links + assets requires a creative campaign already set on this Assignment. Cannot switch without one (no automatic campaign selection).'
      );
    }
  } else {
    // NULL mode
    nextCampaignId = null;
  }

  // ── Asset scope ─────────────────────────────────────────────────────
  let nextScope: AssetScope;
  if (nextMode === null) {
    nextScope = null;
    if (input.asset_scope != null) {
      throw new Error('asset_scope is not allowed when Creative Mode is disabled');
    }
  } else {
    if (input.asset_scope !== undefined) {
      nextScope = input.asset_scope;
    } else if (currentScope) {
      nextScope = currentScope;
    } else {
      nextScope = 'promotion_only';
    }
    if (nextScope !== 'promotion_only' && nextScope !== 'allow_additional') {
      throw new Error(`Invalid asset_scope: ${String(nextScope)}`);
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('assignments')
    .update({
      creative_creation_mode: nextMode,
      asset_scope: nextScope,
      creative_campaign_id: nextCampaignId,
    })
    .eq('id', assignmentId)
    .select('creative_creation_mode, asset_scope, creative_campaign_id')
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? 'Failed to update Creative settings');
  }

  return {
    creative_creation_mode: normalizeMode(updated.creative_creation_mode as string | null),
    asset_scope: normalizeScope(updated.asset_scope as string | null),
    creative_campaign_id: (updated.creative_campaign_id as string | null) ?? null,
  };
}
