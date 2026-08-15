import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ChevronDown, ChevronUp, ExternalLink, Zap } from 'lucide-react';
import { generateAttributionPixel } from './installationHelpers';
import { CopyButton } from './CopyButton';

export const CheckoutIntentBlock = ({
  campaignId,
  checkoutUrl,
  hasThankYouUrl,
}: {
  campaignId: string;
  checkoutUrl: string | null | undefined;
  hasThankYouUrl: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const snippet = generateAttributionPixel(campaignId, 'checkout_intent', 0);

  return (
    <div className="border border-amber-500/20 rounded-xl overflow-hidden bg-amber-500/3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-500/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <Zap size={13} className="text-amber-400 shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-widest text-amber-300">
            Optional: Checkout Intent Pixel
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
            New
          </span>
        </div>
        {open ? (
          <ChevronUp size={13} className="text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown size={13} className="text-zinc-500 shrink-0" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-amber-500/15 p-4 space-y-3">
              <div className="flex gap-3 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                    Tracks checkout intent — does not confirm payment
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {hasThankYouUrl
                      ? 'You already have a confirmation pixel below that tracks completed conversions. This optional pixel adds mid-funnel visibility — it records when a visitor reaches your checkout page, before payment happens. Useful for measuring drop-off between checkout visits and confirmed purchases.'
                      : "You don't have a thank-you page yet, so this pixel is your best available conversion signal right now. It records when a visitor reaches your checkout page. It does not confirm payment was completed — but it gives you something to track until a confirmation page is in place."}
                  </p>
                </div>
              </div>

              {checkoutUrl ? (
                <div className="flex gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <ExternalLink size={12} className="text-zinc-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Paste this code on your checkout page:{' '}
                    <span className="text-zinc-300 font-mono text-[10px] break-all">
                      {checkoutUrl}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="flex gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <AlertCircle size={12} className="text-zinc-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    No checkout URL is configured yet. Add one in your campaign settings to
                    know where to paste this pixel.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="label-caps text-amber-400">Checkout Intent Pixel</span>
                  <CopyButton text={snippet} />
                </div>
                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                  {snippet}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};