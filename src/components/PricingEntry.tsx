// src/components/PricingEntry.tsx
// Settings entry to the existing /pricing page, shown only while access comes from a trial.
// Hidden in read-only (Operator viewing) mode. Mirrors UpgradeEntry's look.

import { Link, useLocation } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { useViewing } from '../lib/ViewingContext';
import { usePricingEntry } from '../lib/usePricingEntry';

export default function PricingEntry() {
  const { isReadOnly } = useViewing();
  const entry = usePricingEntry();
  const location = useLocation();

  if (isReadOnly || entry !== 'show') return null;

  return (
    <Link
      to="/pricing"
      state={{ from: location.pathname + location.search }}
      className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 text-[10px] font-black uppercase tracking-widest text-zinc-200 hover:text-white hover:border-zinc-600 transition-all"
    >
      <CreditCard size={13} />
      Pricing
    </Link>
  );
}