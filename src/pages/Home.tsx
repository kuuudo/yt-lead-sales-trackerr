import React, { useState } from 'react';
import { trackEvent, captureEmail } from '../lib/tracker';
import { useLanguage } from '../lib/hooks';
import { Mail, Pointer, ShoppingCart, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Home() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    const success = await captureEmail(email);
    setIsSubmitting(false);
    if (success) {
      setEmail('');
      setMessage('Lead captured successfully!');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const simulatePurchase = async () => {
    await trackEvent('checkout_view');
    // Simulate successful payment delay
    setTimeout(async () => {
      await trackEvent('purchase', 19.99);
      setMessage('Purchase recorded ($19.99)');
      setTimeout(() => setMessage(''), 3000);
    }, 1000);
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2 max-w-2xl px-1">
        <div className="flex items-center gap-2 label-caps text-orange-500">
          <Pointer size={12} />
          Simulation Environment
        </div>
        <motion.h1 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-3xl font-bold tracking-tight text-white"
        >
          {t.simulator.title}
        </motion.h1>
        <p className="text-zinc-500 text-sm leading-relaxed max-w-xl">
          {t.simulator.desc}
        </p>
      </header>

      <div className="grid md:grid-cols-12 gap-6 items-start">
        {/* Quick Actions */}
        <section className="md:col-span-12 lg:col-span-7 bento-card space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">
              Interactive Events
            </h2>
            <div className="text-[10px] text-zinc-600 font-mono italic">Persistence: LocalStorage</div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => {
                trackEvent('vsl_view');
                setMessage('VSL View tracked');
                setTimeout(() => setMessage(''), 3000);
              }}
              className="flex items-center justify-center gap-2 px-5 py-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all border border-zinc-800 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white group"
            >
              VSL VIEW
            </button>
            <button
              onClick={() => {
                trackEvent('add_to_cart');
                setMessage('Added to cart');
                setTimeout(() => setMessage(''), 3000);
              }}
              className="flex items-center justify-center gap-2 px-5 py-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all border border-zinc-800 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white"
            >
              <ShoppingCart size={14} />
              {t.simulator.eventButtons.cart}
            </button>
            <button
              onClick={() => {
                trackEvent('checkout_view');
                setMessage('Checkout page view');
                setTimeout(() => setMessage(''), 3000);
              }}
              className="flex items-center justify-center gap-2 px-5 py-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all border border-zinc-800 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white"
            >
              CHECKOUT
            </button>
            <button
              onClick={simulatePurchase}
              className="flex items-center justify-center gap-2 px-5 py-4 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-xl transition-all text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-900/10"
            >
              <CreditCard size={14} />
              {t.simulator.eventButtons.purchase}
            </button>
          </div>

          <div className="border-t border-zinc-800/50 pt-8 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-950/50 border border-zinc-800 rounded-lg space-y-2">
              <span className="label-caps text-zinc-600">Behavioral Rule</span>
              <p className="text-[11px] text-zinc-500">Purchase events require an active session and validated checkout flow before firing to Supabase.</p>
            </div>
            <div className="p-4 bg-zinc-950/50 border border-zinc-800 rounded-lg space-y-2">
              <span className="label-caps text-zinc-600">Data Integrity</span>
              <p className="text-[11px] text-zinc-500">All events are linked via UUID 128-bit session tokens stored in your browser's local state.</p>
            </div>
          </div>
        </section>

        {/* Lead Capture */}
        <section className="md:col-span-12 lg:col-span-5 bento-card space-y-6 flex flex-col justify-between min-h-[300px]">
          <div className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300">
              {t.simulator.eventButtons.lead}
            </h2>
            <p className="text-[10px] text-zinc-500">Captured emails are automatically hashed and linked to the active UTM campaign content.</p>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-red-500 transition-colors">
                <Mail size={16} />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.simulator.emailInput.placeholder}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-4 text-sm focus:border-red-600 outline-none transition-all placeholder:text-zinc-700 text-zinc-300 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-white hover:bg-zinc-200 text-zinc-950 py-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98]"
            >
              {isSubmitting ? '...' : t.simulator.emailInput.submit}
            </button>
          </form>

          <p className="text-[9px] text-zinc-600 uppercase tracking-tighter text-center italic">
            Secure Submission Layer v2.0
          </p>
        </section>
      </div>

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-8 right-8 bg-zinc-800 border border-zinc-700 px-6 py-3 rounded-full shadow-2xl text-sm font-medium text-orange-400 z-50 flex items-center gap-2"
          >
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
