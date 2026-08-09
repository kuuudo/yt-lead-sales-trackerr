// ─────────────────────────────────────────────────────────────────────────
// Onboarding.tsx — top-level onboarding route
// ─────────────────────────────────────────────────────────────────────────
// THIS MILESTONE: Step 1 (Welcome) only. The step machine below is
// intentionally minimal — it exists so WelcomeStep has somewhere real to
// live and a real onContinue to call, without building Steps 2+ yet.
//
// Wire this up in your router, e.g.:
//   import Onboarding from './Onboarding';
//   <Route path="/onboarding" element={<Onboarding />} />
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import WelcomeStep from './onboarding/WelcomeStep';

type OnboardingStep = 'welcome'; // more steps join this union as they're built

export default function Onboarding() {
  const [step, setStep] = useState<OnboardingStep>('welcome');

  if (step === 'welcome') {
    return (
      <WelcomeStep
        onContinue={() => {
          // TODO(step-2): replace with the campaign-name step once it's
          // implemented. Left as a log rather than a fake UI placeholder so
          // nothing unintended ships to production in this milestone.
          console.log('[Onboarding] Step 1 complete → Step 2 (not yet implemented)');
        }}
      />
    );
  }

  return null;
}
