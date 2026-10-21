import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "domain" (trackingdomain.tsx) — 10 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (~22 words):

   [A 0.0-2.4 ] "Vstrk supports custom tracking domains,
   [B 2.4-6.8 ]  so your tracking links can look something like shop.yourdomain.com,
   [C 6.8-10.0]  using a word that fits your brand."

   WHAT HAPPENS
     A  A browser address bar appears with a generic tracking link.
     B  The domain part is erased and re-typed as shop.yourdomain.com
        (the link's short code stays — only the domain changes).
     C  The first word ("shop") is bracketed and swaps through other words
        (play / book / join) before landing back on "shop".

   Beat lengths are in proportion to word count (~0.45 s / word). To retime,
   edit the seconds in the BEAT TIMING block.

   Self-contained: React + scene props type + the optional clock hook only.
   The URLs shown are illustrative text, not real data.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MUTED = "#9a9aa8";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 10000;

/* ---------------- timing math (all times in SECONDS) ---------------- */
function clamp(v: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function prog(t: number, a: number, b: number) { return clamp((t - a) / (b - a)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function bump(t: number, a: number, b: number) { return t > a && t < b ? Math.sin(prog(t, a, b) * Math.PI) : 0; }

/* ---------------- BEAT TIMING (seconds) ---------------- */
const HEAD_IN = [0.1, 0.5];
const BAR_IN = [0.3, 0.9];
const CHIP_IN = [1.0, 1.6];
// B — erase the generic domain, type the custom one
const ERASE = [2.5, 3.2];
const TYPE = [3.4, 5.6];
const BAR_GLOW = [5.7, 6.6];
const EYE_IN = [5.9, 6.4];
// C — a word that fits your brand
const BRACKET_IN = [6.9, 7.4];
const WORD_CHIP_IN = [7.2, 7.8];
const WORDS: { w: string; at: number }[] = [
  { w: "shop", at: 0 },
  { w: "play", at: 7.6 },
  { w: "book", at: 8.3 },
  { w: "join", at: 9.0 },
  { w: "shop", at: 9.6 },
];
const SWAP = 0.25;

/* ---------------- layout ---------------- */
const CW = 18;            // width of one monospace character at fontSize 30
const FS = 30;
const X0 = 214;           // where the link text starts inside the bar
const Y = 300;            // vertical centre of the bar
const GENERIC = "vstrk.com";
const CUSTOM = ".yourdomain.com";   // after the 4-letter word
const SLUG = "/a1b2c3";

/* ---------------- primitives (same grammar as the other VSL scenes) ---------------- */
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
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} opacity={opacity} />;
}

/** Draws a string one character per cell so columns never drift, whatever monospace font renders. */
function Chars({ text, from, shown, color, weight = 500, opacity = 1, dy = 0 }:
  { text: string; from: number; shown: number; color: string; weight?: number; opacity?: number; dy?: number }) {
  return (
    <g opacity={opacity} transform={`translate(0,${dy})`}>
      {text.split("").map((ch, i) => (
        i < shown ? (
          <text key={i} x={X0 + (from + i) * CW + CW / 2} y={Y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontSize={FS} fontWeight={weight} fill={color}>{ch}</text>
        ) : null
      ))}
    </g>
  );
}

/* =================================================================
   One frame as a pure function of time (ms). Exported for off-player checks.
================================================================= */
export function TrackingDomainFrame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  /* how many characters of the domain are visible, and which domain it is */
  const erasing = t < TYPE[0];
  const domainLen = erasing
    ? Math.round(GENERIC.length * (1 - prog(t, ERASE[0], ERASE[1])))
    : Math.round((4 + CUSTOM.length) * prog(t, TYPE[0], TYPE[1]));
  const caretOn = t > ERASE[0] - 0.15 && t < TYPE[1] + 0.25 && Math.floor(t * 4) % 2 === 0;

  const barGlow = bump(t, BAR_GLOW[0], BAR_GLOW[1]);
  const barOpacity = prog(t, BAR_IN[0], BAR_IN[1]);

  /* the swapping first word */
  const wordLayers = WORDS.map((w, k) => {
    const inP = k === 0 ? 1 : prog(t, w.at, w.at + SWAP);
    const outP = k + 1 < WORDS.length ? prog(t, WORDS[k + 1].at, WORDS[k + 1].at + SWAP) : 0;
    return { w: w.w, op: inP * (1 - outP), dy: (1 - inP) * 10 - outP * 10 };
  });

  const wordCx = X0 + 2 * CW;                       // centre of the 4-letter word
  const bracketL = X0 - 2, bracketR = X0 + 4 * CW + 2;

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,30)">
      <Badge x={480} y={112} t={t} arriveStart={HEAD_IN[0]} arriveEnd={HEAD_IN[1]} label="VSTRK" width={110} filled />
      <Chip x={480} y={190} t={t} start={CHIP_IN[0]} end={CHIP_IN[1]} label="Custom Tracking Domains" width={270} />

      {/* ---- the browser address bar ---- */}
      <g opacity={barOpacity}>
        <rect x={150} y={Y - 34} width={660} height={68} rx={34} fill="#fff"
          stroke={barGlow > 0.05 ? ACCENT : LINE} strokeWidth={barGlow > 0.05 ? 1.6 : 1.4}
          style={{ filter: barGlow > 0.05 ? `drop-shadow(0 0 ${10 * barGlow}px ${ACCENT})` : "drop-shadow(0 4px 14px rgba(21,21,31,0.07))" }} />
        {/* lock */}
        <g transform={`translate(176,${Y - 9})`} fill="none" stroke={MUTED} strokeWidth={1.8} strokeLinecap="round">
          <rect x={0} y={7} width={15} height={11} rx={2.5} fill={MUTED} stroke="none" />
          <path d="M3,7 V4.5 a4.5,4.5 0 0 1 9,0 V7" />
        </g>
      </g>

      {/* ---- the link text ---- */}
      <g opacity={barOpacity}>
        {erasing ? (
          <Chars text={GENERIC} from={0} shown={domainLen} color={INK} weight={600} />
        ) : (
          <>
            {wordLayers.map((l, k) => (
              l.op > 0.001 ? (
                <Chars key={k} text={l.w} from={0} shown={k === 0 ? Math.min(domainLen, 4) : 4} color={ACCENT} weight={800} opacity={l.op} dy={l.dy} />
              ) : null
            ))}
            <Chars text={CUSTOM} from={4} shown={Math.max(0, domainLen - 4)} color={INK} weight={600} />
          </>
        )}
        {/* short code stays; it just slides to make room */}
        <g transform={`translate(${6},0)`}>
          <Chars text={SLUG} from={domainLen} shown={SLUG.length} color={MUTED} weight={500} />
        </g>
        {caretOn && <rect x={X0 + domainLen * CW + 1} y={Y - 17} width={2.5} height={34} rx={1} fill={ACCENT} />}
      </g>

      <EyeNode x={776} y={Y} t={t} arriveStart={EYE_IN[0]} arriveEnd={EYE_IN[1]} r={11} pulse={bump(t, 6.5, 7.5) * 0.5} />

      {/* ---- C: "a word that fits your brand" ---- */}
      <DrawLine d={`M${bracketL},${Y + 40} L${bracketL},${Y + 50} L${bracketR},${Y + 50} L${bracketR},${Y + 40}`}
        t={t} start={BRACKET_IN[0]} end={BRACKET_IN[1]} width={1.8} color={ACCENT} />
      <DrawLine d={`M${wordCx},${Y + 50} L${wordCx},${Y + 78}`} t={t} start={WORD_CHIP_IN[0]} end={WORD_CHIP_IN[1]} width={1.2} color={ACCENT} opacity={0.6} />
      <Chip x={wordCx + 70} y={Y + 92} t={t} start={WORD_CHIP_IN[0]} end={WORD_CHIP_IN[1]} label="A word that fits your brand" width={290} />
      </g>
    </svg>
  );
}

/* =================================================================
   The scene the player mounts. Restart remounts it → clock back to 0.
================================================================= */
export default function TrackingDomain({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <TrackingDomainFrame ms={elapsed} />
    </div>
  );
}
