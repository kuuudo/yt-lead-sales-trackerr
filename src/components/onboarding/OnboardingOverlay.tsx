// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/OnboardingOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────
// Mount this ONCE near the root of the app (see App.tsx). It renders
// nothing when closed. When open, it sits fixed above the current route —
// whatever page the user was on stays mounted underneath, dimmed and
// blurred via a semi-transparent backdrop, with WelcomeStep centered on
// top of it.
//
// Deliberately NOT reusing pages/Onboarding.tsx here: that page owns its
// own opaque full-page background, which is correct for direct /onboarding
// access but wrong for the overlay case, where the whole point is that the
// real app is still visible (dimmed) behind the Fox.
// ─────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useOnboardingOverlay } from '../../lib/onboarding-overlay';
import WelcomeStep from './WelcomeStep';

type OnboardingStep = 'welcome'; // more steps join this union as they're built

export default function OnboardingOverlay() {
  const { isOpen, close } = useOnboardingOverlay();
  const [step, setStep] = useState<OnboardingStep>('welcome');

  // Reset to the first step each time the overlay is opened fresh.
  useEffect(() => {
    if (isOpen) setStep('welcome');
  }, [isOpen]);

  // Escape closes it — a modal with no dismiss path is a trap. Remove this
  // if you'd rather onboarding only be dismissible by finishing it.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            // Click on the scrim (not the frame itself) closes it.
            if (e.target === e.currentTarget) close();
          }}
        >
          {step === 'welcome' && (
            <WelcomeStep
              maxWidth={720}
              onContinue={() => {
                // TODO(step-2): advance to the campaign-name step once it
                // exists, instead of just logging.
                console.log('[Onboarding] Step 1 complete → Step 2 (not yet implemented)');
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
