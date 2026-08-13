// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/PaymentMethodDiagram.tsx
// ─────────────────────────────────────────────────────────────────────────
// Static (non-video) explainer shown in the left desktop panel once the
// user clicks one of the 6 specific payment-method cards in
// CampaignOnboardingStep.tsx. Deliberately simple: boxes, arrows, short
// text. No animation, no video — see the product decision in chat: MVP
// first, upgrade to video later only if it proves worth it.
//
// Self-contained on purpose — no imports from CampaignOnboardingStep.tsx,
// so it can be dropped in / swapped out without touching that file's
// internals. Only depends on the PurchaseMethod type.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import type { PurchaseMethod } from './campaignOptionContent';

const purple = '#5b3df0';
const purpleSoft = '#f5f2ff';
const purpleBorder = '#d9d0ff';
const ink = '#15151f';
const sub = '#6b6b78';
const border = '#d9d9e3';
const amber = '#a5620a';
const amberSoft = '#fdf1e2';
const green = '#1a7f4b';
const greenSoft = '#e6f7ee';
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

function Box({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'accent' | 'muted';
}) {
  const bg = tone === 'accent' ? purpleSoft : tone === 'muted' ? '#fafafa' : '#fff';
  const bd = tone === 'accent' ? purpleBorder : border;
  return (
    <div
      style={{
        border: `1.5px solid ${bd}`,
        background: bg,
        borderRadius: 10,
        padding: '10px 14px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 600,
        color: ink,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <div style={{ textAlign: 'center', color: sub, fontSize: 14, lineHeight: 1, margin: '2px 0' }}>↓</div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: sub, margin: '0 0 4px' }}>
      {children}
    </p>
  );
}

function Explanation({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, color: sub, margin: '16px 0 0', lineHeight: 1.6 }}>{children}</p>
  );
}

function Recommended({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        borderRadius: 8,
        background: greenSoft,
        border: `1px solid #b8e4cc`,
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: green, margin: '0 0 4px' }}>
        Recommended
      </p>
      <p style={{ fontSize: 11.5, color: '#1f4d38', margin: 0, lineHeight: 1.55 }}>{children}</p>
    </div>
  );
}

function LimitedNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        borderRadius: 8,
        background: amberSoft,
        border: `1px solid #f0d9ae`,
      }}
    >
      <p style={{ fontSize: 11.5, color: '#8a5407', margin: 0, lineHeight: 1.55 }}>{children}</p>
    </div>
  );
}

export default function PaymentMethodDiagram({ method }: { method: PurchaseMethod }) {
  return (
    <div style={{ width: '100%', maxWidth: 320, fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif' }}>
      {method === 'embedded_alternative_payment' && (
        <>
          <Box>Your website</Box>
          <Arrow />
          <Box tone="accent">Buy Now button</Box>
          <Arrow />
          <Box tone="accent">PayPal / Wise widget — embedded on your site</Box>
          <Arrow />
          <Box>Thank-you page</Box>
          <Explanation>
            The customer never leaves your website. The payment happens inside an embedded provider checkout, then
            they reach your Thank You page.
          </Explanation>
        </>
      )}

      {method === 'alternative_payment' && (
        <>
          <Box>Your website</Box>
          <Arrow />
          <Box tone="accent">Buy Now button</Box>
          <Arrow />
          <Box tone="muted">Another site — PayPal / Wise / payment link — complete payment there</Box>
          <Arrow />
          <Box>Thank-you page (if redirected)</Box>
          <Explanation>
            The customer leaves your website to complete payment somewhere else. If that service redirects them back
            to your Thank You page afterward, VSTRK can still track the conversion.
          </Explanation>
        </>
      )}

      {method === 'payment_instructions_page' && (
        <>
          <Box>Your website</Box>
          <Arrow />
          <Box tone="accent">Buy Now button</Box>
          <Arrow />
          <Box tone="muted">Payment instructions — bank transfer, wire details, send payment to...</Box>
          <Explanation>
            The customer receives instructions to pay manually. Because VSTRK can't automatically confirm whether
            the payment was completed, tracking is limited.
          </Explanation>
          <LimitedNote>There's no confirmation step here — VSTRK can't tell whether the transfer actually happened.</LimitedNote>
        </>
      )}

      {method === 'external_platform' && (
        <>
          <Box>Your website</Box>
          <Arrow />
          <Box tone="accent">Buy Now button</Box>
          <Arrow />
          <Box tone="muted">Third-party platform — e.g. Gumroad, Payhip — entire purchase happens there</Box>
          <Arrow />
          <Box>Thank-you page (if platform supports redirect)</Box>
          <Explanation>
            The entire purchase happens on another platform. Many platforms let you redirect customers to your own
            Thank You page after purchase — use that redirect so VSTRK can record the conversion.
          </Explanation>
        </>
      )}

      {method === 'stripe_checkout' && (
        <>
          <Box>Your website</Box>
          <Arrow />
          <Box tone="accent">Buy Now button</Box>
          <Arrow />
          <div>
            <Caption>Stripe checkout</Caption>
            <Box tone="accent">
              Hosted payment page
              <div style={{ fontFamily: mono, fontSize: 10.5, color: purple, marginTop: 6 }}>buy.stripe.com/...</div>
            </Box>
          </div>
          <Arrow />
          <Box>
            <span style={{ color: green }}>✓</span> Payment success
          </Box>
          <Explanation>
            Stripe Checkout is hosted by Stripe. The customer leaves your website, pays on Stripe, and Stripe
            confirms the payment directly to VSTRK.
          </Explanation>
          <Recommended>
            If possible, we recommend Stripe Checkout — it gives VSTRK direct confirmation of the payment and
            requires less tracking setup. VSTRK uses your Stripe Checkout link to connect your campaign to the
            correct payment flow.
          </Recommended>
        </>
      )}

      {method === 'stripe_embedded' && (
        <>
          <Box>Your website</Box>
          <Arrow />
          <Box tone="accent">
            Stripe form embedded on the page
            <div style={{ fontSize: 10.5, color: sub, marginTop: 6, lineHeight: 1.5 }}>
              Card number · Expiry · CVC · [ Pay ]
            </div>
          </Box>
          <Arrow />
          <Box>Payment success — still on your site</Box>
          <Explanation>
            The Stripe payment form appears directly inside your website. Stripe still processes the payment, but
            the customer never leaves your site.
          </Explanation>
          <Recommended>
            We recommend Stripe Checkout when possible — it gives VSTRK a simpler, more direct payment flow to
            connect to your campaign, since VSTRK works from your Stripe Checkout link (e.g. buy.stripe.com/...).
          </Recommended>
        </>
      )}
    </div>
  );
}
