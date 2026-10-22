import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "NoRely" (bissHireAgencyNoRely.tsx) — 50 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (114 words, ≈ 0.42-0.43 s / word):

   [P1  0.0-19.2] "Instead of relying entirely on what your marketer chooses to show you,
                   Vstrk lets you dig deeper to identify which content drives conversion,
                   spot patterns and trends across your campaigns, and discover which
                   message topics or words may be helping turn audience into customers."
   [P2 19.2-26.1] "And this isn't just about monitoring your agency, it's about creating a
                   more transparent working relation."
   [P3 26.0-35.3] "Where you and your marketer can look at the same data, understand what's
                   working, identify underperformance, and make better decisions together."
   [P4 35.3-49.0] "This gives you a clear picture of how your marketing is performing, helps
                   you ask better questions, and make it easier to identify where to
                   improve, what to repeat, and what to scale."       (49-50 s: hold)

   WHAT HAPPENS
     P1  Owner + marketer + a tidy "Marketer's report" ("only what's shown"). The row slides
         up, VSTRK lens opens ("dig deeper") and branches into three panels:
         Content (rows with conversion bars, top converter lights up) → Trends (two campaign
         lines + trend band) → Topics & words (chips; two light up) → audience → customers.
     P2  Fresh stage. One-way "Just monitoring" arrow gets struck out; a two-way line, a
         glass pane and the VSTRK eye open: "Transparent" → "Working relation".
     P3  A shared dashboard appears between owner and marketer; both look at it
         ("same data"), checks land on what works, a cross on the underperformer,
         "Better decisions" lands as both light up ("together").
     P4  Dashboard glows ("clear picture"), question chips rise by the owner
         ("ask better questions"), then Improve (weak bar lifts) → Repeat (ripples on the
         steady bars) → Scale (top bar grows). Last frame = everything visible, held.

   TO RETIME: edit the seconds in the BEAT TIMING block below (nothing else).
   Neutral emoji / bars / circles only — no brand logos. Illustrative data only.
   Self-contained: React + scene props type + the optional clock hook only.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MUTED = "#9a9aa8";
const MUTED_D = "#6b6b78";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 50000;

/* ---------------- timing math (all times in SECONDS) ---------------- */
function clamp(v: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function prog(t: number, a: number, b: number) { return clamp((t - a) / (b - a)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function ease(p: number) { return 1 - Math.pow(1 - p, 3); }
function bump(t: number, a: number, b: number) { return t > a && t < b ? Math.sin(prog(t, a, b) * Math.PI) : 0; }
function fadeWindow(t: number, a: number, b: number, c: number, d: number) {
  if (t < a) return 0;
  if (t < b) return clamp((t - a) / (b - a));
  if (t < c) return 1;
  if (t < d) return 1 - clamp((t - c) / (d - c));
  return 0;
}

/* =================================================================
   BEAT TIMING (seconds)  — edit here to retime
================================================================= */
/* ---- P1  0.0-19.2 : "Instead of relying … into customers" ---- */
const OWNER_S_IN = [0.4, 1.0];             // owner (right)            "relying"
const MARKETER_S_IN = [2.7, 3.3];          // marketer (left)          "your marketer"
const REPORT_IN = [3.3, 3.9];              // tidy report card         "chooses"
const REPORT_BARS = [3.5, 4.2];
const ARROWS_S = [3.9, 4.9];               // marketer → report → owner   "to show you"
const ONLY_CHIP = [4.2, 4.7, 5.6, 6.0];    // "Only what's shown"  (in a→b, out c→d)
const SHIFT = [5.0, 5.9];                  // row slides up
const BADGE_IN = [5.16, 5.66];             // VSTRK badge              "Vstrk"
const LINE_DOWN = [5.7, 6.1];              // report → lens
const LENS_IN = [5.8, 6.4];                // VSTRK lens               "lets you"
const DIG_PULSE = [6.45, 7.3];             //                          "dig deeper"
const BRANCH = [6.5, 7.4];                 // lens → three panels
const SLOTS_IN = [6.9, 7.4];               // dashed empty slots
const STRIP_DIM = [6.0, 6.6];              // top row dims
const PANEL1_IN = [7.7, 8.3];              // Content panel            "identify which"
const ROW_T = [8.4, 8.7, 9.0, 9.3];        // content rows
const TOP_ROW = [9.46, 10.0];              // top row lights up        "conversion"
const TOP_CHIP = [9.5, 10.0];
const PANEL2_IN = [9.9, 10.5];             // Trends panel             "spot patterns"
const LINE_A = [10.4, 12.2];               // campaign A line
const LINE_B = [10.8, 12.4];               // campaign B line
const BAND_IN = [11.18, 11.7];             // trend band               "trends"
const TREND_CHIP = [11.5, 11.9];
const CAMP_LEG = [12.0, 12.5];             // Campaign A / B           "across your campaigns"
const PANEL3_IN = [13.3, 13.9];            // Topics panel             "discover"
const WORD_T = [14.2, 14.45, 14.7, 14.95, 15.2, 15.45, 15.7, 15.95]; // topic chips  "message topics or words"
const HI_WORDS = [16.77, 17.2];            // two words light up       "may be helping"
const AUD_IN = [17.2, 17.7];               // Audience chip            "turn audience"
const FLOW_IN = [17.7, 18.3];              // arrow                    "into"
const CUST_IN = [18.4, 18.9];              // Customers chip           "customers"
const P1_OUT = [19.2, 19.8];               // whole P1 stage clears

/* ---- P2  19.2-26.1 : "And this isn't just about monitoring … working relation" ---- */
const PERSONS_IN = [19.9, 20.5];           // owner (left) + marketer (right), stay to the end
const MON_CHIP = [21.3, 21.8];             // "Just monitoring"        "monitoring"
const MON_LINE = [21.35, 22.3];            // one-way arrow
const STRIKE = [22.64, 23.1];              // struck out               "it's about"
const MON_OUT = [23.1, 23.6];
const TWO_LINE = [23.5, 24.7];             // two-way line             "creating a more"
const HEADS = [24.4, 24.8];
const PANE = [24.4, 25.1];                 // glass pane
const HUB2 = [24.79, 25.4];                // VSTRK eye                "transparent"
const TRANSP2 = [24.8, 25.3];              // "Transparent" chip
const REL_BADGE = [25.65, 26.15];          // "Working relation"       "relation"
const REL_PULSE = [25.65, 26.4];
const P2_OUT = [26.1, 26.7];

/* ---- P3  26.0-35.3 : "Where you and your marketer … better decisions together" ---- */
const OWNER_PULSE_1 = [26.4, 27.1];        //                          "you"
const MKT_PULSE_1 = [27.7, 28.4];          //                          "your marketer"
const DASH_IN = [27.3, 28.0];              // shared dashboard
const BAR_START = 27.6;                    // bars grow (stagger 0.12 s)
const LOOK_LINES = [28.6, 29.3];           //                          "look at"
const LOOK_EYES = [29.0, 29.4];
const SAME_CHIP = [29.87, 30.4, 35.5, 36.0]; // "Same data"            "the same data"
const LEG_WORK = [31.16, 31.66];           // "Working" legend         "what's working"
const OK_AT = [31.3, 31.55, 31.8];         // check discs on Ad B, Ad C, Ad E
const LEG_UNDER = [32.45, 32.95];          // "Underperforming"        "underperformance"
const X_AT = 32.7;                         // cross on Ad A
const A_FLASH = [32.7, 33.5];
const PULSE_BOTH_1 = [33.55, 34.2];        //                          "make better decisions"
const DECISION = [34.35, 34.85, 35.5, 36.0]; // "Better decisions"
const PULSE_TOGETHER = [34.8, 35.4];       //                          "together"

/* ---- P4  35.3-49.0 : "This gives you a clear picture … what to scale" ---- */
const CLEAR_CHIP = [36.94, 37.5];          // "Clear picture"          "a clear picture"
const CLEAR_GLOW = [37.35, 38.3];
const PERF_GLOW = [39.81, 40.7];           //                          "performing"
const ASK_PULSE = [41.0, 41.8];            //                          "ask"
const ASK1 = [41.04, 41.54];               // question chips           "ask better questions"
const ASK2 = [41.86, 42.36];
const IMPROVE_CHIP = [45.55, 46.0];        //                          "improve"
const IMPROVE_GROW = [45.7, 46.6];
const REPEAT_CHIP = [46.78, 47.2];         //                          "repeat"
const REPEAT_RIPPLE = [46.9, 47.7];
const SCALE_CHIP = [48.2, 48.6];           //                          "scale"
const SCALE_GROW = [48.4, 49.4];

/* ---------------- layout ---------------- */
const PANEL_W = 270, PANEL_H = 215, PANEL_Y = 250;
const PANEL_X = [160, 480, 800];
const OWNER_P = { x: 120, y: 285 }, MKT_P = { x: 840, y: 285 };
const DASH = { x: 290, y: 190, w: 380, h: 210 };
const BASE_Y = 372, BAR_H = 130, BAR_W = 44;
const BAR_X = [340, 410, 480, 550, 620];
const BARS = [
  { label: "Ad A", base: 0.38 },
  { label: "Ad B", base: 0.72 },
  { label: "Ad C", base: 0.80 },
  { label: "Ad D", base: 0.60 },
  { label: "Ad E", base: 0.76 },
];
const TARGET = 0.55;
const SCALE_TO = 0.92;                  // height the "Scale" bar grows to
const CALLOUT_Y = 450;

/* ---------------- primitives (same grammar as the other VSL scenes) ---------------- */
function Badge({ x, y, t, arriveStart, arriveEnd, label, width = 96, filled = false, fadeOut, pulse = 0 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; width?: number; filled?: boolean; fadeOut?: number[]; pulse?: number }) {
  const inP = prog(t, arriveStart, arriveEnd);
  const p = fadeOut ? inP * (1 - prog(t, fadeOut[0], fadeOut[1])) : inP;
  if (p <= 0.001) return null;
  const h = 28, bx = x - width / 2, by = y - h / 2;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.85, 1, inP) * (1 + 0.05 * pulse)})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={14} fill={filled ? ACCENT : "#ffffff"} stroke={ACCENT} strokeWidth={1.3}
        style={{ filter: pulse > 0.05 ? `drop-shadow(0 0 ${9 * pulse}px rgba(91,61,240,0.55))` : "drop-shadow(0 4px 10px rgba(91,61,240,0.2))" }} />
      {!filled && <path d={`M${bx + 2},${by + 2} l10,0 M${bx + 2},${by + 2} l0,10`} stroke={ACCENT} strokeWidth={1.3} strokeLinecap="round" fill="none" />}
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11} letterSpacing={1.1}
        fill={filled ? "#ffffff" : ACCENT} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function Chip({ x, y, t, start, end, label, width = 118, fontSize = 10, color = ACCENT, filled = false, dashed = false, fadeOut, pulse = 0 }:
  { x: number; y: number; t: number; start: number; end: number; label: string; width?: number; fontSize?: number; color?: string; filled?: boolean; dashed?: boolean; fadeOut?: number[]; pulse?: number }) {
  const inP = prog(t, start, end);
  const p = fadeOut ? inP * (1 - prog(t, fadeOut[0], fadeOut[1])) : inP;
  if (p <= 0.001) return null;
  const h = 24, bx = x - width / 2, by = y - h / 2;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.9, 1, inP) * (1 + 0.05 * pulse)})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill={filled ? color : "#ffffff"} stroke={color} strokeWidth={1.1}
        strokeDasharray={dashed ? "4 3" : undefined}
        style={{ filter: pulse > 0.05 ? `drop-shadow(0 0 ${8 * pulse}px rgba(91,61,240,0.55))` : "none" }} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.6}
        fill={filled ? "#ffffff" : color} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function CaptionLabel({ x, y, label, anchor = "middle", fill = MUTED }:
  { x: number; y: number; label: string; anchor?: "start" | "middle" | "end"; fill?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={10.5} fontWeight={700} letterSpacing={0.8} fill={fill}
      style={{ textTransform: "uppercase" }}>{label}</text>
  );
}

function DrawLine({ d, t, start, end, color = ACCENT, width = 1.6, opacity = 1 }:
  { d: string; t: number; start: number; end: number; color?: string; width?: number; opacity?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  return (
    <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray="1 1" strokeDashoffset={1 - ease(p)} opacity={opacity} />
  );
}

function EyeNode({ x, y, t, arriveStart, arriveEnd, pulse = 0, r = 7 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; pulse?: number; r?: number }) {
  const openP = prog(t, arriveStart, arriveEnd);
  if (openP <= 0.001) return null;
  const eyeP = prog(t, arriveEnd, arriveEnd + 0.26);
  const glow = clamp(openP * (1 - 0.4 * (1 - eyeP)) + pulse, 0, 1.6);
  const ry = lerp(0.6, r * 0.56, eyeP);
  return (
    <g opacity={openP}>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={ACCENT} strokeWidth={1.2}
        style={{ filter: glow > 0.15 ? `drop-shadow(0 0 ${5 * glow}px ${ACCENT})` : "none" }} />
      <ellipse cx={x} cy={y} rx={r * 0.56} ry={ry} fill={ACCENT} opacity={eyeP} />
    </g>
  );
}

function Person({ x, y, t, start, end, emoji, label, pulse = 0 }:
  { x: number; y: number; t: number; start: number; end: number; emoji: string; label: string; pulse?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const lit = pulse > 0.05;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.85, 1, p) * (1 + 0.05 * pulse)})` }}>
      <circle cx={x} cy={y} r={36} fill="#fff" stroke={lit ? ACCENT : LINE} strokeWidth={lit ? 1.8 : 1.3}
        style={{ filter: lit ? `drop-shadow(0 0 ${10 * pulse}px rgba(91,61,240,0.5))` : "drop-shadow(0 3px 10px rgba(21,21,31,0.07))" }} />
      <text x={x} y={y} dy="0.36em" textAnchor="middle" fontSize={34}>{emoji}</text>
      <CaptionLabel x={x} y={y + 58} label={label} />
    </g>
  );
}

function Disc({ x, y, t, start, ok, op = 1 }: { x: number; y: number; t: number; start: number; ok: boolean; op?: number }) {
  const p = prog(t, start, start + 0.35) * op;
  if (p <= 0.001) return null;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.5, 1, ease(prog(t, start, start + 0.35)))})` }}>
      <circle cx={x} cy={y} r={11} fill={ok ? ACCENT : INK} stroke="#fff" strokeWidth={2} />
      {ok
        ? <path d={`M${x - 4.5},${y + 0.5} l3.2,3.4 l6,-7`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        : <path d={`M${x - 3.6},${y - 3.6} l7.2,7.2 M${x + 3.6},${y - 3.6} l-7.2,7.2`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />}
    </g>
  );
}

function Panel({ cx, t, a, b, title, children }: { cx: number; t: number; a: number; b: number; title: string; children: React.ReactNode }) {
  const p = prog(t, a, b);
  if (p <= 0.001) return null;
  return (
    <g opacity={p} style={{ transformOrigin: `${cx}px ${PANEL_Y + PANEL_H / 2}px`, transform: `scale(${lerp(0.96, 1, ease(p))})` }}>
      <rect x={cx - PANEL_W / 2} y={PANEL_Y} width={PANEL_W} height={PANEL_H} rx={14} fill="#fff" stroke={LINE} strokeWidth={1.3}
        style={{ filter: "drop-shadow(0 4px 14px rgba(21,21,31,0.07))" }} />
      <CaptionLabel x={cx - PANEL_W / 2 + 18} y={PANEL_Y + 26} label={title} anchor="start" />
      {children}
    </g>
  );
}

/* ---------------- P1 data ---------------- */
const CONTENT_ROWS = [
  { name: "Short video", letter: "S", ratio: 0.88 },
  { name: "Carousel",    letter: "C", ratio: 0.50 },
  { name: "Blog post",   letter: "B", ratio: 0.34 },
  { name: "Email",       letter: "E", ratio: 0.62 },
];
const SERIES_A = [0.28, 0.36, 0.32, 0.55, 0.62, 0.78, 0.88];
const SERIES_B = [0.42, 0.38, 0.46, 0.43, 0.52, 0.50, 0.60];
// word chips (x = centre relative to panel left edge, y = relative to panel top)
const WORDS: { label: string; w: number; x: number; y: number; hi: boolean }[] = [
  { label: "How-to",  w: 78, x: 57,  y: 62,  hi: false },
  { label: "Offer",   w: 66, x: 137, y: 62,  hi: false },
  { label: "Free",    w: 60, x: 208, y: 62,  hi: false },
  { label: "Results", w: 86, x: 61,  y: 96,  hi: true },
  { label: "Story",   w: 70, x: 147, y: 96,  hi: false },
  { label: "Proof",   w: 60, x: 220, y: 96,  hi: true },
  { label: "Urgency", w: 84, x: 60,  y: 130, hi: false },
  { label: "Bonus",   w: 66, x: 143, y: 130, hi: false },
];

/* =================================================================
   One frame as a pure function of time (ms). Exported for off-player checks.
================================================================= */
export function NoRelyFrame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  /* ---------- P1 derived ---------- */
  const p1Op = 1 - prog(t, P1_OUT[0], P1_OUT[1]);
  const S = lerp(250, 115, ease(prog(t, SHIFT[0], SHIFT[1])));       // y of the top row
  const stripOp = 1 - 0.6 * prog(t, STRIP_DIM[0], STRIP_DIM[1]);
  const digPulse = bump(t, DIG_PULSE[0], DIG_PULSE[1]);
  const reportP = prog(t, REPORT_IN[0], REPORT_IN[1]);
  const reportBars = ease(prog(t, REPORT_BARS[0], REPORT_BARS[1]));
  const hiWords = bump(t, HI_WORDS[0], HI_WORDS[1] + 0.5);

  /* ---------- P2 derived ---------- */
  const p2Op = 1 - prog(t, P2_OUT[0], P2_OUT[1]);
  const monOp = 1 - prog(t, MON_OUT[0], MON_OUT[1]);
  const relPulse = bump(t, REL_PULSE[0], REL_PULSE[1]);

  /* ---------- persons (P2 → end) ---------- */
  const ownerPulse = relPulse + bump(t, OWNER_PULSE_1[0], OWNER_PULSE_1[1]) + bump(t, PULSE_BOTH_1[0], PULSE_BOTH_1[1])
    + bump(t, PULSE_TOGETHER[0], PULSE_TOGETHER[1]) + bump(t, ASK_PULSE[0], ASK_PULSE[1]);
  const mktPulse = relPulse + bump(t, MKT_PULSE_1[0], MKT_PULSE_1[1]) + bump(t, PULSE_BOTH_1[0], PULSE_BOTH_1[1])
    + bump(t, PULSE_TOGETHER[0], PULSE_TOGETHER[1]);

  /* ---------- dashboard (P3/P4) ---------- */
  const dashP = prog(t, DASH_IN[0], DASH_IN[1]);
  const clearGlow = bump(t, CLEAR_GLOW[0], CLEAR_GLOW[1]);
  const perfGlow = bump(t, PERF_GLOW[0], PERF_GLOW[1]);
  const improveP = ease(prog(t, IMPROVE_GROW[0], IMPROVE_GROW[1]));
  const scaleP = ease(prog(t, SCALE_GROW[0], SCALE_GROW[1]));
  const ratios = BARS.map((b, i) => {
    if (i === 0) return b.base + (0.62 - b.base) * improveP;
    if (i === 4) return b.base + (SCALE_TO - b.base) * scaleP;
    return b.base;
  });
  const barP = BARS.map((_, i) => ease(prog(t, BAR_START + i * 0.12, BAR_START + 0.7 + i * 0.12)));
  const barTop = (i: number) => BASE_Y - BAR_H * ratios[i] * barP[i];
  const repeatRip = prog(t, REPEAT_RIPPLE[0], REPEAT_RIPPLE[1]);
  const togetherPulse = bump(t, PULSE_TOGETHER[0], PULSE_TOGETHER[1]);
  const aFlash = bump(t, A_FLASH[0], A_FLASH[1]);

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,26)">
        <Badge x={480} y={44} t={t} arriveStart={BADGE_IN[0]} arriveEnd={BADGE_IN[1]} label="VSTRK" width={110} filled />

        {/* =========================== P1 =========================== */}
        {p1Op > 0.001 && (
          <g opacity={p1Op}>
            {/* top row: marketer → report → owner */}
            <g opacity={stripOp}>
              <Person x={810} y={S} t={t} start={OWNER_S_IN[0]} end={OWNER_S_IN[1]} emoji="🧑‍💼" label="Business owner" />
              <Person x={150} y={S} t={t} start={MARKETER_S_IN[0]} end={MARKETER_S_IN[1]} emoji="🧑‍💻" label="Marketer" />

              {reportP > 0.001 && (
                <g opacity={reportP} style={{ transformOrigin: `480px ${S}px`, transform: `scale(${lerp(0.92, 1, reportP)})` }}>
                  <rect x={375} y={S - 42} width={210} height={84} rx={12} fill="#fff" stroke={LINE} strokeWidth={1.3}
                    style={{ filter: "drop-shadow(0 4px 12px rgba(21,21,31,0.07))" }} />
                  <rect x={393} y={S - 30} width={70 * reportBars} height={8} rx={4} fill={INK} opacity={0.8} />
                  <rect x={393} y={S - 10} width={150 * reportBars} height={8} rx={4} fill={ACCENT} opacity={0.85} />
                  <rect x={393} y={S + 6} width={118 * reportBars} height={8} rx={4} fill={ACCENT} opacity={0.5} />
                  <rect x={393} y={S + 22} width={84 * reportBars} height={8} rx={4} fill={LINE} />
                  <g opacity={1 - prog(t, ONLY_CHIP[2], ONLY_CHIP[3])}><CaptionLabel x={480} y={S - 54} label="Marketer's report" /></g>
                </g>
              )}
              <DrawLine d={`M190,${S} H368`} t={t} start={ARROWS_S[0]} end={ARROWS_S[0] + 0.5} color={MUTED} />
              <DrawLine d={`M592,${S} H770 M764,${S - 6} L770,${S} L764,${S + 6}`} t={t} start={ARROWS_S[0] + 0.4} end={ARROWS_S[1]} color={MUTED} />
              <Chip x={480} y={S + 66} t={t} start={ONLY_CHIP[0]} end={ONLY_CHIP[1]} fadeOut={[ONLY_CHIP[2], ONLY_CHIP[3]]}
                label="Only what's shown" width={160} color={INK} dashed />
            </g>

            {/* lens (dig deeper) + branches */}
            <DrawLine d={`M480,${S + 44} V176`} t={t} start={LINE_DOWN[0]} end={LINE_DOWN[1]} />
            <EyeNode x={480} y={200} t={t} arriveStart={LENS_IN[0]} arriveEnd={LENS_IN[1]} pulse={digPulse * 0.7} r={22} />
            {digPulse > 0.02 && <circle cx={480} cy={200} r={30 + 10 * digPulse} fill="none" stroke={ACCENT} strokeWidth={1.2} opacity={digPulse * 0.5} />}
            {PANEL_X.map((cx, i) => (
              <DrawLine key={`br${i}`} d={cx === 480 ? `M480,222 V${PANEL_Y}` : `M480,222 V236 H${cx} V${PANEL_Y}`}
                t={t} start={BRANCH[0]} end={BRANCH[1]} opacity={0.6} />
            ))}

            {/* empty slots */}
            {PANEL_X.map((cx, i) => {
              const sp = prog(t, SLOTS_IN[0] + i * 0.1, SLOTS_IN[1] + i * 0.1);
              const pp = prog(t, [PANEL1_IN[0], PANEL2_IN[0], PANEL3_IN[0]][i], [PANEL1_IN[1], PANEL2_IN[1], PANEL3_IN[1]][i]);
              return (
                <rect key={`sl${i}`} x={cx - PANEL_W / 2} y={PANEL_Y} width={PANEL_W} height={PANEL_H} rx={14} fill="none" stroke={LINE}
                  strokeWidth={1.3} strokeDasharray="5 6" opacity={sp * (1 - pp)} />
              );
            })}

            {/* ---- panel 1: content → conversion ---- */}
            <Panel cx={PANEL_X[0]} t={t} a={PANEL1_IN[0]} b={PANEL1_IN[1]} title="Content">
              {CONTENT_ROWS.map((r, i) => {
                const x0 = PANEL_X[0] - PANEL_W / 2;
                const y = PANEL_Y + 62 + i * 34;
                const rp = prog(t, ROW_T[i], ROW_T[i] + 0.4);
                const bp = ease(prog(t, ROW_T[i] + 0.1, ROW_T[i] + 0.8));
                const hi = i === 0 ? prog(t, TOP_ROW[0], TOP_ROW[1]) : 0;
                if (rp <= 0.001) return null;
                return (
                  <g key={r.name} opacity={rp}>
                    <rect x={x0 + 8} y={y - 16} width={254} height={32} rx={8} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.2} opacity={hi} />
                    <circle cx={x0 + 26} cy={y} r={11} fill="#f3f1ff" stroke={LINE} strokeWidth={1.2} />
                    <text x={x0 + 26} y={y} dy="0.35em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11} fill={ACCENT}>{r.letter}</text>
                    <text x={x0 + 44} y={y} dy="0.34em" fontFamily={MONO} fontWeight={700} fontSize={11} fill={INK}>{r.name}</text>
                    <rect x={x0 + 128} y={y - 3.5} width={118} height={7} rx={3.5} fill={LINE} />
                    <rect x={x0 + 128} y={y - 3.5} width={118 * r.ratio * bp} height={7} rx={3.5} fill={ACCENT} opacity={i === 0 ? 1 : 0.55} />
                  </g>
                );
              })}
              <Chip x={PANEL_X[0]} y={PANEL_Y + 198} t={t} start={TOP_CHIP[0]} end={TOP_CHIP[1]} label="Top converter" width={130} filled />
            </Panel>

            {/* ---- panel 2: patterns & trends ---- */}
            <Panel cx={PANEL_X[1]} t={t} a={PANEL2_IN[0]} b={PANEL2_IN[1]} title="Trends">
              {(() => {
                const x0 = PANEL_X[1] - PANEL_W / 2;
                const cx0 = x0 + 22, cw = 226, cy0 = PANEL_Y + 54, ch = 114;
                const pt = (i: number, r: number) => `${(cx0 + (i * cw) / 6).toFixed(1)},${(cy0 + ch - r * ch).toFixed(1)}`;
                const pathOf = (arr: number[]) => arr.map((r, i) => `${i === 0 ? "M" : "L"}${pt(i, r)}`).join(" ");
                const bandP = prog(t, BAND_IN[0], BAND_IN[1]);
                return (
                  <g>
                    {[0, 0.5, 1].map((g) => (
                      <line key={g} x1={cx0} x2={cx0 + cw} y1={cy0 + ch - g * ch} y2={cy0 + ch - g * ch} stroke={LINE} strokeWidth={1} opacity={0.8} />
                    ))}
                    <rect x={cx0 + cw / 2} y={cy0 - 4} width={cw / 2} height={ch + 8} rx={8} fill={ACCENT} opacity={0.07 * bandP}
                      stroke={ACCENT} strokeWidth={1} strokeDasharray="4 4" />
                    <DrawLine d={pathOf(SERIES_B)} t={t} start={LINE_B[0]} end={LINE_B[1]} color={MUTED_D} width={2} />
                    <DrawLine d={pathOf(SERIES_A)} t={t} start={LINE_A[0]} end={LINE_A[1]} color={ACCENT} width={2.6} />
                    {prog(t, LINE_A[1] - 0.2, LINE_A[1]) > 0.5 && <circle cx={cx0 + cw} cy={cy0 + ch - SERIES_A[6] * ch} r={4.5} fill={ACCENT} />}
                    <Chip x={x0 + 172} y={PANEL_Y + 64} t={t} start={TREND_CHIP[0]} end={TREND_CHIP[1]} label="Trend" width={62} fontSize={9} filled />
                    <Chip x={x0 + 68} y={PANEL_Y + 190} t={t} start={CAMP_LEG[0]} end={CAMP_LEG[1]} label="Campaign A" width={104} fontSize={9} />
                    <Chip x={x0 + 190} y={PANEL_Y + 190} t={t} start={CAMP_LEG[0] + 0.15} end={CAMP_LEG[1] + 0.15} label="Campaign B" width={104} fontSize={9} color={MUTED_D} />
                  </g>
                );
              })()}
            </Panel>

            {/* ---- panel 3: topics & words → customers ---- */}
            <Panel cx={PANEL_X[2]} t={t} a={PANEL3_IN[0]} b={PANEL3_IN[1]} title="Topics & words">
              {(() => {
                const x0 = PANEL_X[2] - PANEL_W / 2;
                return (
                  <g>
                    {WORDS.map((w, i) => {
                      const hi = w.hi ? prog(t, HI_WORDS[0], HI_WORDS[1]) : 0;
                      return (
                        <g key={w.label}>
                          <Chip x={x0 + w.x} y={PANEL_Y + w.y} t={t} start={WORD_T[i]} end={WORD_T[i] + 0.35} label={w.label} width={w.w} fontSize={10}
                            color={hi > 0.5 ? ACCENT : MUTED_D} filled={hi > 0.5} pulse={w.hi ? hiWords : 0} />
                          {w.hi && <EyeNode x={x0 + w.x + w.w / 2 - 3} y={PANEL_Y + w.y - 12} t={t} arriveStart={HI_WORDS[0] + 0.1} arriveEnd={HI_WORDS[0] + 0.4} r={6.5} />}
                        </g>
                      );
                    })}
                    <Chip x={x0 + 56} y={PANEL_Y + 186} t={t} start={AUD_IN[0]} end={AUD_IN[1]} label="Audience" width={84} dashed color={MUTED_D} />
                    <DrawLine d={`M${x0 + 102},${PANEL_Y + 186} H${x0 + 166} M${x0 + 160},${PANEL_Y + 180} L${x0 + 166},${PANEL_Y + 186} L${x0 + 160},${PANEL_Y + 192}`}
                      t={t} start={FLOW_IN[0]} end={FLOW_IN[1]} />
                    <Chip x={x0 + 218} y={PANEL_Y + 186} t={t} start={CUST_IN[0]} end={CUST_IN[1]} label="Customers" width={92} filled />
                  </g>
                );
              })()}
            </Panel>
          </g>
        )}

        {/* =========================== P2 =========================== */}
        {p2Op > 0.001 && t >= PERSONS_IN[0] && (
          <g opacity={p2Op}>
            {/* one-way "just monitoring" — struck out */}
            <g opacity={monOp}>
              <DrawLine d={`M164,${OWNER_P.y} H800 M792,${OWNER_P.y - 7} L800,${OWNER_P.y} L792,${OWNER_P.y + 7}`}
                t={t} start={MON_LINE[0]} end={MON_LINE[1]} color={MUTED} width={1.8} />
              <Chip x={480} y={OWNER_P.y} t={t} start={MON_CHIP[0]} end={MON_CHIP[1]} label="Just monitoring" width={156} color={INK} dashed />
              <DrawLine d={`M404,${OWNER_P.y + 18} L556,${OWNER_P.y - 18}`} t={t} start={STRIKE[0]} end={STRIKE[1]} color={INK} width={2.4} />
            </g>

            {/* two-way, transparent working relation */}
            <DrawLine d={`M164,${OWNER_P.y} H796`} t={t} start={TWO_LINE[0]} end={TWO_LINE[1]} width={2.2} />
            <g opacity={prog(t, HEADS[0], HEADS[1])}>
              <path d={`M172,${OWNER_P.y - 8} L164,${OWNER_P.y} L172,${OWNER_P.y + 8} M788,${OWNER_P.y - 8} L796,${OWNER_P.y} L788,${OWNER_P.y + 8}`}
                fill="none" stroke={ACCENT} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </g>
            {prog(t, PANE[0], PANE[1]) > 0.001 && (
              <rect x={330} y={OWNER_P.y - 72} width={300} height={144} rx={18} fill={ACCENT} fillOpacity={0.05} stroke={ACCENT}
                strokeWidth={1.2} strokeDasharray="5 5" opacity={prog(t, PANE[0], PANE[1])} />
            )}
            {prog(t, HUB2[0], HUB2[1]) > 0.001 && (
              <g>
                <circle cx={480} cy={OWNER_P.y} r={40 + 8 * relPulse} fill="none" stroke={ACCENT} strokeWidth={1.2} opacity={relPulse * 0.5} />
                <EyeNode x={480} y={OWNER_P.y} t={t} arriveStart={HUB2[0]} arriveEnd={HUB2[1]} pulse={relPulse * 0.6} r={28} />
              </g>
            )}
            <Chip x={480} y={OWNER_P.y - 98} t={t} start={TRANSP2[0]} end={TRANSP2[1]} label="Transparent" width={130} />
            <Badge x={480} y={OWNER_P.y + 100} t={t} arriveStart={REL_BADGE[0]} arriveEnd={REL_BADGE[1]} label="Working relation" width={168} filled pulse={relPulse} />
          </g>
        )}

        {/* ===================== persons (P2 → end) ===================== */}
        <Person x={OWNER_P.x} y={OWNER_P.y} t={t} start={PERSONS_IN[0]} end={PERSONS_IN[1]} emoji="🧑‍💼" label="Business owner" pulse={ownerPulse} />
        <Person x={MKT_P.x} y={MKT_P.y} t={t} start={PERSONS_IN[0]} end={PERSONS_IN[1]} emoji="🧑‍💻" label="Marketer" pulse={mktPulse} />

        {/* =========================== P3 / P4 =========================== */}
        {/* look-lines: both look at the same data */}
        <DrawLine d={`M158,${OWNER_P.y} H${DASH.x - 2}`} t={t} start={LOOK_LINES[0]} end={LOOK_LINES[1]} opacity={0.7} />
        <DrawLine d={`M802,${MKT_P.y} H${DASH.x + DASH.w + 2}`} t={t} start={LOOK_LINES[0]} end={LOOK_LINES[1]} opacity={0.7} />
        <EyeNode x={224} y={OWNER_P.y} t={t} arriveStart={LOOK_EYES[0]} arriveEnd={LOOK_EYES[1]} r={9} />
        <EyeNode x={736} y={MKT_P.y} t={t} arriveStart={LOOK_EYES[0]} arriveEnd={LOOK_EYES[1]} r={9} />

        {dashP > 0.001 && (
          <g opacity={dashP} style={{ transformOrigin: `${DASH.x + DASH.w / 2}px ${DASH.y + DASH.h / 2}px`, transform: `scale(${lerp(0.95, 1, ease(dashP))})` }}>
            <rect x={DASH.x} y={DASH.y} width={DASH.w} height={DASH.h} rx={16} fill="#fff"
              stroke={clearGlow > 0.05 ? ACCENT : LINE} strokeWidth={clearGlow > 0.05 ? 1.9 : 1.3}
              style={{ filter: clearGlow > 0.05 ? `drop-shadow(0 0 ${14 * clearGlow}px rgba(91,61,240,0.5))` : "drop-shadow(0 6px 18px rgba(21,21,31,0.08))" }} />
            <CaptionLabel x={DASH.x + 16} y={DASH.y + 26} label="Shared dashboard" anchor="start" />
            <line x1={DASH.x + 28} x2={DASH.x + DASH.w - 28} y1={BASE_Y - BAR_H * TARGET} y2={BASE_Y - BAR_H * TARGET}
              stroke={INK} strokeWidth={1.3} strokeDasharray="4 4" opacity={0.45} />
            <text x={DASH.x + DASH.w - 28} y={BASE_Y - BAR_H * TARGET - 6} textAnchor="end" fontFamily={MONO} fontSize={9} fontWeight={700} fill={MUTED}>Expected</text>
            <line x1={DASH.x + 28} x2={DASH.x + DASH.w - 28} y1={BASE_Y + 1} y2={BASE_Y + 1} stroke={LINE} strokeWidth={1.3} />
            {BARS.map((b, i) => {
              const h = BAR_H * ratios[i] * barP[i];
              const fillOp = i === 0 ? 0.45 + 0.55 * improveP : 1;
              const rip = repeatRip > 0 && repeatRip < 1 && (i === 1 || i === 2) ? repeatRip : 0;
              return (
                <g key={b.label}>
                  {barP[i] > 0.001 && (
                    <rect x={BAR_X[i] - BAR_W / 2} y={BASE_Y - h} width={BAR_W} height={h} rx={6} fill={ACCENT} opacity={fillOp}
                      stroke={i === 0 && aFlash > 0.05 ? INK : "none"} strokeWidth={2}
                      style={{ filter: perfGlow > 0.05 ? `drop-shadow(0 0 ${8 * perfGlow}px ${ACCENT})` : "none" }} />
                  )}
                  {rip > 0 && (
                    <rect x={BAR_X[i] - BAR_W / 2 - 8 * rip} y={BASE_Y - h - 8 * rip} width={BAR_W + 16 * rip} height={h + 8 * rip} rx={8 + 4 * rip}
                      fill="none" stroke={ACCENT} strokeWidth={1.5} opacity={(1 - rip) * 0.7} />
                  )}
                  <text x={BAR_X[i]} y={BASE_Y + 17} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fontWeight={700} fill={MUTED}>{b.label}</text>
                </g>
              );
            })}
            {/* ghost targets for Improve / Scale */}
            {prog(t, IMPROVE_CHIP[0], IMPROVE_CHIP[1]) > 0 && (1 - improveP) > 0.02 && (
              <rect x={BAR_X[0] - BAR_W / 2} y={BASE_Y - BAR_H * 0.62} width={BAR_W} height={BAR_H * 0.62} rx={6} fill="none"
                stroke={ACCENT} strokeWidth={1.4} strokeDasharray="4 4" opacity={prog(t, IMPROVE_CHIP[0], IMPROVE_CHIP[1]) * (1 - improveP)} />
            )}
            {prog(t, SCALE_CHIP[0], SCALE_CHIP[1]) > 0 && (1 - scaleP) > 0.02 && (
              <rect x={BAR_X[4] - BAR_W / 2} y={BASE_Y - BAR_H * SCALE_TO} width={BAR_W} height={BAR_H * SCALE_TO} rx={6} fill="none"
                stroke={ACCENT} strokeWidth={1.4} strokeDasharray="4 4" opacity={prog(t, SCALE_CHIP[0], SCALE_CHIP[1]) * (1 - scaleP)} />
            )}
            {/* legend chips inside the header */}
            <Chip x={DASH.x + 200} y={DASH.y + 22} t={t} start={LEG_WORK[0]} end={LEG_WORK[1]} label="Working" width={72} fontSize={9} />
            <Chip x={DASH.x + 300} y={DASH.y + 22} t={t} start={LEG_UNDER[0]} end={LEG_UNDER[1]} label="Underperforming" width={112} fontSize={8.5} color={INK} />
          </g>
        )}

        {/* check / cross discs sit on top of the bars */}
        {[1, 2, 4].map((bi, k) => (
          <Disc key={`ok${bi}`} x={BAR_X[bi]} y={barTop(bi) - 15} t={t} start={OK_AT[k]} ok />
        ))}
        <Disc x={BAR_X[0]} y={barTop(0) - 15} t={t} start={X_AT} ok={false} op={1 - improveP} />

        <Chip x={480} y={168} t={t} start={SAME_CHIP[0]} end={SAME_CHIP[1]} fadeOut={[SAME_CHIP[2], SAME_CHIP[3]]} label="Same data" width={120} filled />
        <Badge x={480} y={CALLOUT_Y} t={t} arriveStart={DECISION[0]} arriveEnd={DECISION[1]} fadeOut={[DECISION[2], DECISION[3]]} label="Better decisions" width={176} filled pulse={togetherPulse} />

        {/* ---- P4 ---- */}
        <Chip x={480} y={168} t={t} start={CLEAR_CHIP[0]} end={CLEAR_CHIP[1]} label="Clear picture" width={130} filled pulse={clearGlow} />
        <Chip x={OWNER_P.x} y={214} t={t} start={ASK1[0]} end={ASK1[1]} label="Why the dip?" width={124} />
        <Chip x={OWNER_P.x} y={180} t={t} start={ASK2[0]} end={ASK2[1]} label="Which topic?" width={124} />

        {/* Improve / Repeat / Scale callouts */}
        <DrawLine d={`M${BAR_X[0]},${CALLOUT_Y - 14} V${DASH.y + DASH.h + 4}`} t={t} start={IMPROVE_CHIP[0] - 0.15} end={IMPROVE_CHIP[1]} width={1.5} opacity={0.7} />
        <Chip x={BAR_X[0]} y={CALLOUT_Y} t={t} start={IMPROVE_CHIP[0]} end={IMPROVE_CHIP[1]} label="Improve" width={100} color={INK} />
        <DrawLine d={`M445,${CALLOUT_Y - 14} V${DASH.y + DASH.h + 4}`} t={t} start={REPEAT_CHIP[0] - 0.15} end={REPEAT_CHIP[1]} width={1.5} opacity={0.7} />
        <Chip x={445} y={CALLOUT_Y} t={t} start={REPEAT_CHIP[0]} end={REPEAT_CHIP[1]} label="Repeat" width={100} />
        <DrawLine d={`M${BAR_X[4]},${CALLOUT_Y - 14} V${DASH.y + DASH.h + 4}`} t={t} start={SCALE_CHIP[0] - 0.15} end={SCALE_CHIP[1]} width={1.5} opacity={0.7} />
        <Chip x={BAR_X[4]} y={CALLOUT_Y} t={t} start={SCALE_CHIP[0]} end={SCALE_CHIP[1]} label="Scale" width={92} filled />
      </g>
    </svg>
  );
}

/* =================================================================
   The scene the player mounts. Restart remounts it → clock back to 0.
================================================================= */
export default function NoRely({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <NoRelyFrame ms={elapsed} />
    </div>
  );
}
