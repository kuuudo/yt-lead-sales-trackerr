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
 *           MVP: at most ONE cross-domain probe via upstream_domain.
 *           Path A / Path B code remains in repo but is not entered here.
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
  buildCleanTargetUrl,
  resolveUpstreamRootCandidate,
  buildUpstreamProbeUrl,
} from '../lib/probeState';
// Path A (relayCandidates) / Path B (resolveOrganizationFallbackCandidates) remain
// available for future advanced recovery — not imported on MVP runtime path.
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
      // gi retained in URL for legacy links; MVP runtime does not advance Path A/B.

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

      // ── MISS: MVP runtime — at most ONE upstream_domain probe ───────────
      // Path A / Path B remain in codebase (relayCandidates / probeState) but
      // are NOT entered on the normal MVP path. upstream MISS → DIRECT only.
      console.log('[ContinuationRelay] MISS — no continuation-valid cookie on this origin');

      const upstreamAlreadyTried = params.get('up') === '1';
      const upstreamRoot =
        typeof (targetLink as { upstream_domain?: string | null }).upstream_domain === 'string'
          ? (targetLink as { upstream_domain: string }).upstream_domain.trim()
          : null;

      if (upstreamRoot && !upstreamAlreadyTried) {
        try {
          const upstreamCand = await resolveUpstreamRootCandidate(
            targetLink.organization_id,
            upstreamRoot
          );
          if (
            upstreamCand &&
            upstreamCand.hostname.toLowerCase() !== hostname
          ) {
            const nextUrl = buildUpstreamProbeUrl(upstreamCand, rawTarget);
            console.log('[ContinuationRelay] MISS → upstream_domain single probe', {
              upstreamRoot,
              host: upstreamCand.hostname,
            });
            if (!cancelled) setState({ status: 'redirecting', target: rawTarget });
            window.location.replace(nextUrl);
            return;
          }
          console.log('[ContinuationRelay] upstream probe skipped', {
            upstreamRoot,
            reason: !upstreamCand
              ? 'no verified host for root'
              : 'candidate host is current host',
          });
        } catch (err) {
          console.warn('[ContinuationRelay] upstream probe failed — DIRECT', err);
        }
      }

      // No upstream, already tried (up=1), or probe not possible → DIRECT.
      // Do NOT fall through to Path A / Path B on MVP runtime.
      console.log('[ContinuationRelay] MVP DIRECT (no Path A/B)', {
        upstreamRoot: upstreamRoot || null,
        upstreamAlreadyTried,
      });
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
        Phase 3E — MVP: cookie → upstream×1 → DIRECT · Path A/B dormant
      </p>
    </div>
  );
}
