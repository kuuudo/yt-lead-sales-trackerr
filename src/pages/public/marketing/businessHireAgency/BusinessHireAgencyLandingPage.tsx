// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/businessHireAgency/BusinessHireAgencyLandingPage.tsx
// ─────────────────────────────────────────────────────────────────────────
// PLACEHOLDER. The business hire agency landing page has not been written yet.
//   • standalone, public route  /5q        → <BusinessHireAgencyLandingPage />
//   • inside the Demo, "Landing Page" tab (/insights/5x) → <BusinessHireAgencyLandingPage embedded />
//
// Presentation only: no Supabase, auth, router or user context, so it is
// safe for logged-out visitors. Contains no marketing copy or product claims.
// Replace the body of this component when the real page is ready; keep the
// default export and the `embedded` prop so SPA routing and the demo tab
// keep working.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { BUSINESS_HIRE_AGENCY_DEMO_WHATSAPP_URL, BUSINESS_HIRE_AGENCY_LANDING_CONTENT } from './businessHireAgencyDemoConfig';

/** Public Demo route (kept in sync with BUSINESS_HIRE_AGENCY_DEMO_PATHS in App.tsx). */
const DEMO_HREF = '/insights/5x';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

export default function BusinessHireAgencyLandingPage({ embedded = false }: { embedded?: boolean }) {
  const waLabel = BUSINESS_HIRE_AGENCY_LANDING_CONTENT.ctaLabel || 'Contact VSTRK on WhatsApp';
  const link: React.CSSProperties = {
    fontFamily: MONO, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: '#b7a6ff', textDecoration: 'none',
  };

  return (
    <div
      style={{
        width: '100%', background: '#000', color: '#f2f2f2', fontFamily: SANS,
        minHeight: embedded ? undefined : '100vh', WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div
        style={{
          maxWidth: 940, margin: '0 auto', padding: embedded ? '40px 20px 56px' : '56px 20px 72px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center',
        }}
      >
        <span style={{ fontWeight: 800, letterSpacing: '0.18em', fontSize: 15 }}>VSTRK</span>
        <div
          style={{
            border: '1.5px dashed #3a3a3a', borderRadius: 14, padding: '28px 20px', width: '100%', maxWidth: 560,
            fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a9a9a',
          }}
        >
          Landing page not written yet
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center' }}>
          <a href={BUSINESS_HIRE_AGENCY_DEMO_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={link}>
            {waLabel} →
          </a>
          {!embedded && (
            <a href={DEMO_HREF} style={link}>
              Open the interactive demo
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
