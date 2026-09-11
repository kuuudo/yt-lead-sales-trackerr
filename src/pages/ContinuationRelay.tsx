/**
 * Continuation-relay endpoint.
 *
 * Route: /r/:relayToken
 *
 * Phase 1: resolve branded_tracking_domains by (hostname, relay_token)
 * Phase 2: read Kaksi cookies (diagnostics) + safe redirect to known target
 * Phase 3A: append validated vt_jid / vt_token to the return URL so
 *           www.vstrk.com Track.tsx can recover journey state
 *
 * HARD SCOPE:
 * - Accept only ?target=<short-token> (never a full URL)
 * - Validate target exists in redirect_links before any redirect
 * - Read existing cookies — do NOT write cookies
 * - Append vt_jid / vt_token only when present AND valid
 * - NEVER call appendJourneyNode, logRedirectEvent, setAttribution,
 *   syncSession, or any journey/analytics path
 * - NEVER accept return / next / url query parameters
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { resolveContinuationRelay } from '../services/domain/brandedDomains';
import { supabase } from '../lib/supabase';
import { resolveRedirectToken } from '../lib/redirects';
// Read-only cookie helpers — no writes.
import {
  getStoredRedirectToken,
  getStoredJourneyId,
} from '../lib/visitorCookie';

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

/** Reject anything that looks like a URL or is outside the normal short-token shape. */
const isSafeTargetToken = (raw: string | null): raw is string => {
  if (!raw) return false;
  return /^[A-Za-z0-9_-]{2,32}$/.test(raw);
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (raw: string | null): raw is string =>
  typeof raw === 'string' && UUID_RE.test(raw);

/**
 * Confirm the target is a real redirect_links.token.
 * Read-only. Does not resolve destination_url or touch journey state.
 */
const validateTargetToken = async (token: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('redirect_links')
    .select('token')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('[ContinuationRelay] target lookup failed:', error.message);
    return false;
  }
  return !!data?.token;
};

export default function ContinuationRelay() {
  const { relayToken } = useParams<{ relayToken: string }>();
  const [state, setState] = useState<RelayState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!relayToken) {
        if (!cancelled) {
          setState({ status: 'error', message: 'Missing relay token.' });
        }
        return;
      }

      const hostname =
        typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

      if (!hostname) {
        if (!cancelled) {
          setState({ status: 'error', message: 'Unable to determine hostname.' });
        }
        return;
      }

      // ── 1. Resolve relay identity (hostname + relay_token) ──────────────
      const row = await resolveContinuationRelay(hostname, relayToken);

      if (cancelled) return;

      if (!row) {
        setState({
          status: 'error',
          message: 'Relay not found for this hostname.',
        });
        return;
      }

      // ── 2. Read existing Kaksi cookies (read-only) ──────────────────────
      const rawVtToken = getStoredRedirectToken();
      const rawVtJid = getStoredJourneyId();
      const vtTokenPresent = typeof rawVtToken === 'string' && rawVtToken.length > 0;
      const vtJidPresent = typeof rawVtJid === 'string' && rawVtJid.length > 0;

      console.log('[ContinuationRelay] relay resolved', {
        hostname: row.hostname,
        relayToken: row.relay_token,
        domainStatus: row.status,
      });
      console.log('[ContinuationRelay] Kaksi vt_token present:', vtTokenPresent);
      console.log('[ContinuationRelay] Kaksi vt_jid present:', vtJidPresent);

      // ── 3. Parse and validate ?target= ──────────────────────────────────
      const params = new URLSearchParams(window.location.search);
      const rawTarget = params.get('target');

      // No target → diagnostic UI only
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
        console.warn('[ContinuationRelay] rejected unsafe target shape:', rawTarget);
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'Invalid target. Only a known VSTRK tracking token is allowed.',
          });
        }
        return;
      }

      const targetOk = await validateTargetToken(rawTarget);
      if (cancelled) return;

      if (!targetOk) {
        console.warn('[ContinuationRelay] target token not found in redirect_links:', rawTarget);
        setState({
          status: 'error',
          message: 'Unknown target token. Relay will not redirect.',
        });
        return;
      }

      console.log('[ContinuationRelay] target validated:', rawTarget);

      // ── 4. Phase 3A: build return URL with optional handoff params ──────
      // Destination is always the platform host + validated target.
      // Append vt_jid / vt_token only when present AND valid.
      const destination = new URL(`https://www.vstrk.com/${rawTarget}`);

      // vt_token: must resolve to a real redirect_links row
      if (vtTokenPresent && rawVtToken) {
        try {
          const previousLink = await resolveRedirectToken(rawVtToken);
          if (previousLink) {
            destination.searchParams.set('vt_token', rawVtToken);
            console.log('[ContinuationRelay] appending vt_token (resolved)');
          } else {
            console.warn(
              '[ContinuationRelay] vt_token present but did not resolve — omitting from URL'
            );
          }
        } catch (err) {
          console.warn(
            '[ContinuationRelay] vt_token resolve threw — omitting from URL',
            err
          );
        }
      }

      // vt_jid: UUID shape only (no DB lookup on the relay)
      if (vtJidPresent && isValidUuid(rawVtJid)) {
        destination.searchParams.set('vt_jid', rawVtJid);
        console.log('[ContinuationRelay] appending vt_jid (valid UUID)');
      } else if (vtJidPresent) {
        console.warn(
          '[ContinuationRelay] vt_jid present but malformed UUID — omitting from URL'
        );
      }

      if (cancelled) return;

      setState({ status: 'redirecting', target: rawTarget });

      // replace() avoids leaving the relay in the browser history stack
      window.location.replace(destination.toString());
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [relayToken]);

  if (state.status === 'loading' || state.status === 'redirecting') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4">
        <Loader2 className="text-zinc-500 animate-spin" size={28} />
        <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
          {state.status === 'redirecting' ? 'Continuing…' : 'Resolving relay…'}
        </p>
      </div>
    );
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

  // Diagnostic UI when no ?target= was supplied
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4 px-6">
      <ShieldCheck className="text-green-500" size={32} />
      <p className="text-zinc-100 text-sm font-bold uppercase tracking-widest">
        Continuation relay ready
      </p>
      <div className="text-zinc-500 text-xs font-mono space-y-1 text-center">
        <p>host: {state.hostname}</p>
        <p>relay: {state.relayToken}</p>
        <p>domain status: {state.domainStatus}</p>
        <p>vt_token present: {state.vtTokenPresent ? 'true' : 'false'}</p>
        <p>vt_jid present: {state.vtJidPresent ? 'true' : 'false'}</p>
      </div>
      <p className="text-zinc-700 text-[10px] uppercase tracking-widest mt-4">
        Phase 3A — handoff params appended when valid · no journey writes
      </p>
    </div>
  );
}
