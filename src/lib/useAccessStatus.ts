
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type AccessState = 'loading' | 'allowed' | 'pricing';

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
  state: 'allowed' | 'pricing';
};

/**
 * Stage A:
 * 1. Active Team membership -> allowed
 * 2. Valid 3-day trial -> allowed
 * 3. Trusted paid subscription -> allowed
 * 4. Otherwise -> pricing
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
        // STEP 1: Claim pending Team membership.
        const { error: claimError } = await supabase.rpc(
          'claim_team_membership'
        );

        if (claimError) {
          console.error('[useAccessStatus] Team claim:', claimError);
        }

        // STEP 2: Check active Team membership.
        const { data: isTeam, error: teamError } = await supabase.rpc(
          'team_has_active_membership'
        );

        if (teamError) {
          console.error('[useAccessStatus] Team check:', teamError);
        }

        if (!cancelled && isTeam === true) {
          setResult({ userId, state: 'allowed' });
          return;
        }

        // STEP 3: Get the user's organization memberships.
        const { data: memberships, error: membershipError } =
          await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', userId);

        if (membershipError) {
          throw membershipError;
        }

        const orgIds = [
          ...new Set(
            (memberships ?? []).map((membership) => membership.organization_id)
          ),
        ];

        if (orgIds.length === 0) {
          if (!cancelled) {
            setResult({ userId, state: 'pricing' });
          }
          return;
        }

        // STEP 4: Check subscriptions.
        const { data: subscriptions, error: subscriptionError } =
          await supabase
            .from('subscriptions')
            .select(
              'status, trial_ends_at, stripe_subscription_id, organization_id'
            )
            .in('organization_id', orgIds);

        if (subscriptionError) {
          throw subscriptionError;
        }

        const now = Date.now();

        const hasAccess = (subscriptions ?? []).some(
          (subscription) =>
            isTrustedPaidSubscription(subscription) ||
            isValidTrialSubscription(subscription, now)
        );

        if (!cancelled) {
          setResult({
            userId,
            state: hasAccess ? 'allowed' : 'pricing',
          });
        }
      } catch (error) {
        console.error('[useAccessStatus] Access check failed:', error);

        if (!cancelled) {
          setResult({ userId, state: 'pricing' });
        }
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
