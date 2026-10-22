import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "Agency1" (agencysalespitch1.tsx) — 30 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (~64 words, pace ≈ 0.47 s / word):

   [A 0.0-3.8 ] "ViewTrack helps marketing agencies close more clients and retain existing ones"
   [B 3.8-9.0 ] "by introducing a whole new layer of proof to their sales process and client communication."
   [C 9.0-15.2] "This new layer, ViewTrack, tracks the results of your marketing campaigns, ads, social posts, and videos,"
   [D 15.2-22.0] "connecting the traffic they generate to what these visitors do on your client's website,"
   [E 22.0-30.0] "from making purchases and signing up for newsletters"

   WHAT HAPPENS
     A  VSTRK badge + "For Agencies" chip. Two outcome cards appear: Close more clients · Retain existing.
     B  A central "Proof Layer" badge rises; faint lines connect it to Sales Process and Client Communication chips.
     C  Four campaign tiles (Campaigns / Ads / Posts / Videos) fade in as a row; each gains an eye (tracked).
     D  A traffic arrow draws from the campaign row down to a website card; the earlier agency outcomes dim slightly.
     E  Two result chips appear under the website (Purchases · Newsletter signups). Final eye + soft pulse on the proof layer.

   To retime, edit the seconds in the BEAT TIMING block and the CAMPAIGN / RESULT start times.
   Self-contained: React + scene props type + the optional clock hook only.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MUTED = "#9a9aa8";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 30000;

/* ---------------- timing math (all times in SECONDS) ---------------- */
function clamp(v: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function prog(t: number, a: number, b: number) { return clamp((t - a) / (b - a)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function bump(t: number, a: number, b: number) { return t > a && t < b ? Math.sin(prog(t, a, b) * Math.PI) : 0; }

/* ---------------- BEAT TIMING (seconds) ---------------- */
const HEAD_IN = [0.15, 0.55];
const FOR_AGENCIES = [0.5, 1.0];

// A — close / retain
const OUTCOME_1 = [1.2, 1.9];   // Close more clients
const OUTCOME_2 = [2.4, 3.1];   // Retain existing

// B — new layer of proof
const PROOF_IN = [4.0, 5.0];
const SALES_CHIP = [5.6, 6.4];
const COMM_CHIP = [6.8, 7.6];
const PROOF_LINES = [5.2, 6.2];

// C — tracks campaigns / ads / posts / videos
const CAMPAIGNS: { label: string; letter: string; start: number }[] = [
  { label: "Campaigns", letter: "C", start: 10.0 },
  { label: "Ads",       letter: "A", start: 11.4 },
  { label: "Posts",     letter: "P", start: 12.6 },
  { label: "Videos",    letter: "V", start: 13.8 },
];

// D — traffic → website
const TRAFFIC_LINE = [15.6, 17.2];
const WEBSITE_IN = [16.8, 18.0];
const DIM_TOP = [15.4, 16.6];

// E — purchases / newsletters
const RESULT_1 = [22.4, 23.6];  // Purchases
const RESULT_2 = [24.8, 26.0];  // Newsletter signups
const FINAL_PULSE = [27.0, 29.2];

/* ---------------- layout ---------------- */
const CX = 480;
const CAM_Y = 268;
const CAM_XS = [210, 370, 530, 690];
const WEB_Y = 400;

/* ---------------- primitives (same grammar as the other VSL scenes) ---------------- */
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

function OutcomeCard({ x, y, t, start, end, title, emoji }:
  { x: number; y: number; t: number; start: number; end: number; title: string; emoji: string }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.9, 1, p)})` }}>
      <rect x={x - 108} y={y - 32} width={216} height={64} rx={12} fill="#fff" stroke={LINE} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      <text x={x - 72} y={y} dy="0.35em" textAnchor="middle" fontSize={22}>{emoji}</text>
      <text x={x + 18} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={13} letterSpacing={0.3} fill={INK}>{title}</text>
    </g>
  );
}

function CampaignTile({ x, y, t, start, letter, label }:
  { x: number; y: number; t: number; start: number; letter: string; label: string }) {
  const tileP = prog(t, start - 0.1, start + 0.35);
  if (tileP <= 0.001) return null;
  const active = bump(t, start, start + 1.1);
  const lit = active > 0.05;
  return (
    <g opacity={tileP} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.92, 1, tileP) * (1 + 0.03 * active)})` }}>
      <rect x={x - 68} y={y - 28} width={136} height={56} rx={12} fill="#fff"
        stroke={lit ? ACCENT : LINE} strokeWidth={lit ? 1.7 : 1.2}
        style={{ filter: lit ? `drop-shadow(0 0 ${10 * active}px rgba(91,61,240,0.45))` : "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      <circle cx={x - 40} cy={y} r={16} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.2} />
      <text x={x - 40} y={y} dy="0.35em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={15} fill={ACCENT}>{letter}</text>
      <text x={x + 12} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={12} letterSpacing={0.3} fill={INK}>{label}</text>
      <EyeNode x={x + 52} y={y} t={t} arriveStart={start + 0.15} arriveEnd={start + 0.4} pulse={active * 0.5} r={6} />
    </g>
  );
}

/* =================================================================
   One frame as a pure function of time (ms). Exported for off-player checks.
================================================================= */
export function AgencySalesPitch1Frame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  const topDim = 1 - 0.45 * prog(t, DIM_TOP[0], DIM_TOP[1]);
  const proofPulse = bump(t, FINAL_PULSE[0], FINAL_PULSE[1]);
  const websiteP = prog(t, WEBSITE_IN[0], WEBSITE_IN[1]);

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,8)">
        {/* Header */}
        <Badge x={CX} y={36} t={t} arriveStart={HEAD_IN[0]} arriveEnd={HEAD_IN[1]} label="VSTRK" width={110} filled />
        <Chip x={CX} y={72} t={t} start={FOR_AGENCIES[0]} end={FOR_AGENCIES[1]} label="For Agencies" width={140} />

        {/* A + B zone (dims later) */}
        <g opacity={topDim}>
          <OutcomeCard x={280} y={130} t={t} start={OUTCOME_1[0]} end={OUTCOME_1[1]} title="Close more clients" emoji="🤝" />
          <OutcomeCard x={680} y={130} t={t} start={OUTCOME_2[0]} end={OUTCOME_2[1]} title="Retain existing" emoji="🔄" />

          {/* Proof layer */}
          <g style={{ transformOrigin: `${CX}px 200px`, transform: `scale(${1 + 0.05 * proofPulse})` }}>
            <Badge x={CX} y={200} t={t} arriveStart={PROOF_IN[0]} arriveEnd={PROOF_IN[1]} label="Proof Layer" width={150} filled />
          </g>
          <DrawLine d={`M${CX - 40},214 L280,162`} t={t} start={PROOF_LINES[0]} end={PROOF_LINES[1]} width={1.3} color={ACCENT} opacity={0.55} />
          <DrawLine d={`M${CX + 40},214 L680,162`} t={t} start={PROOF_LINES[0]} end={PROOF_LINES[1]} width={1.3} color={ACCENT} opacity={0.55} />
          <Chip x={280} y={230} t={t} start={SALES_CHIP[0]} end={SALES_CHIP[1]} label="Sales Process" width={130} fontSize={9.5} />
          <Chip x={680} y={230} t={t} start={COMM_CHIP[0]} end={COMM_CHIP[1]} label="Client Communication" width={168} fontSize={9.5} />
        </g>

        {/* C — campaign tiles */}
        {CAMPAIGNS.map((c, i) => (
          <CampaignTile key={c.label} x={CAM_XS[i]} y={CAM_Y} t={t} start={c.start} letter={c.letter} label={c.label} />
        ))}

        {/* D — traffic connector + website */}
        <DrawLine d={`M${CX},${CAM_Y + 36} L${CX},${WEB_Y - 48}`} t={t} start={TRAFFIC_LINE[0]} end={TRAFFIC_LINE[1]} width={1.6} color={ACCENT} opacity={0.75} />
        {websiteP > 0.001 && (
          <g opacity={websiteP} style={{ transformOrigin: `${CX}px ${WEB_Y}px`, transform: `scale(${lerp(0.92, 1, websiteP)})` }}>
            <rect x={CX - 130} y={WEB_Y - 36} width={260} height={72} rx={14} fill="#fff" stroke={ACCENT} strokeWidth={1.5}
              style={{ filter: "drop-shadow(0 4px 12px rgba(91,61,240,0.18))" }} />
            <text x={CX} y={WEB_Y - 8} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={12} letterSpacing={0.8} fill={ACCENT}
              style={{ textTransform: "uppercase" }}>Client Website</text>
            <text x={CX} y={WEB_Y + 16} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={600} fontSize={11} fill={MUTED}>
              traffic → actions
            </text>
            <EyeNode x={CX + 108} y={WEB_Y} t={t} arriveStart={WEBSITE_IN[0] + 0.2} arriveEnd={WEBSITE_IN[0] + 0.5} pulse={proofPulse * 0.6} r={7} />
          </g>
        )}

        {/* E — result chips */}
        <Chip x={340} y={480} t={t} start={RESULT_1[0]} end={RESULT_1[1]} label="Purchases" width={120} />
        <Chip x={620} y={480} t={t} start={RESULT_2[0]} end={RESULT_2[1]} label="Newsletter signups" width={168} fontSize={9.5} />
        <DrawLine d={`M${CX - 40},${WEB_Y + 36} L340,468`} t={t} start={RESULT_1[0] - 0.3} end={RESULT_1[0] + 0.4} width={1.2} color={ACCENT} opacity={0.5} />
        <DrawLine d={`M${CX + 40},${WEB_Y + 36} L620,468`} t={t} start={RESULT_2[0] - 0.3} end={RESULT_2[0] + 0.4} width={1.2} color={ACCENT} opacity={0.5} />
      </g>
    </svg>
  );
}

/* =================================================================
   The scene the player mounts. Restart remounts it → clock back to 0.
================================================================= */
export default function AgencySalesPitch1({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <AgencySalesPitch1Frame ms={elapsed} />
    </div>
  );
}
