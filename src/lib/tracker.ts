import { supabase } from './supabase';

const SESSION_KEY = 'yt_tracker_session_id';
const UTM_KEY = 'yt_tracker_utm_params';
export const VTRACK_BASE_URL = 'https://www.vstrk.com';

export const PIXEL_ENDPOINT = `${VTRACK_BASE_URL}/api/pixel`;

export const WEBHOOK_ENDPOINT = `${VTRACK_BASE_URL}/api/stripe-webhook`;

export const getSessionId = (): string | null => {
  return localStorage.getItem(SESSION_KEY);
};

export const getUtmParams = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const utms = {
    utm_source: urlParams.get('utm_source'),
    utm_medium: urlParams.get('utm_medium'),
    utm_campaign: urlParams.get('utm_campaign'),
    utm_content: urlParams.get('utm_content'),
  };

  const hasAnyUtm = Object.values(utms).some(v => v !== null);

  if (hasAnyUtm) {
    localStorage.setItem(UTM_KEY, JSON.stringify(utms));
    return utms;
  }

  const stored = localStorage.getItem(UTM_KEY);
  return stored ? JSON.parse(stored) : utms;
};

// Keys for persisting attribution across pages (set by redirect handler)
const VIDEO_ID_KEY    = 'yt_tracker_video_id';
const CAMPAIGN_ID_KEY = 'yt_tracker_campaign_id';

/** Store attribution from the redirect link resolution (called by Track page). */
export const setAttribution = (videoId: string, campaignId: string) => {
  localStorage.setItem(VIDEO_ID_KEY,    videoId);
  localStorage.setItem(CAMPAIGN_ID_KEY, campaignId);
  console.debug('[tracker] setAttribution', { videoId, campaignId });
};

/** Returns the currently stored video_id (may be null if not yet set). */
export const getVideoId = (): string | null => localStorage.getItem(VIDEO_ID_KEY);

/** Returns the currently stored campaign_id (may be null if not yet set). */
export const getCampaignId = (): string | null => localStorage.getItem(CAMPAIGN_ID_KEY);

export const syncSession = async () => {
  const sessionId = getSessionId();
  if (sessionId) return; // session exists, no need to sync (UTMs are already captured)

  const utms   = getUtmParams();
  const videoId    = getVideoId();
  const campaignId = getCampaignId();

  const sessionData: Record<string, string | null> = {
    ...utms,
    ...(videoId    ? { video_id:    videoId }    : {}),
    ...(campaignId ? { campaign_id: campaignId } : {}),
  };

  console.debug('[tracker] syncSession insert', sessionData);

  try {
    const { data, error } = await supabase
      .from('sessions')
      .insert(sessionData)
      .select('id')
      .single();
    
    if (data?.id) {
      localStorage.setItem(SESSION_KEY, data.id);
      console.debug('[tracker] session created', data.id);
    }
    
    if (error) console.error('[tracker] Error syncing session:', error);
  } catch (err) {
    console.error('[tracker] Failed to sync session to Supabase', err);
  }
};

export const trackEvent = async (
  eventType: string,
  value: number | null = null,
  meta?: { video_id?: string; campaign_id?: string }
) => {
  const sessionId = getSessionId();
  if (!sessionId) return;

  // Always resolve attribution — prefer explicit meta, fall back to localStorage
  const videoId    = meta?.video_id    ?? getVideoId()    ?? undefined;
  const campaignId = meta?.campaign_id ?? getCampaignId() ?? undefined;

  const payload: Record<string, unknown> = {
    session_id: sessionId,
    event_type: eventType,
    value,
    ...(videoId    ? { video_id:    videoId }    : {}),
    ...(campaignId ? { campaign_id: campaignId } : {}),
  };

  console.debug('[tracker] trackEvent', payload);

  try {
    const { error } = await supabase.from('events').insert(payload);
    if (error) console.error(`[tracker] Error tracking event ${eventType}:`, error);
  } catch (err) {
    console.error(`[tracker] Failed to track event ${eventType}`, err);
  }
};

export const captureEmail = async (email: string) => {
  const sessionId = getSessionId();
  if (!sessionId) return false;
  const utms = getUtmParams();
  const videoId    = getVideoId()    ?? undefined;
  const campaignId = getCampaignId() ?? undefined;

  const payload: Record<string, unknown> = {
    session_id: sessionId,
    email,
    utm_content: utms.utm_content,
    ...(videoId    ? { video_id:    videoId }    : {}),
    ...(campaignId ? { campaign_id: campaignId } : {}),
  };

  console.debug('[tracker] captureEmail', payload);

  try {
    const { error } = await supabase.from('leads').insert(payload);
    if (error) {
      console.error('[tracker] Error capturing lead:', error);
      return false;
    }
    await trackEvent('lead');
    return true;
  } catch (err) {
    console.error('[tracker] Failed to capture lead', err);
    return false;
  }
};

export const generatePixelSnippet = (
  campaignId: string,
  videoId: string,
  eventType: string,
  amount: number | null
): string => {
  const amountStr = amount !== null ? String(amount) : '0';

  // The snippet reads session_id/video_id from localStorage at fire-time so
  // attribution is always fresh even if the snippet is embedded on an external page.
  return `<!-- V-Track Pixel: ${eventType} -->
<script>
  (function() {
    var sessionId  = localStorage.getItem('yt_tracker_session_id');
    var payload = {
      campaign_id:  '${campaignId}',
      video_id:     '${videoId}',
      event_type:   '${eventType}',
      amount:       ${amountStr},
      session_id:   sessionId || null
    };
    console.debug('[V-Track pixel] firing', payload);
    fetch('${PIXEL_ENDPOINT}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  })();
<\/script>`;
};