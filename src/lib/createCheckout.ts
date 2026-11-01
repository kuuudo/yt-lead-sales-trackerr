// src/lib/createCheckout.ts
// Phase B: pass plan_id only. Server resolves Stripe Price ID.

import { supabase } from './supabase';

export async function createCheckout(planId: string): Promise<void> {
  if (!planId) {
    throw new Error('Missing plan');
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('Not signed in');
  }

  const origin = window.location.origin;

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        origin,
        plan_id: planId,
      }),
    }
  );

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload?.error || `Checkout failed (${res.status})`);
  }

  if (!payload?.url || typeof payload.url !== 'string') {
    throw new Error('Checkout did not return a URL');
  }

  window.location.href = payload.url;
}
