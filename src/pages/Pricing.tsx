import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Zap, BarChart3, Globe, Link2, Shield, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { createCheckout } from '../lib/createCheckout';

const FREE_FEATURES = [
  'Up to 2 campaigns',
  '1 video import',
  'Basic click tracking',
  'Single platform (YouTube)',
];

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

export default function Pricing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      await createCheckout();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20 px-6 relative overflow-hidden">

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-violet-600/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center mb-14 relative z-10"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/10 border border-red-600/20 text-red-400 text-[10px] font-bold uppercase tracking-widest mb-6">
          <Zap size={10} />
          7-Day Free Trial — No Charge Until Trial Ends
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight mb-4">
          Simple, Honest Pricing
        </h1>
        <p className="text-zinc-500 text-sm max-w-md mx-auto">
          One plan. Everything included. Cancel anytime.
        </p>
      </motion.div>

      {/* Cards */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-3xl relative z-10"
      >
        {/* Free Plan */}
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-8 flex flex-col">
          <div className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Current Plan</p>
            <h2 className="text-2xl font-black text-white mb-1">Free</h2>
            <p className="text-zinc-600 text-sm">Limited access to get started</p>
          </div>

          <div className="text-3xl font-black text-zinc-400 mb-8">
            $0
            <span className="text-base font-normal text-zinc-600"> /month</span>
          </div>

          <ul className="space-y-3 mb-8 flex-1">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-zinc-500">
                <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                  <Check size={9} className="text-zinc-500" />
                </div>
                {f}
              </li>
            ))}
          </ul>

          <div className="h-11 rounded-xl border border-zinc-800 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            Current Plan
          </div>
        </div>

        {/* Pro Plan */}
        <div className="rounded-2xl border border-red-600/30 bg-zinc-950/80 p-8 flex flex-col relative overflow-hidden shadow-[0_0_60px_rgba(220,38,38,0.08)]">

          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-600/60 to-transparent" />

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Pro Plan</p>
              <span className="px-2 py-0.5 rounded-full bg-red-600/15 text-red-400 text-[9px] font-bold uppercase tracking-wider border border-red-600/20">
                Recommended
              </span>
            </div>
            <h2 className="text-2xl font-black text-white mb-1">V-Track Pro</h2>
            <p className="text-zinc-500 text-sm">Full attribution stack, unlimited scale</p>
          </div>

          <div className="flex items-end gap-1 mb-8">
            <div className="text-4xl font-black text-white">$49</div>
            <div className="text-zinc-500 text-sm mb-1.5">/month</div>
          </div>

          <ul className="space-y-3 mb-8 flex-1">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-zinc-300">
                <div className="w-4 h-4 rounded-full bg-red-600/15 border border-red-600/30 flex items-center justify-center shrink-0 text-red-400">
                  {FEATURE_ICONS[f] ?? <Check size={9} />}
                </div>
                {f}
              </li>
            ))}
          </ul>

          {error && (
            <p className="text-red-500 text-[10px] font-bold uppercase tracking-wide mb-3">{error}</p>
          )}

          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(220,38,38,0.25)] hover:shadow-[0_0_40px_rgba(220,38,38,0.4)]"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                Start Free Trial
                <ArrowRight size={14} />
              </>
            )}
          </button>

          <p className="text-center text-zinc-600 text-[10px] mt-3 uppercase tracking-wide font-medium">
            7 days free · Card required · Cancel anytime
          </p>
        </div>
      </motion.div>

      {/* Bottom trust line */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="mt-10 flex items-center gap-6 text-zinc-600 text-[10px] font-bold uppercase tracking-widest relative z-10"
      >
        <span className="flex items-center gap-1.5"><Shield size={10} /> Secured by Stripe</span>
        <span className="w-px h-3 bg-zinc-800" />
        <span className="flex items-center gap-1.5"><Check size={10} /> No contracts</span>
        <span className="w-px h-3 bg-zinc-800" />
        <span className="flex items-center gap-1.5"><Zap size={10} /> Instant access</span>
      </motion.div>
    </div>
  );
}
