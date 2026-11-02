// src/lib/usePricingEntry.ts
// Show the Pricing entry ONLY for an account whose access comes from a valid trial:
// access is 'allowed' (useAccessStatus), not an active Team member, has a valid trial,
// has no trusted paid subscription, and is not an always-allowed account.
// Loading, errors and unknown all resolve to no entry.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import {
  useAccessStatus,
  isTrustedPaidSubscription,
  isValidTrialSubscription,
} from './useAccessStatus';
import { isAlwaysAllowedEmail } from './accessConfig';

export type PricingEntryState = 'loading' | 'show' | 'hide';

export function usePricingEntry(): PricingEntryState {
  const { user } = useAuth();
  const userId = user?.id;
  const access = useAccessStatus(userId);
  const alwaysAllowed = isAlwaysAllowedEmail(user?.email);
  const [result, setResult] = useState<{ userId: string; show: boolean } | null>(null);

  useEffect(() => {
    if (!userId || alwaysAllowed || access !== 'allowed') return;
    let cancelled = false;

    (async () => {
      try {
        const { data: isTeam, error: teamError } = await supabase.rpc('team_has_active_membership');
        if (teamError) throw teamError;
        if (isTeam === true) {
          if (!cancelled) setResult({ userId, show: false });
          return;
        }

        const { data: memberships, error: mErr } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', userId);
        if (mErr) throw mErr;

        const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))];
        if (orgIds.length === 0) {
          if (!cancelled) setResult({ userId, show: false });
          return;
        }

        const { data: subs, error: sErr } = await supabase
          .from('subscriptions')
          .select('status, trial_ends_at, stripe_subscription_id, organization_id')
          .in('organization_id', orgIds);
        if (sErr) throw sErr;

        const now = Date.now();
        const list = subs ?? [];
        const paid = list.some((s) => isTrustedPaidSubscription(s));
        const trial = list.some((s) => isValidTrialSubscription(s, now));
        if (!cancelled) setResult({ userId, show: trial && !paid });
      } catch (err) {
        console.error('[usePricingEntry]', err);
        if (!cancelled) setResult({ userId, show: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, alwaysAllowed, access]);

  if (!userId || alwaysAllowed) return 'hide';
  if (access === 'loading') return 'loading';
  if (access !== 'allowed') return 'hide';
  if (!result || result.userId !== userId) return 'loading';
  return result.show ? 'show' : 'hide';
}