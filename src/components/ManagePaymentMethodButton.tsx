// src/components/ManagePaymentMethodButton.tsx
// "Change payment method": opens Stripe's hosted Customer Portal (restricted to payment
// method updates) for the subscription the Change Plan page is showing. VSTRK never
// handles card details. The browser navigates to Stripe in the same tab; Stripe's
// "Return" link brings the user back to /settings/upgrade.
// Renders nothing in Operator read-only viewing.

import { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useViewing } from '../lib/ViewingContext';

type Props = {
  /** The subscriptions.id the Change Plan page is showing. */
  subscriptionId: string;
};

export default function ManagePaymentMethodButton({ subscriptionId }: Props) {
  const { isReadOnly } = useViewing();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coming back with the browser Back button can restore this page from cache mid-redirect.
  useEffect(() => {
    const reset = () => setBusy(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  if (isReadOnly) return null;

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        throw new Error('Not signed in');
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            subscription_id: subscriptionId,
            origin: window.location.origin,
          }),
        }
      );

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `Request failed (${res.status})`);
      }
      if (typeof payload?.url !== 'string') {
        throw new Error('Could not open the payment page');
      }

      window.location.href = payload.url; // stay "busy" while the browser navigates
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="pt-3 space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void open()}
        className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 text-[10px] font-black uppercase tracking-widest text-zinc-200 hover:text-white hover:border-zinc-600 transition-all disabled:opacity-40"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
        Change payment method
      </button>
      {error && (
        <p className="text-red-500 text-[10px] font-bold uppercase tracking-wide">{error}</p>
      )}
    </div>
  );
}
