// src/lib/planChange.ts
// Client for the two plan-change Edge Functions. Mirrors createCheckout.ts:
// the browser sends a plan id only; the server resolves the Stripe Price ID and
// re-validates the global switch, ownership, paid status and plan availability.

import { supabase } from './supabase';

async function callPlanFunction<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('Not signed in');
  }

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }

  return payload as T;
}

export type SchedulePlanChangeResult = {
  success: boolean;
  schedule_id: string;
  pending: {
    plan_code: string;
    plan_name: string;
    billing_interval: string;
    effective_at: string;
  };
};

/** Schedule (or replace) the pending change. No charge happens now. */
export function schedulePlanChange(planId: string) {
  if (!planId) throw new Error('Missing plan');
  return callPlanFunction<SchedulePlanChangeResult>('schedule-plan-change', {
    plan_id: planId,
  });
}

/** Cancel the pending change; the customer keeps the current plan. */
export function cancelPendingPlanChange() {
  return callPlanFunction<{ success: boolean; released: boolean }>(
    'cancel-pending-plan-change',
    {}
  );
}
