// src/lib/useCancelSubscription.ts
// Data + API for Cancel / Resume Subscription on the Change Plan page.
//
// Loads ONLY the subscription row the Upgrade page is showing (its id is passed in), so
// the card can never act on a different organization's subscription. The subscriptions
// SELECT policy already limits rows to organizations the signed-in user owns.
//
// Independent of useUpgradeEligibility on purpose: if the cancel_at_period_end column is
// missing (migration not run) only the cancel card hides; Change Plan keeps working.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type CancelSubscriptionRow = {
  id: string;
  status: string;
  plan_name: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  pending_plan_name: string | null;
};

type State = 'loading' | 'ready' | 'error';

const COLUMNS =
  'id, status, plan_name, current_period_end, cancel_at_period_end, pending_plan_name';

export function useCancelState(subscriptionId: string | null | undefined) {
  const [state, setState] = useState<State>('loading');
  const [sub, setSub] = useState<CancelSubscriptionRow | null>(null);

  const refresh = useCallback(async () => {
    if (!subscriptionId) {
      setSub(null);
      setState('ready');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(COLUMNS)
        .eq('id', subscriptionId)
        .not('stripe_subscription_id', 'is', null)
        .maybeSingle();
      if (error) throw error;
      setSub(
        data
          ? ({ ...data, cancel_at_period_end: data.cancel_at_period_end === true } as CancelSubscriptionRow)
          : null
      );
      setState('ready');
    } catch (err) {
      console.error('[useCancelState]', err);
      setSub(null);
      setState('error');
    }
  }, [subscriptionId]);

  useEffect(() => {
    setState('loading');
    void refresh();
  }, [refresh]);

  return { state, sub, refresh };
}

// Calls the set-cancel-at-period-end Edge Function (same pattern as createCheckout.ts).
export async function setCancelAtPeriodEnd(
  subscriptionId: string,
  cancel: boolean
): Promise<{ cancel_at_period_end: boolean; ends_at: string | null }> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('Not signed in');
  }

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/set-cancel-at-period-end`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ subscription_id: subscriptionId, cancel_at_period_end: cancel }),
    }
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }

  return {
    cancel_at_period_end: payload?.cancel_at_period_end === true,
    ends_at: typeof payload?.ends_at === 'string' ? payload.ends_at : null,
  };
}
