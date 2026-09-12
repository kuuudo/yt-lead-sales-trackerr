import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  resolveRedirectToken,
  logRedirectEvent,
  buildRedirectUrl,
  buildCrossOriginJourneyHandoff,
} from '../lib/redirects';
import {
  setAttribution,
  syncSession,
  getJourney,
  appendJourneyNode,
  resolveDestinationVideoId,
  getVideoId,
  getCampaignId,
  getPromotionId,
  getAssetId,
  getFirstTouchRedirectLinkToken,
  getJourneyId,
  getEventIds,
  setEventIds,
  tryHydrateJourneyFromHandoff,
  getStoredJourneyId,
  setStoredRedirectToken,
  getStoredRedirectToken,
  seedJourneyFromRecoveredNode,
  restoreJourneyIdFromCookie,
  bindRecoveredJourneyId,
  fetchLatestJourneySnapshot,
  mergeJourneySnapshot,
} from '../lib/tracker';

import { supabase } from '../lib/supabase';
import { AlertCircle } from 'lucide-react';
import RelayLoadingScreen from '../components/RelayLoadingScreen';
import { loadProbeCandidates, buildProbeUrl, buildPlatformCandidateUrl } from '../lib/probeState';
import { currentOriginCookieIsUsableHit } from '../lib/continuationPrecheck';
import { isEntryChoiceEnabled, getEntryChoice, setEntryChoice, type EntryChoice } from '../lib/entryChoice';
import EntryChoiceGate from '../components/EntryChoiceGate';


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
  // Entry Choice: only ever set to true when the gate needs to be shown
  // (feature enabled, no choice recorded yet, not a Relay re-entry). See
  // ../lib/entryChoice.ts for the semantics of the stored choice itself.
  const [awaitingEntryChoice, setAwaitingEntryChoice] = useState(false);
  // handleRedirect is defined inside the effect below (it closes over
  // `token` and a handful of per-mount flags); this ref lets the gate's
  // onChoose callback — which fires from a later render, after the user
  // clicks — invoke that same function instead of duplicating it.
  const handleRedirectRef = React.useRef<(skipDiscovery: boolean) => void>(() => {});

  useEffect(() => {
    console.log('[Track] ① component mounted, token =', token);

    if (!token) {
      console.error('[Track] ✗ no token in params — aborting');
      setError(true);
      return;
    }

    // skipDiscovery === true means the visitor's Entry Choice was "Yes, go
    // directly": Phase 3E's discovery/bounce logic is skipped entirely, but
    // every other step below (token resolution, attribution, journey
    // handling, event logging, final redirect) runs exactly as it does
    // today. skipDiscovery === false is both the "Continue" choice and the
    // Entry-Choice-disabled default — Phase 3E runs unchanged either way.
    const handleRedirect = async (skipDiscovery: boolean) => {
      // Snapshot the tracking URL the visitor actually loaded (e.g.
      // https://go.kaksidigitals.com/kVMt) before window.location.href is
      // ever reassigned below. logRedirectEvent fires after navigation has
      // already started, so this is the only reliable point to capture it.
      const trackingPageUrl = window.location.href;

 // Phase 3: declared here (function scope) so it's visible at Step 6B
      // further down — see assignment sites below.
      let crossOriginJourneyRecovered = false;
      // Phase 3E's continuationPrecheck HIT, hoisted out of that block's
      // scope so the cookie-fallback recovery block below can see it.
      // Layer 2 evidence only — validateJourneyContinuation() inside
      // appendJourneyNode() remains the final authority.
      let cookieContinuationHit = false;

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

        // ── Phase 3E discovery gate (Step 1 + Step 2) ───────────────────────
        // 1) URL handoff / vt_probe=exhausted → never discover
        // 2) Current-origin cookie + continuation precheck HIT → no bounce
        // 3) If NOT platform → VSTRK platform candidate (/r/platform) first
        // 4) If platform (or after platform MISS chains here) → branded ≤3
        //
        // Entry Choice "direct": skip this entire block. Nothing below it
        // (Steps 3-7) is affected — token resolution, attribution, journey
        // handling, event logging, and the final redirect still run.
        if (!skipDiscovery) {
          const probeParams = new URLSearchParams(window.location.search);
          const hasUrlHandoff = !!(
            probeParams.get('vt_journey') ||
            probeParams.get('vt_token') ||
            probeParams.get('vt_jid') ||
            probeParams.get('vt_eids') ||
            probeParams.get('vt_ej_id')
          );
          const probeExhausted = probeParams.get('vt_probe') === 'exhausted';
          const orgIdForProbe =
            typeof (link as any).organization_id === 'string'
              ? ((link as any).organization_id as string)
              : null;

          if (!hasUrlHandoff && !probeExhausted && orgIdForProbe && token) {
            try {
              const localCookieHit = await currentOriginCookieIsUsableHit(
                token,
                getStoredRedirectToken
              );
               if (localCookieHit) {
                cookieContinuationHit = true;
                console.log(
                  '[Track] Phase 3E: current-origin cookie continuation HIT — skip probe'
                );
              } else if (!isPlatformHost(currentHost)) {
                // Step 2: try VSTRK platform cookie before any branded relay
                const platformUrl = buildPlatformCandidateUrl(token, orgIdForProbe);
                console.log('[Track] Phase 3E Step 2: trying VSTRK platform candidate');
                window.location.replace(platformUrl);
                return;
              } else {
                // Platform origin: branded external parents only (max 3)
                const candidates = await loadProbeCandidates(orgIdForProbe);
                if (candidates.length > 0) {
                  const first = candidates[0];
                  const probeUrl = buildProbeUrl(first, token, orgIdForProbe, 0);
                  console.log('[Track] Phase 3E: starting cookie-parent probe', {
                    groups: candidates.length,
                    firstHost: first.hostname,
                  });
                  window.location.replace(probeUrl);
                  return;
                }
                console.log(
                  '[Track] Phase 3E: no probe candidates — continue normal Track'
                );
              }
            } catch (probeErr) {
              console.warn(
                '[Track] Phase 3E: discovery failed — continuing normal Track',
                probeErr
              );
            }
          }
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

            // Phase 3: true when this origin's local journey came from a
            // cross-origin recovery path rather than pure same-origin
            // accumulation — the only case where the local `journey`
            // slice can be missing older history. Gates the Step 6B
            // historical-merge query below so normal same-origin clicks
            // never hit the DB for this.

            // Cross-origin URL handoff: if the incoming tracking URL carries
            // vt_journey (e.g. go.example.com/LnMI?vt_journey=...&vt_jid=...),
            // restore it BEFORE appendJourneyNode so continuation uses the
            // same persistent journey_id. Local (same-origin) data only wins
            // when the incoming journey is NOT a valid continuation of the
            // current video — see tryHydrateJourneyFromHandoff in tracker.ts.
            // Malformed params are ignored safely.
            {
              const handoffParams = new URLSearchParams(window.location.search);
              const hydrated = await tryHydrateJourneyFromHandoff({
                vt_journey: handoffParams.get('vt_journey'),
                vt_jid: handoffParams.get('vt_jid'),
                vt_eids: handoffParams.get('vt_eids'),
                vt_ej_id: handoffParams.get('vt_ej_id'),
                currentVideoId: videoId ?? null,
              });
              if (hydrated) {
                crossOriginJourneyRecovered = true;
              }
            }

            // ── Phase 3B: lightweight pointer handoff from URL ───────────────
            // Priority when local journey is empty:
            //   1. URL query params (vt_token / vt_jid) — used after relay bounce
            //   2. Existing Kaksi cookies (same helpers as before)
            //   3. No recovery
            // Does NOT overwrite a valid local journey (guard remains
            // getJourney().length === 0). Does NOT go through the full
            // vt_journey snapshot hydrator.
            const handoffSearch = new URLSearchParams(window.location.search);
            const urlVtToken = handoffSearch.get('vt_token');
            const urlVtJid = handoffSearch.get('vt_jid');
            const UUID_RE_TRACK =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            const safeUrlVtToken =
              typeof urlVtToken === 'string' &&
              /^[A-Za-z0-9_-]{2,32}$/.test(urlVtToken)
                ? urlVtToken
                : null;
            const safeUrlVtJid =
              typeof urlVtJid === 'string' && UUID_RE_TRACK.test(urlVtJid)
                ? urlVtJid
                : null;

            // ── vt_jid inbound recovery (non-blocking) ────────────────────────
            // If URL handoff did not restore a journey (typical after YouTube)
            // surface a recovered candidate journey_id from URL first, then
            // cookie. Synchronous read — no RPC/DB call. Existing
            // continuation validation remains authoritative; this only
            // logs the candidate (restore happens after appendJourneyNode).
            if (getJourney().length === 0) {
              const recoveredJourneyId = safeUrlVtJid ?? getStoredJourneyId();
              if (recoveredJourneyId) {
                console.log(
                  '[Track] vt_jid recovered candidate journey_id:',
                  recoveredJourneyId,
                  safeUrlVtJid ? '(from URL)' : '(from cookie)'
                );
              }
            }

            // ── vt_token cross-origin continuation recovery (MVP) ─────────────
            // Only runs when localStorage has NO previous node — the
            // same-origin fast path (existing local journey present) never
            // reaches here. Resolves the PREVIOUS token via the same
            // resolveRedirectToken/resolveDestinationVideoId already used
            // below for the current click, builds one JourneyNode from it,
            // and seeds it so the EXISTING appendJourneyNode()/
            // validateJourneyContinuation() decide continuation below —
            // no new validator, no new journey system.
            // Phase 3B: prefer URL vt_token over cookie when both present.
            if (safeUrlVtToken) {
              // Explicit relay handoff: ContinuationRelay / PlatformContinuation
              // already ran continuationPrecheck and only attach vt_token to
              // the return URL on a HIT. That recovered previous node is
              // trusted over any stale local journey left on this origin —
              // force-seed it, then bind the recovered journey_id BEFORE
              // append so validateJourneyContinuation() (inside
              // appendJourneyNode(), unchanged) evaluates against the
              // correct previous node instead of a stale local one.
              try {
                const previousLink = await resolveRedirectToken(safeUrlVtToken);
                if (previousLink) {
                  const previousDestinationVideoId = await resolveDestinationVideoId(
                    (previousLink as any).destination_url,
                    (previousLink as any).asset_id ?? null
                  );
                  seedJourneyFromRecoveredNode(
                    {
                      redirect_link_id: (previousLink as any).id,
                      video_id: (previousLink as any).video_id,
                      asset_id: (previousLink as any).asset_id ?? null,
                      destination_video_id: previousDestinationVideoId,
                    },
                    { force: true }
                  );
                  if (safeUrlVtJid) {
                    bindRecoveredJourneyId(safeUrlVtJid);
                  }
                  console.log('[Track] vt_token (URL handoff) recovered previous node, force-seeded for continuation check', {
                    previousToken: safeUrlVtToken,
                    source: 'url',
                    previousVideoId: (previousLink as any).video_id,
                    previousDestinationVideoId,
                    boundJourneyId: safeUrlVtJid ?? null,
                  });
                  crossOriginJourneyRecovered = true;
                } else {
                  console.warn('[Track] vt_token (URL handoff) present but resolveRedirectToken found no link — skipping recovery', { previousToken: safeUrlVtToken });
                }
              } catch (recoverErr) {
                console.warn('[Track] vt_token (URL handoff) recovery threw (non-fatal) — continuing without it', recoverErr);
              }
            } else if (getJourney().length === 0 || cookieContinuationHit) {
              // Cookie-only fallback. Now also fires when Phase 3E's
              // continuationPrecheck already verified this cookie's
              // previous token as a HIT (cookieContinuationHit) — not
              // only when local journey happens to be empty. A verified
              // HIT is relay-attested evidence, so on HIT we force-seed
              // (same as the URL vt_token branch) instead of refusing
              // just because a local journey happens to already exist.
              // validateJourneyContinuation() inside appendJourneyNode()
              // below is unchanged and still makes the final decision —
              // if it disagrees, the existing reset-to-new-journey path
              // still fires exactly as before.
              const previousToken = getStoredRedirectToken();
              if (previousToken) {
                try {
                  const previousLink = await resolveRedirectToken(previousToken);
                  if (previousLink) {
                    const previousDestinationVideoId = await resolveDestinationVideoId(
                      (previousLink as any).destination_url,
                      (previousLink as any).asset_id ?? null
                    );
                    seedJourneyFromRecoveredNode(
                      {
                        redirect_link_id: (previousLink as any).id,
                        video_id: (previousLink as any).video_id,
                        asset_id: (previousLink as any).asset_id ?? null,
                        destination_video_id: previousDestinationVideoId,
                      },
                      { force: cookieContinuationHit }
                    );
                    if (cookieContinuationHit) {
                      const cookieJid = getStoredJourneyId();
                      if (cookieJid) {
                        bindRecoveredJourneyId(cookieJid);
                      }
                    }
                    console.log('[Track] vt_token recovered previous node, seeded for continuation check', {
                      previousToken,
                      source: 'cookie',
                      previousVideoId: (previousLink as any).video_id,
                      previousDestinationVideoId,
                      forced: cookieContinuationHit,
                    });
                    crossOriginJourneyRecovered = true;
                  } else {
                    console.warn('[Track] vt_token present but resolveRedirectToken found no link — skipping recovery', { previousToken });
                  }
                } catch (recoverErr) {
                  console.warn('[Track] vt_token recovery threw (non-fatal) — continuing without it', recoverErr);
                }
              }
            }

            // Phase 3C: strip handoff / probe-exhaust params from the address bar.
            // replaceState only — no extra navigation.
            {
              const clean = new URL(window.location.href);
              const hadProbeMarker = clean.searchParams.get('vt_probe') === 'exhausted';
              if (safeUrlVtToken || safeUrlVtJid || hadProbeMarker) {
                try {
                  clean.searchParams.delete('vt_token');
                  clean.searchParams.delete('vt_jid');
                  clean.searchParams.delete('vt_probe');
                  window.history.replaceState(
                    window.history.state,
                    '',
                    clean.pathname + (clean.search ? clean.search : '') + clean.hash
                  );
                  console.log('[Track] Phase 3C: stripped handoff/probe params from URL');
                } catch (cleanErr) {
                  console.warn('[Track] Phase 3C: URL cleanup failed (non-fatal)', cleanErr);
                }
              }
            }

            // Forward-validated journey (replaces the old FT_* write-once
            // logic below it — setAttribution() above is kept only for the
            // CURRENT-touch keys, e.g. getVideoId()/getCampaignId(), which
            // this feature does not change).
            //
            // Edge model: resolve this click's destination BEFORE
            // appending, so the NEXT click can use the fast
            // destination-equality path instead of the asset-membership
            // fallback. redirectAssetId is link.asset_id — the asset THIS
            // redirect promotes, not necessarily the source video's own
            // asset_id.
            const destinationVideoId = await resolveDestinationVideoId(
              (link as any).destination_url,
              (link as any).asset_id ?? null
            );
            await appendJourneyNode({
              redirect_link_id: (link as any).id,
              video_id: videoId,
              asset_id: (link as any).asset_id ?? null,
              destination_video_id: destinationVideoId,
            });

            // Phase 2 / 3B: if this origin never had a journey_id locally
            // (cross-origin recovery case), restore it from URL vt_jid
            // first, then cookie, so events_journey correlation resumes.
            // restoreJourneyIdFromCookie no-ops when a local id already exists.
            const recoveredJidForRestore = safeUrlVtJid ?? getStoredJourneyId();
            if (recoveredJidForRestore) {
              restoreJourneyIdFromCookie(recoveredJidForRestore);
            }

            // Continuation decision (existing appendJourneyNode/
            // validateJourneyContinuation, above) is now complete — only
            // now does vt_token advance to the current token.
            setStoredRedirectToken(token);
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

        // ── Step 6B: persistent server-side journey snapshot (V3, events_journey) ──
        // logRedirectEvent() moved here from fire-and-forget-after-redirect
        // and is now awaited so its exact events.id is available to link into
        // events_journey.event_ids. Does not change what it logs.
        const eventId = await logRedirectEvent(link, trackingPageUrl);

        let eventsJourneyId: string | null = null;

        if (!eventId) {
          console.warn('[Track] ⚠ logRedirectEvent returned no id — skipping events_journey insert');
        } else {
          const journeyId = getJourneyId();

          if (!journeyId) {
            console.warn('[Track] ⚠ no journey_id present — skipping events_journey insert', { eventId });
          } else {
            // journey (from Step 6 above) is this click's full, already-
            // validated browser-side snapshot — self-contained per row, per
            // FORWARD_VALIDATED_ATTRIBUTION_JOURNEY.md §19B. event_ids mirrors
            // it 1:1: reset to just this hop's id when the journey itself
            // just reset/started (length 1), otherwise extend the prior list.
            const priorEventIds = journey.length > 1 ? getEventIds() : [];
            const journeyEventIds = [...priorEventIds, eventId];

            // Phase 3: on a cross-origin recovered journey, `journey` is only
            // the local slice (recovered previous node + current node) —
            // merge in the full historical snapshot so p_journey_snapshot
            // reflects the complete journey, not just this origin's slice.
            // Same-origin clicks already carry the full history in `journey`
            // locally, so this never queries the DB on the normal path.
            let journeySnapshot = journey;
            if (crossOriginJourneyRecovered) {
              const historicalSnapshot = await fetchLatestJourneySnapshot(journeyId);
              journeySnapshot = mergeJourneySnapshot(historicalSnapshot, journey);
            }

const { data: journeyRowId, error: journeyInsertErr } = await supabase.rpc(
  'log_events_journey',
  {
    p_journey_id: journeyId,
    p_event_ids: journeyEventIds,
    p_journey_snapshot: journeySnapshot,
    p_redirect_link_id: (link as any).id,
  }
);

if (journeyInsertErr) {
  console.error('[Track] ✗ events_journey insert failed:', journeyInsertErr.message);
} else {
  setEventIds(journeyEventIds);
  eventsJourneyId = journeyRowId ?? null;
}
          }
        }



        // ── Step 7: redirect with attribution params ─────────────────────────

        // VSTRK → VSTRK same-host vs cross-host detection. Scope: journey
        // handoff params only. Does not affect non-VSTRK destinations
        // (YouTube, Stripe, landing pages), which keep vt_* unchanged below.
        //
        // The actual host comparison (current host C vs destination host D,
        // resolved from link.destination_url) happens inside
        // buildCrossOriginJourneyHandoff() below, once `url` exists. We only
        // need C's own host here.
        const currentTrackingHost = (link as any).tracking_hostname ?? 'www.vstrk.com';

console.log('[Track] HOST CHECK:', {
  destinationUrl: (link as any).destination_url,
  currentTrackingHost,
});

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
  // When THIS link's destination_url is itself a VSTRK tracking URL on
  // another host (e.g. https://store.kaksidigitals.com/uONR), these params
  // also enable that host's Track.tsx to hydrate the same persistent
  // journey before appendJourneyNode. Skipped only for same-host
  // VSTRK → VSTRK transitions (destination Track.tsx already has the
  // journey in its own localStorage). Every other destination — cross-host
  // VSTRK, YouTube, Stripe, landing pages — keeps this exactly as before.
  //
  // buildCrossOriginJourneyHandoff resolves link.destination_url's own
  // tracking host (via resolveDestinationTrackingHost) and compares it
  // against currentTrackingHost — this click's destination, not the
  // journey's previous hop.
  url = await buildCrossOriginJourneyHandoff(
    url,
    (link as any).destination_url,
    currentTrackingHost,
    eventsJourneyId
  );

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

      } catch (outerErr) {
        // Catch-all: should not reach here, but guarantees the spinner
        // is replaced with an error state instead of hanging forever.
        console.error('[Track] ✗ unhandled error in handleRedirect:', outerErr);
        setError(true);
      }
    };

    handleRedirectRef.current = handleRedirect;

    // ── Entry Choice gate ────────────────────────────────────────────────
    // Feature-flagged, browser-local, and deliberately checked BEFORE
    // handleRedirect() (and therefore before any network call) runs.
    //
    // isRelayReentry mirrors the hasUrlHandoff / probeExhausted check
    // inside Phase 3E above — computed here too because this decision
    // (show the gate at all) has to be made before Step 0/1 even start,
    // not just before the Phase 3E block later in the same call.
    const entryParams = new URLSearchParams(window.location.search);
    const isRelayReentry = !!(
      entryParams.get('vt_journey') ||
      entryParams.get('vt_token') ||
      entryParams.get('vt_jid') ||
      entryParams.get('vt_eids') ||
      entryParams.get('vt_ej_id') ||
      entryParams.get('vt_probe') === 'exhausted'
    );

    if (isEntryChoiceEnabled() && !isRelayReentry) {
      const existingChoice = getEntryChoice();
      if (!existingChoice) {
        // First time this browser (this origin) has hit the gate —
        // render it and wait. handleRedirect is invoked from the gate's
        // onChoose handler below, not from here.
        setAwaitingEntryChoice(true);
        return;
      }
      handleRedirect(existingChoice === 'direct');
      return;
    }

    // Entry Choice off, or this mount is a Relay re-entry: unchanged
    // behavior — run the existing flow exactly as before.
    handleRedirect(false);
  }, [token]);

  const onEntryChoice = (choice: EntryChoice) => {
    setEntryChoice(choice);
    setAwaitingEntryChoice(false);
    handleRedirectRef.current(choice === 'direct');
  };

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

  if (awaitingEntryChoice) {
    return <EntryChoiceGate onChoose={onEntryChoice} />;
  }

  if (awaitingEntryChoice) {
    return <EntryChoiceGate onChoose={onEntryChoice} />;
  }

  return <RelayLoadingScreen />;
}
