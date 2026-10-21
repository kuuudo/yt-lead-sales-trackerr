import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "two options" (twooptions.tsx) — 10 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (~28 words, fast pace ≈ 0.36 s / word):

   [A 0.0-1.4 ] "You have two options.
   [B 1.4-3.6 ]  You can promote your own product,
   [C 3.6-5.7 ]  or you can work with others,
   [D 5.7-10.0]  whether that's hiring a marketing team, an internal marketing team, or agency."

   WHAT HAPPENS
     A  Two numbered columns appear, split by a divider.
     B  Option 1: YOU → (promote) → YOUR PRODUCT.
     C  An "OR" appears on the divider; Option 2: "Work With Others" with YOU on top.
     D  Option 1 dims. Three paths branch from YOU, in time with the words:
        Marketing Team → Internal Team → Agency.

   To retime, edit the seconds in the BEAT TIMING block.
   Self-contained: React + scene props type + the optional clock hook only.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 10000;

/* ---------------- timing math (all times in SECONDS) ---------------- */
function clamp(v: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function prog(t: number, a: number, b: number) { return clamp((t - a) / (b - a)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function bump(t: number, a: number, b: number) { return t > a && t < b ? Math.sin(prog(t, a, b) * Math.PI) : 0; }

/* ---------------- BEAT TIMING (seconds) ---------------- */
// A — two options
const DIVIDER = [0.1, 0.9];
const NUM_1 = [0.2, 0.6];
const NUM_2 = [0.7, 1.1];
// B — promote your own product
const L_HEAD = [1.5, 2.0];
const L_YOU = [1.7, 2.1];
const L_LINE = [2.3, 2.9];
const L_PROMOTE = [2.6, 3.1];
const L_PRODUCT = [2.7, 3.3];
// C — work with others
const OR_IN = [3.7, 4.1];
const R_HEAD = [4.2, 4.7];
const R_YOU = [4.6, 5.0];
// D — the three ways to work with others
const DIM_LEFT = [5.8, 6.4];
const PATHS = [
  { x: 560, emoji: "👥", label: "Marketing Team", line: [6.0, 6.6], icon: [6.4, 6.9], chip: [6.6, 7.1] },
  { x: 690, emoji: "🏢", label: "Internal Team", line: [8.0, 8.5], icon: [8.3, 8.8], chip: [8.5, 9.0] },
  { x: 820, emoji: "🤝", label: "Agency", line: [9.0, 9.4], icon: [9.2, 9.6], chip: [9.3, 9.75] },
];

/* ---------------- layout ---------------- */
const LX = 215;      // left column centre
const RX = 690;      // right column centre
const DIV_X = 440;   // divider

/* ---------------- primitives (same grammar as the other VSL scenes) ---------------- */
function Person({ x, y, size = 26, opacity = 1, emoji = "🧑" }: { x: number; y: number; size?: number; opacity?: number; emoji?: string }) {
  if (opacity <= 0.001) return null;
  return <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} opacity={opacity}>{emoji}</text>;
}

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

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string }) {
  const p = prog(t, start, end);
  if (p <= 0) return null;
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} opacity={opacity} />;
}

function CaptionLabel({ x, y, text, opacity }: { x: number; y: number; text: string; opacity: number }) {
  if (opacity <= 0.001) return null;
  return (
    <text x={x} y={y} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fontWeight={700} letterSpacing={0.6} fill={INK}
      opacity={0.82 * opacity} style={{ textTransform: "uppercase" }}>{text}</text>
  );
}

function NumberDot({ x, y, t, start, end, n }: { x: number; y: number; t: number; start: number; end: number; n: string }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.7, 1, p)})` }}>
      <circle cx={x} cy={y} r={19} fill={ACCENT} style={{ filter: "drop-shadow(0 4px 10px rgba(91,61,240,0.3))" }} />
      <text x={x} y={y} dy="0.36em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={17} fill="#fff">{n}</text>
    </g>
  );
}

function ProductCard({ x, y, opacity }: { x: number; y: number; opacity: number }) {
  if (opacity <= 0.001) return null;
  return (
    <g opacity={opacity}>
      <rect x={x - 58} y={y - 36} width={116} height={72} rx={10} fill="#fff" stroke={LINE} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      {/* simple package glyph */}
      <g fill="none" stroke={ACCENT} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
        <path d={`M${x - 16},${y - 12} L${x},${y - 20} L${x + 16},${y - 12} L${x + 16},${y + 8} L${x},${y + 16} L${x - 16},${y + 8} Z`} />
        <path d={`M${x - 16},${y - 12} L${x},${y - 4} L${x + 16},${y - 12} M${x},${y - 4} L${x},${y + 16}`} />
      </g>
      <CaptionLabel x={x} y={y + 58} text="Your Product" opacity={1} />
    </g>
  );
}

/* =================================================================
   One frame as a pure function of time (ms). Exported for off-player checks.
================================================================= */
export function TwoOptionsFrame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  const leftDim = 1 - 0.55 * prog(t, DIM_LEFT[0], DIM_LEFT[1]);
  const orP = prog(t, OR_IN[0], OR_IN[1]);

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,10)">
        {/* divider + OR */}
        <DrawLine d={`M${DIV_X},90 L${DIV_X},480`} t={t} start={DIVIDER[0]} end={DIVIDER[1]} width={1.2} color={LINE} />
        {orP > 0.001 && (
          <g opacity={orP} style={{ transformOrigin: `${DIV_X}px 285px`, transform: `scale(${lerp(0.8, 1, orP)})` }}>
            <circle cx={DIV_X} cy={285} r={18} fill="#fff" stroke={LINE} strokeWidth={1.3} />
            <text x={DIV_X} y={285} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11} letterSpacing={0.8} fill={ACCENT}>OR</text>
          </g>
        )}

        <NumberDot x={LX} y={108} t={t} start={NUM_1[0]} end={NUM_1[1]} n="1" />
        <NumberDot x={RX} y={108} t={t} start={NUM_2[0]} end={NUM_2[1]} n="2" />

        {/* ---------- Option 1 — promote your own product ---------- */}
        <g opacity={leftDim}>
          <Badge x={LX} y={160} t={t} arriveStart={L_HEAD[0]} arriveEnd={L_HEAD[1]} label="Promote Your Own Product" width={270} />
          <Person x={LX} y={250} size={42} opacity={prog(t, L_YOU[0], L_YOU[1])} />
          <CaptionLabel x={LX} y={286} text="You" opacity={prog(t, L_YOU[0] + 0.1, L_YOU[1] + 0.3)} />
          <DrawLine d={`M${LX},302 L${LX},350`} t={t} start={L_LINE[0]} end={L_LINE[1]} width={1.4} color={ACCENT} opacity={0.7} />
          <Chip x={LX} y={326} t={t} start={L_PROMOTE[0]} end={L_PROMOTE[1]} label="Promote" width={92} />
          <ProductCard x={LX} y={392} opacity={prog(t, L_PRODUCT[0], L_PRODUCT[1])} />
        </g>

        {/* ---------- Option 2 — work with others ---------- */}
        <Badge x={RX} y={160} t={t} arriveStart={R_HEAD[0]} arriveEnd={R_HEAD[1]} label="Work With Others" width={200} />
        <Person x={RX} y={250} size={42} opacity={prog(t, R_YOU[0], R_YOU[1])} />
        <CaptionLabel x={RX} y={286} text="You" opacity={prog(t, R_YOU[0] + 0.1, R_YOU[1] + 0.3)} />

        {PATHS.map((p) => {
          const pulse = bump(t, p.icon[1], p.icon[1] + 0.5);
          return (
            <g key={p.label}>
              <DrawLine d={`M${RX},302 L${p.x},346`} t={t} start={p.line[0]} end={p.line[1]} width={1.4} color={ACCENT} opacity={0.7} />
              <g style={{ transformOrigin: `${p.x}px 376px`, transform: `scale(${1 + 0.12 * pulse})` }}>
                <Person x={p.x} y={376} size={36} emoji={p.emoji} opacity={prog(t, p.icon[0], p.icon[1])} />
              </g>
              <Chip x={p.x} y={424} t={t} start={p.chip[0]} end={p.chip[1]} label={p.label} width={122} fontSize={9.5} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* =================================================================
   The scene the player mounts. Restart remounts it → clock back to 0.
================================================================= */
export default function TwoOptions({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <TwoOptionsFrame ms={elapsed} />
    </div>
  );
}
