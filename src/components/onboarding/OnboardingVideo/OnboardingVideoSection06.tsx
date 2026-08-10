import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, SECTION 06 — FINAL SECTION / CLOSING
   "And we're not stopping there." → "Track. Attribute. Grow."

   Standalone, modular scene file for the final section. Independently
   renderable — does NOT require Sections 01-05 to be mounted. It
   regenerates the same visual language, primitives and timing
   philosophy locally (no import-time dependency), exactly the way
   Section 05 stayed self-contained from the sections before it.

   STORY: Sections 01-05 explained what VSTRK does today — tracking,
   attribution, assets, promotions, marketers, operators, workspace
   investigation, revenue intelligence. This closing section zooms
   out from the product and answers a different question: where is
   VSTRK going? It walks Product → Results → Network → Marketplace →
   VSTRK, landing on the idea that VSTRK is building toward a place
   where businesses and proven marketing talent find each other,
   with real, trackable results as the evidence — then resolves into
   a clean brand reveal and the final tagline.

   PRODUCT GROUNDING:
     - This section is explicitly a *vision / future-direction* beat,
       not a feature walkthrough. Per the brief, it does not build an
       actual marketplace, does not add any new database tables,
       Supabase queries, or analytics, and does not touch any
       production surface. The "Businesses ↔ VSTRK ↔ Marketers"
       network and the results-not-resumes payoff are conceptual,
       illustrative visuals only — the same spirit as Section 05
       inventing demo numbers for its investigation-board examples
       rather than sourcing them from real application data.
     - The narration is used verbatim, word-for-word, exactly as
       supplied, split one beat per sentence (plus the two-word
       "VSTRK" brand beat and the three-part tagline beat), matching
       Section 05's one-sentence-per-beat philosophy.

   REUSED FROM SECTIONS 01-05 (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp / segOpacity / rangeOpacity  (timing math)
     - DrawLine, EyeNode, Person, Badge, Chip                        (visual primitives)
     - the violet corner-tick Badge grammar for product-concept badges
     - the accent Chip grammar for tags/short phrases
     - WidgetCard() + sparkline paths — reused here to represent a
       marketer's actual track record standing in for a profile photo
     - autoCaption() — identical single-sentence caption derivation

   NEW IN THIS FILE:
     - none. This section deliberately introduces no new visual
       primitives — the finale reuses the established grammar rather
       than inventing new shapes, so it reads as a continuation of
       the same product rather than a new design system.

   NOT included on purpose (reserved for real product work): no
   actual marketplace UI, no listings, no matching algorithm, no
   marketer-discovery search, no new schema. This section explains
   the *vision* of a marketplace; it does not ship one.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const WARN = "#d3555c";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — one beat per exact narration unit (6 beats: 4 sentences,
   the brand word, and the tagline), played back to back with a
   280ms cross-fade gap, same philosophy as Sections 01-05. S2 (the
   marketplace-vision sentence) is the longest beat in the whole
   onboarding video on purpose — it carries the single most important
   visual (the two-sided network converging on VSTRK) and needs real
   time to be read, not just heard.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "And we're not stopping there.", 2400],
  ["S2", "We're building toward a marketplace where businesses can discover proven marketing talent — and marketers can connect with businesses that need them.", 7200],
  ["S3", "Our goal is to build a place where great marketers and growing businesses can find each other.", 4400],
  ["S4", "And where the results can speak for themselves.", 3200],
  ["S5", "VSTRK", 3000],
  ["S6", "Track. Attribute. Grow.", 3800],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S6.end + 700;

function clamp(v: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function prog(t: number, start: number, end: number) { return clamp((t - start) / (end - start)); }
function fadeWindow(t: number, a: number, b: number, c: number, d: number) {
  if (t < a) return 0;
  if (t < b) return clamp((t - a) / (b - a));
  if (c === Infinity) return 1;
  if (t < c) return 1;
  if (t < d) return 1 - clamp((t - c) / (d - c));
  return 0;
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function segOpacity(t: number, key: string, edge = 260) {
  const { start, end } = SEG[key];
  return fadeWindow(t, start, start + edge, end - edge, end);
}
function rangeOpacity(t: number, fromKey: string, toKey: string, edge = 260) {
  return fadeWindow(t, SEG[fromKey].start, SEG[fromKey].start + edge, SEG[toKey].end - edge, SEG[toKey].end);
}

/* Derives caption fade timing directly from a beat's SEG window —
   identical single-sentence helper from Section 05. */
function autoCaption(key: string, opts: { lead?: number; tail?: number; fade?: number } = {}) {
  const { lead = 220, tail = 260, fade = 220 } = opts;
  const seg = SEG[key];
  const a = seg.start + lead;
  const d = seg.end - tail;
  const b = Math.min(a + fade, a + (d - a) / 2);
  const c = Math.max(b, d - fade);
  return { text: seg.text, a, b, c, d };
}
const CAPTIONS = SEG_SOURCE.map(([key]) => autoCaption(key));

/* ---------------- Visual primitives — regenerated from Sections 01-05 ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE, dash }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string; dash?: string }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray={dash ? dash : 1} strokeDashoffset={dash ? undefined : 1 - p} opacity={opacity * (dash ? p : 1)} />
  );
}

function EyeNode({ x, y, t, arriveStart, arriveEnd, label, labelSide = "right", pulse = 0, opacity = 1, r = 5.5 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label?: string; labelSide?: "left" | "right" | "center"; pulse?: number; opacity?: number; r?: number }) {
  const openP = prog(t, arriveStart, arriveEnd);
  const eyeP = prog(t, arriveEnd, arriveEnd + 260);
  const baseGlow = clamp(openP) * (1 - 0.4 * (1 - eyeP));
  const glow = clamp(baseGlow + pulse, 0, 1.6);
  const ry = lerp(0.6, r * 0.56, eyeP);
  const labelX = labelSide === "right" ? x + r * 2.4 : labelSide === "left" ? x - r * 2.4 : x;
  const anchor = labelSide === "right" ? "start" : labelSide === "left" ? "end" : "middle";
  return (
    <g opacity={openP * opacity}>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={openP > 0.05 ? ACCENT : LINE} strokeWidth={1.2}
        style={{ filter: glow > 0.15 ? `drop-shadow(0 0 ${5 * glow}px ${ACCENT})` : "none" }} />
      <ellipse cx={x} cy={y} rx={r * 0.56} ry={ry} fill={ACCENT} opacity={eyeP} />
      {label && (
        <text x={labelX} y={y} dy="0.34em" textAnchor={anchor} fontFamily={MONO} fontSize={10.5} letterSpacing={0.6}
          fill={INK} opacity={0.82} style={{ textTransform: "uppercase" }}>{label}</text>
      )}
    </g>
  );
}

function Person({ x, y, size = 26, opacity = 1, emoji = "🧑" }: { x: number; y: number; size?: number; opacity?: number; emoji?: string }) {
  return <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} opacity={opacity}>{emoji}</text>;
}

function Badge({ x, y, t, arriveStart, arriveEnd, label, scalePulse = 0, width = 96, filled = false, tone = ACCENT }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; scalePulse?: number; width?: number; filled?: boolean; tone?: string }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const h = 28;
  const bx = x - width / 2, by = y - h / 2;
  const scale = lerp(0.85, 1, p) * (1 + 0.04 * scalePulse);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={14} fill={filled ? tone : "#ffffff"} stroke={tone} strokeWidth={1.3}
        style={{ filter: `drop-shadow(0 4px 10px rgba(91,61,240,0.2))` }} />
      {!filled && <path d={`M${bx + 2},${by + 2} l10,0 M${bx + 2},${by + 2} l0,10`} stroke={tone} strokeWidth={1.3} strokeLinecap="round" fill="none" />}
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11}
        letterSpacing={1.1} fill={filled ? "#ffffff" : tone} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function Chip({ x, y, t, start, end, label, tone = "accent", width = 118, fontSize = 9.5 }:
  { x: number; y: number; t: number; start: number; end: number; label: string; tone?: "muted" | "accent" | "filled" | "warn"; width?: number; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 24;
  const bx = x - width / 2, by = y - h / 2;
  const tColor = tone === "warn" ? WARN : ACCENT;
  const fill = tone === "filled" ? tColor : "#ffffff";
  const stroke = tone === "muted" ? LINE : tColor;
  const textFill = tone === "filled" ? "#ffffff" : tone === "muted" ? MUTED : tColor;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.1} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.4} fill={textFill}
        style={{ textTransform: tone === "muted" ? "none" : "uppercase" }}>{label}</text>
    </g>
  );
}

/* Tiny abstract "chart card" glyph: a rounded rect with a sparkline
   path inside. Reused here to stand in for a marketer's actual
   track record — the visual argument for "results, not resumes." */
function WidgetCard({ x, y, t, start, end, w = 130, h = 84, path, fade = 1 }:
  { x: number; y: number; t: number; start: number; end: number; w?: number; h?: number; path: string; fade?: number }) {
  const p = prog(t, start, end);
  return (
    <g opacity={p * fade}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={10} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      <path d={path} transform={`translate(${x - w / 2 + 10},${y})`} fill="none" stroke={ACCENT} strokeWidth={1.4} opacity={0.75} />
    </g>
  );
}

const SPARK_A = "M0,10 L14,2 L28,14 L42,-6 L56,4 L70,-10 L84,0";
const SPARK_B = "M0,-4 L14,8 L28,-8 L42,2 L56,-2 L70,10 L84,-6";

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
================================================================= */

/* ---- S1 — pulling back from the product ---- */
const S1_GHOST = { start: SEG.S1.start, end: SEG.S1.start + 900 };
const S1_RING = { start: SEG.S1.start + 200, end: SEG.S1.end - 250 };
const S1_LINES = { start: SEG.S1.start + 350, end: SEG.S1.end - 150 };

/* ---- S2 — the marketplace vision: Businesses <-> VSTRK <-> Marketers ---- */
const HUB = { x: 480, y: 260 };
const BIZ_NODES = [{ x: 150, y: 185 }, { x: 118, y: 260 }, { x: 150, y: 335 }];
const MKT_NODES = [{ x: 810, y: 185 }, { x: 842, y: 260 }, { x: 810, y: 335 }];

const S2_HEAD_IN = { start: SEG.S2.start + 100, end: SEG.S2.start + 550 };
const S2_BIZ_STAGGER = 260;
const S2_BIZ_NODES_IN = BIZ_NODES.map((_, i) => ({
  start: SEG.S2.start + 650 + i * S2_BIZ_STAGGER, end: SEG.S2.start + 650 + i * S2_BIZ_STAGGER + 420,
}));
const S2_BIZ_LABEL_IN = { start: S2_BIZ_NODES_IN[2].end + 100, end: S2_BIZ_NODES_IN[2].end + 450 };
const S2_HUB_IN = { start: SEG.S2.start + 2350, end: SEG.S2.start + 2900 };
const S2_LINE_BIZ_IN = BIZ_NODES.map((_, i) => ({
  start: S2_HUB_IN.end + 100 + i * 180, end: S2_HUB_IN.end + 100 + i * 180 + 420,
}));
const S2_CHIP_DISCOVER = { start: S2_LINE_BIZ_IN[2].end + 100, end: S2_LINE_BIZ_IN[2].end + 550 };

const S2_MKT_STAGGER = 260;
const S2_MKT_NODES_IN = MKT_NODES.map((_, i) => ({
  start: S2_CHIP_DISCOVER.end + 250 + i * S2_MKT_STAGGER, end: S2_CHIP_DISCOVER.end + 250 + i * S2_MKT_STAGGER + 420,
}));
const S2_MKT_LABEL_IN = { start: S2_MKT_NODES_IN[2].end + 100, end: S2_MKT_NODES_IN[2].end + 450 };
const S2_LINE_MKT_IN = MKT_NODES.map((_, i) => ({
  start: S2_MKT_LABEL_IN.end + 100 + i * 180, end: S2_MKT_LABEL_IN.end + 100 + i * 180 + 420,
}));
const S2_CHIP_CONNECT = { start: S2_LINE_MKT_IN[2].end + 100, end: S2_LINE_MKT_IN[2].end + 550 };
const S2_NETWORK_PULSE = { start: S2_CHIP_CONNECT.end + 150, end: SEG.S2.end - 150 };

/* ---- S3-S4 — great marketers, growing businesses, results as proof ---- */
const S3_TITLE_IN = { start: SEG.S3.start + 100, end: SEG.S3.start + 550 };
const PERSON_A_START = { x: 260, y: 230 };
const PERSON_A_END = { x: 400, y: 230 };
const PERSON_B_START = { x: 700, y: 230 };
const PERSON_B_END = { x: 560, y: 230 };
const S3_PEOPLE_IN = { start: SEG.S3.start + 500, end: SEG.S3.start + 900 };
const S3_CONVERGE = { start: SEG.S3.start + 900, end: SEG.S3.end - 250 };
const S3_LINE_IN = { start: S3_CONVERGE.end - 400, end: SEG.S3.end - 100 };

const S4_SWAP = { start: SEG.S4.start + 150, end: SEG.S4.start + 650 };
const S4_EYE_IN = { start: SEG.S4.start + 900, end: SEG.S4.start + 1400 };
const S4_NOTE_IN = { start: SEG.S4.start + 1600, end: SEG.S4.end - 300 };
const S4_PULSE = { start: S4_EYE_IN.end + 150, end: SEG.S4.end - 200 };

/* ---- S5 — VSTRK brand reveal ---- */
const S5_WORDMARK_IN = { start: SEG.S5.start + 200, end: SEG.S5.start + 900 };
const S5_RING = { start: S5_WORDMARK_IN.end + 100, end: SEG.S5.end - 150 };

/* ---- S6 — final tagline ---- */
const S6_TAG_IN = { start: SEG.S6.start + 250, end: SEG.S6.start + 950 };
const S6_HOLD_PULSE = { start: S6_TAG_IN.end + 200, end: SEG.S6.end - 300 };

export interface OnboardingVideoSection06Props {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingVideoSection06({ onSkip, onComplete }: OnboardingVideoSection06Props = {}) {
  const [elapsed, setElapsed] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let raf: number;
    const startedAt = performance.now();
    function loop(now: number) {
      const t = now - startedAt;
      setElapsed(Math.min(t, TOTAL));
      if (t < TOTAL) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runId]);

  const t = elapsed;
  const finished = t >= TOTAL;
  const replay = () => { setElapsed(0); setRunId((id) => id + 1); };

  /* ---------------- Group opacities (contiguous visual scenes) ---------------- */
  const pullbackOpacity = segOpacity(t, "S1");
  const marketplaceOpacity = segOpacity(t, "S2");
  const resultsOpacity = rangeOpacity(t, "S3", "S4");
  const brandOpacity = rangeOpacity(t, "S5", "S6");
  const finalFadeOut = t > SEG.S6.end - 500 ? 1 - prog(t, SEG.S6.end - 500, SEG.S6.end - 60) : 1;

  /* ---------------- S1 — pulling back ---------------- */
  const ghostOpacity = fadeWindow(t, S1_GHOST.start, S1_GHOST.start + 150, S1_GHOST.start + 150, S1_GHOST.end) * 0.4;
  const ghostShift = -18 * prog(t, S1_GHOST.start, S1_GHOST.end);
  const s1RingP = prog(t, S1_RING.start, S1_RING.end);
  const s1RingOpacity = fadeWindow(t, S1_RING.start, S1_RING.start + 250, S1_RING.end - 200, S1_RING.end);
  const s1LineP = prog(t, S1_LINES.start, S1_LINES.end);

  /* ---------------- S2 — hub pulse once network completes ---------------- */
  const s2PulseVal = t > S2_NETWORK_PULSE.start && t < S2_NETWORK_PULSE.end
    ? Math.sin(prog(t, S2_NETWORK_PULSE.start, S2_NETWORK_PULSE.end) * Math.PI) : 0;

  /* ---------------- S3 — converging positions ---------------- */
  const convergeP = prog(t, S3_CONVERGE.start, S3_CONVERGE.end);
  const personAx = lerp(PERSON_A_START.x, PERSON_A_END.x, convergeP);
  const personBx = lerp(PERSON_B_START.x, PERSON_B_END.x, convergeP);
  const peopleOpacity = prog(t, S3_PEOPLE_IN.start, S3_PEOPLE_IN.end);

  /* ---------------- S4 — swap people for results cards ---------------- */
  const swapP = prog(t, S4_SWAP.start, S4_SWAP.end);
  const s4PulseVal = t > S4_PULSE.start && t < S4_PULSE.end ? Math.sin(prog(t, S4_PULSE.start, S4_PULSE.end) * Math.PI) : 0;

  /* ---------------- S5 — wordmark ring pulse ---------------- */
  const s5RingVal = t > S5_RING.start && t < S5_RING.end ? Math.sin(prog(t, S5_RING.start, S5_RING.end) * Math.PI) : 0;

  /* ---------------- S6 — tagline hold pulse ---------------- */
  const s6PulseVal = t > S6_HOLD_PULSE.start && t < S6_HOLD_PULSE.end ? Math.sin(prog(t, S6_HOLD_PULSE.start, S6_HOLD_PULSE.end) * Math.PI) : 0;

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1 — pulling back from the product ================= */}
          <g opacity={pullbackOpacity}>
            <text x={480} y={96} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={20} letterSpacing={3} fill={ACCENT}
              opacity={ghostOpacity} style={{ transform: `translateY(${ghostShift}px)` }}>VSTRK</text>

            <circle cx={480} cy={280} r={40 + s1RingP * 160} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s1RingOpacity * 0.5} />
            <circle cx={480} cy={280} r={6} fill={ACCENT} opacity={0.4 + 0.3 * s1RingP} />

            <DrawLine d={`M${480 - 260 * s1LineP},280 L${480 - 30},280`} t={t} start={S1_LINES.start} end={S1_LINES.end} width={1} color={LINE} />
            <DrawLine d={`M${480 + 30},280 L${480 + 260 * s1LineP},280`} t={t} start={S1_LINES.start} end={S1_LINES.end} width={1} color={LINE} />

            <text x={480} y={380} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.6} fill={MUTED}
              opacity={fadeWindow(t, S1_LINES.end - 150, S1_LINES.end + 150, SEG.S1.end - 200, SEG.S1.end)} style={{ textTransform: "uppercase" }}>
              there's more beyond the dashboard
            </text>
          </g>

          {/* ================= S2 — the marketplace vision ================= */}
          <g opacity={marketplaceOpacity}>
            <Badge x={480} y={70} t={t} arriveStart={S2_HEAD_IN.start} arriveEnd={S2_HEAD_IN.end} label="The Marketplace Vision" width={330} filled />

            {BIZ_NODES.map((n, i) => (
              <Person key={`biz-${i}`} x={n.x} y={n.y} size={26} emoji="🏢" opacity={prog(t, S2_BIZ_NODES_IN[i].start, S2_BIZ_NODES_IN[i].end)} />
            ))}
            <Badge x={134} y={410} t={t} arriveStart={S2_BIZ_LABEL_IN.start} arriveEnd={S2_BIZ_LABEL_IN.end} label="Businesses" width={150} />

            {MKT_NODES.map((n, i) => (
              <Person key={`mkt-${i}`} x={n.x} y={n.y} size={26} emoji="🧑" opacity={prog(t, S2_MKT_NODES_IN[i].start, S2_MKT_NODES_IN[i].end)} />
            ))}
            <Badge x={826} y={410} t={t} arriveStart={S2_MKT_LABEL_IN.start} arriveEnd={S2_MKT_LABEL_IN.end} label="Marketers" width={150} />

            {BIZ_NODES.map((n, i) => (
              <DrawLine key={`line-biz-${i}`} d={`M${n.x},${n.y} L${HUB.x},${HUB.y}`} t={t}
                start={S2_LINE_BIZ_IN[i].start} end={S2_LINE_BIZ_IN[i].end} width={1.1} color={ACCENT} opacity={0.55} />
            ))}
            {MKT_NODES.map((n, i) => (
              <DrawLine key={`line-mkt-${i}`} d={`M${n.x},${n.y} L${HUB.x},${HUB.y}`} t={t}
                start={S2_LINE_MKT_IN[i].start} end={S2_LINE_MKT_IN[i].end} width={1.1} color={ACCENT} opacity={0.55} />
            ))}

            <circle cx={HUB.x} cy={HUB.y} r={30 + s2PulseVal * 20} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s2PulseVal * 0.5} />
            <Badge x={HUB.x} y={HUB.y} t={t} arriveStart={S2_HUB_IN.start} arriveEnd={S2_HUB_IN.end} label="VSTRK" width={110} filled />

            <Chip x={300} y={210} t={t} start={S2_CHIP_DISCOVER.start} end={S2_CHIP_DISCOVER.end} label="Discover Proven Talent" tone="accent" width={220} />
            <Chip x={660} y={210} t={t} start={S2_CHIP_CONNECT.start} end={S2_CHIP_CONNECT.end} label="Connect With Businesses" tone="accent" width={230} />
          </g>

          {/* ================= S3-S4 — where they find each other, results as proof ================= */}
          <g opacity={resultsOpacity}>
            <text x={480} y={90} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1.2} fill={ACCENT}
              opacity={prog(t, S3_TITLE_IN.start, S3_TITLE_IN.end)} style={{ textTransform: "uppercase" }}>
              Where They Find Each Other
            </text>

            <g opacity={peopleOpacity * (1 - swapP)}>
              <Person x={personAx} y={PERSON_A_START.y} size={32} emoji="🧑" />
              <Person x={personBx} y={PERSON_B_START.y} size={32} emoji="🏢" />
            </g>

            <g opacity={swapP}>
              <WidgetCard x={PERSON_A_END.x} y={PERSON_A_END.y} t={t} start={S4_SWAP.start} end={S4_SWAP.end} path={SPARK_A} w={128} h={80} />
              <WidgetCard x={PERSON_B_END.x} y={PERSON_B_END.y} t={t} start={S4_SWAP.start} end={S4_SWAP.end} path={SPARK_B} w={128} h={80} />
            </g>

            <DrawLine d={`M${PERSON_A_END.x + 40},${PERSON_A_END.y} L${PERSON_B_END.x - 40},${PERSON_B_END.y}`} t={t}
              start={S3_LINE_IN.start} end={S3_LINE_IN.end} width={1.2} color={ACCENT} dash="3 6" />

            <circle cx={480} cy={PERSON_A_END.y + 110} r={5.5} fill="none" opacity={0} />
            <EyeNode x={480} y={PERSON_A_END.y + 116} t={t} arriveStart={S4_EYE_IN.start} arriveEnd={S4_EYE_IN.end}
              label="See Their Results" labelSide="center" r={7} pulse={s4PulseVal * 0.5} />
            <text x={480} y={PERSON_A_END.y + 116 + 34} textAnchor="middle" fontFamily={MONO} fontSize={5} opacity={0}> </text>

            <text x={480} y={PERSON_A_END.y + 170} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.5} fill={MUTED}
              opacity={fadeWindow(t, S4_NOTE_IN.start, S4_NOTE_IN.end, SEG.S4.end - 150, SEG.S4.end)} style={{ textTransform: "uppercase" }}>
              not resumes — results
            </text>
          </g>

          {/* ================= S5-S6 — VSTRK brand reveal + final tagline ================= */}
          <g opacity={brandOpacity}>
            <g style={{ transformOrigin: "480px 250px", transform: `scale(${1 + 0.03 * s5RingVal})` }}>
              <text x={480} y={258} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={58} letterSpacing={3} fill={INK}
                opacity={prog(t, S5_WORDMARK_IN.start, S5_WORDMARK_IN.end)}>VSTRK</text>
              <circle cx={480} cy={232} r={96 + s5RingVal * 22} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s5RingVal * 0.4} />
            </g>

            <g style={{ transformOrigin: "480px 340px", transform: `scale(${1 + 0.02 * s6PulseVal})` }}>
              <text x={480} y={346} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={22} letterSpacing={2.6} fill={ACCENT}
                opacity={prog(t, S6_TAG_IN.start, S6_TAG_IN.end)} style={{ textTransform: "uppercase" }}>
                Track. Attribute. Grow.
              </text>
            </g>
          </g>
        </svg>
      </div>

      {/* ---------- Caption bar ---------- */}
      <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 6 }}>
        {CAPTIONS.map((c, i) => {
          const op = fadeWindow(t, c.a, c.b, c.c, c.d);
          if (op <= 0.001) return null;
          return (
            <p key={i} style={{
              position: "absolute", margin: 0, fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
              fontSize: 22, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center",
              whiteSpace: "pre-line", lineHeight: 1.35,
            }}>
              {c.text}
            </p>
          );
        })}
      </div>

      {/* ---------- Playback controls ---------- */}
      {!finished ? (
        <button type="button" onClick={onSkip} style={{
          position: "absolute", top: 14, right: 18,
          display: "flex", alignItems: "center", gap: 5,
          background: "rgba(255,255,255,0.9)", border: `1px solid ${LINE}`,
          borderRadius: 999, fontFamily: MONO, fontSize: 10.5,
          fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
          color: "#6b6b78", cursor: "pointer", padding: "7px 14px",
        }}>
          Skip video <span aria-hidden="true">→</span>
        </button>
      ) : (
        <div style={{ position: "absolute", bottom: 14, right: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <button type="button" onClick={replay} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 11, letterSpacing: 0.4, color: "#9a9aa8", cursor: "pointer", padding: 4 }}>
            ↻ replay
          </button>
          <button type="button" onClick={onComplete} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: ACCENT, border: "none", borderRadius: 8,
            fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
            letterSpacing: 0.6, textTransform: "uppercase",
            color: "#ffffff", cursor: "pointer", padding: "10px 18px",
            boxShadow: `0 8px 20px rgba(91,61,240,0.35)`,
          }}>
            Get started <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
