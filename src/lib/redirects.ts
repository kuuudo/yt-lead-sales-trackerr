import { supabase } from './supabase';

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
}

export const createRedirectLink = async (
  videoId: string,
  campaignId: string,
  linkType: RedirectLinkType,
  destinationUrl: string,
  appBaseUrl: string,
  leadMagnetId?: string,
  allowDuplicate?: boolean
): Promise<string | null> => {
  if (!allowDuplicate) {
    let existingQuery = supabase
      .from('redirect_links')
      .select('token')
      .eq('video_id', videoId)
      .eq('link_type', linkType);

    if (leadMagnetId) existingQuery = existingQuery.eq('lead_magnet_id', leadMagnetId);

    const { data: existing } = await existingQuery.single();

    if (existing?.token) {
      return `${appBaseUrl}/${existing.token}`;
    }
  }

  const token = generateToken();

  const { error } = await supabase.from('redirect_links').insert({
    token,
    video_id: videoId,
    campaign_id: campaignId,
    link_type: linkType,
    destination_url: destinationUrl,
    ...(leadMagnetId ? { lead_magnet_id: leadMagnetId } : {}),
  });

  if (error) {
    console.error('Error creating redirect link:', error);
    return null;
  }

  return `${appBaseUrl}/${token}`;
};

export const resolveRedirectToken = async (token: string): Promise<RedirectLink | null> => {
  console.log('Looking up token:', token);
  
  const { data, error } = await supabase
    .from('redirect_links')
    .select('*')
    .eq('token', token)
    .single();

  console.log('Result:', { data, error });

  if (error || !data) return null;
  return data as RedirectLink;
};

export const logRedirectEvent = async (link: RedirectLink) => {
  const sessionKey = 'vtrack_session_' + link.video_id;
  let sessionId = localStorage.getItem(sessionKey);

  if (!sessionId) {
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        video_id: link.video_id,
        campaign_id: link.campaign_id,
        utm_source: 'youtube',
        utm_medium: 'video',
        utm_campaign: link.campaign_id,
        utm_content: link.video_id,
      })
      .select('id')
      .single();

    if (sessionError || !session) return;
    sessionId = session.id;
    if (sessionId) {
  localStorage.setItem(sessionKey, sessionId);
}
  }

  await supabase.from('events').insert({
    session_id: sessionId,
    video_id: link.video_id,
    campaign_id: link.campaign_id,
    event_type: link.link_type,
    value: null,
  });
};

// For checkout links pointing to Stripe Payment Links,
// append ?client_reference_id=TOKEN so the webhook can attribute the purchase.
export const buildRedirectUrl = (link: RedirectLink): string => {
  const isStripeLink = link.destination_url.includes('buy.stripe.com');
  if (link.link_type === 'checkout' && isStripeLink) {
    const separator = link.destination_url.includes('?') ? '&' : '?';
    return `${link.destination_url}${separator}client_reference_id=${link.token}`;
  }
  return link.destination_url;
};