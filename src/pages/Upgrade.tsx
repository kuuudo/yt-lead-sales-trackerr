// src/pages/Upgrade.tsx
// Plan change for EXISTING paying customers. Same plan catalog (pricing_plans),
// same plan type and the same card as Pricing.tsx; the only differences are:
//   - plans shown = available_in_upgrade (Admin-controlled per plan)
//   - clicking a plan SCHEDULES a change at the end of the current billing
//     period (Stripe Subscription Schedule). Nothing is charged today.
// All rules are re-enforced by the schedule-plan-change / cancel-pending-plan-change
// Edge Functions; this page only decides what to show.

import { useEffect, useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { CalendarClock, Check, Loader2, Shield, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useViewing } from '../lib/ViewingContext';
import { useUpgradeEligibility } from '../lib/useUpgradeEligibility';
import { schedulePlanChange, cancelPendingPlanChange } from '../lib/planChange';
import {
  PricingPlan,
  PLAN_DISPLAY_COLUMNS,
  formatLongDate,
  formatMoney,
  intervalLabel,
} from '../lib/pricingPlans';
import { PlanCard } from '../components/pricing/PlanCard';
import { MultipleAccountsCTA } from '../components/pricing/MultipleAccountsCTA';
import CancelSubscriptionCard from '../components/CancelSubscriptionCard';
import ManagePaymentMethodButton from '../components/ManagePaymentMethodButton';

type UpgradePlan = PricingPlan & {
  is_enabled: boolean;
  available_in_upgrade: boolean;
};

export default function Upgrade() {
  const { user } = useAuth();
  const { isReadOnly } = useViewing();
  const { state, subscription, refresh } = useUpgradeEligibility(user?.id);

  const [allPlans, setAllPlans] = useState<UpgradePlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [choice, setChoice] = useState<UpgradePlan | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Same table as Pricing. RLS lets the client read plans that are enabled for
  // Pricing OR available in Upgrade; the Upgrade list below filters to the latter.
  useEffect(() => {
    if (state !== 'eligible') return;
    let cancelled = false;

    (async () => {
      setLoadingPlans(true);
      const { data, error: qErr } = await supabase
        .from('pricing_plans')
        .select(`${PLAN_DISPLAY_COLUMNS}, is_enabled, available_in_upgrade`)
        .or('available_in_upgrade.eq.true,is_enabled.eq.true')
        .order('sort_order', { ascending: true });

      if (cancelled) return;

      if (qErr) {
        console.error('[Upgrade] load plans', qErr);
        setError('Could not load plans. Please refresh.');
        setAllPlans([]);
      } else {
        setAllPlans((data as UpgradePlan[]) ?? []);
      }
      setLoadingPlans(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [state]);

  const upgradePlans = useMemo(
    () => allPlans.filter((p) => p.available_in_upgrade),
    [allPlans]
  );

  // Which plan is the customer on now? Matched from the mirrored plan_name /
  // billing_interval (kept current by the webhook). Display only; the server
  // compares real Stripe Price IDs.
  const currentPlan = useMemo(() => {
    if (!subscription) return null;
    const byName = allPlans.find(
      (p) =>
        subscription.plan_name &&
        p.name.trim().toLowerCase() === subscription.plan_name.trim().toLowerCase()
    );
    if (byName) return byName;
    return allPlans.find((p) => p.interval === subscription.billing_interval) ?? null;
  }, [allPlans, subscription]);

  if (state === 'loading') {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="text-red-600 animate-spin" size={28} />
      </div>
    );
  }

  // Frontend route guard. (The Edge Functions guard the real action.)
  if (state === 'ineligible' || isReadOnly || !subscription) {
    return <Navigate to="/settings" replace />;
  }

  const hasPending = !!subscription.pending_plan_code;
  const effectiveIso = subscription.pending_effective_at ?? subscription.current_period_end;
  const effectiveLabel = formatLongDate(effectiveIso);

  const handleSelect = (plan: UpgradePlan) => {
    setMessage(null);
    setError(null);
    setChoice(plan);
  };

  const confirmChange = async () => {
    if (!choice) return;
    setBusyPlanId(choice.id);
    setError(null);
    setMessage(null);
    try {
      const res = await schedulePlanChange(choice.id);
      await refresh();
      setMessage(
        `Scheduled: you'll switch to ${res.pending.plan_name} on ${formatLongDate(
          res.pending.effective_at
        )}. You will not be charged today.`
      );
      setChoice(null);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusyPlanId(null);
    }
  };

  const cancelPending = async () => {
    setCancelling(true);
    setError(null);
    setMessage(null);
    try {
      await cancelPendingPlanChange();
      await refresh();
      setChoice(null);
      setMessage('Pending change cancelled. You will stay on your current plan.');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col items-center py-10 px-2 relative">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center mb-10 relative z-10"
      >
        <h1 className="text-4xl font-black text-white tracking-tight mb-4">Change your plan</h1>
        <p className="text-zinc-500 text-sm max-w-xl mx-auto">
          Your current plan stays active until the end of the period you already paid for.
          A new plan starts automatically when that period ends. Nothing is charged today.
        </p>
      </motion.div>

      {/* Current vs pending */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 relative z-10">
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-6 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Current plan
          </p>
          <p className="text-2xl font-black text-white">
            {currentPlan
              ? `${formatMoney(currentPlan.amount_cents, currentPlan.currency)}${intervalLabel(
                  currentPlan.interval
                )}`
              : subscription.plan_name || 'Your plan'}
          </p>
          <p className="text-xs text-zinc-500">
            {currentPlan ? currentPlan.name : subscription.billing_interval || ''}
            {subscription.current_period_end &&
              ` · current period ends ${formatLongDate(subscription.current_period_end)}`}
          </p>
          <ManagePaymentMethodButton subscriptionId={subscription.id} />
        </div>

        <div
          className={`rounded-2xl border p-6 space-y-2 ${
            hasPending
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-zinc-800/60 bg-zinc-950/80'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Pending plan
          </p>
          {hasPending ? (
            <>
              <p className="text-2xl font-black text-white">
                {(() => {
                  const p = allPlans.find((x) => x.code === subscription.pending_plan_code);
                  return p
                    ? `${formatMoney(p.amount_cents, p.currency)}${intervalLabel(p.interval)}`
                    : subscription.pending_plan_name;
                })()}
              </p>
              <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                <CalendarClock size={12} />
                Effective {effectiveLabel} · Status:{' '}
                <span className="text-amber-300 font-bold uppercase tracking-wider">Scheduled</span>
              </p>
              <p className="text-xs text-zinc-500">
                You keep your current plan until then and will be charged the new price on that
                date, not before.
              </p>
              <button
                type="button"
                onClick={() => void cancelPending()}
                disabled={cancelling || !!busyPlanId}
                className="mt-2 inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-zinc-700 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-500 disabled:opacity-50"
              >
                {cancelling ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                Cancel pending change
              </button>
            </>
          ) : (
            <p className="text-sm text-zinc-500">No plan change scheduled.</p>
          )}
        </div>
      </div>

      {/* Confirmation */}
      {choice && (
        <div className="w-full max-w-5xl mb-8 rounded-2xl border border-red-600/30 bg-red-600/5 p-6 space-y-5 relative z-10">
          <div>
            <h3 className="text-sm font-bold text-white">Change your subscription</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Review your new subscription before confirming.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Current Plan
              </p>
              <p className="text-white font-bold">
                {currentPlan
                  ? currentPlan.name
                  : subscription.plan_name || 'Your current plan'}
              </p>
              <p className="text-zinc-400 text-xs">
                {currentPlan
                  ? `${formatMoney(currentPlan.amount_cents, currentPlan.currency)}${intervalLabel(
                      currentPlan.interval
                    )}`
                  : subscription.billing_interval
                  ? `${subscription.billing_interval}`
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-red-600/20 bg-red-600/5 p-4 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/80">
                New Plan
              </p>
              <p className="text-white font-bold">{choice.name}</p>
              <p className="text-zinc-300 text-xs">
                {formatMoney(choice.amount_cents, choice.currency)}
                {intervalLabel(choice.interval)}
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs text-zinc-300">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <p>
                <span className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mr-2">
                  Effective Date
                </span>
                {effectiveIso ? (
                  <span className="text-white font-medium">{effectiveLabel}</span>
                ) : (
                  <span className="text-amber-300">
                    Unable to determine the effective date. Please refresh and try again.
                  </span>
                )}
              </p>
              <p>
                <span className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mr-2">
                  Today&apos;s Charge
                </span>
                <span className="text-white font-medium">$0</span>
              </p>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              Your current subscription remains active until your new plan takes effect. You
              won&apos;t be charged today.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void confirmChange()}
              disabled={!!busyPlanId || !effectiveIso}
              className="inline-flex items-center gap-2 px-5 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
            >
              {busyPlanId ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Confirm Plan Change
            </button>
            <button
              type="button"
              onClick={() => setChoice(null)}
              disabled={!!busyPlanId}
              className="px-5 h-10 rounded-xl border border-zinc-700 text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:text-white disabled:opacity-60"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="w-full max-w-5xl mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-xs text-green-300 relative z-10">
          {message}
        </div>
      )}
      {error && (
        <div className="w-full max-w-5xl mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 relative z-10">
          {error}
        </div>
      )}

      {/* Same card + same catalog as Pricing */}
      {loadingPlans ? (
        <div className="py-16">
          <Loader2 className="text-red-600 animate-spin mx-auto" size={28} />
        </div>
      ) : upgradePlans.length === 0 ? (
        <p className="text-sm text-zinc-500">No plan changes are available right now.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl relative z-10">
          {upgradePlans.map((plan) => {
            const isCurrent = currentPlan?.id === plan.id;
            const isPending = subscription.pending_plan_code === plan.code;
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                onSelect={(p) => handleSelect(p as UpgradePlan)}
                busy={busyPlanId === plan.id}
                disabled={isCurrent || isPending || !!busyPlanId || cancelling}
                buttonLabel={
                  isCurrent
                    ? 'Current plan'
                    : isPending
                    ? 'Scheduled'
                    : hasPending
                    ? 'Switch to this instead'
                    : 'Switch at renewal'
                }
                showArrow={!isCurrent && !isPending}
                statusBadge={
                  isCurrent
                    ? { label: 'Current plan', tone: 'current' }
                    : isPending
                    ? { label: 'Scheduled', tone: 'scheduled' }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}

      <div className="w-full max-w-5xl mt-10 relative z-10">
        <CancelSubscriptionCard subscriptionId={subscription.id} onChanged={() => void refresh()} />
      </div>

      <MultipleAccountsCTA
        heading="Need More Accounts?"
        description={[
          'Expanding your team or managing accounts for multiple clients?',
          'We offer custom plans tailored to your business needs.',
        ]}
      />

      <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-zinc-600 text-[10px] font-bold uppercase tracking-widest relative z-10">
        <span className="flex items-center gap-1.5">
          <Shield size={10} /> Secured by Stripe
        </span>
        <span className="w-px h-3 bg-zinc-800 hidden sm:block" />
        <span className="flex items-center gap-1.5">
          <Check size={10} /> No charge until your plan renews
        </span>
        <span className="w-px h-3 bg-zinc-800 hidden sm:block" />
        <Link to="/settings" className="hover:text-zinc-300">
          Back to settings
        </Link>
      </div>
    </div>
  );
}