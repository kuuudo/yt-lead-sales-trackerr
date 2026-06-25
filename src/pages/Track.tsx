import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { resolveRedirectToken, logRedirectEvent, buildRedirectUrl } from '../lib/redirects';
import { setAttribution, syncSession, getFirstTouchVideoId, getFirstTouchCampaignId } from '../lib/tracker';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle } from 'lucide-react';

export default function Track() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState(false);

  useEffect(() => {
    console.log('[Track] ① component mounted, token =', token);

    if (!token) {
      console.error('[Track] ✗ no token in params — aborting');
      setError(true);
      return;
    }

    const handleRedirect = async () => {
      try {
        // ── Step 1: resolve link + attribution rows ──────────────────────────
        console.log('[Track] ② starting Promise.all — resolveRedirectToken + attr fetch');

        let link: Awaited<ReturnType<typeof resolveRedirectToken>>;
        let attrRow: { video_id: string | null; campaign_id: string | null } | null;

        try {
          [link, attrRow] = await Promise.all([
            resolveRedirectToken(token),
            supabase
              .from('redirect_links')
              .select('video_id, campaign_id')
              .eq('token', token)
              .maybeSingle()               // ← was .single() which THROWS on 0 rows
              .then(({ data, error }) => {
                if (error) {
                  console.error('[Track] ✗ attrRow supabase error:', error.message, error.code);
                  return null;             // non-fatal — fall back to resolveRedirectToken fields
                }
                console.log('[Track] ③ attrRow fetched:', data);
                return data;
              }),
          ]);
        } catch (promiseAllErr) {
          console.error('[Track] ✗ Promise.all threw — one of the two fetches rejected:', promiseAllErr);
          setError(true);
          return;
        }

        console.log('[Track] ④ resolveRedirectToken result:', link);
        console.log('[Track] ④ attrRow result:', attrRow);

        // ── Step 2: guard on link ────────────────────────────────────────────
        if (!link) {
          console.error('[Track] ✗ link is null/undefined — token not found or resolveRedirectToken failed');
          setError(true);
          return;
        }

        // ── Step 3: extract video_id + campaign_id ───────────────────────────
        const videoId    = (attrRow?.video_id    ?? (link as any).video_id)    as string | undefined;
        const campaignId = (attrRow?.campaign_id ?? (link as any).campaign_id) as string | undefined;

        console.log('[Track] ⑤ extracted videoId =', videoId, '| campaignId =', campaignId);

        if (!videoId || !campaignId) {
          console.warn(
            '[Track] ⚠ attribution incomplete — video_id or campaign_id is missing.',
            'attrRow:', attrRow,
            'link keys:', Object.keys(link as object),
          );
          // Not fatal — continue so redirect still works, but session won't be attributed.
        }

        // ── Step 4: write attribution to localStorage (synchronous) ──────────
        if (videoId && campaignId) {
          try {
            setAttribution(videoId, campaignId);
            console.log('[Track] ⑥ setAttribution() called — localStorage check:',
              'video_id =', localStorage.getItem('yt_tracker_video_id'),
              'campaign_id =', localStorage.getItem('yt_tracker_campaign_id'),
            );
          } catch (attrErr) {
            console.error('[Track] ✗ setAttribution threw:', attrErr);
            // localStorage may be blocked (private browsing, storage quota) — log and continue
          }
        } else {
          console.warn('[Track] ⑥ skipping setAttribution — missing videoId or campaignId');
        }

        // ── Step 5: create Supabase session + persist session_id ─────────────
        console.log('[Track] ⑦ calling syncSession()...');
        try {
          await syncSession();
          console.log('[Track] ⑧ syncSession() resolved. localStorage check:',
            'session_id =', localStorage.getItem('yt_tracker_session_id'),
            'video_id =', localStorage.getItem('yt_tracker_video_id'),
            'campaign_id =', localStorage.getItem('yt_tracker_campaign_id'),
          );
        } catch (syncErr) {
          console.error('[Track] ✗ syncSession() threw:', syncErr);
          // Non-fatal — continue to redirect even if session creation failed
        }

        // ── Step 6: sanity-check all three keys before redirecting ───────────
        const finalSessionId  = localStorage.getItem('yt_tracker_session_id');
        // Use first-touch video/campaign for Stripe attribution so that clicking a
        // checkout redirect link (which calls setAttribution again) does not silently
        // replace the original landing campaign in client_reference_id.
        const finalVideoId    = getFirstTouchVideoId();
        const finalCampaignId = getFirstTouchCampaignId();

        if (!finalSessionId || !finalVideoId || !finalCampaignId) {
          console.warn('[Track] ⚠ one or more localStorage keys missing before redirect:',
            { finalSessionId, finalVideoId, finalCampaignId });
        } else {
          console.log('[Track] ✓ all localStorage keys present — ready to redirect');
        }

// ── Step 7: redirect with attribution params ─────────────────────────
let url: URL;

try {
  // Build original redirect URL
  url = new URL(buildRedirectUrl(link));

  // Append attribution params so the destination domain
  // can persist them into ITS OWN localStorage.
  if (finalSessionId) {
    url.searchParams.set('vt_sid', finalSessionId);
  }

  if (finalVideoId) {
    url.searchParams.set('vt_vid', finalVideoId);
  }

  if (finalCampaignId) {
    url.searchParams.set('vt_cid', finalCampaignId);
  }

  // ── Composite client_reference_id for deterministic Stripe attribution ──
  // Format: "{token}__{session_id}__{video_id}"
  // video_id segment is empty string when not available (direct/cold traffic) — never "undefined".
  // Webhook splits on '__' to recover all three values without any events table lookup.
  // Only applied to Stripe Payment Links — other destinations are unaffected.
  if (finalSessionId && link.destination_url?.includes('buy.stripe.com')) {
    const composite = `${token}__${finalSessionId}__${finalVideoId ?? ''}`;
    url.searchParams.set('client_reference_id', composite);
    console.log('[Track] ⑨ composite client_reference_id set:', composite);
  }

  console.log('[Track] ⑨ redirecting to:', url.toString());

} catch (urlErr) {
  console.error('[Track] ✗ buildRedirectUrl/new URL threw:', urlErr);
  setError(true);
  return;
}

window.location.href = url.toString();

        // Fire-and-forget click event after navigation starts.
        logRedirectEvent(link).catch((e) =>
          console.error('[Track] ✗ logRedirectEvent failed:', e)
        );

      } catch (outerErr) {
        // Catch-all: should not reach here, but guarantees the spinner
        // is replaced with an error state instead of hanging forever.
        console.error('[Track] ✗ unhandled error in handleRedirect:', outerErr);
        setError(true);
      }
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
