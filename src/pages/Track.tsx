import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { resolveRedirectToken, logRedirectEvent, buildRedirectUrl } from '../lib/redirects';
import {
  setAttribution,
  syncSession,
  getJourney,
  appendJourneyNode,
  getVideoId,
  getCampaignId,
  getPromotionId,
  getAssetId,
} from '../lib/tracker';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle } from 'lucide-react';

// Hosts that always serve the token-resolution flow without a
// verified_tracking_hostnames check.
const PLATFORM_HOSTS = ['vstrk.com', 'www.vstrk.com', 'localhost', '127.0.0.1'];

const isPlatformHost = (hostname: string): boolean => {
  if (PLATFORM_HOSTS.includes(hostname)) return true;
  // Vercel preview deployments, e.g. yt-lead-sales-trackerr-git-foo.vercel.app
  if (hostname.endsWith('.vercel.app')) return true;
  return false;
};

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
      // Snapshot the tracking URL the visitor actually loaded (e.g.
      // https://go.kaksidigitals.com/kVMt) before window.location.href is
      // ever reassigned below. logRedirectEvent fires after navigation has
      // already started, so this is the only reliable point to capture it.
      const trackingPageUrl = window.location.href;

      try {
        // ── Step 0: verified-hostname guard (custom domains only) ─────────
        const currentHost = window.location.hostname;

        if (!isPlatformHost(currentHost)) {
          console.log('[Track] ⓪ non-platform host, checking verified_tracking_hostnames:', currentHost);

          const { data: domainRow, error: domainErr } = await supabase
            .from('verified_tracking_hostnames')
            .select('hostname')
            .eq('hostname', currentHost)
            .maybeSingle();

          if (domainErr) {
            console.error('[Track] ✗ verified_tracking_hostnames lookup failed:', domainErr.message);
            setError(true);
            return;
          }

          if (!domainRow) {
            console.error('[Track] ✗ hostname not verified — refusing to resolve token:', currentHost);
            setError(true);
            return;
          }

          console.log('[Track] ⓪ hostname verified, continuing:', currentHost);
        }

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
            setAttribution({
              video_id: videoId,
              campaign_id: campaignId,
              organization_id: (link as any).organization_id ?? null,
              promotion_id: (link as any).promotion_id ?? null,
              asset_id: (link as any).asset_id ?? null,
              redirect_link_id: (link as any).id ?? null,
              redirect_link_token: (link as any).token ?? null,
              tracking_hostname: (link as any).tracking_hostname ?? null,
            });
            console.log('[Track] ⑥ setAttribution() called — localStorage check:',
              'video_id =', localStorage.getItem('yt_tracker_video_id'),
              'campaign_id =', localStorage.getItem('yt_tracker_campaign_id'),
            );

            // Forward-validated journey (replaces the old FT_* write-once
            // logic below it — setAttribution() above is kept only for the
            // CURRENT-touch keys, e.g. getVideoId()/getCampaignId(), which
            // this feature does not change).
            await appendJourneyNode({
              redirect_link_id: (link as any).id,
              video_id: videoId,
              asset_id: (link as any).asset_id ?? null,
            });
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

        // ── Step 6: current vs first-touch before redirecting ────────────────
        const finalSessionId = localStorage.getItem('yt_tracker_session_id');
        // CURRENT attribution — the link just clicked (setAttribution already ran).
        // Used for vt_vid / vt_cid / vt_pid / vt_aid so destination + thank-you
        // pixel resolve pricing AND identity (promotion/asset) against the
        // touchpoint that was actually just clicked, not a stale first-touch
        // campaign/promotion/asset from earlier in the same browser session.
        const currentVideoId =
          getVideoId() ?? (videoId as string | undefined) ?? null;
        const currentCampaignId =
          getCampaignId() ?? (campaignId as string | undefined) ?? null;
        const currentPromotionId =
          ((link as any).promotion_id as string | undefined) ?? null;
        const currentAssetId =
          ((link as any).asset_id as string | undefined) ?? null;
        // FIRST-TOUCH — write-once. Used only for Stripe client_reference_id and
        // vt_first_touch_redirect_link_id so classic FT revenue attribution is preserved.
        // Forward-validated journey: first touch is journey[0], derived
        // rather than independently stored (replaces the six
        // getFirstTouch*() reads above). organization_id/tracking_hostname/
        // token are not part of JourneyNode (see plan Section 6) — reuse
        // this click's already-resolved `link` when journey[0] IS this
        // click; otherwise first touch happened on an earlier redirect and
        // those three fields need a small lookup against that original row.
        const journey = getJourney();
        const firstNode = journey.length > 0 ? journey[0] : null;

        const finalVideoId = firstNode?.video_id ?? null;
        const finalFirstTouchRedirectLinkId = firstNode?.redirect_link_id ?? null;

        let finalOrganizationId: string | null = null;
        let finalTrackingHostname: string | null = null;
        let finalFirstTouchRedirectLinkToken: string | null = null;

        if (firstNode) {
          if (firstNode.redirect_link_id === (link as any).id) {
            finalOrganizationId = (link as any).organization_id ?? null;
            finalTrackingHostname = (link as any).tracking_hostname ?? null;
            finalFirstTouchRedirectLinkToken = (link as any).token ?? null;
          } else {
            const { data: firstTouchLink, error: firstTouchLinkErr } = await supabase
              .from('redirect_links')
              .select('organization_id, tracking_hostname, token')
              .eq('id', firstNode.redirect_link_id)
              .maybeSingle();

            if (firstTouchLinkErr) {
              console.error('[Track] ✗ first-touch redirect_links lookup failed:', firstTouchLinkErr.message);
            } else if (firstTouchLink) {
              finalOrganizationId = firstTouchLink.organization_id ?? null;
              finalTrackingHostname = firstTouchLink.tracking_hostname ?? null;
              finalFirstTouchRedirectLinkToken = firstTouchLink.token ?? null;
            }
          }
        }

        if (!finalSessionId || !currentVideoId || !currentCampaignId) {
          console.warn('[Track] ⚠ one or more localStorage keys missing before redirect:',
            { finalSessionId, currentVideoId, currentCampaignId, finalVideoId });
        } else {
          console.log('[Track] ✓ all localStorage keys present — ready to redirect',
            { currentVideoId, currentCampaignId, ftVideoId: finalVideoId });
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

    if (currentVideoId) {
    url.searchParams.set('vt_vid', currentVideoId);
  }

  if (currentCampaignId) {
    url.searchParams.set('vt_cid', currentCampaignId);
  }

  // ── PR C: first-touch attribution params ──────────────────────────────
  // Same purpose as vt_sid/vt_vid/vt_cid above — let the destination
  // domain persist these into ITS OWN localStorage. vt_oid/vt_th remain
  // First Touch values (the funnel's original attribution) — unchanged.
  if (finalOrganizationId) {
    url.searchParams.set('vt_oid', finalOrganizationId);
  }

  // vt_pid / vt_aid: CURRENT touchpoint's promotion/asset — this click's
  // own redirect_links row, NOT first-touch. A pixel_purchases row must be
  // able to carry its own touchpoint's identity even when an earlier,
  // different touchpoint exists in the same browser session.
  if (currentPromotionId) {
    url.searchParams.set('vt_pid', currentPromotionId);
  }

  if (currentAssetId) {
    url.searchParams.set('vt_aid', currentAssetId);
  }

  if (finalTrackingHostname) {
    url.searchParams.set('vt_th', finalTrackingHostname);
  }

  if (finalFirstTouchRedirectLinkId) {
    url.searchParams.set('vt_first_touch_redirect_link_id', finalFirstTouchRedirectLinkId);
  }

  // Current event's own redirect link — describes which link THIS click
  // was, carries no attribution authority. Not to be confused with
  // vt_first_touch_redirect_link_id above.
  if ((link as any).id) {
    url.searchParams.set('vt_rlid', (link as any).id);
  }

  // Forward-validated journey — carried to the destination for
  // installationHelpers.ts's embedded pixel script to read and pass through
  // untouched (no re-validation client-side there; see plan Section 3/12).
  if (journey.length > 0) {
    url.searchParams.set('vt_journey', JSON.stringify(journey));
  }

  // ── Composite client_reference_id for deterministic Stripe attribution ──
  // Format: "{token}__{session_id}__{video_id}__{redirect_link_id}__{redirect_link_token}"
  // The first three segments are UNCHANGED from the existing format — parts[0..2]
  // keep their exact original meaning and position for backward compatibility.
  // Segments 4 and 5 are NEW and additive: the first-touch redirect_links.id
  // (UUID) and first-touch redirect_links.token (short string, e.g. '9vSr') —
  // i.e. the ORIGINAL redirect link the customer clicked, not this checkout
  // link's own token/id. Both are empty string when not available, never
  // "undefined" — old purchases with only 3 segments parse parts[3]/parts[4]
  // as undefined on the webhook side, which is handled there as null.
  // Webhook splits on '__' to recover all five values without any events
  // table lookup. Only applied to Stripe Payment Links — other destinations
  // are unaffected.
  if (finalSessionId && link.destination_url?.includes('buy.stripe.com')) {
    const composite = `${token}__${finalSessionId}__${finalVideoId ?? ''}__${finalFirstTouchRedirectLinkId ?? ''}__${finalFirstTouchRedirectLinkToken ?? ''}`;
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
        logRedirectEvent(link, trackingPageUrl).catch((e) =>
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
