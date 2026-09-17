/**
 * src/services/video/createVideo.ts
 *
 * Single source of truth for the "create video" business logic.
 *
 * UPDATE (Campaign Links Modal B): optional `campaignLinkTypes` filters which
 * campaign redirect jobs from buildCampaignRedirectJobs are created. When
 * omitted or empty, behavior matches the previous "create all jobs" path only
 * if the caller still expects that — Videos.tsx always passes the user's
 * selection (may be empty = no campaign links).
 */

import { supabase } from '../../lib/supabase';
import { createRedirectLink } from '../../lib/redirects';
import { createAsset } from '../asset/createAsset';
import { buildCampaignRedirectJobs } from '../redirect/buildCampaignRedirectJobs';
import type { Video, Campaign } from '../../lib/supabase';

export interface CreateVideoPayload {
  platform: Video['platform'];
  platform_url: string;
  platform_post_id?: string | null;
  youtube_video_id?: string | null;
  video_title: string;
  thumbnail_url?: string | null;
  campaign_id: string;
  video_goal: Video['video_goal'];
  selected_lead_magnet_ids: string[] | null;
  status: Video['status'];
}

/** Subset of campaign link types the caller wants generated (Modal B). */
export type CampaignLinkTypeKey =
  | 'landing_page'
  | 'newsletter'
  | 'consultation'
  | 'sales_call';

export interface CreateVideoOptions {
  payload: CreateVideoPayload;
  campaign: Campaign | undefined;
  organizationId: string;
  userId: string;
  trackingDomainId?: string | null;
  /**
   * When provided, only these link types are created from buildCampaignRedirectJobs.
   * When undefined, all jobs from buildCampaignRedirectJobs are created (legacy).
   * When [] , no campaign link types are created (caller explicitly selected none).
   * Lead-magnet links still follow selected_lead_magnet_ids independently.
   */
  campaignLinkTypes?: CampaignLinkTypeKey[] | null;
  /**
   * Per link-type tracking domain (Modal A saved config).
   * When set for a type, overrides the single trackingDomainId for that job.
   */
  campaignLinkDomainByType?: Partial<Record<CampaignLinkTypeKey, string | null>> | null;
}

export interface CreateVideoResult {
  savedVideo: Video;
}

export async function createVideo({
  payload,
  campaign,
  organizationId,
  userId,
  trackingDomainId,
  campaignLinkTypes,
  campaignLinkDomainByType,
}: CreateVideoOptions): Promise<CreateVideoResult> {
  const { asset } = await createAsset({
    organizationId,
    assetType: 'video',
  });

  const row = {
    ...payload,
    organization_id: organizationId,
    user_id: userId,
    asset_id: asset.id,
  };

  const { data: insertData, error: insertError } = await supabase
    .from('videos')
    .insert([row])
    .select();

  if (insertError || !insertData || insertData.length === 0) {
    const { error: compensationError } = await supabase
      .from('assets')
      .delete()
      .eq('id', asset.id);

    if (compensationError) {
      console.error(
        '[createVideo] Compensation failed — orphaned asset:',
        asset.id,
        compensationError.message
      );
    }

    throw new Error(insertError?.message ?? 'Video insert returned no data');
  }

  const savedVideo: Video = insertData[0];
  const appBaseUrl = window.location.origin;

  if (campaign) {
    let redirectJobs = buildCampaignRedirectJobs(campaign);

    if (campaignLinkTypes !== undefined && campaignLinkTypes !== null) {
      const allow = new Set(campaignLinkTypes);
      redirectJobs = redirectJobs.filter(([type]) => allow.has(type as CampaignLinkTypeKey));
    }

    // Prefer explicit map from caller; else read campaigns.*_tracking_domain_id on campaign row
    const domainFromCampaign: Partial<Record<CampaignLinkTypeKey, string | null>> = {
      landing_page: (campaign as any).landing_page_tracking_domain_id ?? null,
      newsletter: (campaign as any).newsletter_tracking_domain_id ?? null,
      consultation: (campaign as any).consultation_tracking_domain_id ?? null,
      sales_call: (campaign as any).sales_call_tracking_domain_id ?? null,
    };
    const domainMap = { ...domainFromCampaign, ...(campaignLinkDomainByType || {}) };

    await Promise.all(
      redirectJobs.map(([type, url]) => {
        const typeKey = type as CampaignLinkTypeKey;
        const perType =
          typeKey in domainMap ? domainMap[typeKey] : undefined;
        const domainId =
          perType !== undefined && perType !== null
            ? perType
            : perType === null
              ? null
              : (trackingDomainId ?? null);
        return createRedirectLink(
          savedVideo.id,
          savedVideo.campaign_id,
          type,
          url,
          appBaseUrl,
          undefined,
          undefined,
          { trackingDomainId: domainId ?? null }
        );
      })
    );

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
              lm.id,
              undefined,
              { trackingDomainId: trackingDomainId ?? null }
            )
          )
        );
      }
    }
  }

  return { savedVideo };
}
