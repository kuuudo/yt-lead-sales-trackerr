// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/businessOwner/BusinessOwnerLandingPage.tsx
// ─────────────────────────────────────────────────────────────────────────
// Landing page for business owners who invest time and money in content and
// online marketing. One component, two places:
//   • standalone, public route  /3b        → <BusinessOwnerLandingPage />
//   • inside the Demo, "Landing Page" tab (/insights/3o) → <BusinessOwnerLandingPage embedded />
//
// Presentation only: no Supabase, auth, router or user context, so it is
// safe for logged-out visitors. Visual language mirrors the sponsor and
// agency landing pages.
//
// The HERO block (eyebrow, headline, paragraphs, formula, closing line) is
// exact copy supplied by the founder. Do not reword it. Everything below the
// hero is first-draft copy and can be edited section by section without
// touching layout code.
// No testimonials, statistics or case studies are used. Illustrations are
// labelled as such.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { BUSINESS_OWNER_DEMO_WHATSAPP_URL, BUSINESS_OWNER_LANDING_CONTENT } from './businessOwnerDemoConfig';

/** Public Demo route (kept in sync with BUSINESS_OWNER_DEMO_PATHS in App.tsx). */
const DEMO_HREF = '/insights/3o';

const C = {
  bg: '#000', panel: '#0d0d0d', card: '#141414', line: '#222', text: '#f2f2f2', mut: '#9a9a9a',
  soft: '#c9c5da', red: '#e11d1d', purple: '#7c5cff', lp: '#b7a6ff', green: '#22c55e', amber: '#e0b04a',
};
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

const mono = (color = C.mut, size = 11): React.CSSProperties => ({
  fontFamily: MONO, fontSize: size, color, letterSpacing: '0.12em', textTransform: 'uppercase',
});

/* ───────────────────────────── CONTENT ───────────────────────────── */

// FOUNDER COPY — hero. Exact copy supplied by the founder. Do not reword.
const HERO = {
  eyebrow:
    'To Business Owners Consistently Generating 3,000+ Views per Piece of Content (Across YouTube, TikTok, Instagram, X, and Other Platforms) and $1,500+ in Monthly Revenue Through Content',
  headline: 'You can see your views. You can see your revenue. What you can’t see is everything in between.',
  paragraphs: [
    'You’re already attracting attention and generating revenue through content. But do you know which videos capture attention, which content educates potential customers, which builds interest and trust, and which ultimately drives conversions and sales?',
    'Without tracking customer journeys, you’re missing a significant part of the picture. You may know how much revenue your business generates, but not which content brings potential customers closer to buying, what leads them to book a consultation or make a purchase, or what works at each stage of their journey.',
    'That means you could be overlooking winning content, repeating ineffective strategies, and spending valuable time and money creating content without knowing whether it’s contributing to your business goals.',
  ],
  // Formula, split into segments only so key phrases can be highlighted (hl: true).
  statement: [
    [
      { t: 'VSTRK connects and compares content performance, conversion events, revenue, and customer journeys across ' },
      { t: 'nine social and content platforms', hl: true },
      { t: ' — across individual pieces of content, campaigns, and over time.' },
    ],
    [
      { t: 'See how people move from discovering your content to taking action. Identify ' },
      { t: 'what works at different stages of the customer journey', hl: true },
      { t: ', replicate winning strategies, and uncover opportunities you might otherwise miss.' },
    ],
  ] as { t: string; hl?: boolean }[][],
  closing:
    'Stop guessing which content deserves your time. Make more informed decisions about what to keep creating, what to improve, and what to stop — based on the marketing results you can actually track.',
};

const SITUATIONS = [
  { t: 'You’ve been at this for years', q: '“I know how this works. Why does the same effort return less than it used to?”', b: 'Algorithms and habits change. Without tracking, you can’t tell which parts of your routine still contribute and which just take your time.' },
  { t: 'You have a funnel, but it’s a black box', q: '“People sign up, book and buy. I just don’t know what they watched first.”', b: 'Newsletter, lead magnet, sales page, consultation, purchase. You see each step, but not which content fed it.' },
  { t: 'You pay others to make or promote content', q: '“The report looks fine. What did it actually do for the business?”', b: 'Employees, contractors, agencies. You get activity numbers, and you can’t independently judge the business impact.' },
  { t: 'You’re spread across several platforms', q: '“Is YouTube worth the hours, or is it LinkedIn doing the work?”', b: 'Every platform has its own dashboard and none of them show what happens after the click.' },
  { t: 'You’ve followed the experts', q: '“Everyone says this works. How do I know it works for me?”', b: 'Courses and playbooks come from other people’s businesses. Your own results are the only evidence that counts for yours.' },
];

const SCENARIOS = [
  { t: 'Lots of views, nothing follows', b: 'A video does well, and nobody joins your list or visits your sales page.' },
  { t: 'Few views, real follow-through', b: 'A smaller post sends a handful of people to your sales page, and one books a consultation.' },
  { t: 'The quiet first touch', b: 'A post with three likes is the first thing someone saw. Weeks later, after other content, they buy.' },
];

const CURRENT_TOOLS = [
  { t: 'Platform analytics', b: 'Tell you how many people watched, liked or clicked on that platform.' },
  { t: 'Your sales and payment records', b: 'Tell you how much money came in, and not what led to it.' },
  { t: 'Newsletter and booking tools', b: 'Tell you who signed up or booked, and not which content brought them.' },
  { t: 'A spreadsheet', b: 'Lets you stitch it together by hand, until it becomes a job in itself.' },
];

const STEPS = [
  { t: 'Connect your platforms', b: 'Bring content performance from the supported platforms into one place, including YouTube, TikTok, Instagram, X, and LinkedIn.' },
  { t: 'Track the steps that matter', b: 'Set up conversion events for the actions in your funnel: newsletter sign-ups, sales page visits, bookings, consultations, purchases.' },
  { t: 'See content next to results', b: 'Look at individual content and campaigns alongside the conversions and revenue connected to them, not just views and likes.' },
  { t: 'Follow it over time', b: 'Where journey data is tracked, see how people move across several pieces of content before they convert, and whether results build, hold, or fade.' },
];

const TRACK_LEARN = [
  { track: 'Content performance across platforms', learn: 'Which content gets attention, and where' },
  { track: 'Conversion events you set up', learn: 'Which content is connected to sign-ups, visits, bookings and purchases' },
  { track: 'Revenue', learn: 'Which content and campaigns are associated with sales' },
  { track: 'Customer journeys, where tracked', learn: 'Whether quiet content appears early in paths that end in a sale' },
  { track: 'Results month by month', learn: 'What is building, what is holding, what is fading' },
];

const QUESTIONS = [
  'Which content leads to newsletter sign-ups?',
  'Which content attracts attention but doesn’t convert?',
  'Which content shows up in journeys that end in a sale?',
  'Which platform is worth the hours I put in?',
  'Is what I pay for producing results I can see?',
  'Does the advice I’ve been following work for my business?',
  'Where are results slipping compared with earlier months?',
  'What should I keep, change, scale or stop?',
];

const DECISIONS = [
  { t: 'Keep', b: 'Content that shows up in conversions, even if its likes look modest.' },
  { t: 'Fix', b: 'Content that attracts attention but loses people before the next step.' },
  { t: 'Scale', b: 'Formats and platforms connected to the results you want more of.' },
  { t: 'Stop', b: 'Effort with no visible link to your funnel, so you can reclaim the time.' },
];

const DEMO_EXAMPLES = [
  { t: 'Content, conversions and revenue together', b: 'Performance, conversion events and revenue connected in one interface.' },
  { t: 'Compare content and campaigns', b: 'Individual pieces of content and whole campaigns, side by side and over time.' },
  { t: 'Understand the customer journey', b: 'How a customer can interact with several pieces of content before converting.' },
];

const AUDIENCE = [
  'You publish content regularly to attract customers, leads or subscribers.',
  'You have something to sell or book: a product, course, service, consultation or membership.',
  'You can see views and revenue, but not what connects them.',
  'You’ve been doing this long enough that “just post more” no longer feels like an answer.',
  'You use more than one platform, or pay someone to help.',
  'You want to decide from your own results, not someone else’s playbook.',
];

const FAQ = [
  { q: 'Does VSTRK prove which post caused a sale?', a: 'No. It shows which tracked content, conversion events and revenue are connected, and how journeys unfold where they’re tracked. That’s evidence for your decisions, not proof of cause.' },
  { q: 'Do I need a full funnel to use it?', a: 'No. It’s most useful when you have at least one step after the content, such as a newsletter, a booking page or a checkout. The more steps you track, the more you can see.' },
  { q: 'Does it need to be a certain size of business?', a: 'No. It’s relevant if you’re already investing time or money in content and want to know what it produces.' },
  { q: 'What if a platform doesn’t provide some of the data?', a: 'VSTRK shows what connected platforms and your tracking make available. If something isn’t tracked or connected, it isn’t shown.' },
  { q: 'Will it tell me what content to make or fix my offer?', a: 'No. It shows what’s happening. Your offer, pricing, audience and ideas still matter, and the decisions stay yours.' },
  { q: 'I already look at platform analytics. Why isn’t that enough?', a: 'They show what happens on each platform. VSTRK is built to connect that to the conversions and revenue that follow, in one place.' },
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
    <p style={{ margin: '28px 0 0', padding: '18px 20px', borderLeft: `3px solid ${C.purple}`, background: C.panel, borderRadius: '0 10px 10px 0', fontSize: 17, fontWeight: 600, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

function Node({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'accent' | 'warn' }) {
  const border = tone === 'accent' ? C.purple : tone === 'warn' ? C.amber : '#2a2a2a';
  return (
    <div style={{ background: tone === 'accent' ? '#1a1538' : C.card, border: `1px solid ${border}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, textAlign: 'center', lineHeight: 1.4 }}>
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

/** What VSTRK tracks vs. what the owner can learn from it. */
function TrackLearnTable() {
  const cell: React.CSSProperties = { padding: '11px 14px', borderBottom: `0.5px solid ${C.line}`, fontSize: 14, lineHeight: 1.5, textAlign: 'left', verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto', background: C.panel, border: `0.5px solid ${C.line}`, borderRadius: 12 }}>
      <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['What VSTRK tracks', 'What you can learn from it'].map((h) => (
              <th key={h} scope="col" style={{ ...cell, ...mono(C.lp, 10.5), fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TRACK_LEARN.map((r) => (
            <tr key={r.track}>
              <th scope="row" style={{ ...cell, fontWeight: 600 }}>{r.track}</th>
              <td style={{ ...cell, color: C.mut }}>{r.learn}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Two ends visible vs. the connected path. Purely illustrative, labelled as such. */
function GapIllustration() {
  const panel: React.CSSProperties = { background: C.panel, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' };
  return (
    <div style={{ ...grid(300), marginTop: 36 }}>
      <div style={panel}>
        <div style={{ ...mono(C.amber), marginBottom: 12 }}>What you see today</div>
        <Node>Views, likes, comments</Node>
        <Down />
        <Node tone="warn">Everything in between: ?</Node>
        <Down color={C.amber} />
        <Node>Revenue</Node>
      </div>
      <div style={{ ...panel, borderColor: C.purple }}>
        <div style={{ ...mono(C.lp), marginBottom: 12 }}>What VSTRK connects</div>
        <Node>A video is published</Node>
        <Down />
        <Node tone="accent">A viewer signs up for your newsletter</Node>
        <Down />
        <Node tone="accent">Visits your sales page, books a consultation</Node>
        <Down color={C.purple} />
        <Node tone="accent">Purchases</Node>
      </div>
      <div style={{ ...mono(C.amber, 10), gridColumn: '1 / -1' }}>Illustration of a possible journey, not real customer data</div>
    </div>
  );
}

/* ───────────────────────────── PAGE ───────────────────────────── */

export default function BusinessOwnerLandingPage({ embedded = false }: { embedded?: boolean }) {
  const waLabel = BUSINESS_OWNER_LANDING_CONTENT.ctaLabel || 'Contact VSTRK on WhatsApp';
  const body = (extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize: 'clamp(16px, 2.2vw, 19px)', color: C.soft, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700, ...extra,
  });
  const note: React.CSSProperties = { color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700 };

  return (
    <div style={{ width: '100%', background: C.bg, color: C.text, fontFamily: SANS, minHeight: embedded ? undefined : '100vh', WebkitFontSmoothing: 'antialiased' }}>
      {!embedded && (
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: `0.5px solid ${C.line}` }}>
          <span style={{ fontWeight: 800, letterSpacing: '0.18em', fontSize: 15 }}>VSTRK</span>
          <a href={BUSINESS_OWNER_DEMO_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ ...mono(C.lp, 10.5), fontWeight: 700, textDecoration: 'none' }}>
            Contact on WhatsApp →
          </a>
        </header>
      )}

      <div style={{ maxWidth: 940, margin: '0 auto', padding: embedded ? '40px 20px 56px' : '56px 20px 72px' }}>
        {/* 1 · HERO (founder copy) */}
        <div style={{ ...mono(C.red), marginBottom: 14 }}>{HERO.eyebrow}</div>
        <h1 style={{ fontSize: 'clamp(30px, 6vw, 52px)', fontWeight: 700, lineHeight: 1.08, margin: 0, maxWidth: 820 }}>{HERO.headline}</h1>
        {HERO.paragraphs.map((t) => (
          <p key={t} style={body()}>{t}</p>
        ))}

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
                fontWeight: i === 0 ? 700 : 600, lineHeight: 1.38, letterSpacing: '-0.01em', color: i === 0 ? '#fff' : '#e4dcff',
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
        <p style={body({ color: C.text, fontWeight: 600, margin: '0 0 28px' })}>{HERO.closing}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Cta href={BUSINESS_OWNER_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
          {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
        </div>

        <GapIllustration />

        {/* 2 · RECOGNITION: the different situations, one shared gap */}
        <Section
          label="Where you might be standing"
          title="Different starting points. The same blind spot."
          sub="You don’t need to be a beginner to feel this. Most owners who recognise it have been marketing for a while. Which of these sounds like you?"
        >
          <div style={grid(280)}>
            {SITUATIONS.map((s) => (
              <Card key={s.t} title={s.t}>
                <div style={{ color: C.soft, fontStyle: 'italic', marginBottom: 8 }}>{s.q}</div>
                {s.b}
              </Card>
            ))}
          </div>
          <Callout>Whatever your situation, the question underneath is the same: what is my effort actually producing?</Callout>
        </Section>

        {/* 3 · THE INVISIBLE MIDDLE */}
        <Section
          label="Why likes can mislead"
          title="Engagement doesn’t tell you what a post contributed"
          sub="Picture three very different outcomes. Looking at likes and comments alone, you’d probably judge them the wrong way round."
        >
          <div style={grid(250)}>
            {SCENARIOS.map((s) => (
              <Card key={s.t} title={s.t}>{s.b}</Card>
            ))}
          </div>
          <p style={note}>
            Years of effort can start to feel wasted when the only numbers you see are small ones. Sometimes it is wasted. Sometimes
            it’s working in a way those numbers can’t show. Without connecting the steps, you can’t tell which, and you may stop
            something useful or keep repeating something that isn’t.
          </p>
          <p style={{ ...note, fontSize: 14, margin: '12px 0 0' }}>
            These are illustrations, not results. Tracking shows connections, and it can’t prove that any one post caused any one sale.
          </p>
        </Section>

        {/* 4 · WHY CURRENT TOOLS FALL SHORT */}
        <Section
          label="Why what you already use isn’t enough"
          title="Each tool shows its own piece. None shows the path."
          sub="Platform analytics, payment records and booking tools are all useful. The gap is between the information they hold and the question you’re asking."
        >
          <div style={grid(220)}>
            {CURRENT_TOOLS.map((t) => (
              <Card key={t.t} title={t.t}>{t.b}</Card>
            ))}
          </div>
          <Callout>The problem isn’t that your marketing isn’t working. It’s that you may not be able to see how it works.</Callout>
        </Section>

        {/* 5 · SOLUTION */}
        <Section
          label="Introducing VSTRK"
          title="Connect what people watch to what they do next"
          sub="VSTRK connects content performance, conversion events, revenue and customer journeys across nine social and content platforms, at the individual content and campaign levels, and over time."
        >
          <div style={grid(400)}>
            {STEPS.map((s, i) => (
              <Card key={s.t} title={s.t} num={`Step ${i + 1}`}>{s.b}</Card>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <TrackLearnTable />
          </div>
          <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, margin: '12px 0 0', maxWidth: 700 }}>
            VSTRK can only show what’s tracked or connected. It doesn’t provide data that hasn’t been set up, and it doesn’t prove
            cause. What you learn depends on your tracking, and the conclusions are yours.
          </p>
        </Section>

        {/* 6 · WHAT BECOMES POSSIBLE */}
        <Section
          label="What becomes possible"
          title="Stop judging your marketing by two numbers. Start asking better questions."
          sub="With content, conversions, revenue and journeys connected, you can ask:"
        >
          <div style={grid(300)}>
            {QUESTIONS.map((q) => (
              <div key={q} style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 10, padding: '14px 16px', fontSize: 15, lineHeight: 1.45 }}>
                {q}
              </div>
            ))}
          </div>
        </Section>

        {/* 7 · DECISIONS */}
        <Section
          label="Decide from your own evidence"
          title="Keep, fix, scale or stop, based on your business"
          sub="Advice from experts is a starting point. Your own results show whether it works for you. With the connections visible, you can:"
        >
          <div style={grid(200)}>
            {DECISIONS.map((d) => (
              <Card key={d.t} title={d.t} accent={C.purple}>{d.b}</Card>
            ))}
          </div>
          <p style={note}>
            We don’t promise every piece of content is valuable or that your marketing will suddenly become profitable. The goal is
            better information, so you can see what’s happening and decide what to do about it.
          </p>
        </Section>

        {/* 8 · DEMO */}
        <Section
          label="See it in action"
          title="Don’t take our word for it. Walk through VSTRK."
          sub={embedded ? 'Use the tabs above to walk through the product, step by step. Here is what you’ll see:' : 'The interactive demo walks through the real product, step by step. Here is what you’ll see:'}
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

        {/* 9 · WHO IT'S FOR */}
        <Section
          label="Who VSTRK is for"
          title="Business owners who want to know what their content and marketing produce"
          sub="It’s especially relevant if:"
        >
          <CheckList items={AUDIENCE} />
          <p style={note}>
            You don’t need to be a large company. VSTRK isn’t a magic solution that guarantees sales, and it doesn’t replace a good
            offer, effective marketing or a reliable tracking setup.
          </p>
        </Section>

        {/* 10 · OBJECTIONS */}
        <Section label="Questions you may have" title="Honest answers before you decide">
          <Faq items={FAQ} />
        </Section>

        {/* 11 · NEXT STEPS */}
        <section style={{ marginTop: 96, background: C.panel, border: `1px solid ${C.purple}`, borderRadius: 16, padding: 'clamp(24px, 5vw, 44px)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 700, lineHeight: 1.15, margin: 0 }}>
            Don’t keep judging your marketing by what’s easiest to see.
          </h2>
          <p style={{ color: C.mut, fontSize: 16, lineHeight: 1.65, margin: '14px auto 24px', maxWidth: 600 }}>
            If you’re investing time or money in content and want a clearer picture of what happens between a view and a sale,
            explore how VSTRK can connect your content, conversions and revenue.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            <Cta href={BUSINESS_OWNER_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
            {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
          </div>
          <p style={{ ...mono(C.mut, 11), margin: '24px 0 0' }}>VSTRK — See what’s in between.</p>
        </section>
      </div>
    </div>
  );
}