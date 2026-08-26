/**
 * src/services/campaign/getCampaignArchiveContext.ts
 *
 * Central Campaign Archive Resolver — READ ONLY. Mirrors the shape of
 * services/asset/getAssetArchiveContext.ts and services/video/getVideoArchiveContext.ts,
 * but simpler: Campaign has exactly one possible archive reason (its own
 * `campaigns.archived_at`), no derived upstream reasons, and no personal
 * `*_user_states` table — archive is global (§10, ARCHIVE_SYSTEM_DESIGN_8.md).
 *
 * Level 1 vs Level 2 is a separate signal — archive_ui_visibility
 * (entity_type='campaign') — used ONLY to compute `level`, never to
 * compute `isArchived`. Does NOT add archive_reason / archive_level /
 * archive_source_* columns — forbidden by LOCKED design.
 *
 * No writes. No cascade reads into videos/assets/promotions — Campaign
 * Archive Impact Guides (downstream informational state) are a separate
 * concern from this resolver and are not implemented here.
 *
 * Callers:
 *   - pages/CampaignDetail.tsx (getCampaignArchiveContext — single campaign)
 *   - pages/Campaigns.tsx      (getCampaignArchiveContextsForViewer — batch, Level 1/2 split)
 */

import { supabase } from '../../lib/supabase';

export type CampaignArchiveLevel = 'normal' | 'level1' | 'level2';

export interface CampaignArchiveContext {
  campaignId: string;
  isArchived: boolean;
  isHiddenByViewer: boolean;
  level: CampaignArchiveLevel;
}

// ── Single-campaign entry point (CampaignDetail.tsx) ─────────────────────

export async function getCampaignArchiveContext(
  campaignId: string,
  viewerId: string
): Promise<CampaignArchiveContext> {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, archived_at')
    .eq('id', campaignId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load campaign for archive context: ${error.message}`);
  }
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found or not visible to this viewer`);
  }

  const isArchived = !!campaign.archived_at;
  const isHiddenByViewer = isArchived ? await getIsHiddenByViewer(campaignId, viewerId) : false;

  return buildContext(campaignId, isArchived, isHiddenByViewer);
}

// ── Batch entry point (Campaigns.tsx — Level 1/Level 2 split) ────────────

export interface CampaignForArchiveContext {
  id: string;
  archivedAt: string | null;
}

export async function getCampaignArchiveContextsForViewer(
  campaignsIn: CampaignForArchiveContext[],
  viewerId: string
): Promise<Map<string, CampaignArchiveContext>> {
  if (campaignsIn.length === 0) return new Map();

  const archivedIds = campaignsIn.filter(c => !!c.archivedAt).map(c => c.id);
  const hiddenSet = archivedIds.length > 0
    ? await getHiddenCampaignIdsBulk(archivedIds, viewerId)
    : new Set<string>();

  const result = new Map<string, CampaignArchiveContext>();
  for (const c of campaignsIn) {
    const isArchived = !!c.archivedAt;
    const isHiddenByViewer = isArchived && hiddenSet.has(c.id);
    result.set(c.id, buildContext(c.id, isArchived, isHiddenByViewer));
  }
  return result;
}

// ── Shared level computation ──────────────────────────────────────────────

function buildContext(
  campaignId: string,
  isArchived: boolean,
  isHiddenByViewer: boolean
): CampaignArchiveContext {
  const level: CampaignArchiveLevel = !isArchived ? 'normal' : isHiddenByViewer ? 'level2' : 'level1';
  return { campaignId, isArchived, isHiddenByViewer, level };
}

// ── Queries ────────────────────────────────────────────────────────────────

async function getIsHiddenByViewer(campaignId: string, viewerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('id')
    .eq('entity_type', 'campaign')
    .eq('entity_id', campaignId)
    .eq('user_id', viewerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load archive_ui_visibility state: ${error.message}`);
  return !!data;
}

async function getHiddenCampaignIdsBulk(
  campaignIds: string[],
  viewerId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('entity_id')
    .eq('entity_type', 'campaign')
    .eq('user_id', viewerId)
    .in('entity_id', campaignIds);

  if (error) throw new Error(`Failed to bulk-load archive_ui_visibility: ${error.message}`);
  return new Set((data ?? []).map((row: any) => row.entity_id as string));
}