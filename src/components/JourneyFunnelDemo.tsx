import React, { useEffect, useRef, useState } from 'react'

/* ---------------------------------------------------------------
   VSTRK — Journey Funnel Demo
   Always-looping, pausable illustration of what a fully-tracked
   funnel looks like: Video A -> B -> C -> D -> Landing page, then
   three independently observed outcome branches.

   NOT REAL DATA. Every number here is fictional and fixed at build
   time, chosen to teach the SHAPE of funnel tracking (narrowing,
   then branching into named outcomes) — never a live query, never
   wired to any promotion's actual events_journey or
   AllAssetAnalytics numbers. The "Example" badge is permanent, not
   a first-run-only affordance — a fake number and a real number
   must never sit next to each other unlabeled (see
   PromotionJourneyMap.tsx's STEP 6 comments, which is the one
   piece on that page that IS real).

   Self-contained, same visual language as
   CampaignOnboardingStripeVideo.tsx (INK/LINE/ACCENT, MONO labels,
   DrawLine, pause control) — regenerated locally here rather than
   imported, same reasoning as that file's own header: this reads
   as the same product without creating a shared-file coupling.
----------------------------------------------------------------- */

const INK = '#15151f'
const LINE = '#d9d9e3'
const ACCENT = '#5b3df0'
const MUTED = '#9a9aa8'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

type FunnelNode = {
  id: string
  label: string
  sub: string
  x: number
  y: number
  w: number
  h: number
  accent?: boolean
}

const CHAIN: FunnelNode[] = [
  { id: 'a', label: 'Video A', sub: '200k', x: 20, y: 30, w: 76, h: 50 },
  { id: 'b', label: 'Video B', sub: '100k', x: 136, y: 30, w: 76, h: 50 },
  { id: 'c', label: 'Video C', sub: '50k', x: 252, y: 30, w: 76, h: 50 },
  { id: 'd', label: 'Video D', sub: '30k', x: 368, y: 30, w: 76, h: 50 },
  { id: 'landing', label: 'Landing', sub: '25k', x: 484, y: 30, w: 80, h: 50, accent: true },
]

const BRANCHES: FunnelNode[] = [
  { id: 'sales', label: 'Sales page 25k', sub: 'Call booked 10k', x: 310, y: 170, w: 112, h: 56 },
  { id: 'buy', label: 'Buy page 25k', sub: 'Purchased 500', x: 438, y: 170, w: 112, h: 56 },
  { id: 'consult', label: 'Consult 100', sub: 'Booked 20', x: 566, y: 170, w: 112, h: 56 },
]

const CHAIN_EDGES: [string, string][] = [
  ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'landing'],
]

// Beats — same idea as SEG_SOURCE in CampaignOnboardingStripeVideo.tsx,
// simplified since there's no narration to sync captions against here.
const CYCLE = 9000
const LIGHT_AT: Record<string, number> = {
  a: 300, b: 900, c: 1500, d: 2100, landing: 2700,
  sales: 3300, buy: 3300, consult: 3300,
}
const EDGE_DRAW: Record<string, [number, number]> = {
  'a::b': [300, 900], 'b::c': [900, 1500], 'c::d': [1500, 2100], 'd::landing': [2100, 2700],
}
const BRANCH_DRAW: [number, number] = [2700, 3300]

function clamp(v: number) { return Math.min(1, Math.max(0, v)) }
function prog(t: number, a: number, b: number) { return clamp((t - a) / (b - a)) }

function nodeById(id: string): FunnelNode {
  return CHAIN.find((n) => n.id === id) ?? BRANCHES.find((n) => n.id === id)!
}
function right(n: FunnelNode) { return { x: n.x + n.w, y: n.y + n.h / 2 } }
function left(n: FunnelNode) { return { x: n.x, y: n.y + n.h / 2 } }
function bottom(n: FunnelNode) { return { x: n.x + n.w / 2, y: n.y + n.h } }
function top(n: FunnelNode) { return { x: n.x + n.w / 2, y: n.y } }

// Regenerated from CampaignOnboardingStripeVideo.tsx's own DrawLine — same
// pathLength=1 / dashoffset technique, so a curved path draws in smoothly
// instead of needing per-frame endpoint math.
function DrawLine({ d, p, color = ACCENT, width = 2 }: { d: string; p: number; color?: string; width?: number }) {
  if (p <= 0) return null
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
  )
}

export default function JourneyFunnelDemo() {
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const startedAtRef = useRef(performance.now())
  const pausedAtRef = useRef(0)

  useEffect(() => {
    if (paused) return
    let raf: number
    function loop(now: number) {
      setElapsed((now - startedAtRef.current) % CYCLE)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused])

  const togglePause = () => {
    if (paused) {
      startedAtRef.current = performance.now() - pausedAtRef.current
      setPaused(false)
    } else {
      pausedAtRef.current = elapsed
      setPaused(true)
    }
  }

  const t = elapsed

  return (
    <div style={{
      width: '100%', maxWidth: 680, background: '#ffffff', border: `1px solid ${LINE}`,
      borderRadius: 12, padding: '14px 16px 10px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{
          fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 20, padding: '3px 9px',
        }}>
          Example — not your real data
        </span>
        <button
          type="button"
          onClick={togglePause}
          style={{
            fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
            color: MUTED, background: '#ffffff', border: `1px solid ${LINE}`, borderRadius: 999,
            padding: '5px 10px', cursor: 'pointer',
          }}
        >
          {paused ? '▶ play' : '❚❚ pause'}
        </button>
      </div>

      <svg viewBox="0 0 660 240" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {CHAIN_EDGES.map(([fromId, toId]) => {
          const [start, end] = EDGE_DRAW[`${fromId}::${toId}`]
          const a = right(nodeById(fromId))
          const b = left(nodeById(toId))
          return (
            <DrawLine key={`${fromId}-${toId}`} d={`M ${a.x},${a.y} L ${b.x},${b.y}`} p={prog(t, start, end)} />
          )
        })}

        {BRANCHES.map((branch) => {
          const a = bottom(nodeById('landing'))
          const b = top(branch)
          const midY = (a.y + b.y) / 2
          return (
            <DrawLine
              key={branch.id}
              d={`M ${a.x},${a.y} C ${a.x},${midY} ${b.x},${midY} ${b.x},${b.y}`}
              p={prog(t, BRANCH_DRAW[0], BRANCH_DRAW[1])}
              width={1.6}
            />
          )
        })}

        {[...CHAIN, ...BRANCHES].map((n) => {
          const on = t >= LIGHT_AT[n.id]
          return (
            <g key={n.id} opacity={on ? 1 : 0.35}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={9}
                fill={n.accent ? '#eef2ff' : '#ffffff'}
                stroke={n.accent ? ACCENT : LINE} strokeWidth={n.accent ? 1.4 : 1.1} />
              <text x={n.x + 8} y={n.y + 20} fontFamily={MONO} fontSize={8.5} fill={n.accent ? ACCENT : MUTED}>{n.label}</text>
              <text x={n.x + 8} y={n.y + 36} fontFamily={MONO} fontWeight={700} fontSize={11} fill={n.accent ? ACCENT : INK}>{n.sub}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
