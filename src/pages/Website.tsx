import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import TestimonialCard from '../components/testimonial/TestimonialCard'
import {
  fetchWebsiteTestimonials,
  type PublicTestimonial,
} from '../services/testimonial/publicTestimonials'
import TrackingJourneyOnboardingVideo from '../components/onboarding/OnboardingVideo/TrackingJourneyOnboardingVideo'

const C = {
  bg: '#000', panel: '#0d0d0d', card: '#141414', line: '#222', text: '#f2f2f2', mut: '#8a8a8a', dim: '#6a6a6a',
  red: '#e11d1d', purple: '#7c5cff', lp: '#b7a6ff', green: '#22c55e', teal: '#2dd4bf', amber: '#e0b04a',
  blue: '#4da3ff', orange: '#f97316',
}
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const SANS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
const CTA_HREF = '/login' // every "Start tracking" button goes here

const mono = (color = C.mut, size = 11): React.CSSProperties => ({
  fontFamily: MONO, fontSize: size, color, letterSpacing: '0.12em', textTransform: 'uppercase',
})

function Btn({ children, solid = true }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <a href={CTA_HREF} style={{
      ...mono(solid ? '#000' : C.text), fontWeight: 500, padding: '10px 18px', borderRadius: 8, textDecoration: 'none',
      background: solid ? '#fff' : 'transparent', border: solid ? 'none' : '0.5px solid #3a3a3a', display: 'inline-block',
    }}>{children}</a>
  )
}

function Section({ label, title, sub, children }: { label: string; title: React.ReactNode; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 88 }}>
      <div style={{ ...mono(C.red), marginBottom: 8 }}>{label}</div>
      <h2 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 500, lineHeight: 1.15, margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 15, color: C.mut, lineHeight: 1.6, margin: '12px 0 22px', maxWidth: 560 }}>{sub}</p>
      {children}
    </section>
  )
}

function Frame({ title, children, example = true }: { title: string; children: React.ReactNode; example?: boolean }) {
  return (
    <div style={{ background: C.panel, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '12px 14px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={mono()}>{title}</span>
        {example && <span style={mono(C.amber)}>Example, not real data</span>}
      </div>
      {children}
    </div>
  )
}

const T = (p: React.SVGProps<SVGTextElement>) => <text fontFamily={MONO} fontSize={11} fill={C.mut} {...p} />
const Num = (p: React.SVGProps<SVGTextElement>) => <text fontFamily={SANS} fontSize={18} fontWeight={500} fill={C.text} {...p} />
const Arrow = ({ x1, x2, y, color = C.purple }: { x1: number; x2: number; y: number; color?: string }) => (
  <path d={`M${x1},${y} L${x2},${y} M${x2 - 4},${y - 4} L${x2},${y} L${x2 - 4},${y + 4}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
)

/* ---------- Hero journey map ---------- */
function JourneyMap() {
  const chain = [
    { x: 10, w: 110, p: 'YouTube', v: '200k', red: true },
    { x: 160, w: 110, p: 'TikTok', v: '100k' },
    { x: 310, w: 110, p: 'Facebook', v: '50k' },
    { x: 460, w: 120, p: 'Landing page', v: '25k', acc: true },
  ]
  const outs = [
    { x: 300, p: 'Sales call', v: '10k', s: 'booked', c: C.purple },
    { x: 420, p: 'Buy page', v: '500', s: 'purchased', c: C.orange },
    { x: 540, p: 'Consult', v: '20', s: 'booked', c: C.green },
  ]
  return (
    <Frame title="Journey map">
      <svg viewBox="0 0 640 280" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Three videos lead to a landing page that branches into a sales call, a purchase, and a consultation">
        {outs.map((o) => <path key={o.p} d={`M520,96 C520,143 ${o.x + 50},143 ${o.x + 50},190`} fill="none" stroke={o.c} strokeWidth={1.5} />)}
        {[0, 1, 2].map((i) => <g key={i}><Arrow x1={chain[i].x + chain[i].w} x2={chain[i + 1].x} y={68} /><T x={chain[i + 1].x - 20} y={60} textAnchor="middle">50%</T></g>)}
        {chain.map((n) => (
          <g key={n.p}>
            <rect x={n.x} y={40} width={n.w} height={56} rx={9} fill={n.acc ? '#1a1538' : C.card} stroke={n.acc ? C.purple : '#2a2a2a'} />
            <T x={n.x + 10} y={60} fill={n.red ? C.red : n.acc ? C.lp : C.mut}>{n.p.toUpperCase()}</T>
            <Num x={n.x + 10} y={84}>{n.v}</Num>
          </g>
        ))}
        {outs.map((o) => (
          <g key={o.p}>
            <rect x={o.x} y={190} width={100} height={70} rx={9} fill={C.card} stroke={o.c} />
            <T x={o.x + 10} y={210} fill={o.c === C.purple ? C.lp : o.c}>{o.p.toUpperCase()}</T>
            <Num x={o.x + 10} y={234}>{o.v}</Num>
            <T x={o.x + 10} y={251}>{o.s}</T>
          </g>
        ))}
        <rect x={10} y={170} width={250} height={90} rx={9} fill="none" stroke="#2a2a2a" strokeDasharray="3 4" />
        <T x={24} y={194}>BIGGEST DROP</T>
        <text x={24} y={218} fontFamily={SANS} fontSize={15} fontWeight={500} fill={C.text}>YouTube to TikTok</text>
        <text x={24} y={238} fontFamily={SANS} fontSize={12} fill={C.mut}>Half of viewers stopped here</text>
      </svg>
    </Frame>
  )
}

/* ---------- 01 Link it ---------- */
function LibraryRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: `0.5px solid ${C.line}`, borderRadius: 10, background: '#111' }}>
      <div style={{ width: 64, height: 40, borderRadius: 6, background: '#1f1f1f', flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13 }}><span style={{ color: C.red }}>YouTube</span> · {title}</div>
        <div style={{ ...mono(C.mut), letterSpacing: '0.06em', marginTop: 3 }}>{meta}</div>
      </div>
      <span style={{ ...mono(C.text), border: '0.5px solid #3a3a3a', padding: '6px 12px', borderRadius: 8 }}>Link</span>
    </div>
  )
}

/* ---------- 02 Build backward ---------- */
function BuildBackward() {
  const L = 'ABCDEF'
  const sx = (i: number) => 26 + i * 86
  const rows = [
    { label: '1. Create the last video', from: 5, to: 5, nw: 5, tags: [5] },
    { label: '2. Let the one before promote it', from: 4, to: 5, nw: 4, tags: [4, 5] },
    { label: '3. Keep repeating', from: 1, to: 5, nw: 1, tags: [1, 2, 3, 4, 5] },
    { label: '4. The full journey', from: 0, to: 5, nw: 0, tags: [1, 2, 3, 4, 5] },
  ]
  return (
    <Frame title="Building a journey" example={false}>
      <svg viewBox="0 0 640 304" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Build a journey backward from Video F to Video A, each video becoming an asset the previous one promotes, ending in revenue">
        {rows.map((r, ri) => {
          const y0 = 14 + ri * 72, ny = y0 + 24
          const idx = Array.from({ length: r.to - r.from + 1 }, (_, k) => r.from + k)
          return (
            <g key={ri}>
              <T x={26} y={y0 + 10} letterSpacing={1}>{r.label.toUpperCase()}</T>
              {idx.map((i) => {
                const isNew = i === r.nw
                return (
                  <g key={i}>
                    <rect x={sx(i)} y={ny} width={72} height={40} rx={9} fill={isNew ? '#1c1c1c' : C.card} stroke={isNew ? C.text : C.purple} />
                    <T x={sx(i) + 10} y={ny + 25} fill={isNew ? C.text : C.lp}>VIDEO {L[i]}</T>
                    {r.tags.includes(i) && (
                      <g>
                        <rect x={sx(i) + 30} y={ny - 8} width={40} height={15} rx={4} fill="#1a1538" stroke={C.purple} />
                        <T x={sx(i) + 36} y={ny + 3} fill={C.lp}>ASSET</T>
                      </g>
                    )}
                    {(i < r.to || i === 5) && <Arrow x1={sx(i) + 72} x2={sx(i + 1)} y={ny + 20} color={i === 5 ? C.green : C.purple} />}
                  </g>
                )
              })}
              <rect x={sx(6)} y={ny} width={72} height={40} rx={9} fill="#0f1a12" stroke={C.green} />
              <T x={sx(6) + 9} y={ny + 25} fill={C.green}>REVENUE</T>
            </g>
          )
        })}
      </svg>
    </Frame>
  )
}

/* ---------- 03 Any platform ---------- */
const COLS = [20, 170, 320, 452]
const NODES: Record<string, { c: number; y: number; p: string; n: string; w?: number; red?: boolean; acc?: boolean }> = {
  ya: { c: 0, y: 30, p: 'YouTube', n: 'Video A', red: true }, ta: { c: 0, y: 95, p: 'TikTok', n: 'Video A' },
  ia: { c: 0, y: 160, p: 'Instagram', n: 'Reel A' }, fa: { c: 0, y: 225, p: 'Facebook', n: 'Post A' },
  yb: { c: 1, y: 60, p: 'YouTube', n: 'Video B', red: true }, ib: { c: 1, y: 130, p: 'Instagram', n: 'Post B' },
  tb: { c: 1, y: 195, p: 'TikTok', n: 'Video B' }, x: { c: 2, y: 30, p: 'X', n: 'Thread' },
  rd: { c: 2, y: 100, p: 'Reddit', n: 'Post' }, th: { c: 2, y: 165, p: 'Threads', n: 'Post' },
  li: { c: 2, y: 230, p: 'LinkedIn', n: 'Post' }, ld: { c: 3, y: 90, p: 'Landing', n: 'page', w: 84, acc: true },
  ck: { c: 3, y: 175, p: 'Checkout', n: 'page', w: 84, acc: true },
}
const EDGES = [['ya', 'yb'], ['ta', 'yb'], ['ta', 'ib'], ['ia', 'ib'], ['ia', 'tb'], ['fa', 'tb'], ['yb', 'x'], ['yb', 'rd'],
  ['ib', 'rd'], ['ib', 'th'], ['tb', 'th'], ['tb', 'li'], ['x', 'ld'], ['rd', 'ld'], ['th', 'ld'], ['th', 'ck'], ['li', 'ck']]

function MultiPlatform() {
  const box = (k: string) => { const n = NODES[k]; return { x: COLS[n.c], w: n.w ?? 100, cy: n.y + 20 } }
  const curve = (x1: number, y1: number, x2: number, y2: number) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`
  return (
    <Frame title="One campaign, many platforms">
      <svg viewBox="0 0 640 290" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Posts across YouTube, TikTok, Instagram, Facebook, X, Reddit, Threads and LinkedIn lead through a landing page and checkout to revenue">
        {EDGES.map(([a, b]) => { const A = box(a), B = box(b); return <path key={a + b} d={curve(A.x + A.w, A.cy, B.x, B.cy)} fill="none" stroke={C.purple} strokeWidth={1.2} opacity={0.8} /> })}
        {['ld', 'ck'].map((k) => { const A = box(k); return <path key={k} d={curve(A.x + A.w, A.cy, 556, 145)} fill="none" stroke={C.green} strokeWidth={1.6} /> })}
        {Object.entries(NODES).map(([k, n]) => (
          <g key={k}>
            <rect x={COLS[n.c]} y={n.y} width={n.w ?? 100} height={40} rx={9} fill={n.acc ? '#1a1538' : C.card} stroke={n.acc ? C.purple : '#2a2a2a'} />
            <T x={COLS[n.c] + 9} y={n.y + 17} fill={n.red ? C.red : n.acc ? C.lp : C.mut}>{n.p.toUpperCase()}</T>
            <text x={COLS[n.c] + 9} y={n.y + 33} fontFamily={SANS} fontSize={12} fontWeight={500} fill={C.text}>{n.n}</text>
          </g>
        ))}
        <rect x={556} y={125} width={76} height={40} rx={9} fill="#0f1a12" stroke={C.green} />
        <T x={565} y={142} fill={C.green}>REVENUE</T>
        <text x={565} y={158} fontFamily={SANS} fontSize={12} fontWeight={500} fill={C.text}>$12,400</text>
      </svg>
    </Frame>
  )
}

/* ---------- 04 Share it ---------- */
function TopAssets() {
  const rows = [
    ['Spring course landing page', 'Assigned · 2 users', '1,840', '96', '$9,120', true],
    ['Launch day video', 'Assigned · 1 user', '1,120', '54', '$4,860', true],
    ['Free consultation page', 'My asset', '640', '31', '$1,550', false],
  ] as const
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 64px 56px 80px', gap: 8, alignItems: 'center' }
  return (
    <Frame title="Top assets">
      <div style={{ ...grid, ...mono(C.dim), padding: '4px 4px 6px' }}><span>Asset</span><span style={{ textAlign: 'right' }}>Clicks</span><span style={{ textAlign: 'right' }}>Conv.</span><span style={{ textAlign: 'right' }}>Revenue</span></div>
      {rows.map((r) => (
        <div key={r[0]} style={{ ...grid, padding: '10px 4px', borderTop: `0.5px solid ${C.line}`, fontSize: 13 }}>
          <div><div>{r[0]}</div><div style={{ ...mono(r[5] ? C.blue : C.mut), letterSpacing: '0.06em' }}>{r[1]}</div></div>
          <span style={{ textAlign: 'right' }}>{r[2]}</span><span style={{ textAlign: 'right' }}>{r[3]}</span><span style={{ textAlign: 'right', fontWeight: 500 }}>{r[4]}</span>
        </div>
      ))}
    </Frame>
  )
}

/* ---------- 05 Your domain ---------- */
function CrossDomain() {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Default', 'vstrk.com/kVMt', C.dim, C.line, C.mut], ['Your domain', 'go.yourbrand.com/kVMt', C.red, C.red, C.text]].map(([l, u, lc, bc, tc]) => (
          <div key={l} style={{ flex: 1, minWidth: 220, border: `0.5px solid ${bc}`, borderRadius: 10, background: C.panel, padding: '10px 12px' }}>
            <div style={{ ...mono(lc), marginBottom: 4 }}>{l}</div>
            <div style={{ fontFamily: MONO, fontSize: 14, color: tc }}>{u}</div>
          </div>
        ))}
      </div>
      <Frame title="One journey, two domains">
        <svg viewBox="0 0 640 290" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="A journey starts on novashop.com, hands off to fitnessbrand.com, and ends in revenue">
          <rect x={6} y={20} width={300} height={262} rx={12} fill="none" stroke="#5b3df0" strokeDasharray="4 4" />
          <rect x={334} y={20} width={300} height={262} rx={12} fill="none" stroke="#0f9d8f" strokeDasharray="4 4" />
          <T x={22} y={46} fill={C.lp} fontSize={12}>NOVASHOP.COM</T>
          <T x={350} y={46} fill={C.teal} fontSize={12}>FITNESSBRAND.COM</T>
          <Arrow x1={136} x2={170} y={130} />
          <Arrow x1={280} x2={346} y={130} color={C.text} />
          <Arrow x1={422} x2={436} y={130} color={C.teal} />
          <Arrow x1={512} x2={526} y={130} color={C.teal} />
          <path d="M564,160 L564,214" stroke={C.green} strokeWidth={1.6} />
          <rect x={284} y={112} width={58} height={16} fill="#000" />
          <T x={313} y={124} textAnchor="middle" fill={C.text}>HANDOFF</T>
          {[['A', 26, 110, 'Intro', C.purple, C.lp], ['D', 170, 110, 'Offer', C.purple, C.lp], ['N', 346, 76, '', '#0f9d8f', C.teal], ['B', 436, 76, '', '#0f9d8f', C.teal], ['V', 526, 76, '', '#0f9d8f', C.teal]].map(([id, x, w, sub, s, t]) => (
            <g key={id as string}>
              <rect x={x as number} y={100} width={w as number} height={60} rx={9} fill={C.card} stroke={s as string} />
              <T x={(x as number) + 10} y={124} fill={t as string}>VIDEO {id}</T>
              {sub && <text x={(x as number) + 10} y={145} fontFamily={SANS} fontSize={15} fontWeight={500} fill={C.text}>{sub}</text>}
            </g>
          ))}
          <rect x={526} y={214} width={76} height={52} rx={9} fill="#0f1a12" stroke={C.green} />
          <T x={535} y={234} fill={C.green}>REVENUE</T>
          <text x={535} y={256} fontFamily={SANS} fontSize={15} fontWeight={500} fill={C.text}>$4,860</text>
          <T x={26} y={184}>go.novashop.com</T><T x={170} y={184}>fly.novashop.com</T>
          <T x={26} y={266} fill={C.dim}>2 subdomains, 1 root domain</T><T x={346} y={266} fill={C.dim}>1 root domain</T>
        </svg>
      </Frame>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 14 }}>
        {[['Your links', 'Put tracking links on your own domain.'], ['Subdomains', 'Use as many as you like under one root domain.'], ['Cross-domain', 'One journey can cross into a second root domain.']].map(([h, b]) => (
          <div key={h} style={{ border: `0.5px solid ${C.line}`, borderRadius: 10, background: C.panel, padding: 14 }}>
            <div style={{ ...mono(C.red), marginBottom: 6 }}>{h}</div>
            <div style={{ fontSize: 13, color: '#cfcfcf', lineHeight: 1.5 }}>{b}</div>
          </div>
        ))}
      </div>
      <div style={{ ...mono(C.dim), marginTop: 12, letterSpacing: '0.08em' }}>Need a more complex setup? Message us on WhatsApp.</div>
    </>
  )
}

/* ---------- Click-to-play walkthrough (mounts only on click, so it never autoplays) ---------- */
function Walkthrough({ label }: { label: string }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{
        ...mono(C.text), marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        background: 'transparent', border: '0.5px solid #3a3a3a', borderRadius: 8, padding: '10px 16px',
      }}>
        <span style={{ color: C.red }} aria-hidden="true">&#9654;</span>{label}
      </button>
    )
  }
  // The video is designed on a white canvas, so it sits inside a white frame.
  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', marginTop: 14, position: 'relative' }}>
      <TrackingJourneyOnboardingVideo onSkip={() => setOpen(false)} onComplete={() => setOpen(false)} />
    </div>
  )
}

/* ---------- Page ---------- */
export default function Website() {
  // Testimonials the owner marks "show on website" appear in the strip below.
  const [items, setItems] = useState<PublicTestimonial[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await fetchWebsiteTestimonials(6)
        if (!cancelled) setItems(rows)
      } catch {
        // Silent fail: the landing page still renders without testimonials
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: SANS, minHeight: '100vh' }}>
      <style>{`.lp-nav-links{display:flex;gap:22px}@media(max-width:640px){.lp-nav-links{display:none}}`}</style>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 20px 64px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.red }} />
            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 500, letterSpacing: '0.2em' }}>VS-TRACK</span>
          </div>
          <nav className="lp-nav-links" style={mono()}><a href="#link" style={{ color: 'inherit', textDecoration: 'none' }}>How it works</a><a href="#share" style={{ color: 'inherit', textDecoration: 'none' }}>Assets</a><a href="/pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</a></nav>
          <Btn>Start tracking</Btn>
        </header>

        <h1 style={{ fontSize: 'clamp(32px,6vw,52px)', fontWeight: 500, lineHeight: 1.1, margin: 0 }}>See the whole path<br />from video to sale.</h1>
        <p style={{ fontSize: 16, color: C.mut, margin: '14px 0 20px', maxWidth: 520, lineHeight: 1.6 }}>Track any link on any platform, and share assets so others can promote them.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}><Btn>Start tracking</Btn><a href="#link" style={{ ...mono(C.text), border: '0.5px solid #3a3a3a', padding: '10px 18px', borderRadius: 8, textDecoration: 'none' }}>See how it works</a></div>
        <JourneyMap />

        <div id="link"><Section label="01 / Link it" title={<>Add any video or post.<br />Get a tracking link.</>} sub="Paste a link and it shows up in your content library, ready to track.">
          <Frame title="Content library" example={false}>
            <div style={{ display: 'grid', gap: 8 }}>
              <LibraryRow title="Your video title goes here" meta="My asset · Goal: direct sales" />
              <LibraryRow title="Another video title" meta="Shared asset x3 · Goal: direct sales" />
            </div>
          </Frame>
        </Section></div>

        <Section label="02 / Build it backward" title={<>Start at the end.<br />Work back to the start.</>} sub="Make your last video an asset. Let the one before it promote that asset. Repeat until every video leads to the next, all the way to revenue.">
          <BuildBackward />
          <Walkthrough label="Watch how to build a journey" />
        </Section>

        <Section label="03 / Any platform, one campaign" title={<>Mix every platform.<br />Trace every path to revenue.</>} sub="Chain videos, posts, and pages across YouTube, TikTok, Instagram, X, Reddit, and more. Paths can split and merge, and VS-Track follows all of them.">
          <MultiPlatform />
          <div style={{ ...mono(C.dim), marginTop: 10, letterSpacing: '0.08em' }}>If you can put a link on it, you can track it.</div>
        </Section>

        <div id="share"><Section label="04 / Share it" title={<>Turn anything into an asset.<br />See who sells it best.</>} sub="Share a video, page, or offer. Everyone who promotes it gets their own link, and you can rank them by revenue.">
          <TopAssets />
        </Section></div>

        <Section label="05 / Your domain" title={<>Your links. Your domain.<br />Even across brands.</>} sub="Put tracking links on your own domain. When a customer moves from one brand's domain to another, the journey keeps going.">
          <CrossDomain />
          <Walkthrough label="Watch how domains work" />
        </Section>

        <section className="flex flex-col gap-6" style={{ marginTop: 88 }}>
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">Loved by creators</h2>
            <p className="text-zinc-500 text-sm mt-1">
              Selected feedback from the VS-Track community.
            </p>
          </div>

          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="text-red-600 animate-spin" size={28} />
            </div>
          )}

          {!loading && items.length === 0 && (
            <p className="text-center text-zinc-600 text-sm py-8">
              No website testimonials selected yet.
            </p>
          )}

          {!loading && items.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((t) => (
                <TestimonialCard key={t.id} testimonial={t} compact />
              ))}
            </div>
          )}
        </section>

        <section style={{ marginTop: 96, textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 500, marginBottom: 16 }}>Stop guessing. Start tracking.</div>
          <Btn>Start tracking</Btn>
        </section>
      </div>
    </div>
  )
}
