// src/pages/public/WebsitePricing/PublicPlansSection.tsx
// PUBLIC MARKETING ONLY. Shared by pages/Website.tsx (#plans) and PublicPlansPage.tsx (/plans).
// Not related to pages/Pricing.tsx (in-app) or pages/Upgrade.tsx (plan change).
// No checkout, Stripe or Supabase logic: "Start Free Trial" is a plain link to /start.

import React from 'react'
import { Check, Users, MessageCircle } from 'lucide-react'
import { BUSINESS_OWNER_DEMO_WHATSAPP_URL } from '../marketing/businessOwner/businessOwnerDemoConfig'

/* Same "Daylight" palette as pages/Website.tsx (copied, not imported, to avoid a circular import). */
export const C = {
  bg: '#ffffff', panel: '#ffffff', line: '#e4e0ec', text: '#14131a', mut: '#4d4c58', dim: '#5c5b66',
  purple: '#5b3df0', lp: '#3b24b8', green: '#15803d', tint: '#ece8ff', tintStroke: '#cfcad9', greenTint: '#e8f7ee',
}
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
export const SANS = '"Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'

const START_HREF = '/start' // existing onboarding flow; nothing is created or modified here

const PRICE = '$15'
const PRICE_UNIT = 'USD / week'
const TRIAL_TEXT = '3-day free trial'

const mono = (color = C.mut, size = 11): React.CSSProperties => ({
  fontFamily: MONO, fontSize: size, color, letterSpacing: '0.12em', textTransform: 'uppercase',
})

const INCLUDED = [
  'Track content across 9 platforms',
  'Connect videos and posts into full marketing journeys',
  'Custom branded tracking domains',
  'Share assets with marketers and track their results',
]

export default function PublicPlansSection() {
  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 640 }}>
      <style>{`
        .pp-btn{transition:opacity .15s}
        .pp-btn:hover{opacity:.9}
        .pp-btn:focus-visible{outline:3px solid ${C.purple};outline-offset:3px}
      `}</style>

      {/* Price card */}
      <div style={{ background: C.panel, border: `1.5px solid ${C.tintStroke}`, borderRadius: 20, padding: '28px 26px', boxShadow: '0 30px 60px -28px rgba(59,36,184,0.35)' }}>
        <div style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 999, background: C.tint, color: C.lp, fontSize: 13, fontWeight: 600 }}>
          {TRIAL_TEXT}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 10px', marginTop: 18 }}>
          <span style={{ fontSize: 'clamp(48px,9vw,64px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: C.text }}>{PRICE}</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: C.mut }}>{PRICE_UNIT}</span>
        </div>
        <p style={{ fontSize: 15, color: C.mut, lineHeight: 1.6, margin: '10px 0 0' }}>
          Try everything free for 3 days. After the trial, it’s {PRICE} USD per week.
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'grid', gap: 10 }}>
          {INCLUDED.map((t) => (
            <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, color: C.text, lineHeight: 1.45 }}>
              <Check size={18} color={C.purple} strokeWidth={2.6} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
              <span>{t}</span>
            </li>
          ))}
        </ul>

        <a
          className="pp-btn"
          href={START_HREF}
          style={{ display: 'block', textAlign: 'center', marginTop: 26, padding: '15px 26px', borderRadius: 12, background: C.purple, color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none' }}
        >
          Start Free Trial
        </a>
        <div style={{ marginTop: 14, fontSize: 14, color: C.mut, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 18px' }}>
          <span>✓ No credit card required</span>
          <span>✓ Cancel anytime</span>
        </div>
      </div>

      {/* Need More Accounts? (light version; the in-app MultipleAccountsCTA is dark-themed and is not touched) */}
      <div style={{ border: `1.5px dashed ${C.tintStroke}`, borderRadius: 20, padding: '24px 26px', background: C.panel, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.greenTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Users size={22} color={C.green} aria-hidden="true" />
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: C.text }}>Need More Accounts?</div>
          <p style={{ fontSize: 15, color: C.mut, lineHeight: 1.6, margin: '8px 0 0' }}>
            Expanding your team or managing accounts for multiple clients?
            <br />
            We offer custom plans tailored to your business needs.
          </p>
          <p style={{ fontSize: 15, color: C.text, fontWeight: 600, margin: '8px 0 0' }}>Contact us for custom pricing.</p>
          <a
            className="pp-btn"
            href={BUSINESS_OWNER_DEMO_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '12px 20px', borderRadius: 10, background: C.text, color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
          >
            <MessageCircle size={16} aria-hidden="true" />
            Contact us on WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}
