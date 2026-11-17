// src/pages/public/WebsitePricing/FounderLifetimePage.tsx
// PUBLIC MARKETING ONLY. Standalone Lifetime Access offer page at /m/founder.
// No Supabase, auth, billing or access logic. The CTA is a plain link to an existing Stripe Payment Link.
// Access is activated manually after payment (see FounderThankYouPage.tsx).

import { Check } from 'lucide-react'

const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/aFaeVd8Qbfjh0UwfU09IQ08'

// Page-local dark palette (the shared Daylight palette in PublicPlansSection is light and is not imported).
const D = {
  bg: '#09090b', panel: '#131316', line: '#2a2a31', text: '#f5f5f7', mut: '#a8a8b3',
  orange: '#f97316', orangeHover: '#fb8a35', purple: '#a78bfa', purpleDim: '#6d4fe0',
}
const SANS = '"Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'

const INCLUDED = [
  'Track content across 9 platforms',
  'Connect videos and posts into full marketing journeys',
  'Custom branded tracking domains',
  'Share assets with marketers and track their results',
]

export default function FounderLifetimePage() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto', background: D.bg, color: D.text, fontFamily: SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&display=swap');
        .fl-cta{transition:background .15s, transform .15s}
        .fl-cta:hover{background:${D.orangeHover}}
        .fl-cta:active{transform:translateY(1px)}
        .fl-cta:focus-visible{outline:3px solid ${D.purple};outline-offset:3px}
        @media (min-width:720px){.fl-grid{grid-template-columns:1.1fr .9fr !important;gap:56px !important}}
      `}</style>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'max(20px, env(safe-area-inset-top)) 22px 72px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 44px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: D.purple }} />
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>Vstrk</span>
        </header>

        <div className="fl-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 40, alignItems: 'start' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(38px,7vw,64px)', fontWeight: 800, lineHeight: 1.03, letterSpacing: '-0.03em', margin: 0 }}>
              Pay once.<br />Track for life.
            </h1>
            <p style={{ fontSize: 'clamp(17px,2.4vw,20px)', color: D.mut, lineHeight: 1.55, margin: '22px 0 0', maxWidth: 520 }}>
              I’m building Vstrk to show creators which content actually brings in leads, newsletter subscribers, sales calls, consultations and revenue. Early supporters can get lifetime access for a one-time $20.
            </p>
          </div>

          <div style={{ background: D.panel, border: `1.5px solid ${D.line}`, borderTop: `3px solid ${D.purpleDim}`, borderRadius: 18, padding: '28px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'clamp(56px,10vw,76px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>$20</span>
              <span style={{ fontSize: 17, color: D.mut, fontWeight: 600 }}>one time, no subscription</span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0 0', display: 'grid', gap: 12 }}>
              {INCLUDED.map((t) => (
                <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 16, lineHeight: 1.45 }}>
                  <Check size={18} color={D.purple} strokeWidth={2.8} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>

            <a
              className="fl-cta"
              href={STRIPE_PAYMENT_LINK}
              style={{ display: 'block', textAlign: 'center', marginTop: 28, padding: '17px 24px', borderRadius: 12, background: D.orange, color: '#1a0d02', fontSize: 18, fontWeight: 800, textDecoration: 'none' }}
            >
              Get Lifetime Access — $20
            </a>
            <p style={{ fontSize: 14, color: D.mut, lineHeight: 1.55, margin: '16px 0 0', textAlign: 'center' }}>
              Secure payment through Stripe. After you pay, you’ll message me on WhatsApp so I can activate your access by hand.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
