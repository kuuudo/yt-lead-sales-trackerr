import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "uni1" (universalvsl1.tsx) — 38 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (the opening paragraph, ~85 words):

   [A  0.0-4.5 ] "Vstrk helps you connect your content to your business results,
   [B  4.5-6.7 ]  tracking the entire user journey,
   [C  6.7-13.4]  the moment they click on your content to tracking the action on your website,
   [D 13.4-23.7]  whether that's booking a newsletter, booking a sales call, booking a paid
                  consultation, or simply a direct purchase on your landing page.
   [E 23.7-30.0]  Whether you're promoting your own business, working with marketers, or
                  managing campaigns for clients,
   [F 30.0-38.0]  Vstrk helps you see beyond views and clicks to understand how content
                  connects to customer action and revenue."

   Beat lengths were split in proportion to word count (~0.45 s / word).
   To re-time a beat, change the seconds in the BEAT TIMING block below.

   Self-contained: imports only React, the scene props type and the optional
   clock hook. No Supabase, auth or user data — purely illustrative visuals.
   Visual language (ink / violet #5b3df0 / mono pills / corner-tick badges /
   eye nodes) mirrors the onboarding videos.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MUTED = "#9a9aa8";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 38000;

/* ---------------- timing math (all times below are in SECONDS) ---------------- */
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

/* ---------------- BEAT TIMING (seconds) ---------------- */
// Phase 1 (A-D): the journey diagram.  Phase 2 (E): who uses it.  Phase 3 (F): beyond views & clicks.
const P1_OUT = [23.4, 24.0];
const P2_WIN: [number, number, number, number] = [23.7, 24.2, 29.7, 30.2];
const P3_IN = [29.9, 30.3];

// A — connect content to business results
const HEAD_IN = [0.1, 0.6];
const CONTENT_IN = [1.0, 1.5];
const LINE_L = [1.2, 2.2];
const RESULTS_IN = [2.5, 3.0];
const LINE_R = [2.7, 3.9];
const HEAD_LINES_OUT = [4.7, 5.3];
// B — the entire user journey
const LABEL_IN = [4.7, 5.3];
const TRACK_1 = [4.6, 5.5];
const TRACK_2 = [5.4, 6.5];
// C — click, then action on the website
const CLICK_IN = [7.0, 7.5];
const CURSOR_FLY = [7.1, 8.1];
const CLICK_RIPPLE = [8.1, 9.1];
const TRAVEL = [9.8, 10.6];
const SITE_IN = [10.4, 11.0];
const SITE_EYE = [11.0, 11.5];
const SITE_PULSE = [11.6, 13.2];
// D — four outcomes
const SEG2_FADE = [13.7, 14.3];
const OUT_Y = [170, 240, 360, 430];
const OUT_LABEL = ["Newsletter", "Sales Call Booked", "Paid Consultation", "Direct Purchase"];
const OUT_AT = [14.0, 15.8, 17.8, 20.2];
const SPARK = [15.2, 23.0];
// E — who it is for
const PERSONAS = [
  { x: 175, emoji: "🏢", label: "Your Own Business", w: 190, icon: [23.9, 24.4], badge: [24.3, 24.8], line: [24.9, 25.7] },
  { x: 480, emoji: "🧑", label: "Working With Marketers", w: 230, icon: [26.0, 26.5], badge: [26.3, 26.8], line: [26.8, 27.5] },
  { x: 785, emoji: "👥", label: "Managing Client Campaigns", w: 250, icon: [27.8, 28.3], badge: [28.2, 28.7], line: [28.7, 29.4] },
];
const HUB_IN = [24.9, 25.5];
const ONE_JOURNEY = [29.1, 29.6];
// F — beyond views and clicks
const VIEWS_IN = [30.3, 30.8];
const CLICKS_IN = [31.0, 31.5];
const SEE_EYE = [32.0, 32.5];
const DIM_SURFACE = [32.6, 33.4];
const CONTENT_B = [33.7, 34.3];
const LINE_CA = [34.5, 35.5];
const ACTION_B = [35.4, 36.0];
const LINE_AR = [36.3, 37.0];
const REVENUE_B = [36.9, 37.5];
const REVENUE_PULSE = [37.4, 38.0];

/* ---------------- visual primitives (same grammar as the onboarding videos) ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string }) {
  const p = prog(t, start, end);
  if (p <= 0) return null;
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} opacity={opacity} />;
}

function EyeNode({ x, y, t, arriveStart, arriveEnd, pulse = 0, r = 7 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; pulse?: number; r?: number }) {
  const openP = prog(t, arriveStart, arriveEnd);
  const eyeP = prog(t, arriveEnd, arriveEnd + 0.26);
  const glow = clamp(openP * (1 - 0.4 * (1 - eyeP)) + pulse, 0, 1.6);
  const ry = lerp(0.6, r * 0.56, eyeP);
  return (
    <g opacity={openP}>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={openP > 0.05 ? ACCENT : LINE} strokeWidth={1.2}
        style={{ filter: glow > 0.15 ? `drop-shadow(0 0 ${5 * glow}px ${ACCENT})` : "none" }} />
      <ellipse cx={x} cy={y} rx={r * 0.56} ry={ry} fill={ACCENT} opacity={eyeP} />
    </g>
  );
}

function Person({ x, y, size = 26, opacity = 1, emoji = "🧑" }: { x: number; y: number; size?: number; opacity?: number; emoji?: string }) {
  return <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} opacity={opacity}>{emoji}</text>;
}

function Badge({ x, y, t, arriveStart, arriveEnd, label, scalePulse = 0, width = 96, filled = false }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; scalePulse?: number; width?: number; filled?: boolean }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const h = 28, bx = x - width / 2, by = y - h / 2;
  const scale = lerp(0.85, 1, p) * (1 + 0.05 * scalePulse);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={14} fill={filled ? ACCENT : "#ffffff"} stroke={ACCENT} strokeWidth={1.3}
        style={{ filter: "drop-shadow(0 4px 10px rgba(91,61,240,0.2))" }} />
      {!filled && <path d={`M${bx + 2},${by + 2} l10,0 M${bx + 2},${by + 2} l0,10`} stroke={ACCENT} strokeWidth={1.3} strokeLinecap="round" fill="none" />}
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11} letterSpacing={1.1}
        fill={filled ? "#ffffff" : ACCENT} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function Chip({ x, y, t, start, end, label, tone = "accent", width = 118, fontSize = 10, dim = 0 }:
  { x: number; y: number; t: number; start: number; end: number; label: string; tone?: "muted" | "accent"; width?: number; fontSize?: number; dim?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 24, bx = x - width / 2, by = y - h / 2;
  const stroke = tone === "muted" ? LINE : ACCENT;
  const textFill = tone === "muted" ? MUTED : ACCENT;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p * (1 - dim)} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill="#ffffff" stroke={stroke} strokeWidth={1.1} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.6}
        fill={textFill} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function CaptionLabel({ x, y, text, opacity }: { x: number; y: number; text: string; opacity: number }) {
  if (opacity <= 0.001) return null;
  return (
    <text x={x} y={y} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fontWeight={700} letterSpacing={0.6} fill={INK}
      opacity={0.82 * opacity} style={{ textTransform: "uppercase" }}>{text}</text>
  );
}

const CARD_SHADOW = "drop-shadow(0 3px 8px rgba(21,21,31,0.06))";

function ContentCard({ x, y, opacity }: { x: number; y: number; opacity: number }) {
  if (opacity <= 0.001) return null;
  return (
    <g opacity={opacity}>
      <rect x={x - 60} y={y - 42} width={120} height={84} rx={10} fill="#fff" stroke={LINE} strokeWidth={1.2} style={{ filter: CARD_SHADOW }} />
      <rect x={x - 50} y={y - 32} width={100} height={46} rx={6} fill="#f3f1ff" />
      <circle cx={x} cy={y - 9} r={13} fill="#fff" stroke={ACCENT} strokeWidth={1.3} />
      <path d={`M${x - 3},${y - 15} L${x - 3},${y - 3} L${x + 7},${y - 9} Z`} fill={ACCENT} />
      <rect x={x - 50} y={y + 22} width={64} height={4} rx={2} fill={LINE} />
      <rect x={x - 50} y={y + 30} width={38} height={4} rx={2} fill={LINE} />
      <CaptionLabel x={x} y={y + 66} text="Your Content" opacity={1} />
    </g>
  );
}

function ResultsCard({ x, y, opacity, spark, glow }: { x: number; y: number; opacity: number; spark: number; glow: number }) {
  if (opacity <= 0.001) return null;
  return (
    <g opacity={opacity}>
      <rect x={x - 60} y={y - 42} width={120} height={84} rx={10} fill="#fff" stroke={glow > 0.05 ? ACCENT : LINE} strokeWidth={1.2}
        style={{ filter: glow > 0.05 ? `drop-shadow(0 0 ${9 * glow}px ${ACCENT})` : CARD_SHADOW }} />
      <text x={x - 50} y={y - 24} fontFamily={MONO} fontWeight={800} fontSize={13} fill={ACCENT}>$</text>
      <path d="M-46,18 L-28,8 L-10,12 L8,-4 L26,-10 L46,-26" transform={`translate(${x},${y + 4})`} fill="none" stroke={ACCENT} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - spark} opacity={0.85} />
      <CaptionLabel x={x} y={y + 66} text="Business Results" opacity={1} />
    </g>
  );
}

/* =================================================================
   One frame of the scene as a pure function of time `t` (ms).
   (Exported only so the timeline can be rendered/checked outside the player.)
================================================================= */
export function UniversalVSL1Frame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  const p1 = 1 - prog(t, P1_OUT[0], P1_OUT[1]);
  const p2 = fadeWindow(t, ...P2_WIN);
  const p3 = prog(t, P3_IN[0], P3_IN[1]);

  /* ---- phase 1 derived values ---- */
  const headLinesFade = 1 - prog(t, HEAD_LINES_OUT[0], HEAD_LINES_OUT[1]);
  const seg2Fade = 1 - prog(t, SEG2_FADE[0], SEG2_FADE[1]);
  const rippleP = prog(t, CLICK_RIPPLE[0], CLICK_RIPPLE[1]);
  const clickPulse = bump(t, CLICK_RIPPLE[0], CLICK_RIPPLE[1] + 0.2) * 0.8;
  const cursorP = ease(prog(t, CURSOR_FLY[0], CURSOR_FLY[1]));
  const cursorX = lerp(335, 255, cursorP);
  const cursorY = lerp(392, 307, cursorP);
  const cursorOpacity = prog(t, CURSOR_FLY[0] - 0.1, CURSOR_FLY[0] + 0.2) * (1 - prog(t, 9.2, 9.7));
  const cursorPress = 1 - 0.14 * bump(t, CLICK_RIPPLE[0], CLICK_RIPPLE[0] + 0.3);
  const travelP = prog(t, TRAVEL[0], TRAVEL[1]);
  const travelX = lerp(262, 362, ease(travelP));
  const travelOpacity = travelP > 0 && travelP < 1 ? 1 : 0;
  const sitePulse = bump(t, SITE_PULSE[0], SITE_PULSE[1]) * 0.6;
  const siteP = prog(t, SITE_IN[0], SITE_IN[1]);
  const spark = ease(prog(t, SPARK[0], SPARK[1]));
  const glow = Math.max(0, ...OUT_AT.map((a) => bump(t, a + 1.0, a + 1.6)));

  /* ---- phase 2 derived values ---- */
  const hubPulse = bump(t, 29.2, 29.9);

  /* ---- phase 3 derived values ---- */
  const dim = 0.7 * prog(t, DIM_SURFACE[0], DIM_SURFACE[1]);
  const seePulse = bump(t, 32.6, 33.6) * 0.6;
  const revPulse = bump(t, REVENUE_PULSE[0], REVENUE_PULSE[1]);

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>

      {/* ============ PHASE 1 (A–D) — content → click → website → outcomes → results ============ */}
      <g opacity={p1}>
        <Badge x={480} y={64} t={t} arriveStart={HEAD_IN[0]} arriveEnd={HEAD_IN[1]} label="VSTRK" width={110} filled />

        {/* A — connect content to results */}
        <DrawLine d="M440,70 C250,70 110,130 110,254" t={t} start={LINE_L[0]} end={LINE_L[1]} width={1.1} color={ACCENT} opacity={0.55 * headLinesFade} />
        <DrawLine d="M520,70 C710,70 850,130 850,254" t={t} start={LINE_R[0]} end={LINE_R[1]} width={1.1} color={ACCENT} opacity={0.55 * headLinesFade} />
        <ContentCard x={110} y={300} opacity={prog(t, CONTENT_IN[0], CONTENT_IN[1])} />
        <ResultsCard x={850} y={300} opacity={prog(t, RESULTS_IN[0], RESULTS_IN[1])} spark={spark} glow={glow} />

        {/* B — the entire user journey */}
        <Chip x={480} y={118} t={t} start={LABEL_IN[0]} end={LABEL_IN[1]} label="The Entire User Journey" width={250} />
        <DrawLine d="M172,300 L400,300" t={t} start={TRACK_1[0]} end={TRACK_1[1]} width={2} color={ACCENT} opacity={0.8} />
        <DrawLine d="M400,300 L790,300" t={t} start={TRACK_2[0]} end={TRACK_2[1]} width={2} color={ACCENT} opacity={0.8 * seg2Fade} />

        {/* C — the click */}
        <circle cx={250} cy={300} r={9 + 34 * rippleP} fill="none" stroke={ACCENT} strokeWidth={1.2} opacity={rippleP > 0 && rippleP < 1 ? (1 - rippleP) * 0.6 : 0} />
        <EyeNode x={250} y={300} t={t} arriveStart={CLICK_IN[0]} arriveEnd={CLICK_IN[1]} r={9} pulse={clickPulse} />
        <CaptionLabel x={250} y={334} text="Click" opacity={prog(t, CLICK_IN[1] - 0.1, CLICK_IN[1] + 0.4)} />
        <g opacity={cursorOpacity} transform={`translate(${cursorX},${cursorY}) scale(${cursorPress})`}>
          <path d="M0,0 L0,16 L4.5,12 L7.5,19 L10,18 L7,11 L13,11 Z" fill={INK} stroke="#fff" strokeWidth={1} strokeLinejoin="round" />
        </g>
        <circle cx={travelX} cy={300} r={4} fill={ACCENT} opacity={travelOpacity} style={{ filter: `drop-shadow(0 0 5px ${ACCENT})` }} />

        {/* C — the website */}
        <g opacity={siteP}>
          <rect x={362} y={274} width={76} height={52} rx={6} fill="#fff" stroke={LINE} strokeWidth={1.3} style={{ filter: CARD_SHADOW }} />
          <rect x={362} y={274} width={76} height={13} rx={6} fill="#f3f1ff" />
          <circle cx={370} cy={280.5} r={1.8} fill={LINE} /><circle cx={376} cy={280.5} r={1.8} fill={LINE} /><circle cx={382} cy={280.5} r={1.8} fill={LINE} />
          <rect x={371} y={294} width={34} height={4} rx={2} fill={LINE} />
          <rect x={371} y={303} width={56} height={4} rx={2} fill={LINE} />
          <rect x={371} y={312} width={26} height={8} rx={4} fill={ACCENT} />
        </g>
        <CaptionLabel x={400} y={346} text="Your Website" opacity={siteP} />
        <DrawLine d="M400,258 L400,272" t={t} start={SITE_EYE[0]} end={SITE_EYE[1]} width={1.1} color={LINE} />
        <EyeNode x={400} y={250} t={t} arriveStart={SITE_EYE[0]} arriveEnd={SITE_EYE[1]} r={8} pulse={sitePulse} />

        {/* D — outcomes */}
        {OUT_Y.map((y, i) => (
          <g key={OUT_LABEL[i]}>
            <DrawLine d={`M440,300 C485,300 480,${y} 520,${y}`} t={t} start={OUT_AT[i] - 0.45} end={OUT_AT[i] + 0.1} width={1.2} color={ACCENT} opacity={0.6} />
            <Badge x={620} y={y} t={t} arriveStart={OUT_AT[i]} arriveEnd={OUT_AT[i] + 0.5} label={OUT_LABEL[i]} width={200}
              scalePulse={bump(t, OUT_AT[i] + 0.5, OUT_AT[i] + 1.1)} />
            <DrawLine d={`M720,${y} C760,${y} 755,300 790,300`} t={t} start={OUT_AT[i] + 0.5} end={OUT_AT[i] + 1.2} width={1.2} color={ACCENT} opacity={0.6} />
          </g>
        ))}
      </g>

      {/* ============ PHASE 2 (E) — own business · marketers · client campaigns ============ */}
      <g opacity={p2}>
        {PERSONAS.map((p) => (
          <g key={p.label}>
            <Person x={p.x} y={170} size={44} emoji={p.emoji} opacity={prog(t, p.icon[0], p.icon[1])} />
            <Badge x={p.x} y={228} t={t} arriveStart={p.badge[0]} arriveEnd={p.badge[1]} label={p.label} width={p.w} />
            <DrawLine d={`M${p.x},246 L480,386`} t={t} start={p.line[0]} end={p.line[1]} width={1.2} color={ACCENT} opacity={0.55} />
          </g>
        ))}
        <circle cx={480} cy={400} r={34 + hubPulse * 22} fill="none" stroke={ACCENT} strokeWidth={1} opacity={hubPulse * 0.5} />
        <Badge x={480} y={400} t={t} arriveStart={HUB_IN[0]} arriveEnd={HUB_IN[1]} label="VSTRK" width={130} filled scalePulse={hubPulse} />
        <Chip x={480} y={458} t={t} start={ONE_JOURNEY[0]} end={ONE_JOURNEY[1]} label="One Tracking Journey" width={230} />
      </g>

      {/* ============ PHASE 3 (F) — beyond views and clicks → action → revenue ============ */}
      <g opacity={p3}>
        <Chip x={400} y={190} t={t} start={VIEWS_IN[0]} end={VIEWS_IN[1]} label="Views" tone="muted" width={130} fontSize={11} dim={dim} />
        <Chip x={560} y={190} t={t} start={CLICKS_IN[0]} end={CLICKS_IN[1]} label="Clicks" tone="muted" width={130} fontSize={11} dim={dim} />
        <EyeNode x={480} y={285} t={t} arriveStart={SEE_EYE[0]} arriveEnd={SEE_EYE[1]} r={9} pulse={seePulse} />

        <Badge x={190} y={380} t={t} arriveStart={CONTENT_B[0]} arriveEnd={CONTENT_B[1]} label="Content" width={150} />
        <DrawLine d="M265,380 L358,380" t={t} start={LINE_CA[0]} end={LINE_CA[1]} width={1.4} color={ACCENT} opacity={0.7} />
        <Badge x={468} y={380} t={t} arriveStart={ACTION_B[0]} arriveEnd={ACTION_B[1]} label="Customer Action" width={220} />
        <DrawLine d="M578,380 L688,380" t={t} start={LINE_AR[0]} end={LINE_AR[1]} width={1.4} color={ACCENT} opacity={0.7} />
        <circle cx={768} cy={380} r={34 + revPulse * 22} fill="none" stroke={ACCENT} strokeWidth={1} opacity={revPulse * 0.5} />
        <Badge x={768} y={380} t={t} arriveStart={REVENUE_B[0]} arriveEnd={REVENUE_B[1]} label="Revenue" width={160} filled scalePulse={revPulse} />
      </g>
    </svg>
  );
}

/* =================================================================
   The scene the player mounts. Restart remounts it → clock back to 0.
================================================================= */
export default function UniversalVSL1({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <UniversalVSL1Frame ms={elapsed} />
    </div>
  );
}
