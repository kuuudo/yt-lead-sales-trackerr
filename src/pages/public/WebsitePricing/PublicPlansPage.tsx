// src/pages/public/WebsitePricing/PublicPlansPage.tsx
// PUBLIC MARKETING ONLY. Standalone logged-out pricing page at /plans.
// Not related to pages/Pricing.tsx (/pricing, in-app) or pages/Upgrade.tsx (/settings/upgrade).

import PublicPlansSection, { C, MONO, SANS } from './PublicPlansSection'

export default function PublicPlansPage() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto', background: C.bg, color: C.text, fontFamily: SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700&display=swap');
        .pp-back:hover{color:${C.text} !important}
        .pp-back:focus-visible{outline:3px solid ${C.purple};outline-offset:3px;border-radius:4px}
      `}</style>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 24px 72px' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center', marginBottom: 56 }}>
          <a href="/website" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.text }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.purple }} />
            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, letterSpacing: '0.2em' }}>Vstrk</span>
          </a>
          <a
            className="pp-back"
            href="/website"
            style={{ fontFamily: MONO, fontSize: 12, color: C.mut, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}
          >
            ← Back to homepage
          </a>
        </header>

        <h1 style={{ fontSize: 'clamp(34px,5vw,52px)', fontWeight: 700, lineHeight: 1.06, letterSpacing: '-0.025em', margin: 0 }}>
          One plan. Start free for 3 days.
        </h1>
        <p style={{ fontSize: 18, color: C.mut, lineHeight: 1.6, margin: '16px 0 36px', maxWidth: 560 }}>
          Track every video and post from first click to final sale. Try Vstrk free, then $15 USD per week.
        </p>

        <PublicPlansSection />
      </div>
    </div>
  )
}
