import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * loading : not decided yet (first check or waiting for a new workspace to finish being created)
 * allowed : Team member, valid trial, or trusted paid subscription
 * pricing : CONFIRMED no access (e.g. trial expired and nothing else valid)
 * error   : could not be determined (queries kept failing, or a new workspace never appeared).
 *           NOT the same as "no access": the app shows a retry screen, never the Pricing Gate.
 */
export type AccessState = 'loading' | 'allowed' | 'pricing' | 'error';

export type AccessSubscription = {
  status: string | null;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
};

/** Trusted paid: active + a real Stripe subscription id. */
export function isTrustedPaidSubscription(subscription: AccessSubscription): boolean {
  return subscription.status === 'active' && subscription.stripe_subscription_id != null;
}

/** Valid trial: trialing and trial_ends_at still in the future. */
export function isValidTrialSubscription(subscription: AccessSubscription, now: number): boolean {
  return (
    subscription.status === 'trialing' &&
    subscription.trial_ends_at != null &&
    new Date(subscription.trial_ends_at).getTime() > now
  );
}

type Result = {
  userId: string;
  state: 'allowed' | 'pricing' | 'error';
};

// An account younger than this may still be having its workspace created
// (profile -> organization -> membership -> subscription, see createUserWorkspace).
// Used ONLY to decide whether missing rows mean "wait" or "really missing".
const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
const RETRY_INTERVAL_MS = 1000;
const MAX_PENDING_RETRIES = 10; // new account, workspace rows not there yet (~10s)
const MAX_ERROR_RETRIES = 3; // query errors (~3s)

type CheckOutcome = 'allowed' | 'pricing' | 'pending' | 'error';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One pass of the access check. Order and rules are unchanged:
 * Team -> trial -> trusted paid -> otherwise no access.
 *
 * 'pending' = rows are missing but the account is new, so they may still be created.
 * 'error'   = a query failed, or the Team check failed and nothing else granted access
 *             (we cannot prove "no access" when the Team check itself was unknown).
 */
async function checkAccessOnce(
  userId: string,
  isNewAccount: boolean
): Promise<CheckOutcome> {
  try {
    // Team check. A failure here means "unknown", not "not a Team member".
    let teamUnknown = false;
    const { data: isTeam, error: teamError } = await supabase.rpc(
      'team_has_active_membership'
    );
    if (teamError) {
      console.error('[useAccessStatus] Team check:', teamError);
      teamUnknown = true;
    }
    if (isTeam === true) return 'allowed';

    // What to return when we found no access: confirmed only if the Team check worked.
    const noAccess: CheckOutcome = teamUnknown ? 'error' : 'pricing';
    // Missing rows: wait if the account is new, otherwise they are genuinely missing.
    const missing: CheckOutcome = isNewAccount ? 'pending' : noAccess;

    const { data: memberships, error: membershipError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);
    if (membershipError) throw membershipError;

    const orgIds = [
      ...new Set((memberships ?? []).map((m) => m.organization_id)),
    ];
    if (orgIds.length === 0) return missing;

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('status, trial_ends_at, stripe_subscription_id, organization_id')
      .in('organization_id', orgIds);
    if (subscriptionError) throw subscriptionError;

    const list = subscriptions ?? [];
    const now = Date.now();
    const hasAccess = list.some(
      (s) => isTrustedPaidSubscription(s) || isValidTrialSubscription(s, now)
    );
    if (hasAccess) return 'allowed';

    // Org exists but no subscription row at all: may not be created yet (new) or truly missing (old).
    if (list.length === 0) return missing;

    // Subscription rows exist but none is a valid trial / paid: trial expired or cancelled.
    return noAccess;
  } catch (error) {
    console.error('[useAccessStatus] Access check failed:', error);
    return 'error';
  }
}

/**
 * Access states: see AccessState above.
 *
 * - allowed for the whole valid trial period (status 'trialing' AND trial_ends_at in the future).
 * - pricing only when no access is CONFIRMED (e.g. trial_ends_at passed; the Stripe webhook
 *   does not need to change status first).
 * - Missing rows on a brand-new account keep the state at 'loading' and are re-checked.
 * - Query failures are retried, then reported as 'error' (never as 'pricing').
 *
 * Legacy account_access inactive is not used for billing access.
 */
export function useAccessStatus(
  userId: string | null | undefined
): AccessState {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      try {
        // Claim pending Team membership (once). Failure is logged; the Team check decides.
        const { error: claimError } = await supabase.rpc('claim_team_membership');
        if (claimError) {
          console.error('[useAccessStatus] Team claim:', claimError);
        }
        if (cancelled) return;

        // Account age only decides whether missing rows are worth waiting for.
        // Unknown or unparsable age => treat as new (wait) rather than as a paywall.
        let isNewAccount = true;
        try {
          const { data } = await supabase.auth.getSession();
          const createdAt = Date.parse(data.session?.user?.created_at ?? '');
          if (Number.isFinite(createdAt)) {
            isNewAccount = Date.now() - createdAt < NEW_ACCOUNT_WINDOW_MS;
          }
        } catch (e) {
          console.error('[useAccessStatus] Session read:', e);
        }
        if (cancelled) return;

        let pendingRetries = 0;
        let errorRetries = 0;

        for (;;) {
          const outcome = await checkAccessOnce(userId, isNewAccount);
          if (cancelled) return;

          if (outcome === 'allowed' || outcome === 'pricing') {
            setResult({ userId, state: outcome });
            return;
          }

          if (outcome === 'pending') {
            pendingRetries += 1;
            if (pendingRetries > MAX_PENDING_RETRIES) {
              // The new workspace never appeared. Unknown, not "no access".
              console.error('[useAccessStatus] Workspace data did not appear in time');
              setResult({ userId, state: 'error' });
              return;
            }
          } else {
            errorRetries += 1;
            if (errorRetries > MAX_ERROR_RETRIES) {
              setResult({ userId, state: 'error' });
              return;
            }
          }

          await sleep(RETRY_INTERVAL_MS);
          if (cancelled) return;
        }
      } catch (error) {
        console.error('[useAccessStatus] Unexpected failure:', error);
        if (!cancelled) setResult({ userId, state: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return 'allowed';

  if (!result || result.userId !== userId) {
    return 'loading';
  }

  return result.state;
}
