// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/WebsiteStructureGuide.tsx
// ─────────────────────────────────────────────────────────────────────────
// The "Website Structure ⭐" guide shown by default in the 中轉站's left
// video/content panel. Explains, for each of the 4 VSTRK paths, where the
// Global Attribution script goes vs. where the Thank-You Page Pixel goes.
//
// Self-contained on purpose — no props required, manages its own
// Pixel Setup / Stripe Setup tab state internally — so OnboardingOverlay.tsx
// can render it exactly like the six video components (no special-casing).
//
// Visual language intentionally matches PaymentMethodDiagram.tsx (Box/Arrow
// pattern) since both live in the same narrow left-column context.
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Globe, Tag } from 'lucide-react';

const purple = '#5b3df0';
const purpleSoft = '#f5f2ff';
const purpleBorder = '#d9d0ff';
const ink = '#15151f';
const sub = '#6b6b78';
const border = '#d9d9e3';
const green = '#16a34a';
const greenSoft = '#e6f7ee';
const greenBorder = '#bbf7d0';

type GuideTab = 'pixel' | 'stripe';

type FunnelDef = {
  title: string;
  steps: string[];
  globalAttributionStepIndex: number;
  pixelStepIndex: number;
  pixelLabel: string;
  checkoutStepIndex?: number; // only set for funnels with a real Stripe checkout
  freeAction?: boolean; // Newsletter / Sales Call — must never look "optional"
};

const FUNNELS: FunnelDef[] = [
  {
    title: 'Direct Purchase',
    steps: ['Sales Page', 'Checkout', 'Thank-You Page'],
    globalAttributionStepIndex: 0,
    pixelStepIndex: 2,
    pixelLabel: 'Direct Purchase Pixel',
    checkoutStepIndex: 1,
  },
  {
    title: 'Newsletter',
    steps: ['Newsletter Page', 'Thank-You Page'],
    globalAttributionStepIndex: 0,
    pixelStepIndex: 1,
    pixelLabel: 'Newsletter Pixel',
    freeAction: true,
  },
  {
    title: 'Sales Call',
    steps: ['Sales Page', 'Booking Page', 'Thank-You Page'],
    globalAttributionStepIndex: 0,
    pixelStepIndex: 2,
    pixelLabel: 'Sales Call Pixel',
    freeAction: true,
  },
  {
    title: 'Paid Consultation',
    steps: ['Sales Page', 'Checkout', 'Thank-You Page'],
    globalAttributionStepIndex: 0,
    pixelStepIndex: 2,
    pixelLabel: 'Consultation Pixel',
    checkoutStepIndex: 1,
  },
];

function StepBox({
  label,
  tone,
}: {
  label: string;
  tone: 'default' | 'muted';
}) {
  return (
    <div
      style={{
        border: `1.5px solid ${tone === 'muted' ? '#ececec' : border}`,
        background: tone === 'muted' ? '#fafafa' : '#fff',
        borderRadius: 10,
        padding: '8px 12px',
        textAlign: 'center',
        fontSize: 11.5,
        fontWeight: 700,
        color: ink,
        lineHeight: 1.4,
      }}
    >
      {label}
    </div>
  );
}

function StepArrow() {
  return (
    <div style={{ textAlign: 'center', color: sub, fontSize: 13, lineHeight: 1, margin: '1px 0' }}>↓</div>
  );
}

function InstallTag({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'attribution' | 'pixel';
}) {
  const colors =
    tone === 'attribution'
      ? { color: green, background: greenSoft, border: `1px solid ${greenBorder}` }
      : { color: purple, background: purpleSoft, border: `1px solid ${purpleBorder}` };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.2,
        borderRadius: 8,
        padding: '4px 8px',
        marginTop: 4,
        ...colors,
      }}
    >
      {icon}
      {label}
    </div>
  );
}

function CheckoutUrlNote() {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: sub,
        background: '#fafafa',
        border: `1px dashed ${border}`,
        borderRadius: 8,
        padding: '4px 8px',
        marginTop: 4,
        textAlign: 'center',
      }}
    >
      Your Checkout URL
    </div>
  );
}

function FunnelDiagram({ funnel, tab }: { funnel: FunnelDef; tab: GuideTab }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: sub,
          margin: '0 0 8px',
        }}
      >
        {funnel.title}
      </p>
      {funnel.steps.map((step, i) => (
        <React.Fragment key={step}>
          {i > 0 && <StepArrow />}
          <StepBox label={step} tone="default" />
          {i === funnel.globalAttributionStepIndex && (
            <InstallTag icon={<Globe size={11} />} label="Install Global Attribution here" tone="attribution" />
          )}
          {tab === 'stripe' && funnel.checkoutStepIndex === i && <CheckoutUrlNote />}
          {i === funnel.pixelStepIndex && (
            <InstallTag
              icon={<Tag size={11} />}
              label={`Install ${funnel.pixelLabel} here${funnel.freeAction ? ' (still required)' : ''}`}
              tone="pixel"
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function WebsiteStructureGuide() {
  const [tab, setTab] = useState<GuideTab>('pixel');

  return (
    <div style={{ padding: 14, fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif' }}>
      <div
        style={{
          display: 'inline-flex',
          padding: 3,
          borderRadius: 999,
          background: '#f4f4f5',
          border: `1px solid ${border}`,
          marginBottom: 16,
        }}
      >
        {(['pixel', 'stripe'] as GuideTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: 'none',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? purple : sub,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.3,
              cursor: 'pointer',
              boxShadow: tab === t ? '0 1px 4px rgba(21,21,31,0.08)' : 'none',
            }}
          >
            {t === 'pixel' ? 'PIXEL SETUP' : 'STRIPE SETUP'}
          </button>
        ))}
      </div>

      {FUNNELS.map((funnel) => (
        <FunnelDiagram key={funnel.title} funnel={funnel} tab={tab} />
      ))}

      <p style={{ fontSize: 11, color: sub, margin: '4px 0 0', lineHeight: 1.5 }}>
        Every path always ends on its own Thank-You Page — that page is where its pixel goes, whether
        or not the action involves a payment.
      </p>
    </div>
  );
}