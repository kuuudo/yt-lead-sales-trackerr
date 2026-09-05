import { supabase } from './supabase';

const SESSION_KEY           = 'yt_tracker_session_id';
const UTM_KEY                = 'yt_tracker_utm_params';
const VIDEO_ID_KEY           = 'yt_tracker_video_id';
const CAMPAIGN_ID_KEY        = 'yt_tracker_campaign_id';
const ORGANIZATION_ID_KEY    = 'yt_tracker_organization_id';
const PROMOTION_ID_KEY       = 'yt_tracker_promotion_id';
const ASSET_ID_KEY           = 'yt_tracker_asset_id';
const REDIRECT_LINK_ID_KEY   = 'yt_tracker_redirect_link_id';
// NEW: the short redirect_links.token string (e.g. '9vSr'), distinct from
// REDIRECT_LINK_ID_KEY (the UUID). Added alongside the existing id key —
// id is never replaced or renamed.
const REDIRECT_LINK_TOKEN_KEY = 'yt_tracker_redirect_link_token';
const TRACKING_HOSTNAME_KEY  = 'yt_tracker_tracking_hostname';
// First-touch keys: written once, never overwritten, survive the full browser session.
const FT_VIDEO_ID_KEY           = 'yt_tracker_ft_video_id';
const FT_CAMPAIGN_ID_KEY        = 'yt_tracker_ft_campaign_id';
const FT_ORGANIZATION_ID_KEY    = 'yt_tracker_ft_organization_id';
const FT_PROMOTION_ID_KEY       = 'yt_tracker_ft_promotion_id';
const FT_ASSET_ID_KEY           = 'yt_tracker_ft_asset_id';
const FT_REDIRECT_LINK_ID_KEY   = 'yt_tracker_ft_redirect_link_id';
// NEW: first-touch counterpart of REDIRECT_LINK_TOKEN_KEY. Same
// write-once-never-overwritten semantics as every other FT_* key.
const FT_REDIRECT_LINK_TOKEN_KEY = 'yt_tracker_ft_redirect_link_token';
const FT_TRACKING_HOSTNAME_KEY  = 'yt_tracker_ft_tracking_hostname';

/**
 * Attribution fields tracker.ts needs from a resolved redirect_links row.
 * Deliberately NOT the full RedirectLink type — tracker.ts should not be
 * coupled to the redirect_links schema (token, destination_url,
 * created_at, etc. are irrelevant here and may change independently).
 */
export interface AttributionContext {
  video_id: string | null;
  campaign_id: string | null;
  organization_id: string | null;
  promotion_id: string | null;
  asset_id: string | null;
  redirect_link_id: string | null;
  /**
   * NEW: the short redirect_links.token string (e.g. '9vSr') for the link
   * that was just resolved. Distinct from redirect_link_id (the UUID) —
   * both are kept, neither replaces the other.
   */
  redirect_link_token: string | null;
  tracking_hostname: string | null;
}

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
 * Current keys (VIDEO_ID_KEY / CAMPAIGN_ID_KEY / ORGANIZATION_ID_KEY /
 * PROMOTION_ID_KEY / ASSET_ID_KEY / REDIRECT_LINK_ID_KEY /
 * TRACKING_HOSTNAME_KEY) are always updated — they reflect whatever link
 * the user just clicked.
 *
 * First-touch keys (FT_*) are written exactly once per browser and never
 * overwritten. They are what you should use for revenue/funnel attribution
 * so that a later redirect link (e.g. a checkout or newsletter link) can't
 * silently replace the original landing attribution.
 */
export const setAttribution = (attribution: AttributionContext) => {
  const {
    video_id: videoId,
    campaign_id: campaignId,
    organization_id: organizationId,
    promotion_id: promotionId,
    asset_id: assetId,
    redirect_link_id: redirectLinkId,
    redirect_link_token: redirectLinkToken,
    tracking_hostname: trackingHostname,
  } = attribution;

  // Always update current attribution
  if (videoId)           localStorage.setItem(VIDEO_ID_KEY, videoId);
  if (campaignId)         localStorage.setItem(CAMPAIGN_ID_KEY, campaignId);
  if (organizationId)     localStorage.setItem(ORGANIZATION_ID_KEY, organizationId);
  if (promotionId)        localStorage.setItem(PROMOTION_ID_KEY, promotionId);
  if (assetId)             localStorage.setItem(ASSET_ID_KEY, assetId);
  if (redirectLinkId)     localStorage.setItem(REDIRECT_LINK_ID_KEY, redirectLinkId);
  if (redirectLinkToken)  localStorage.setItem(REDIRECT_LINK_TOKEN_KEY, redirectLinkToken);
  if (trackingHostname)   localStorage.setItem(TRACKING_HOSTNAME_KEY, trackingHostname);

  // Only write first-touch if not already set
  if (videoId && !localStorage.getItem(FT_VIDEO_ID_KEY)) {
    localStorage.setItem(FT_VIDEO_ID_KEY, videoId);
  }
  if (campaignId && !localStorage.getItem(FT_CAMPAIGN_ID_KEY)) {
    localStorage.setItem(FT_CAMPAIGN_ID_KEY, campaignId);
  }
  if (organizationId && !localStorage.getItem(FT_ORGANIZATION_ID_KEY)) {
    localStorage.setItem(FT_ORGANIZATION_ID_KEY, organizationId);
  }
  if (promotionId && !localStorage.getItem(FT_PROMOTION_ID_KEY)) {
    localStorage.setItem(FT_PROMOTION_ID_KEY, promotionId);
  }
  if (assetId && !localStorage.getItem(FT_ASSET_ID_KEY)) {
    localStorage.setItem(FT_ASSET_ID_KEY, assetId);
  }
  if (redirectLinkId && !localStorage.getItem(FT_REDIRECT_LINK_ID_KEY)) {
    localStorage.setItem(FT_REDIRECT_LINK_ID_KEY, redirectLinkId);
  }
  if (redirectLinkToken && !localStorage.getItem(FT_REDIRECT_LINK_TOKEN_KEY)) {
    localStorage.setItem(FT_REDIRECT_LINK_TOKEN_KEY, redirectLinkToken);
  }
  if (trackingHostname && !localStorage.getItem(FT_TRACKING_HOSTNAME_KEY)) {
    localStorage.setItem(FT_TRACKING_HOSTNAME_KEY, trackingHostname);
  }

  console.debug('[tracker] setAttribution', {
    current: attribution,
    firstTouch: {
      videoId: localStorage.getItem(FT_VIDEO_ID_KEY),
      campaignId: localStorage.getItem(FT_CAMPAIGN_ID_KEY),
      organizationId: localStorage.getItem(FT_ORGANIZATION_ID_KEY),
      promotionId: localStorage.getItem(FT_PROMOTION_ID_KEY),
      assetId: localStorage.getItem(FT_ASSET_ID_KEY),
      redirectLinkId: localStorage.getItem(FT_REDIRECT_LINK_ID_KEY),
      redirectLinkToken: localStorage.getItem(FT_REDIRECT_LINK_TOKEN_KEY),
      trackingHostname: localStorage.getItem(FT_TRACKING_HOSTNAME_KEY),
    },
  });
};

export const getVideoId = (): string | null =>
  localStorage.getItem(VIDEO_ID_KEY);

export const getCampaignId = (): string | null =>
  localStorage.getItem(CAMPAIGN_ID_KEY);

export const getOrganizationId = (): string | null =>
  localStorage.getItem(ORGANIZATION_ID_KEY);

export const getPromotionId = (): string | null =>
  localStorage.getItem(PROMOTION_ID_KEY);

export const getAssetId = (): string | null =>
  localStorage.getItem(ASSET_ID_KEY);

export const getRedirectLinkId = (): string | null =>
  localStorage.getItem(REDIRECT_LINK_ID_KEY);

/** Current redirect_links.token string (e.g. '9vSr') for the CURRENT event only — no attribution authority. */
export const getRedirectLinkToken = (): string | null =>
  localStorage.getItem(REDIRECT_LINK_TOKEN_KEY);

export const getTrackingHostname = (): string | null =>
  localStorage.getItem(TRACKING_HOSTNAME_KEY);

/** First-touch video — set on first landing, never overwritten. Use this for revenue attribution. */
export const getFirstTouchVideoId = (): string | null =>
  localStorage.getItem(FT_VIDEO_ID_KEY) ?? localStorage.getItem(VIDEO_ID_KEY);

/** First-touch campaign — set on first landing, never overwritten. Use this for revenue attribution. */
export const getFirstTouchCampaignId = (): string | null =>
  localStorage.getItem(FT_CAMPAIGN_ID_KEY) ?? localStorage.getItem(CAMPAIGN_ID_KEY);

/** First-touch organization — set on first landing, never overwritten. Use this for revenue attribution. */
export const getFirstTouchOrganizationId = (): string | null =>
  localStorage.getItem(FT_ORGANIZATION_ID_KEY) ?? localStorage.getItem(ORGANIZATION_ID_KEY);

/** First-touch promotion — set on first landing, never overwritten. Use this for revenue attribution. */
export const getFirstTouchPromotionId = (): string | null =>
  localStorage.getItem(FT_PROMOTION_ID_KEY) ?? localStorage.getItem(PROMOTION_ID_KEY);

/** First-touch asset — set on first landing, never overwritten. Use this for revenue attribution. */
export const getFirstTouchAssetId = (): string | null =>
  localStorage.getItem(FT_ASSET_ID_KEY) ?? localStorage.getItem(ASSET_ID_KEY);

/**
 * First-touch redirect link — the link that first brought this browser into
 * the funnel. This is the ID the server (pixel.ts) queries redirect_links
 * with to resolve the real Attribution Context. Not to be confused with
 * getRedirectLinkId() above, which reflects the link for the CURRENT event
 * only and carries no attribution authority.
 */
export const getFirstTouchRedirectLinkId = (): string | null =>
  localStorage.getItem(FT_REDIRECT_LINK_ID_KEY) ?? localStorage.getItem(REDIRECT_LINK_ID_KEY);

/**
 * First-touch redirect_links.token string (e.g. '9vSr') — the exact token
 * the customer originally clicked. Set on first landing, never overwritten.
 * This is what gets embedded in client_reference_id for Stripe attribution.
 * Not to be confused with getFirstTouchRedirectLinkId() above (the UUID) —
 * both are preserved, neither replaces the other.
 */
export const getFirstTouchRedirectLinkToken = (): string | null =>
  localStorage.getItem(FT_REDIRECT_LINK_TOKEN_KEY) ?? localStorage.getItem(REDIRECT_LINK_TOKEN_KEY);

/** First-touch tracking hostname — set on first landing, never overwritten. Use this for revenue attribution. */
export const getFirstTouchTrackingHostname = (): string | null =>
  localStorage.getItem(FT_TRACKING_HOSTNAME_KEY) ?? localStorage.getItem(TRACKING_HOSTNAME_KEY);

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

  // Snapshot the page URL the event is actually being recorded from, at the
  // moment of creation. This is the page the visitor is on when trackEvent()
  // fires (e.g. the destination site after redirect) — not a stored/derived
  // attribution value, so it does not touch first-touch/current-touch logic.
  const currentUrl =
    typeof window !== 'undefined' ? window.location.href : null;

  const payload: Record<string, unknown> = {
    session_id: sessionId,
    event_type: eventType,
    value,
    ...(videoId ? { video_id: videoId } : {}),
    ...(campaignId ? { campaign_id: campaignId } : {}),
    organization_id: meta?.organization_id ?? null,
    url: currentUrl,
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
 * INTERNAL PAGE VIEW (VSTRK app navigation — Phase 1, forward-only)
 *
 * Writes to `events_internal`, NOT `events`. Deliberately does not
 * reuse trackEvent()'s payload shape — no video_id, campaign_id, or
 * url. Does not read or write any FT_ prefix attribution localStorage keys.
 * Historical `events` rows are never touched by this function.
 */
// Route → entity-id extraction for internal page views ONLY.
// This reads the entity id straight out of the URL path segment
// (e.g. /videos/:id) — it is NOT marketing attribution and never
// reads localStorage / getVideoId() / getCampaignId() / FT_* keys.
// If a path doesn't carry an id (e.g. /dashboard, /assets/analytics),
// the corresponding field stays null.
const extractInternalEntityIds = (path: string) => {
  let video_id: string | null = null;
  let campaign_id: string | null = null;
  let asset_id: string | null = null;

  const videoMatch = path.match(/^\/videos\/([^/]+)/);
  if (videoMatch && videoMatch[1] !== 'analytics') {
    video_id = videoMatch[1];
  }

  const campaignMatch = path.match(/^\/campaigns\/([^/]+)/);
  if (campaignMatch && campaignMatch[1] !== 'analytics') {
    campaign_id = campaignMatch[1];
  }

  const assetMatch = path.match(/^\/assets\/([^/]+)/);
  if (assetMatch && assetMatch[1] !== 'analytics') {
    asset_id = assetMatch[1];
  }

  return { video_id, campaign_id, asset_id };
};

export const trackInternalPageView = async (
  path: string,
  meta?: { organization_id?: string }
) => {
  const sessionId = getSessionId();
  if (!sessionId) return;

  const currentUrl =
    typeof window !== 'undefined' ? window.location.href : null;

  const { video_id, campaign_id, asset_id } = extractInternalEntityIds(path);

  const payload: Record<string, unknown> = {
    session_id: sessionId,
    event_type: 'page_view',
    path,
    url: currentUrl,
    video_id,
    campaign_id,
    asset_id,
    organization_id: meta?.organization_id ?? null,
  };

  console.debug('[tracker] trackInternalPageView', payload);

  try {
    const { error } = await supabase
      .from('events_internal')
      .insert(payload);

    if (error) {
      console.error(
        '[tracker] Error tracking internal page_view:',
        error
      );
    }
  } catch (err) {
    console.error(
      '[tracker] Failed to track internal page_view',
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