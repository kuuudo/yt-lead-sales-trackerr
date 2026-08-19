import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, SECTION 07 — "Where To Install Global Attribution"

   Standalone, modular scene file. Independently renderable — does
   NOT require Sections 01-06 to be mounted. It regenerates the same
   visual language, primitives and timing philosophy locally (no
   import-time dependency), the way Section 06 stayed self-contained
   from the sections before it.

   STORY: A short, beginner-friendly installation walkthrough. The
   viewer already knows VSTRK tracks revenue attribution; this
   section teaches exactly *where* the Global Attribution script
   goes in a typical visitor journey (Website/Landing Page → Checkout
   or Booking → Thank-You Page), reassures them it's simple, shows
   them copying the script into their site (ideally a global header
   / site-wide code area), and closes by reminding them they're not
   on their own — they can ask Claude or reach the support group.

   PRODUCT GROUNDING:
     - Global Attribution is a website-level tracking script. It
       installs on Step 1 (Website / Landing Page), not on Checkout
       or the Thank-You Page.
     - VSTRK also has a separate Thank-You Page Pixel (Step 3,
       completed-action level) — the two are deliberately kept
       visually distinct in the closing recap so viewers never
       confuse "install the site-wide script" with "install the
       completion pixel."
     - No technical implementation detail (localStorage, JS, cookies,
       APIs, schemas) is shown — this is a "where," not a "how."
     - The narration is used verbatim, word-for-word, exactly as
       supplied, split one beat per instructional sentence, matching
       Section 06's one-sentence-per-beat philosophy.

   REUSED FROM SECTIONS 01-06 (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp / segOpacity / rangeOpacity  (timing math)
     - DrawLine, EyeNode, Person, Badge, Chip                        (visual primitives)
     - the violet corner-tick Badge grammar for product-concept badges
     - the accent Chip grammar for tags/short phrases
     - autoCaption() — identical single-sentence caption derivation

   NEW IN THIS FILE:
     - StepCard() — a small "website step" card (number + label),
       used to build the Website → Checkout → Thank-You journey row.
       Built from the same rect/stroke/shadow grammar as Badge, just
       sized for a step in a journey rather than a short label.
     - ChatBubble() — a minimal chat-bubble glyph for the "ask Claude"
       beat, built from the same rect/shadow grammar as WidgetCard.
     - A silent RECAP beat after the final voiceover line: no new
       narration is added (the brief is followed word-for-word), but
       the visuals hold on the locked distinction between Global
       Attribution (Step 1) and the Thank-You Page Pixel (Step 3)
       before the video ends.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const WARN = "#d3555c";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — one beat per exact narration unit (8 beats, one per
   instructional sentence), played back to back with a 280ms
   cross-fade gap, same philosophy as Sections 01-06. S3 (installing
   on Step 1) is the single most important beat in the whole video —
   it gets the clearest, most held visual. A silent RECAP beat plays
   after S8 with no new narration, just a final visual hold on the
   Global Attribution vs. Thank-You Page Pixel distinction.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "Don't worry — this is simple.", 1900],
  ["S2", "First, remember your website structure:\n\n1. Website / Landing Page → 2. Checkout or Booking → 3. Thank-You Page", 5300],
  ["S3", "For Global Attribution, you want to install the script on Step 1 — your website or landing page.", 5500],
  ["S4", "Simply copy the Global Attribution script and add it to your website.", 3900],
  ["S5", "If your website has a global header or site-wide code section, that is usually the best place to add it.", 6500],
  ["S6", "And don't worry if you're not sure where to put it.", 3600],
  ["S7", "If you're worried about whether the code is safe, you can ask Claude to explain it to you.", 5900],
  ["S8", "And if you're not sure where to install it, you can also ask Claude or join our support group and we'll help you.", 7500],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
/* Silent visual-only recap after the last voiceover line — no new narration. */
const RECAP = { start: SEG.S8.end + 250, end: SEG.S8.end + 250 + 2700 };
const TOTAL = RECAP.end + 700;

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

/* Derives caption fade timing directly from a beat's SEG window —
   identical single-sentence helper from Section 06. */
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

/* ---------------- Visual primitives — regenerated from Sections 01-06 ---------------- */

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

/* NEW — a "website step" card: number + label, used to build the
   Website → Checkout → Thank-You journey row. Same rect/stroke/
   shadow grammar as Badge, sized for a journey step. */
function StepCard({ x, y, t, arriveStart, arriveEnd, number, label, sublabel, width = 190, height = 96, dim = false, highlightP = 0 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; number: number; label: string; sublabel?: string; width?: number; height?: number; dim?: boolean; highlightP?: number }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const bx = x - width / 2, by = y - height / 2;
  const scale = lerp(0.9, 1, p);
  const baseOpacity = dim ? 0.32 : 1;
  const strokeColor = highlightP > 0.01 ? ACCENT : LINE;
  const strokeW = lerp(1.2, 2.2, highlightP);
  return (
    <g opacity={p * baseOpacity} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      {highlightP > 0.01 && (
        <rect x={bx - 8} y={by - 8} width={width + 16} height={height + 16} rx={18} fill="none"
          stroke={ACCENT} strokeWidth={1} opacity={0.35 * highlightP} />
      )}
      <rect x={bx} y={by} width={width} height={height} rx={14} fill="#ffffff" stroke={strokeColor} strokeWidth={strokeW}
        style={{ filter: "drop-shadow(0 4px 12px rgba(21,21,31,0.07))" }} />
      <circle cx={bx + 24} cy={by + 24} r={13} fill={highlightP > 0.01 ? ACCENT : "#ffffff"} stroke={ACCENT} strokeWidth={1.3} />
      <text x={bx + 24} y={by + 24} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={12}
        fill={highlightP > 0.01 ? "#ffffff" : ACCENT}>{number}</text>
      <text x={x} y={by + height / 2 + 8} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={12.5}
        letterSpacing={0.2} fill={INK} style={{ textTransform: "uppercase" }}>{label}</text>
      {sublabel && (
        <text x={x} y={by + height - 14} textAnchor="middle" fontFamily={MONO} fontSize={9.5} letterSpacing={0.3} fill={MUTED}>
          {sublabel}
        </text>
      )}
    </g>
  );
}

/* NEW — minimal chat-bubble glyph for the "ask Claude" beat. Same
   rect/shadow grammar as a WidgetCard, just shaped like a bubble. */
function ChatBubble({ x, y, t, start, end, text, fromUser = false, width = 260 }:
  { x: number; y: number; t: number; start: number; end: number; text: string; fromUser?: boolean; width?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 44;
  const bx = fromUser ? x - width : x;
  const fill = fromUser ? "#ffffff" : ACCENT;
  const stroke = fromUser ? LINE : ACCENT;
  const textFill = fromUser ? INK : "#ffffff";
  const tx = fromUser ? bx + width / 2 : bx + width / 2;
  return (
    <g opacity={p} style={{ transformOrigin: `${fromUser ? bx + width : bx}px ${y}px`, transform: `scale(${lerp(0.92, 1, p)})` }}>
      <rect x={bx} y={y - h / 2} width={width} height={h} rx={16} fill={fill} stroke={stroke} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 4px 10px rgba(21,21,31,0.08))" }} />
      <text x={tx} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={600} fontSize={11.5} fill={textFill}>
        {text}
      </text>
    </g>
  );
}

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
================================================================= */

const JOURNEY_Y = 260;
const CARD1 = { x: 200, y: JOURNEY_Y };
const CARD2 = { x: 480, y: JOURNEY_Y };
const CARD3 = { x: 760, y: JOURNEY_Y };

/* ---- S1 — "don't worry, this is simple" ---- */
const S1_RING = { start: SEG.S1.start + 150, end: SEG.S1.end - 150 };
const S1_CHECK_IN = { start: SEG.S1.start + 250, end: SEG.S1.start + 750 };
const S1_NOTE_IN = { start: SEG.S1.start + 800, end: SEG.S1.end - 200 };

/* ---- S2 — build the three-step website journey ---- */
const S2_HEAD_IN = { start: SEG.S2.start + 100, end: SEG.S2.start + 550 };
const S2_CARD1_IN = { start: SEG.S2.start + 650, end: SEG.S2.start + 1100 };
const S2_ARROW1_IN = { start: SEG.S2.start + 1150, end: SEG.S2.start + 1500 };
const S2_CARD2_IN = { start: SEG.S2.start + 1550, end: SEG.S2.start + 2000 };
const S2_ARROW2_IN = { start: SEG.S2.start + 2050, end: SEG.S2.start + 2400 };
const S2_CARD3_IN = { start: SEG.S2.start + 2450, end: SEG.S2.start + 2900 };
const S2_ROW_LABEL_IN = { start: SEG.S2.start + 3050, end: SEG.S2.start + 3450 };

/* ---- S3 — highlight Step 1 (the single most important beat) ---- */
const S3_CARDS_IN = { start: SEG.S3.start + 80, end: SEG.S3.start + 350 };
const S3_BADGE_IN = { start: SEG.S3.start + 400, end: SEG.S3.start + 900 };
const S3_ARROW_DOWN_IN = { start: SEG.S3.start + 950, end: SEG.S3.start + 1350 };
const S3_STEP_TAG_IN = { start: SEG.S3.start + 1400, end: SEG.S3.start + 1800 };
const S3_PULSE = { start: S3_STEP_TAG_IN.end + 150, end: SEG.S3.end - 300 };

/* ---- S4 — copy the script, add it to your website ---- */
const S4_CODE_IN = { start: SEG.S4.start + 150, end: SEG.S4.start + 650 };
const S4_COPY_LABEL_IN = { start: SEG.S4.start + 700, end: SEG.S4.start + 1050 };
const S4_ARROW_IN = { start: SEG.S4.start + 1100, end: SEG.S4.start + 1500 };
const S4_SITE_CARD_IN = { start: SEG.S4.start + 1550, end: SEG.S4.start + 1950 };
const S4_CHECK_PULSE = { start: SEG.S4.end - 500, end: SEG.S4.end - 150 };

/* ---- S5 — global header / site-wide code is usually best ---- */
const S5_PANEL_IN = { start: SEG.S5.start + 150, end: SEG.S5.start + 700 };
const S5_ROW_GENERAL_IN = { start: SEG.S5.start + 750, end: SEG.S5.start + 1050 };
const S5_ROW_DOMAINS_IN = { start: SEG.S5.start + 1100, end: SEG.S5.start + 1400 };
const S5_ROW_HEADER_IN = { start: SEG.S5.start + 1450, end: SEG.S5.start + 1900 };
const S5_CHIP_MOVE = { start: SEG.S5.start + 2000, end: SEG.S5.start + 2700 };
const S5_CONFIRM_PULSE = { start: SEG.S5.end - 550, end: SEG.S5.end - 200 };

/* ---- S6 — reassurance ---- */
const S6_PERSON_IN = { start: SEG.S6.start + 150, end: SEG.S6.start + 600 };
const S6_NOTE_IN = { start: SEG.S6.start + 650, end: SEG.S6.end - 200 };

/* ---- S7 — ask Claude if the code feels unsafe ---- */
const S7_USER_BUBBLE_IN = { start: SEG.S7.start + 150, end: SEG.S7.start + 650 };
const S7_CLAUDE_BUBBLE_IN = { start: SEG.S7.start + 900, end: SEG.S7.start + 1450 };
const S7_NOTE_IN = { start: SEG.S7.start + 1550, end: SEG.S7.end - 250 };

/* ---- S8 — ask Claude or join support ---- */
const S8_CHIP_CLAUDE_IN = { start: SEG.S8.start + 150, end: SEG.S8.start + 650 };
const S8_CHIP_SUPPORT_IN = { start: SEG.S8.start + 750, end: SEG.S8.start + 1250 };
const S8_HUB_IN = { start: SEG.S8.start + 1350, end: SEG.S8.start + 1850 };
const S8_PULSE = { start: S8_HUB_IN.end + 150, end: SEG.S8.end - 300 };

/* ---- RECAP — silent, no new narration: lock the two-pixel distinction ---- */
const RECAP_IN = { start: RECAP.start + 150, end: RECAP.start + 650 };
const RECAP_TAG1_IN = { start: RECAP.start + 750, end: RECAP.start + 1150 };
const RECAP_TAG3_IN = { start: RECAP.start + 1250, end: RECAP.start + 1650 };

export interface OnboardingVideoSection07Props {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingVideoSection07({ onSkip, onComplete }: OnboardingVideoSection07Props = {}) {
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
  const s1Opacity = segOpacity(t, "S1");
  const s2Opacity = segOpacity(t, "S2");
  const s3Opacity = segOpacity(t, "S3");
  const s4Opacity = segOpacity(t, "S4");
  const s5Opacity = segOpacity(t, "S5");
  const s6Opacity = segOpacity(t, "S6");
  const s7Opacity = segOpacity(t, "S7");
  const s8Opacity = segOpacity(t, "S8");
  const recapOpacity = fadeWindow(t, RECAP.start, RECAP.start + 300, RECAP.end - 350, RECAP.end);
  const finalFadeOut = t > RECAP.end - 500 ? 1 - prog(t, RECAP.end - 500, RECAP.end - 60) : 1;

  /* ---------------- S1 ---------------- */
  const s1RingP = prog(t, S1_RING.start, S1_RING.end);
  const s1RingPulse = t > S1_RING.start && t < S1_RING.end ? Math.sin(prog(t, S1_RING.start, S1_RING.end) * Math.PI) : 0;
  const s1CheckP = prog(t, S1_CHECK_IN.start, S1_CHECK_IN.end);

  /* ---------------- S3 — highlight ring pulse on Step 1 ---------------- */
  const s3PulseVal = t > S3_PULSE.start && t < S3_PULSE.end ? 0.5 + 0.5 * Math.sin(prog(t, S3_PULSE.start, S3_PULSE.end) * Math.PI * 3) : 0;
  const s3HighlightP = prog(t, S3_BADGE_IN.start, S3_BADGE_IN.end);

  /* ---------------- S4 — checkmark confirm pulse ---------------- */
  const s4CheckVal = t > S4_CHECK_PULSE.start && t < S4_CHECK_PULSE.end ? Math.sin(prog(t, S4_CHECK_PULSE.start, S4_CHECK_PULSE.end) * Math.PI) : 0;

  /* ---------------- S5 — script chip sliding into the Global Header row ---------------- */
  const s5MoveP = prog(t, S5_CHIP_MOVE.start, S5_CHIP_MOVE.end);
  const s5ChipX = lerp(480, 700, s5MoveP);
  const s5ChipY = lerp(180, 300, s5MoveP);
  const s5ConfirmVal = t > S5_CONFIRM_PULSE.start && t < S5_CONFIRM_PULSE.end ? Math.sin(prog(t, S5_CONFIRM_PULSE.start, S5_CONFIRM_PULSE.end) * Math.PI) : 0;

  /* ---------------- S8 — converge to a single reassuring hub ---------------- */
  const s8PulseVal = t > S8_PULSE.start && t < S8_PULSE.end ? Math.sin(prog(t, S8_PULSE.start, S8_PULSE.end) * Math.PI) : 0;

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1 — "don't worry, this is simple" ================= */}
          <g opacity={s1Opacity}>
            <circle cx={480} cy={230} r={38 + s1RingPulse * 14} fill="none" stroke={ACCENT} strokeWidth={1} opacity={0.35 + 0.25 * s1RingPulse} />
            <circle cx={480} cy={230} r={54} fill="#ffffff" stroke={LINE} strokeWidth={1.2} opacity={s1RingP}
              style={{ filter: "drop-shadow(0 6px 16px rgba(21,21,31,0.08))" }} />
            <path d="M458,230 l16,16 l30,-34" fill="none" stroke={ACCENT} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - s1CheckP} />
            <text x={480} y={330} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.6} fill={MUTED}
              opacity={fadeWindow(t, S1_NOTE_IN.start, S1_NOTE_IN.end, SEG.S1.end - 150, SEG.S1.end)} style={{ textTransform: "uppercase" }}>
              no code experience needed
            </text>
          </g>

          {/* ================= S2 — build the three-step website journey ================= */}
          <g opacity={s2Opacity}>
            <Badge x={480} y={78} t={t} arriveStart={S2_HEAD_IN.start} arriveEnd={S2_HEAD_IN.end} label="Your Visitor Journey" width={280} filled />

            <StepCard x={CARD1.x} y={CARD1.y} t={t} arriveStart={S2_CARD1_IN.start} arriveEnd={S2_CARD1_IN.end}
              number={1} label="Website /" sublabel="Landing Page" />
            <text x={340} y={JOURNEY_Y + 6} textAnchor="middle" fontFamily={MONO} fontSize={22} fill={MUTED}
              opacity={prog(t, S2_ARROW1_IN.start, S2_ARROW1_IN.end)}>→</text>

            <StepCard x={CARD2.x} y={CARD2.y} t={t} arriveStart={S2_CARD2_IN.start} arriveEnd={S2_CARD2_IN.end}
              number={2} label="Checkout or" sublabel="Booking" />
            <text x={620} y={JOURNEY_Y + 6} textAnchor="middle" fontFamily={MONO} fontSize={22} fill={MUTED}
              opacity={prog(t, S2_ARROW2_IN.start, S2_ARROW2_IN.end)}>→</text>

            <StepCard x={CARD3.x} y={CARD3.y} t={t} arriveStart={S2_CARD3_IN.start} arriveEnd={S2_CARD3_IN.end}
              number={3} label="Thank-You" sublabel="Page" />

            <text x={480} y={430} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.6} fill={MUTED}
              opacity={prog(t, S2_ROW_LABEL_IN.start, S2_ROW_LABEL_IN.end)} style={{ textTransform: "uppercase" }}>
              this is what every visitor walks through
            </text>
          </g>

          {/* ================= S3 — highlight Step 1 (the key moment) ================= */}
          <g opacity={s3Opacity}>
            <StepCard x={CARD1.x} y={CARD1.y} t={t} arriveStart={S3_CARDS_IN.start} arriveEnd={S3_CARDS_IN.end}
              number={1} label="Website /" sublabel="Landing Page" highlightP={s3HighlightP} />
            <text x={340} y={JOURNEY_Y + 6} textAnchor="middle" fontFamily={MONO} fontSize={22} fill={LINE}
              opacity={0.5 * prog(t, S3_CARDS_IN.start, S3_CARDS_IN.end)}>→</text>
            <StepCard x={CARD2.x} y={CARD2.y} t={t} arriveStart={S3_CARDS_IN.start} arriveEnd={S3_CARDS_IN.end}
              number={2} label="Checkout or" sublabel="Booking" dim />
            <text x={620} y={JOURNEY_Y + 6} textAnchor="middle" fontFamily={MONO} fontSize={22} fill={LINE}
              opacity={0.5 * prog(t, S3_CARDS_IN.start, S3_CARDS_IN.end)}>→</text>
            <StepCard x={CARD3.x} y={CARD3.y} t={t} arriveStart={S3_CARDS_IN.start} arriveEnd={S3_CARDS_IN.end}
              number={3} label="Thank-You" sublabel="Page" dim />

            <Badge x={CARD1.x} y={90} t={t} arriveStart={S3_BADGE_IN.start} arriveEnd={S3_BADGE_IN.end}
              label="Global Attribution" width={210} filled scalePulse={s3PulseVal} />
            <DrawLine d={`M${CARD1.x},108 L${CARD1.x},${CARD1.y - 56}`} t={t} start={S3_ARROW_DOWN_IN.start} end={S3_ARROW_DOWN_IN.end}
              width={1.6} color={ACCENT} />
            <text x={CARD1.x} y={CARD1.y - 60} textAnchor="middle" fontFamily={MONO} fontSize={14} fill={ACCENT}
              opacity={prog(t, S3_ARROW_DOWN_IN.start, S3_ARROW_DOWN_IN.end)}>↓</text>

            <g opacity={prog(t, S3_STEP_TAG_IN.start, S3_STEP_TAG_IN.end)}>
              <rect x={CARD1.x - 60} y={CARD1.y + 68} width={120} height={22} rx={11} fill={ACCENT} />
              <text x={CARD1.x} y={CARD1.y + 79} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9.5}
                letterSpacing={0.8} fill="#ffffff" style={{ textTransform: "uppercase" }}>Install Here</text>
            </g>
          </g>

          {/* ================= S4 — copy the script, add it to your website ================= */}
          <g opacity={s4Opacity}>
            <g opacity={prog(t, S4_CODE_IN.start, S4_CODE_IN.end)}>
              <rect x={330} y={130} width={300} height={54} rx={10} fill={INK} />
              <text x={480} y={157} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontSize={11} fill="#e7e7f0">
                &lt;script src="global-attribution.js"&gt;
              </text>
            </g>

            <text x={480} y={222} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11} letterSpacing={1}
              fill={ACCENT} opacity={prog(t, S4_COPY_LABEL_IN.start, S4_COPY_LABEL_IN.end)} style={{ textTransform: "uppercase" }}>
              Copy
            </text>

            <text x={480} y={264} textAnchor="middle" fontFamily={MONO} fontSize={20} fill={MUTED}
              opacity={prog(t, S4_ARROW_IN.start, S4_ARROW_IN.end)}>↓</text>

            <g opacity={prog(t, S4_SITE_CARD_IN.start, S4_SITE_CARD_IN.end)}>
              <rect x={355} y={300} width={250} height={90} rx={14} fill="#ffffff" stroke={ACCENT} strokeWidth={1.6}
                style={{ filter: "drop-shadow(0 6px 16px rgba(91,61,240,0.14))" }} />
              <text x={480} y={334} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={13} fill={INK}
                style={{ textTransform: "uppercase" }}>Your Website</text>
              <path d="M450,362 l14,14 l26,-30" fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
                opacity={0.5 + 0.5 * s4CheckVal} />
            </g>
          </g>

          {/* ================= S5 — global header / site-wide code is usually best ================= */}
          <g opacity={s5Opacity}>
            <rect x={330} y={110} width={300} height={230} rx={16} fill="#ffffff" stroke={LINE} strokeWidth={1.3}
              opacity={prog(t, S5_PANEL_IN.start, S5_PANEL_IN.end)} style={{ filter: "drop-shadow(0 8px 20px rgba(21,21,31,0.08))" }} />
            <text x={480} y={140} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={10} letterSpacing={1}
              fill={MUTED} opacity={prog(t, S5_PANEL_IN.start, S5_PANEL_IN.end)} style={{ textTransform: "uppercase" }}>
              Website Settings
            </text>

            <g opacity={prog(t, S5_ROW_GENERAL_IN.start, S5_ROW_GENERAL_IN.end) * 0.5}>
              <rect x={352} y={162} width={256} height={30} rx={8} fill="#f4f4f8" />
              <text x={366} y={177} dy="0.34em" fontFamily={MONO} fontSize={10.5} fill={MUTED}>General</text>
            </g>
            <g opacity={prog(t, S5_ROW_DOMAINS_IN.start, S5_ROW_DOMAINS_IN.end) * 0.5}>
              <rect x={352} y={200} width={256} height={30} rx={8} fill="#f4f4f8" />
              <text x={366} y={215} dy="0.34em" fontFamily={MONO} fontSize={10.5} fill={MUTED}>Domains</text>
            </g>
            <g opacity={prog(t, S5_ROW_HEADER_IN.start, S5_ROW_HEADER_IN.end)}>
              <rect x={352} y={238} width={256} height={34} rx={8} fill="#efeafd" stroke={ACCENT} strokeWidth={1.2} />
              <text x={366} y={255} dy="0.34em" fontFamily={MONO} fontWeight={700} fontSize={10.5} fill={ACCENT}>
                Global Header / Site-Wide Code
              </text>
            </g>

            <g opacity={s5MoveP} style={{ transform: `translate(${s5ChipX - 480}px, ${s5ChipY - 240}px)` }}>
              <rect x={430} y={228} width={100} height={26} rx={8} fill={INK} />
              <text x={480} y={241} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontSize={9} fill="#e7e7f0">
                &lt;script&gt;
              </text>
            </g>

            <path d="M598,255 l10,10 l18,-20" fill="none" stroke={ACCENT} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
              opacity={s5MoveP * (0.5 + 0.5 * s5ConfirmVal)} />

            <text x={480} y={368} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.5} fill={MUTED}
              opacity={fadeWindow(t, S5_ROW_HEADER_IN.start, S5_ROW_HEADER_IN.end, SEG.S5.end - 200, SEG.S5.end)} style={{ textTransform: "uppercase" }}>
              one place, applies to every page
            </text>
          </g>

          {/* ================= S6 — reassurance ================= */}
          <g opacity={s6Opacity}>
            <Person x={480} y={220} size={40} opacity={prog(t, S6_PERSON_IN.start, S6_PERSON_IN.end)} emoji="🙂" />
            <EyeNode x={480} y={280} t={t} arriveStart={S6_PERSON_IN.start} arriveEnd={S6_PERSON_IN.end} r={7} labelSide="center" />
            <text x={480} y={340} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.5} fill={MUTED}
              opacity={prog(t, S6_NOTE_IN.start, S6_NOTE_IN.end)} style={{ textTransform: "uppercase" }}>
              it's okay not to know yet
            </text>
          </g>

          {/* ================= S7 — ask Claude if the code feels unsafe ================= */}
          <g opacity={s7Opacity}>
            <ChatBubble x={220} y={200} t={t} start={S7_USER_BUBBLE_IN.start} end={S7_USER_BUBBLE_IN.end}
              text="Is this script safe?" fromUser width={260} />
            <ChatBubble x={480} y={280} t={t} start={S7_CLAUDE_BUBBLE_IN.start} end={S7_CLAUDE_BUBBLE_IN.end}
              text="Yes — here's what it does" width={280} />
            <text x={480} y={350} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.5} fill={MUTED}
              opacity={prog(t, S7_NOTE_IN.start, S7_NOTE_IN.end)} style={{ textTransform: "uppercase" }}>
              optional — just for your peace of mind
            </text>
          </g>

          {/* ================= S8 — ask Claude or join support ================= */}
          <g opacity={s8Opacity}>
            <Chip x={330} y={190} t={t} start={S8_CHIP_CLAUDE_IN.start} end={S8_CHIP_CLAUDE_IN.end} label="Ask Claude" tone="accent" width={170} />
            <Chip x={630} y={190} t={t} start={S8_CHIP_SUPPORT_IN.start} end={S8_CHIP_SUPPORT_IN.end} label="Join Support" tone="accent" width={170} />
            <DrawLine d="M330,204 L480,270" t={t} start={S8_HUB_IN.start} end={S8_HUB_IN.end} width={1.1} color={ACCENT} opacity={0.5} />
            <DrawLine d="M630,204 L480,270" t={t} start={S8_HUB_IN.start} end={S8_HUB_IN.end} width={1.1} color={ACCENT} opacity={0.5} />
            <circle cx={480} cy={280} r={26 + s8PulseVal * 10} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s8PulseVal * 0.5} />
            <Badge x={480} y={280} t={t} arriveStart={S8_HUB_IN.start} arriveEnd={S8_HUB_IN.end} label="You're Covered" width={160} filled />
          </g>

          {/* ================= RECAP — silent, no new narration ================= */}
          <g opacity={recapOpacity}>
            <text x={480} y={90} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1.2}
              fill={ACCENT} opacity={prog(t, RECAP_IN.start, RECAP_IN.end)} style={{ textTransform: "uppercase" }}>
              Two Different Install Points
            </text>

            <StepCard x={CARD1.x} y={CARD1.y} t={t} arriveStart={RECAP_IN.start} arriveEnd={RECAP_IN.end}
              number={1} label="Website /" sublabel="Landing Page" highlightP={1} />
            <text x={340} y={JOURNEY_Y + 6} textAnchor="middle" fontFamily={MONO} fontSize={22} fill={LINE}
              opacity={prog(t, RECAP_IN.start, RECAP_IN.end)}>→</text>
            <StepCard x={CARD2.x} y={CARD2.y} t={t} arriveStart={RECAP_IN.start} arriveEnd={RECAP_IN.end}
              number={2} label="Checkout or" sublabel="Booking" dim />
            <text x={620} y={JOURNEY_Y + 6} textAnchor="middle" fontFamily={MONO} fontSize={22} fill={LINE}
              opacity={prog(t, RECAP_IN.start, RECAP_IN.end)}>→</text>
            <StepCard x={CARD3.x} y={CARD3.y} t={t} arriveStart={RECAP_IN.start} arriveEnd={RECAP_IN.end}
              number={3} label="Thank-You" sublabel="Page" highlightP={1} />

            <g opacity={prog(t, RECAP_TAG1_IN.start, RECAP_TAG1_IN.end)}>
              <rect x={CARD1.x - 76} y={CARD1.y + 68} width={152} height={22} rx={11} fill={ACCENT} />
              <text x={CARD1.x} y={CARD1.y + 79} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9}
                letterSpacing={0.6} fill="#ffffff" style={{ textTransform: "uppercase" }}>Global Attribution</text>
            </g>
            <g opacity={prog(t, RECAP_TAG3_IN.start, RECAP_TAG3_IN.end)}>
              <rect x={CARD3.x - 84} y={CARD3.y + 68} width={168} height={22} rx={11} fill="#ffffff" stroke={ACCENT} strokeWidth={1.4} />
              <text x={CARD3.x} y={CARD3.y + 79} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9}
                letterSpacing={0.6} fill={ACCENT} style={{ textTransform: "uppercase" }}>Thank-You Page Pixel</text>
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
              fontSize: 20, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center",
              whiteSpace: "pre-line", lineHeight: 1.35, maxWidth: 640,
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
            Got it <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
