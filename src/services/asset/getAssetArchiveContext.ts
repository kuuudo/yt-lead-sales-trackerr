/**
 * src/services/asset/getAssetArchiveContext.ts
 *
 * Central Asset Archive Resolver — READ ONLY. The single authoritative
 * source for "what archive-related state applies to this Asset, for this
 * viewer." Per ARCHIVE_SYSTEM_DESIGN.md §11 (architecture rule): pages and
 * components must consume this resolver's output and must NOT
 * independently join asset_user_states / videos / campaigns to derive
 * archive reasons themselves.
 *
 * Read-only, computed at request time, every time — this module writes
 * nothing and creates no new mutable schema. Reasons are always derived
 * from the three true sources:
 *   1. asset_user_states.archived_at   (personal — Asset LOCKED §7)
 *   2. videos.archived_at              (source Video — only for Type 2 Assets)
 *   3. campaigns.archived_at           (source Campaign — Type 1 & Type 2 only)
 *
 * Level 1 vs Level 2 is a separate, fourth signal — archive_ui_visibility
 * — used ONLY to compute `level`, never to compute `reasons`. Explicitly
 * does not add archive_reason / archive_level / archive_source_* /
 * asset_archive_impacts columns or tables — forbidden by LOCKED design.
 *
 * Asset Type rules (ARCHIVE_SYSTEM_DESIGN.md Asset Type map):
 *   Type 1 (campaign_element): assets -> campaign_element_assets.campaign_id -> campaigns
 *   Type 2 (video):            assets <- videos.asset_id, videos.campaign_id -> campaigns
 *   Type 3 (resource):         NO campaign provenance. Never derive one.
 *
 * Video-derived reasons are gated by Library visibility
 * (assets.added_to_library_at IS NOT NULL), per Design Doc §8 "Derived
 * impact (Library-visible Assets only)":
 *   - "video" reason:    videos.archived_at IS NOT NULL
 *   - "campaign" reason (reached via videos.campaign_id): campaigns.archived_at
 *     IS NOT NULL. IMPLEMENTATION CHOICE, not explicitly pinned by the
 *     Campaign section of the design doc: gated by the SAME
 *     added_to_library_at check as the video reason above, for
 *     consistency — a Campaign-Archived impact on an Asset only makes
 *     product sense once that Asset is actually a visible Library Asset.
 *     Flagging as a technical implementation choice (not a design
 *     reinterpretation) — no product contradiction found.
 *   For Type 1 (campaign_element) Assets, the campaign reason is NOT
 *   gated by added_to_library_at — Campaign Element Assets have no such
 *   gate in the design doc; they're native assets, always visible.
 *
 * Callers:
 *   - pages/AssetDetail.tsx  (getAssetArchiveContext — single asset)
 *   - pages/Assets.tsx       (getAssetArchiveContextsForViewer — batch,
 *                              avoids N+1 on the list page)
 */

import { supabase } from '../../lib/supabase';

export type ArchiveReasonSourceType = 'personal' | 'video' | 'campaign';

export interface ArchiveReason {
  sourceType: ArchiveReasonSourceType;
  /** id of the true source row: the Asset itself (personal), the Video, or the Campaign. */
  sourceId: string;
  /** Display name for the source, or null if unavailable. Never the reason's identity. */
  sourceName: string | null;
}

export type AssetArchiveLevel = 'normal' | 'level1' | 'level2';

export interface AssetArchiveContext {
  assetId: string;
  isArchived: boolean;
  reasons: ArchiveReason[];
  isHiddenByViewer: boolean;
  level: AssetArchiveLevel;
}

// ── Single-asset entry point (AssetDetail.tsx) ──────────────────────────

export async function getAssetArchiveContext(
  assetId: string,
  viewerId: string
): Promise<AssetArchiveContext> {
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('id, asset_type, added_to_library_at')
    .eq('id', assetId)
    .maybeSingle();

  if (assetError) {
    throw new Error(`Failed to load asset for archive context: ${assetError.message}`);
  }
  if (!asset) {
    throw new Error(`Asset ${assetId} not found or not visible to this viewer`);
  }

  const [personalArchivedAt, provenanceReasons, isHiddenByViewer] = await Promise.all([
    getPersonalArchivedAt(assetId, viewerId),
    resolveProvenanceReasons(asset.asset_type as string, asset.id as string, !!asset.added_to_library_at),
    getIsHiddenByViewer(assetId, viewerId),
  ]);

  const reasons: ArchiveReason[] = [];
  if (personalArchivedAt) {
    reasons.push({ sourceType: 'personal', sourceId: assetId, sourceName: null });
  }
  reasons.push(...provenanceReasons);

  return buildContext(assetId, reasons, isHiddenByViewer);
}

// ── Batch entry point (Assets.tsx list page — avoids N+1) ───────────────
// Self-sufficient: only needs {id, assetType} per asset. Bulk-fetches
// added_to_library_at itself rather than trusting a caller-supplied
// value, so it stays the single authoritative source even for the list
// path, and doesn't depend on whatever fields listAssetsByOrganization's
// row type happens to already select.

export interface AssetForArchiveContext {
  id: string;
  assetType: string;
}

export async function getAssetArchiveContextsForViewer(
  assetsIn: AssetForArchiveContext[],
  viewerId: string
): Promise<Map<string, AssetArchiveContext>> {
  if (assetsIn.length === 0) return new Map();

  const assetIds = assetsIn.map(a => a.id);

  const [personalMap, libraryVisibilityMap, videoRows, hiddenSet] = await Promise.all([
    getPersonalArchivedAtBulk(assetIds, viewerId),
    getAddedToLibraryAtBulk(assetIds),
    getVideoProvenanceRowsBulk(assetIds),
    getHiddenAssetIdsBulk(assetIds, viewerId),
  ]);

  const campaignElementAssetIds = assetsIn
    .filter(a => a.assetType === 'campaign_element')
    .map(a => a.id);
  const campaignElementRows = await getCampaignElementProvenanceRowsBulk(campaignElementAssetIds);

  const campaignIds = new Set<string>();
  for (const row of videoRows.values()) {
    if (row.campaign_id) campaignIds.add(row.campaign_id);
  }
  for (const row of campaignElementRows.values()) {
    if (row.campaign_id) campaignIds.add(row.campaign_id);
  }
  const campaignArchivedMap = await getCampaignArchivedAtBulk(Array.from(campaignIds));

  const result = new Map<string, AssetArchiveContext>();

  for (const asset of assetsIn) {
    const reasons: ArchiveReason[] = [];

    if (personalMap.get(asset.id)) {
      reasons.push({ sourceType: 'personal', sourceId: asset.id, sourceName: null });
    }

    const isLibraryVisible = !!libraryVisibilityMap.get(asset.id);

    if (asset.assetType === 'video') {
      const video = videoRows.get(asset.id);
      if (video) {
        if (isLibraryVisible && video.archived_at) {
          reasons.push({ sourceType: 'video', sourceId: video.id, sourceName: video.video_title });
        }
        if (isLibraryVisible && video.campaign_id) {
          const campaign = campaignArchivedMap.get(video.campaign_id);
          if (campaign?.archived_at) {
            reasons.push({ sourceType: 'campaign', sourceId: campaign.id, sourceName: campaign.campaign_name });
          }
        }
      }
    }

    if (asset.assetType === 'campaign_element') {
      const element = campaignElementRows.get(asset.id);
      if (element?.campaign_id) {
        const campaign = campaignArchivedMap.get(element.campaign_id);
        if (campaign?.archived_at) {
          reasons.push({ sourceType: 'campaign', sourceId: campaign.id, sourceName: campaign.campaign_name });
        }
      }
    }

    // Type 3 (resource): intentionally no provenance branch — never
    // derive a Campaign relationship that doesn't exist.

    result.set(asset.id, buildContext(asset.id, reasons, hiddenSet.has(asset.id)));
  }

  return result;
}

// ── Shared level computation ─────────────────────────────────────────────

function buildContext(
  assetId: string,
  reasons: ArchiveReason[],
  isHiddenByViewer: boolean
): AssetArchiveContext {
  const isArchived = reasons.length > 0;
  const level: AssetArchiveLevel = !isArchived ? 'normal' : isHiddenByViewer ? 'level2' : 'level1';
  return { assetId, isArchived, reasons, isHiddenByViewer, level };
}

// ── Single-asset queries ─────────────────────────────────────────────────

async function getPersonalArchivedAt(assetId: string, viewerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('asset_user_states')
    .select('archived_at')
    .eq('asset_id', assetId)
    .eq('user_id', viewerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load personal archive state: ${error.message}`);
  return (data?.archived_at as string | null) ?? null;
}

async function getIsHiddenByViewer(assetId: string, viewerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('id')
    .eq('entity_type', 'asset')
    .eq('entity_id', assetId)
    .eq('user_id', viewerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load archive_ui_visibility state: ${error.message}`);
  return !!data;
}

async function resolveProvenanceReasons(
  assetType: string,
  assetId: string,
  isLibraryVisible: boolean
): Promise<ArchiveReason[]> {
  const reasons: ArchiveReason[] = [];

  if (assetType === 'video') {
    const { data: video, error } = await supabase
      .from('videos')
      .select('id, archived_at, campaign_id, video_title')
      .eq('asset_id', assetId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load source Video: ${error.message}`);

    if (video) {
      if (isLibraryVisible && video.archived_at) {
        reasons.push({ sourceType: 'video', sourceId: video.id, sourceName: video.video_title ?? null });
      }
      if (isLibraryVisible && video.campaign_id) {
        const { data: campaign, error: campaignError } = await supabase
          .from('campaigns')
          .select('id, archived_at, campaign_name')
          .eq('id', video.campaign_id)
          .maybeSingle();

        if (campaignError) throw new Error(`Failed to load source Campaign: ${campaignError.message}`);
        if (campaign?.archived_at) {
          reasons.push({ sourceType: 'campaign', sourceId: campaign.id, sourceName: campaign.campaign_name ?? null });
        }
      }
    }
  }

  if (assetType === 'campaign_element') {
    const { data: element, error } = await supabase
      .from('campaign_element_assets')
      .select('id, campaign_id')
      .eq('asset_id', assetId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load campaign_element_assets row: ${error.message}`);

    if (element?.campaign_id) {
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, archived_at, campaign_name')
        .eq('id', element.campaign_id)
        .maybeSingle();

      if (campaignError) throw new Error(`Failed to load source Campaign: ${campaignError.message}`);
      if (campaign?.archived_at) {
        reasons.push({ sourceType: 'campaign', sourceId: campaign.id, sourceName: campaign.campaign_name ?? null });
      }
    }
  }

  // assetType === 'resource': no provenance branch, by design.

  return reasons;
}

// ── Bulk queries (getAssetArchiveContextsForViewer) ─────────────────────

async function getPersonalArchivedAtBulk(
  assetIds: string[],
  viewerId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('asset_user_states')
    .select('asset_id, archived_at')
    .eq('user_id', viewerId)
    .in('asset_id', assetIds)
    .not('archived_at', 'is', null);

  if (error) throw new Error(`Failed to bulk-load personal archive state: ${error.message}`);
  return new Map((data ?? []).map((row: any) => [row.asset_id as string, row.archived_at as string]));
}

async function getAddedToLibraryAtBulk(assetIds: string[]): Promise<Map<string, string | null>> {
  const { data, error } = await supabase
    .from('assets')
    .select('id, added_to_library_at')
    .in('id', assetIds);

  if (error) throw new Error(`Failed to bulk-load added_to_library_at: ${error.message}`);
  return new Map((data ?? []).map((row: any) => [row.id as string, row.added_to_library_at as string | null]));
}

async function getHiddenAssetIdsBulk(assetIds: string[], viewerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('entity_id')
    .eq('entity_type', 'asset')
    .eq('user_id', viewerId)
    .in('entity_id', assetIds);

  if (error) throw new Error(`Failed to bulk-load archive_ui_visibility: ${error.message}`);
  return new Set((data ?? []).map((row: any) => row.entity_id as string));
}

interface VideoProvenanceRow {
  id: string;
  archived_at: string | null;
  campaign_id: string | null;
  video_title: string | null;
}

async function getVideoProvenanceRowsBulk(assetIds: string[]): Promise<Map<string, VideoProvenanceRow>> {
  const { data, error } = await supabase
    .from('videos')
    .select('id, asset_id, archived_at, campaign_id, video_title')
    .in('asset_id', assetIds);

  if (error) throw new Error(`Failed to bulk-load source Videos: ${error.message}`);
  return new Map(
    (data ?? []).map((row: any) => [
      row.asset_id as string,
      {
        id: row.id,
        archived_at: row.archived_at,
        campaign_id: row.campaign_id,
        video_title: row.video_title,
      } as VideoProvenanceRow,
    ])
  );
}

interface CampaignElementProvenanceRow {
  id: string;
  campaign_id: string | null;
}

async function getCampaignElementProvenanceRowsBulk(
  assetIds: string[]
): Promise<Map<string, CampaignElementProvenanceRow>> {
  if (assetIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('campaign_element_assets')
    .select('id, asset_id, campaign_id')
    .in('asset_id', assetIds);

  if (error) throw new Error(`Failed to bulk-load campaign_element_assets: ${error.message}`);
  return new Map(
    (data ?? []).map((row: any) => [
      row.asset_id as string,
      { id: row.id, campaign_id: row.campaign_id } as CampaignElementProvenanceRow,
    ])
  );
}

interface CampaignArchiveRow {
  id: string;
  archived_at: string | null;
  campaign_name: string | null;
}

async function getCampaignArchivedAtBulk(campaignIds: string[]): Promise<Map<string, CampaignArchiveRow>> {
  if (campaignIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('campaigns')
    .select('id, archived_at, campaign_name')
    .in('id', campaignIds);

  if (error) throw new Error(`Failed to bulk-load Campaigns: ${error.message}`);
  return new Map((data ?? []).map((row: any) => [row.id as string, row as CampaignArchiveRow]));
}
