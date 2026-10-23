import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "Sponsor" (sponsorsvsl1.tsx) — 17 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (75 words → ≈ 0.227 s / word — a FAST read):

   [A  0.0- 9.5] "Vstrk helps sponsors or brands track the customer journey from the moment
                  someone clicks your content to the action they take on your website,
                  whether that's making a purchase, signing up for a newsletter, booking a
                  consultation, or booking a sales call."
   [B  9.5-12.7] "It's built for sponsors and brands who work with marketers to promote
                  their products."
   [C 12.7-17.0] "And want to know not just who generates the revenue, how much revenue
                  they generate, but also everything else."

   WHAT HAPPENS
     A  VSTRK badge + "Sponsors" / "Brands" chips → customer → content card → a cursor CLICKS
        (2.95 s) → the click travels to the website card (4 s) → four action cards land on
        their words: Purchase (6.3) · Newsletter signup (7.4) · Consultation (8.1) · Sales call (9.0).
        Every step gets an eye ("tracked").
     B  Sponsor / brand ↔ marketer, joined by "Works with"; a product card flies from the
        sponsor to the marketer ("promote their products", 12.0-12.6 s).
     C  VSTRK lens opens three slots: WHO (marketers ranked by revenue, 13.9 s) → HOW MUCH
        (revenue counts up, 14.95-16.1 s) → EVERYTHING ELSE (clicks, sources, devices…, 16 s+).
        Last frame = all three cards visible, held.

   TO RETIME: edit the seconds in the BEAT TIMING block (the four ACTIONS live in one list).
   Neutral emoji / bars / circles only — no brand logos. Illustrative data only.
   Self-contained: React + scene props type + the optional clock hook only.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MUTED = "#9a9aa8";
const MUTED_D = "#6b6b78";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 17000;

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
/* ---- A  0.0-9.5 : the customer journey ---- */
const BADGE_IN = [0.05, 0.4];            // VSTRK badge              "Vstrk"
const SPONSORS_CHIP = [0.45, 0.8];       //                          "sponsors"
const BRANDS_CHIP = [0.91, 1.25];        //                          "or brands"
const CUSTOMER_IN = [1.55, 2.0];         // customer                 "customer journey"
const CONTENT_IN = [2.27, 2.75];         // content card             "the moment"
const CUST_LINE = [2.3, 2.7];
const CURSOR = [2.65, 2.98];             // cursor arrives
const CLICK = [2.98, 3.5];               // click ripple             "clicks"
const CLICK_CHIP = [3.2, 3.55];          // "Click" chip on the path
const JOURNEY_LINE = [3.3, 4.05];        // content → website
const DOT = [3.35, 4.1];                 // the click travels
const WEB_IN = [3.85, 4.4];              // website card             "your website"
const ACTIONS_HDR = [4.5, 5.0];          // "Actions on your site"   "the action they take"
// each action: card fades in on its word (line draws 0.25 s earlier)
const ACTIONS: { label: string; emoji: string; y: number; card: number[] }[] = [
  { label: "Purchase",          emoji: "🛒", y: 132, card: [6.3, 6.7] },    // "making a purchase"
  { label: "Newsletter signup", emoji: "✉️", y: 212, card: [7.4, 7.8] },    // "signing up for a newsletter"
  { label: "Consultation",      emoji: "📅", y: 292, card: [8.1, 8.5] },    // "booking a consultation"
  { label: "Sales call",        emoji: "📞", y: 372, card: [9.0, 9.35] },   // "booking a sales call"
];
const A_OUT = [9.5, 9.95];               // stage A clears

/* ---- B  9.5-12.7 : built for sponsors who work with marketers ---- */
const BUILT_PULSE = [9.6, 10.1];         // VSTRK badge pulses       "it's built for"
const SPONSOR_IN = [9.9, 10.4];          // sponsor / brand          "sponsors and brands"
const SPONSOR_PULSE = [10.55, 11.1];
const LINE_B = [11.1, 11.9];             // sponsor → marketer       "who work with"
const WORKS_CHIP = [11.4, 11.8];
const MKT_IN = [11.45, 11.95];           // marketer                 "marketers"
const PRODUCT_IN = [11.8, 12.05];        // product card             "promote"
const FLY = [12.05, 12.65];              // product flies to marketer  "their products"
const LAND = [12.65, 13.05];             // landing ripple
const B_OUT = [12.9, 13.3];              // stage B clears

/* ---- C  12.7-17.0 : who · how much · everything else ---- */
const LENS_IN = [13.0, 13.5];            // VSTRK lens               "and want to know"
const LENS_PULSE = [13.3, 14.0];
const BRANCH = [13.4, 13.9];
const SLOTS_IN = [13.35, 13.85];         // dashed empty slots
const WHO_IN = [13.9, 14.4];             // WHO card                 "not just who"
const WHO_ROWS = [14.15, 14.35, 14.55];  // marketer rows
const WHO_TOP = [14.74, 15.3];           // top row lights up        "the revenue"
const HOW_IN = [14.95, 15.45];           // HOW MUCH card            "how much"
const COUNT = [15.3, 16.1];              // revenue counts up        "revenue they generate"
const HOW_BARS = [15.5, 16.2];
const ELSE_IN = [16.0, 16.4];            // EVERYTHING ELSE card     "but also"
const ELSE_CHIPS_START = 16.15;          // chips cascade (0.1 s apart)  "everything"
const ELSE_STAGGER = 0.1;
const MORE_CHIP = [16.65, 16.95];        // "And more"               "else"

/* ---------------- layout ---------------- */
const ROW_Y = 260;                       // journey row
const AX = 790, AW = 210, AH = 56;       // action cards
const PANEL_W = 270, PANEL_H = 200, PANEL_Y = 250;
const PANEL_X = [165, 480, 795];
const PERSON_Y = 265;
const SPONSOR_X = 230, MKT_X = 730;

/* ---------------- primitives (same grammar as the other VSL scenes) ---------------- */
function Badge({ x, y, t, arriveStart, arriveEnd, label, width = 96, filled = false, pulse = 0 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; width?: number; filled?: boolean; pulse?: number }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const h = 28, bx = x - width / 2, by = y - h / 2;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.85, 1, p) * (1 + 0.06 * pulse)})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={14} fill={filled ? ACCENT : "#ffffff"} stroke={ACCENT} strokeWidth={1.3}
        style={{ filter: pulse > 0.05 ? `drop-shadow(0 0 ${9 * pulse}px rgba(91,61,240,0.55))` : "drop-shadow(0 4px 10px rgba(91,61,240,0.2))" }} />
      {!filled && <path d={`M${bx + 2},${by + 2} l10,0 M${bx + 2},${by + 2} l0,10`} stroke={ACCENT} strokeWidth={1.3} strokeLinecap="round" fill="none" />}
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11} letterSpacing={1.1}
        fill={filled ? "#ffffff" : ACCENT} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function Chip({ x, y, t, start, end, label, width = 118, fontSize = 10, color = ACCENT, filled = false, dashed = false }:
  { x: number; y: number; t: number; start: number; end: number; label: string; width?: number; fontSize?: number; color?: string; filled?: boolean; dashed?: boolean }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 24, bx = x - width / 2, by = y - h / 2;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.9, 1, p)})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill={filled ? color : "#ffffff"} stroke={color} strokeWidth={1.1}
        strokeDasharray={dashed ? "4 3" : undefined} />
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

function Panel({ cx, t, a, b, title, children }: { cx: number; t: number; a: number; b: number; title: string; children: React.ReactNode }) {
  const p = prog(t, a, b);
  if (p <= 0.001) return null;
  return (
    <g opacity={p} style={{ transformOrigin: `${cx}px ${PANEL_Y + PANEL_H / 2}px`, transform: `scale(${lerp(0.96, 1, ease(p))})` }}>
      <rect x={cx - PANEL_W / 2} y={PANEL_Y} width={PANEL_W} height={PANEL_H} rx={14} fill="#fff" stroke={LINE} strokeWidth={1.3}
        style={{ filter: "drop-shadow(0 4px 14px rgba(21,21,31,0.07))" }} />
      <CaptionLabel x={cx - PANEL_W / 2 + 18} y={PANEL_Y + 26} label={title} anchor="start" />
      <EyeNode x={cx + PANEL_W / 2 - 22} y={PANEL_Y + 22} t={t} arriveStart={a + 0.2} arriveEnd={a + 0.5} r={7} />
      {children}
    </g>
  );
}

/* ---------------- data ---------------- */
const MARKETERS = [
  { name: "Marketer A", letter: "A", ratio: 0.92 },
  { name: "Marketer B", letter: "B", ratio: 0.58 },
  { name: "Marketer C", letter: "C", ratio: 0.36 },
];
const ELSE_ITEMS = ["Clicks", "Sources", "Devices", "Locations", "Pages", "Time on site"];
const TOTAL_REV = 124; // tenths of a "k" → $12.4k

/* =================================================================
   One frame as a pure function of time (ms). Exported for off-player checks.
================================================================= */
export function SponsorFrame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  const aOp = 1 - prog(t, A_OUT[0], A_OUT[1]);
  const bOp = 1 - prog(t, B_OUT[0], B_OUT[1]);
  const builtPulse = bump(t, BUILT_PULSE[0], BUILT_PULSE[1]);

  /* ---------- A: journey ---------- */
  const contentP = prog(t, CONTENT_IN[0], CONTENT_IN[1]);
  const webP = prog(t, WEB_IN[0], WEB_IN[1]);
  const clickP = prog(t, CLICK[0], CLICK[1]);
  const cursorP = ease(prog(t, CURSOR[0], CURSOR[1]));
  const dotP = ease(prog(t, DOT[0], DOT[1]));
  const cursorX = lerp(150, 262, cursorP), cursorY = lerp(176, 270, cursorP);

  /* ---------- B ---------- */
  const flyP = ease(prog(t, FLY[0], FLY[1]));
  const landP = prog(t, LAND[0], LAND[1]);
  const prodX = lerp(SPONSOR_X, MKT_X, flyP);
  const prodY = lerp(170, 170, flyP) - 46 * Math.sin(flyP * Math.PI);

  /* ---------- C ---------- */
  const lensPulse = bump(t, LENS_PULSE[0], LENS_PULSE[1]);
  const countP = ease(prog(t, COUNT[0], COUNT[1]));
  const tenths = Math.round(TOTAL_REV * countP);
  const revStr = `$${Math.floor(tenths / 10)}.${tenths % 10}k`.padStart(6, " ");
  const CW = 24; // fixed cell width for the 40px count-up digits
  const howX0 = PANEL_X[1] - (6 * CW) / 2;

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,36)">
        <Badge x={480} y={44} t={t} arriveStart={BADGE_IN[0]} arriveEnd={BADGE_IN[1]} label="VSTRK" width={110} filled pulse={builtPulse} />

        {/* =========================== A =========================== */}
        {aOp > 0.001 && (
          <g opacity={aOp}>
            <Chip x={350} y={44} t={t} start={SPONSORS_CHIP[0]} end={SPONSORS_CHIP[1]} label="Sponsors" width={104} />
            <Chip x={610} y={44} t={t} start={BRANDS_CHIP[0]} end={BRANDS_CHIP[1]} label="Brands" width={92} />

            <Person x={85} y={ROW_Y} t={t} start={CUSTOMER_IN[0]} end={CUSTOMER_IN[1]} emoji="🧑" label="Customer" />
            <DrawLine d={`M124,${ROW_Y} H186`} t={t} start={CUST_LINE[0]} end={CUST_LINE[1]} color={MUTED} />

            {/* content card */}
            {contentP > 0.001 && (
              <g opacity={contentP} style={{ transformOrigin: `250px ${ROW_Y}px`, transform: `scale(${lerp(0.92, 1, contentP)})` }}>
                <rect x={190} y={ROW_Y - 50} width={120} height={100} rx={12} fill="#fff" stroke={LINE} strokeWidth={1.3}
                  style={{ filter: "drop-shadow(0 4px 12px rgba(21,21,31,0.07))" }} />
                <circle cx={210} cy={ROW_Y - 30} r={8} fill="#f3f1ff" stroke={LINE} strokeWidth={1.1} />
                <rect x={224} y={ROW_Y - 34} width={56} height={7} rx={3.5} fill={INK} opacity={0.8} />
                <rect x={204} y={ROW_Y - 12} width={92} height={7} rx={3.5} fill={LINE} />
                <rect x={204} y={ROW_Y + 2} width={72} height={7} rx={3.5} fill={LINE} />
                <rect x={204} y={ROW_Y + 22} width={64} height={18} rx={9} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.1} />
                <CaptionLabel x={250} y={ROW_Y + 72} label="Your content" />
              </g>
            )}
            <EyeNode x={300} y={ROW_Y - 40} t={t} arriveStart={CLICK[0] + 0.1} arriveEnd={CLICK[0] + 0.4} r={7} />

            {/* cursor + click ripple */}
            {cursorP > 0.001 && (
              <g opacity={Math.min(1, cursorP * 2) * (1 - 0.0 * clickP)}>
                <path d={`M${cursorX},${cursorY} l0,19 l5,-5 l4,9 l3,-1.5 l-4,-9 l7,0 Z`} fill={INK} stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
              </g>
            )}
            {clickP > 0 && clickP < 1 && (
              <circle cx={262} cy={270} r={8 + 30 * clickP} fill="none" stroke={ACCENT} strokeWidth={1.6} opacity={(1 - clickP) * 0.7} />
            )}

            {/* click travels to the website */}
            <DrawLine d={`M314,${ROW_Y} H400`} t={t} start={JOURNEY_LINE[0]} end={JOURNEY_LINE[1]} width={2} />
            {dotP > 0.001 && dotP < 0.999 && <circle cx={lerp(314, 400, dotP)} cy={ROW_Y} r={5} fill={ACCENT} />}
            <Chip x={357} y={ROW_Y - 26} t={t} start={CLICK_CHIP[0]} end={CLICK_CHIP[1]} label="Click" width={64} filled />

            {/* website card */}
            {webP > 0.001 && (
              <g opacity={webP} style={{ transformOrigin: `480px ${ROW_Y}px`, transform: `scale(${lerp(0.92, 1, webP)})` }}>
                <rect x={405} y={ROW_Y - 55} width={150} height={110} rx={12} fill="#fff" stroke={LINE} strokeWidth={1.3}
                  style={{ filter: "drop-shadow(0 4px 12px rgba(21,21,31,0.07))" }} />
                <path d={`M405,${ROW_Y - 33} H555`} stroke={LINE} strokeWidth={1.2} />
                <circle cx={419} cy={ROW_Y - 44} r={3} fill={LINE} />
                <circle cx={430} cy={ROW_Y - 44} r={3} fill={LINE} />
                <circle cx={441} cy={ROW_Y - 44} r={3} fill={LINE} />
                <rect x={420} y={ROW_Y - 20} width={80} height={9} rx={4.5} fill={INK} opacity={0.8} />
                <rect x={420} y={ROW_Y - 4} width={118} height={7} rx={3.5} fill={LINE} />
                <rect x={420} y={ROW_Y + 10} width={96} height={7} rx={3.5} fill={LINE} />
                <rect x={420} y={ROW_Y + 27} width={64} height={16} rx={8} fill={ACCENT} />
                <CaptionLabel x={480} y={ROW_Y + 76} label="Your website" />
              </g>
            )}
            <EyeNode x={541} y={ROW_Y - 44} t={t} arriveStart={WEB_IN[1]} arriveEnd={WEB_IN[1] + 0.3} r={7} />

            {/* actions */}
            <g opacity={prog(t, ACTIONS_HDR[0], ACTIONS_HDR[1])}>
              <CaptionLabel x={AX} y={90} label="Actions on your site" />
            </g>
            {ACTIONS.map((a) => {
              const cp = prog(t, a.card[0], a.card[1]);
              return (
                <g key={a.label}>
                  <DrawLine d={`M555,${ROW_Y} H620 V${a.y} H${AX - AW / 2 - 2}`} t={t} start={a.card[0] - 0.25} end={a.card[0] + 0.1} opacity={0.75} />
                  {cp > 0.001 && (
                    <g opacity={cp} style={{ transformOrigin: `${AX}px ${a.y}px`, transform: `scale(${lerp(0.92, 1, cp)})` }}>
                      <rect x={AX - AW / 2} y={a.y - AH / 2} width={AW} height={AH} rx={14} fill="#fff" stroke={LINE} strokeWidth={1.3}
                        style={{ filter: "drop-shadow(0 4px 12px rgba(21,21,31,0.07))" }} />
                      <circle cx={AX - 78} cy={a.y} r={19} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.2} />
                      <text x={AX - 78} y={a.y} dy="0.36em" textAnchor="middle" fontSize={18}>{a.emoji}</text>
                      <text x={AX - 50} y={a.y} dy="0.34em" fontFamily={MONO} fontWeight={700} fontSize={12} fill={INK}>{a.label}</text>
                    </g>
                  )}
                  <EyeNode x={AX + 88} y={a.y} t={t} arriveStart={a.card[1]} arriveEnd={a.card[1] + 0.25} r={7} />
                </g>
              );
            })}
          </g>
        )}

        {/* =========================== B =========================== */}
        {bOp > 0.001 && t >= SPONSOR_IN[0] && (
          <g opacity={bOp}>
            <Person x={SPONSOR_X} y={PERSON_Y} t={t} start={SPONSOR_IN[0]} end={SPONSOR_IN[1]} emoji="🧑‍💼" label="Sponsor / brand"
              pulse={bump(t, SPONSOR_PULSE[0], SPONSOR_PULSE[1])} />
            <Person x={MKT_X} y={PERSON_Y} t={t} start={MKT_IN[0]} end={MKT_IN[1]} emoji="🧑‍💻" label="Marketer" pulse={landP > 0 ? bump(t, LAND[0], LAND[1]) : 0} />
            <DrawLine d={`M270,${PERSON_Y} H690`} t={t} start={LINE_B[0]} end={LINE_B[1]} width={2.2} />
            <Chip x={480} y={PERSON_Y} t={t} start={WORKS_CHIP[0]} end={WORKS_CHIP[1]} label="Works with" width={112} />

            {/* product card: sponsor → marketer */}
            {prog(t, PRODUCT_IN[0], PRODUCT_IN[1]) > 0.001 && (
              <g opacity={prog(t, PRODUCT_IN[0], PRODUCT_IN[1])}>
                <rect x={prodX - 60} y={prodY - 20} width={120} height={40} rx={12} fill="#fff" stroke={ACCENT} strokeWidth={1.4}
                  style={{ filter: "drop-shadow(0 6px 14px rgba(91,61,240,0.25))" }} />
                <text x={prodX - 36} y={prodY} dy="0.36em" textAnchor="middle" fontSize={18}>📦</text>
                <text x={prodX - 14} y={prodY} dy="0.34em" fontFamily={MONO} fontWeight={700} fontSize={12} fill={INK}>Product</text>
              </g>
            )}
            {landP > 0 && landP < 1 && (
              <rect x={MKT_X - 60 - 16 * landP} y={170 - 20 - 16 * landP} width={120 + 32 * landP} height={40 + 32 * landP} rx={12 + 12 * landP}
                fill="none" stroke={ACCENT} strokeWidth={1.5} opacity={(1 - landP) * 0.6} />
            )}
          </g>
        )}

        {/* =========================== C =========================== */}
        {/* lens + branches */}
        <EyeNode x={480} y={170} t={t} arriveStart={LENS_IN[0]} arriveEnd={LENS_IN[1]} pulse={lensPulse * 0.7} r={26} />
        {lensPulse > 0.02 && <circle cx={480} cy={170} r={36 + 10 * lensPulse} fill="none" stroke={ACCENT} strokeWidth={1.2} opacity={lensPulse * 0.5} />}
        {PANEL_X.map((cx, i) => (
          <DrawLine key={`br${i}`} d={cx === 480 ? `M480,198 V${PANEL_Y}` : `M480,198 V224 H${cx} V${PANEL_Y}`}
            t={t} start={BRANCH[0]} end={BRANCH[1]} opacity={0.6} />
        ))}
        {PANEL_X.map((cx, i) => {
          const sp = prog(t, SLOTS_IN[0] + i * 0.08, SLOTS_IN[1] + i * 0.08);
          const pp = prog(t, [WHO_IN[0], HOW_IN[0], ELSE_IN[0]][i], [WHO_IN[1], HOW_IN[1], ELSE_IN[1]][i]);
          return (
            <rect key={`sl${i}`} x={cx - PANEL_W / 2} y={PANEL_Y} width={PANEL_W} height={PANEL_H} rx={14} fill="none" stroke={LINE}
              strokeWidth={1.3} strokeDasharray="5 6" opacity={sp * (1 - pp)} />
          );
        })}

        {/* WHO */}
        <Panel cx={PANEL_X[0]} t={t} a={WHO_IN[0]} b={WHO_IN[1]} title="Who">
          {MARKETERS.map((m, i) => {
            const x0 = PANEL_X[0] - PANEL_W / 2;
            const y = PANEL_Y + 70 + i * 40;
            const rp = prog(t, WHO_ROWS[i], WHO_ROWS[i] + 0.35);
            const bp = ease(prog(t, WHO_ROWS[i] + 0.1, WHO_ROWS[i] + 0.8));
            const hi = i === 0 ? prog(t, WHO_TOP[0], WHO_TOP[1]) : 0;
            if (rp <= 0.001) return null;
            return (
              <g key={m.name} opacity={rp}>
                <rect x={x0 + 8} y={y - 17} width={254} height={34} rx={9} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.2} opacity={hi} />
                <circle cx={x0 + 28} cy={y} r={12} fill="#f3f1ff" stroke={LINE} strokeWidth={1.2} />
                <text x={x0 + 28} y={y} dy="0.35em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11} fill={ACCENT}>{m.letter}</text>
                <text x={x0 + 48} y={y} dy="0.34em" fontFamily={MONO} fontWeight={700} fontSize={11} fill={INK}>{m.name}</text>
                <rect x={x0 + 148} y={y - 3.5} width={102} height={7} rx={3.5} fill={LINE} />
                <rect x={x0 + 148} y={y - 3.5} width={102 * m.ratio * bp} height={7} rx={3.5} fill={ACCENT} opacity={i === 0 ? 1 : 0.55} />
              </g>
            );
          })}
        </Panel>

        {/* HOW MUCH */}
        <Panel cx={PANEL_X[1]} t={t} a={HOW_IN[0]} b={HOW_IN[1]} title="How much">
          <g fontFamily={MONO} fontSize={40} fontWeight={800} fill={ACCENT}>
            {revStr.split("").map((ch, i) => (
              ch === " " ? null : <text key={i} x={howX0 + i * CW + CW / 2} y={PANEL_Y + 92} dy="0.34em" textAnchor="middle">{ch}</text>
            ))}
          </g>
          <CaptionLabel x={PANEL_X[1]} y={PANEL_Y + 124} label="Total revenue" />
          {[0.92, 0.58, 0.36].map((r, i) => {
            const bp = ease(prog(t, HOW_BARS[0] + i * 0.1, HOW_BARS[1] + i * 0.1));
            const h = 40 * r * bp;
            return <rect key={i} x={PANEL_X[1] - 66 + i * 50} y={PANEL_Y + 184 - h} width={32} height={h} rx={5} fill={ACCENT} opacity={i === 0 ? 1 : 0.5} />;
          })}
        </Panel>

        {/* EVERYTHING ELSE */}
        <Panel cx={PANEL_X[2]} t={t} a={ELSE_IN[0]} b={ELSE_IN[1]} title="Everything else">
          {ELSE_ITEMS.map((label, i) => {
            const col = i % 2, row = Math.floor(i / 2);
            const s = ELSE_CHIPS_START + i * ELSE_STAGGER;
            return (
              <Chip key={label} x={PANEL_X[2] - 62 + col * 124} y={PANEL_Y + 64 + row * 38} t={t} start={s} end={s + 0.3} label={label}
                width={112} fontSize={10} color={MUTED_D} />
            );
          })}
          <Chip x={PANEL_X[2]} y={PANEL_Y + 176} t={t} start={MORE_CHIP[0]} end={MORE_CHIP[1]} label="And more" width={104} filled />
        </Panel>
      </g>
    </svg>
  );
}

/* =================================================================
   The scene the player mounts. Restart remounts it → clock back to 0.
================================================================= */
export default function Sponsor({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <SponsorFrame ms={elapsed} />
    </div>
  );
}
