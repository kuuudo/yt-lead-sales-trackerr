// ─────────────────────────────────────────────────────────────────────────
// pages/Onboarding.tsx — /onboarding route
// ─────────────────────────────────────────────────────────────────────────
// This is now the FALLBACK / direct-access path (e.g. a shared link, or
// dev testing), not the primary product entry point. The primary entry
// point is Setup → "Continue Setup" → OnboardingOverlay (see
// components/onboarding/OnboardingOverlay.tsx), which shows the exact same
// WelcomeStep inside a dimmed modal over whatever page the user was on.
//
// This page renders identically to how the old Onboarding.tsx did —
// full-screen, own dark background — just with that wrapper now living
// here instead of inside WelcomeStep, since WelcomeStep needs to be
// container-agnostic to also work inside the overlay.
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import WelcomeStep from '../components/onboarding/WelcomeStep';

type OnboardingStep = 'welcome'; // more steps join this union as they're built

export default function Onboarding() {
  const [step, setStep] = useState<OnboardingStep>('welcome');

  return (
    <div className="min-h-screen w-full bg-[#14100c] flex items-center justify-center p-3 sm:p-6">
      {step === 'welcome' && (
        <WelcomeStep
          onContinue={() => {
            // TODO(step-2): replace once the campaign-name step exists.
            console.log('[Onboarding] Step 1 complete → Step 2 (not yet implemented)');
          }}
        />
      )}
    </div>
  );
}
