import { supabase } from './supabase';

const SESSION_KEY = 'yt_tracker_session_id';
const UTM_KEY = 'yt_tracker_utm_params';

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

export const syncSession = async () => {
  const sessionId = getSessionId();
  if (sessionId) return; // session exists, no need to sync (UTMs are already captured)

  const utms = getUtmParams();
  const sessionData = { ...utms };

  try {
    const { data, error } = await supabase
      .from('sessions')
      .insert(sessionData)
      .select('id')
      .single();
    
    if (data?.id) {
      localStorage.setItem(SESSION_KEY, data.id);
    }
    
    if (error) console.error('Error syncing session:', error);
  } catch (err) {
    console.error('Failed to sync session to Supabase', err);
  }
};

export const trackEvent = async (eventType: string, value: number | null = null) => {
  const sessionId = getSessionId();
  if (!sessionId) return;

  try {
    const { error } = await supabase
      .from('events')
      .insert({
        session_id: sessionId,
        event_type: eventType,
        value
      });

    if (error) console.error(`Error tracking event ${eventType}:`, error);
  } catch (err) {
    console.error(`Failed to track event ${eventType}`, err);
  }
};

export const captureEmail = async (email: string) => {
  const sessionId = getSessionId();
  if (!sessionId) return false;
  const utms = getUtmParams();

  try {
    const { error } = await supabase
      .from('leads')
      .insert({
        session_id: sessionId,
        email,
        utm_content: utms.utm_content
      });

    if (error) {
      console.error('Error capturing lead:', error);
      return false;
    }
    
    await trackEvent('lead');
    return true;
  } catch (err) {
    console.error('Failed to capture lead', err);
    return false;
  }
};
