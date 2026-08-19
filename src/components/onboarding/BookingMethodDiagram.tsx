// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/BookingMethodDiagram.tsx
// ─────────────────────────────────────────────────────────────────────────
// Static explainer shown in the left desktop panel once the user picks a
// delivery option in SalesCallOnboardingStep.tsx. Mirrors the pill/chip +
// hand-drawn-connector visual language already used inside
// CampaignOnboardingStep.tsx (StoryChip / StoryConnector / MiniDiagram),
// reproduced locally here rather than imported, since those primitives
// aren't exported and CampaignOnboardingStep.tsx must not be touched.
//
// Self-contained on purpose — no imports from SalesCallOnboardingStep.tsx
// or OnboardingOverlay.tsx. Only depends on the DeliveryOptionContent type
// and reads its `flow` array directly, so the chip sequence stays driven
// by campaignOptionContent.ts rather than being hardcoded here.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { motion } from 'motion/react';
import type { DeliveryOptionContent } from './campaignOptionContent';

const purple = '#5b3df0';
const purpleSoft = '#f5f2ff';
const purpleBorder = '#d9d0ff';
const ink = '#15151f';
const sub = '#6b6b78';
const amber = '#a5620a';
const amberSoft = '#fdf1e2';
const amberBorder = '#f0d9ae';

/** Same rounded, mono-uppercase pill grammar as CampaignOnboardingStep's StoryChip. */
function StoryChip({ label, tone }: { label: string; tone: 'full' | 'partial' }) {
  const bg = tone === 'full' ? purpleSoft : amberSoft;
  const fg = tone === 'full' ? purple : amber;
  const bd = tone === 'full' ? purpleBorder : amberBorder;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '5px 11px',
        borderRadius: 999,
        background: bg,
        border: `1px solid ${bd}`,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        color: fg,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/** Same short drawn curve between two chips as CampaignOnboardingStep's StoryConnector. */
function StoryConnector({ tone }: { tone: 'full' | 'partial' }) {
  const c = tone === 'full' ? purple : amber;
  return (
    <svg width="26" height="16" style={{ flexShrink: 0 }} aria-hidden="true">
      <motion.path
        d="M2,8 C9,1 17,15 24,8"
        fill="none"
        stroke={c}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeDasharray={tone === 'partial' ? '2.5 4' : undefined}
        opacity={0.7}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
    </svg>
  );
}

function Explanation({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, color: sub, margin: '16px 0 0', lineHeight: 1.6 }}>{children}</p>
  );
}

// The chip sequence + supporting copy per delivery value. Kept local to
// this component (rather than read off option.flow, which ends at "Call
// booked") because the left-panel diagram needs the explicit four-step
// story ending at the Booking Thank-You Page — the tracked confirmation
// step — same pattern PaymentMethodDiagram.tsx uses for its six methods.
const BOOKING_STORY: Record<string, string[]> = {
  embedded_own_website: ['Your website', 'Embedded booking calendar', 'Booking', 'Booking Thank-You Page'],
  external_platform: ['Your website', 'External booking page', 'Booking', 'Booking Thank-You Page'],
};

const BOOKING_EXPLANATION: Record<string, string> = {
  embedded_own_website:
    "You can embed Calendly, TidyCal, Cal.com, or another booking calendar directly on your website. That's completely fine. Just make sure a successful booking redirects to a separate Booking Thank-You Page so the conversion can be tracked.",
  external_platform:
    'You can send people to Calendly, TidyCal, or another external booking platform. Make sure successful bookings redirect to a separate Booking Thank-You Page, where the tracking can be installed.',
};

export default function BookingMethodDiagram({ option }: { option: DeliveryOptionContent }) {
  const tone: 'full' | 'partial' = option.tracking === 'Full' ? 'full' : 'partial';
  const chips = BOOKING_STORY[option.value] ?? option.flow;
  const explanation = BOOKING_EXPLANATION[option.value];

  return (
    <div style={{ width: '100%', maxWidth: 320, fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif' }}>
      <p
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: sub,
          margin: '0 0 10px',
        }}
      >
        {option.label}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 10 }}>
        {chips.map((label, i) => (
          <React.Fragment key={`${label}-${i}`}>
            {i > 0 && <StoryConnector tone={tone} />}
            <StoryChip label={label} tone={tone} />
          </React.Fragment>
        ))}
      </div>
      {explanation && <Explanation>{explanation}</Explanation>}
    </div>
  );
}
