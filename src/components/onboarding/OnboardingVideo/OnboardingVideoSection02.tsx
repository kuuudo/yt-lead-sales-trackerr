import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, SECTION 02 ONLY
   "But that's only the first use case." → "...things get really
   interesting."

   Standalone, modular scene file for Section 02 of the master VSL.
   Introduces the Asset concept: a successful video becomes a reusable
   Asset, new content is created to promote that Asset, and VSTRK
   tracks the whole network of content contributing to a result —
   not just a single linear Video → Sales Page → Purchase chain.

   Independently renderable — does NOT require Section 01 to be
   mounted. Section 01's visual language, timing philosophy and
   primitives are reused/regenerated locally below so this file has
   no import-time dependency on it.

   REUSED FROM SECTION 01 (same shapes, regenerated locally so this
   file stays self-contained — see file header note above):
     - clamp / prog / fadeWindow / lerp        (timing math)
     - DrawLine, EyeNode, Fox                  (visual primitives)
     - buildChain()                            (sequential node-chain timing)
     - splitSentences() / chainAtTimes()       (per-sentence caption + reveal timing)
     - segOpacity() / rangeOpacity()           (segment fade helpers)
     - the VSTRK-wordmark pivot beat from Section 01's Segment 08,
       reused here (Beat 04, "VSTRK can do that too.") as the same
       kind of brief brand-emphasis pause
     - the fox breathing/idle motif

   NEW IN THIS FILE:
     - AssetBadge — a small violet chip primitive that marks a node
       as an Asset (rounded pill, corner tick, "ASSET" label). This is
       the section's one new visual primitive; it's what makes the
       Asset concept legible and memorable wherever it recurs.
     - buildFanIn() — the mirror of Section 01's buildFan(): N source
       nodes stagger their own arrival, each followed by a line
       drawing FROM that source INTO a shared center. Used for the
       five-source network beat (TikTok A / Instagram A / YouTube B /
       X C / Creator D → Video A).
     - networkExpand(t) — a single scalar (0..1) driving the section's
       hero animation: the five source nodes animate along the
       segment between their fanned-out position and the shared
       center node, and their connecting lines are recomputed every
       frame from the nodes' current (animated) position. At E=1 the
       network is fully fanned out; at E=0 the five sources have
       visually been pulled into the center, leaving only the plain
       Video → Sales Page → Purchase spine. This single function
       produces both the "network contracts into the simple chain"
       and "network explodes back outward" moments from one number,
       driven by playback time, rather than two separate animations.

   NOT included on purpose (reserved for later sections):
     Operator, Marketplace, collaborator assignments, promotion
     analytics, marketer comparison, revenue comparison tables, lead
     magnets, Workspace, advanced analytics — and no invented
     product behavior beyond what Assets.tsx already implements
     (a video becoming a reusable Asset that other content promotes).
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/* ---------------------------------------------------------------
   Timing — fourteen beats, played back to back with a short 300ms
   cross-fade gap between each. Durations are sized to the spoken
   length of each beat's exact sentence (~230ms/word, plus lead/tail
   margins), same timing philosophy as Section 01. Beat T10 carries no
   narration of its own — it's the silent network-build moment that
   "Your marketing can start looking more like this:" (T9) leads into
   — so it gets a flat duration sized for the visual, not a word count.
----------------------------------------------------------------- */
const GAP = 300;
const SEG_DURATIONS: [string, number][] = [
  ["T1", 2500],  // "But that's only the first use case." (7 words)
  ["T2", 3700],  // "Let's say you have a video that's generating a lot of revenue." (12 words)
  ["T3", 2500],  // "Naturally, you want to promote that video." (7 words)
  ["T4", 2000],  // "VSTRK can do that too." (5 words)
  ["T5", 3200],  // "You simply turn that video into an Asset." (8 words) — key product beat, extra room
  ["T6", 3900],  // "When you find something that works, you don't have to start from scratch." (13 words)
  ["T7", 3700],  // "Turn it into an asset — and use it again and again." (11 words)
  ["T8", 3200],  // "Now you can create new content to promote that asset." (10 words)
  ["T9", 3000],  // "Your marketing can start looking more like this:" (8 words) — leads into T10
  ["T10", 3600], // (no narration) — the network builds: five sources fan in, then the spine draws down
  ["T11", 1800], // "Instead of just tracking:"
  ["T12", 1800], // "Video → Sales Page → Purchase" — network held collapsed to the plain chain
  ["T13", 4600], // "you can start tracking the entire network of content that contributes to the result." (14 words) — network re-expands
  ["T14", 3000], // "And that's where things get really interesting." (7 words)
];
const SEG: Record<string, { start: number; end: number; dur: number }> = {};
{
  let cursor = 0;
  for (const [key, dur] of SEG_DURATIONS) {
    SEG[key] = { start: cursor, end: cursor + dur, dur };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.T14.end + 600;

function clamp(v: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function prog(t: number, start: number, end: number) { return clamp((t - start) / (end - start)); }
function fadeWindow(t: number, a: number, b: number, c: number, d: number) {
  if (t < a) return 0;
  if (t < b) return clamp((t - a) / (b - a));
  if (c === Infinity) return 1;
  if (t < c) return 1;
  if (t < d) return 1 - clamp((t - c) / (d - c));
  return 0;
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function segOpacity(t: number, key: string, edge = 300) {
  const { start, end } = SEG[key];
  return fadeWindow(t, start, start + edge, end - edge, end);
}
function rangeOpacity(t: number, fromKey: string, toKey: string, edge = 300) {
  return fadeWindow(t, SEG[fromKey].start, SEG[fromKey].start + edge, SEG[toKey].end - edge, SEG[toKey].end);
}

/* Sequential node chain — reused verbatim from Section 01. */
function buildChain(
  base: number,
  count: number,
  opts: { lineDraw: number; eyeOpen: number; beatGap: number; originOpen: number }
) {
  const { lineDraw, eyeOpen, beatGap, originOpen } = opts;
  const arrive = [{ start: base, end: base + originOpen }];
  const lines: { start: number; end: number }[] = [];
  let cursor = base + originOpen;
  for (let i = 0; i < count - 1; i++) {
    const lineStart = cursor;
    const lineEnd = lineStart + lineDraw;
    const eyeStart = lineEnd;
    const eyeEnd = eyeStart + eyeOpen;
    lines.push({ start: lineStart, end: lineEnd });
    arrive.push({ start: eyeStart, end: eyeEnd });
    cursor = eyeEnd + beatGap;
  }
  return { arrive, lines, end: arrive[arrive.length - 1].end };
}

/* NEW — the mirror of Section 01's buildFan(): N sources, each with
   its own staggered arrival, followed by a line drawing FROM that
   source INTO a shared center (rather than root -> targets). Used
   for the five-platform network beat. */
function buildFanIn(rootStart: number, count: number, opts: { nodeStagger: number; nodeOpen: number; lineDraw: number; startGap?: number }) {
  const { nodeStagger, nodeOpen, lineDraw, startGap = 0 } = opts;
  const sources = [];
  for (let i = 0; i < count; i++) {
    const nodeStart = rootStart + startGap + i * nodeStagger;
    const nodeEnd = nodeStart + nodeOpen;
    sources.push({ node: { start: nodeStart, end: nodeEnd }, line: { start: nodeEnd, end: nodeEnd + lineDraw } });
  }
  const end = Math.max(...sources.map((s) => s.line.end));
  return { sources, end };
}

/* Divides a beat's runtime across its sentences by word count — reused
   verbatim from Section 01. Every beat in this section is a single
   sentence, so in practice this just gives each caption clean
   lead-in/tail-out margins sized to its own word count. */
function splitSentences(
  seg: { start: number; end: number },
  sentences: string[],
  opts: { lead?: number; tail?: number; pause?: number; fade?: number } = {}
) {
  const { lead = 260, tail = 320, pause = 340, fade = 220 } = opts;
  const words = sentences.map((s) => s.trim().split(/\s+/).length);
  const totalWords = words.reduce((a, b) => a + b, 0);
  const usable = (seg.end - tail) - (seg.start + lead) - pause * (sentences.length - 1);
  let cursor = seg.start + lead;
  return sentences.map((text, i) => {
    const dur = Math.round((words[i] / totalWords) * usable);
    const a = cursor;
    const d = a + dur;
    const b = Math.min(a + fade, a + dur / 2);
    const c = Math.max(b, d - fade);
    cursor = d + pause;
    return { text, a, b, c, d, start: a, end: d };
  });
}

/* ---------------- Visual primitives — regenerated from Section 01 ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} opacity={opacity} />
  );
}

function EyeNode({ x, y, t, arriveStart, arriveEnd, label, labelSide = "right", mono = true, pulse = 0, opacity = 1 }:
  {
    x: number; y: number; t: number; arriveStart: number; arriveEnd: number;
    label?: string; labelSide?: "left" | "right" | "center"; mono?: boolean; pulse?: number; opacity?: number;
  }) {
  const openP = prog(t, arriveStart, arriveEnd);
  const eyeP = prog(t, arriveEnd, arriveEnd + 260);
  const baseGlow = clamp(openP) * (1 - 0.4 * (1 - eyeP));
  const glow = clamp(baseGlow + pulse, 0, 1.6);
  const ry = lerp(0.6, 3.1, eyeP);
  const labelX = labelSide === "right" ? x + 13 : labelSide === "left" ? x - 13 : x;
  const anchor = labelSide === "right" ? "start" : labelSide === "left" ? "end" : "middle";
  return (
    <g opacity={openP * opacity}>
      <circle cx={x} cy={y} r={5.5} fill="#fff" stroke={openP > 0.05 ? ACCENT : LINE} strokeWidth={1.2}
        style={{ filter: glow > 0.15 ? `drop-shadow(0 0 ${5 * glow}px ${ACCENT})` : "none" }} />
      <ellipse cx={x} cy={y} rx={3.1} ry={ry} fill={ACCENT} opacity={eyeP} />
      {label && (
        <text x={labelX} y={y} dy="0.34em" textAnchor={anchor}
          fontFamily={mono ? MONO : "inherit"} fontSize={mono ? 10.5 : 12} letterSpacing={mono ? 0.6 : 0}
          fill={INK} opacity={0.82} style={{ textTransform: mono ? "uppercase" : "none" }}>
          {label}
        </text>
      )}
    </g>
  );
}

function Fox({ x, y, size = 30, breathe, opacity = 1 }: { x: number; y: number; size?: number; breathe?: number; opacity?: number }) {
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} opacity={opacity}
      style={{ transformOrigin: `${x}px ${y}px`, transform: breathe ? `scale(${1 + 0.03 * Math.sin(breathe / 480)})` : "none" }}>
      🦊
    </text>
  );
}

/* NEW — the section's one new primitive. A small violet chip that
   marks a node as an Asset: rounded pill, single corner tick (the
   same corner-bracket mythology mark Section 01 reserves for real
   product surfaces), "ASSET" label. Placed just off a node rather
   than replacing it, so the underlying video/content node stays
   legible while gaining a persistent Asset marker — this is meant to
   read as "this thing has been turned into an Asset," not as a
   different node. */
function AssetBadge({ x, y, t, arriveStart, arriveEnd, scalePulse = 0 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; scalePulse?: number }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const w = 74, h = 26;
  const bx = x - w / 2, by = y - h / 2;
  const scale = lerp(0.85, 1, p) * (1 + 0.04 * scalePulse);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={w} height={h} rx={13} fill="#ffffff" stroke={ACCENT} strokeWidth={1.3}
        style={{ filter: `drop-shadow(0 4px 10px rgba(91,61,240,0.18))` }} />
      <path d={`M${bx + 2},${by + 2} l10,0 M${bx + 2},${by + 2} l0,10`} stroke={ACCENT} strokeWidth={1.3} strokeLinecap="round" fill="none" />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={10.5}
        letterSpacing={1.1} fill={ACCENT} style={{ textTransform: "uppercase" }}>Asset</text>
    </g>
  );
}

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
================================================================= */

/* A single spine coordinate carries the "video that's generating
   revenue" all the way through the section — it's the same node
   that becomes the Asset in T5 and anchors the network in T10-T14,
   so nothing jumps around on screen when the concept changes. */
const ASSET = { x: 480, y: 280 };
const SALES = { x: 480, y: 410 };
const PURCHASE = { x: 480, y: 530 };

/* ---- T1 — "But that's only the first use case." (pivot from Section 01) ---- */
const T1_SENT = splitSentences(SEG.T1, ["But that's only the first use case."]);
const T1_RING = { start: SEG.T1.start + 200, end: SEG.T1.start + 700 };

/* ---- T2 — "Let's say you have a video that's generating a lot of revenue." ---- */
const T2_SENT = splitSentences(SEG.T2, ["Let's say you have a video that's generating a lot of revenue."]);
const T2_ARRIVE = { start: SEG.T2.start + 150, end: SEG.T2.start + 500 };

/* ---- T3 — "Naturally, you want to promote that video." ---- */
const T3_SENT = splitSentences(SEG.T3, ["Naturally, you want to promote that video."]);
const T3_FOX_IN = { start: SEG.T3.start + 150, end: SEG.T3.start + 450 };
const T3_LINE = { start: T3_FOX_IN.end + 100, end: T3_FOX_IN.end + 100 + 320 };

/* ---- T4 — "VSTRK can do that too." (brand pivot, reuses Section 01's wordmark beat grammar) ---- */
const T4_SENT = splitSentences(SEG.T4, ["VSTRK can do that too."]);
const T4_WORD_IN = { start: T4_SENT[0].start, end: T4_SENT[0].start + 380 };

/* ---- T5 — "You simply turn that video into an Asset." (key product beat) ---- */
const T5_SENT = splitSentences(SEG.T5, ["You simply turn that video into an Asset."]);
const T5_BADGE_IN = { start: T5_SENT[0].start + 200, end: T5_SENT[0].start + 700 };

/* ---- T6 — "When you find something that works, you don't have to start from scratch." ---- */
const T6_SENT = splitSentences(SEG.T6, ["When you find something that works, you don't have to start from scratch."]);
const T6_GHOST = { x: 190, y: 470 };
const T6_GHOST_IN = { start: SEG.T6.start + 350, end: SEG.T6.start + 750 };
const T6_GHOST_OUT = { start: SEG.T6.end - 900, end: SEG.T6.end - 500 };

/* ---- T7 — "Turn it into an asset — and use it again and again." (reuse loop) ---- */
const T7_SENT = splitSentences(SEG.T7, ["Turn it into an asset \u2014 and use it again and again."]);
const T7_LOOP = { start: SEG.T7.start + 300, end: SEG.T7.end - 300 };
const T7_ECHOES = [
  { start: SEG.T7.start + 700, delay: 0 },
  { start: SEG.T7.start + 1500, delay: 1 },
  { start: SEG.T7.start + 2300, delay: 2 },
];

/* ---- T8 — "Now you can create new content to promote that asset." ---- */
const T8_SENT = splitSentences(SEG.T8, ["Now you can create new content to promote that asset."]);
const T8_TARGETS = [
  { x: 250, y: 170 },
  { x: 480, y: 100 },
  { x: 710, y: 170 },
];
const T8_FAN = buildFanIn(SEG.T8.start + 300, T8_TARGETS.length, { nodeStagger: 420, nodeOpen: 220, lineDraw: 300 });

/* ---- T9 — "Your marketing can start looking more like this:" (leads into the network reveal) ---- */
const T9_SENT = splitSentences(SEG.T9, ["Your marketing can start looking more like this:"]);

/* ---- T10 — silent network build: five sources fan in, then the spine draws down ----
   No narration of its own; this is the "major visual moment" the
   spec calls for. Five sources stagger in and each draws a line into
   the Asset node, then the plain spine (Asset -> Sales Page ->
   Purchase) draws down beneath it. */
const NET_SOURCES = [
  { x: 100, y: 150, label: "TikTok A" },
  { x: 270, y: 70, label: "Instagram A" },
  { x: 480, y: 40, label: "YouTube B" },
  { x: 690, y: 70, label: "X C" },
  { x: 860, y: 150, label: "Creator D" },
];
const NET_BASE = SEG.T10.start + 100;
const NET_FAN = buildFanIn(NET_BASE, NET_SOURCES.length, { nodeStagger: 340, nodeOpen: 220, lineDraw: 280 });
const NET_SPINE_BASE = NET_FAN.end + 120;
/* originOpen: 0 — the Asset node already exists (it's been on screen
   since T2), so the chain's own "origin arrival" window is instant;
   we only use its arrive[1]/arrive[2] entries for Sales Page/Purchase. */
const NET_SPINE = buildChain(NET_SPINE_BASE, 3, { lineDraw: 260, eyeOpen: 220, beatGap: 90, originOpen: 1 });

/* ---- T11/T12 — "Instead of just tracking: Video → Sales Page → Purchase" ----
   The five sources visually contract into the Asset node across T11,
   then hold collapsed (plain spine only) through T12. */
const T11_SENT = splitSentences(SEG.T11, ["Instead of just tracking:"]);
const T12_SENT = splitSentences(SEG.T12, ["Video \u2192 Sales Page \u2192 Purchase"]);
const T12_PULSE = { start: SEG.T12.start + 200, end: SEG.T12.end - 200 };

/* ---- T13 — "...the entire network of content that contributes to the result." ----
   The five sources re-expand back out from the Asset node. */
const T13_SENT = splitSentences(SEG.T13, [
  "you can start tracking the entire network of content that contributes to the result.",
]);

/* ---- T14 — "And that's where things get really interesting." (hard transition out) ---- */
const T14_SENT = splitSentences(SEG.T14, ["And that's where things get really interesting."]);
const T14_PULSE = { start: SEG.T14.start + 300, end: SEG.T14.end - 500 };
const T14_FADE = { start: SEG.T14.end - 450, end: SEG.T14.end - 50 };

/* networkExpand(t) — the section's hero-animation scalar. 1 = fully
   fanned out, 0 = the five sources have been pulled into the Asset
   node, leaving only the plain spine. Stays 1 through the initial
   build (T10) and only starts moving once the "Instead of just
   tracking" beat (T11) begins. */
function networkExpand(t: number) {
  if (t < SEG.T11.start) return 1;
  if (t < SEG.T11.end) return 1 - prog(t, SEG.T11.start, SEG.T11.end);
  if (t < SEG.T13.start) return 0;
  if (t < SEG.T13.end) return prog(t, SEG.T13.start, SEG.T13.end);
  return 1;
}

/* ---- Captions — exact, unabridged narration. T10 has no caption: it's
   the silent network-build moment "...more like this:" leads into. ---- */
const CAPTIONS = [
  ...T1_SENT,
  ...T2_SENT,
  ...T3_SENT,
  ...T4_SENT,
  ...T5_SENT,
  ...T6_SENT,
  ...T7_SENT,
  ...T8_SENT,
  ...T9_SENT,
  ...T11_SENT,
  ...T12_SENT,
  ...T13_SENT,
  ...T14_SENT,
];

export interface OnboardingVideoSection02Props {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingVideoSection02({ onSkip, onComplete }: OnboardingVideoSection02Props = {}) {
  const [elapsed, setElapsed] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let raf: number;
    const startedAt = performance.now();
    function loop(now: number) {
      const t = now - startedAt;
      setElapsed(Math.min(t, TOTAL));
      if (t < TOTAL) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runId]);

  const t = elapsed;
  const finished = t >= TOTAL;
  const replay = () => { setElapsed(0); setRunId((id) => id + 1); };

  /* ---------------- T1 — pivot from Section 01 ---------------- */
  const t1Opacity = segOpacity(t, "T1");
  const t1RingOpacity = fadeWindow(t, T1_RING.start, T1_RING.end, SEG.T1.end - 300, SEG.T1.end) * 0.35;

  /* ---------------- T2 through T9 — the Asset node stays on screen ---------------- */
  const assetOnScreenOpacity = rangeOpacity(t, "T2", "T9");
  const assetArriveProg = prog(t, T2_ARRIVE.start, T2_ARRIVE.end);
  const t2Pulse = t > T2_ARRIVE.end ? Math.abs(Math.sin((t - T2_ARRIVE.end) / 340)) : 0;

  /* ---------------- T3 — fox reaches for the video ---------------- */
  const t3Opacity = segOpacity(t, "T3");
  const t3FoxOpacity = prog(t, T3_FOX_IN.start, T3_FOX_IN.end);

  /* ---------------- T4 — VSTRK wordmark pivot ---------------- */
  const t4Opacity = segOpacity(t, "T4");
  const t4WordOpacity = fadeWindow(t, T4_WORD_IN.start, T4_WORD_IN.end, SEG.T4.end - 250, SEG.T4.end);

  /* ---------------- T5 through T14 — the Asset badge persists once introduced ---------------- */
  const badgeOpacity = rangeOpacity(t, "T5", "T14");
  const t5ScalePulse = t > T5_BADGE_IN.end && t < T5_BADGE_IN.end + 900
    ? Math.sin(prog(t, T5_BADGE_IN.end, T5_BADGE_IN.end + 900) * Math.PI)
    : 0;

  /* ---------------- T6 — "you don't have to start from scratch" ghost ---------------- */
  const t6Opacity = segOpacity(t, "T6");
  const t6GhostOpacity = fadeWindow(t, T6_GHOST_IN.start, T6_GHOST_IN.end, T6_GHOST_OUT.start, T6_GHOST_OUT.end) * 0.55;

  /* ---------------- T7 — reuse loop + echoes ---------------- */
  const t7Opacity = segOpacity(t, "T7");
  const t7LoopProg = prog(t, T7_LOOP.start, T7_LOOP.end);
  const t7LoopOpacity = fadeWindow(t, T7_LOOP.start, T7_LOOP.start + 300, T7_LOOP.end - 300, T7_LOOP.end) * 0.6;
  const t7Echoes = T7_ECHOES.map((e) => {
    const p = t > e.start ? prog(t, e.start, e.start + 900) : 0;
    return { scale: 1 + 0.55 * p, opacity: p > 0 ? (1 - p) * 0.35 : 0 };
  });

  /* ---------------- T8 — new content nodes fan in to promote the asset ---------------- */
  const t8Opacity = segOpacity(t, "T8");

  /* ---------------- T9 — pivot into the network reveal ---------------- */
  const t9Opacity = segOpacity(t, "T9");

  /* ---------------- T10 through T14 — the network itself ---------------- */
  const networkOnScreenOpacity = rangeOpacity(t, "T10", "T14");
  const netExpand = networkExpand(t);
  const netSourceNodes = NET_SOURCES.map((src, i) => {
    const fan = NET_FAN.sources[i];
    const x = lerp(ASSET.x, src.x, netExpand);
    const y = lerp(ASSET.y, src.y, netExpand);
    return { ...src, x, y, fan };
  });
  const t12PulseVal = t > T12_PULSE.start && t < T12_PULSE.end
    ? Math.abs(Math.sin((t - T12_PULSE.start) / 320))
    : 0;

  /* ---------------- T14 — hard transition out ---------------- */
  const t14PulseVal = t > T14_PULSE.start && t < T14_PULSE.end
    ? Math.sin(prog(t, T14_PULSE.start, T14_PULSE.end) * Math.PI)
    : 0;
  /* Gentle fade of the whole scene in the last ~400ms — a soft hard-cut
     cue leading into Section 03, without introducing any of its content. */
  const t14FadeOut = t > T14_FADE.start ? 1 - prog(t, T14_FADE.start, T14_FADE.end) : 1;

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: t14FadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ---------- T1 — "But that's only the first use case." ---------- */}
          <g opacity={t1Opacity}>
            <EyeNode x={480} y={280} t={t} arriveStart={SEG.T1.start + 60} arriveEnd={SEG.T1.start + 380} />
            <circle cx={480} cy={280} r={80} fill="none" stroke={ACCENT} strokeWidth={1} opacity={t1RingOpacity} />
            <text x={480} y={370} textAnchor="middle" fontFamily={MONO} fontSize={10.5} letterSpacing={1} fill={ACCENT}
              opacity={t1RingOpacity * 2} style={{ textTransform: "uppercase" }}>Use case 01</text>
          </g>

          {/* ---------- T2-T9 — the Asset node (video -> asset -> network center) ---------- */}
          <g opacity={assetOnScreenOpacity}>
            <EyeNode x={ASSET.x} y={ASSET.y} t={t} arriveStart={T2_ARRIVE.start} arriveEnd={T2_ARRIVE.end} label="Video A" labelSide="left" pulse={t2Pulse * 0.5} />
            <circle cx={ASSET.x} cy={ASSET.y} r={9 + t2Pulse * 11} fill="none" stroke={ACCENT} strokeWidth={1}
              opacity={t2Pulse * 0.35 * assetArriveProg} />

            {/* ---------- T3 — fox reaches to promote the video ---------- */}
            <g opacity={t3Opacity}>
              <Fox x={ASSET.x - 130} y={ASSET.y + 70} size={24} breathe={t} opacity={t3FoxOpacity} />
              <DrawLine d={`M${ASSET.x - 112},${ASSET.y + 54} Q ${ASSET.x - 60},${ASSET.y + 10} ${ASSET.x - 14},${ASSET.y - 4}`}
                t={t} start={T3_LINE.start} end={T3_LINE.end} width={1.2} color={ACCENT} opacity={0.7} />
            </g>

            {/* ---------- T6 — "you don't have to start from scratch" ghost ---------- */}
            <g opacity={t6Opacity}>
              <g opacity={t6GhostOpacity}>
                <circle cx={T6_GHOST.x} cy={T6_GHOST.y} r={5.5} fill="none" stroke={LINE} strokeWidth={1.2} strokeDasharray="2 3" />
                <text x={T6_GHOST.x} y={T6_GHOST.y + 22} textAnchor="middle" fontFamily={MONO} fontSize={9.5} letterSpacing={0.6} fill="#9a9aa8"
                  style={{ textTransform: "uppercase" }}>Start from scratch</text>
                <line x1={T6_GHOST.x - 10} y1={T6_GHOST.y - 10} x2={T6_GHOST.x + 10} y2={T6_GHOST.y + 10} stroke="#c9c9d3" strokeWidth={1} />
              </g>
            </g>

            {/* ---------- T7 — reuse loop + echoes ---------- */}
            <g opacity={t7Opacity}>
              <circle cx={ASSET.x} cy={ASSET.y} r={36} fill="none" stroke={ACCENT} strokeWidth={1}
                strokeDasharray="3 5" opacity={t7LoopOpacity}
                style={{ transformOrigin: `${ASSET.x}px ${ASSET.y}px`, transform: `rotate(${t7LoopProg * 220}deg)` }} />
              {t7Echoes.map((e, i) => (
                <circle key={`echo-${i}`} cx={ASSET.x} cy={ASSET.y} r={20}
                  fill="none" stroke={ACCENT} strokeWidth={1} opacity={e.opacity}
                  style={{ transformOrigin: `${ASSET.x}px ${ASSET.y}px`, transform: `scale(${e.scale})` }} />
              ))}
            </g>

            {/* ---------- T8 — new content fans in to promote the asset ---------- */}
            <g opacity={t8Opacity}>
              {T8_TARGETS.map((target, i) => {
                const fan = T8_FAN.sources[i];
                return (
                  <DrawLine key={`t8line-${i}`} d={`M${target.x},${target.y} L${ASSET.x},${ASSET.y}`}
                    t={t} start={fan.line.start} end={fan.line.end} width={1.1} />
                );
              })}
              {T8_TARGETS.map((target, i) => {
                const fan = T8_FAN.sources[i];
                return (
                  <EyeNode key={`t8node-${i}`} x={target.x} y={target.y} t={t}
                    arriveStart={fan.node.start} arriveEnd={fan.node.end}
                    label="New Content" labelSide={target.x < ASSET.x ? "left" : target.x > ASSET.x ? "right" : "center"} />
                );
              })}
            </g>
          </g>

          {/* ---------- T5-T14 — the Asset badge, anchored on the same node throughout ---------- */}
          <g opacity={badgeOpacity}>
            <AssetBadge x={ASSET.x} y={ASSET.y - 34} t={t} arriveStart={T5_BADGE_IN.start} arriveEnd={T5_BADGE_IN.end} scalePulse={t5ScalePulse} />
          </g>

          {/* ---------- T4 — VSTRK wordmark pivot ---------- */}
          <g opacity={t4Opacity}>
            <text x={480} y={480} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={34} letterSpacing={2} fill={INK} opacity={t4WordOpacity}>VSTRK</text>
          </g>

          {/* ---------- T9 — pivot label into the network reveal ---------- */}
          <g opacity={t9Opacity}>
            <text x={480} y={500} textAnchor="middle" fontFamily={MONO} fontSize={11} letterSpacing={1} fill={ACCENT}
              opacity={fadeWindow(t, SEG.T9.start + 900, SEG.T9.start + 1300, SEG.T9.end - 200, SEG.T9.end)}
              style={{ textTransform: "uppercase" }}>Your content network</text>
          </g>

          {/* ---------- T10-T14 — HERO: the network builds, contracts, and re-expands ---------- */}
          <g opacity={networkOnScreenOpacity}>
            {/* five sources + their converging lines — position and opacity driven by networkExpand(t) */}
            {netSourceNodes.map((n, i) => {
              const lineOpacity = prog(t, n.fan.line.start, n.fan.line.end) * (0.15 + 0.85 * netExpand);
              return (
                <React.Fragment key={`net-${i}`}>
                  <DrawLine d={`M${n.x},${n.y} L${ASSET.x},${ASSET.y}`} t={t} start={n.fan.line.start} end={n.fan.line.end} width={1.1} opacity={lineOpacity} />
                  <EyeNode x={n.x} y={n.y} t={t} arriveStart={n.fan.node.start} arriveEnd={n.fan.node.end}
                    label={n.label} labelSide={n.x < ASSET.x - 15 ? "left" : n.x > ASSET.x + 15 ? "right" : "center"} opacity={0.15 + 0.85 * netExpand} />
                </React.Fragment>
              );
            })}

            {/* the plain spine: Asset (Video A) -> Sales Page -> Purchase — always visible once drawn */}
            <DrawLine d={`M${ASSET.x},${ASSET.y + 12} L${SALES.x},${SALES.y - 12}`} t={t} start={NET_SPINE.lines[0].start} end={NET_SPINE.lines[0].end} width={1.4} color={ACCENT}
              opacity={0.75 + t12PulseVal * 0.2} />
            <EyeNode x={SALES.x} y={SALES.y} t={t} arriveStart={NET_SPINE.arrive[1].start} arriveEnd={NET_SPINE.arrive[1].end} label="Sales Page" />
            <DrawLine d={`M${SALES.x},${SALES.y + 12} L${PURCHASE.x},${PURCHASE.y - 12}`} t={t} start={NET_SPINE.lines[1].start} end={NET_SPINE.lines[1].end} width={1.4} color={ACCENT}
              opacity={0.75 + t12PulseVal * 0.2} />
            <EyeNode x={PURCHASE.x} y={PURCHASE.y} t={t} arriveStart={NET_SPINE.arrive[2].start} arriveEnd={NET_SPINE.arrive[2].end} label="Purchase" />

            {/* T14 — final glow pulse, a hard-transition beat leading into Section 03 */}
            <circle cx={ASSET.x} cy={ASSET.y} r={14 + t14PulseVal * 40} fill="none" stroke={ACCENT} strokeWidth={1}
              opacity={t14PulseVal * 0.4} />
          </g>
        </svg>
      </div>

      {/* ---------- Caption bar ---------- */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 6 }}>
        {CAPTIONS.map((c, i) => {
          const op = fadeWindow(t, c.a, c.b, c.c, c.d);
          if (op <= 0.001) return null;
          return (
            <p key={i} style={{ position: "absolute", margin: 0, fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif", fontSize: 22, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center" }}>
              {c.text}
            </p>
          );
        })}
      </div>

      {/* ---------- Playback controls ---------- */}
      {!finished ? (
        <button type="button" onClick={onSkip} style={{
          position: "absolute", top: 14, right: 18,
          display: "flex", alignItems: "center", gap: 5,
          background: "rgba(255,255,255,0.9)", border: `1px solid ${LINE}`,
          borderRadius: 999, fontFamily: MONO, fontSize: 10.5,
          fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
          color: "#6b6b78", cursor: "pointer", padding: "7px 14px",
        }}>
          Skip video <span aria-hidden="true">→</span>
        </button>
      ) : (
        <div style={{ position: "absolute", bottom: 14, right: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <button type="button" onClick={replay} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 11, letterSpacing: 0.4, color: "#9a9aa8", cursor: "pointer", padding: 4 }}>
            ↻ replay
          </button>
          <button type="button" onClick={onComplete} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: ACCENT, border: "none", borderRadius: 8,
            fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
            letterSpacing: 0.6, textTransform: "uppercase",
            color: "#ffffff", cursor: "pointer", padding: "10px 18px",
            boxShadow: `0 8px 20px rgba(91,61,240,0.35)`,
          }}>
            Next step <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
