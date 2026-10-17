// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/sponsor/SponsorLandingPage.tsx
// ─────────────────────────────────────────────────────────────────────────
// Sponsor landing page (VSL Version 1). One component, two places:
//   • standalone, public route  /1y            → <SponsorLandingPage />
//   • inside the Demo, "Landing Page" tab       → <SponsorLandingPage embedded />
//
// Presentation only: no Supabase, auth, router or user context, so it is
// safe for logged-out visitors. Visual language mirrors pages/Website.tsx.
// The WhatsApp URL is reused from sponsorDemoConfig.ts (not duplicated).
//
// All copy lives in the content constants at the top of this file so the
// page can be edited section by section without touching the layout code.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { SPONSOR_DEMO_WHATSAPP_URL, SPONSOR_LANDING_CONTENT } from './sponsorDemoConfig';

/** Public Demo route (kept in sync with SPONSOR_DEMO_PATHS in App.tsx). */
const DEMO_HREF = '/insights/1e';

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

const HERO = {
  eyebrow: 'To Sponsors & Brands',
  headline: "You Know Which Marketers Make You Money. But Do You Know What Their Content Is Actually Doing?",
  paragraphs: [
    "You're investing in creators, marketers, and campaigns. You can see how much revenue they generate — but can you see which videos capture attention, which content educates potential customers, which builds interest and trust, and which ultimately drives sales?",
    "Without that visibility, you risk overlooking winning content, repeating ineffective strategies, and spending money without understanding what's actually working.",
  ],
  emphasis:
    'VSTRK helps you connect content performance to business results — so you can identify what works, understand what drives sales, and make smarter marketing decisions.',
  statement:
    'We help sponsors and brands working with multiple creators and marketers understand what drives their marketing results by connecting and comparing performance, conversion events, revenue, and customer journeys across individual content, campaigns, and supported platforms over time — so they can identify what works, uncover opportunities, reduce wasted spend, and make smarter decisions about what to scale, improve, or stop.',
};

const SCENARIOS = [
  { t: 'Lots of clicks, few sales', b: 'One creator’s video generates hundreds of clicks but very few sales.' },
  { t: 'Fewer views, more revenue', b: 'Another video gets fewer views but generates significantly more revenue.' },
  { t: 'The slow burn', b: 'A third doesn’t drive many immediate sales, but introduces people to your product before they eventually buy.' },
];

const FAILURES = [
  'Views aren’t the same as sales.',
  'Clicks aren’t the same as revenue.',
  'The creator with the most views isn’t necessarily the one who generates the most business.',
];

const SOLUTION_STEPS = [
  {
    t: 'Connect your tracking domain',
    b: 'Connect a custom tracking domain so your promotional links use your own brand rather than relying solely on a generic tracking URL.',
    code: 'shop.yourcustomdomain.com/token',
  },
  {
    t: 'Create a reusable promotional asset',
    b: 'Instead of treating every new video as a separate setup, organize the product or promotion as a reusable asset and share it with multiple marketers or creators promoting the same product.',
  },
  {
    t: 'Let creators generate content-specific links',
    b: 'When a creator prepares a new video, they generate a new link tied to that specific piece of content. You don’t have to create and send another tracking link every time.',
  },
  {
    t: 'See what your marketing actually produces',
    b: 'With the available tracking data connected, investigate which videos generate clicks, which content is associated with conversions, which creators and campaigns generate revenue, and — where journey data is available — how multiple pieces of content contribute to a purchase.',
  },
];

const QUESTIONS = [
  'Which videos bring in the most revenue?',
  'Which creators consistently produce results?',
  'Which content attracts attention but struggles to convert?',
  'Which videos contribute to customer journeys that end in a purchase?',
  'Which promotions are worth investing in again?',
  'Which successful approaches can inspire your next campaign?',
];

const DEMO_EXAMPLES = [
  { t: 'One product, multiple creators', b: 'A promotional asset shared with several marketers, each generating a link for their own video.' },
  { t: 'Compare video performance', b: 'Clicks, conversions and revenue associated with each individual video, side by side.' },
  { t: 'Understand the customer journey', b: 'How a customer can interact with multiple pieces of content before converting.' },
];

const AUDIENCE = [
  'You work with multiple creators and want to compare their performance.',
  'You’re tired of seeing aggregate campaign results without visibility into individual videos.',
  'You want to know which content generates clicks, conversions, and revenue.',
  'You need a more organized way to manage promotional assets and tracking links.',
  'You want creators to generate content-specific links without asking you for a new one every time.',
  'You want to understand how multiple content interactions contribute to a customer’s journey.',
  'You want to identify creators and content worth investing in again.',
  'You want to decide based on measurable results, not views or assumptions alone.',
];

const CURRENT_TOOLS = [
  { t: 'Your affiliate platform', b: 'Tells you how much revenue a particular link generated.' },
  { t: 'YouTube analytics', b: 'Tells you how many people watched a video.' },
  { t: 'A spreadsheet', b: 'Helps you keep track of your creator partnerships.' },
];

const ADVANTAGES = [
  { n: 'First', t: 'Reusability', b: 'Reuse the same promotional asset across multiple marketers and pieces of content instead of starting from scratch every time.' },
  { n: 'Second', t: 'Content-level visibility', b: 'Distinguish individual content links and analyze the performance associated with them, instead of relying on one shared link’s aggregate.' },
  { n: 'Third', t: 'A broader view', b: 'Where the required data is available, connect content interactions to conversions and revenue to see what happens between first interest and purchase.' },
];

const PROCESS = [
  { t: 'Connect', b: 'Connect your custom tracking domain and set up your promotional assets.' },
  { t: 'Distribute', b: 'Share your reusable assets with the creators and marketers promoting your products.' },
  { t: 'Track', b: 'Marketers generate links tied to individual pieces of content for a more granular structure.' },
  { t: 'Optimize', b: 'Use the available analytics to evaluate content, creators, conversions and revenue — then decide what to do next.' },
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

/** Old way vs VSTRK way. Purely illustrative — labelled as such. */
function OldVsNew() {
  const panel: React.CSSProperties = { background: C.panel, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' };
  const chips = (suffix?: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {['A', 'B', 'C'].map((v) => (
        <div key={v} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Node>Video {v}</Node>
          {suffix && <div style={{ ...mono(C.lp, 9.5), textAlign: 'center', letterSpacing: '0.06em' }}>{suffix}</div>}
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ ...grid(300), marginTop: 36 }}>
      <div style={panel}>
        <div style={{ ...mono(C.amber), marginBottom: 12 }}>The old way: one link</div>
        <Node>Sponsor creates one promotional link</Node>
        <Down />
        <Node tone="warn">One shared link, given to every creator</Node>
        <Down />
        {chips()}
        <Down color={C.amber} />
        <Node tone="warn">One combined total — which video earned it?</Node>
      </div>
      <div style={{ ...panel, borderColor: C.purple }}>
        <div style={{ ...mono(C.lp), marginBottom: 12 }}>The VSTRK way: one link per video</div>
        <Node>Sponsor connects a domain and sets up one reusable asset</Node>
        <Down />
        <Node tone="accent">Asset shared with multiple creators</Node>
        <Down />
        {chips('own link')}
        <Down color={C.purple} />
        <Node tone="accent">Clicks, conversions &amp; revenue per video</Node>
      </div>
      <div style={{ ...mono(C.amber, 10), gridColumn: '1 / -1' }}>Illustration of the workflow — not real customer data</div>
    </div>
  );
}

/* ───────────────────────────── PAGE ───────────────────────────── */

export default function SponsorLandingPage({ embedded = false }: { embedded?: boolean }) {
  const waLabel = SPONSOR_LANDING_CONTENT.ctaLabel || 'Contact VSTRK on WhatsApp';

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
            href={SPONSOR_DEMO_WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
            style={{ ...mono(C.lp, 10.5), fontWeight: 700, textDecoration: 'none' }}
          >
            Contact on WhatsApp →
          </a>
        </header>
      )}

      <div style={{ maxWidth: 940, margin: '0 auto', padding: embedded ? '40px 20px 56px' : '56px 20px 72px' }}>
        {/* 1 · HOOK */}
        <div style={{ ...mono(C.red), marginBottom: 14 }}>{HERO.eyebrow}</div>
        <h1 style={{ fontSize: 'clamp(30px, 6vw, 52px)', fontWeight: 700, lineHeight: 1.08, margin: 0, maxWidth: 800 }}>
          {HERO.headline}
        </h1>
        {HERO.paragraphs.map((t) => (
          <p key={t} style={{ fontSize: 'clamp(16px, 2.2vw, 19px)', color: C.mut, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700 }}>
            {t}
          </p>
        ))}
        <p style={{ fontSize: 'clamp(16px, 2.2vw, 19px)', fontWeight: 600, lineHeight: 1.6, margin: '20px 0 0', maxWidth: 700 }}>
          {HERO.emphasis}
        </p>
        <p
          style={{
            margin: '24px 0 28px', padding: '16px 18px', borderLeft: `3px solid ${C.purple}`, background: C.panel,
            borderRadius: '0 10px 10px 0', fontSize: 14.5, color: C.mut, lineHeight: 1.7, maxWidth: 760,
          }}
        >
          {HERO.statement}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Cta href={SPONSOR_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
          {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
        </div>

        <OldVsNew />

        {/* 2 · INTRO — THE PROBLEM */}
        <Section
          label="The problem"
          title="Do you actually know which video is bringing you the most money?"
          sub="You find creators who fit your brand, negotiate a deal, and give them a promotional link. The videos go live, people watch, some click — and hopefully some buy. But imagine three very different outcomes:"
        >
          <div style={grid(250)}>
            {SCENARIOS.map((s, i) => (
              <Card key={s.t} title={s.t} num={`Imagine · 0${i + 1}`}>{s.b}</Card>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 680 }}>
            If all three creators use the same promotional link, you may only see the combined result. You know the campaign
            generated revenue, but not which specific video deserves the credit. And if you can’t see which content performs best,
            how do you decide where to invest your next marketing dollar?
          </p>
        </Section>

        {/* 3 · FAILURE */}
        <Section
          label="Why the old workflow falls short"
          title="One link, handed to everyone, hides the answer"
          sub="Creator A uses the link in one video, Creator B in another, Creator C in a third. At the end you see that the link generated traffic, conversions and sales — but the results are grouped together, so comparing individual videos accurately is hard."
        >
          <div style={grid(260)}>
            {FAILURES.map((f) => (
              <div key={f} style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 10, padding: '14px 16px', fontSize: 15, fontWeight: 600, lineHeight: 1.45 }}>
                {f}
              </div>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 680 }}>
            So you piece it together by hand: YouTube views, available analytics, updates from creators, campaign results. Repeat that
            across dozens of creators, several campaigns and hundreds of videos, and managing links becomes another job in itself.
          </p>
          <Callout>
            The problem isn’t necessarily that your creators aren’t performing. It’s that you may not have the tracking structure
            needed to understand their performance.
          </Callout>
        </Section>

        {/* 4 · SOLUTION */}
        <Section
          label="Introducing VSTRK"
          title="Change how you organize and track promotions in the first place"
          sub="VSTRK helps sponsors and businesses track promotional performance at the content level and connect the available tracking data to the customer journey and revenue. It isn’t just another dashboard full of numbers."
        >
          <div style={grid(400)}>
            {SOLUTION_STEPS.map((s, i) => (
              <Card key={s.t} title={s.t} num={`Step ${i + 1}`}>
                {s.b}
                {s.code && (
                  <div
                    style={{
                      marginTop: 10, fontFamily: MONO, fontSize: 12.5, color: C.lp, background: '#1a1538',
                      border: `0.5px solid ${C.purple}`, borderRadius: 6, padding: '6px 10px', display: 'inline-block',
                      maxWidth: '100%', overflowWrap: 'anywhere',
                    }}
                  >
                    {s.code}
                  </div>
                )}
              </Card>
            ))}
          </div>
          <Callout>A reusable promotional workflow combined with more granular performance tracking.</Callout>
        </Section>

        {/* 5 · TRANSFORMATION */}
        <Section
          label="What becomes possible"
          title="Stop looking at one campaign number. Start asking better questions."
          sub="You’re no longer looking only at how much revenue an entire campaign generated. You can ask:"
        >
          <div style={grid(300)}>
            {QUESTIONS.map((q) => (
              <div key={q} style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 10, padding: '14px 16px', fontSize: 15, lineHeight: 1.45 }}>
                {q}
              </div>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700 }}>
            Over time, the answers can help you spot high-performing creators instead of judging everyone by views alone, recognize
            videos that deserve another look, and make more informed decisions about renewing partnerships, allocating budgets and
            replicating what works. As you work with more creators, reusable assets and content-specific links can also reduce
            repetitive link management.
          </p>
          <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.6, margin: '12px 0 0', maxWidth: 700 }}>
            We don’t promise every campaign will suddenly become profitable. The goal is better information, so you can understand
            what’s happening and improve how you run your marketing.
          </p>
          <Callout>Stop treating your marketing as one big number. Start understanding the performance behind it.</Callout>
        </Section>

        {/* 6 · PROOF → live demo (no invented results) */}
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

        {/* 7 · CALL OUT */}
        <Section
          label="Who VSTRK is for"
          title="Brands and businesses that work with YouTubers, influencers, UGC creators, affiliates and other marketers"
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
          <p style={{ color: C.mut, fontSize: 15, lineHeight: 1.65, margin: '22px 0 0', maxWidth: 700 }}>
            You don’t need to be a huge company. If you’re already investing money, time or resources into creator marketing and want
            to understand what that investment produces, better tracking can be valuable. VSTRK isn’t a magic solution that guarantees
            sales, and it doesn’t replace a good product, effective marketing or a reliable tracking setup.
          </p>
        </Section>

        {/* 8 · WHY CURRENT APPROACH MAY NOT BE ENOUGH */}
        <Section
          label="Why your current approach may not be enough"
          title="Those tools are useful. There are still gaps."
          sub="Maybe you already use affiliate links, discount codes, spreadsheets, platform analytics or creator reports. The issue isn’t that they’re bad — it’s the gap between the information you collect and the questions you want answered."
        >
          <div style={grid(240)}>
            {CURRENT_TOOLS.map((t) => (
              <Card key={t.t} title={t.t}>{t.b}</Card>
            ))}
          </div>
          <p style={{ color: C.mut, fontSize: 15.5, lineHeight: 1.65, margin: '20px 0 0', maxWidth: 700 }}>
            You still need a way to connect that information to understand how individual content, campaigns and customer journeys
            relate to conversions and revenue — and when every new video needs another manual tracking process, the system gets
            cumbersome. VSTRK combines reusable promotional assets, content-specific tracking links and the available performance data
            in one workflow.
          </p>
        </Section>

        {/* 9 · UNIQUE MECHANISM */}
        <Section
          label="The content-level tracking workflow"
          title="VSTRK separates the reusable promotion from the individual piece of content promoting it."
          sub="The sponsor sets up the promotional asset. It’s shared with multiple marketers. Each marketer generates a link tied to a specific piece of content. The resulting data lets you analyze performance in more detail."
        >
          <div style={grid(260)}>
            {ADVANTAGES.map((a) => (
              <Card key={a.t} title={a.t} num={a.n} accent={C.purple}>{a.b}</Card>
            ))}
          </div>
          <Callout>The value isn’t simply having another link. It’s having a system designed to help you understand what your marketing is actually doing.</Callout>
        </Section>

        {/* 10 · FOUR-STEP PROCESS */}
        <Section label="The process" title="Connect. Distribute. Track. Optimize.">
          <div style={grid(200)}>
            {PROCESS.map((p, i) => (
              <Card key={p.t} title={p.t} num={`0${i + 1}`}>{p.b}</Card>
            ))}
          </div>
        </Section>

        {/* 11 · NEXT STEPS */}
        <section
          style={{
            marginTop: 96, background: C.panel, border: `1px solid ${C.purple}`, borderRadius: 16,
            padding: 'clamp(24px, 5vw, 44px)', textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 700, lineHeight: 1.15, margin: 0 }}>
            You don’t have to keep treating an entire campaign as one number.
          </h2>
          <p style={{ color: C.mut, fontSize: 16, lineHeight: 1.65, margin: '14px auto 24px', maxWidth: 600 }}>
            If you’re working with creators and want a clearer picture of which videos and promotions generate results, explore how
            reusable assets, content-specific links and available analytics can fit into your marketing workflow.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            <Cta href={SPONSOR_DEMO_WHATSAPP_URL} external>{waLabel} →</Cta>
            {!embedded && <Cta solid={false} href={DEMO_HREF}>See the interactive demo</Cta>}
          </div>
          <p style={{ ...mono(C.mut, 11), margin: '24px 0 0' }}>VSTRK — Understand which content drives your business forward.</p>
        </section>
      </div>
    </div>
  );
}