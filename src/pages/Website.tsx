import React, { useCallback, useEffect, useState, useRef, Suspense, lazy, type ComponentType } from 'react'
import { Loader2 } from 'lucide-react'
import TestimonialCard from '../components/testimonial/TestimonialCard'
import {
  fetchWebsiteTestimonials,
  type PublicTestimonial,
} from '../services/testimonial/publicTestimonials'
import LoopVideoPreview from '../components/marketing/LoopVideoPreview'
import VideoLightbox from '../components/marketing/VideoLightbox'

/* Flip these to true when Workspace (Section 05) / Marketplace (Section 06)
   are ready to show on the public landing page. Until then they stay out of
   the DOM and are never downloaded. */
const SHOW_WORKSPACE_VIDEO = false
const SHOW_MARKETPLACE_VIDEO = false

const LazySection01 = lazy(() => import('../components/onboarding/OnboardingVideo/OnboardingVideoSection01'))
const LazySection02 = lazy(() => import('../components/onboarding/OnboardingVideo/OnboardingVideoSection02'))
const LazySection03 = lazy(() => import('../components/onboarding/OnboardingVideo/OnboardingVideoSection03'))
const LazySection04 = lazy(() => import('../components/onboarding/OnboardingVideo/OnboardingVideoSection04'))
const LazySection05 = lazy(() => import('../components/onboarding/OnboardingVideo/OnboardingVideoSection05'))
const LazySection06 = lazy(() => import('../components/onboarding/OnboardingVideo/OnboardingVideoSection06'))
const LazyTrackingJourney = lazy(() => import('../components/onboarding/OnboardingVideo/TrackingJourneyOnboardingVideo'))

type VideoComp = ComponentType<{ embedded?: boolean; onSkip?: () => void; onComplete?: () => void }>

/* "Daylight" palette: warm off-white page, white panels, purple brand accent. */
const C = {
  bg: '#ffffff', panel: '#ffffff', card: '#ffffff', line: '#e4e0ec', text: '#14131a', mut: '#4d4c58', dim: '#5c5b66',
  red: '#d11a1a', purple: '#5b3df0', lp: '#3b24b8', green: '#15803d', teal: '#0f766e', amber: '#8a5a00',
  blue: '#1d6fd1', orange: '#c2410c',
  tint: '#ece8ff', tintStroke: '#cfcad9', greenTint: '#e8f7ee',
}
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const SANS = '"Bricolage Grotesque", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
const CTA_HREF = '/login' // every "Start tracking" button goes here

const mono = (color = C.mut, size = 11): React.CSSProperties => ({
  fontFamily: MONO, fontSize: size, color, letterSpacing: '0.12em', textTransform: 'uppercase',
})

function Btn({ children, solid = true }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <a href={CTA_HREF} style={{
      ...mono(solid ? '#fff' : C.text), fontWeight: 600, padding: '11px 20px', borderRadius: 10, textDecoration: 'none',
      background: solid ? C.text : 'transparent', border: solid ? 'none' : `1.5px solid ${C.tintStroke}`, display: 'inline-block',
    }}>{children}</a>
  )
}

function Section({ label, title, sub, children }: { label: string; title: React.ReactNode; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 96 }}>
      <div style={{ ...mono(C.purple), marginBottom: 8 }}>{label}</div>
      <h2 style={{ fontSize: 'clamp(26px,4vw,38px)', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.02em', margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 16, color: C.mut, lineHeight: 1.6, margin: '12px 0 24px', maxWidth: 580 }}>{sub}</p>
      {children}
    </section>
  )
}

function Frame({ title, children, example = true }: { title: string; children: React.ReactNode; example?: boolean }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: '14px 16px 12px', boxShadow: '0 24px 50px -32px rgba(59,36,184,0.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={mono(C.dim)}>{title}</span>

      </div>
      {children}
    </div>
  )
}

const T = (p: React.SVGProps<SVGTextElement>) => <text fontFamily={MONO} fontSize={11} fill={C.mut} {...p} />
const Arrow = ({ x1, x2, y, color = C.purple }: { x1: number; x2: number; y: number; color?: string }) => (
  <path d={`M${x1},${y} L${x2},${y} M${x2 - 4},${y - 4} L${x2},${y} L${x2 - 4},${y + 4}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
)

/* ---------- Hero journey card ---------- */
function HeroJourney() {
  const bars = [
    { p: 'YouTube video', v: '200k', w: '100%', bg: C.tint, fg: C.text },
    { p: 'Facebook post', v: '100k', w: '50%', bg: '#d9ceff', fg: C.text },
    { p: 'TikTok', v: '50k', w: '25%', bg: '#b9a8ff', fg: C.text },
    { p: 'Sales call page', v: '25k', w: '13%', bg: C.purple, fg: '#fff' },
  ]
  const outs = [
    { p: 'Sales call', v: '10k', s: 'booked' },
    { p: 'Purchase page', v: '500', s: 'purchased' },
    { p: 'Consult', v: '20', s: 'booked' },
  ]
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 20, padding: 22, boxShadow: '0 30px 60px -28px rgba(59,36,184,0.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={mono(C.dim)}>Marketing journey</span>
        <span style={mono(C.dim, 11)}>Marketing journey</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bars.map((b) => (
          <div key={b.p} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 112, flex: 'none', fontSize: 13, color: C.mut }}>{b.p}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ width: b.w, minWidth: 64, height: 34, borderRadius: 8, background: b.bg, color: b.fg, display: 'flex', alignItems: 'center', padding: '0 12px', boxSizing: 'border-box', fontWeight: 600 }}>{b.v}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 18 }}>
        {outs.map((o) => (
          <div key={o.p} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: C.dim }}>{o.p}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{o.v}</div>
            <div style={{ fontSize: 12, color: C.dim }}>{o.s}</div>
          </div>
        ))}
      </div>
           <div style={{ marginTop: 14, fontSize: 12, color: C.dim, lineHeight: 1.45 }}>Every step tracked. Every path connected. Know exactly what's happening across your entire marketing journey.</div>
    </div>
  )
}

/* ---------- 01 Link it ---------- */
function LibraryRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: `1px solid ${C.line}`, borderRadius: 12, background: '#faf9fc' }}>
      <div style={{ width: 64, height: 40, borderRadius: 6, background: C.line, flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14 }}><span style={{ color: C.red, fontWeight: 600 }}>YouTube</span> · {title}</div>
        <div style={{ ...mono(C.dim), letterSpacing: '0.06em', marginTop: 3 }}>{meta}</div>
      </div>
      <span style={{ ...mono(C.text), border: `1.5px solid ${C.tintStroke}`, padding: '6px 12px', borderRadius: 8, background: '#fff' }}>Link</span>
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
                    <rect x={sx(i)} y={ny} width={72} height={40} rx={9} fill={isNew ? '#ffffff' : C.tint} stroke={isNew ? C.text : C.purple} strokeWidth={isNew ? 1.5 : 1} />
                    <T x={sx(i) + 10} y={ny + 25} fill={isNew ? C.text : C.lp}>VIDEO {L[i]}</T>
                    {r.tags.includes(i) && (
                      <g>
                        <rect x={sx(i) + 30} y={ny - 8} width={40} height={15} rx={4} fill="#ffffff" stroke={C.purple} />
                        <T x={sx(i) + 36} y={ny + 3} fill={C.lp}>ASSET</T>
                      </g>
                    )}
                    {(i < r.to || i === 5) && <Arrow x1={sx(i) + 72} x2={sx(i + 1)} y={ny + 20} color={i === 5 ? C.green : C.purple} />}
                  </g>
                )
              })}
              <rect x={sx(6)} y={ny} width={72} height={40} rx={9} fill={C.greenTint} stroke={C.green} />
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
        {EDGES.map(([a, b]) => { const A = box(a), B = box(b); return <path key={a + b} d={curve(A.x + A.w, A.cy, B.x, B.cy)} fill="none" stroke={C.purple} strokeWidth={1.2} opacity={0.6} /> })}
        {['ld', 'ck'].map((k) => { const A = box(k); return <path key={k} d={curve(A.x + A.w, A.cy, 556, 145)} fill="none" stroke={C.green} strokeWidth={1.6} /> })}
        {Object.entries(NODES).map(([k, n]) => (
          <g key={k}>
            <rect x={COLS[n.c]} y={n.y} width={n.w ?? 100} height={40} rx={9} fill={n.acc ? C.tint : '#ffffff'} stroke={n.acc ? C.purple : C.tintStroke} />
            <T x={COLS[n.c] + 9} y={n.y + 17} fill={n.red ? C.red : n.acc ? C.lp : C.mut}>{n.p.toUpperCase()}</T>
            <text x={COLS[n.c] + 9} y={n.y + 33} fontFamily={SANS} fontSize={12} fontWeight={600} fill={C.text}>{n.n}</text>
          </g>
        ))}
        <rect x={556} y={125} width={76} height={40} rx={9} fill={C.greenTint} stroke={C.green} />
        <T x={565} y={142} fill={C.green}>REVENUE</T>
        <text x={565} y={158} fontFamily={SANS} fontSize={12} fontWeight={600} fill={C.text}>$12,400</text>
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
        <div key={r[0]} style={{ ...grid, padding: '10px 4px', borderTop: `1px solid ${C.line}`, fontSize: 14 }}>
          <div><div>{r[0]}</div><div style={{ ...mono(r[5] ? C.blue : C.dim), letterSpacing: '0.06em' }}>{r[1]}</div></div>
          <span style={{ textAlign: 'right' }}>{r[2]}</span><span style={{ textAlign: 'right' }}>{r[3]}</span><span style={{ textAlign: 'right', fontWeight: 700 }}>{r[4]}</span>
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
        {[['Default', 'vstrk.com/kVMt', C.dim, C.line, C.mut], ['Your domain', 'go.yourbrand.com/kVMt', C.purple, C.purple, C.text]].map(([l, u, lc, bc, tc]) => (
          <div key={l} style={{ flex: 1, minWidth: 220, border: `1.5px solid ${bc}`, borderRadius: 12, background: C.panel, padding: '10px 12px' }}>
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
          <rect x={284} y={112} width={58} height={16} fill={C.panel} />
          <T x={313} y={124} textAnchor="middle" fill={C.text}>HANDOFF</T>
          {[['A', 26, 110, 'Intro', C.purple, C.lp], ['D', 170, 110, 'Offer', C.purple, C.lp], ['N', 346, 76, '', '#0f9d8f', C.teal], ['B', 436, 76, '', '#0f9d8f', C.teal], ['V', 526, 76, '', '#0f9d8f', C.teal]].map(([id, x, w, sub, s, t]) => (
            <g key={id as string}>
              <rect x={x as number} y={100} width={w as number} height={60} rx={9} fill="#ffffff" stroke={s as string} />
              <T x={(x as number) + 10} y={124} fill={t as string}>VIDEO {id}</T>
              {sub && <text x={(x as number) + 10} y={145} fontFamily={SANS} fontSize={15} fontWeight={600} fill={C.text}>{sub}</text>}
            </g>
          ))}
          <rect x={526} y={214} width={76} height={52} rx={9} fill={C.greenTint} stroke={C.green} />
          <T x={535} y={234} fill={C.green}>REVENUE</T>
          <text x={535} y={256} fontFamily={SANS} fontSize={15} fontWeight={600} fill={C.text}>$4,860</text>
          <T x={26} y={184}>go.novashop.com</T><T x={170} y={184}>fly.novashop.com</T>
          <T x={26} y={266} fill={C.dim}>2 subdomains, 1 root domain</T><T x={346} y={266} fill={C.dim}>1 root domain</T>
        </svg>
      </Frame>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 14 }}>
        {[['Your links', 'Put tracking links on your own domain.'], ['Subdomains', 'Use as many as you like under one root domain.'], ['Cross-domain', 'One journey can cross into a second root domain.']].map(([h, b]) => (
          <div key={h} style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: C.panel, padding: 14 }}>
            <div style={{ ...mono(C.purple), marginBottom: 6 }}>{h}</div>
            <div style={{ fontSize: 14, color: C.mut, lineHeight: 1.5 }}>{b}</div>
          </div>
        ))}
      </div>
      <div style={{ ...mono(C.dim), marginTop: 12, letterSpacing: '0.08em' }}>Need a more complex setup? Message us on WhatsApp.</div>
    </>
  )
}

/* ---------- Story videos ---------- */
type StoryVideo = {
  id: string
  title: string
  description: string
  Component: VideoComp
  hidden?: boolean
}

/* Full story list. hidden:true entries are built into the page structure
   but never rendered until you flip the flags at the top of this file. */
const STORY_VIDEOS: StoryVideo[] = [
  {
    id: 's01',
    title: '01 · Track the whole journey',
    description:
      'Post on any platform and still know which video led to a sale. VSTRK puts a tracking link on your content, and tracking starts the moment someone clicks.',
    Component: LazySection01 as VideoComp,
  },
  {
    id: 's02',
    title: '02 · Turn winners into assets',
    description:
      'When a video works, turn it into an asset and create new content to promote it. You track the whole network of content behind a result, not just a single link.',
    Component: LazySection02 as VideoComp,
  },
  {
    id: 'journey',
    title: '03 · Build a journey backward',
    description:
      'Start with your final video, make it an asset, and let each earlier video promote the next — all the way back to Video A. Also covers tracking domains, and how one journey can cross into a second domain.',
    Component: LazyTrackingJourney as VideoComp,
  },
  {
    id: 's03',
    title: '04 · Work with other people',
    description:
      'Hire an agency, sponsor influencers, or have a teammate do your marketing. Each person gets their own promotion and tracking link, so you can compare them by revenue instead of views.',
    Component: LazySection03 as VideoComp,
  },
  {
    id: 's04',
    title: '05 · Operator Mode',
    description:
      'Add team members or clients and see what they are actually doing — content, clicks, leads, and revenue. Then teach them what is working and why something did not.',
    Component: LazySection04 as VideoComp,
  },
  {
    id: 's05',
    title: '06 · Workspace',
    description:
      'Pull out only the charts that answer today’s question. Investigate who is working harder, which content keeps earning, where revenue comes from, and how risk is distributed across platforms.',
    Component: LazySection05 as VideoComp,
    hidden: !SHOW_WORKSPACE_VIDEO,
  },
  {
    id: 's06',
    title: '07 · Where we’re heading',
    description:
      'We’re building toward a marketplace where businesses find proven marketers and results speak for themselves. Track. Attribute. Grow.',
    Component: LazySection06 as VideoComp,
    hidden: !SHOW_MARKETPLACE_VIDEO,
  },
]

/* ---------- Tabbed story player ----------
   One framed player with a chapter list. Only the selected chapter is ever
   mounted, and only while the player is roughly on screen, so at most one
   rAF loop runs. Switching chapters (or scrolling away and back) remounts
   the video from the start. Lazy + Suspense keeps each video's JS off the
   critical path until it is first played. */
function TabbedStory({ items }: { items: StoryVideo[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
const io = new IntersectionObserver(
  ([entry]) => { if (entry.isIntersecting) setVisible(true) },
  { rootMargin: '200px 0px', threshold: 0 },
)
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const last = items.length - 1
  const goNext = useCallback(() => setActive((i) => Math.min(i + 1, last)), [last])

  const cur = items[Math.min(active, last)]
  if (!cur) return null
  const Cur = cur.Component
  const [curNum, curName] = cur.title.split(' · ')

  return (
    <div ref={ref} style={{ border: `1px solid ${C.line}`, borderRadius: 18, background: C.panel, overflow: 'hidden', boxShadow: '0 40px 80px -44px rgba(59,36,184,0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${C.line}`, background: '#f6f4fb' }}>
        <div style={{ display: 'flex', gap: 7 }} aria-hidden="true">
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: '#d7d2e3' }} />)}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'center' }}>{curNum} · {curName}</div>
        <div style={mono(C.dim)}>{Math.min(active, last) + 1} / {items.length}</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 560px', minWidth: 0, padding: 20, boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', minHeight: 280, position: 'relative' }}>
            {visible ? (
              <Suspense
                fallback={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, color: '#6b6b78', fontFamily: MONO, fontSize: 12 }}>
                    Loading…
                  </div>
                }
              >
                <Cur key={cur.id} embedded onComplete={goNext} />
              </Suspense>
            ) : (
              <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b78', fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em' }}>
                SCROLL TO PLAY
              </div>
            )}
          </div>
          <p style={{ fontSize: 15, color: C.mut, lineHeight: 1.65, margin: '16px 4px 0', maxWidth: 640 }}>{cur.description}</p>
        </div>

        <div className="lp-chapters" style={{ flex: '1 1 280px', minWidth: 0, padding: 20, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ ...mono(C.dim), marginBottom: 4 }}>Chapters</div>
          {items.map((v, i) => {
            const [num, name] = v.title.split(' · ')
            const on = i === active
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => { setActive(i); setVisible(true) }}
                aria-current={on ? 'true' : undefined}
                style={{
                  display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  border: `1.5px solid ${on ? C.purple : 'transparent'}`, background: on ? C.tint : 'transparent',
                  color: C.text, font: 'inherit',
                }}
              >
                <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: on ? C.purple : '#f0edf7', color: on ? '#fff' : C.mut, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{num}</span>
                <span style={{ fontSize: 14, lineHeight: 1.35, fontWeight: on ? 600 : 400 }}>{name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------- Product loop previews ----------
   Silent MP4 loops, shown as a card grid. `hero` cards are wider.
   The first VISIBLE_LOOPS cards show by default; the rest sit behind a button. */
const VISIBLE_LOOPS = 7
const PRODUCT_LOOPS: { src: string; title: string; about: string; hero?: boolean }[] = [
  {
    src: '/videoloop/treejourney.mp4',
    title: 'Tree journey',
    about: 'See how videos chain into a journey tree that leads toward revenue.',
    hero: true,
  },
  {
    src: '/videoloop/9platforms.mp4',
    title: '9 platforms',
    about: 'Track the same campaign across YouTube, TikTok, Instagram, X, and more.',
  },
  {
    src: '/videoloop/track4events.mp4',
    title: 'Track 4 events',
    about: 'Attribute key business events — clicks, leads, calls, and purchases — along the path.',
  },
  {
    src: '/videoloop/assetanalyticschart.mp4',
    title: 'Asset analytics chart',
    about: 'Charts for how each asset performs: attention, conversions, and revenue.',
    hero: true,
  },
  {
    src: '/videoloop/trackingdomainloopvideo.mp4',
    title: 'Tracking domain',
    about: 'Put tracking links on your own domain (and subdomains) while VSTRK still attributes.',
  },
  {
    src: '/videoloop/partnerjourneymap.mp4',
    title: 'Partner journey map',
    about: 'Map how partners and collaborators move traffic through a shared journey.',
  },
  {
    src: '/videoloop/trackcomplexjourn.mp4',
    title: 'Track complex journey',
    about: 'Follow longer, branching customer paths — not only a single linear click.',
  },
  {
    src: '/videoloop/easytogeneratetrackinglink.mp4',
    title: 'Easy to generate tracking link',
    about: 'Paste a content URL and get a tracking link in a few clicks.',
  },
  {
    src: '/videoloop/trackyourselforotherpeopletrackstillwork.mp4',
    title: 'Track yourself or other people',
    about: 'Whether you promote it or someone else does, tracking still ties back to the result.',
  },
  {
    src: '/videoloop/workspacechartsallinoneplace.mp4',
    title: 'Workspace charts all in one place',
    about: 'Pull the views you care about into one workspace board instead of scattered tabs.',
  },
]

/* ---------- Page ---------- */
export default function Website() {
  // Testimonials the owner marks "show on website" appear in the strip below.
  const [items, setItems] = useState<PublicTestimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [showAllLoops, setShowAllLoops] = useState(false)

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

  const visibleStory = STORY_VIDEOS.filter((v) => !v.hidden)
  const loops = showAllLoops ? PRODUCT_LOOPS : PRODUCT_LOOPS.slice(0, VISIBLE_LOOPS)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto', background: C.bg, color: C.text, fontFamily: SANS }}>
      <VideoLightbox />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700&display=swap');
        .lp-nav-links{display:flex;gap:22px}
        @media(max-width:640px){.lp-nav-links{display:none}}
        .lp-chapters{border-left:1px solid ${C.line}}
        @media(max-width:880px){.lp-chapters{border-left:none;border-top:1px solid ${C.line}}}
        .lp-card{transition:border-color .15s}
        .lp-card:hover{border-color:${C.purple}}
      `}</style>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 24px 72px' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center', marginBottom: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.purple }} />
            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, letterSpacing: '0.2em' }}>VS-TRACK</span>
          </div>
          <nav className="lp-nav-links" style={{ ...mono(C.mut), fontSize: 12 }}><a href="#link" style={{ color: 'inherit', textDecoration: 'none' }}>How it works</a><a href="#share" style={{ color: 'inherit', textDecoration: 'none' }}>Assets</a><a href="/pricing" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</a></nav>
          <Btn>Start tracking</Btn>
        </header>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'center' }}>
          <div style={{ flex: '1 1 440px', minWidth: 0 }}>
            <div style={{ display: 'inline-block', padding: '7px 14px', borderRadius: 999, background: C.tint, color: C.lp, fontSize: 13, fontWeight: 600, letterSpacing: '0.06em' }}>CONTENT → CONVERSIONS → REVENUE</div>
            <h1 style={{ fontSize: 'clamp(38px,5.4vw,62px)', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.025em', margin: '20px 0 0' }}>
              Track the whole path from <span style={{ background: 'linear-gradient(transparent 62%, #d9ceff 62%)' }}>video to sale.</span>
            </h1>
            <p style={{ fontSize: 18, color: C.mut, margin: '20px 0 0', maxWidth: 520, lineHeight: 1.6 }}>See how your content connects across platforms and turns attention into subscribers, leads, consultations, and sales.</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '14px 0 0', maxWidth: 520, lineHeight: 1.5 }}>One piece of content. One connected marketing journey. Measurable results.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
              <a href={CTA_HREF} style={{ padding: '15px 26px', borderRadius: 12, background: C.purple, color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>Start tracking →</a>
              <a href="#link" style={{ padding: '15px 26px', borderRadius: 12, border: `1.5px solid ${C.tintStroke}`, color: C.text, fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>See how it works</a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '18px 24px', marginTop: 34 }}>
              {[
                { t: 'Track Content Across 9 Platforms', d: 'Track videos, posts, Stories, and Shorts across all 9 supported platforms. See which content leads to newsletter signups, leads, sales calls, consultations, and revenue.' },
                { t: 'Track the Entire Marketing Journey', d: 'See how content across multiple platforms works together to generate results, from the first interaction to the final sale.', j: 'YouTube video → Facebook post → TikTok → LinkedIn post → Revenue', jn: 'Illustrative journey. Each step represents trackable content, not necessarily a required sequence.' },
                { t: 'Let Others Promote. Track Every Result.', d: 'Let other people promote your content or offers. Give each promoter a tracking link so you can see who drives signups, leads, consultations, and sales.' },
              ].map((f) => (
                <div key={f.t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', marginTop: 2 }}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{f.t}</div>
                    <div style={{ fontSize: 14, color: C.mut, lineHeight: 1.5, marginTop: 2 }}>{f.d}</div>
                    {f.j && <div style={{ fontSize: 14, fontWeight: 600, color: C.lp, lineHeight: 1.5, marginTop: 8 }}>{f.j}</div>}
                    {f.jn && <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.45, marginTop: 4 }}>{f.jn}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 440px', minWidth: 0 }}><HeroJourney /></div>
        </div>

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
        </Section>

        <Section label="03 / Any platform, one campaign" title={<>Mix every platform.<br />Trace every path to revenue.</>} sub="Chain videos, posts, and pages across YouTube, TikTok, Instagram, X, Reddit, and more. Paths can split and merge, and VS-Track follows all of them.">
          <MultiPlatform />
          <figure style={{ margin: '24px 0 0', maxWidth: 520 }}>
            <img src="/journey-example.png" alt="Journey from YouTube video to Facebook post, TikTok, LinkedIn post, and Revenue" style={{ width: '100%', height: 'auto', borderRadius: 16, border: `1px solid ${C.line}`, display: 'block' }} />
            <figcaption style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginTop: 8 }}>Illustrative journey. Each step represents trackable content, not necessarily a required sequence.</figcaption>
          </figure>
          <div style={{ ...mono(C.dim), marginTop: 10, letterSpacing: '0.08em' }}>If you can put a link on it, you can track it.</div>
        </Section>

        <div id="share"><Section label="04 / Share it" title={<>Turn anything into an asset.<br />See who sells it best.</>} sub="Share a video, page, or offer. Everyone who promotes it gets their own link, and you can rank them by revenue.">
          <TopAssets />
        </Section></div>

        <Section label="05 / Your domain" title={<>Your links. Your domain.<br />Even across brands.</>} sub="Put tracking links on your own domain. When a customer moves from one brand's domain to another, the journey keeps going.">
          <CrossDomain />
        </Section>

        <Section
          label="06 / Product previews"
          title={<>See the product in motion.</>}
          sub="Short silent loops from the real product. Each one plays when it scrolls into view; click any preview to expand with controls."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            {loops.map((v, i) => (
              <div
                key={v.src}
                className="lp-card"
                style={{ flex: v.hero ? '2 1 520px' : '1 1 260px', minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 16, background: C.panel, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              >
                <LoopVideoPreview src={v.src} label={v.title} />
                <div style={{ padding: '14px 18px 18px' }}>
                  <div style={{ ...mono(C.purple), letterSpacing: '0.12em' }}>{String(i + 1).padStart(2, '0')}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 6 }}>{v.title}</div>
                  <p style={{ fontSize: 14, color: C.mut, lineHeight: 1.55, margin: '6px 0 0' }}>{v.about}</p>
                </div>
              </div>
            ))}
          </div>
          {PRODUCT_LOOPS.length > VISIBLE_LOOPS && (
            <div style={{ marginTop: 28, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setShowAllLoops((s) => !s)}
                style={{ padding: '13px 24px', borderRadius: 12, border: `1.5px solid ${C.tintStroke}`, background: '#fff', color: C.text, fontFamily: SANS, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
              >
                {showAllLoops ? 'Show fewer previews' : `Show all ${PRODUCT_LOOPS.length} previews`}
              </button>
            </div>
          )}
        </Section>

        <Section
          label="07 / The full story"
          title={<>Watch how it all fits together.</>}
          sub="Short explainers of every major piece of VSTRK. Pick a chapter on the right; only the one you choose plays."
        >
          <TabbedStory items={visibleStory} />
        </Section>

        {/* Testimonial cards are styled for a dark surface, so they sit on a dark band. */}
        <section className="flex flex-col gap-6" style={{ marginTop: 96, background: '#0b0b0e', borderRadius: 20, padding: '40px 24px' }}>
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">Loved by creators</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Selected feedback from the VS-Track community.
            </p>
          </div>

          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="text-red-600 animate-spin" size={28} />
            </div>
          )}

          {!loading && items.length === 0 && (
            <p className="text-center text-zinc-500 text-sm py-8">
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
          <div style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 18 }}>Stop guessing. Start tracking.</div>
          <a href={CTA_HREF} style={{ display: 'inline-block', padding: '15px 28px', borderRadius: 12, background: C.purple, color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>Start tracking</a>
        </section>
      </div>
    </div>
  )
}