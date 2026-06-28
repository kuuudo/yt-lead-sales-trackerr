/**
 * src/services/video/createVideo.ts
 *
 * Single source of truth for the "create video" business logic.
 *
 * Responsibilities:
 *   1. INSERT into `videos` table
 *   2. Create all redirect links for the video (via createRedirectLink)
 *   3. Create lead-magnet redirect links if selected
 *   4. Return the saved video row
 *
 * NOT responsible for:
 *   - Any React state (no setState, no hooks)
 *   - UI feedback (no toast, no modal open/close)
 *   - Querying redirect_links back for display (caller's job)
 *   - Mapping / backfill (caller's job — UnmappedVideos uses handleMapToExisting)
 *   - Edit / update flows (kept in Videos.tsx handleSave until updateVideo() is extracted)
 *
 * Callers:
 *   - Videos.tsx → handleSave() (new video branch only)
 *   - UnmappedVideos.tsx → ImportVideoModal save handler
 *   - Future: Sponsor flow, API route, AI creation pipeline
 */

import { supabase } from '../../lib/supabase';
import { createRedirectLink } from '../../lib/redirects';
import type { Video, Campaign } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Everything needed to INSERT a `videos` row.
 * Kept intentionally flat — callers are responsible for resolving platform info
 * (via getPlatformInfo / registry data) before calling createVideo.
 * The service has no opinion about where the data came from.
 */
export interface CreateVideoPayload {
  // Platform identity
  platform: Video['platform'];
  platform_url: string;
  platform_post_id?: string | null;
  youtube_video_id?: string | null;

  // Content metadata
  video_title: string;
  thumbnail_url?: string | null;

  // Business context
  campaign_id: string;
  video_goal: Video['video_goal'];
  selected_lead_magnet_ids: string[] | null;

  // Status — typically 'no_data' for brand-new videos
  status: Video['status'];
}

export interface CreateVideoOptions {
  payload: CreateVideoPayload;
  /**
   * Resolved Campaign object for this video.
   * Required to build redirect links.
   * Pass undefined if no campaign selected — no redirect links will be created.
   */
  campaign: Campaign | undefined;
  organizationId: string;
  userId: string;
}

export interface CreateVideoResult {
  savedVideo: Video;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createVideo({
  payload,
  campaign,
  organizationId,
  userId,
}: CreateVideoOptions): Promise<CreateVideoResult> {
  // 1. Build the DB row.
  //    organization_id and user_id are write-time snapshots —
  //    never derived from localStorage or session inference.
  const row = {
    ...payload,
    organization_id: organizationId,
    user_id: userId,
  };

  const { data: insertData, error: insertError } = await supabase
    .from('videos')
    .insert([row])
    .select();

  if (insertError || !insertData || insertData.length === 0) {
    throw new Error(insertError?.message ?? 'Video insert returned no data');
  }

  const savedVideo: Video = insertData[0];
  const appBaseUrl = window.location.origin;

  // 2. Create redirect links — only if a campaign is present.
  if (campaign) {
    const redirectJobs: Array<[string, string]> = [
      ['landing_page', campaign.landing_page_url],
    ];
    if (campaign.newsletter_url)
      redirectJobs.push(['newsletter', campaign.newsletter_url]);
    if (campaign.sales_call_booking_url)
      redirectJobs.push(['sales_call', campaign.sales_call_booking_url]);
    if (campaign.consultation_booking_url)
      redirectJobs.push(['consultation', campaign.consultation_booking_url]);
    // checkout link intentionally omitted — owned by campaign via Installation.tsx
    if (campaign.purchase_thankyou_url)
      redirectJobs.push(['purchase_thankyou', campaign.purchase_thankyou_url]);
    if (campaign.newsletter_thankyou_url)
      redirectJobs.push(['newsletter_thankyou', campaign.newsletter_thankyou_url]);

    await Promise.all(
      redirectJobs.map(([type, url]) =>
        createRedirectLink(
          savedVideo.id,
          savedVideo.campaign_id,
          type as any,
          url,
          appBaseUrl
        )
      )
    );

    // 3. Lead-magnet redirect links
    if (payload.selected_lead_magnet_ids && payload.selected_lead_magnet_ids.length > 0) {
      const { data: lmData } = await supabase
        .from('lead_magnets')
        .select('*')
        .in('id', payload.selected_lead_magnet_ids);

      if (lmData) {
        await Promise.all(
          lmData.map((lm: any) =>
            createRedirectLink(
              savedVideo.id,
              savedVideo.campaign_id,
              'lead_magnet' as any,
              lm.lead_magnet_url,
              appBaseUrl,
              lm.id
            )
          )
        );
      }
    }
  }

  return { savedVideo };
}
