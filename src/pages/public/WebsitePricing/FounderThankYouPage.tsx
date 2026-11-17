// src/pages/public/WebsitePricing/FounderThankYouPage.tsx
// PUBLIC MARKETING ONLY. Thank-you page at /m/founder-thank-you (Stripe Payment Link redirect).
// Visiting this page proves nothing and grants nothing: access is activated manually via WhatsApp.
// No Supabase, auth, billing or access logic.

import { useEffect } from 'react'
import { MessageCircle } from 'lucide-react'

const WHATSAPP_URL = 'https://wa.me/886903919125'
const WHATSAPP_MESSAGE =
  'Hi! I just purchased the $20 VSTRK Lifetime Access offer. My payment email is: [YOUR EMAIL]. The email I want to use for my VSTRK account is: [YOUR EMAIL].'
const WHATSAPP_HREF = `${WHATSAPP_URL}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`

const D = {
  bg: '#09090b', panel: '#131316', line: '#2a2a31', text: '#f5f5f7', mut: '#a8a8b3',
  orange: '#f97316', orangeHover: '#fb8a35', orangeTint: 'rgba(249,115,22,0.10)', purple: '#a78bfa', purpleDim: '#6d4fe0',
}
const SANS = '"Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'

export default function FounderThankYouPage() {
  // Keep this page out of search results.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto', background: D.bg, color: D.text, fontFamily: SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&display=swap');
        .ft-cta{transition:background .15s, transform .15s}
        .ft-cta:hover{background:${D.orangeHover}}
        .ft-cta:active{transform:translateY(1px)}
        .ft-cta:focus-visible{outline:3px solid ${D.purple};outline-offset:3px}
      `}</style>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'max(20px, env(safe-area-inset-top)) 22px 72px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 40px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: D.purple }} />
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>Vstrk</span>
        </header>

        <h1 style={{ fontSize: 'clamp(34px,7vw,52px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', margin: 0 }}>
          Your payment is complete!
        </h1>
        <p style={{ fontSize: 'clamp(18px,2.6vw,21px)', fontWeight: 600, color: D.purple, margin: '14px 0 0' }}>
          There’s just one more important step.
        </p>

        <div role="note" style={{ marginTop: 28, padding: '18px 20px', borderRadius: 14, background: D.orangeTint, border: `1.5px solid ${D.orange}`, fontSize: 17, lineHeight: 1.5, fontWeight: 600 }}>
          Important: your Lifetime Access is not active yet. Contact me on WhatsApp to claim it.
        </div>

        <p style={{ fontSize: 17, color: D.mut, lineHeight: 1.6, margin: '24px 0 10px' }}>
          Please contact me on WhatsApp to claim your VSTRK Lifetime Access. Send me:
        </p>
        <ol style={{ margin: 0, paddingLeft: 22, fontSize: 17, lineHeight: 1.6, display: 'grid', gap: 8 }}>
          <li>The email address you want to use for your VSTRK account.</li>
          <li>Your Stripe payment confirmation or receipt.</li>
        </ol>

        <a
          className="ft-cta"
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 32, padding: '20px 24px', borderRadius: 14, background: D.orange, color: '#1a0d02', fontSize: 'clamp(17px,3.6vw,20px)', fontWeight: 800, textDecoration: 'none', textAlign: 'center', lineHeight: 1.25 }}
        >
          <MessageCircle size={22} aria-hidden="true" style={{ flex: 'none' }} />
          Contact Me on WhatsApp — Activate My Lifetime Access
        </a>

        <p style={{ fontSize: 16, color: D.mut, lineHeight: 1.6, margin: '28px 0 0', paddingTop: 22, borderTop: `1px solid ${D.line}` }}>
          I’ll manually activate your Lifetime Access using my existing admin tools. Once it’s activated, you can create your VSTRK account and use the same email address.
        </p>
      </div>
    </div>
  )
}
