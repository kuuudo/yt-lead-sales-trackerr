// src/components/CancelSubscriptionCard.tsx
// Cancel Subscription / Resume Subscription, mounted ONLY on the Change Plan page
// (Upgrade.tsx), for the exact subscription that page shows.
//
//  - Cancelling sets Stripe cancel_at_period_end = true: the subscription ends at the END
//    of the paid period (never immediately) and access continues until then.
//  - Resume sets it back to false.
//  - This is NOT "Cancel scheduled plan change", which stays on the Change Plan page.
// Renders nothing in Operator read-only viewing.

import { useState } from 'react';
import { AlertTriangle, CalendarClock, Loader2, RotateCcw } from 'lucide-react';
import { useViewing } from '../lib/ViewingContext';
import { useCancelState, setCancelAtPeriodEnd } from '../lib/useCancelSubscription';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

type Props = {
  /** The subscriptions.id the Change Plan page is showing. */
  subscriptionId: string;
  /** Called after a cancel/resume attempt so the host page can refresh its own data. */
  onChanged?: () => void;
};

export default function CancelSubscriptionCard({ subscriptionId, onChanged }: Props) {
  const { isReadOnly } = useViewing();
  const { state, sub, refresh } = useCancelState(subscriptionId);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (isReadOnly || state !== 'ready' || !sub) return null;

  const endLabel = formatDate(sub.current_period_end);

  const run = async (cancel: boolean) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await setCancelAtPeriodEnd(sub.id, cancel);
      await refresh();
      onChanged?.();
      const when = formatDate(res.ends_at ?? sub.current_period_end);
      setMessage(
        cancel
          ? `Your subscription will end on ${when ?? 'the last day of your billing period'}. You keep full access until then.`
          : 'Your subscription has been resumed and will renew as normal.'
      );
      setConfirming(false);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
      // A partial failure can still have changed state (e.g. a scheduled change removed).
      await refresh();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bento-card space-y-4 w-full max-w-xl mx-auto relative z-10">
      {sub.cancel_at_period_end ? (
        <>
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <CalendarClock size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-300">Cancellation scheduled</p>
              <p className="text-xs text-zinc-300">
                Your {sub.plan_name ?? ''} subscription ends on{' '}
                <span className="font-bold text-white">
                  {endLabel ?? 'the last day of your billing period'}
                </span>
                . You keep full access until then and will not be charged again.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(false)}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 text-[10px] font-black uppercase tracking-widest text-zinc-200 hover:text-white hover:border-zinc-600 transition-all disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Resume subscription
          </button>
        </>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-bold text-white">Cancel subscription</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Stop future charges. Your subscription stays active until the end of the period you
              have already paid for{endLabel ? ` (${endLabel})` : ''}.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              setMessage(null);
              setConfirming(true);
            }}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-red-600/40 bg-red-600/10 text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-600/20 transition-all disabled:opacity-40"
          >
            Cancel subscription
          </button>
        </>
      )}

      {message && <p className="text-xs text-green-400">{message}</p>}
      {error && (
        <p className="text-red-500 text-[10px] font-bold uppercase tracking-wide">{error}</p>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-subscription-title"
          onClick={() => {
            if (!busy) setConfirming(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" />
              <h3 id="cancel-subscription-title" className="text-base font-bold text-white">
                Cancel your subscription?
              </h3>
            </div>

            <p className="text-sm text-zinc-300">
              Your subscription will end on{' '}
              <span className="font-bold text-white">
                {endLabel ?? 'the last day of your billing period'}
              </span>
              . You keep full access to VSTRK until then, and you will not be charged again.
            </p>

            {sub.pending_plan_name && (
              <p className="text-xs text-amber-400">
                Your scheduled switch to {sub.pending_plan_name} will be removed.
              </p>
            )}
            <p className="text-xs text-zinc-500">
              You can resume before that date. After it, you would need to subscribe again.
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="px-4 h-10 rounded-xl border border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-600 transition-all disabled:opacity-40"
              >
                Keep subscription
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(true)}
                className="inline-flex items-center justify-center gap-2 px-4 h-10 rounded-xl bg-red-600 text-[10px] font-black uppercase tracking-widest text-white hover:bg-red-500 transition-all disabled:opacity-40"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Yes, cancel at period end
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
