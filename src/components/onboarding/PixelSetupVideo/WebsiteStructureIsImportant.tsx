import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL — Website Structure
   "Before you set up your tracking, there is one very important
   thing you need to check."

   Standalone, modular scene file. Independently renderable.
   Regenerates the same visual language, primitives and timing
   philosophy locally (no import-time dependency), matching
   OnboardingVideoSection06 and the rest of the series.

   STORY: Explains the required website structure for VSTRK
   tracking: Website / Landing Page → Booking or Checkout →
   separate Thank-You Page. Emphasizes that a success message
   on the same Booking page is NOT the same as a separate
   Thank-You Page. Ends with reassurance and support options.

   PRODUCT GROUNDING:
     - Conceptual / illustrative only. No technical implementation.
     - Narration used verbatim, word-for-word, split into beats
       that map cleanly to the visual scenes.

   REUSED (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp / segOpacity / rangeOpacity
     - DrawLine, Badge, Chip
     - violet corner-tick Badge grammar
     - accent Chip grammar
     - autoCaption()
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const WARN = "#d3555c";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";
const SUCCESS = "#2f9e6b";

/* ---------------------------------------------------------------
   Timing — one beat per exact narration unit, 280ms cross-fade
   gaps, same philosophy as Section 06.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "Before you set up your tracking, there is one very important thing you need to check.", 3800],
  ["S2", "Your website structure should look like this:\n1. Website / Landing Page → 2. Booking or Checkout → 3. Thank-You Page", 7200],
  ["S3", "For example:\nSomeone visits your website, goes to Booking or Checkout, then is sent to a separate Thank-You Page after completing the action.", 6200],
  ["S4", "This structure is very important for our tracking to work correctly.", 3600],
  ["S5", "If your website currently looks like this:\nWebsite → Booking → Booking Successful", 4200],
  ["S6", "and the successful message appears on the same page, you will need to change your setup so the successful action redirects to a separate Thank-You Page.", 5600],
  ["S7", "Don’t worry — if you’re not sure how to do this, you can ask Claude for help or join our support group.\nWe’ll help you get it set up correctly.", 4800],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S7.end + 700;

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

/* ---------------- Visual primitives — same grammar as Section 06 ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE, dash }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string; dash?: string }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray={dash ? dash : 1} strokeDashoffset={dash ? undefined : 1 - p} opacity={opacity * (dash ? p : 1)} />
  );
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
  { x: number; y: number; t: number; start: number; end: number; label: string; tone?: "muted" | "accent" | "filled" | "warn" | "success"; width?: number; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 24;
  const bx = x - width / 2, by = y - h / 2;
  const tColor = tone === "warn" ? WARN : tone === "success" ? SUCCESS : ACCENT;
  const fill = tone === "filled" || tone === "success" ? tColor : "#ffffff";
  const stroke = tone === "muted" ? LINE : tColor;
  const textFill = tone === "filled" || tone === "success" ? "#ffffff" : tone === "muted" ? MUTED : tColor;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.1} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.4} fill={textFill}
        style={{ textTransform: tone === "muted" ? "none" : "uppercase" }}>{label}</text>
    </g>
  );
}

/* Simple page-card glyph for website / booking / thank-you mockups */
function PageCard({ x, y, t, start, end, title, subtitle, w = 160, h = 90, number, fade = 1, tone = "default" }:
  { x: number; y: number; t: number; start: number; end: number; title: string; subtitle?: string; w?: number; h?: number; number?: string; fade?: number; tone?: "default" | "success" | "warn" }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const scale = lerp(0.9, 1, p);
  const headerFill = tone === "success" ? SUCCESS : tone === "warn" ? WARN : ACCENT;
  return (
    <g opacity={p * fade} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={10} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={20} rx={10} fill={headerFill} opacity={0.12} />
      {number && (
        <text x={x - w / 2 + 14} y={y - h / 2 + 14} textAnchor="start" fontFamily={MONO} fontWeight={800} fontSize={11}
          fill={headerFill}>{number}</text>
      )}
      <text x={x} y={y - 6} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={0.4} fill={INK}
        style={{ textTransform: "uppercase" }}>{title}</text>
      {subtitle && (
        <text x={x} y={y + 16} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fill={MUTED}>{subtitle}</text>
      )}
    </g>
  );
}

/* Person glyph for visitor journey */
function Person({ x, y, size = 22, opacity = 1 }: { x: number; y: number; size?: number; opacity?: number }) {
  return <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} opacity={opacity}>🧑</text>;
}

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
================================================================= */

/* ---- S1 — introduce the requirement ---- */
const S1_HEAD = { start: SEG.S1.start + 80, end: SEG.S1.start + 500 };
const S1_ICON = { start: SEG.S1.start + 600, end: SEG.S1.start + 1100 };
const S1_NOTE = { start: SEG.S1.start + 1400, end: SEG.S1.end - 200 };

/* ---- S2 — correct structure (strongest visual) ---- */
const S2_HEAD = { start: SEG.S2.start + 80, end: SEG.S2.start + 500 };
const S2_P1 = { start: SEG.S2.start + 600, end: SEG.S2.start + 1100 };
const S2_ARR1 = { start: SEG.S2.start + 1200, end: SEG.S2.start + 1600 };
const S2_P2 = { start: SEG.S2.start + 1700, end: SEG.S2.start + 2200 };
const S2_ARR2 = { start: SEG.S2.start + 2300, end: SEG.S2.start + 2700 };
const S2_P3 = { start: SEG.S2.start + 2800, end: SEG.S2.start + 3300 };
const S2_NOTE = { start: SEG.S2.start + 3600, end: SEG.S2.end - 200 };

/* ---- S3 — visitor journey ---- */
const S3_HEAD = { start: SEG.S3.start + 80, end: SEG.S3.start + 450 };
const S3_STEP1 = { start: SEG.S3.start + 500, end: SEG.S3.start + 1000 };
const S3_STEP2 = { start: SEG.S3.start + 1400, end: SEG.S3.start + 2000 };
const S3_STEP3 = { start: SEG.S3.start + 2500, end: SEG.S3.start + 3100 };
const S3_STEP4 = { start: SEG.S3.start + 3600, end: SEG.S3.start + 4300 };
const S3_NOTE = { start: SEG.S3.start + 4600, end: SEG.S3.end - 200 };

/* ---- S4 — why it matters ---- */
const S4_HEAD = { start: SEG.S4.start + 80, end: SEG.S4.start + 500 };
const S4_STRUCT = { start: SEG.S4.start + 600, end: SEG.S4.start + 1400 };
const S4_TRACK = { start: SEG.S4.start + 1600, end: SEG.S4.start + 2400 };
const S4_NOTE = { start: SEG.S4.start + 2600, end: SEG.S4.end - 200 };

/* ---- S5 — incorrect structure ---- */
const S5_HEAD = { start: SEG.S5.start + 80, end: SEG.S5.start + 500 };
const S5_P1 = { start: SEG.S5.start + 600, end: SEG.S5.start + 1000 };
const S5_ARR1 = { start: SEG.S5.start + 1100, end: SEG.S5.start + 1500 };
const S5_P2 = { start: SEG.S5.start + 1600, end: SEG.S5.start + 2100 };
const S5_MSG = { start: SEG.S5.start + 2300, end: SEG.S5.start + 2900 };
const S5_WARN = { start: SEG.S5.start + 3100, end: SEG.S5.end - 200 };

/* ---- S6 — change to correct structure (before → after) ---- */
const S6_BEFORE = { start: SEG.S6.start + 100, end: SEG.S6.start + 900 };
const S6_ARROW = { start: SEG.S6.start + 1100, end: SEG.S6.start + 1600 };
const S6_AFTER = { start: SEG.S6.start + 1800, end: SEG.S6.start + 2800 };
const S6_NOTE = { start: SEG.S6.start + 3200, end: SEG.S6.end - 200 };

/* ---- S7 — reassurance ---- */
const S7_HEAD = { start: SEG.S7.start + 80, end: SEG.S7.start + 500 };
const S7_OPT1 = { start: SEG.S7.start + 700, end: SEG.S7.start + 1300 };
const S7_OPT2 = { start: SEG.S7.start + 1200, end: SEG.S7.start + 1800 };
const S7_FINAL = { start: SEG.S7.start + 2200, end: SEG.S7.start + 3200 };
const S7_HOLD = { start: SEG.S7.start + 3400, end: SEG.S7.end - 200 };

export interface OnboardingVideoWebsiteStructureProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingVideoWebsiteStructure({ onSkip, onComplete }: OnboardingVideoWebsiteStructureProps = {}) {
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

  const s1Op = segOpacity(t, "S1");
  const s2Op = segOpacity(t, "S2");
  const s3Op = segOpacity(t, "S3");
  const s4Op = segOpacity(t, "S4");
  const s5Op = segOpacity(t, "S5");
  const s6Op = segOpacity(t, "S6");
  const s7Op = segOpacity(t, "S7");
  const finalFadeOut = t > SEG.S7.end - 500 ? 1 - prog(t, SEG.S7.end - 500, SEG.S7.end - 60) : 1;

  /* Visitor journey positions for S3 */
  const journeyX = [180, 380, 580, 780];
  const journeyY = 260;

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1 — introduce the requirement ================= */}
          <g opacity={s1Op}>
            <Badge x={480} y={70} t={t} arriveStart={S1_HEAD.start} arriveEnd={S1_HEAD.end} label="Before You Begin" width={220} filled />

            {/* Simple website icon / structure hint */}
            <g opacity={prog(t, S1_ICON.start, S1_ICON.end)}>
              <rect x={380} y={160} width={200} height={140} rx={12} fill="#ffffff" stroke={LINE} strokeWidth={1.3}
                style={{ filter: "drop-shadow(0 4px 12px rgba(21,21,31,0.06))" }} />
              <rect x={380} y={160} width={200} height={28} rx={12} fill={ACCENT} opacity={0.12} />
              <text x={480} y={180} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} fill={ACCENT}
                style={{ textTransform: "uppercase" }}>Your Website</text>
              <text x={480} y={230} textAnchor="middle" fontFamily={MONO} fontSize={22}>🌐</text>
              <text x={480} y={275} textAnchor="middle" fontFamily={MONO} fontSize={10} fill={MUTED}>Check structure first</text>
            </g>

            <text x={480} y={380} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={700} letterSpacing={0.5} fill={INK}
              opacity={fadeWindow(t, S1_NOTE.start, S1_NOTE.start + 200, SEG.S1.end - 200, SEG.S1.end)}
              style={{ textTransform: "uppercase" }}>
              One important check before tracking
            </text>
          </g>

          {/* ================= S2 — correct structure ================= */}
          <g opacity={s2Op}>
            <Badge x={480} y={50} t={t} arriveStart={S2_HEAD.start} arriveEnd={S2_HEAD.end} label="Correct Structure" width={220} filled />

            {/* Stage 1 */}
            <PageCard x={180} y={220} t={t} start={S2_P1.start} end={S2_P1.end}
              title="Website" subtitle="Landing Page" number="1" w={170} h={100} />

            <DrawLine d={`M270,220 L320,220`} t={t} start={S2_ARR1.start} end={S2_ARR1.end} width={1.4} color={ACCENT} />
            <text x={295} y={210} textAnchor="middle" fontFamily={MONO} fontSize={14} fill={ACCENT}
              opacity={prog(t, S2_ARR1.start, S2_ARR1.end)}>→</text>

            {/* Stage 2 */}
            <PageCard x={480} y={220} t={t} start={S2_P2.start} end={S2_P2.end}
              title="Booking" subtitle="or Checkout" number="2" w={170} h={100} />

            <DrawLine d={`M570,220 L620,220`} t={t} start={S2_ARR2.start} end={S2_ARR2.end} width={1.4} color={ACCENT} />
            <text x={595} y={210} textAnchor="middle" fontFamily={MONO} fontSize={14} fill={ACCENT}
              opacity={prog(t, S2_ARR2.start, S2_ARR2.end)}>→</text>

            {/* Stage 3 */}
            <PageCard x={780} y={220} t={t} start={S2_P3.start} end={S2_P3.end}
              title="Thank-You" subtitle="Separate Page" number="3" w={170} h={100} tone="success" />

            <text x={480} y={370} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={700} letterSpacing={0.5} fill={MUTED}
              opacity={fadeWindow(t, S2_NOTE.start, S2_NOTE.start + 200, SEG.S2.end - 150, SEG.S2.end)}
              style={{ textTransform: "uppercase" }}>
              Three separate stages · Three separate pages
            </text>
          </g>

          {/* ================= S3 — visitor journey ================= */}
          <g opacity={s3Op}>
            <Badge x={480} y={50} t={t} arriveStart={S3_HEAD.start} arriveEnd={S3_HEAD.end} label="Visitor Journey" width={200} filled />

            {/* Step 1 — visits website */}
            <g opacity={prog(t, S3_STEP1.start, S3_STEP1.end)}>
              <PageCard x={journeyX[0]} y={journeyY} t={t} start={S3_STEP1.start} end={S3_STEP1.end}
                title="Website" subtitle="Visits" w={140} h={80} />
              <Person x={journeyX[0]} y={journeyY - 70} size={24} opacity={prog(t, S3_STEP1.start, S3_STEP1.end)} />
            </g>

            <DrawLine d={`M${journeyX[0] + 75},${journeyY} L${journeyX[1] - 75},${journeyY}`} t={t}
              start={S3_STEP2.start - 300} end={S3_STEP2.start} width={1.3} color={ACCENT} opacity={0.6} />

            {/* Step 2 — booking */}
            <g opacity={prog(t, S3_STEP2.start, S3_STEP2.end)}>
              <PageCard x={journeyX[1]} y={journeyY} t={t} start={S3_STEP2.start} end={S3_STEP2.end}
                title="Booking" subtitle="or Checkout" w={140} h={80} />
              <Person x={journeyX[1]} y={journeyY - 70} size={24} opacity={prog(t, S3_STEP2.start, S3_STEP2.end)} />
            </g>

            <DrawLine d={`M${journeyX[1] + 75},${journeyY} L${journeyX[2] - 75},${journeyY}`} t={t}
              start={S3_STEP3.start - 300} end={S3_STEP3.start} width={1.3} color={ACCENT} opacity={0.6} />

            {/* Step 3 — successful action */}
            <g opacity={prog(t, S3_STEP3.start, S3_STEP3.end)}>
              <Chip x={journeyX[2]} y={journeyY} t={t} start={S3_STEP3.start} end={S3_STEP3.end}
                label="Action Complete ✓" tone="success" width={160} />
            </g>

            <DrawLine d={`M${journeyX[2] + 85},${journeyY} L${journeyX[3] - 75},${journeyY}`} t={t}
              start={S3_STEP4.start - 300} end={S3_STEP4.start} width={1.3} color={SUCCESS} opacity={0.7} />

            {/* Step 4 — separate Thank-You */}
            <g opacity={prog(t, S3_STEP4.start, S3_STEP4.end)}>
              <PageCard x={journeyX[3]} y={journeyY} t={t} start={S3_STEP4.start} end={S3_STEP4.end}
                title="Thank-You" subtitle="Separate Page" w={140} h={80} tone="success" />
              <Person x={journeyX[3]} y={journeyY - 70} size={24} opacity={prog(t, S3_STEP4.start, S3_STEP4.end)} />
            </g>

            <text x={480} y={400} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={0.5} fill={MUTED}
              opacity={fadeWindow(t, S3_NOTE.start, S3_NOTE.start + 200, SEG.S3.end - 150, SEG.S3.end)}
              style={{ textTransform: "uppercase" }}>
              Successful action → redirect to a separate page
            </text>
          </g>

          {/* ================= S4 — why structure matters ================= */}
          <g opacity={s4Op}>
            <Badge x={480} y={50} t={t} arriveStart={S4_HEAD.start} arriveEnd={S4_HEAD.end} label="Why It Matters" width={180} filled />

            {/* Compact three-stage */}
            <g opacity={prog(t, S4_STRUCT.start, S4_STRUCT.end)}>
              <PageCard x={200} y={200} t={t} start={S4_STRUCT.start} end={S4_STRUCT.end}
                title="1. Website" w={140} h={70} />
              <text x={300} y={205} textAnchor="middle" fontFamily={MONO} fontSize={16} fill={ACCENT}
                opacity={prog(t, S4_STRUCT.start + 200, S4_STRUCT.end)}>→</text>
              <PageCard x={420} y={200} t={t} start={S4_STRUCT.start + 200} end={S4_STRUCT.end}
                title="2. Booking" w={140} h={70} />
              <text x={520} y={205} textAnchor="middle" fontFamily={MONO} fontSize={16} fill={ACCENT}
                opacity={prog(t, S4_STRUCT.start + 400, S4_STRUCT.end)}>→</text>
              <PageCard x={640} y={200} t={t} start={S4_STRUCT.start + 400} end={S4_STRUCT.end}
                title="3. Thank-You" w={140} h={70} tone="success" />
            </g>

            {/* VSTRK can track */}
            <g opacity={prog(t, S4_TRACK.start, S4_TRACK.end)}>
              <Badge x={480} y={320} t={t} arriveStart={S4_TRACK.start} arriveEnd={S4_TRACK.end}
                label="VSTRK Tracks Correctly" width={260} filled />
            </g>

            <text x={480} y={400} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={0.5} fill={MUTED}
              opacity={fadeWindow(t, S4_NOTE.start, S4_NOTE.start + 200, SEG.S4.end - 150, SEG.S4.end)}
              style={{ textTransform: "uppercase" }}>
              Correct structure → accurate tracking
            </text>
          </g>

          {/* ================= S5 — incorrect structure ================= */}
          <g opacity={s5Op}>
            <Badge x={480} y={50} t={t} arriveStart={S5_HEAD.start} arriveEnd={S5_HEAD.end}
              label="Incorrect Structure" width={240} filled tone={WARN} />

            {/* Website */}
            <PageCard x={240} y={200} t={t} start={S5_P1.start} end={S5_P1.end}
              title="Website" w={150} h={80} />

            <DrawLine d={`M320,200 L380,200`} t={t} start={S5_ARR1.start} end={S5_ARR1.end} width={1.3} color={LINE} />
            <text x={350} y={190} textAnchor="middle" fontFamily={MONO} fontSize={14} fill={MUTED}
              opacity={prog(t, S5_ARR1.start, S5_ARR1.end)}>→</text>

            {/* Booking page with success message INSIDE it */}
            <g opacity={prog(t, S5_P2.start, S5_P2.end)}>
              <rect x={400} y={140} width={280} height={140} rx={12} fill="#ffffff" stroke={WARN} strokeWidth={1.5}
                style={{ filter: "drop-shadow(0 3px 8px rgba(211,85,92,0.12))" }} />
              <rect x={400} y={140} width={280} height={24} rx={12} fill={WARN} opacity={0.12} />
              <text x={540} y={158} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} fill={WARN}
                style={{ textTransform: "uppercase" }}>Booking Page</text>

              {/* Success message inside the same card */}
              <g opacity={prog(t, S5_MSG.start, S5_MSG.end)}>
                <rect x={430} y={190} width={220} height={50} rx={8} fill={SUCCESS} opacity={0.1} stroke={SUCCESS} strokeWidth={1} />
                <text x={540} y={212} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={12} fill={SUCCESS}>
                  Booking Successful ✓
                </text>
                <text x={540} y={230} textAnchor="middle" fontFamily={MONO} fontSize={9} fill={MUTED}>
                  (still on the same page)
                </text>
              </g>
            </g>

            <text x={480} y={360} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={700} letterSpacing={0.5} fill={WARN}
              opacity={fadeWindow(t, S5_WARN.start, S5_WARN.start + 200, SEG.S5.end - 150, SEG.S5.end)}
              style={{ textTransform: "uppercase" }}>
              No separate Thank-You Page
            </text>
            <text x={480} y={390} textAnchor="middle" fontFamily={MONO} fontSize={10} fill={MUTED}
              opacity={fadeWindow(t, S5_WARN.start + 200, S5_WARN.start + 400, SEG.S5.end - 100, SEG.S5.end)}>
              Success message lives inside the Booking page
            </text>
          </g>

          {/* ================= S6 — transform to correct structure ================= */}
          <g opacity={s6Op}>
            {/* BEFORE */}
            <g opacity={1 - prog(t, S6_ARROW.start, S6_ARROW.end) * 0.85}>
              <text x={240} y={80} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1} fill={WARN}
                opacity={prog(t, S6_BEFORE.start, S6_BEFORE.end)} style={{ textTransform: "uppercase" }}>Before</text>

              <PageCard x={140} y={180} t={t} start={S6_BEFORE.start} end={S6_BEFORE.end}
                title="Website" w={120} h={70} />
              <text x={220} y={185} textAnchor="middle" fontFamily={MONO} fontSize={14} fill={MUTED}
                opacity={prog(t, S6_BEFORE.start + 200, S6_BEFORE.end)}>→</text>

              {/* Combined booking + success */}
              <g opacity={prog(t, S6_BEFORE.start + 300, S6_BEFORE.end)}>
                <rect x={250} y={130} width={180} height={100} rx={10} fill="#ffffff" stroke={WARN} strokeWidth={1.3} />
                <text x={340} y={160} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={10} fill={WARN}
                  style={{ textTransform: "uppercase" }}>Booking</text>
                <text x={340} y={195} textAnchor="middle" fontFamily={MONO} fontSize={11} fill={SUCCESS}>Successful ✓</text>
                <text x={340} y={215} textAnchor="middle" fontFamily={MONO} fontSize={8} fill={MUTED}>(same page)</text>
              </g>
            </g>

            {/* Transform arrow */}
            <g opacity={prog(t, S6_ARROW.start, S6_ARROW.end)}>
              <text x={480} y={180} textAnchor="middle" fontFamily={MONO} fontSize={28} fill={ACCENT}>→</text>
              <text x={480} y={215} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} fill={ACCENT}
                style={{ textTransform: "uppercase" }}>Change</text>
            </g>

            {/* AFTER */}
            <g opacity={prog(t, S6_AFTER.start, S6_AFTER.end)}>
              <text x={720} y={80} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1} fill={SUCCESS}
                style={{ textTransform: "uppercase" }}>After</text>

              <PageCard x={580} y={160} t={t} start={S6_AFTER.start} end={S6_AFTER.end}
                title="Website" w={110} h={60} />
              <text x={650} y={165} textAnchor="middle" fontFamily={MONO} fontSize={12} fill={ACCENT}
                opacity={prog(t, S6_AFTER.start + 200, S6_AFTER.end)}>→</text>
              <PageCard x={720} y={160} t={t} start={S6_AFTER.start + 200} end={S6_AFTER.end}
                title="Booking" w={110} h={60} />
              <text x={790} y={165} textAnchor="middle" fontFamily={MONO} fontSize={12} fill={SUCCESS}
                opacity={prog(t, S6_AFTER.start + 400, S6_AFTER.end)}>→</text>
              <PageCard x={860} y={160} t={t} start={S6_AFTER.start + 400} end={S6_AFTER.end}
                title="Thank-You" w={110} h={60} tone="success" />

              {/* Redirect note */}
              <text x={720} y={260} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} fill={SUCCESS}
                opacity={prog(t, S6_AFTER.start + 600, S6_AFTER.end)} style={{ textTransform: "uppercase" }}>
                Successful action redirects → separate page
              </text>
            </g>

            <text x={480} y={380} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={700} letterSpacing={0.5} fill={INK}
              opacity={fadeWindow(t, S6_NOTE.start, S6_NOTE.start + 200, SEG.S6.end - 150, SEG.S6.end)}
              style={{ textTransform: "uppercase" }}>
              Redirect to a separate Thank-You Page
            </text>
          </g>

          {/* ================= S7 — reassurance / support ================= */}
          <g opacity={s7Op}>
            <Badge x={480} y={60} t={t} arriveStart={S7_HEAD.start} arriveEnd={S7_HEAD.end}
              label="We’ve Got You" width={180} filled />

            {/* Two support options */}
            <g opacity={prog(t, S7_OPT1.start, S7_OPT1.end)}>
              <rect x={180} y={140} width={240} height={120} rx={14} fill="#ffffff" stroke={LINE} strokeWidth={1.3}
                style={{ filter: "drop-shadow(0 4px 12px rgba(21,21,31,0.06))" }} />
              <text x={300} y={185} textAnchor="middle" fontFamily={MONO} fontSize={28}>💬</text>
              <text x={300} y={225} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={13} fill={INK}
                style={{ textTransform: "uppercase" }}>Ask Claude</text>
            </g>

            <g opacity={prog(t, S7_OPT2.start, S7_OPT2.end)}>
              <rect x={540} y={140} width={240} height={120} rx={14} fill="#ffffff" stroke={LINE} strokeWidth={1.3}
                style={{ filter: "drop-shadow(0 4px 12px rgba(21,21,31,0.06))" }} />
              <text x={660} y={185} textAnchor="middle" fontFamily={MONO} fontSize={28}>🤝</text>
              <text x={660} y={225} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={13} fill={INK}
                style={{ textTransform: "uppercase" }}>Join Support</text>
            </g>

            {/* Final structure reminder */}
            <g opacity={prog(t, S7_FINAL.start, S7_FINAL.end)}>
              <text x={480} y={320} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={0.6} fill={MUTED}
                style={{ textTransform: "uppercase" }}>Required structure</text>
              <text x={480} y={360} textAnchor="middle" fontFamily={MONO} fontSize={14} fontWeight={700} fill={ACCENT}>
                1. Website  →  2. Booking  →  3. Thank-You Page
              </text>
            </g>

            <text x={480} y={420} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={700} letterSpacing={0.5} fill={INK}
              opacity={fadeWindow(t, S7_HOLD.start, S7_HOLD.start + 200, SEG.S7.end - 150, SEG.S7.end)}
              style={{ textTransform: "uppercase" }}>
              We’ll help you get it set up correctly
            </text>
          </g>
        </svg>
      </div>

      {/* ---------- Caption bar ---------- */}
      <div style={{ height: 90, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 6, position: "relative", width: "100%", maxWidth: 760 }}>
        {CAPTIONS.map((c, i) => {
          const op = fadeWindow(t, c.a, c.b, c.c, c.d);
          if (op <= 0.001) return null;
          return (
            <p key={i} style={{
              position: "absolute", margin: 0, fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
              fontSize: 19, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center",
              whiteSpace: "pre-line", lineHeight: 1.4,
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
