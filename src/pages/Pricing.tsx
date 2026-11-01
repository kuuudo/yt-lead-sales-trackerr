// src/pages/Pricing.tsx
// Phase B: loads enabled plans from pricing_plans; checkout by plan id only.

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Zap,
  BarChart3,
  Globe,
  Link2,
  Shield,
  Sparkles,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createCheckout } from '../lib/createCheckout';

type PricingPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  interval: 'week' | 'month' | 'year' | string;
  amount_cents: number;
  currency: string;
  is_recommended: boolean;
  sort_order: number;
};

const PRO_FEATURES = [
  'Unlimited campaigns',
  'Unlimited video imports',
  'Full attribution engine',
  'Multi-platform tracking',
  'Custom redirect domains',
  'Stripe revenue attribution',
  'Creator collaboration',
  'Priority support',
];

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  'Full attribution engine': <BarChart3 size={13} />,
  'Multi-platform tracking': <Globe size={13} />,
  'Custom redirect domains': <Link2 size={13} />,
  'Stripe revenue attribution': <Zap size={13} />,
  'Creator collaboration': <Sparkles size={13} />,
  'Priority support': <Shield size={13} />,
};

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

function intervalLabel(interval: string): string {
  if (interval === 'week') return '/week';
  if (interval === 'year') return '/year';
  return '/month';
}

export default function Pricing() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingPlans(true);
      setError(null);

      const { data, error: qErr } = await supabase
        .from('pricing_plans')
        .select(
          'id, code, name, description, interval, amount_cents, currency, is_recommended, sort_order'
        )
        .eq('is_enabled', true)
        .order('sort_order', { ascending: true });

      if (cancelled) return;

      if (qErr) {
        console.error('[Pricing] load plans', qErr);
        setError('Could not load plans. Please refresh.');
        setPlans([]);
      } else {
        setPlans((data as PricingPlan[]) ?? []);
      }
      setLoadingPlans(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpgrade = async (planId: string) => {
    setCheckoutPlanId(planId);
    setError(null);
    try {
      await createCheckout(planId);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
      setCheckoutPlanId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20 px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-violet-600/5 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center mb-14 relative z-10"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/10 border border-red-600/20 text-red-400 text-[10px] font-bold uppercase tracking-widest mb-6">
          <Zap size={10} />
          3-Day Free Trial — Subscribe to continue
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight mb-4">
          Choose your plan
        </h1>
        <p className="text-zinc-500 text-sm max-w-md mx-auto">
          Weekly, monthly, or yearly. Same product. Cancel anytime.
        </p>
      </motion.div>

      {loadingPlans ? (
        <div className="relative z-10 py-16">
          <Loader2 className="text-red-600 animate-spin mx-auto" size={28} />
        </div>
      ) : plans.length === 0 ? (
        <p className="relative z-10 text-sm text-zinc-500">
          No plans available right now. Please try again later.
        </p>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl relative z-10"
        >
          {plans.map((plan) => {
            const recommended = plan.is_recommended;
            const busy = checkoutPlanId === plan.id;

            return (
              <div
                key={plan.id}
                className={`rounded-2xl border bg-zinc-950/80 p-8 flex flex-col relative overflow-hidden ${
                  recommended
                    ? 'border-red-600/30 shadow-[0_0_60px_rgba(220,38,38,0.08)]'
                    : 'border-zinc-800/60'
                }`}
              >
                {recommended && (
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-600/60 to-transparent" />
                )}

                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <p
                      className={`text-[10px] font-bold uppercase tracking-widest ${
                        recommended ? 'text-red-400' : 'text-zinc-500'
                      }`}
                    >
                      {plan.name}
                    </p>
                    {recommended && (
                      <span className="px-2 py-0.5 rounded-full bg-red-600/15 text-red-400 text-[9px] font-bold uppercase tracking-wider border border-red-600/20">
                        Recommended
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-black text-white mb-1">{plan.name}</h2>
                  <p className="text-zinc-500 text-sm">
                    {plan.description || 'Full VSTRK access'}
                  </p>
                </div>

                <div className="flex items-end gap-1 mb-8">
                  <div className="text-4xl font-black text-white">
                    {formatMoney(plan.amount_cents, plan.currency)}
                  </div>
                  <div className="text-zinc-500 text-sm mb-1.5">
                    {intervalLabel(plan.interval)}
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {PRO_FEATURES.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-3 text-sm text-zinc-300"
                    >
                      <div className="w-4 h-4 rounded-full bg-red-600/15 border border-red-600/30 flex items-center justify-center shrink-0 text-red-400">
                        {FEATURE_ICONS[f] ?? <Check size={9} />}
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={!!checkoutPlanId}
                  className={`w-full h-12 rounded-xl transition-all text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                    recommended
                      ? 'bg-red-600 hover:bg-red-500 shadow-[0_0_30px_rgba(220,38,38,0.25)]'
                      : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'
                  }`}
                >
                  {busy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Subscribe
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </motion.div>
      )}

      {error && (
        <p className="relative z-10 mt-6 text-red-500 text-[10px] font-bold uppercase tracking-wide text-center">
          {error}
        </p>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="mt-10 flex flex-wrap items-center justify-center gap-6 text-zinc-600 text-[10px] font-bold uppercase tracking-widest relative z-10"
      >
        <span className="flex items-center gap-1.5">
          <Shield size={10} /> Secured by Stripe
        </span>
        <span className="w-px h-3 bg-zinc-800 hidden sm:block" />
        <span className="flex items-center gap-1.5">
          <Check size={10} /> No contracts
        </span>
        <span className="w-px h-3 bg-zinc-800 hidden sm:block" />
        <span className="flex items-center gap-1.5">
          <Zap size={10} /> Instant access after payment
        </span>
      </motion.div>
    </div>
  );
}
