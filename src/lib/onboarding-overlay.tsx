// ─────────────────────────────────────────────────────────────────────────
// lib/onboarding-overlay.tsx
// ─────────────────────────────────────────────────────────────────────────
// Global open/close state for the onboarding overlay, so any page (Setup,
// Dashboard, wherever) can trigger it without prop-drilling. Mirrors the
// pattern already used by AuthProvider in lib/auth.
// ─────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, useCallback } from 'react';

interface OnboardingOverlayContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const OnboardingOverlayContext = createContext<OnboardingOverlayContextValue | undefined>(
  undefined
);

export function OnboardingOverlayProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <OnboardingOverlayContext.Provider value={{ isOpen, open, close }}>
      {children}
    </OnboardingOverlayContext.Provider>
  );
}

export function useOnboardingOverlay() {
  const ctx = useContext(OnboardingOverlayContext);
  if (!ctx) {
    throw new Error('useOnboardingOverlay must be used within OnboardingOverlayProvider');
  }
  return ctx;
}
