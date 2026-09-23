/**
 * Assignment-level Mode + Asset Scope updates.
 *
 * Source of truth:
 *   assignments.assignment_mode (regular | creative)
 *   assignments.asset_scope (promotion_only | allow_additional) — BOTH modes
 *   assignments.creative_campaign_id — Creative only
 *
 * Dual-write legacy creative_creation_mode until retired.
 */

import { supabase } from '../../lib/supabase';
import {
  legacyCreativeCreationModeFor,
  resolveAssignmentMode,
  resolveAssetScope,
  type AssignmentMode,
  type AssetScope as ResolvedAssetScope,
} from './assignmentMode';

export type CreativeCreationMode =
  | null
  | 'campaign_asset_only'
  | 'campaign_links_and_assets';

export type AssetScope = null | 'promotion_only' | 'allow_additional';

export interface AssignmentCreativeSettings {
  assignment_mode: AssignmentMode;
  creative_creation_mode: CreativeCreationMode;
  asset_scope: AssetScope;
  creative_campaign_id: string | null;
}

export interface UpdateAssignmentCreativeSettingsInput {
  assignmentId: string;
  /** Desired product mode; omit to leave unchanged */
  assignment_mode?: AssignmentMode;
  /** @deprecated prefer assignment_mode */
  creative_creation_mode?: CreativeCreationMode;
  /** Desired scope; applies to BOTH Regular and Creative */
  asset_scope?: AssetScope;
}

/**
 * Apply Mode / Asset Scope change with validation.
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
    .select(
      'id, assignment_mode, creative_creation_mode, asset_scope, creative_campaign_id'
    )
    .eq('id', assignmentId)
    .single();

  if (fetchError || !row) {
    throw new Error(fetchError?.message ?? 'Assignment not found');
  }

  const currentMode = resolveAssignmentMode({
    assignment_mode: (row as any).assignment_mode as string | null,
    creative_creation_mode: row.creative_creation_mode as string | null,
  });
  const currentScope = resolveAssetScope(row.asset_scope as string | null);
  let currentCampaignId = (row.creative_campaign_id as string | null) ?? null;

  let nextMode: AssignmentMode = currentMode;
  if (input.assignment_mode === 'regular' || input.assignment_mode === 'creative') {
    nextMode = input.assignment_mode;
  } else if (input.creative_creation_mode !== undefined) {
    if (input.creative_creation_mode === null) {
      if (currentMode === 'creative') {
        throw new Error('Cannot disable Creative Mode once it has been enabled');
      }
      nextMode = 'regular';
    } else if (
      input.creative_creation_mode === 'campaign_asset_only' ||
      input.creative_creation_mode === 'campaign_links_and_assets'
    ) {
      if (currentMode === 'regular') {
        throw new Error(
          'Cannot enable Creative Mode on an Assignment that was created as Regular'
        );
      }
      nextMode = 'creative';
    }
  }

  let nextCampaignId: string | null = currentCampaignId;
  if (nextMode === 'regular') {
    nextCampaignId = null;
  } else {
    nextCampaignId = currentCampaignId;
  }

  // Asset scope — independent of mode (BOTH modes)
  let nextScope: ResolvedAssetScope;
  if (input.asset_scope !== undefined) {
    if (input.asset_scope === null) {
      throw new Error('asset_scope cannot be null; use promotion_only or allow_additional');
    }
    if (
      input.asset_scope !== 'promotion_only' &&
      input.asset_scope !== 'allow_additional'
    ) {
      throw new Error(`Invalid asset_scope: ${String(input.asset_scope)}`);
    }
    nextScope = input.asset_scope;
  } else if (currentScope) {
    nextScope = currentScope;
  } else {
    nextScope = 'promotion_only';
  }

  const legacyMode = legacyCreativeCreationModeFor(nextMode);

  const { data: updated, error: updateError } = await supabase
    .from('assignments')
    .update({
      assignment_mode: nextMode,
      creative_creation_mode: legacyMode,
      asset_scope: nextScope,
      creative_campaign_id: nextCampaignId,
    })
    .eq('id', assignmentId)
    .select(
      'assignment_mode, creative_creation_mode, asset_scope, creative_campaign_id'
    )
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? 'Failed to update Assignment settings');
  }

  const outMode = resolveAssignmentMode({
    assignment_mode: (updated as any).assignment_mode as string | null,
    creative_creation_mode: updated.creative_creation_mode as string | null,
  });
  const outLegacy = updated.creative_creation_mode as CreativeCreationMode;

  return {
    assignment_mode: outMode,
    creative_creation_mode:
      outLegacy === 'campaign_asset_only' || outLegacy === 'campaign_links_and_assets'
        ? outLegacy
        : null,
    asset_scope: resolveAssetScope(updated.asset_scope as string | null),
    creative_campaign_id: (updated.creative_campaign_id as string | null) ?? null,
  };
}
