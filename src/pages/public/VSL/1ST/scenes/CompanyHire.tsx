import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "companyhire" (CompanyHire.tsx) — 36 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (~90 words, pace ≈ 0.40 s / word):

   [A 0.0-5.0 ] "Vstrk helps companies evaluate marketing candidates by setting up a trial campaign."
   [B 5.0-10.0] "Using your own products, offers, or other links you want candidates to promote."
   [C 10.0-26.0] "You can then track each candidate's campaign from the content they publish and the clicks they generate to the actions people take on your website, whether that's making a purchase, signing up for a newsletter, or booking a consultation or sales call."
   [D 26.0-36.0] "This gives you real performance data to compare candidates and make more informed hiring decisions."

   WHAT HAPPENS
     A  VSTRK badge + “Hiring” chip. Two candidate cards appear; a “Trial Campaign” badge rises between them.
     B  Three promote options (Products · Offers · Links) fade in under the trial badge.
     C  Flow builds left→right: Content they publish → Clicks → Website actions (Purchase · Newsletter · Consultation · Sales call). Eyes open on tracked nodes. Candidates stay visible above.
     D  Performance comparison bars appear under the two candidates; a final “Informed hire” chip lands. Soft pulse.

   To retime, edit the BEAT TIMING constants and the ACTION / PROMOTE start times.
   Self-contained: React + scene props type + the optional clock hook only.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MUTED = "#9a9aa8";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 36000;

/* ---------------- timing math (all times in SECONDS) ---------------- */
function clamp(v: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function prog(t: number, a: number, b: number) { return clamp((t - a) / (b - a)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function bump(t: number, a: number, b: number) { return t > a && t < b ? Math.sin(prog(t, a, b) * Math.PI) : 0; }

/* ---------------- BEAT TIMING (seconds) ---------------- */
const HEAD_IN = [0.15, 0.55];
const HIRING_CHIP = [0.5, 1.0];

// A — candidates + trial campaign
const CAND_1 = [1.3, 2.1];
const CAND_2 = [2.4, 3.2];
const TRIAL_IN = [3.5, 4.5];

// B — products / offers / links
const PROMOTE = [
  { label: "Products", start: 5.4 },
  { label: "Offers",   start: 6.6 },
  { label: "Links",    start: 7.8 },
];

// C — track flow: content → clicks → website actions
const CONTENT_IN = [10.5, 11.5];
const CLICKS_IN = [13.0, 14.0];
const FLOW_LINE_1 = [12.2, 13.5];
const FLOW_LINE_2 = [14.5, 15.8];
const WEBSITE_IN = [15.5, 16.6];
const ACTIONS = [
  { label: "Purchase",      start: 17.5 },
  { label: "Newsletter",    start: 19.2 },
  { label: "Consultation",  start: 21.2 },
  { label: "Sales call",    start: 23.2 },
];

// D — compare + informed hire
const BARS_IN = [26.8, 28.2];
const HIRE_CHIP = [30.5, 32.0];
const FINAL_PULSE = [32.5, 35.0];

/* ---------------- layout ---------------- */
const CX = 480;
const C1X = 280;
const C2X = 680;

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

function CandidateCard({ x, y, t, start, end, label, emoji }:
  { x: number; y: number; t: number; start: number; end: number; label: string; emoji: string }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.9, 1, p)})` }}>
      <rect x={x - 70} y={y - 36} width={140} height={72} rx={12} fill="#fff" stroke={LINE} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      <text x={x} y={y - 10} textAnchor="middle" dominantBaseline="middle" fontSize={26}>{emoji}</text>
      <text x={x} y={y + 22} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={12} letterSpacing={0.3} fill={INK}>{label}</text>
    </g>
  );
}

function FlowNode({ x, y, t, start, end, label, width = 120 }:
  { x: number; y: number; t: number; start: number; end: number; label: string; width?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.9, 1, p)})` }}>
      <rect x={x - width / 2} y={y - 22} width={width} height={44} rx={11} fill="#fff" stroke={ACCENT} strokeWidth={1.4}
        style={{ filter: "drop-shadow(0 3px 8px rgba(91,61,240,0.15))" }} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={0.4} fill={INK}>{label}</text>
    </g>
  );
}

/* =================================================================
   One frame as a pure function of time (ms).
================================================================= */
export function CompanyHireFrame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  const finalPulse = bump(t, FINAL_PULSE[0], FINAL_PULSE[1]);
  const bar1H = lerp(8, 52, prog(t, BARS_IN[0], BARS_IN[1]));
  const bar2H = lerp(8, 34, prog(t, BARS_IN[0] + 0.15, BARS_IN[1] + 0.15));

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,6)">
        {/* Header */}
        <Badge x={CX} y={32} t={t} arriveStart={HEAD_IN[0]} arriveEnd={HEAD_IN[1]} label="VSTRK" width={110} filled />
        <Chip x={CX} y={66} t={t} start={HIRING_CHIP[0]} end={HIRING_CHIP[1]} label="Hiring" width={100} />

        {/* A — two candidates + trial campaign */}
        <CandidateCard x={C1X} y={130} t={t} start={CAND_1[0]} end={CAND_1[1]} label="Candidate A" emoji="🧑‍💼" />
        <CandidateCard x={C2X} y={130} t={t} start={CAND_2[0]} end={CAND_2[1]} label="Candidate B" emoji="👩‍💻" />
        <Badge x={CX} y={130} t={t} arriveStart={TRIAL_IN[0]} arriveEnd={TRIAL_IN[1]} label="Trial Campaign" width={160} filled />

        {/* B — promote options */}
        {PROMOTE.map((p, i) => (
          <Chip key={p.label} x={300 + i * 180} y={190} t={t} start={p.start} end={p.start + 0.7} label={p.label} width={120} />
        ))}

        {/* C — tracking flow */}
        <FlowNode x={180} y={270} t={t} start={CONTENT_IN[0]} end={CONTENT_IN[1]} label="Content" width={110} />
        <EyeNode x={180 + 48} y={270} t={t} arriveStart={CONTENT_IN[0] + 0.3} arriveEnd={CONTENT_IN[0] + 0.55} r={6} />

        <DrawLine d={`M240,270 L320,270`} t={t} start={FLOW_LINE_1[0]} end={FLOW_LINE_1[1]} width={1.5} color={ACCENT} opacity={0.7} />

        <FlowNode x={400} y={270} t={t} start={CLICKS_IN[0]} end={CLICKS_IN[1]} label="Clicks" width={100} />
        <EyeNode x={400 + 42} y={270} t={t} arriveStart={CLICKS_IN[0] + 0.3} arriveEnd={CLICKS_IN[0] + 0.55} r={6} />

        <DrawLine d={`M455,270 L540,270`} t={t} start={FLOW_LINE_2[0]} end={FLOW_LINE_2[1]} width={1.5} color={ACCENT} opacity={0.7} />

        <FlowNode x={660} y={270} t={t} start={WEBSITE_IN[0]} end={WEBSITE_IN[1]} label="Website actions" width={150} />
        <EyeNode x={660 + 68} y={270} t={t} arriveStart={WEBSITE_IN[0] + 0.3} arriveEnd={WEBSITE_IN[0] + 0.55} r={6} />

        {/* Action chips under website */}
        {ACTIONS.map((a, i) => (
          <Chip key={a.label} x={200 + i * 180} y={340} t={t} start={a.start} end={a.start + 0.7} label={a.label} width={140} fontSize={9.5} />
        ))}

        {/* D — performance bars under candidates + informed hire */}
        {prog(t, BARS_IN[0], BARS_IN[1]) > 0.01 && (
          <g opacity={prog(t, BARS_IN[0], BARS_IN[1])}>
            {/* Candidate A bar (higher) */}
            <rect x={C1X - 18} y={400 - bar1H} width={36} height={bar1H} rx={4} fill={ACCENT}
              style={{ filter: "drop-shadow(0 2px 6px rgba(91,61,240,0.3))" }} />
            <text x={C1X} y={420} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={10} fill={INK}>A</text>

            {/* Candidate B bar */}
            <rect x={C2X - 18} y={400 - bar2H} width={36} height={bar2H} rx={4} fill={LINE} />
            <text x={C2X} y={420} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={10} fill={MUTED}>B</text>

            <text x={CX} y={400} textAnchor="middle" fontFamily={MONO} fontWeight={600} fontSize={11} fill={MUTED}
              opacity={prog(t, BARS_IN[0] + 0.3, BARS_IN[1])}>Performance data</text>
          </g>
        )}

        <g style={{ transformOrigin: `${CX}px 480px`, transform: `scale(${1 + 0.04 * finalPulse})` }}>
          <Chip x={CX} y={480} t={t} start={HIRE_CHIP[0]} end={HIRE_CHIP[1]} label="Informed hiring decision" width={230} fontSize={10} />
        </g>
      </g>
    </svg>
  );
}

/* =================================================================
   The scene the player mounts. Restart remounts it → clock back to 0.
================================================================= */
export default function CompanyHire({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <CompanyHireFrame ms={elapsed} />
    </div>
  );
}
