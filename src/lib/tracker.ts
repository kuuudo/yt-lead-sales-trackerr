import { supabase } from './supabase';

const SESSION_KEY           = 'yt_tracker_session_id';
const UTM_KEY               = 'yt_tracker_utm_params';
const VIDEO_ID_KEY          = 'yt_tracker_video_id';
const CAMPAIGN_ID_KEY       = 'yt_tracker_campaign_id';
// First-touch keys: written once, never overwritten, survive the full browser session.
const FT_VIDEO_ID_KEY       = 'yt_tracker_ft_video_id';
const FT_CAMPAIGN_ID_KEY    = 'yt_tracker_ft_campaign_id';

export const VTRACK_BASE_URL  = 'https://www.vstrk.com';
export const PIXEL_ENDPOINT   = `${VTRACK_BASE_URL}/api/pixel`;
export const WEBHOOK_ENDPOINT = `${VTRACK_BASE_URL}/api/stripe-webhook`;

export const getSessionId = (): string => {
  let sessionId = localStorage.getItem(SESSION_KEY);

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  return sessionId;
};

/** Returns existing session_id WITHOUT creating one. Used by syncSession to distinguish new vs returning. */
const getExistingSessionId = (): string | null =>
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

/**
 * Store attribution globally.
 *
 * Current keys (VIDEO_ID_KEY / CAMPAIGN_ID_KEY) are always updated —
 * they reflect whatever campaign the user is currently interacting with.
 *
 * First-touch keys (FT_*) are written exactly once per browser and never
 * overwritten. They are what you should use for revenue attribution so that
 * a checkout redirect link can't silently replace the original landing campaign.
 */
export const setAttribution = (videoId: string, campaignId: string) => {
  // Always update current attribution
  localStorage.setItem(VIDEO_ID_KEY, videoId);
  localStorage.setItem(CAMPAIGN_ID_KEY, campaignId);

  // Only write first-touch if not already set
  if (!localStorage.getItem(FT_VIDEO_ID_KEY)) {
    localStorage.setItem(FT_VIDEO_ID_KEY, videoId);
  }
  if (!localStorage.getItem(FT_CAMPAIGN_ID_KEY)) {
    localStorage.setItem(FT_CAMPAIGN_ID_KEY, campaignId);
  }

  console.debug('[tracker] setAttribution', {
    current: { videoId, campaignId },
    firstTouch: {
      videoId: localStorage.getItem(FT_VIDEO_ID_KEY),
      campaignId: localStorage.getItem(FT_CAMPAIGN_ID_KEY),
    },
  });
};

export const getVideoId = (): string | null =>
  localStorage.getItem(VIDEO_ID_KEY);

export const getCampaignId = (): string | null =>
  localStorage.getItem(CAMPAIGN_ID_KEY);

/** First-touch video — set on first landing, never overwritten. Use this for revenue attribution. */
export const getFirstTouchVideoId = (): string | null =>
  localStorage.getItem(FT_VIDEO_ID_KEY) ?? localStorage.getItem(VIDEO_ID_KEY);

/** First-touch campaign — set on first landing, never overwritten. Use this for revenue attribution. */
export const getFirstTouchCampaignId = (): string | null =>
  localStorage.getItem(FT_CAMPAIGN_ID_KEY) ?? localStorage.getItem(CAMPAIGN_ID_KEY);

/**
 * SESSION SYNC
 * - creates session row in DB if this is the first visit (no session_id in localStorage yet)
 * - patches attribution on the existing session row if attribution keys are now available
 *
 * IMPORTANT: uses getExistingSessionId() (not getSessionId()) so we can distinguish
 * "session already existed in localStorage" from "no session yet". Previously this used
 * getSessionId() which auto-creates a UUID, making existingSessionId always truthy and
 * meaning the INSERT branch could never run.
 */
export const syncSession = async () => {
  const existingSessionId = getExistingSessionId(); // null if first visit
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
        .is('video_id', null);   // only patch if not already attributed

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
  meta?: { video_id?: string; campaign_id?: string; organization_id?: string }
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
    organization_id: meta?.organization_id ?? null,
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

  return `<!-- VS-Track Pixel: ${eventType} -->
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

    console.debug('[VS-Track pixel] firing', payload);

    fetch('${PIXEL_ENDPOINT}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  })();
<\/script>`;
};