// src/components/pricing/PlanCard.tsx
// The pricing card, moved verbatim out of Pricing.tsx so Pricing.tsx and
// Upgrade.tsx render exactly the same card. Defaults reproduce the original
// Pricing.tsx card byte-for-byte; the optional props are used by Upgrade only.

import React from 'react';
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
import { PricingPlan, formatMoney, intervalLabel } from '../../lib/pricingPlans';

export const PRO_FEATURES = [
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

type PlanCardProps = {
  plan: PricingPlan;
  onSelect: (plan: PricingPlan) => void;
  busy?: boolean;
  disabled?: boolean;
  /** Button text. Default "Subscribe" (Pricing). */
  buttonLabel?: string;
  /** Hide the arrow icon (e.g. for "Current plan"). Default true. */
  showArrow?: boolean;
  /** Upgrade only: marks the card as the current or the scheduled plan. */
  statusBadge?: { label: string; tone: 'current' | 'scheduled' };
};

export function PlanCard({
  plan,
  onSelect,
  busy = false,
  disabled = false,
  buttonLabel = 'Subscribe',
  showArrow = true,
  statusBadge,
}: PlanCardProps) {
  const recommended = plan.is_recommended;

  return (
    <div
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
          {statusBadge && (
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                statusBadge.tone === 'current'
                  ? 'bg-green-500/10 text-green-400 border-green-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              {statusBadge.label}
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
        onClick={() => onSelect(plan)}
        disabled={disabled}
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
            {buttonLabel}
            {showArrow && <ArrowRight size={14} />}
          </>
        )}
      </button>
    </div>
  );
}
