import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Purely presentational. No logic, no side effects, no props tied to
 * relay/journey state. Renders the neutral "loading" look for the
 * intermediate token/relay pages (Track, ContinuationRelay,
 * PlatformContinuation). Does not affect redirect timing or async
 * behavior in the pages that render it.
 */
export default function RelayLoadingScreen() {
  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <Loader2 className="text-gray-400 animate-spin" size={22} strokeWidth={2} />
        <div className="space-y-1">
          <p className="text-gray-700 text-sm">Just a moment…</p>
          <p className="text-gray-400 text-xs">We're preparing your page.</p>
        </div>
      </div>
    </div>
  );
}
