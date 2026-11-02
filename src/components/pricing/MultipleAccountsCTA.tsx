// src/components/pricing/MultipleAccountsCTA.tsx
// Shared "multiple accounts / custom plans" contact section for Pricing and Upgrade.
// Contact only: no plan, no Stripe price, no billing logic.

import { MessageCircle } from 'lucide-react';
import { WHATSAPP_CONTACT_URL } from '../../lib/contactLinks';

type Props = {
  heading: string;
  description: string[];
};

export function MultipleAccountsCTA({ heading, description }: Props) {
  return (
    <section className="w-full max-w-5xl mt-8 relative z-10 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
          <MessageCircle size={16} className="text-green-400" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-sm font-bold text-white">{heading}</h2>
          {description.map((line) => (
            <p key={line} className="text-[11px] text-zinc-500 leading-relaxed">
              {line}
            </p>
          ))}
          <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            Contact us for custom pricing.
          </p>
        </div>
      </div>
      <a
        href={WHATSAPP_CONTACT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 w-full md:w-auto bg-white text-zinc-950 h-11 px-6 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
      >
        <MessageCircle size={14} />
        Contact Us on WhatsApp
      </a>
    </section>
  );
}