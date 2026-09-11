/**
 * Phase 3E Step 2 — VSTRK platform special cookie candidate.
 *
 * Route: /r/platform (platform host only)
 *
 * Reads www.vstrk.com cookies, runs the same continuation precheck as the
 * branded relay, then either returns handoff to /:target or continues into
 * the existing branded probe / exhaust path.
 *
 * Does NOT consume max-3 external cookie-parent budget.
 * Does NOT write analytics / journey rows.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  getStoredRedirectToken,
  getStoredJourneyId,
} from '../lib/visitorCookie';
import { isContinuationPrecheckHit } from '../lib/continuationPrecheck';
import {
  isSafeOrgId,
  loadProbeCandidates,
  buildProbeUrl,
  buildCleanTargetUrl,
} from '../lib/probeState';

const PLATFORM_HOSTS = ['vstrk.com', 'www.vstrk.com', 'localhost', '127.0.0.1'];

const isPlatformHost = (hostname: string): boolean => {
  if (PLATFORM_HOSTS.includes(hostname)) return true;
  if (hostname.endsWith('.vercel.app')) return true;
  return false;
};

const isSafeTargetToken = (raw: string | null): raw is string => {
  if (!raw) return false;
  return /^[A-Za-z0-9_-]{2,32}$/.test(raw);
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (raw: string | null): raw is string =>
  typeof raw === 'string' && UUID_RE.test(raw);

const validateTargetToken = async (token: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('redirect_links')
    .select('token')
    .eq('token', token)
    .maybeSingle();
  if (error) {
    console.error('[PlatformContinuation] target lookup failed:', error.message);
    return false;
  }
  return !!data?.token;
};

type State =
  | { status: 'loading' }
  | { status: 'redirecting' }
  | { status: 'error'; message: string };

export default function PlatformContinuation() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const hostname =
        typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

      if (!isPlatformHost(hostname)) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'Platform continuation is only valid on the VSTRK host.',
          });
        }
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const rawTarget = params.get('target');
      const rawOrg = params.get('org');

      if (!isSafeTargetToken(rawTarget)) {
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
        setState({
          status: 'error',
          message: 'Unknown target token. Platform continuation will not redirect.',
        });
        return;
      }

      const rawVtToken = getStoredRedirectToken();
      const rawVtJid = getStoredJourneyId();

      let handoffToken: string | null = null;
      let handoffJid: string | null = null;

      if (rawVtToken) {
        try {
          const contOk = await isContinuationPrecheckHit(rawVtToken, rawTarget);
          if (contOk) {
            handoffToken = rawVtToken;
            if (isValidUuid(rawVtJid)) handoffJid = rawVtJid;
          } else {
            console.log(
              '[PlatformContinuation] cookie present but continuation precheck MISS'
            );
          }
        } catch {
          /* MISS */
        }
      } else {
        console.log('[PlatformContinuation] no vt_token on platform origin');
      }

      if (handoffToken) {
        const destination = new URL(buildCleanTargetUrl(rawTarget));
        destination.searchParams.set('vt_token', handoffToken);
        if (handoffJid) destination.searchParams.set('vt_jid', handoffJid);
        console.log('[PlatformContinuation] HIT — handoff to target');
        if (!cancelled) setState({ status: 'redirecting' });
        window.location.replace(destination.toString());
        return;
      }

      // MISS → existing branded probe (does not count platform against max-3)
      const orgId = isSafeOrgId(rawOrg) ? rawOrg : null;
      if (orgId) {
        try {
          const candidates = await loadProbeCandidates(orgId);
          if (candidates.length > 0) {
            const nextUrl = buildProbeUrl(candidates[0], rawTarget, orgId, 0);
            console.log('[PlatformContinuation] MISS → branded probe', {
              host: candidates[0].hostname,
            });
            if (!cancelled) setState({ status: 'redirecting' });
            window.location.replace(nextUrl);
            return;
          }
        } catch (err) {
          console.warn('[PlatformContinuation] branded probe chain failed', err);
        }
      }

      console.log('[PlatformContinuation] MISS — exhaust to clean target');
      if (!cancelled) setState({ status: 'redirecting' });
      window.location.replace(
        buildCleanTargetUrl(rawTarget, { probeExhausted: true })
      );
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4">
        <AlertCircle className="text-red-500" size={28} />
        <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">
          Platform continuation unavailable
        </p>
        <p className="text-zinc-600 text-xs max-w-sm text-center">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4">
      <Loader2 className="text-zinc-500 animate-spin" size={28} />
      <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
        Continuing…
      </p>
    </div>
  );
}
