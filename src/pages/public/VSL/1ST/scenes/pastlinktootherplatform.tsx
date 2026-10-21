import React from "react";
import type { VSLSceneProps } from "../vslTypes";
import { useSceneClock } from "../useSceneClock";

/* ---------------------------------------------------------------
   VSTRK — VSL scene "pasteLink" (pastlinktootherplatform.tsx) — 13 seconds, no subtitles

   NARRATION THIS SCENE IS TIMED TO (~35 words, ≈ 0.37 s / word):

   [S1  0.0- 5.2] "So if you're using Reddit to promote simply paste it into the Reddit post.
   [S2  5.2- 9.3]  If you're using TikTok, paste it into the TikTok video description.
   [S3  9.3-13.0]  If you're using LinkedIn, paste it into the LinkedIn post."

   WHAT HAPPENS (the same 4-step rhythm, three times)
     1. The platform's blank post editor appears (Reddit → TikTok → LinkedIn),
        with an empty dashed "link" slot.
     2. The tracking link at the top (shop.yourdomain.com/token) flashes COPIED.
     3. A copy of the link flies down into the slot at the moment "paste it" is
        spoken, and lands with a ripple and a check.
     4. The platform label pulses when its name is said again
        ("…the Reddit post", "…TikTok video description", "…LinkedIn post").

   The post editors are neutral mock-ups (bars, circles) — no real UI or logos.
   To retime, edit the seconds in the SEGMENTS list.
   Self-contained: React + scene props type + the optional clock hook only.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MUTED = "#9a9aa8";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const TOTAL_MS = 13000;

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

/* ---------------- BEAT TIMING (seconds) ---------------- */
const SRC_IN = [0.1, 0.6];

type Kind = "reddit" | "tiktok" | "linkedin";
interface Segment {
  kind: Kind;
  label: string;           // platform badge above the editor
  labelW: number;
  slot: { x: number; y: number };   // where the link lands
  cardIn: [number, number];
  cardOut: [number, number] | null;  // null = holds to the end
  copy: [number, number, number, number];  // COPIED tag: fade-in a→b, hold, fade-out c→d
  fly: [number, number];            // the paste
  pulse: [number, number];          // platform name said again
}
const SEGMENTS: Segment[] = [
  { kind: "reddit",   label: "Reddit Post",              labelW: 190, slot: { x: 349, y: 380 }, cardIn: [0.2, 0.8], cardOut: [4.9, 5.2], copy: [2.2, 2.5, 2.9, 3.2], fly: [3.0, 3.8],   pulse: [3.9, 5.0] },
  { kind: "tiktok",   label: "TikTok Video Description", labelW: 300, slot: { x: 491, y: 360 }, cardIn: [5.3, 5.9], cardOut: [9.0, 9.3], copy: [6.0, 6.3, 6.6, 6.9], fly: [6.8, 7.5],   pulse: [8.0, 9.0] },
  { kind: "linkedin", label: "LinkedIn Post",            labelW: 210, slot: { x: 349, y: 372 }, cardIn: [9.4, 9.9], cardOut: null,       copy: [10.0, 10.3, 10.6, 10.9], fly: [10.8, 11.5], pulse: [12.0, 13.0] },
];

/* ---------------- layout ---------------- */
const SRC = { x: 480, y: 70, w: 300, h: 40 };
const SLOT_W = 250, SLOT_H = 34;
const CARD = { x: 200, y: 190, w: 560, h: 280 };

/* ---------------- primitives ---------------- */
function Badge({ x, y, label, width, scalePulse = 0 }: { x: number; y: number; label: string; width: number; scalePulse?: number }) {
  const h = 28, bx = x - width / 2, by = y - h / 2;
  return (
    <g style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${1 + 0.06 * scalePulse})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={14} fill="#fff" stroke={ACCENT} strokeWidth={1.3}
        style={{ filter: scalePulse > 0.05 ? `drop-shadow(0 0 ${9 * scalePulse}px rgba(91,61,240,0.55))` : "drop-shadow(0 4px 10px rgba(91,61,240,0.2))" }} />
      <path d={`M${bx + 2},${by + 2} l10,0 M${bx + 2},${by + 2} l0,10`} stroke={ACCENT} strokeWidth={1.3} strokeLinecap="round" fill="none" />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11} letterSpacing={1.1}
        fill={ACCENT} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

/** The tracking link text: brand word in violet, rest in ink, token muted.
    Drawn one character per cell so spacing is identical in every font/browser. */
const LINK = "shop.yourdomain.com/token";
function LinkText({ x, y, size }: { x: number; y: number; size: number }) {
  const cw = size * 0.6;
  const x0 = x - (LINK.length * cw) / 2;
  return (
    <g fontFamily={MONO} fontSize={size}>
      {LINK.split("").map((ch, i) => (
        <text key={i} x={x0 + i * cw + cw / 2} y={y} dy="0.34em" textAnchor="middle"
          fill={i < 4 ? ACCENT : i < 19 ? INK : MUTED} fontWeight={i < 4 ? 800 : 700}>{ch}</text>
      ))}
    </g>
  );
}

function Bar({ x, y, w, h = 8, fill = LINE, p = 1, rx = 4 }: { x: number; y: number; w: number; h?: number; fill?: string; p?: number; rx?: number }) {
  if (p <= 0.001) return null;
  return <rect x={x} y={y} width={w * p} height={h} rx={rx} fill={fill} />;
}

function Check({ x, y, p }: { x: number; y: number; p: number }) {
  if (p <= 0.001) return null;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.6, 1, p)})` }}>
      <circle cx={x} cy={y} r={10} fill={ACCENT} />
      <path d={`M${x - 4.5},${y + 0.5} l3.2,3.4 l6,-7`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/* ---- neutral post-editor mock-ups; every card has the same outer frame ---- */
function CardFrame({ children }: { children: React.ReactNode }) {
  return (
    <g>
      <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={16} fill="#fff" stroke={LINE} strokeWidth={1.3}
        style={{ filter: "drop-shadow(0 6px 18px rgba(21,21,31,0.07))" }} />
      {children}
    </g>
  );
}

function RedditCard({ w }: { w: number }) {          // w = 0..1 "writing in" progress
  return (
    <CardFrame>
      <circle cx={236} cy={224} r={13} fill="#f3f1ff" stroke={LINE} strokeWidth={1.2} />
      <Bar x={258} y={220} w={120} fill={LINE} p={w} />
      <Bar x={224} y={252} w={320} h={13} fill="#2a2a38" p={w} rx={6.5} />
      <Bar x={224} y={284} w={500} p={w} />
      <Bar x={224} y={304} w={456} p={w} />
      <Bar x={224} y={324} w={360} p={w} />
      <rect x={664} y={424} width={76} height={28} rx={14} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.1} opacity={w} />
    </CardFrame>
  );
}

function TikTokCard({ w }: { w: number }) {
  return (
    <CardFrame>
      <rect x={224} y={210} width={118} height={240} rx={12} fill="#f3f1ff" stroke={LINE} strokeWidth={1.2} />
      <circle cx={283} cy={322} r={20} fill="#fff" stroke={ACCENT} strokeWidth={1.4} />
      <path d="M278,312 L278,332 L295,322 Z" fill={ACCENT} />
      <Bar x={366} y={226} w={150} h={9} fill="#2a2a38" p={w} />
      <Bar x={366} y={256} w={340} p={w} />
      <Bar x={366} y={276} w={300} p={w} />
      <Bar x={366} y={296} w={210} p={w} />
      <rect x={664} y={424} width={76} height={28} rx={14} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.1} opacity={w} />
    </CardFrame>
  );
}

function LinkedInCard({ w }: { w: number }) {
  return (
    <CardFrame>
      <circle cx={242} cy={228} r={18} fill="#f3f1ff" stroke={LINE} strokeWidth={1.2} />
      <Bar x={272} y={218} w={150} h={9} fill="#2a2a38" p={w} />
      <Bar x={272} y={236} w={210} h={7} p={w} />
      <Bar x={224} y={272} w={500} p={w} />
      <Bar x={224} y={292} w={470} p={w} />
      <Bar x={224} y={312} w={330} p={w} />
      <rect x={664} y={424} width={76} height={28} rx={14} fill="#f3f1ff" stroke={ACCENT} strokeWidth={1.1} opacity={w} />
    </CardFrame>
  );
}

/* =================================================================
   One frame as a pure function of time (ms). Exported for off-player checks.
================================================================= */
export function PasteLinkFrame({ ms }: { ms: number }) {
  const t = Math.min(ms, TOTAL_MS) / 1000;

  const srcP = prog(t, SRC_IN[0], SRC_IN[1]);
  // how "copied" the source chip looks right now (max over the three segments)
  const copiedNow = Math.max(0, ...SEGMENTS.map((s) => fadeWindow(t, ...s.copy)));

  return (
    <svg viewBox="0 0 960 560" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }}>
      <g transform="translate(0,22)">

        {/* ---- the source: the tracking link ---- */}
        <g opacity={srcP}>
          <text x={480} y={26} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fontWeight={700} letterSpacing={0.8} fill={MUTED}
            style={{ textTransform: "uppercase" }}>Your tracking link</text>
          <rect x={SRC.x - SRC.w / 2} y={SRC.y - SRC.h / 2} width={SRC.w} height={SRC.h} rx={20} fill="#fff"
            stroke={copiedNow > 0.05 ? ACCENT : LINE} strokeWidth={copiedNow > 0.05 ? 1.8 : 1.3}
            style={{ filter: copiedNow > 0.05 ? `drop-shadow(0 0 ${10 * copiedNow}px rgba(91,61,240,0.5))` : "drop-shadow(0 3px 10px rgba(21,21,31,0.06))" }} />
          {/* copy icon */}
          <g fill="none" stroke={copiedNow > 0.05 ? ACCENT : MUTED} strokeWidth={1.6} strokeLinejoin="round">
            <rect x={SRC.x - SRC.w / 2 + 16} y={SRC.y - 9} width={12} height={14} rx={2.5} />
            <path d={`M${SRC.x - SRC.w / 2 + 20},${SRC.y - 12} h10 a2.5,2.5 0 0 1 2.5,2.5 v11`} />
          </g>
          <LinkText x={SRC.x + 14} y={SRC.y} size={16} />
          {/* COPIED tag */}
          {copiedNow > 0.001 && (
            <g opacity={copiedNow}>
              <rect x={SRC.x - 44} y={SRC.y + 32} width={88} height={22} rx={11} fill={ACCENT} />
              <text x={SRC.x} y={SRC.y + 43} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9.5} letterSpacing={1} fill="#fff">COPIED ✓</text>
            </g>
          )}
        </g>

        {/* ---- one segment per platform ---- */}
        {SEGMENTS.map((s) => {
          const cardOp = s.cardOut ? fadeWindow(t, s.cardIn[0], s.cardIn[1], s.cardOut[0], s.cardOut[1]) : prog(t, s.cardIn[0], s.cardIn[1]);
          if (cardOp <= 0.001) return null;

          const writeP = prog(t, s.cardIn[0] + 0.15, s.cardIn[1] + 0.5);
          const flyP = ease(prog(t, s.fly[0], s.fly[1]));
          const landed = prog(t, s.fly[1], s.fly[1] + 0.3);
          const ripple = prog(t, s.fly[1], s.fly[1] + 0.6);
          const pulse = bump(t, s.pulse[0], s.pulse[1]);

          // flying copy: source chip → slot, along a slight arc, shrinking to slot size
          const px = lerp(SRC.x, s.slot.x, flyP);
          const py = lerp(SRC.y, s.slot.y, flyP) - 34 * Math.sin(flyP * Math.PI);
          const pw = lerp(SRC.w, SLOT_W, flyP);
          const ph = lerp(SRC.h, SLOT_H, flyP);
          const pSize = lerp(16, 14, flyP);
          const flying = t >= s.fly[0];

          return (
            <g key={s.kind}>
              <g opacity={cardOp}>
                <g transform={`translate(0,${(1 - cardOp) * 10})`}>
                  <Badge x={480} y={160} label={s.label} width={s.labelW} scalePulse={pulse} />
                  {s.kind === "reddit" && <RedditCard w={writeP} />}
                  {s.kind === "tiktok" && <TikTokCard w={writeP} />}
                  {s.kind === "linkedin" && <LinkedInCard w={writeP} />}

                  {/* empty slot, until the link lands */}
                  <rect x={s.slot.x - SLOT_W / 2} y={s.slot.y - SLOT_H / 2} width={SLOT_W} height={SLOT_H} rx={10} fill="none"
                    stroke={ACCENT} strokeWidth={1.3} strokeDasharray="5 5" opacity={writeP * 0.7 * (1 - landed)} />
                </g>

                {/* the pasted link (flying, then resting in the slot) */}
                {flying && (
                  <g>
                    <rect x={px - pw / 2} y={py - ph / 2} width={pw} height={ph} rx={Math.min(20, ph / 2)} fill="#fff" stroke={ACCENT} strokeWidth={1.5}
                      style={{ filter: `drop-shadow(0 6px 14px rgba(91,61,240,${lerp(0.3, 0.12, flyP)}))` }} />
                    <LinkText x={px} y={py} size={pSize} />
                  </g>
                )}
                {ripple > 0 && ripple < 1 && (
                  <rect x={s.slot.x - SLOT_W / 2 - 18 * ripple} y={s.slot.y - SLOT_H / 2 - 18 * ripple}
                    width={SLOT_W + 36 * ripple} height={SLOT_H + 36 * ripple} rx={14 + 12 * ripple}
                    fill="none" stroke={ACCENT} strokeWidth={1.4} opacity={(1 - ripple) * 0.6} />
                )}
                <Check x={s.slot.x + SLOT_W / 2 + 20} y={s.slot.y} p={landed} />
              </g>
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
export default function PasteLink({ playing }: VSLSceneProps) {
  const elapsed = useSceneClock(playing, TOTAL_MS);
  return (
    <div style={{
      width: "100%", height: "100%", background: "#ffffff", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    }}>
      <PasteLinkFrame ms={elapsed} />
    </div>
  );
}
