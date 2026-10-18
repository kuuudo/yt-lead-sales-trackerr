// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/businessOwner/BusinessOwnerDemo.tsx
// ─────────────────────────────────────────────────────────────────────────
// PUBLIC, login-free business owner demo. Registered in App.tsx outside the auth
// guard. Presentation only: it imports no Supabase client, no auth hook and
// no user/org context, so there is no private data to leak.
//
// Deliberately separate from components/onboarding/OnboardingOverlay.tsx,
// which is untouched. Visual language (pills, #5b3df0, Back/Next footer)
// mirrors the existing onboarding screen.
// ─────────────────────────────────────────────────────────────────────────

import React, { useCallback, useMemo, useState } from 'react';
import { FOUNDER_VIDEO_URL, BUSINESS_OWNER_DEMO_WHATSAPP_URL } from './businessOwnerDemoConfig';
import { BUSINESS_OWNER_DEMO_VIDEOS } from './businessOwnerDemoVideos';
import BusinessOwnerLandingPage from './BusinessOwnerLandingPage';

const ACCENT = '#5b3df0';
const INK = '#15151f';
const LINE = '#d9d9e3';
const MUTED = '#6b6b78';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

type StepKey = 'start' | 'landing' | 'tracking' | 'asset' | 'collab' | 'operator' | 'workspace' | 'journey';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'start', label: 'Start Here' },
  { key: 'landing', label: 'Landing Page' },
  { key: 'tracking', label: 'Tracking' },
  { key: 'asset', label: 'Asset' },
  { key: 'collab', label: 'Collab' },
  { key: 'operator', label: 'Operator' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'journey', label: 'Journey' },
];

/** Returns a safe youtube-nocookie embed URL, or null if the input isn't a valid YouTube link. */
function toYouTubeEmbed(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  let id: string | null = null;
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/);
        id = m ? m[1] : null;
      }
    }
  } catch {
    return null;
  }
  return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}

function Placeholder({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1.5px dashed ${LINE}`,
        borderRadius: 14,
        padding: '28px 20px',
        textAlign: 'center',
        color: MUTED,
        background: '#fafafa',
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>
        {title}
      </div>
      {children && <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{children}</div>}
    </div>
  );
}

function WhatsAppLink({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <a href={BUSINESS_OWNER_DEMO_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={style}>
      {children}
    </a>
  );
}

function StartHere() {
  const embed = useMemo(() => toYouTubeEmbed(FOUNDER_VIDEO_URL), []);
  return (
    <div style={{ width: '100%', maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      {embed ? (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
          <iframe
            src={embed}
            title="VSTRK founder introduction"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
      ) : (
        <Placeholder title="Founder video not added yet">
          Set <code>FOUNDER_VIDEO_URL</code> in <code>businessOwnerDemoConfig.ts</code> to your YouTube link.
        </Placeholder>
      )}
    </div>
  );
}

export default function BusinessOwnerDemo() {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  const goNext = useCallback(() => setIndex((i) => Math.min(i + 1, STEPS.length - 1)), []);
  const goBack = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  const pill = (active: boolean): React.CSSProperties => ({
    flex: '0 0 auto', padding: '7px 13px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer',
    border: active ? `1px solid ${ACCENT}` : `1px solid ${LINE}`,
    background: active ? ACCENT : '#fff', color: active ? '#fff' : MUTED,
    fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
  });

  let body: React.ReactNode;
  if (step.key === 'start') body = <StartHere />;
  else if (step.key === 'landing') body = <BusinessOwnerLandingPage embedded />;
  else {
    const Video = BUSINESS_OWNER_DEMO_VIDEOS[step.key];
    body = Video ? (
      // key forces a fresh mount so each video restarts when revisited
      <Video key={step.key} onSkip={goNext} onComplete={goNext} />
    ) : (
      <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}>
        <Placeholder title={`${step.label} video not connected yet`}>
          Wire it in <code>businessOwnerDemoVideos.tsx</code>.
        </Placeholder>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ background: '#fff', color: INK, fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif' }}
    >
      {/* Top: step pills + WhatsApp CTA (no close button — this is a public page) */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderBottom: `1px solid ${LINE}`, background: '#fafafa', overflowX: 'auto' }}>
        {STEPS.map((s, i) => (
          <button key={s.key} type="button" onClick={() => setIndex(i)} style={pill(i === index)} aria-current={i === index ? 'step' : undefined}>
            {s.label}
          </button>
        ))}
        <WhatsAppLink style={{ ...pill(false), border: `1px solid ${ACCENT}`, color: ACCENT, textDecoration: 'none' }}>
          Contact VSTRK on WhatsApp →
        </WhatsAppLink>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: step.key === 'landing' ? 'flex-start' : 'center' }}>
        {body}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 20px', borderTop: `1px solid ${LINE}`, background: '#fafafa' }}>
        <button
          type="button" onClick={goBack} disabled={index === 0}
          style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', color: INK, fontSize: 13, fontWeight: 600, cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.4 : 1 }}
        >
          ← Back
        </button>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#9a9aa8', textAlign: 'center' }}>
          {String(index + 1).padStart(2, '0')} {step.label} · {index + 1} / {STEPS.length}
        </span>
        {isLast ? (
          <WhatsAppLink style={{ padding: '9px 16px', borderRadius: 8, background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            Contact on WhatsApp →
          </WhatsAppLink>
        ) : (
          <button type="button" onClick={goNext} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
