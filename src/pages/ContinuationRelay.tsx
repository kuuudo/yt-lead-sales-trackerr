/**
 * Continuation-relay endpoint.
 *
 * Route: /r/:relayToken
 *
 * Phase 1: resolve branded_tracking_domains by (hostname, relay_token)
 * Phase 2: read Kaksi cookies + safe redirect to known target
 * Phase 3A: append validated vt_jid / vt_token to the return URL
 * Phase 3E: on MISS, advance to the next Relay candidate or return clean
 *           target — zero analytics.
 *           PATH A (redirect_link.promotion_id set): sponsor → marketer →
 *             vstrk, resolved via relayCandidates.ts. Unchanged.
 *           PATH B (redirect_link.promotion_id null): one candidate per
 *             unique campaigns.root_domain (max 3), resolved via
 *             probeState.ts's resolveOrganizationFallbackCandidates().
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { resolveContinuationRelay } from '../services/domain/brandedDomains';
import { resolveRedirectToken } from '../lib/redirects';
import {
  getStoredRedirectToken,
  getStoredJourneyId,
} from '../lib/visitorCookie';
import {
  isSafeGroupIndex,
  buildCleanTargetUrl,
  resolveOrganizationFallbackCandidates,
  buildFallbackCandidateUrl,
} from '../lib/probeState';
import {
  resolvePromotionRelayCandidates,
  buildRelayCandidateUrl,
} from '../lib/relayCandidates';
import { isContinuationPrecheckHit } from '../lib/continuationPrecheck';
import RelayLoadingScreen from '../components/RelayLoadingScreen';
type RelayState =
  | { status: 'loading' }
  | {
      status: 'ok';
      hostname: string;
      relayToken: string;
      domainStatus: string;
      target: string | null;
      vtTokenPresent: boolean;
      vtJidPresent: boolean;
    }
  | { status: 'error'; message: string }
  | { status: 'redirecting'; target: string };

const isSafeTargetToken = (raw: string | null): raw is string => {
  if (!raw) return false;
  return /^[A-Za-z0-9_-]{2,32}$/.test(raw);
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (raw: string | null): raw is string =>
  typeof raw === 'string' && UUID_RE.test(raw);

export default function ContinuationRelay() {
  const { relayToken } = useParams<{ relayToken: string }>();
  const [state, setState] = useState<RelayState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!relayToken) {
        if (!cancelled) setState({ status: 'error', message: 'Missing relay token.' });
        return;
      }

      const hostname =
        typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

      if (!hostname) {
        if (!cancelled) setState({ status: 'error', message: 'Unable to determine hostname.' });
        return;
      }

      const row = await resolveContinuationRelay(hostname, relayToken);
      if (cancelled) return;

      if (!row) {
        setState({ status: 'error', message: 'Relay not found for this hostname.' });
        return;
      }

      const rawVtToken = getStoredRedirectToken();
      const rawVtJid = getStoredJourneyId();
      const vtTokenPresent = typeof rawVtToken === 'string' && rawVtToken.length > 0;
      const vtJidPresent = typeof rawVtJid === 'string' && rawVtJid.length > 0;

      console.log('[ContinuationRelay] relay resolved', {
        hostname: row.hostname,
        domainStatus: row.status,
        vtTokenPresent,
        vtJidPresent,
      });

      const params = new URLSearchParams(window.location.search);
      const rawTarget = params.get('target');
      const rawGi = params.get('gi');

      // Diagnostic mode (no target)
      if (!rawTarget) {
        if (!cancelled) {
          setState({
            status: 'ok',
            hostname: row.hostname,
            relayToken: row.relay_token,
            domainStatus: row.status,
            target: null,
            vtTokenPresent,
            vtJidPresent,
          });
        }
        return;
      }

      if (!isSafeTargetToken(rawTarget)) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'Invalid target. Only a known VSTRK tracking token is allowed.',
          });
        }
        return;
      }

      // Resolve the target redirect_link itself — this both validates the
      // token (replaces the old existence-only check) and gives us
      // promotion_id / asset_id, the entry point into the Promotion-specific
      // Relay candidate resolver below.
      const targetLink = await resolveRedirectToken(rawTarget);
      if (cancelled) return;

      if (!targetLink) {
        setState({
          status: 'error',
          message: 'Unknown target token. Relay will not redirect.',
        });
        return;
      }

      // ── Cookie candidate → continuation precheck → HIT / MISS ─────────
      // Presence alone is not enough; vt_token must look like a valid
      // continuation into the target token. Final authority remains
      // appendJourneyNode / validateJourneyContinuation on Track.
      let handoffToken: string | null = null;
      let handoffJid: string | null = null;

      if (vtTokenPresent && rawVtToken) {
        try {
          const contOk = await isContinuationPrecheckHit(rawVtToken, rawTarget);
          if (contOk) {
            handoffToken = rawVtToken;
            if (vtJidPresent && isValidUuid(rawVtJid)) {
              handoffJid = rawVtJid;
            }
          } else {
            console.log(
              '[ContinuationRelay] cookie present but continuation precheck MISS',
              { hasToken: true }
            );
          }
        } catch {
          /* omit — treat as MISS */
        }
      }

      const isHit = !!handoffToken;

      if (isHit) {
        const destination = new URL(buildCleanTargetUrl(rawTarget));
        if (handoffToken) destination.searchParams.set('vt_token', handoffToken);
        if (handoffJid) destination.searchParams.set('vt_jid', handoffJid);
        console.log('[ContinuationRelay] HIT — returning to VSTRK with handoff');
        if (!cancelled) setState({ status: 'redirecting', target: rawTarget });
        window.location.replace(destination.toString());
        return;
      }

      // ── MISS: advance to next Promotion-specific candidate or fall back ─
      console.log('[ContinuationRelay] MISS — no continuation-valid cookie on this origin');

      const candidateIndex = isSafeGroupIndex(rawGi);

      if (candidateIndex !== null && targetLink.promotion_id && targetLink.asset_id) {
        try {
          const resolution = await resolvePromotionRelayCandidates(
            targetLink.promotion_id,
            targetLink.asset_id
          );
          const candidates = resolution?.candidates ?? [];
          const nextIndex = candidateIndex + 1;

          if (nextIndex < candidates.length) {
            const nextUrl = buildRelayCandidateUrl(
              candidates[nextIndex],
              rawTarget,
              nextIndex
            );
            console.log('[ContinuationRelay] MISS → next candidate', {
              nextIndex,
              role: candidates[nextIndex].role,
              host: candidates[nextIndex].hostname,
            });
            if (!cancelled) setState({ status: 'redirecting', target: rawTarget });
            window.location.replace(nextUrl);
            return;
          }
        } catch (err) {
          console.warn('[ContinuationRelay] candidate advance failed — clean target', err);
        }
      } else if (!targetLink.promotion_id && targetLink.organization_id) {
        // PATH B — promotion_id IS NULL: root-domain fallback probe.
        // Candidates are recomputed fresh from targetLink.organization_id
        // on every hop (never from a client-supplied `org` param) — same
        // recompute-from-target model as Path A above.
        //
        // gi absent (candidateIndex === null) means this is the start of
        // the fallback chain (e.g. Track.tsx's platform-cookie check just
        // missed) — try candidate 0. gi present means that candidate index
        // just missed — try the next one. Same nextIndex/advance contract
        // as Path A, using probeState.ts's own buildFallbackCandidateUrl()
        // (not relayCandidates.ts's — Path B has no dependency on Path A).
        try {
          const candidates = await resolveOrganizationFallbackCandidates(
            targetLink.organization_id
          );
          const nextIndex = candidateIndex === null ? 0 : candidateIndex + 1;

          if (nextIndex < candidates.length) {
            const nextUrl = buildFallbackCandidateUrl(
              candidates[nextIndex],
              rawTarget,
              nextIndex
            );
            console.log('[ContinuationRelay] MISS → next fallback root-domain candidate', {
              nextIndex,
              rootDomain: candidates[nextIndex].root_domain,
              host: candidates[nextIndex].hostname,
            });
            if (!cancelled) setState({ status: 'redirecting', target: rawTarget });
            window.location.replace(nextUrl);
            return;
          }
        } catch (err) {
          console.warn('[ContinuationRelay] fallback candidate advance failed — clean target', err);
        }
      }

      // Exhausted or no probe state → clean platform target with loop guard.
      // vt_probe=exhausted tells Track not to start discovery again.
      console.log('[ContinuationRelay] candidates exhausted or absent — clean target (mark exhausted)');
      if (!cancelled) setState({ status: 'redirecting', target: rawTarget });
      window.location.replace(
        buildCleanTargetUrl(rawTarget, { probeExhausted: true })
      );
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [relayToken]);

  if (state.status === 'loading' || state.status === 'redirecting') {
    return <RelayLoadingScreen />;
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4">
        <AlertCircle className="text-red-500" size={28} />
        <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">
          Relay unavailable
        </p>
        <p className="text-zinc-600 text-xs max-w-sm text-center">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4 px-6">
      <ShieldCheck className="text-green-500" size={32} />
      <p className="text-zinc-100 text-sm font-bold uppercase tracking-widest">
        Continuation relay ready
      </p>
      <div className="text-zinc-500 text-xs font-mono space-y-1 text-center">
        <p>host: {state.hostname}</p>
        <p>relay: {state.relayToken}</p>
        <p>vt_token present: {state.vtTokenPresent ? 'true' : 'false'}</p>
        <p>vt_jid present: {state.vtJidPresent ? 'true' : 'false'}</p>
      </div>
      <p className="text-zinc-700 text-[10px] uppercase tracking-widest mt-4">
        Phase 3E — Promotion-specific Relay candidates · no journey writes
      </p>
    </div>
  );
}
