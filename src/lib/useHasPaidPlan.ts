// src/lib/useHasPaidPlan.ts
// Display-only: does the signed-in user own an org with a paid Stripe subscription?
// Same "trusted paid" rule as useUpgradeEligibility (owner + status 'active' + stripe_subscription_id),
// without the Upgrade global switch. Errors resolve to 'unknown' so callers hide the Pricing entry.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type PaidPlanState = 'loading' | 'paid' | 'none' | 'unknown';

export function useHasPaidPlan(userId: string | null | undefined): PaidPlanState {
  const [state, setState] = useState<PaidPlanState>('loading');

  useEffect(() => {
    if (!userId) {
      setState('unknown');
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { data: memberships, error: mErr } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', userId)
          .eq('role', 'owner');
        if (mErr) throw mErr;

        const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))];
        if (orgIds.length === 0) {
          if (!cancelled) setState('none');
          return;
        }

        const { data: subs, error: sErr } = await supabase
          .from('subscriptions')
          .select('id')
          .in('organization_id', orgIds)
          .eq('status', 'active')
          .not('stripe_subscription_id', 'is', null)
          .limit(1);
        if (sErr) throw sErr;

        if (!cancelled) setState((subs ?? []).length > 0 ? 'paid' : 'none');
      } catch (err) {
        console.error('[useHasPaidPlan]', err);
        if (!cancelled) setState('unknown');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}