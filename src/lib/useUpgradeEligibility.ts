// src/lib/useUpgradeEligibility.ts
// Frontend guard for Upgrade. This only decides what to SHOW; the Edge Functions
// re-check everything on the server (global switch, owner, trusted paid, plan).
//
// Eligible = global Upgrade switch ON
//            + the signed-in user is an OWNER of an org
//            + that org's subscription is status 'active' with a stripe_subscription_id
//              (the same "trusted paid" rule as useAccessStatus).
// Team-only, trial-only and never-paid users are 'ineligible'.
// Always uses the real signed-in user, never an Operator "viewing" identity.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type UpgradeSubscription = {
  id: string;
  organization_id: string;
  status: string;
  plan_name: string | null;
  billing_interval: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string;
  stripe_schedule_id: string | null;
  pending_plan_code: string | null;
  pending_plan_name: string | null;
  pending_billing_interval: string | null;
  pending_effective_at: string | null;
};

type State = 'loading' | 'eligible' | 'ineligible';

const SUB_COLUMNS =
  'id, organization_id, status, plan_name, billing_interval, current_period_end, stripe_subscription_id, stripe_schedule_id, pending_plan_code, pending_plan_name, pending_billing_interval, pending_effective_at';

async function fetchEligibleSubscription(
  userId: string
): Promise<UpgradeSubscription | null> {
  const { data: enabled, error: enabledError } = await supabase.rpc('get_upgrade_enabled');
  if (enabledError || enabled !== true) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('role', 'owner');
  if (membershipError) return null;

  const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))];
  if (orgIds.length === 0) return null;

  const { data: subs, error: subError } = await supabase
    .from('subscriptions')
    .select(SUB_COLUMNS)
    .in('organization_id', orgIds)
    .eq('status', 'active')
    .not('stripe_subscription_id', 'is', null);
  if (subError) return null;

  return ((subs ?? [])[0] as UpgradeSubscription | undefined) ?? null;
}

export function useUpgradeEligibility(userId: string | null | undefined) {
  const [state, setState] = useState<State>('loading');
  const [subscription, setSubscription] = useState<UpgradeSubscription | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      setState('ineligible');
      return;
    }
    try {
      const sub = await fetchEligibleSubscription(userId);
      setSubscription(sub);
      setState(sub ? 'eligible' : 'ineligible');
    } catch (err) {
      console.error('[useUpgradeEligibility]', err);
      setSubscription(null);
      setState('ineligible');
    }
  }, [userId]);

  useEffect(() => {
    setState('loading');
    void refresh();
  }, [refresh]);

  return { state, subscription, refresh };
}
