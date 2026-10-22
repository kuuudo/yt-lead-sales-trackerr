import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "BissOwner" (BusinessOwnerVstrkhelp.tsx) — 38 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (67 words, ≈ 0.56 s / word incl. pauses):

   [A  0.0-19.0] "VSTRK helps business owners who work with marketing agencies or are
                  considering hiring one gain greater transparency and hold their agencies
                  accountable by means to measure performances, tracking clicks, customer
                  actions, conversions, and revenue."
   [B 19.0-25.6] "This helps you understand what's working, what's not, evaluate delivery
                  against expectation."
   [C 25.6-30.0] "And where your marketing investment is paying off."
   [D 30.0-38.0] "So you and your agency can make better decisions and improve campaigns
                  together."

   WHAT HAPPENS
     A  VSTRK badge → business owner (1.1 s) → line to the marketing agency
        ("works with", 3.2-4.4 s) → "considering hiring" chip (6.1 s) → VSTRK eye-hub on the
        line = transparency (8.0 s) → agency gets "Accountable" + check (11.8 s) → a trunk
        branches from the hub into four empty slots ("measure performance", 13-14.6 s)
        → slots fill with Clicks (15.7) → Actions (16.8) → Conversions (17.4) → Revenue (18.5);
        the top row dims as the metrics take focus.
     B  Delivered-vs-expected bars grow (20.7 s). Check discs land on "working" (Clicks,
        Conversions, Revenue), a cross on "not" (Actions, 22.9 s). Legend chips Delivered /
        Expected appear and the dashed expected ticks draw on ("against expectation", 24.6 s).
     C  Everything but Revenue dims. "Marketing investment" chip + arrow feed the Revenue
        card; on "paying off" the chip becomes a filled "Paying off" badge with a ripple.
     D  Owner and agency light up again, two dots shuttle between them through the hub;
        "Better decisions" lands under the owner, "Improve campaigns" under the agency,
        "Together" lights on the trunk. Last frame = everything visible, held.

   TO RETIME: edit the seconds in the BEAT TIMING block below (nothing else).
   Neutral emoji / bars / circles only — no brand logos. Illustrative numbers only.
   Self-contained: React + scene props type + the optional clock hook only.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MUTED = "#9a9aa8";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 38000;

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
/* A — business owner / agency / transparency / measure */
const BADGE_IN = [0.1, 0.6];            // VSTRK badge            "VSTRK helps"
const OWNER_IN = [1.1, 1.7];            // owner                  "business owners"
const WORKS_LINE = [3.2, 4.5];          // owner → agency line    "who work with"
const WORKS_CHIP = [3.4, 3.9];          // "Works with" chip
const AGENCY_IN = [4.1, 4.7];           // agency                 "marketing agencies"
const CONSIDER = [6.1, 6.5, 8.6, 9.0];  // "Considering hiring"   "or are considering hiring one"  (in a→b, out c→d)
const AGENCY_PULSE_1 = [6.7, 7.3];
const LINE_SOLID = [7.9, 9.0];          // line turns violet      "gain greater"
const HUB_IN = [8.0, 8.9];              // VSTRK eye hub          "transparency"
const HUB_PULSE_1 = [8.9, 9.7];
const TRANSP_CHIP = [8.9, 9.4];         // "Transparency" chip
const AGENCY_PULSE_2 = [11.2, 12.0];    //                        "their agencies"
const ACCOUNT_CHIP = [11.8, 12.3];      // "Accountable" badge    "accountable"
const ACCOUNT_OUT = [14.8, 15.3];       // badge fades as focus moves on
const AGENCY_CHECK = [12.3, 12.8];
const MEASURE_LABEL = [13.2, 13.7];     //                        "measure performances"
const TRUNK = [12.9, 13.9];
const BRANCH_H = [13.9, 14.6];
const BRANCH_V = [14.5, 14.9];
const SLOT_IN = { start: 13.9, stagger: 0.1, dur: 0.4 };
const DIM_TOP = [15.0, 15.6];           // top row dims while metrics are the focus

/* The four metric cards: `start` = second its word is spoken. */
interface Metric {
  label: string; value: string; cx: number; start: number;
  ratio: number;     // delivered (0..1)
  target: number;    // expected  (0..1)
  ok: boolean;       // working / not working
  statusAt: number;  // check / cross lands
  arrow: [number, number] | null;   // chevron from the PREVIOUS card
}
const METRICS: Metric[] = [
  { label: "Clicks",      value: "1,284", cx: 150, start: 15.6, ratio: 0.82, target: 0.68, ok: true,  statusAt: 21.5, arrow: null },
  { label: "Actions",     value: "326",   cx: 370, start: 16.7, ratio: 0.38, target: 0.62, ok: false, statusAt: 22.9, arrow: [16.2, 16.6] },
  { label: "Conversions", value: "47",    cx: 590, start: 17.3, ratio: 0.74, target: 0.60, ok: true,  statusAt: 21.8, arrow: [17.0, 17.3] },
  { label: "Revenue",     value: "$6.2k", cx: 810, start: 18.4, ratio: 0.90, target: 0.72, ok: true,  statusAt: 22.1, arrow: [17.8, 18.2] },
];

/* B — understand / evaluate */
const BARS_IN = [20.7, 21.6];           // delivered bars grow    "understand"
const LEG_WORKING = [21.2, 21.7];       // legend                 "what's working"
const LEG_NOT = [22.5, 23.0];           //                        "what's not"
const LEG_DELIVERED = [23.5, 24.0];     //                        "evaluate delivery"
const LEG_EXPECTED = [24.6, 25.1];      //                        "against expectation"
const TICKS_IN = [24.6, 25.4];          // dashed expected ticks
const LEG_OUT = [25.4, 25.9];
const BARS_PULSE = [24.0, 24.8];

/* C — investment paying off */
const FOCUS_DIM = [26.2, 26.8];         // other cards dim        "And where your"
const FOCUS_REV = [26.8, 27.4];         // Revenue card lifts     "marketing"
const INVEST_CHIP = [27.0, 27.5, 28.6, 28.9]; // "Marketing investment" chip (in a→b, out c→d)
const INVEST_ARROW = [27.6, 28.5];      //                        "investment is"
const PAYING_BADGE = [28.9, 29.4];      // "Paying off" badge     "paying off"
const RIPPLE = [29.4, 30.1];
const RESTORE = [30.0, 30.6];           // everything back to full

/* D — together */
const OWNER_PULSE_D = [30.4, 31.1];     //                        "you"
const AGENCY_PULSE_D = [31.2, 32.0];    //                        "your agency"
const SHUTTLE_START = 30.6;             // dots travel through the hub
const DECISIONS = [33.1, 33.7];         // "Better decisions"     "better decisions"
const CAMPAIGNS = [34.8, 35.4];         // "Improve campaigns"    "improve campaigns"
const TOGETHER = [36.2, 36.8];          // "Together" badge       "together"
const TOGETHER_PULSE = [36.2, 37.1];

/* ---------------- layout ---------------- */
const ROW_Y = 130;                      // owner / hub / agency row
const OWNER_X = 150, AGENCY_X = 810, HUB_X = 480;
const CARD_W = 180, CARD_H = 100, CARD_Y = 330;
const BAR_W = 140;
const LEGEND_Y = 478;

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

function Chip({ x, y, t, start, end, label, width = 118, fontSize = 10, color = ACCENT, filled = false, dashed = false, fadeOut }:
  { x: number; y: number; t: number; start: number; end: number; label: string; width?: number; fontSize?: number; color?: string; filled?: boolean; dashed?: boolean; fadeOut?: number[] }) {
  const inP = prog(t, start, end);
  const p = fadeOut ? inP * (1 - prog(t, fadeOut[0], fadeOut[1])) : inP;
  if (p <= 0.001) return null;
  const h = 24, bx = x - width / 2, by = y - h / 2;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.9, 1, inP)})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill={filled ? color : "#ffffff"} stroke={color} strokeWidth={1.1}
        strokeDasharray={dashed ? "4 3" : undefined} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.6}
        fill={filled ? "#ffffff" : color} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function CaptionLabel({ x, y, label, anchor = "middle", fill = MUTED }:
  { x: number; y: number; label: string; anchor?: "start" | "middle"; fill?: string }) {
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

function Disc({ x, y, t, start, ok }: { x: number; y: number; t: number; start: number; ok: boolean }) {
  const p = prog(t, start, start + 0.35);
  if (p <= 0.001) return null;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.5, 1, ease(p))})` }}>
      <circle cx={x} cy={y} r={11} fill={ok ? ACCENT : INK} stroke="#fff" strokeWidth={2} />
      {ok
        ? <path d={`M${x - 4.5},${y + 0.5} l3.2,3.4 l6,-7`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        : <path d={`M${x - 3.6},${y - 3.6} l7.2,7.2 M${x + 3.6},${y - 3.6} l-7.2,7.2`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />}
    </g>
  );
}

/* =================================================================
   One frame as a pure function of time (ms). Exported for off-player checks.
================================================================= */
export function BusinessOwnerFrame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  /* global focus / dim factors */
  const dimP = prog(t, DIM_TOP[0], DIM_TOP[1]) - prog(t, RESTORE[0], RESTORE[1]);
  const topOp = 1 - 0.62 * dimP;
  const focusDim = prog(t, FOCUS_DIM[0], FOCUS_DIM[1]) - prog(t, RESTORE[0], RESTORE[1]);
  const othersOp = 1 - 0.7 * focusDim;
  const focusRev = prog(t, FOCUS_REV[0], FOCUS_REV[1]) * (1 - prog(t, RESTORE[0], RESTORE[1]));

  /* pulses */
  const ownerPulse = bump(t, OWNER_PULSE_D[0], OWNER_PULSE_D[1]) + bump(t, TOGETHER_PULSE[0], TOGETHER_PULSE[1]);
  const agencyPulse = bump(t, AGENCY_PULSE_1[0], AGENCY_PULSE_1[1]) + bump(t, AGENCY_PULSE_2[0], AGENCY_PULSE_2[1])
    + bump(t, AGENCY_PULSE_D[0], AGENCY_PULSE_D[1]) + bump(t, TOGETHER_PULSE[0], TOGETHER_PULSE[1]);
  const hubPulse = bump(t, HUB_PULSE_1[0], HUB_PULSE_1[1]) + bump(t, TOGETHER_PULSE[0], TOGETHER_PULSE[1]);
  const togetherPulse = bump(t, TOGETHER_PULSE[0], TOGETHER_PULSE[1]);
  const barsPulse = bump(t, BARS_PULSE[0], BARS_PULSE[1]);

  const barsP = ease(prog(t, BARS_IN[0], BARS_IN[1]));
  const ticksP = prog(t, TICKS_IN[0], TICKS_IN[1]);
  const legOut = 1 - prog(t, LEG_OUT[0], LEG_OUT[1]);

  /* shuttle dots through the hub (phase D) */
  const dotOp = prog(t, SHUTTLE_START, SHUTTLE_START + 0.4);
  const u = (((t - SHUTTLE_START) * 0.28) % 1 + 1) % 1;
  const lineA = OWNER_X + 38, lineB = AGENCY_X - 38;

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,16)">
        <Badge x={480} y={44} t={t} arriveStart={BADGE_IN[0]} arriveEnd={BADGE_IN[1]} label="VSTRK" width={110} filled />

        {/* ================= top row: owner — hub — agency ================= */}
        <g opacity={topOp}>
          {/* owner → agency line: grey first, violet once VSTRK sits in the middle */}
          <DrawLine d={`M${lineA},${ROW_Y} H${lineB}`} t={t} start={WORKS_LINE[0]} end={WORKS_LINE[1]} color={LINE} width={2} />
          <DrawLine d={`M${lineA},${ROW_Y} H${lineB}`} t={t} start={LINE_SOLID[0]} end={LINE_SOLID[1]} color={ACCENT} width={2} />

          <Person x={OWNER_X} y={ROW_Y} t={t} start={OWNER_IN[0]} end={OWNER_IN[1]} emoji="🧑‍💼" label="Business owner" pulse={ownerPulse} />
          <Person x={AGENCY_X} y={ROW_Y} t={t} start={AGENCY_IN[0]} end={AGENCY_IN[1]} emoji="🏢" label="Marketing agency" pulse={agencyPulse} />

          <Chip x={330} y={ROW_Y} t={t} start={WORKS_CHIP[0]} end={WORKS_CHIP[1]} label="Works with" width={106} />
          <Chip x={AGENCY_X} y={76} t={t} start={CONSIDER[0]} end={CONSIDER[1]} fadeOut={[CONSIDER[2], CONSIDER[3]]} label="Considering hiring" width={176} />

          {/* VSTRK hub = transparency */}
          {prog(t, HUB_IN[0], HUB_IN[1]) > 0.001 && (
            <g>
              <circle cx={HUB_X} cy={ROW_Y} r={40 + 8 * hubPulse} fill="none" stroke={ACCENT} strokeWidth={1.2}
                opacity={hubPulse * 0.5} />
              <EyeNode x={HUB_X} y={ROW_Y} t={t} arriveStart={HUB_IN[0]} arriveEnd={HUB_IN[1]} pulse={hubPulse * 0.6} r={28} />
            </g>
          )}
          <Chip x={HUB_X} y={80} t={t} start={TRANSP_CHIP[0]} end={TRANSP_CHIP[1]} label="Transparency" width={130} />

          {/* accountable */}
          <Badge x={AGENCY_X} y={214} t={t} arriveStart={ACCOUNT_CHIP[0]} arriveEnd={ACCOUNT_CHIP[1]} fadeOut={ACCOUNT_OUT} label="Accountable" width={134} filled />
          <Disc x={AGENCY_X + 28} y={ROW_Y - 28} t={t} start={AGENCY_CHECK[0]} ok />

          {/* shuttle dots: you ⇄ your agency, through the hub */}
          {dotOp > 0.001 && (
            <g opacity={dotOp}>
              <circle cx={lerp(lineA, lineB, u)} cy={ROW_Y} r={4.5} fill={ACCENT} />
              <circle cx={lerp(lineB, lineA, u)} cy={ROW_Y} r={4.5} fill={ACCENT} opacity={0.55} />
            </g>
          )}

          {/* decisions / campaigns land under each side */}
          <Chip x={OWNER_X} y={214} t={t} start={DECISIONS[0]} end={DECISIONS[1]} label="Better decisions" width={164} />
          <Chip x={AGENCY_X} y={214} t={t} start={CAMPAIGNS[0]} end={CAMPAIGNS[1]} label="Improve campaigns" width={184} />

          {/* measure: trunk from the hub into the four slots */}
          <DrawLine d={`M${HUB_X},${ROW_Y + 28} V292`} t={t} start={TRUNK[0]} end={TRUNK[1]} width={1.6} opacity={0.55} />
          <DrawLine d={`M${HUB_X},292 H${METRICS[0].cx}`} t={t} start={BRANCH_H[0]} end={BRANCH_H[1]} width={1.6} opacity={0.55} />
          <DrawLine d={`M${HUB_X},292 H${METRICS[3].cx}`} t={t} start={BRANCH_H[0]} end={BRANCH_H[1]} width={1.6} opacity={0.55} />
          {METRICS.map((m) => (
            <DrawLine key={m.label} d={`M${m.cx},292 V${CARD_Y - 2}`} t={t} start={BRANCH_V[0]} end={BRANCH_V[1]} width={1.6} opacity={0.55} />
          ))}
          {prog(t, MEASURE_LABEL[0], MEASURE_LABEL[1]) > 0.001 && (
            <g opacity={prog(t, MEASURE_LABEL[0], MEASURE_LABEL[1])}>
              <CaptionLabel x={HUB_X + 14} y={226} label="Measure performance" anchor="start" />
            </g>
          )}
          <Badge x={HUB_X} y={258} t={t} arriveStart={TOGETHER[0]} arriveEnd={TOGETHER[1]} label="Together" width={104} filled pulse={togetherPulse} />
        </g>

        {/* ================= metric slots + cards ================= */}
        {METRICS.map((m, i) => {
          const slotStart = SLOT_IN.start + i * SLOT_IN.stagger;
          const slotP = prog(t, slotStart, slotStart + SLOT_IN.dur);
          const cardP = prog(t, m.start, m.start + 0.5);
          const isRev = m.label === "Revenue";
          const op = isRev ? 1 : othersOp;
          const lift = isRev ? focusRev : 0;
          const x0 = m.cx - CARD_W / 2;
          const bx = m.cx - BAR_W / 2;
          const rip = isRev ? prog(t, RIPPLE[0], RIPPLE[1]) : 0;

          return (
            <g key={m.label} opacity={op}>
              {/* empty slot until the card lands */}
              <rect x={x0} y={CARD_Y} width={CARD_W} height={CARD_H} rx={14} fill="none" stroke={LINE} strokeWidth={1.3}
                strokeDasharray="5 6" opacity={slotP * (1 - cardP)} />

              {cardP > 0.001 && (
                <g opacity={cardP} style={{ transformOrigin: `${m.cx}px ${CARD_Y + CARD_H / 2}px`, transform: `scale(${lerp(0.92, 1, cardP) * (1 + 0.06 * lift)})` }}>
                  <rect x={x0} y={CARD_Y} width={CARD_W} height={CARD_H} rx={14} fill="#fff"
                    stroke={lift > 0.05 ? ACCENT : LINE} strokeWidth={lift > 0.05 ? 1.8 : 1.3}
                    style={{ filter: lift > 0.05 ? `drop-shadow(0 0 ${12 * lift}px rgba(91,61,240,0.5))` : "drop-shadow(0 4px 12px rgba(21,21,31,0.07))" }} />
                  <CaptionLabel x={m.cx - 74} y={353} label={m.label} anchor="start" />
                  <text x={m.cx} y={385} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={26} fill={INK}>{m.value}</text>

                  {/* delivered vs expected */}
                  {barsP > 0.001 && (
                    <g opacity={barsP}>
                      <rect x={bx} y={410} width={BAR_W} height={7} rx={3.5} fill={LINE} />
                      <rect x={bx} y={410} width={BAR_W * m.ratio * barsP} height={7} rx={3.5} fill={ACCENT}
                        style={{ filter: barsPulse > 0.05 ? `drop-shadow(0 0 ${6 * barsPulse}px ${ACCENT})` : "none" }} />
                    </g>
                  )}
                  {ticksP > 0.001 && (
                    <line x1={bx + BAR_W * m.target} x2={bx + BAR_W * m.target} y1={405} y2={405 + 17 * ticksP}
                      stroke={INK} strokeWidth={1.7} strokeDasharray="3 2.5" strokeLinecap="round" />
                  )}
                </g>
              )}

              {cardP > 0.001 && (
                <EyeNode x={m.cx + 74} y={353} t={t} arriveStart={m.start + 0.25} arriveEnd={m.start + 0.5} r={6.5} />
              )}
              <Disc x={x0 + 2} y={CARD_Y + 2} t={t} start={m.statusAt} ok={m.ok} />

              {/* ripple on "paying off" */}
              {rip > 0 && rip < 1 && (
                <rect x={x0 - 16 * rip} y={CARD_Y - 16 * rip} width={CARD_W + 32 * rip} height={CARD_H + 32 * rip} rx={14 + 12 * rip}
                  fill="none" stroke={ACCENT} strokeWidth={1.5} opacity={(1 - rip) * 0.6} />
              )}
            </g>
          );
        })}

        {/* flow chevrons between the cards */}
        {METRICS.map((m) => {
          if (!m.arrow) return null;
          const ax = m.cx - CARD_W / 2 - 20;      // centre of the gap before this card
          return (
            <g key={`ar-${m.label}`} opacity={m.label === "Revenue" ? 1 : othersOp}>
              <DrawLine d={`M${ax - 10},${CARD_Y + 50} H${ax + 8} M${ax + 3},${CARD_Y + 44} L${ax + 9},${CARD_Y + 50} L${ax + 3},${CARD_Y + 56}`}
                t={t} start={m.arrow[0]} end={m.arrow[1]} width={1.7} />
            </g>
          );
        })}

        {/* ================= legend (phase B) ================= */}
        <g opacity={legOut}>
          <Chip x={284} y={LEGEND_Y} t={t} start={LEG_WORKING[0]} end={LEG_WORKING[1]} label="Working" width={100} />
          <Chip x={413} y={LEGEND_Y} t={t} start={LEG_NOT[0]} end={LEG_NOT[1]} label="Not working" width={130} color={INK} />
          <Chip x={547} y={LEGEND_Y} t={t} start={LEG_DELIVERED[0]} end={LEG_DELIVERED[1]} label="Delivered" width={110} filled />
          <Chip x={671} y={LEGEND_Y} t={t} start={LEG_EXPECTED[0]} end={LEG_EXPECTED[1]} label="Expected" width={110} color={INK} dashed />
        </g>

        {/* ================= phase C: investment → paying off ================= */}
        <DrawLine d={`M${AGENCY_X},${LEGEND_Y - 16} V${CARD_Y + CARD_H + 8} M${AGENCY_X - 6},${CARD_Y + CARD_H + 15} L${AGENCY_X},${CARD_Y + CARD_H + 8} L${AGENCY_X + 6},${CARD_Y + CARD_H + 15}`}
          t={t} start={INVEST_ARROW[0]} end={INVEST_ARROW[1]} width={1.8} />
        <Chip x={AGENCY_X} y={LEGEND_Y} t={t} start={INVEST_CHIP[0]} end={INVEST_CHIP[1]} fadeOut={[INVEST_CHIP[2], INVEST_CHIP[3]]} label="Marketing investment" width={196} />
        <Badge x={AGENCY_X} y={LEGEND_Y} t={t} arriveStart={PAYING_BADGE[0]} arriveEnd={PAYING_BADGE[1]} label="Paying off" width={126} filled />
      </g>
    </svg>
  );
}

/* =================================================================
   The scene the player mounts. Restart remounts it → clock back to 0.
================================================================= */
export default function BusinessOwnerVstrkhelp({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <BusinessOwnerFrame ms={elapsed} />
    </div>
  );
}
