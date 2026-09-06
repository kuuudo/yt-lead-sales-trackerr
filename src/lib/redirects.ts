import { supabase } from './supabase';
import { getSessionId } from './tracker';

const generateToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

export type RedirectLinkType =
  | 'landing_page'
  | 'checkout'
  | 'purchase_thankyou'
  | 'newsletter'
  | 'newsletter_thankyou'
  | 'sales_call'
  | 'sales_call_thankyou'
  | 'consultation'
  | 'consultation_thankyou'
  | 'lead_magnet'
  | 'lead_magnet_thankyou';

export interface RedirectLink {
  id: string;
  token: string;
  video_id: string;
  campaign_id: string;
  link_type: RedirectLinkType;
  destination_url: string;
  created_at: string;
  organization_id: string | null;
  promotion_id: string | null;
  asset_id: string | null;
  tracking_hostname: string | null;
  bridge_token: string | null; 
}

export interface CreateRedirectLinkOptions {
  promotionId?: string | null;
  assetId?: string | null;
  trackingDomainId?: string | null;
}

export const createRedirectLink = async (
  videoId: string,
  campaignId: string,
  linkType: RedirectLinkType,
  destinationUrl: string,
  appBaseUrl: string,
  leadMagnetId?: string,
  allowDuplicate?: boolean,
  options?: CreateRedirectLinkOptions
): Promise<string | null> => {
  const promotionId = options?.promotionId ?? null;
  const assetId = options?.assetId ?? null;
  const trackingDomainId = options?.trackingDomainId ?? null;

  console.log('[DEBUG redirect input]', {
    videoId,
    campaignId,
    linkType,
    destinationUrl,
    promotionId,
    assetId,
    trackingDomainId,
  });

  if (promotionId && !assetId) {
    console.error('createRedirectLink: promotionId requires assetId');
    return null;
  }

  // organization_id to store on the redirect_links row. Two sources,
  // chosen based on whether a promotion is involved:
  //
  //   - No promotionId (My/Assigned asset, same-org case): read it
  //     straight off the campaign, exactly as before. No RLS concern —
  //     caller already owns this campaign.
  //
  //   - promotionId present (Shared asset, cross-org case): read it off
  //     `promotions` instead of `campaigns`. Per locked architecture,
  //     an Assignment can only ever reference the creating org's own
  //     assets (see createAssignment.ts) — so promotion.organization_id
  //     and the asset's provenance campaign's organization_id are
  //     always the same value. This is not a different rule, just the
  //     read that actually succeeds: a direct `campaigns` read for a
  //     cross-org asset is correctly blocked by RLS and silently
  //     returns null, which used to make the (now-removed) equality
  //     check below always fail even though the values were never
  //     actually different.
  let organizationId: string | null = null;

  if (promotionId) {
    const { data: promotionRow, error: promotionErr } = await supabase
      .from('promotions')
      .select('organization_id')
      .eq('id', promotionId)
      .maybeSingle();

    if (promotionErr || !promotionRow) {
      console.error('Promotion not found');
      return null;
    }

    organizationId = promotionRow.organization_id;

    // Real validation, kept: does this promotion actually include this
    // asset? This is the check that prevents a promotion_id being
    // paired with an unrelated asset_id — genuinely different from the
    // organization-equality check removed above, which compared two
    // values that are architecturally guaranteed equal in the first
    // place.
    const { data: promotionAssetRow, error: promotionAssetErr } = await supabase
      .from('promotion_assets')
      .select('asset_id')
      .eq('promotion_id', promotionId)
      .eq('asset_id', assetId)
      .maybeSingle();

    if (promotionAssetErr || !promotionAssetRow) {
      console.error('Asset does not belong to promotion');
      return null;
    }
  } else {
    const { data: campaignRow } = await supabase
      .from('campaigns')
      .select('organization_id')
      .eq('id', campaignId)
      .single();

    organizationId = campaignRow?.organization_id ?? null;
  }

let trackingHostname: string | null = null;
let resolvedBaseUrl = appBaseUrl;

if (trackingDomainId) {
  const { data: chosenDomainRow, error: chosenDomainErr } = await supabase
    .from('branded_tracking_domains')
    .select('hostname')
    .eq('id', trackingDomainId)
    .eq('status', 'verified')
    .maybeSingle();

  if (chosenDomainErr) {
    console.error('[createRedirectLink] chosen domain lookup failed:', chosenDomainErr.message);
  } else if (chosenDomainRow?.hostname) {
    trackingHostname = chosenDomainRow.hostname;
    resolvedBaseUrl = `https://${chosenDomainRow.hostname}`;
  }
} else if (organizationId) {
  const { data: domainRow, error: domainErr } = await supabase
    .from('branded_tracking_domains')
    .select('hostname')
    .eq('organization_id', organizationId)
    .eq('status', 'verified')
    .eq('is_default', true)
    .maybeSingle();

  if (domainErr) {
    console.error('[createRedirectLink] branded domain lookup failed:', domainErr.message);
  } else if (domainRow?.hostname) {
    trackingHostname = domainRow.hostname;
    resolvedBaseUrl = `https://${domainRow.hostname}`;
  }
}

  if (!allowDuplicate) {
    let existingQuery = supabase
      .from('redirect_links')
      .select('token')
      .eq('video_id', videoId)
      .eq('link_type', linkType);

    if (leadMagnetId) {
      existingQuery = existingQuery.eq('lead_magnet_id', leadMagnetId);
    }

    if (promotionId) {
      existingQuery = existingQuery.eq('promotion_id', promotionId);
    }

    const { data: existing } = await existingQuery.single();

    if (existing?.token) {
      return `${resolvedBaseUrl}/${existing.token}`;
    }
  }

  const token = generateToken();

  console.log('CHECKOUT LINK BUILD', {
    videoId,
    campaignId,
    linkType,
    token,
    promotionId,
    assetId,
  });

  const { error } = await supabase
    .from('redirect_links')
    .insert({
      token,
      video_id: videoId,
      campaign_id: campaignId,
      link_type: linkType,
      destination_url: destinationUrl,
      organization_id: organizationId,
      tracking_hostname: trackingHostname,
      ...(leadMagnetId ? { lead_magnet_id: leadMagnetId } : {}),
      ...(promotionId ? { promotion_id: promotionId } : {}),
      ...(assetId ? { asset_id: assetId } : {}),
      ...(assetId ? { bridge_token: generateToken() } : {}), 
    });

  if (error) {
    console.error(error);
    return null;
  }

  return `${resolvedBaseUrl}/${token}`;
};

export const resolveRedirectToken = async (
  token: string
): Promise<RedirectLink | null> => {
  const { data, error } = await supabase
    .from('redirect_links')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !data) return null;

  return data as RedirectLink;
};

// `url` is the tracking URL the visitor actually loaded (e.g.
// https://go.kaksidigitals.com/kVMt), captured by the caller BEFORE
// `window.location.href` is reassigned for the redirect. This function is
// invoked fire-and-forget after navigation has already started, so reading
// window.location.href in here would capture the destination page instead —
// hence it's passed in rather than read locally.
export const logRedirectEvent = async (link: RedirectLink, url: string | null = null): Promise<string | null> => {
  const sessionId = getSessionId();

  if (!sessionId) return null;

  const { data, error } = await supabase.rpc('log_redirect_event', {
    p_session_id: sessionId,
    p_video_id: link.video_id,
    p_campaign_id: link.campaign_id,
    p_event_type: link.link_type,
    p_organization_id: link.organization_id,
    p_promotion_id: link.promotion_id,
    p_asset_id: link.asset_id,
    p_redirect_link_id: link.id,
    p_tracking_hostname: link.tracking_hostname,
    p_link_type: link.link_type,
    p_bridge_token: link.bridge_token,
    p_url: url,
  });

  if (error) {
    console.error('[logRedirectEvent] insert failed:', error.message);
    return null;
  }

  return data ?? null;
};

export const buildRedirectUrl = (link: RedirectLink): string => {
  const isStripeLink = link.destination_url.includes('buy.stripe.com');

  if (link.link_type === 'checkout' && isStripeLink) {
    const separator = link.destination_url.includes('?') ? '&' : '?';
    return `${link.destination_url}${separator}client_reference_id=${link.token}`;
  }

  return link.destination_url;
};