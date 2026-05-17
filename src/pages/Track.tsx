import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { resolveRedirectToken, logRedirectEvent, buildRedirectUrl } from '../lib/redirects';
import { setAttribution, syncSession } from '../lib/tracker';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle } from 'lucide-react';

export default function Track() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(true);
      return;
    }

    const handleRedirect = async () => {
      // resolveRedirectToken may not select video_id/campaign_id — fetch them
      // directly here to guarantee we always have both fields for attribution.
      const [link, attrRow] = await Promise.all([
        resolveRedirectToken(token),
        supabase
          .from('redirect_links')
          .select('video_id, campaign_id')
          .eq('token', token)
          .single()
          .then(({ data }) => data),
      ]);

      if (!link) {
        setError(true);
        return;
      }

      // Resolve video_id / campaign_id — prefer explicit DB fetch, fall back
      // to whatever resolveRedirectToken returns (in case it selects them too).
      const videoId    = (attrRow?.video_id    ?? (link as any).video_id)    as string | undefined;
      const campaignId = (attrRow?.campaign_id ?? (link as any).campaign_id) as string | undefined;

      console.debug('[Track] resolved attribution', { token, videoId, campaignId });
      console.log('TRACK PAGE RUNNING');
      console.log('VIDEO ID:', videoId);
      console.log('CAMPAIGN ID:', campaignId);
      // ── Attribution initialization ────────────────────────────────────────
      // Must complete BEFORE window.location.href so the destination page and
      // any pixel on it can read localStorage values immediately.
      //
      // Step 1 — write video_id + campaign_id synchronously (no async risk)
      if (videoId && campaignId) {
        setAttribution(videoId, campaignId);
      } else {
        console.warn('[Track] attribution incomplete — video_id or campaign_id missing', { videoId, campaignId });
      }

      // Step 2 — create the session row in Supabase + persist session_id.
      //   syncSession reads the values just written by setAttribution, so
      //   the session row will carry video_id + campaign_id from the start.
      //   We await so session_id is in localStorage before we navigate away.
      await syncSession();
      console.log('SESSION SYNC COMPLETE');
      
      console.debug('[Track] attribution complete — redirecting', {
        video_id:    localStorage.getItem('yt_tracker_video_id'),
        campaign_id: localStorage.getItem('yt_tracker_campaign_id'),
        session_id:  localStorage.getItem('yt_tracker_session_id'),
      });
      // ─────────────────────────────────────────────────────────────────────

      const url = buildRedirectUrl(link);
      window.location.href = url;

      // Log the click event in background after redirect starts (non-blocking).
      // Browser may cancel on fast navigations — acceptable because attribution
      // is already committed to localStorage and Supabase above.
      logRedirectEvent(link).catch(console.error);
    };

    handleRedirect();
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4">
        <AlertCircle className="text-red-500" size={32} />
        <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">
          Link not found or expired
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4">
      <Loader2 className="text-red-600 animate-spin" size={32} />
      <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
        Redirecting...
      </p>
    </div>
  );
}
