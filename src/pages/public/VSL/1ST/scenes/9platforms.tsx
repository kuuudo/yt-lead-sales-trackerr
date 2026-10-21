import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "9platform" (9platforms.tsx) — 10 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO:

   [A 0.0-1.9 ] "Vstrk supports 9 platforms."
   [B 1.9-10.0]  "YouTube, TikTok, Instagram, LinkedIn, X, Threads, Facebook, Reddit, and Twitch."

   WHAT HAPPENS
     A  A VSTRK badge, a big "9" and a "Platforms" chip appear; nine empty
        dashed slots fade in as a 3 × 3 grid.
     B  Each slot fills with that platform's tile at the moment its name is
        spoken. The current tile lights up; an eye opens on every tile
        (VSTRK's "tracked" symbol). The last tile (Twitch) lands at ~9.5 s.

   Platform timing is split by syllable count (~0.48 s / syllable). To retime,
   edit the `start` seconds in the PLATFORMS list.

   NOTE: tiles use a neutral letter monogram + the platform's name. No brand
   logos are drawn, so there is nothing to keep in sync with anyone's branding.
   Self-contained: React + scene props type + the optional clock hook only.
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
const NINE_IN = [0.35, 0.9];
const NINE_PULSE = [0.9, 1.7];
const WORD_CHIP_IN = [0.8, 1.3];
const SLOTS_IN = { start: 0.9, stagger: 0.08, dur: 0.4 };

// `start` = the second each name begins to be spoken. Reading order: left→right, top→bottom.
const PLATFORMS: { name: string; letter: string; start: number }[] = [
  { name: "YouTube",   letter: "Y", start: 1.9 },
  { name: "TikTok",    letter: "T", start: 2.85 },
  { name: "Instagram", letter: "I", start: 3.8 },
  { name: "LinkedIn",  letter: "L", start: 5.2 },
  { name: "X",         letter: "X", start: 6.6 },
  { name: "Threads",   letter: "T", start: 7.1 },
  { name: "Facebook",  letter: "F", start: 7.6 },
  { name: "Reddit",    letter: "R", start: 8.55 },
  { name: "Twitch",    letter: "T", start: 9.5 },
];
const END_OF_LIST = 10.0;

/* ---------------- layout ---------------- */
const TILE_W = 210, TILE_H = 76;
const COLS = [246, 480, 714];
const ROWS = [250, 340, 430];

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

/* =================================================================
   One frame as a pure function of time (ms). Exported for off-player checks.
================================================================= */
export function NinePlatformsFrame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  const nineP = prog(t, NINE_IN[0], NINE_IN[1]);
  const ninePulse = bump(t, NINE_PULSE[0], NINE_PULSE[1]);

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,16)">
        <Badge x={480} y={44} t={t} arriveStart={HEAD_IN[0]} arriveEnd={HEAD_IN[1]} label="VSTRK" width={110} filled />

        {/* big "9" */}
        {nineP > 0.001 && (
          <g opacity={nineP} style={{ transformOrigin: "480px 112px", transform: `scale(${lerp(0.8, 1, nineP) * (1 + 0.06 * ninePulse)})` }}>
            <text x={480} y={112} textAnchor="middle" dominantBaseline="middle" fontFamily={MONO} fontWeight={800} fontSize={80} fill={ACCENT}>9</text>
          </g>
        )}
        <Chip x={480} y={168} t={t} start={WORD_CHIP_IN[0]} end={WORD_CHIP_IN[1]} label="Platforms" width={140} />

        {/* 3 × 3 grid */}
        {PLATFORMS.map((p, i) => {
          const cx = COLS[i % 3], cy = ROWS[Math.floor(i / 3)];
          const slotStart = SLOTS_IN.start + i * SLOTS_IN.stagger;
          const slotP = prog(t, slotStart, slotStart + SLOTS_IN.dur);

          const tileStart = p.start - 0.1;
          const tileP = prog(t, tileStart, tileStart + 0.4);
          const nextStart = i + 1 < PLATFORMS.length ? PLATFORMS[i + 1].start : END_OF_LIST;
          const active = bump(t, p.start, nextStart);          // lit while its name is being spoken
          const lit = active > 0.05;

          return (
            <g key={p.name}>
              {/* empty slot (stays faintly visible under the tile) */}
              <rect x={cx - TILE_W / 2} y={cy - TILE_H / 2} width={TILE_W} height={TILE_H} rx={14} fill="none"
                stroke={LINE} strokeWidth={1.3} strokeDasharray="5 6" opacity={slotP * (1 - tileP)} />
              <text x={cx} y={cy} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={20} fill={LINE}
                opacity={slotP * (1 - tileP)}>{i + 1}</text>

              {/* filled tile */}
              {tileP > 0.001 && (
                <g opacity={tileP} style={{ transformOrigin: `${cx}px ${cy}px`, transform: `scale(${lerp(0.92, 1, tileP) * (1 + 0.03 * active)})` }}>
                  <rect x={cx - TILE_W / 2} y={cy - TILE_H / 2} width={TILE_W} height={TILE_H} rx={14} fill="#fff"
                    stroke={lit ? ACCENT : LINE} strokeWidth={lit ? 1.8 : 1.3}
                    style={{ filter: lit ? `drop-shadow(0 0 ${12 * active}px rgba(91,61,240,0.55))` : "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
                  <circle cx={cx - 72} cy={cy} r={22} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.3} />
                  <text x={cx - 72} y={cy} dy="0.35em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={20} fill={ACCENT}>{p.letter}</text>
                  <text x={cx - 38} y={cy} dy="0.34em" fontFamily={MONO} fontWeight={700} fontSize={15} letterSpacing={0.3} fill={INK}>{p.name}</text>
                </g>
              )}
              <EyeNode x={cx + 84} y={cy} t={t} arriveStart={p.start + 0.05} arriveEnd={p.start + 0.3} pulse={active * 0.6} r={7} />
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
export default function NinePlatforms({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <NinePlatformsFrame ms={elapsed} />
    </div>
  );
}
