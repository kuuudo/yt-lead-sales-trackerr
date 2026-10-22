import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "agency2" (agency2.tsx) — 50 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (~110 words, pace ≈ 0.45 s / word):

   [A 0.0-8.0 ] "While your competitors rely on case studies and testimonials, your agency can go a step further, showing results down to each individual post, video, or campaign."
   [B 8.0-14.0] "Including clicks, leads, newsletter signups, sales calls, and revenue."
   [C 14.0-20.5] "And this doesn't just help you win clients, it adds value to your service."
   [D 20.5-32.0] "You can show prospects the visibility they'll get by working with you, then give clients ongoing access to their marketing performance so they can see the work you're doing."
   [E 32.0-36.0] "And the results it delivers."
   [F 36.0-50.0] "This helps you go beyond surface-level numbers, demonstrate the value of your work, and give clients and prospects more confidence in your services."

   WHAT HAPPENS
     A  Competitors side (Case studies · Testimonials) vs Your side (Post · Video · Campaign tiles with eyes).
     B  Five metric chips appear under the granular tiles: Clicks · Leads · Newsletter · Sales calls · Revenue.
     C  Two value cards: Win clients · Adds value to service. Competitors zone dims.
     D  Split path: Prospects get a “Visibility preview”; Clients get “Ongoing access” dashboard card.
     E  Soft pulse on the results / performance area.
     F  Final statement chips: Beyond surface numbers · Demonstrate value · More confidence. Everything holds.

   To retime, edit the BEAT TIMING constants and the METRICS / FINAL start times.
   Self-contained: React + scene props type + the optional clock hook only.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MUTED = "#9a9aa8";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 50000;

/* ---------------- timing math (all times in SECONDS) ---------------- */
function clamp(v: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function prog(t: number, a: number, b: number) { return clamp((t - a) / (b - a)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function bump(t: number, a: number, b: number) { return t > a && t < b ? Math.sin(prog(t, a, b) * Math.PI) : 0; }

/* ---------------- BEAT TIMING (seconds) ---------------- */
const HEAD_IN = [0.15, 0.55];
const VS_IN = [0.6, 1.2];

// A — competitors vs you
const COMP_1 = [1.4, 2.2];      // Case studies
const COMP_2 = [2.6, 3.4];      // Testimonials
const YOU_LABEL = [4.0, 4.8];
const GRANULAR = [
  { label: "Post",    letter: "P", start: 5.4 },
  { label: "Video",   letter: "V", start: 6.3 },
  { label: "Campaign", letter: "C", start: 7.2 },
];

// B — metrics
const METRICS = [
  { label: "Clicks",      start: 8.4 },
  { label: "Leads",       start: 9.4 },
  { label: "Newsletter",  start: 10.5 },
  { label: "Sales calls", start: 11.6 },
  { label: "Revenue",     start: 12.7 },
];

// C — win clients + add value
const WIN_CARD = [14.6, 15.8];
const VALUE_CARD = [16.8, 18.0];
const DIM_COMP = [14.2, 15.4];

// D — prospects vs clients
const PROSPECT_IN = [21.2, 22.6];
const CLIENT_IN = [25.5, 27.0];
const ACCESS_LINE = [24.0, 26.0];

// E
const RESULT_PULSE = [32.5, 35.0];

// F — final confidence
const FINAL_1 = [37.0, 38.4];   // Beyond surface numbers
const FINAL_2 = [40.0, 41.4];   // Demonstrate value
const FINAL_3 = [43.5, 45.0];   // More confidence
const HOLD_PULSE = [46.5, 49.0];

/* ---------------- layout ---------------- */
const CX = 480;
const COMP_X = 200;
const YOU_X = 680;

/* ---------------- primitives ---------------- */
function Badge({ x, y, t, arriveStart, arriveEnd, label, width = 96, filled = false }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; width?: number; filled?: boolean }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const h = 28, bx = x - width / 2, by = y - h / 2;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.85, 1, p)})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={14} fill={filled ? ACCENT : "#ffffff"} stroke={ACCENT} strokeWidth={1.3}
        style={{ filter: "drop-shadow(0 4px 10px rgba(91,61,240,0.2))" }} />
      {!filled && <path d={`M${bx + 2},${by + 2} l10,0 M${bx + 2},${by + 2} l0,10`} stroke={ACCENT} strokeWidth={1.3} strokeLinecap="round" fill="none" />}
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11} letterSpacing={1.1}
        fill={filled ? "#ffffff" : ACCENT} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function Chip({ x, y, t, start, end, label, width = 118, fontSize = 10 }:
  { x: number; y: number; t: number; start: number; end: number; label: string; width?: number; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 24, bx = x - width / 2, by = y - h / 2;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.9, 1, p)})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill="#ffffff" stroke={ACCENT} strokeWidth={1.1} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.6}
        fill={ACCENT} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
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

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string }) {
  const p = prog(t, start, end);
  if (p <= 0) return null;
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} opacity={opacity} />;
}

function SimpleCard({ x, y, t, start, end, title, sub, width = 200 }:
  { x: number; y: number; t: number; start: number; end: number; title: string; sub?: string; width?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = sub ? 58 : 44;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.9, 1, p)})` }}>
      <rect x={x - width / 2} y={y - h / 2} width={width} height={h} rx={12} fill="#fff" stroke={LINE} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      <text x={x} y={sub ? y - 8 : y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={12} letterSpacing={0.3} fill={INK}>{title}</text>
      {sub && <text x={x} y={y + 14} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={600} fontSize={10} fill={MUTED}>{sub}</text>}
    </g>
  );
}

function GranularTile({ x, y, t, start, letter, label }:
  { x: number; y: number; t: number; start: number; letter: string; label: string }) {
  const tileP = prog(t, start - 0.1, start + 0.35);
  if (tileP <= 0.001) return null;
  const active = bump(t, start, start + 1.0);
  const lit = active > 0.05;
  return (
    <g opacity={tileP} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.92, 1, tileP) * (1 + 0.03 * active)})` }}>
      <rect x={x - 55} y={y - 24} width={110} height={48} rx={11} fill="#fff"
        stroke={lit ? ACCENT : LINE} strokeWidth={lit ? 1.7 : 1.2}
        style={{ filter: lit ? `drop-shadow(0 0 ${10 * active}px rgba(91,61,240,0.45))` : "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      <circle cx={x - 30} cy={y} r={14} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.2} />
      <text x={x - 30} y={y} dy="0.35em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={13} fill={ACCENT}>{letter}</text>
      <text x={x + 14} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={0.3} fill={INK}>{label}</text>
      <EyeNode x={x + 42} y={y} t={t} arriveStart={start + 0.15} arriveEnd={start + 0.4} pulse={active * 0.5} r={5.5} />
    </g>
  );
}

/* =================================================================
   One frame as a pure function of time (ms).
================================================================= */
export function Agency2Frame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  const compDim = 1 - 0.55 * prog(t, DIM_COMP[0], DIM_COMP[1]);
  const resultPulse = bump(t, RESULT_PULSE[0], RESULT_PULSE[1]);
  const holdPulse = bump(t, HOLD_PULSE[0], HOLD_PULSE[1]);

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,6)">
        {/* Header */}
        <Badge x={CX} y={32} t={t} arriveStart={HEAD_IN[0]} arriveEnd={HEAD_IN[1]} label="VSTRK" width={110} filled />
        <Chip x={CX} y={66} t={t} start={VS_IN[0]} end={VS_IN[1]} label="Competitors vs You" width={180} />

        {/* ----- A: Competitors (left) ----- */}
        <g opacity={compDim}>
          <text x={COMP_X} y={108} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={0.6} fill={MUTED}
            opacity={prog(t, 1.0, 1.5)} style={{ textTransform: "uppercase" }}>Competitors</text>
          <SimpleCard x={COMP_X} y={148} t={t} start={COMP_1[0]} end={COMP_1[1]} title="Case studies" width={170} />
          <SimpleCard x={COMP_X} y={210} t={t} start={COMP_2[0]} end={COMP_2[1]} title="Testimonials" width={170} />
        </g>

        {/* Divider */}
        <DrawLine d={`M${CX},100 L${CX},250`} t={t} start={1.0} end={2.0} width={1.2} color={LINE} opacity={0.7} />

        {/* ----- A: You (right) — granular ----- */}
        <text x={YOU_X} y={108} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={0.6} fill={ACCENT}
          opacity={prog(t, YOU_LABEL[0], YOU_LABEL[1])} style={{ textTransform: "uppercase" }}>Your agency</text>
        {GRANULAR.map((g, i) => (
          <GranularTile key={g.label} x={YOU_X - 120 + i * 120} y={170} t={t} start={g.start} letter={g.letter} label={g.label} />
        ))}

        {/* ----- B: Metrics row ----- */}
        {METRICS.map((m, i) => {
          const x = 160 + i * 160;
          return (
            <Chip key={m.label} x={x} y={260} t={t} start={m.start} end={m.start + 0.7} label={m.label} width={130} fontSize={9.5} />
          );
        })}

        {/* ----- C: Win + Value ----- */}
        <g style={{ transformOrigin: `${CX}px 320px`, transform: `scale(${1 + 0.03 * resultPulse})` }}>
          <SimpleCard x={300} y={320} t={t} start={WIN_CARD[0]} end={WIN_CARD[1]} title="Win clients" sub="close more deals" width={200} />
          <SimpleCard x={660} y={320} t={t} start={VALUE_CARD[0]} end={VALUE_CARD[1]} title="Adds value" sub="to your service" width={200} />
        </g>

        {/* ----- D: Prospects vs Clients ----- */}
        <SimpleCard x={260} y={400} t={t} start={PROSPECT_IN[0]} end={PROSPECT_IN[1]} title="Prospects" sub="Visibility preview" width={210} />
        <DrawLine d={`M370,400 L500,400`} t={t} start={ACCESS_LINE[0]} end={ACCESS_LINE[1]} width={1.4} color={ACCENT} opacity={0.6} />
        <SimpleCard x={700} y={400} t={t} start={CLIENT_IN[0]} end={CLIENT_IN[1]} title="Clients" sub="Ongoing access" width={210} />
        <EyeNode x={700 + 90} y={400} t={t} arriveStart={CLIENT_IN[0] + 0.3} arriveEnd={CLIENT_IN[0] + 0.55} pulse={resultPulse * 0.5} r={6} />

        {/* ----- F: Final three chips ----- */}
        <Chip x={200} y={490} t={t} start={FINAL_1[0]} end={FINAL_1[1]} label="Beyond surface numbers" width={200} fontSize={9} />
        <Chip x={480} y={490} t={t} start={FINAL_2[0]} end={FINAL_2[1]} label="Demonstrate value" width={170} fontSize={9.5} />
        <Chip x={740} y={490} t={t} start={FINAL_3[0]} end={FINAL_3[1]} label="More confidence" width={150} fontSize={9.5} />

        {/* subtle hold pulse ring on final confidence area */}
        {holdPulse > 0.01 && (
          <circle cx={CX} cy={490} r={20 + 30 * holdPulse} fill="none" stroke={ACCENT} strokeWidth={1.2} opacity={0.25 * (1 - holdPulse)} />
        )}
      </g>
    </svg>
  );
}

/* =================================================================
   The scene the player mounts. Restart remounts it → clock back to 0.
================================================================= */
export default function Agency2({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <Agency2Frame ms={elapsed} />
    </div>
  );
}
