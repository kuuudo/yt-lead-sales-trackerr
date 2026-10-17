// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/interviewmarketers/InterviewLandingPage.tsx
// ─────────────────────────────────────────────────────────────────────────
// Landing page for companies hiring marketing talent. One component, two places:
//   • standalone, public route  /2x                → <InterviewLandingPage />
//   • inside the Demo, "Landing Page" tab (/insights/2u) → <InterviewLandingPage embedded />
//
// Presentation only: no Supabase, auth, router or user context, so it is
// safe for logged-out visitors. Visual language mirrors the sponsor landing page.
//
// The hook and the positioning formula are LOCKED and live in
// interviewDemoConfig.ts (LOCKED_HOOK / LOCKED_FORMULA). Everything else
// below is free copy and can be edited section by section.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  INTERVIEW_DEMO_WHATSAPP_URL,
  INTERVIEW_LANDING_CONTENT,
  LOCKED_FORMULA,
  LOCKED_FORMULA_HIGHLIGHTS,
  LOCKED_HOOK,
} from './interviewDemoConfig';

/** Public Demo route (kept in sync with INTERVIEW_DEMO_PATHS in App.tsx). */
const DEMO_HREF = '/insights/2u';

const C = {
  bg: '#000', panel: '#0d0d0d', card: '#141414', line: '#222', text: '#f2f2f2', mut: '#9a9a9a',
  red: '#e11d1d', purple: '#7c5cff', lp: '#b7a6ff', green: '#22c55e', amber: '#e0b04a',
};
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

const mono = (color = C.mut, size = 11): React.CSSProperties => ({
  fontFamily: MONO, fontSize: size, color, letterSpacing: '0.12em', textTransform: 'uppercase',
});

/* ───────────────────────────── CONTENT (free copy) ───────────────────────────── */

const PAPER_SIGNALS = [
  { t: 'Résumés show claims', b: 'A polished page tells you what someone says they did, in a market that looked different a year ago.' },
  { t: 'Interviews reward talking', b: 'The best talker in the room and the best marketer for your product are not always the same person.' },
  { t: 'Past results are hard to compare', b: 'Different products, budgets and audiences make last year’s wins difficult to judge — or to repeat.' },
];

const CHALLENGE_STEPS = [
  { t: 'Choose a real product', b: 'Select the actual product, offer, or website your company wants to promote.' },
  { t: 'Give candidates the same challenge', b: 'Create a comparable starting point for participating candidates. Explain the campaign objective and let them decide how to approach it.' },
  { t: 'Let them market it their way', b: 'Candidates create and distribute their own promotional content on supported platforms, using their own creativity and judgment.' },
  { t: 'Track what happens', b: 'VSTRK shows the promotional activity, available performance signals, and attributable conversions and revenue over time.' },
  { t: 'Hire with more evidence', b: 'Compare execution and outcomes, review the ideas behind them, and choose the talent that best fits your business.' },
];

const DISCOVERIES = [
  'Who brings original ideas and executes them well.',
  'Who finds and uses effective promotional approaches.',
  'Who generates meaningful traffic, engagement, conversions, and attributable revenue — where those metrics are available.',
  'Who shows promising results over time, not just on day one.',
  'Whose working style and creativity fit what your team needs.',
  'Which marketing approaches are worth repeating after you hire.',
];

const MECHANISM = [
  { t: 'One destination becomes a trackable asset', b: 'Your product page, offer, or website URL is set up in VSTRK as an asset you can hand to every candidate.' },
  { t: 'Every candidate promotes it independently', b: 'Each candidate works from the same asset and promotes it through their own content and channels, including YouTube, TikTok, Instagram, X, and LinkedIn.' },
  { t: 'Results stay attached to the person', b: 'Promotional activity, available performance signals, and attributable conversions and revenue are connected back to each candidate, so you can compare them side by side.' },
];

const DEMO_EXAMPLES = [
  { t: 'One asset, many candidates', b: 'A single promotional asset shared with several marketers, each promoting it in their own way.' },
  { t: 'Compare what each one produced', b: 'Clicks, conversions and revenue associated with each person’s content, side by side.' },
  { t: 'See how results develop over time', b: 'Follow how a promotion performs after the first post, not just on launch day.' },
];

const AUDIENCE = [
  'You’re hiring your first marketing employee and can’t easily judge the work yourself.',
  'You’re building or expanding an in-house marketing team.',
  'One marketing role is attracting hundreds of applications.',
  'Candidates interview well, and you’re not sure they can deliver.',
  'You want to see how people think and work on your actual product.',
  'You’d like evidence to weigh alongside your own judgment and your sense of team fit.',
];


const SCENARIOS = [
  { t: 'The great interview', b: 'A candidate answers every question perfectly and has a strong résumé. Once hired, the campaigns they run don’t move the needle.' },
  { t: 'The overlooked one', b: 'Another candidate interviews quietly and has a thinner résumé. With a real product in hand, they would have found an angle nobody else tried.' },
  { t: 'Last year’s playbook', b: 'A third candidate’s best results came from tactics that suited last year’s platforms and audiences. You can’t tell whether those tactics work now.' },
];

const COSTS = [
  { t: 'Salary and time', b: 'Months of pay and onboarding go to someone who turns out not to be the right fit.' },
  { t: 'Lost momentum', b: 'Campaigns, budget and attention are spent learning what you could have seen before you hired.' },
  { t: 'Starting over', b: 'You reopen the role and sift through another pile of applications from scratch.' },
];

const THOUGHTS = [
  'Which of these hundred applicants is actually good?',
  'I’m not a marketer myself. How do I judge the work?',
  'Their last company’s results may not carry over to our product.',
  'If I get this hire wrong, we lose months.',
  'Everyone says they use AI now. What does that actually mean?',
  'I don’t want to overlook the person who would have been great.',
];

const SCORECARD = [
  { d: 'Creativity', w: 'The ideas and angles they chose for your product', s: 'Their content' },
  { d: 'Execution', w: 'How well and how consistently they published', s: 'Their content' },
  { d: 'Reach and engagement', w: 'Traffic and engagement signals the platforms make available', s: 'Platform data' },
  { d: 'Conversions', w: 'Conversion events attributable to their promotion', s: 'VSTRK tracking' },
  { d: 'Revenue', w: 'Attributable revenue, where it is available', s: 'VSTRK tracking' },
  { d: 'Momentum over time', w: 'Whether results build, hold or fade', s: 'VSTRK tracking' },
  { d: 'Team fit', w: 'How they communicate, take direction and collaborate', s: 'Your judgment' },
];

const RUN_PHASES = [
  { t: 'Before you start', items: [
    'Pick the product, offer or website you want promoted.',
    'Decide what a good result looks like for your business.',
    'Write one short brief that every candidate receives.',
    'Set the timeframe and rules, and tell candidates what you’ll evaluate.',
  ] },
  { t: 'While it runs', items: [
    'Share the same asset with every participating candidate.',
    'Let them choose their own approach and platforms.',
    'Answer questions, but don’t steer their strategy.',
    'Watch activity and results build up in VSTRK.',
  ] },
  { t: 'When it ends', items: [
    'Compare activity and results side by side.',
    'Look at the ideas behind the numbers.',
    'Talk to your top candidates about what they did and why.',
    'Decide using the evidence together with your own judgment.',
  ] },
];

const FORMATS = [
  { t: 'A shortlist challenge', b: 'Run it with a handful of finalists after your first screening.' },
  { t: 'An open competition', b: 'Invite a wider group to surface talent a résumé screen might have filtered out.' },
  { t: 'A final-round challenge', b: 'Use it as the last step between two or three finalists.' },
];

const FAQ = [
  { q: 'Will strong candidates take part in something like this?', a: 'Some will and some won’t. It tends to go better when the task is clearly scoped, the timeframe is reasonable, the rules are explained up front, and candidates understand what they get from taking part. Think about whether and how to compensate participants.' },
  { q: 'Is it fine to have candidates promote a real product?', a: 'Rules about trial work, unpaid work and promotions differ by country and by how a challenge is run. Check with a legal or HR adviser before you start. VSTRK can’t give legal advice.' },
  { q: 'Does the candidate with the most revenue win?', a: 'No. Revenue is one signal among several. Use it alongside the quality of the ideas, the consistency of the work, and how well the person fits your team.' },
  { q: 'What if a platform doesn’t provide some of the data?', a: 'VSTRK shows what connected platforms and tracking make available. If a metric isn’t available, it isn’t shown, and you judge on the rest.' },
  { q: 'Do I need to be a marketer to judge the results?', a: 'It helps to have someone who can review the ideas. The tracked results give you a shared, concrete starting point for that conversation.' },
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

/** Renders `text` verbatim, wrapping any listed phrases in a highlight span. Never alters the text. */
function withHighlights(text: string, phrases: string[]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  let k = 0;
  for (const p of phrases) {
    const at = rest.indexOf(p);
    if (at === -1) continue;
    if (at > 0) out.push(<React.Fragment key={k++}>{rest.slice(0, at)}</React.Fragment>);
    out.push(
      <span
        key={k++}
        style={{ color: C.lp, background: 'rgba(124,92,255,0.22)', borderRadius: 4, padding: '0 4px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
      >
        {p}
      </span>,
    );
    rest = rest.slice(at + p.length);
  }
  if (rest) out.push(<React.Fragment key={k++}>{rest}</React.Fragment>);
  return out;
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

function Scorecard() {
  const cell: React.CSSProperties = { padding: '11px 14px', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, lineHeight: 1.5, textAlign: 'left', verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto', background: C.panel, border: `0.5px solid ${C.line}`, borderRadius: 12 }}>
      <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['What to compare', 'What you look at', 'Where it comes from'].map((h) => (
              <th key={h} scope="col" style={{ ...cell, ...mono(C.lp, 10.5), fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCORECARD.map((r) => (
            <tr key={r.d}>
              <th scope="row" style={{ ...cell, fontWeight: 600 }}>{r.d}</th>
              <td style={{ ...cell, color: C.mut }}>{r.w}</td>
              <td style={{ ...cell, color: r.s === 'Your judgment' ? C.amber : C.lp }}>{r.s}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Hiring on paper vs. hiring with a live challenge. Illustrative — labelled as such. */
function PaperVsChallenge() {
  const panel: React.CSSProperties = { background: C.panel, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' };
  return (
    <div style={{ ...grid(300), marginTop: 36 }}>
      <div style={panel}>
        <div style={{ ...mono(C.amber), marginBottom: 12 }}>Hiring on paper</div>
        <Node>Hundreds of applications</Node>
        <Down />
        <Node tone="warn">Résumés, degrees, portfolios</Node>
        <Down />
        <Node tone="warn">Interviews and claims about past results</Node>
        <Down color={C.amber} />
        <Node tone="warn">A decision based on what people say</Node>
      </div>
      <div style={{ ...panel, borderColor: C.purple }}>
        <div style={{ ...mono(C.lp), marginBottom: 12 }}>Hiring with a real challenge</div>
        <Node>One real product or offer</Node>
        <Down />
        <Node tone="accent">Same asset given to every candidate</Node>
        <Down />
        <Node tone="accent">Each candidate promotes it their own way</Node>
        <Down color={C.purple} />
        <Node tone="accent">Activity and results tracked per candidate</Node>
      </div>
      <div style={{ ...mono(C.amber, 10), gridColumn: '1 / -1' }}>Illustration of the workflow — not real customer data</div>
    </div>
  );
}

/* ───────────────────────────── PAGE ───────────────────────────── */

export default function InterviewLandingPage({ embedded = false }: { embedded?: boolean }) {
  const waLabel = INTERVIEW_LANDING_CONTENT.ctaLabel || 'Contact VSTRK on WhatsApp';
  const [hookIntro, hookQuestion, hookRisk] = LOCKED_HOOK.paragraphs;
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
            href={INTERVIEW_DEMO_WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
            style={{ ...mono(C.lp, 10.5), fontWeight: 700, textDecoration: 'none' }}
          >
            Contact on WhatsApp →
          </a>
        </header>
      )}

      <div style={{ maxWidth: 940, margin: '0 auto', padding: embedded ? '40px 20px 56px' : '56px 20px 72px' }}>
        {/* 1 · HOOK (locked copy) */}
        <div style={{ ...mono(C.red), marginBottom: 14 }}>{LOCKED_HOOK.eyebrow}</div>
        <h1 style={{ fontSize: 'clamp(30px, 6vw, 52px)', fontWeight: 700, lineHeight: 1.08, margin: 0, maxWidth: 800 }}>
          {LOCKED_HOOK.headline}
        </h1>
        <p style={body()}>{hookIntro}</p>
        <p style={body({ color: C.text, fontWeight: 600 })}>{hookQuestion}</p>
        <p style={body()}>{hookRisk}</p>

        {/* 1b · FORMULA (locked copy) */}
        <div
          style={{
            margin: '36px 0 32px', padding: 'clamp(22px, 4.5vw, 44px)', borderRadius: 18,
            border: `1.5px solid ${C.purple}`, borderLeftWidth: 6,
            background: 'linear-gradient(135deg, #241a52 0%, #14102e 55%, #0d0d0d 100%)',
            boxShadow: '0 0 0 1px rgba(124,92,255,0.15), 0 16px 60px rgba(124,92,255,0.28)',
          }}
        >
          {LOCKED_FORMULA.map((para, i) => (
            <p
              key={i}
              style={{
                margin: i === 0 ? 0 : 'clamp(16px, 2.5vw, 24px) 0 0',
                fontSize: i === 0 ? 'clamp(21px, 3.6vw, 32px)' : 'clamp(18px, 2.7vw, 24px)',
                fontWeight: i === 0 ? 700 : 600, lineHeight: 1.38, letterSpacing: '-0.01em',
                color: i === 0 ? '#fff' : '#e4dcff',
              }}
            >
              {withHighlights(para, LOCKED_FORMULA_HIGHLIGHTS[i] ?? [])}
            </p>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Cta href={INTERVIEW_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
          {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
        </div>

        <PaperVsChallenge />

        {/* 2 · PAIN: why paper isn't enough */}
        <Section
          label="Why paper isn’t enough"
          title="Résumés show claims. A real challenge shows execution."
          sub="Traditional hiring judges marketers through résumés, interviews, portfolios and previous results. But marketing moves quickly, and previous success doesn’t automatically prove someone can produce results today."
        >
          <div style={grid(250)}>
            {PAPER_SIGNALS.map((s) => (
              <Card key={s.t} title={s.t}>{s.b}</Card>
            ))}
          </div>
        </Section>

        {/* 2b · PAIN: story */}
        <Section
          label="The problem"
          title="Three candidates. One shortlist. Very different outcomes."
          sub="Imagine three people who all look strong on paper:"
        >
          <div style={grid(250)}>
            {SCENARIOS.map((s, i) => (
              <Card key={s.t} title={s.t} num={`Imagine · 0${i + 1}`}>{s.b}</Card>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 680 }}>
            With only paper and conversation to go on, all three can look equally convincing. You may not find out which one can
            deliver until months after the decision is made.
          </p>
          <div style={{ ...grid(250), marginTop: 20 }}>
            {COSTS.map((c) => (
              <Card key={c.t} title={c.t}>{c.b}</Card>
            ))}
          </div>
          <Callout>Stop guessing which candidates understand modern marketing. Watch them do it.</Callout>
        </Section>

        {/* 3 · FEELINGS */}
        <Section
          label="What hiring a marketer feels like right now"
          title="You’re being asked to judge work you can’t see yet"
          sub="If you’re the founder, hiring manager or marketing lead making this call, some of these questions probably sound familiar:"
        >
          <div style={grid(300)}>
            {THOUGHTS.map((q) => (
              <div key={q} style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 10, padding: '14px 16px', fontSize: 15, lineHeight: 1.45 }}>
                {q}
              </div>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700 }}>
            None of that is a sign you’re hiring badly. It’s what happens when the market changes faster than the tools we use to
            evaluate people. A challenge built on your own product gives you something concrete to look at instead.
          </p>
        </Section>

        {/* 4 · THE IDEA */}
        <Section
          label="A different way to hire"
          title="Turn the hiring process into a real-world marketing competition"
          sub="Instead of asking candidates to describe what they would do, give them an actual product and see what they do with it."
        >
          <div style={grid(280)}>
            {CHALLENGE_STEPS.map((s, i) => (
              <Card key={s.t} title={s.t} num={`Step ${i + 1}`} accent={i === 3 ? C.purple : undefined}>{s.b}</Card>
            ))}
          </div>
        </Section>

        {/* 5 · WHAT YOU CAN LEARN + COMPARE */}
        <Section
          label="What you can learn"
          title="See how each candidate actually approaches your product"
          sub="You’ll have real work to look at, not just a conversation about it. Over the course of the challenge, you can see:"
        >
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {DISCOVERIES.map((d) => (
              <li key={d} style={{ display: 'flex', gap: 12, fontSize: 15.5, lineHeight: 1.55 }}>
                <span aria-hidden="true" style={{ color: C.green, fontWeight: 700, flex: 'none' }}>✓</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 28 }}>
            <Scorecard />
          </div>
          <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, margin: '12px 0 0', maxWidth: 700 }}>
            Some of what matters most, like creativity and team fit, doesn’t show up as a number. That’s why VSTRK gives you
            evidence to weigh, not a verdict.
          </p>
          <Callout>
            Revenue alone doesn’t decide who the best marketer is. The goal is more useful evidence to combine with your own
            judgment, your interviews, and your read on team fit.
          </Callout>
        </Section>

        {/* 6 · MECHANISM */}
        <Section
          label="How VSTRK makes it trackable"
          title="One destination, many candidates, results that stay attached to each person"
          sub="VSTRK turns the page you want to promote into a trackable asset, so every candidate starts from the same place."
        >
          <div style={grid(260)}>
            {MECHANISM.map((m) => (
              <Card key={m.t} title={m.t} accent={C.purple}>{m.b}</Card>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, margin: '16px 0 0', maxWidth: 700 }}>
            VSTRK reports the activity and performance data that connected platforms make available. It doesn’t guarantee a
            successful hire, predict future performance, or show metrics a platform doesn’t provide.
          </p>
        </Section>

        {/* 7 · RUN IT */}
        <Section
          label="Running a challenge"
          title="What it looks like from start to finish"
          sub="These are suggestions for how a company might run one. You decide the scope, the timeframe and the rules."
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
        </Section>

        {/* 7b · FORMATS */}
        <Section
          label="Ways to use it"
          title="Fit the challenge to the role you’re hiring for"
          sub="There isn’t one right format. Companies might choose to run it:"
        >
          <div style={grid(250)}>
            {FORMATS.map((f) => (
              <Card key={f.t} title={f.t}>{f.b}</Card>
            ))}
          </div>
          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Cta href={INTERVIEW_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
            {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
          </div>
        </Section>

        {/* 6 · DEMO */}
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

        {/* 7 · WHO IT'S FOR */}
        <Section
          label="Who this is for"
          title="Founders, hiring managers and marketing leads who want proof before they commit"
          sub="It’s especially relevant if:"
        >
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {AUDIENCE.map((a) => (
              <li key={a} style={{ display: 'flex', gap: 12, fontSize: 15.5, lineHeight: 1.55 }}>
                <span aria-hidden="true" style={{ color: C.green, fontWeight: 700, flex: 'none' }}>✓</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 8 · OBJECTIONS */}
        <Section label="Questions you may have" title="Honest answers before you decide">
          <Faq items={FAQ} />
        </Section>

        {/* 9 · NEXT STEPS */}
        <section
          style={{
            marginTop: 96, background: C.panel, border: `1px solid ${C.purple}`, borderRadius: 16,
            padding: 'clamp(24px, 5vw, 44px)', textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 700, lineHeight: 1.15, margin: 0 }}>
            Before you hire, see how they market a real product.
          </h2>
          <p style={{ color: C.mut, fontSize: 16, lineHeight: 1.65, margin: '14px auto 24px', maxWidth: 600 }}>
            If you’re choosing between marketing candidates, explore how a real-product challenge and VSTRK tracking can give you
            more to base the decision on than a résumé and an interview.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            <Cta href={INTERVIEW_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
            {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
          </div>
        </section>
      </div>
    </div>
  );
}