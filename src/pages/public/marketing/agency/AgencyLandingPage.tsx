// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/agency/AgencyLandingPage.tsx
// ─────────────────────────────────────────────────────────────────────────
// Landing page for marketing agencies and multi-client operators. One component, two places:
//   • standalone, public route  /4n        → <AgencyLandingPage />
//   • inside the Demo, "Landing Page" tab (/insights/4c) → <AgencyLandingPage embedded />
//
// Presentation only: no Supabase, auth, router or user context, so it is
// safe for logged-out visitors. Visual language mirrors the sponsor and
// interview landing pages.
//
// The HOOK and the FORMULA statement below are exact copy supplied by the
// founder. Do not reword them. Everything else is free copy and can be
// edited section by section without touching the layout code.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { AGENCY_DEMO_WHATSAPP_URL, AGENCY_LANDING_CONTENT } from './agencyDemoConfig';

/** Public Demo route (kept in sync with AGENCY_DEMO_PATHS in App.tsx). */
const DEMO_HREF = '/insights/4c';

const C = {
  bg: '#000', panel: '#0d0d0d', card: '#141414', line: '#222', text: '#f2f2f2', mut: '#9a9a9a',
  red: '#e11d1d', purple: '#7c5cff', lp: '#b7a6ff', green: '#22c55e', amber: '#e0b04a',
};
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

const mono = (color = C.mut, size = 11): React.CSSProperties => ({
  fontFamily: MONO, fontSize: size, color, letterSpacing: '0.12em', textTransform: 'uppercase',
});

/* ───────────────────────────── CONTENT ───────────────────────────── */

// EXACT COPY — hook. Do not reword.
const HERO = {
  eyebrow: 'To Marketing Agencies',
  headline: 'Are Your Old Strategies No Longer Helping You Close and Retain Clients?— Even When You Deliver Good Results?',
  paragraphs: [
    "You're competing for clients in a market where almost every agency promises more leads, more sales, and business growth. But potential clients want more than promises. They want to know whether your strategies work, whether their investment is paying off, and why they should trust you with their business.",
    "And even after you win a client, the challenge doesn't end. You need to demonstrate your value, retain their trust, and show them why continuing to work with you is worth the investment.",
    "You can show how much revenue your campaigns generate — but can you see which content captures attention, which educates potential customers, which builds interest and trust, which drives clicks and conversions, and which ultimately leads to sales?",
    "Can you track the customer journey from the first interaction to the final conversion, identify what works at each stage, replicate successful strategies, and avoid repeating what doesn't work?",
  ],
  emphasis: [
    'VSTRK helps you understand what drives your marketing results by connecting and comparing content performance, conversion events, revenue, and customer journeys across nine social and content platforms, including YouTube, TikTok, Instagram, X, and LinkedIn — across individual content, campaigns, and over time.',
    'So you can build stronger proof of your results, give clients more reasons to trust and retain your services, replicate winning strategies, avoid wasted opportunities, and turn successful campaigns into compelling case studies that help you win more clients.',
  ],
  // EXACT COPY — formula statement, split into segments only so key phrases can be highlighted (hl: true).
  statement: [
    { t: 'We help marketing agencies ' },
    { t: 'win new clients and retain existing ones', hl: true },
    { t: ' by connecting marketing activities to ' },
    { t: 'measurable business results', hl: true },
    { t: ' across individual content, campaigns, conversions, revenue, and customer journeys — so they can show clients what is actually driving results, identify opportunities others might miss, replicate winning strategies, avoid wasted marketing spend, ' },
    { t: 'prove the value of their services', hl: true },
    { t: ', and build a stronger, more competitive agency.' },
  ] as { t: string; hl?: boolean }[],
};

const DOUBTS = [
  { t: 'Is it worth the money?', b: 'Before results exist, a prospect is being asked to pay a monthly fee and trust that it comes back as business.' },
  { t: 'Will you actually deliver?', b: 'Many prospects have heard big promises before. They want a way to see the work and the results, not just hear about them.' },
  { t: 'Will this work for my business?', b: 'Success for another client doesn’t prove success in their industry, with their product, their audience and their sales cycle.' },
  { t: 'What exactly am I paying for?', b: 'Posts, meetings and reports are easy to see. Whether they made the business better is harder to see.' },
];

const RETENTION_SCENARIOS = [
  { t: 'Lots of views, few sales', b: 'A video gets strong attention, but very little of it turns into customers. The report looks busy. The revenue doesn’t.' },
  { t: 'Fewer views, more revenue', b: 'Another piece of content reaches fewer people but is tied to far more conversions. Nobody noticed, because only views were reported.' },
  { t: 'The slow burn', b: 'A third piece doesn’t sell right away, but introduces people who buy later. Without the journey, it looks like it did nothing.' },
];

const GAPS = [
  'Platform analytics show what happened on one platform, not what happened to the business.',
  'A total revenue figure doesn’t show which content, campaign or stage of the journey earned it.',
  'Monthly reports show effort, and clients can’t always tell what the effort produced.',
];

const SOLUTION_STEPS = [
  { t: 'Bring your tracking data together', b: 'Connect the tracking data you have across supported platforms, including YouTube, TikTok, Instagram, X, and LinkedIn, in one interface.' },
  { t: 'Compare individual content and campaigns', b: 'Look past one campaign total. Compare pieces of content, campaigns, and how each performs over time.' },
  { t: 'Connect content to conversions and revenue', b: 'See which content is associated with conversion events and revenue, instead of stopping at views and clicks.' },
  { t: 'Follow the customer journey', b: 'Where journey data is available, trace the path from first interaction to final conversion and see what contributed at each stage.' },
];

const QUESTIONS = [
  'Which content captures attention?',
  'Which content educates potential customers?',
  'Which content builds interest and trust?',
  'Which content drives clicks and conversions?',
  'Which content ultimately leads to sales?',
  'Which successful strategies are worth repeating?',
  'Which activity isn’t working and should stop?',
  'Which results are strong enough to become a case study?',
];

const CLIENT_DOUBTS_MAP = [
  { t: 'When a prospect says it’s too expensive', b: 'Show how content, conversions and revenue connect, so the conversation is about return on investment, not just price.' },
  { t: 'When a prospect worries about getting scammed', b: 'Show documented activity next to observed results, so they see what was published and what happened, not only what was promised.' },
  { t: 'When a prospect asks if it will work for them', b: 'Use specific results from similar work as evidence, and propose a small test with clear measures instead of a guarantee.' },
  { t: 'When a client can’t see what you do', b: 'Move the review from “here’s what we did” to “here’s what we observed, and here’s what we’ll do next.”' },
];

const OPERATIONS = [
  { t: 'Less time assembling reports', b: 'Having content performance, conversions and revenue in one place can reduce the time spent stitching data together for every client review. The real savings depend on your workflow.' },
  { t: 'Clearer next steps', b: 'When revenue drops or stalls, finer detail helps you see where to look first, so you can decide what to test instead of guessing. Data points to leads, not proof of cause.' },
  { t: 'Wins you can reuse', b: 'A campaign that works becomes something you can explain and learn from, instead of something you remember vaguely when the next prospect asks.' },
];

const DEMO_EXAMPLES = [
  { t: 'Content, conversions and revenue together', b: 'Content performance, conversion events and revenue connected in one interface.' },
  { t: 'Compare content and campaigns', b: 'See how individual pieces of content and whole campaigns perform, side by side and over time.' },
  { t: 'Understand the customer journey', b: 'How a customer can interact with multiple pieces of content before they convert.' },
];

const AUDIENCE = [
  'You deliver real results and want the evidence to back that up.',
  'You manage several clients, campaigns or platforms and need a way to compare them.',
  'You spend too much time assembling reports for client reviews.',
  'You want to show clients what drives results, not only how much activity happened.',
  'You want to know which strategies to repeat and which to drop.',
  'You want to turn successful campaigns into case studies that help you win new clients.',
  'You want a stronger answer when a prospect asks, “How do I know this will work for me?”',
  'You’d rather improve based on what the data shows than on what looks good in a report.',
];

const PRIVACY_POINTS = [
  { t: 'Use it internally', b: 'Analyze which content and campaigns perform best and keep those findings for your own team.' },
  { t: 'Share selectively', b: 'Choose which results to present to a client or prospect, with the client’s consent and without exposing confidential information.' },
  { t: 'Offer full transparency', b: 'If your clients want to see everything, that’s an option too. It isn’t required.' },
];

const PROCESS = [
  { t: 'Connect', b: 'Connect your tracking data across supported platforms.' },
  { t: 'Compare', b: 'Compare content, campaigns, conversions and revenue over time.' },
  { t: 'Prove', b: 'Show clients and prospects what is driving results, with your own judgment on what to share.' },
  { t: 'Repeat', b: 'Replicate what works, stop what doesn’t, and turn strong campaigns into case studies.' },
];

const FAQ = [
  { q: 'Does VSTRK guarantee that my agency will win or keep clients?', a: 'No. VSTRK doesn’t guarantee sales, retention or results. It gives you a clearer, better-evidenced view of what your marketing is doing, so you can make a stronger case for it.' },
  { q: 'Is the revenue shown the revenue my agency created?', a: 'Not necessarily. Tracked revenue shows what is associated with the content and conversions you track. It doesn’t automatically prove your campaign caused all of it. Use it as evidence alongside your own judgment, not as a claim of causation.' },
  { q: 'Do I have to show clients all my data?', a: 'No. You can use VSTRK internally, share selected results, or give clients full visibility. How open you are is your decision.' },
  { q: 'What if a platform doesn’t provide some of the data?', a: 'VSTRK shows the data that connected platforms and your tracking make available. If something isn’t available, it isn’t shown, and you judge on the rest.' },
  { q: 'Can I use client results in case studies?', a: 'Only with the client’s permission and with confidential information protected. VSTRK helps you keep the supporting data. It doesn’t replace your agreements with clients.' },
  { q: 'What if my results are only average right now?', a: 'The data can still help. Seeing which content and strategies work and which don’t is how you improve, and that’s often the first step to better results.' },
  { q: 'Can I see the product before I talk to anyone?', a: 'Yes. The interactive demo walks through the product step by step, and you can open it any time.' },
];

/* ───────────────────────────── PIECES ───────────────────────────── */

type CtaProps = { solid?: boolean; href: string; external?: boolean; children: React.ReactNode };

function Cta({ solid = true, href, external, children }: CtaProps) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      style={{
        ...mono(solid ? '#fff' : C.text, 11.5), fontWeight: 700, padding: '13px 20px', borderRadius: 8,
        textDecoration: 'none', display: 'inline-block',
        background: solid ? C.purple : 'transparent',
        border: solid ? 'none' : '0.5px solid #3a3a3a',
        boxShadow: solid ? '0 8px 24px rgba(124,92,255,0.35)' : 'none',
      }}
    >
      {children}
    </a>
  );
}

function Section({ label, title, sub, children }: { label: string; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section style={{ marginTop: 88 }}>
      <div style={{ ...mono(C.red), marginBottom: 8 }}>{label}</div>
      <h2 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 600, lineHeight: 1.15, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 16, color: C.mut, lineHeight: 1.65, margin: '14px 0 0', maxWidth: 640 }}>{sub}</p>}
      {children && <div style={{ marginTop: 24 }}>{children}</div>}
    </section>
  );
}

const grid = (min = 240): React.CSSProperties => ({
  display: 'grid', gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
});

function Card({ title, children, accent, num }: { title: string; children: React.ReactNode; accent?: string; num?: string }) {
  return (
    <div style={{ background: C.card, border: `0.5px solid ${accent ?? C.line}`, borderRadius: 12, padding: '16px 18px' }}>
      {num && <div style={{ ...mono(C.lp), marginBottom: 8 }}>{num}</div>}
      <div style={{ fontWeight: 600, fontSize: 15.5, marginBottom: 6 }}>{title}</div>
      <div style={{ color: C.mut, fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: '28px 0 0', padding: '18px 20px', borderLeft: `3px solid ${C.purple}`, background: C.panel,
        borderRadius: '0 10px 10px 0', fontSize: 17, fontWeight: 600, lineHeight: 1.5,
      }}
    >
      {children}
    </p>
  );
}

function Node({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'accent' | 'warn' }) {
  const border = tone === 'accent' ? C.purple : tone === 'warn' ? C.amber : '#2a2a2a';
  return (
    <div
      style={{
        background: tone === 'accent' ? '#1a1538' : C.card, border: `1px solid ${border}`, borderRadius: 9,
        padding: '9px 12px', fontSize: 13, textAlign: 'center', lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

const Down = ({ color = '#3a3a3a' }: { color?: string }) => (
  <div aria-hidden="true" style={{ textAlign: 'center', color, fontSize: 14, lineHeight: 1, padding: '4px 0' }}>↓</div>
);

function CheckList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
      {items.map((a) => (
        <li key={a} style={{ display: 'flex', gap: 12, fontSize: 15.5, lineHeight: 1.55 }}>
          <span aria-hidden="true" style={{ color: C.green, fontWeight: 700, flex: 'none' }}>✓</span>
          <span>{a}</span>
        </li>
      ))}
    </ul>
  );
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((f) => (
        <details key={f.q} style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '14px 18px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 15.5, lineHeight: 1.45 }}>{f.q}</summary>
          <p style={{ color: C.mut, fontSize: 14.5, lineHeight: 1.65, margin: '10px 0 0', maxWidth: 680 }}>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Reporting activity vs. proving results. Purely illustrative — labelled as such. */
function ReportVsProof() {
  const panel: React.CSSProperties = { background: C.panel, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' };
  return (
    <div style={{ ...grid(300), marginTop: 36 }}>
      <div style={panel}>
        <div style={{ ...mono(C.amber), marginBottom: 12 }}>Reporting activity</div>
        <Node>Agency publishes content</Node>
        <Down />
        <Node tone="warn">Report: posts, views, clicks, one revenue total</Node>
        <Down />
        <Node tone="warn">Client asks: what did this do for my business?</Node>
        <Down color={C.amber} />
        <Node tone="warn">Hard to answer, hard to renew with confidence</Node>
      </div>
      <div style={{ ...panel, borderColor: C.purple }}>
        <div style={{ ...mono(C.lp), marginBottom: 12 }}>Proving results</div>
        <Node>Agency publishes content</Node>
        <Down />
        <Node tone="accent">Content, conversions and revenue connected</Node>
        <Down />
        <Node tone="accent">Customer journeys traced where data is available</Node>
        <Down color={C.purple} />
        <Node tone="accent">Evidence for client reviews and case studies</Node>
      </div>
      <div style={{ ...mono(C.amber, 10), gridColumn: '1 / -1' }}>Illustration of the workflow — not real customer data</div>
    </div>
  );
}

/* ───────────────────────────── PAGE ───────────────────────────── */

export default function AgencyLandingPage({ embedded = false }: { embedded?: boolean }) {
  const waLabel = AGENCY_LANDING_CONTENT.ctaLabel || 'Contact VSTRK on WhatsApp';
  const body = (extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize: 'clamp(16px, 2.2vw, 19px)', color: C.mut, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700, ...extra,
  });

  return (
    <div
      style={{
        width: '100%', background: C.bg, color: C.text, fontFamily: SANS,
        minHeight: embedded ? undefined : '100vh', WebkitFontSmoothing: 'antialiased',
      }}
    >
      {!embedded && (
        <header
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '14px 20px', borderBottom: `0.5px solid ${C.line}`,
          }}
        >
          <span style={{ fontWeight: 800, letterSpacing: '0.18em', fontSize: 15 }}>VSTRK</span>
          <a
            href={AGENCY_DEMO_WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
            style={{ ...mono(C.lp, 10.5), fontWeight: 700, textDecoration: 'none' }}
          >
            Contact on WhatsApp →
          </a>
        </header>
      )}

      <div style={{ maxWidth: 940, margin: '0 auto', padding: embedded ? '40px 20px 56px' : '56px 20px 72px' }}>
        {/* 1 · HOOK (exact copy) */}
        <div style={{ ...mono(C.red), marginBottom: 14 }}>{HERO.eyebrow}</div>
        <h1 style={{ fontSize: 'clamp(30px, 6vw, 52px)', fontWeight: 700, lineHeight: 1.08, margin: 0, maxWidth: 800 }}>
          {HERO.headline}
        </h1>
        {HERO.paragraphs.map((t) => (
          <p key={t} style={body({ color: '#c9c5da' })}>{t}</p>
        ))}
        {HERO.emphasis.map((t) => (
          <p key={t} style={body({ color: C.text, fontWeight: 600, lineHeight: 1.6 })}>{t}</p>
        ))}

        {/* 1b · FORMULA (exact copy) */}
        <div
          style={{
            margin: '36px 0 32px', padding: 'clamp(22px, 4.5vw, 44px)', borderRadius: 18,
            border: `1.5px solid ${C.purple}`, borderLeftWidth: 6,
            background: 'linear-gradient(135deg, #241a52 0%, #14102e 55%, #0d0d0d 100%)',
            boxShadow: '0 0 0 1px rgba(124,92,255,0.15), 0 16px 60px rgba(124,92,255,0.28)',
          }}
        >
          <p
            style={{
              margin: 0, fontSize: 'clamp(20px, 3.3vw, 29px)', fontWeight: 700, lineHeight: 1.4,
              letterSpacing: '-0.01em', color: '#fff',
            }}
          >
            {HERO.statement.map((seg, j) =>
              seg.hl ? (
                <span key={j} style={{ color: C.lp, background: 'rgba(124,92,255,0.22)', borderRadius: 4, padding: '0 4px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
                  {seg.t}
                </span>
              ) : (
                <React.Fragment key={j}>{seg.t}</React.Fragment>
              ),
            )}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Cta href={AGENCY_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
          {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
        </div>

        <ReportVsProof />

        {/* 2 · PAIN: before the client signs */}
        <Section
          label="Before they sign"
          title="Prospects are deciding before the results exist"
          sub="A potential client has to choose whether to pay you before they can see what you’ll deliver. Whatever you say in the pitch, these are the questions behind it:"
        >
          <div style={grid(220)}>
            {DOUBTS.map((d) => (
              <Card key={d.t} title={d.t}>{d.b}</Card>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 680 }}>
            These doubts are reasonable, and they don’t mean the prospect is difficult. Your job is to close the trust gap
            between what you promise and what they can verify. Specific evidence from past work helps more than another promise.
          </p>
        </Section>

        {/* 3 · PAIN: after they sign */}
        <Section
          label="After they sign"
          title="Doing good work isn’t the same as showing it"
          sub="Winning the client is only the first half. At every review, you’re asked again to prove the value. Imagine three pieces of content from one campaign:"
        >
          <div style={grid(250)}>
            {RETENTION_SCENARIOS.map((s, i) => (
              <Card key={s.t} title={s.t} num={`Imagine · 0${i + 1}`}>{s.b}</Card>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 680 }}>
            If all you can show is the total, you can’t explain which content deserves credit, which should be repeated, or
            which should stop. The client can’t see it either, and an agency that can’t show its value is easy to question
            at renewal time.
          </p>
        </Section>

        {/* 4 · WHY CURRENT REPORTING FALLS SHORT */}
        <Section
          label="Why current reporting falls short"
          title="Activity reports show effort. Clients want to know what it produced."
          sub="Platform analytics, spreadsheets and monthly reports are useful. The gap is between what they show and what a prospect or client actually wants to know."
        >
          <div style={grid(260)}>
            {GAPS.map((g) => (
              <div key={g} style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 10, padding: '14px 16px', fontSize: 15, fontWeight: 600, lineHeight: 1.45 }}>
                {g}
              </div>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700 }}>
            Multiply that across clients, campaigns and platforms, and building the proof by hand becomes a job of its own.
          </p>
          <Callout>
            The problem isn’t necessarily your work. It’s that you may not have the evidence structure needed to show what the
            work is doing.
          </Callout>
        </Section>

        {/* 5 · SOLUTION */}
        <Section
          label="Introducing VSTRK"
          title="Connect what you publish to what it produces"
          sub="VSTRK connects the available tracking data across individual content, campaigns, supported platforms, conversion events, revenue and customer journeys in one interface, so you can see what drives results and build stronger evidence of your performance."
        >
          <div style={grid(400)}>
            {SOLUTION_STEPS.map((s, i) => (
              <Card key={s.t} title={s.t} num={`Step ${i + 1}`}>{s.b}</Card>
            ))}
          </div>
          <Callout>Stronger proof of what your marketing does, from the first interaction to the final conversion.</Callout>
        </Section>

        {/* 6 · TRANSFORMATION */}
        <Section
          label="What becomes possible"
          title="Stop reporting one number. Start answering better questions."
          sub="With content, conversions, revenue and journeys connected, you can ask:"
        >
          <div style={grid(300)}>
            {QUESTIONS.map((q) => (
              <div key={q} style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 10, padding: '14px 16px', fontSize: 15, lineHeight: 1.45 }}>
                {q}
              </div>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, margin: '16px 0 0', maxWidth: 700 }}>
            VSTRK shows what the available data connects, not everything that happened. Tracked revenue isn’t automatically
            revenue your agency created, and we don’t promise that every campaign will become profitable. The goal is better
            evidence, so you can understand what’s happening and improve it.
          </p>
        </Section>

        {/* 7 · HOW IT HELPS WIN AND KEEP CLIENTS */}
        <Section
          label="Winning and keeping clients"
          title="A stronger answer when clients push back"
          sub="Better evidence doesn’t replace good strategy, honesty or a good relationship. It gives you more to show when it matters:"
        >
          <div style={grid(400)}>
            {CLIENT_DOUBTS_MAP.map((m) => (
              <Card key={m.t} title={m.t} accent={C.purple}>{m.b}</Card>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, margin: '16px 0 0', maxWidth: 700 }}>
            Data can’t make a dishonest agency trustworthy, and it can’t guarantee a result. What it can do is give a
            trustworthy agency a better way to show its work.
          </p>
        </Section>

        {/* 8 · BEHIND THE SCENES */}
        <Section
          label="Inside your agency"
          title="Better proof for clients. Better decisions for you."
          sub="Connected data helps with more than the pitch and the review. It can change how your own team works:"
        >
          <div style={grid(260)}>
            {OPERATIONS.map((o) => (
              <Card key={o.t} title={o.t}>{o.b}</Card>
            ))}
          </div>
          <Callout>Every successful campaign can become evidence for the next client you want to win.</Callout>
        </Section>

        {/* 9 · DEMO */}
        <Section
          label="See it in action"
          title="Don’t take our word for it — walk through VSTRK"
          sub={
            embedded
              ? 'Use the tabs above to walk through the product, step by step. Here is what you’ll see:'
              : 'The interactive demo walks through the real product, step by step. Here is what you’ll see:'
          }
        >
          <div style={grid(250)}>
            {DEMO_EXAMPLES.map((d, i) => (
              <Card key={d.t} title={d.t} num={`Example · 0${i + 1}`} accent={C.purple}>{d.b}</Card>
            ))}
          </div>
          {!embedded && (
            <div style={{ marginTop: 20 }}>
              <Cta href={DEMO_HREF}>Open the interactive demo →</Cta>
            </div>
          )}
        </Section>

        {/* 10 · WHO IT'S FOR */}
        <Section
          label="Who VSTRK is for"
          title="Agencies and marketers who want to prove what they deliver"
          sub="It’s especially relevant if:"
        >
          <CheckList items={AUDIENCE} />
          <p style={{ color: C.mut, fontSize: 15, lineHeight: 1.65, margin: '22px 0 0', maxWidth: 700 }}>
            VSTRK isn’t a magic solution. It doesn’t replace good strategy, quality work or a reliable tracking setup, and it
            works with the data you can connect.
          </p>
        </Section>

        {/* 11 · OPENNESS */}
        <Section
          label="How open you are is up to you"
          title="You decide what clients see"
          sub="Using VSTRK doesn’t mean showing every client everything. Agencies can use it in the way that suits their business:"
        >
          <div style={grid(250)}>
            {PRIVACY_POINTS.map((p) => (
              <Card key={p.t} title={p.t}>{p.b}</Card>
            ))}
          </div>
        </Section>

        {/* 12 · PROCESS */}
        <Section label="The process" title="Connect. Compare. Prove. Repeat.">
          <div style={grid(200)}>
            {PROCESS.map((p, i) => (
              <Card key={p.t} title={p.t} num={`0${i + 1}`}>{p.b}</Card>
            ))}
          </div>
        </Section>

        {/* 13 · OBJECTIONS */}
        <Section label="Questions you may have" title="Honest answers before you decide">
          <Faq items={FAQ} />
        </Section>

        {/* 14 · NEXT STEPS */}
        <section
          style={{
            marginTop: 96, background: C.panel, border: `1px solid ${C.purple}`, borderRadius: 16,
            padding: 'clamp(24px, 5vw, 44px)', textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 700, lineHeight: 1.15, margin: 0 }}>
            Don’t just tell clients it’s working. Show them what’s driving it.
          </h2>
          <p style={{ color: C.mut, fontSize: 16, lineHeight: 1.65, margin: '14px auto 24px', maxWidth: 600 }}>
            If you want stronger proof of your results, more reasons for clients to stay, and case studies that help you win the
            next one, explore how VSTRK can fit into your agency’s workflow.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            <Cta href={AGENCY_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
            {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
          </div>
          <p style={{ ...mono(C.mut, 11), margin: '24px 0 0' }}>VSTRK — Prove what your marketing delivers.</p>
        </section>
      </div>
    </div>
  );
}