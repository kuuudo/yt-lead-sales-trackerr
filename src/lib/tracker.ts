import { supabase } from './supabase';

const SESSION_KEY      = 'yt_tracker_session_id';
const UTM_KEY          = 'yt_tracker_utm_params';
const VIDEO_ID_KEY     = 'yt_tracker_video_id';
const CAMPAIGN_ID_KEY  = 'yt_tracker_campaign_id';

export const VTRACK_BASE_URL  = 'https://www.vstrk.com';
export const PIXEL_ENDPOINT   = `${VTRACK_BASE_URL}/api/pixel`;
export const WEBHOOK_ENDPOINT = `${VTRACK_BASE_URL}/api/stripe-webhook`;

export const getSessionId = (): string | null =>
  localStorage.getItem(SESSION_KEY);

export const getUtmParams = () => {
  const urlParams = new URLSearchParams(window.location.search);

  const utms = {
    utm_source:   urlParams.get('utm_source'),
    utm_medium:   urlParams.get('utm_medium'),
    utm_campaign: urlParams.get('utm_campaign'),
    utm_content:  urlParams.get('utm_content'),
  };

  const hasAnyUtm = Object.values(utms).some(v => v !== null);

  if (hasAnyUtm) {
    localStorage.setItem(UTM_KEY, JSON.stringify(utms));
    return utms;
  }

  const stored = localStorage.getItem(UTM_KEY);
  return stored ? JSON.parse(stored) : utms;
};

/** Store attribution globally */
export const setAttribution = (videoId: string, campaignId: string) => {
  localStorage.setItem(VIDEO_ID_KEY, videoId);
  localStorage.setItem(CAMPAIGN_ID_KEY, campaignId);

  console.debug('[tracker] setAttribution', { videoId, campaignId });
};

export const getVideoId = (): string | null =>
  localStorage.getItem(VIDEO_ID_KEY);

export const getCampaignId = (): string | null =>
  localStorage.getItem(CAMPAIGN_ID_KEY);

/**
 * SESSION SYNC
 * - creates session if missing
 * - patches attribution if session already exists
 */
export const syncSession = async () => {
  const existingSessionId = getSessionId();
  const videoId = getVideoId();
  const campaignId = getCampaignId();

  // -------------------------
  // PATCH existing session
  // -------------------------
  if (existingSessionId) {
    if (videoId || campaignId) {
      const patch: Record<string, string> = {};
      if (videoId) patch.video_id = videoId;
      if (campaignId) patch.campaign_id = campaignId;

      const { error } = await supabase
        .from('sessions')
        .update(patch)
        .eq('id', existingSessionId)
        .is('video_id', null);

      if (error) {
        console.warn('[tracker] syncSession patch failed:', error.message);
      } else {
        console.debug('[tracker] session patched', {
          existingSessionId,
          ...patch,
        });
      }
    }
    return;
  }

  // -------------------------
  // CREATE new session
  // -------------------------
  const utms = getUtmParams();

  const sessionData: Record<string, unknown> = {
    ...utms,
    ...(videoId ? { video_id: videoId } : {}),
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

    if (error) {
      console.error('[tracker] Error syncing session:', error);
    }
  } catch (err) {
    console.error('[tracker] Failed to sync session', err);
  }
};

/**
 * EVENT TRACKING (FIXED + SAFE ATTRIBUTION FALLBACK)
 */
export const trackEvent = async (
  eventType: string,
  value: number | null = null,
  meta?: { video_id?: string; campaign_id?: string }
) => {
  const sessionId = getSessionId();
  if (!sessionId) return;

  const videoId =
    meta?.video_id ?? getVideoId() ?? undefined;

  const campaignId =
    meta?.campaign_id ?? getCampaignId() ?? undefined;

  const payload: Record<string, unknown> = {
    session_id: sessionId,
    event_type: eventType,
    value,
    ...(videoId ? { video_id: videoId } : {}),
    ...(campaignId ? { campaign_id: campaignId } : {}),
  };

  console.debug('[tracker] trackEvent', payload);

  try {
    const { error } = await supabase
      .from('events')
      .insert(payload);

    if (error) {
      console.error(
        `[tracker] Error tracking event ${eventType}:`,
        error
      );
    }
  } catch (err) {
    console.error(
      `[tracker] Failed to track event ${eventType}`,
      err
    );
  }
};

/**
 * LEAD CAPTURE (FIXED ATTRIBUTION CONSISTENCY)
 */
export const captureEmail = async (email: string) => {
  const sessionId = getSessionId();
  if (!sessionId) return false;

  const utms = getUtmParams();
  const videoId = getVideoId() ?? undefined;
  const campaignId = getCampaignId() ?? undefined;

  const payload: Record<string, unknown> = {
    session_id: sessionId,
    email,
    utm_content: utms.utm_content,
    ...(videoId ? { video_id: videoId } : {}),
    ...(campaignId ? { campaign_id: campaignId } : {}),
  };

  console.debug('[tracker] captureEmail', payload);

  try {
    const { error } = await supabase
      .from('leads')
      .insert(payload);

    if (error) {
      console.error('[tracker] Error capturing lead:', error);
      return false;
    }

    // IMPORTANT: now correctly attributed
    await trackEvent('lead', null, {
      video_id: videoId,
      campaign_id: campaignId,
    });

    return true;
  } catch (err) {
    console.error('[tracker] Failed to capture lead', err);
    return false;
  }
};

/**
 * PIXEL SNIPPET (UNCHANGED BUT SAFE)
 */
export const generatePixelSnippet = (
  campaignId: string,
  videoId: string,
  eventType: string,
  amount: number | null
): string => {
  const amountStr = amount !== null ? String(amount) : '0';

  return `<!-- V-Track Pixel: ${eventType} -->
<script>
  (function() {
    var sessionId = localStorage.getItem('yt_tracker_session_id');

    var payload = {
      campaign_id: '${campaignId}',
      video_id: '${videoId}',
      event_type: '${eventType}',
      amount: ${amountStr},
      session_id: sessionId || null
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