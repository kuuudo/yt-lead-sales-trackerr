/**
 * src/services/video/getVideoArchiveContext.ts
 *
 * Central Video Archive Resolver — READ ONLY. The single authoritative
 * source for "what archive-related state applies to this Video, for this
 * viewer." Per ARCHIVE_SYSTEM_DESIGN.md §8 (Video — LOCKED) and §12
 * (Videos.tsx Level 1/Level 2 block, also LOCKED): pages and components
 * must consume this resolver's output and must NOT independently join
 * videos / campaigns to derive archive reasons themselves.
 *
 * Read-only, computed at request time, every time — this module writes
 * nothing and creates no new mutable schema. Reasons are always derived
 * from the two true sources:
 *   1. videos.archived_at     (the Video's own global archive state)
 *   2. campaigns.archived_at  (parent Campaign, via videos.campaign_id)
 *
 * Unlike Asset, Video's archive mechanism is GLOBAL, not personal — there
 * is no *_user_states table for Video (§5, §8). That means the reasons
 * computed here are the same for every viewer; `viewerId` is only used
 * to resolve `isHiddenByViewer` (Level 1 vs Level 2), exactly as it is
 * for Asset — archive_ui_visibility is a per-viewer UI-visibility signal,
 * never a reason source (§12 "Archive reason determination").
 *
 * Explicitly does not add archive_reason / archive_level / archive_source_*
 * columns or any Video-specific impact table — forbidden by LOCKED design.
 *
 * Callers:
 *   - pages/VideoDetail.tsx (getVideoArchiveContext — single video)
 *   - pages/Videos.tsx      (getVideoArchiveContextsForViewer — batch,
 *                             avoids N+1 on the list page)
 */

import { supabase } from '../../lib/supabase';

export type VideoArchiveReasonSourceType = 'video' | 'campaign';

export interface VideoArchiveReason {
  sourceType: VideoArchiveReasonSourceType;
  /** id of the true source row: the Video itself, or the parent Campaign. */
  sourceId: string;
  /** Display name for the source, or null if unavailable. Never the reason's identity. */
  sourceName: string | null;
}

export type VideoArchiveLevel = 'normal' | 'level1' | 'level2';

export interface VideoArchiveContext {
  videoId: string;
  isArchived: boolean;
  reasons: VideoArchiveReason[];
  isHiddenByViewer: boolean;
  level: VideoArchiveLevel;
}

// ── Single-video entry point (VideoDetail.tsx) ──────────────────────────

export async function getVideoArchiveContext(
  videoId: string,
  viewerId: string
): Promise<VideoArchiveContext> {
  const { data: video, error: videoError } = await supabase
    .from('videos')
    .select('id, archived_at, campaign_id, video_title')
    .eq('id', videoId)
    .maybeSingle();

  if (videoError) {
    throw new Error(`Failed to load video for archive context: ${videoError.message}`);
  }
  if (!video) {
    throw new Error(`Video ${videoId} not found or not visible to this viewer`);
  }

  const reasons: VideoArchiveReason[] = [];

  if (video.archived_at) {
    reasons.push({ sourceType: 'video', sourceId: video.id, sourceName: video.video_title ?? null });
  }

  const [campaignReason, isHiddenByViewer] = await Promise.all([
    video.campaign_id ? getCampaignReason(video.campaign_id as string) : Promise.resolve(null),
    getIsHiddenByViewer(videoId, viewerId),
  ]);

  if (campaignReason) reasons.push(campaignReason);

  return buildContext(videoId, reasons, isHiddenByViewer);
}

// ── Batch entry point (Videos.tsx list page — avoids N+1) ───────────────
// Self-sufficient: only needs {id} per video plus whatever Videos.tsx
// already has loaded. Bulk-fetches archived_at / campaign_id itself
// rather than trusting a caller-supplied value, so it stays the single
// authoritative source even for the list path.

export interface VideoForArchiveContext {
  id: string;
}

export async function getVideoArchiveContextsForViewer(
  videosIn: VideoForArchiveContext[],
  viewerId: string
): Promise<Map<string, VideoArchiveContext>> {
  if (videosIn.length === 0) return new Map();

  const videoIds = videosIn.map(v => v.id);

  const [videoRows, hiddenSet] = await Promise.all([
    getVideoRowsBulk(videoIds),
    getHiddenVideoIdsBulk(videoIds, viewerId),
  ]);

  const campaignIds = new Set<string>();
  for (const row of videoRows.values()) {
    if (row.campaign_id) campaignIds.add(row.campaign_id);
  }
  const campaignArchivedMap = await getCampaignArchivedAtBulk(Array.from(campaignIds));

  const result = new Map<string, VideoArchiveContext>();

  for (const v of videosIn) {
    const reasons: VideoArchiveReason[] = [];
    const row = videoRows.get(v.id);

    if (row) {
      if (row.archived_at) {
        reasons.push({ sourceType: 'video', sourceId: row.id, sourceName: row.video_title });
      }
      if (row.campaign_id) {
        const campaign = campaignArchivedMap.get(row.campaign_id);
        if (campaign?.archived_at) {
          reasons.push({ sourceType: 'campaign', sourceId: campaign.id, sourceName: campaign.campaign_name });
        }
      }
    }

    result.set(v.id, buildContext(v.id, reasons, hiddenSet.has(v.id)));
  }

  return result;
}

// ── Convenience: batch entry point that reuses already-loaded rows ──────
// Videos.tsx typically already has the full video rows (archived_at,
// campaign_id, video_title) and the full campaigns list in memory from
// its existing fetchData() query. This variant avoids re-querying
// Supabase for data the caller already has, while still being the sole
// place reasons are computed from (no independent join logic in the
// page). Only isHiddenByViewer is fetched here.

export interface VideoRowForArchiveContext {
  id: string;
  archived_at: string | null;
  campaign_id: string | null;
  video_title: string | null;
}

export interface CampaignRowForArchiveContext {
  id: string;
  archived_at: string | null;
  campaign_name: string | null;
}

export async function computeVideoArchiveContextsFromLoadedData(
  videoRows: VideoRowForArchiveContext[],
  campaignRows: CampaignRowForArchiveContext[],
  viewerId: string
): Promise<Map<string, VideoArchiveContext>> {
  if (videoRows.length === 0) return new Map();

  const campaignById = new Map(campaignRows.map(c => [c.id, c]));
  const videoIds = videoRows.map(v => v.id);
  const hiddenSet = await getHiddenVideoIdsBulk(videoIds, viewerId);

  const result = new Map<string, VideoArchiveContext>();

  for (const row of videoRows) {
    const reasons: VideoArchiveReason[] = [];

    if (row.archived_at) {
      reasons.push({ sourceType: 'video', sourceId: row.id, sourceName: row.video_title });
    }
    if (row.campaign_id) {
      const campaign = campaignById.get(row.campaign_id);
      if (campaign?.archived_at) {
        reasons.push({ sourceType: 'campaign', sourceId: campaign.id, sourceName: campaign.campaign_name });
      }
    }

    result.set(row.id, buildContext(row.id, reasons, hiddenSet.has(row.id)));
  }

  return result;
}

// ── Shared level computation ─────────────────────────────────────────────

function buildContext(
  videoId: string,
  reasons: VideoArchiveReason[],
  isHiddenByViewer: boolean
): VideoArchiveContext {
  const isArchived = reasons.length > 0;
  const level: VideoArchiveLevel = !isArchived ? 'normal' : isHiddenByViewer ? 'level2' : 'level1';
  return { videoId, isArchived, reasons, isHiddenByViewer, level };
}

// ── Single-video queries ─────────────────────────────────────────────────

async function getCampaignReason(campaignId: string): Promise<VideoArchiveReason | null> {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, archived_at, campaign_name')
    .eq('id', campaignId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load parent Campaign: ${error.message}`);
  if (!campaign?.archived_at) return null;

  return { sourceType: 'campaign', sourceId: campaign.id, sourceName: campaign.campaign_name ?? null };
}

async function getIsHiddenByViewer(videoId: string, viewerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('id')
    .eq('entity_type', 'video')
    .eq('entity_id', videoId)
    .eq('user_id', viewerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load archive_ui_visibility state: ${error.message}`);
  return !!data;
}

// ── Bulk queries (getVideoArchiveContextsForViewer / computeVideoArchiveContextsFromLoadedData) ─

interface VideoRow {
  id: string;
  archived_at: string | null;
  campaign_id: string | null;
  video_title: string | null;
}

async function getVideoRowsBulk(videoIds: string[]): Promise<Map<string, VideoRow>> {
  const { data, error } = await supabase
    .from('videos')
    .select('id, archived_at, campaign_id, video_title')
    .in('id', videoIds);

  if (error) throw new Error(`Failed to bulk-load Videos: ${error.message}`);
  return new Map((data ?? []).map((row: any) => [row.id as string, row as VideoRow]));
}

async function getHiddenVideoIdsBulk(videoIds: string[], viewerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('entity_id')
    .eq('entity_type', 'video')
    .eq('user_id', viewerId)
    .in('entity_id', videoIds);

  if (error) throw new Error(`Failed to bulk-load archive_ui_visibility: ${error.message}`);
  return new Set((data ?? []).map((row: any) => row.entity_id as string));
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
