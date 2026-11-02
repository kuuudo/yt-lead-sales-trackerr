// src/components/UpgradeEntry.tsx
// Drop-in entry point for Settings.tsx. Renders nothing unless the user is an
// eligible paying owner AND the Admin Upgrade switch is on. Hidden while an
// Operator is viewing someone else's account (read-only mode).
//
// Usage in Settings.tsx (in the billing / account area):
//   import UpgradeEntry from '../components/UpgradeEntry';
//   ...
//   <UpgradeEntry />

import { Link } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useViewing } from '../lib/ViewingContext';
import { useUpgradeEligibility } from '../lib/useUpgradeEligibility';

export default function UpgradeEntry() {
  const { user } = useAuth();
  const { isReadOnly } = useViewing();
  const { state } = useUpgradeEligibility(user?.id);

  if (isReadOnly || state !== 'eligible') return null;

  return (
    <Link
      to="/settings/upgrade"
      className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 text-[10px] font-black uppercase tracking-widest text-zinc-200 hover:text-white hover:border-zinc-600 transition-all"
    >
      <Repeat size={13} />
      Change plan
    </Link>
  );
}
