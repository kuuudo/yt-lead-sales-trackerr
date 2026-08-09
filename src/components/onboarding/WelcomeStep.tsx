// ─────────────────────────────────────────────────────────────────────────
// WelcomeStep.tsx — Onboarding Step 1: Welcome / Meet the Fox
// ─────────────────────────────────────────────────────────────────────────
// CHANGED IN THIS MILESTONE (shell only — see note at bottom):
//   Removed the outer full-page wrapper (min-h-screen, its own background,
//   page padding). This component now renders ONLY the aspect-ratio-locked
//   artwork+dialogue frame. Callers decide how to contain it:
//     - pages/Onboarding.tsx    → full-page fallback (adds the page wrapper)
//     - components/onboarding/OnboardingOverlay.tsx → modal/overlay (adds
//       a dimmed backdrop instead)
//   Artwork, copy, panel coordinates, and animation are UNCHANGED.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { motion } from 'motion/react';

// Adjust this if your build serves static assets from a different path.
// Drop the provided artwork at: public/onboarding/venus-welcome.jpg
const ARTWORK_SRC = '/onboarding/venus-welcome.jpg';
const ARTWORK_W = 1248;
const ARTWORK_H = 832;

// Measured against the source artwork's pixels — the inner edge of the
// blank parchment panel, with a small inward margin so text never touches
// the decorative border.
const PANEL = {
  top: '57%',
  bottom: '13%',
  left: '30%',
  right: '29%',
} as const;

interface WelcomeStepProps {
  onContinue: () => void;
}

export default function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <div
      className="relative w-full"
      style={{
        maxWidth: ARTWORK_W,
        width: `min(${ARTWORK_W}px, 96vw, calc(96vh * ${ARTWORK_W} / ${ARTWORK_H}))`,
        aspectRatio: `${ARTWORK_W} / ${ARTWORK_H}`,
        containerType: 'inline-size',
      }}
    >
      {/* Static artwork — do not add motion, parallax, or effects here. */}
      <img
        src={ARTWORK_SRC}
        alt=""
        role="presentation"
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
      />

      {/* Dialogue overlay — positioned over the artwork's blank panel */}
      <div
        className="absolute flex flex-col items-center justify-center text-center"
        style={{ ...PANEL, padding: '2% 4%' }}
      >
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="font-bold uppercase text-[#8a7355]"
          style={{
            fontSize: 'clamp(7px, 1.5cqw, 11px)',
            letterSpacing: '0.16em',
            marginBottom: 'clamp(4px, 1.2cqw, 10px)',
          }}
        >
          Venus &middot; Tracking Center
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.4 }}
          className="font-serif italic text-[#2c2418]"
          style={{
            fontSize: 'clamp(13px, 2.7cqw, 25px)',
            lineHeight: 1.35,
            marginBottom: 'clamp(4px, 1.2cqw, 12px)',
          }}
        >
          Welcome to VSTRK
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.6 }}
          className="text-[#4a4034]"
          style={{
            fontSize: 'clamp(8.5px, 1.55cqw, 14px)',
            lineHeight: 1.6,
            maxWidth: '46ch',
            marginBottom: 'clamp(6px, 1.8cqw, 20px)',
          }}
        >
          Your Fox is ready to guide you. VSTRK helps you follow the journey
          from content and traffic to leads, checkouts, and revenue — across
          the platforms your audience already uses. We'll get your first
          campaign ready together, one question at a time.
        </motion.p>

        <motion.button
          type="button"
          onClick={onContinue}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.8 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-1.5 bg-[#7a2e1e] hover:bg-[#8f3a26] text-[#f7ede0] font-bold uppercase rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1503c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f2e6d1]"
          style={{
            fontSize: 'clamp(8px, 1.4cqw, 12px)',
            letterSpacing: '0.08em',
            padding: 'clamp(6px, 1.4cqw, 11px) clamp(12px, 2.6cqw, 22px)',
          }}
        >
          Let&apos;s begin
          <span aria-hidden="true">→</span>
        </motion.button>
      </div>
    </div>
  );
}
