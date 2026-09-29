/**
 * Resolve redirect_links.upstream_domain for a SOURCE video.
 *
 * upstream_domain = source video's Campaign tracking ROOT (cookie-parent),
 * e.g. go.kaksidigitals.com → kaksidigitals.com.
 *
 * NOT the target asset campaign.
 * NOT redirect_links.campaign_id (asset provenance).
 * NOT a campaign UUID.
 *
 * Priority:
 *   1. campaigns.root_domain (authoritative when set)
 *   2. campaigns.landing_page_tracking_domain_id → branded_tracking_domains.root_domain
 *   3. branded hostname → getCookieParent(hostname)
 *   4. null (caller leaves upstream_domain unset)
 */

import { supabase } from './supabase';
import { getCookieParent } from './cookieParent';

/**
 * Canonical "promotion / landing" tracking root for a Campaign.
 * landing_page_tracking_domain_id is the primary promotion host when present;
 * campaigns.root_domain is the denormalized family key.
 */
export async function resolveCampaignTrackingRoot(
  campaignId: string
): Promise<string | null> {
  if (!campaignId) return null;

  const { data: camp, error } = await supabase
    .from('campaigns')
    .select('root_domain, landing_page_tracking_domain_id')
    .eq('id', campaignId)
    .maybeSingle();

  if (error || !camp) {
    console.warn('[resolveCampaignTrackingRoot] campaign lookup failed', campaignId, error?.message);
    return null;
  }

  const rootFromCampaign = (camp as { root_domain?: string | null }).root_domain;
  if (rootFromCampaign && String(rootFromCampaign).trim()) {
    return String(rootFromCampaign).trim().toLowerCase();
  }

  const domainId = (camp as { landing_page_tracking_domain_id?: string | null })
    .landing_page_tracking_domain_id;
  if (!domainId) return null;

  const { data: domainRow, error: domainErr } = await supabase
    .from('branded_tracking_domains')
    .select('root_domain, hostname')
    .eq('id', domainId)
    .maybeSingle();

  if (domainErr || !domainRow) {
    console.warn(
      '[resolveCampaignTrackingRoot] branded domain lookup failed',
      domainId,
      domainErr?.message
    );
    return null;
  }

  const rootCol = (domainRow as { root_domain?: string | null }).root_domain;
  if (rootCol && String(rootCol).trim()) {
    return String(rootCol).trim().toLowerCase();
  }

  const hostname = (domainRow as { hostname?: string | null }).hostname;
  if (hostname && String(hostname).trim()) {
    return getCookieParent(String(hostname).trim().toLowerCase());
  }

  return null;
}

/** video_id → videos.campaign_id → campaign tracking ROOT */
export async function resolveUpstreamDomainForVideo(
  videoId: string
): Promise<string | null> {
  if (!videoId) return null;

  const { data: video, error } = await supabase
    .from('videos')
    .select('campaign_id')
    .eq('id', videoId)
    .maybeSingle();

  if (error || !video?.campaign_id) {
    console.warn(
      '[resolveUpstreamDomainForVideo] video/campaign_id missing',
      videoId,
      error?.message
    );
    return null;
  }

  return resolveCampaignTrackingRoot(video.campaign_id as string);
}
