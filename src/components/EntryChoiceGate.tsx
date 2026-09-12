import React, { useState } from 'react';
import type { EntryChoice } from '../lib/entryChoice';

interface EntryChoiceGateProps {
  onChoose: (choice: EntryChoice) => void;
}

/**
 * One-time browser-level entry gate, shown before Phase 3E discovery runs.
 *
 * "Yes, go directly"  → skip Relay/discovery for this browser going forward.
 * "Continue"           → permit the existing Relay/discovery attempt.
 *
 * Neither choice asserts anything about the visitor's actual identity or
 * history. See ../lib/entryChoice.ts and Track.tsx for the exact wiring.
 *
 * Wording/UI: Variant A, confirmed. White background per feedback that the
 * dark RelayLoadingScreen aesthetic didn't read as "inviting" for this
 * specific first-touch moment.
 */
export default function EntryChoiceGate({ onChoose }: EntryChoiceGateProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleClick = (choice: EntryChoice) => {
    if (submitting) return;
    setSubmitting(true);
    onChoose(choice);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-xs flex flex-col items-center gap-6">
        <p className="text-zinc-900 text-base font-medium text-center">
          First time here?
        </p>
        <div className="flex flex-col gap-2.5 w-full">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleClick('direct')}
            className="w-full bg-zinc-900 text-zinc-50 rounded-lg py-3 text-sm font-medium transition-opacity disabled:opacity-50"
          >
            Yes, go directly
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleClick('continue')}
            className="w-full bg-transparent text-zinc-600 border border-zinc-300 rounded-lg py-3 text-sm font-medium transition-opacity disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
