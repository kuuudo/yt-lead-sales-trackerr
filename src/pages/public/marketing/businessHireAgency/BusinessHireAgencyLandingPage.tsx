// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/businessHireAgency/BusinessHireAgencyLandingPage.tsx
// ─────────────────────────────────────────────────────────────────────────
// Landing page for business owners who work with marketing agencies and marketers.
// One component, two places:
//   • standalone, public route  /5q        → <BusinessHireAgencyLandingPage />
//   • inside the Demo, "Landing Page" tab (/insights/5x) → <BusinessHireAgencyLandingPage embedded />
//
// Presentation only: no Supabase, auth, router or user context, so it is
// safe for logged-out visitors. Visual language mirrors the sponsor, interview
// and agency landing pages.
//
// The HOOK and the FORMULA statement below are exact copy supplied by the
// founder. Do not reword them. Everything else is free copy and can be
// edited section by section without touching the layout code.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { BUSINESS_HIRE_AGENCY_DEMO_WHATSAPP_URL, BUSINESS_HIRE_AGENCY_LANDING_CONTENT } from './businessHireAgencyDemoConfig';

/** Public Demo route (kept in sync with BUSINESS_HIRE_AGENCY_DEMO_PATHS in App.tsx). */
const DEMO_HREF = '/insights/5x';

const C = {
  bg: '#000', panel: '#0d0d0d', card: '#141414', line: '#222', text: '#f2f2f2', mut: '#9a9a9a',
  soft: '#c9c5da', // lighter, slightly purple-tinted grey for the hook paragraphs
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
  eyebrow: 'To Business Owners Working With Marketing Agencies',
  headline:
    'Are You Frustrated by a Lack of Transparency During Collaboration, Agencies Failing to Deliver on Their Promises, or Gradually Underdelivering Over Time — While Leaving You Without the Means to Measure Their Performance and Hold Them Accountable for What You Pay?',
  paragraphs: [
    "You've invested in marketing agencies and marketers because you want to grow your business. But how do you know whether your investment is paying off? You may receive reports, see views, clicks, leads, and revenue figures, yet still struggle to understand which marketing activities are actually contributing to your results.",
    'You might know how much revenue your campaigns generate — but do you know which content captures attention, which educates potential customers, which builds interest and trust, and which ultimately drives conversions and sales?',
    "You shouldn't have to rely entirely on what your marketers choose to show you. You need a clearer picture of what's happening across your marketing — from individual content and customer interactions to conversions, revenue, and the customer journey over time.",
    "And this shouldn't be about simply monitoring your marketing team. It should be about creating a more transparent working relationship where you and your marketers can look at the same data, understand what's working and what isn't, agree on meaningful performance metrics, and work together to improve results.",
  ],
  emphasis:
    "Because when everyone has a clearer view of the results, you can ask better questions, make better decisions, identify opportunities, and build on what works instead of continually guessing where your marketing money is going.",
  // EXACT COPY — formula, split into segments only so key phrases can be highlighted (hl: true).
  statement: [
    [
      { t: 'We help business owners working with marketing agencies and marketers ' },
      { t: 'create more transparent, accountable, and fairer working relationships', hl: true },
      { t: ' by giving them the means to ' },
      { t: 'measure performance, evaluate delivery against expectations', hl: true },
      { t: ', and understand where their marketing investment is actually paying off.' },
    ],
    [
      { t: 'By connecting and comparing content performance, conversion events, revenue, and customer journeys across ' },
      { t: 'nine social and content platforms', hl: true },
      { t: ' — at the individual content and campaign levels, and over time — VSTRK helps business owners ' },
      { t: 'identify what is working, recognize underperformance, reduce wasted spend', hl: true },
      { t: ', and make better-informed decisions about what to improve, repeat, or scale.' },
    ],
  ] as { t: string; hl?: boolean }[][],
};

const THOUGHTS = [
  'I’ve paid for marketing before and I still can’t tell what I got for it.',
  'Besides “make me more money,” what should I actually be asking them to deliver?',
  'I can see my revenue, but I can’t see which content produced it.',
  'The report looks good. Is it showing me everything, or only the good parts?',
  'This month was strong. Is it getting better over time, or fading?',
  'I know my product and my customers. Why can’t I have a real conversation about what’s working?',
];

const BREAKDOWNS = [
  { t: 'You can’t see what’s happening', b: 'Updates arrive as summaries. You see the headline numbers, but not the detail behind them, so you’re trusting what’s shown to you.' },
  { t: 'Promises don’t turn into delivery', b: 'The pitch promised leads, sales and growth. Months later, it’s hard to say what was delivered against what was agreed.' },
  { t: 'Results slowly slip', b: 'The first few months look strong, then effort and results quietly drop. A single monthly report rarely shows the trend.' },
];

const COSTS = [
  { t: 'Money without answers', b: 'You keep paying a retainer without knowing which part of the work is earning it.' },
  { t: 'Decisions on guesswork', b: 'Budgets get raised, cut or moved because of a feeling, not because of evidence.' },
  { t: 'A strained relationship', b: 'You ask for revenue. They report views. Each side feels the other isn’t listening.' },
];

const FUNNEL = [
  { d: 'Attention', w: 'Which content captures attention?', s: 'Content and platform data' },
  { d: 'Education', w: 'Which content educates potential customers?', s: 'Content and platform data' },
  { d: 'Interest and trust', w: 'Which content builds interest and trust?', s: 'Content and journey data' },
  { d: 'Clicks and conversions', w: 'Which content drives clicks and conversion events?', s: 'VSTRK tracking' },
  { d: 'Sales', w: 'Which content is associated with revenue?', s: 'VSTRK tracking' },
  { d: 'Over time', w: 'Are results building, holding, or fading?', s: 'VSTRK tracking' },
  { d: 'What it means for your business', w: 'Does this meet what we agreed, and what should change?', s: 'Your judgment, with your team' },
];

const RELATIONSHIP = [
  { t: 'You see what they see', b: 'You and your marketers look at the same content, conversion and revenue data instead of working from two different versions of the story.' },
  { t: 'You agree on what to measure', b: 'Move past “generate revenue.” Agree on which signals matter at each stage, so expectations are clear from the start.' },
  { t: 'You decide together', b: 'Review what worked, what didn’t, and what to do next based on shared evidence, not on who argues better.' },
];

const SOLUTION_STEPS = [
  { t: 'Bring your marketing data together', b: 'Connect the available tracking data across supported platforms, including YouTube, TikTok, Instagram, X, and LinkedIn, in one interface.' },
  { t: 'Look at individual content and campaigns', b: 'Go past the campaign total. Compare pieces of content and campaigns to see which ones are contributing.' },
  { t: 'Connect content to conversions and revenue', b: 'See which content is associated with conversion events and revenue, not just views and clicks.' },
  { t: 'Follow the journey, over time', b: 'Where journey data is available, see how customers move from first interaction to conversion, and how results change month after month.' },
];

const QUESTIONS = [
  'Which content brings in the most revenue?',
  'Which content attracts attention but struggles to convert?',
  'Which content contributes to customer journeys that end in a sale?',
  'Is what we agreed showing up in the results?',
  'Where is performance slipping compared with earlier months?',
  'Which parts of the budget are worth increasing, changing or stopping?',
  'Which successful approaches could we apply to other products or channels?',
  'What should we ask in the next review?',
];

const REPLICATE = [
  { t: 'Learn from what works', b: 'When a piece of content or a campaign performs, you can see which one, and study what made it different.' },
  { t: 'Apply it across the business', b: 'Use proven approaches in other campaigns, products or channels, instead of starting from scratch each time.' },
  { t: 'Build on it over time', b: 'Keep what keeps working, change what fades, and let the knowledge stay with your business as people and agencies change.' },
];

const RUN_PHASES = [
  { t: 'At the start', items: [
    'Write down what you want the marketing to achieve for your business.',
    'Agree with your team which signals you’ll review at each stage.',
    'Set up the tracking you’ll both rely on.',
    'Agree how often you’ll review the results together.',
  ] },
  { t: 'During the work', items: [
    'Look at the same data your marketers look at.',
    'Compare individual content and campaigns, not just totals.',
    'Ask questions based on what you can see.',
    'Note what’s building and what’s fading.',
  ] },
  { t: 'At each review', items: [
    'Compare results against what you agreed.',
    'Decide what to improve, repeat, scale or stop.',
    'Discuss the reasons behind the numbers with your team.',
    'Decide using the evidence together with your own judgment.',
  ] },
];

const DEMO_EXAMPLES = [
  { t: 'Content, conversions and revenue together', b: 'Content performance, conversion events and revenue connected in one interface.' },
  { t: 'Compare content and campaigns', b: 'See how individual pieces of content and whole campaigns perform, side by side and over time.' },
  { t: 'Understand the customer journey', b: 'How a customer can interact with multiple pieces of content before they convert.' },
];

const AUDIENCE = [
  'You pay a marketing agency, freelancer or in-house marketer to promote your business.',
  'You get reports, but still can’t tell what is actually driving your results.',
  'You’ve been disappointed by promises that didn’t turn into delivery.',
  'You want to set clearer expectations and measure delivery against them.',
  'You want to see which content generates revenue and why, not just the total.',
  'You want to check whether results are improving over time, not just this month.',
  'You want a more open working relationship with your marketing team.',
  'You want to apply what works to more of your business.',
];

const NOT_THIS = [
  { t: 'Not a scam detector', b: 'VSTRK doesn’t judge whether an agency is honest. It gives you a clearer, shared basis for evaluating the work.' },
  { t: 'Not surveillance', b: 'The goal isn’t to police your team. It’s to work from the same information, with fewer surprises on both sides.' },
  { t: 'Not a guarantee', b: 'Results depend on your product, pricing, market and sales process too. A weak month isn’t automatically someone’s fault.' },
];

const FAQ = [
  { q: 'Will VSTRK tell me whether my agency is a scam?', a: 'No. VSTRK doesn’t identify bad agencies and can’t guarantee honesty or results. It helps you see which tracked content, conversions and revenue are connected, so you can ask better questions and judge the work on evidence.' },
  { q: 'If results are weak, does that mean my agency is failing?', a: 'Not necessarily. Your product, pricing, market, sales process and tracking setup all affect results. The data shows where to look and what to discuss. It doesn’t prove who or what is responsible.' },
  { q: 'Is the revenue shown the revenue my agency created?', a: 'Not automatically. Tracked revenue shows what is associated with the content and conversions you track. It doesn’t prove that a specific piece of marketing caused a sale. Use it as evidence, not as a verdict.' },
  { q: 'Do my marketers need to be involved?', a: 'Tracking works best when you set it up together and agree on what you’ll measure. Having your team on the same page from the start makes the data more useful for both sides.' },
  { q: 'Can I reuse what my marketers created?', a: 'That depends on your agreement with them, including who owns the content. Check your contract and talk to your team. VSTRK helps you see what worked. It doesn’t change your legal rights.' },
  { q: 'What if a platform doesn’t provide some of the data?', a: 'VSTRK shows what connected platforms and your tracking make available. If something isn’t available, it isn’t shown, and you judge on the rest.' },
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

/** What to ask at each stage of the marketing funnel. */
function FunnelTable() {
  const cell: React.CSSProperties = { padding: '11px 14px', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, lineHeight: 1.5, textAlign: 'left', verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto', background: C.panel, border: `0.5px solid ${C.line}`, borderRadius: 12 }}>
      <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Stage', 'What to ask your team', 'Where it comes from'].map((h) => (
              <th key={h} scope="col" style={{ ...cell, ...mono(C.lp, 10.5), fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FUNNEL.map((r) => (
            <tr key={r.d}>
              <th scope="row" style={{ ...cell, fontWeight: 600 }}>{r.d}</th>
              <td style={{ ...cell, color: C.mut }}>{r.w}</td>
              <td style={{ ...cell, color: r.s.startsWith('Your judgment') ? C.amber : C.lp }}>{r.s}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reports you receive vs. a shared view of the data. Purely illustrative — labelled as such. */
function ReportVsSharedView() {
  const panel: React.CSSProperties = { background: C.panel, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' };
  return (
    <div style={{ ...grid(300), marginTop: 36 }}>
      <div style={panel}>
        <div style={{ ...mono(C.amber), marginBottom: 12 }}>Relying on reports</div>
        <Node>You pay an agency to market your business</Node>
        <Down />
        <Node tone="warn">They send a report: views, clicks, one revenue total</Node>
        <Down />
        <Node tone="warn">You ask: what is actually working?</Node>
        <Down color={C.amber} />
        <Node tone="warn">You rely on what you’re shown</Node>
      </div>
      <div style={{ ...panel, borderColor: C.purple }}>
        <div style={{ ...mono(C.lp), marginBottom: 12 }}>Working from shared data</div>
        <Node>You pay an agency to market your business</Node>
        <Down />
        <Node tone="accent">Content, conversions and revenue connected</Node>
        <Down />
        <Node tone="accent">You and your team look at the same data</Node>
        <Down color={C.purple} />
        <Node tone="accent">Agreed metrics, clearer questions, better decisions</Node>
      </div>
      <div style={{ ...mono(C.amber, 10), gridColumn: '1 / -1' }}>Illustration of the workflow — not real customer data</div>
    </div>
  );
}

/* ───────────────────────────── PAGE ───────────────────────────── */

export default function BusinessHireAgencyLandingPage({ embedded = false }: { embedded?: boolean }) {
  const waLabel = BUSINESS_HIRE_AGENCY_LANDING_CONTENT.ctaLabel || 'Contact VSTRK on WhatsApp';
  const body = (extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize: 'clamp(16px, 2.2vw, 19px)', color: C.soft, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700, ...extra,
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
            href={BUSINESS_HIRE_AGENCY_DEMO_WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
            style={{ ...mono(C.lp, 10.5), fontWeight: 700, textDecoration: 'none' }}
          >
            Contact on WhatsApp →
          </a>
        </header>
      )}

      <div style={{ maxWidth: 940, margin: '0 auto', padding: embedded ? '40px 20px 56px' : '56px 20px 72px' }}>
        {/* 1 · HOOK (exact copy) */}
        <div style={{ ...mono(C.red), marginBottom: 14 }}>{HERO.eyebrow}</div>
        <h1 style={{ fontSize: 'clamp(26px, 4.6vw, 40px)', fontWeight: 700, lineHeight: 1.14, margin: 0, maxWidth: 860 }}>
          {HERO.headline}
        </h1>
        {HERO.paragraphs.map((t) => (
          <p key={t} style={body()}>{t}</p>
        ))}
        <p style={body({ color: C.text, fontWeight: 600, lineHeight: 1.6 })}>{HERO.emphasis}</p>

        {/* 1b · FORMULA (exact copy) */}
        <div
          style={{
            margin: '36px 0 32px', padding: 'clamp(22px, 4.5vw, 44px)', borderRadius: 18,
            border: `1.5px solid ${C.purple}`, borderLeftWidth: 6,
            background: 'linear-gradient(135deg, #241a52 0%, #14102e 55%, #0d0d0d 100%)',
            boxShadow: '0 0 0 1px rgba(124,92,255,0.15), 0 16px 60px rgba(124,92,255,0.28)',
          }}
        >
          {HERO.statement.map((para, i) => (
            <p
              key={i}
              style={{
                margin: i === 0 ? 0 : 'clamp(16px, 2.5vw, 24px) 0 0',
                fontSize: i === 0 ? 'clamp(21px, 3.6vw, 32px)' : 'clamp(18px, 2.7vw, 24px)',
                fontWeight: i === 0 ? 700 : 600, lineHeight: 1.38, letterSpacing: '-0.01em',
                color: i === 0 ? '#fff' : '#e4dcff',
              }}
            >
              {para.map((seg, j) =>
                seg.hl ? (
                  <span key={j} style={{ color: C.lp, background: 'rgba(124,92,255,0.22)', borderRadius: 4, padding: '0 4px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
                    {seg.t}
                  </span>
                ) : (
                  <React.Fragment key={j}>{seg.t}</React.Fragment>
                ),
              )}
            </p>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Cta href={BUSINESS_HIRE_AGENCY_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
          {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
        </div>

        <ReportVsSharedView />

        {/* 2 · FEELINGS */}
        <Section
          label="What paying for marketing feels like right now"
          title="You’re paying for work you can’t fully see"
          sub="If you own or run a business and you’ve hired an agency or marketer, some of these thoughts probably sound familiar:"
        >
          <div style={grid(300)}>
            {THOUGHTS.map((q) => (
              <div key={q} style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 10, padding: '14px 16px', fontSize: 15, lineHeight: 1.45 }}>
                {q}
              </div>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700 }}>
            Hiring an agency isn’t the problem. The problem is not having a clear, shared way to see, measure and discuss
            what the work is producing.
          </p>
        </Section>

        {/* 3 · PAIN: how collaboration breaks down */}
        <Section
          label="Where collaboration breaks down"
          title="Three ways a marketing relationship goes wrong"
          sub="Even when nobody is acting in bad faith, a lack of shared visibility lets problems build quietly:"
        >
          <div style={grid(250)}>
            {BREAKDOWNS.map((s, i) => (
              <Card key={s.t} title={s.t} num={`Pattern · 0${i + 1}`}>{s.b}</Card>
            ))}
          </div>
          <div style={{ ...grid(250), marginTop: 20 }}>
            {COSTS.map((c) => (
              <Card key={c.t} title={c.t}>{c.b}</Card>
            ))}
          </div>
          <Callout>
            You shouldn’t have to rely entirely on what your marketers choose to show you.
          </Callout>
        </Section>

        {/* 4 · KPIs */}
        <Section
          label="Beyond “make me more money”"
          title="Revenue is the goal. It isn’t a plan for getting there."
          sub="Most owners know they want more revenue. Few have a clear way to translate that into what the marketing should achieve at each stage. Without it, the agency reports activity and you ask about revenue. Here are the questions that connect the two:"
        >
          <FunnelTable />
          <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, margin: '12px 0 0', maxWidth: 700 }}>
            Some of what matters, like brand fit and the quality of the ideas, doesn’t show up as a number. VSTRK gives you
            evidence to weigh alongside your own judgment, not a verdict.
          </p>
        </Section>

        {/* 5 · TRANSPARENT RELATIONSHIP */}
        <Section
          label="A fairer way to work together"
          title="This isn’t about monitoring your team"
          sub="It’s about creating a more transparent working relationship, where you and your marketers look at the same data and work out what to do next."
        >
          <div style={grid(260)}>
            {RELATIONSHIP.map((r) => (
              <Card key={r.t} title={r.t} accent={C.purple}>{r.b}</Card>
            ))}
          </div>
          <Callout>
            Good agencies benefit too. Clear results make it easier to show their value, and easier for you to trust it.
          </Callout>
        </Section>

        {/* 6 · SOLUTION */}
        <Section
          label="Introducing VSTRK"
          title="See what your marketing investment is actually producing"
          sub="VSTRK connects and compares content performance, conversion events, revenue and customer journeys across nine social and content platforms, at the individual content and campaign levels, and over time."
        >
          <div style={grid(400)}>
            {SOLUTION_STEPS.map((s, i) => (
              <Card key={s.t} title={s.t} num={`Step ${i + 1}`}>{s.b}</Card>
            ))}
          </div>
          <Callout>A clearer, shared view of what drives your marketing results.</Callout>
        </Section>

        {/* 7 · WHAT BECOMES POSSIBLE */}
        <Section
          label="What becomes possible"
          title="Stop guessing where your marketing money is going. Start asking better questions."
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
            VSTRK shows what the available data connects. It doesn’t promise that every campaign will become profitable. The
            goal is better information, so you can see what’s happening and decide what to do about it.
          </p>
        </Section>

        {/* 8 · REPLICATE */}
        <Section
          label="Build on what works"
          title="You paid for the work. Learn from it."
          sub="When something works, you want to understand why and apply it to more of your business, instead of paying to rediscover it. Once you can see what’s working, you can:"
        >
          <div style={grid(260)}>
            {REPLICATE.map((r) => (
              <Card key={r.t} title={r.t}>{r.b}</Card>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, margin: '16px 0 0', maxWidth: 700 }}>
            What you can reuse depends on your agreement, including who owns the content. Check your contract and talk with your
            team.
          </p>
        </Section>

        {/* 9 · RUN IT */}
        <Section
          label="Working with VSTRK"
          title="What it looks like with your marketing team"
          sub="These are suggestions for how a business might use it. You decide the metrics, the rhythm and the rules with your team."
        >
          <div style={grid(260)}>
            {RUN_PHASES.map((ph, i) => (
              <div key={ph.t} style={{ background: C.card, border: `0.5px solid ${i === 1 ? C.purple : C.line}`, borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontWeight: 600, fontSize: 15.5, marginBottom: 10 }}>{ph.t}</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                  {ph.items.map((it) => (
                    <li key={it} style={{ display: 'flex', gap: 10, color: C.mut, fontSize: 14, lineHeight: 1.55 }}>
                      <span aria-hidden="true" style={{ color: C.lp, flex: 'none' }}>•</span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Cta href={BUSINESS_HIRE_AGENCY_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
            {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
          </div>
        </Section>

        {/* 10 · DEMO */}
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

        {/* 11 · WHO IT'S FOR */}
        <Section
          label="Who VSTRK is for"
          title="Business owners who want to know what their marketing money is doing"
          sub="It’s especially relevant if:"
        >
          <CheckList items={AUDIENCE} />
        </Section>

        {/* 12 · WHAT IT'S NOT */}
        <Section
          label="What VSTRK isn’t"
          title="Clear expectations, from the start"
          sub="Being open about the limits is part of the point."
        >
          <div style={grid(250)}>
            {NOT_THIS.map((n) => (
              <Card key={n.t} title={n.t}>{n.b}</Card>
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
            Stop guessing where your marketing money is going.
          </h2>
          <p style={{ color: C.mut, fontSize: 16, lineHeight: 1.65, margin: '14px auto 24px', maxWidth: 600 }}>
            If you’re paying agencies or marketers and want a clearer, shared view of what they deliver, explore how VSTRK can
            help you and your team measure results and decide what to improve, repeat or scale.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            <Cta href={BUSINESS_HIRE_AGENCY_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
            {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
          </div>
          <p style={{ ...mono(C.mut, 11), margin: '24px 0 0' }}>VSTRK — See what your marketing investment is actually delivering.</p>
        </section>
      </div>
    </div>
  );
}