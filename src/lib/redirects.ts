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
}

export interface CreateRedirectLinkOptions {
  promotionId?: string | null;
  assetId?: string | null;
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

  if (promotionId && !assetId) {
    console.error('createRedirectLink: promotionId requires assetId');
    return null;
  }

  // Resolve organization_id from campaign
  const { data: campaignRow } = await supabase
    .from('campaigns')
    .select('organization_id')
    .eq('id', campaignId)
    .single();

  const organizationId = campaignRow?.organization_id ?? null;

  // Validate promotion
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

    if (promotionRow.organization_id !== organizationId) {
      console.error('Promotion organization mismatch');
      return null;
    }

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
      return `${appBaseUrl}/${existing.token}`;
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
      ...(leadMagnetId ? { lead_magnet_id: leadMagnetId } : {}),
      ...(promotionId ? { promotion_id: promotionId } : {}),
      ...(assetId ? { asset_id: assetId } : {}),
    });

  if (error) {
    console.error(error);
    return null;
  }

  return `${appBaseUrl}/${token}`;
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

export const logRedirectEvent = async (link: RedirectLink) => {
  const sessionId = getSessionId();

  if (!sessionId) return;

  await supabase.from('events').insert({
    session_id: sessionId,
    video_id: link.video_id,
    campaign_id: link.campaign_id,
    event_type: link.link_type,
    value: null,
    organization_id: link.organization_id,
    promotion_id: link.promotion_id,
  });
};

export const buildRedirectUrl = (link: RedirectLink): string => {
  const isStripeLink = link.destination_url.includes('buy.stripe.com');

  if (link.link_type === 'checkout' && isStripeLink) {
    const separator = link.destination_url.includes('?') ? '&' : '?';
    return `${link.destination_url}${separator}client_reference_id=${link.token}`;
  }

  return link.destination_url;
};