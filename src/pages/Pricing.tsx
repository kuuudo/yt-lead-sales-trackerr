// src/pages/Pricing.tsx
// Phase B: loads enabled plans from pricing_plans; checkout by plan id only.
// Plan type, display helpers and the card itself now live in shared modules
// (lib/pricingPlans.ts, components/pricing/PlanCard.tsx) so Upgrade.tsx renders
// the same thing. Query + checkout behaviour below is unchanged.

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Zap, Shield, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createCheckout } from '../lib/createCheckout';
import { PricingPlan, PLAN_DISPLAY_COLUMNS } from '../lib/pricingPlans';
import { PlanCard } from '../components/pricing/PlanCard';

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
        .select(PLAN_DISPLAY_COLUMNS)
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
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              busy={checkoutPlanId === plan.id}
              disabled={!!checkoutPlanId}
              onSelect={(p) => handleUpgrade(p.id)}
            />
          ))}
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
