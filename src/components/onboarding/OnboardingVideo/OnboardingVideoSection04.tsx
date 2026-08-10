import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, SECTION 04 ONLY
   "...you can take that experience even further" → "...the better
   you can help them improve."

   Standalone, modular scene file for Section 04. Independently
   renderable — does NOT require Sections 01-03 to be mounted. Their
   visual language, timing philosophy and primitives are regenerated
   locally below (same shapes, no import-time dependency), matching
   how Sections 02/03 stayed self-contained from the sections before
   them.

   STORY: Sections 01-03 built up a single-operator story — your
   asset, your links, your one collaborator's results. Section 04 is
   the scale-up beat: the same visibility now extends across a whole
   roster of team members or clients, through a distinct product
   surface — Operator Mode. It closes on the idea that VSTRK doesn't
   just show numbers, it turns an operator's own experience into
   something they can actively teach with.

   PRODUCT GROUNDING (from Overview.tsx):
     - Overview.tsx confirms Operator Mode is a real, present-tense
       surface: an Operator Overview page listing team members
       (organization_members + profiles, Owner excluded), Team KPI
       cards (Members / Revenue / Conversions / Avg CVR), a Top
       Performers leaderboard, and a Recent Activity feed.
     - Per Overview.tsx's own header comment, revenue/conversions/CVR
       are wired to real member data but the VALUES are currently
       placeholder zeros — analytics attribution isn't finished yet.
       Recent Activity is explicitly still mock.
     - This file does NOT treat those zeros or that mock feed as real
       product behavior. It uses Overview.tsx only for direction:
       operator = a person overseeing a roster of members; the
       roster is org-membership based; the eventual shape of "what's
       real" is members -> content -> clicks/leads/revenue. The
       specific numbers used below (views, revenue, CVR, the two/
       three content-piece comparison) are illustrative VSL data
       invented for this scene, not sourced from Overview.tsx or any
       other file — per the brief, they must not imply the mock
       numbers currently in Overview.tsx are real.
     - Nothing here reproduces Overview.tsx's literal UI (KPI card
       grid, Top Performers list rows, Recent Activity feed). This is
       a cinematic abstraction of the *idea* of Operator Mode, not a
       recreation of the page.

   REUSED FROM SECTIONS 01-03 (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp / segOpacity / rangeOpacity  (timing math)
     - DrawLine, EyeNode, Fox, Person, Badge                          (visual primitives)
     - buildChain(), buildFanIn()                                     (node-chain / fan-in timing)
     - splitSentences()                                               (per-sentence caption + reveal timing)
     - the violet corner-tick Badge grammar from Section 02/03,
       reused here for the "Operator Mode" and "Your Experience"
       product-concept badges
     - the EyeNode "seeing" motif, used throughout as the visual
       spine for "what's actually happening"
     - the Fox motif from Section 01, reused once at the "your
       experience becomes more valuable" payoff beat

   NEW IN THIS FILE:
     - buildFanOut() — the hub-outward mirror of buildFanIn(): a line
       draws first, then a node opens at its tip. Used for the
       Operator Mode reveal (operator -> team/clients) and the CVR
       "why?" diagnostic fan, where the causal direction is the
       reverse of Section 03's fan-INTO-a-hub attribution beat.
     - Chip() — a small filled/outline/muted text pill, generalized
       enough to cover: the "what they say" quote chips, the "what's
       actually happening" metric tags, the content-chain tags
       (Content/Performance/Clicks/Leads/Revenue), the four teaching
       steps, and the CVR diagnostic tags. One primitive, five uses,
       matching the brief's instruction not to over-multiply new
       shapes.
     - Dot() — a tiny faint node used only for the loose "swarm"
       motif (course students / scattered unnoticed detail), kept
       deliberately abstract rather than a literal course UI.
     - ContentCard-style inline stat rows for the two-then-three
       content-piece comparison (S9/S10/S12), built from Chip + plain
       text rather than a new heavyweight component.

   NOT included on purpose (reserved for later sections / real
   product work): the literal Operator Overview page chrome, real
   KPI wiring, Top Performers ranking logic, Recent Activity feed,
   payouts/reconciliation. This section explains the *concept* of
   Operator Mode; it does not simulate the actual page.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — seventeen narration beats (one per exact sentence of the
   Section 04 script), played back to back with a 300ms cross-fade
   gap between each, same philosophy as Sections 01-03. Durations
   are sized to spoken length (~230-280ms/word, plus lead/tail
   margins) with deliberate extra headroom on beats that carry a
   multi-item visual reveal the audience needs time to actually read
   (S6's five-tag content chain, S14's four-step teaching list, S16's
   CVR-to-diagnosis turn) rather than just hear.
----------------------------------------------------------------- */
const GAP = 300;
const SEG_DURATIONS: [string, number][] = [
  ["S1", 4900],  // "And if you've already figured out... take that experience even further." (21 words)
  ["S2", 2600],  // "Maybe you want to help other businesses do the same." (10 words)
  ["S3", 3600],  // "Maybe you run a course teaching people how to build and grow a marketing agency." (15 words)
  ["S4", 3200],  // "Or maybe you simply have a marketing team working for your own business." (13 words)
  ["S5", 4200],  // "With Operator Mode, you can add team members or clients and see what they're actually doing." (16 words) — product reveal beat
  ["S6", 6600],  // "You can see the content they're publishing... most importantly, revenue." (18 words) — 5-tag reveal, extra headroom
  ["S7", 3800],  // "Because when you're helping someone, it's not enough to know what they say they're doing." (15 words)
  ["S8", 2200],  // "You want to see what's actually happening." (7 words)
  ["S9", 4400],  // "Maybe some content is exceeding your revenue expectations... but nobody noticed." (16 words)
  ["S10", 5200], // "Maybe other content is creating a lot of attention... moving the business forward." (20 words)
  ["S11", 4400], // "These are the small details... simply tells you what they're doing." (19 words)
  ["S12", 2600], // "But with more data, you can see the patterns." (9 words) — major transition beat
  ["S13", 2800], // "And that's where your experience becomes even more valuable." (9 words) — payoff beat
  ["S14", 6200], // "You can teach them how to recognize success... repeating what isn't." (19 words) — 4-step reveal, extra headroom
  ["S15", 3800], // "It's not just about abandoning content that didn't hit a 3% conversion rate." (13 words)
  ["S16", 5200], // "It's about understanding why it failed — and knowing what to do next." (13 words) — diagnostic fan, extra headroom
  ["S17", 5000], // "Because the better you can see what's happening, the better you can help them improve." (15 words) — final resolve
];
const SEG: Record<string, { start: number; end: number; dur: number }> = {};
{
  let cursor = 0;
  for (const [key, dur] of SEG_DURATIONS) {
    SEG[key] = { start: cursor, end: cursor + dur, dur };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S17.end + 600;

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

/* Sequential node chain — reused verbatim from Sections 01-03. */
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

/* N sources, each staggered, with a line drawing FROM that source
   INTO a shared center — reused from Sections 02/03. Used here for
   the "patterns" beat (three content pieces feeding into one
   insight) and the "experience becomes valuable" payoff. */
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

/* NEW — the hub-outward mirror of buildFanIn(): a line draws first,
   THEN a node opens at its tip. Used when the causal direction is
   "one thing reaches outward to many" rather than "many things feed
   one thing" — the Operator Mode reveal, and the CVR "why?" fan. */
function buildFanOut(rootStart: number, count: number, opts: { stagger: number; lineDraw: number; nodeOpen: number }) {
  const { stagger, lineDraw, nodeOpen } = opts;
  const spokes = [];
  for (let i = 0; i < count; i++) {
    const lineStart = rootStart + i * stagger;
    const lineEnd = lineStart + lineDraw;
    const nodeStart = lineEnd;
    const nodeEnd = nodeStart + nodeOpen;
    spokes.push({ line: { start: lineStart, end: lineEnd }, node: { start: nodeStart, end: nodeEnd } });
  }
  const end = Math.max(...spokes.map((s) => s.node.end));
  return { spokes, end };
}

/* Divides a beat's runtime across its sentences by word count —
   reused verbatim from Sections 01-03. Every Section 04 beat is a
   single exact sentence from the script, so this mainly supplies
   consistent lead/tail fade timing for the caption bar. */
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

/* ---------------- Visual primitives — regenerated from Sections 01-03 ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE, dash }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string; dash?: string }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray={dash ? dash : 1} strokeDashoffset={dash ? undefined : 1 - p} opacity={opacity * (dash ? p : 1)} />
  );
}

function EyeNode({ x, y, t, arriveStart, arriveEnd, label, labelSide = "right", mono = true, pulse = 0, opacity = 1, r = 5.5 }:
  {
    x: number; y: number; t: number; arriveStart: number; arriveEnd: number;
    label?: string; labelSide?: "left" | "right" | "center"; mono?: boolean; pulse?: number; opacity?: number; r?: number;
  }) {
  const openP = prog(t, arriveStart, arriveEnd);
  const eyeP = prog(t, arriveEnd, arriveEnd + 260);
  const baseGlow = clamp(openP) * (1 - 0.4 * (1 - eyeP));
  const glow = clamp(baseGlow + pulse, 0, 1.6);
  const ry = lerp(0.6, r * 0.56, eyeP);
  const labelX = labelSide === "right" ? x + r * 2.4 : labelSide === "left" ? x - r * 2.4 : x;
  const anchor = labelSide === "right" ? "start" : labelSide === "left" ? "end" : "middle";
  return (
    <g opacity={openP * opacity}>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={openP > 0.05 ? ACCENT : LINE} strokeWidth={1.2}
        style={{ filter: glow > 0.15 ? `drop-shadow(0 0 ${5 * glow}px ${ACCENT})` : "none" }} />
      <ellipse cx={x} cy={y} rx={r * 0.56} ry={ry} fill={ACCENT} opacity={eyeP} />
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

function Person({ x, y, size = 26, opacity = 1, emoji = "🧑" }: { x: number; y: number; size?: number; opacity?: number; emoji?: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} opacity={opacity}>{emoji}</text>
  );
}

/* Generalized violet corner-tick chip from Sections 02/03: marks a
   node as a first-class VSTRK concept. `filled` gives the badge a
   heavier, activated look. */
function Badge({ x, y, t, arriveStart, arriveEnd, label, scalePulse = 0, width = 96, filled = false }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; scalePulse?: number; width?: number; filled?: boolean }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const h = 28;
  const bx = x - width / 2, by = y - h / 2;
  const scale = lerp(0.85, 1, p) * (1 + 0.04 * scalePulse);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={14} fill={filled ? ACCENT : "#ffffff"} stroke={ACCENT} strokeWidth={1.3}
        style={{ filter: `drop-shadow(0 4px 10px rgba(91,61,240,0.2))` }} />
      {!filled && <path d={`M${bx + 2},${by + 2} l10,0 M${bx + 2},${by + 2} l0,10`} stroke={ACCENT} strokeWidth={1.3} strokeLinecap="round" fill="none" />}
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11}
        letterSpacing={1.1} fill={filled ? "#ffffff" : ACCENT} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

/* NEW — a small text pill. One primitive covers: "what they say"
   quote chips (muted), "what's actually happening" / content-chain
   tags (accent outline), teaching steps and CVR diagnosis tags
   (accent, some filled for emphasis). */
function Chip({ x, y, t, start, end, label, tone = "accent", width = 118, fontSize = 9.5 }:
  { x: number; y: number; t: number; start: number; end: number; label: string; tone?: "muted" | "accent" | "filled"; width?: number; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 24;
  const bx = x - width / 2, by = y - h / 2;
  const fill = tone === "filled" ? ACCENT : "#ffffff";
  const stroke = tone === "muted" ? LINE : ACCENT;
  const textFill = tone === "filled" ? "#ffffff" : tone === "muted" ? MUTED : ACCENT;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.1} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.4} fill={textFill}
        style={{ textTransform: tone === "muted" ? "none" : "uppercase" }}>{label}</text>
    </g>
  );
}

/* NEW — a single faint node for the loose "swarm" motif (many
   learners / scattered unnoticed detail), deliberately abstract. */
function Dot({ x, y, t, start, end, r = 3 }: { x: number; y: number; t: number; start: number; end: number; r?: number }) {
  const p = prog(t, start, end);
  return <circle cx={x} cy={y} r={r} fill={ACCENT} opacity={p * 0.5} />;
}

/* A small labeled stat row used inside the content-piece comparisons
   (S9/S10/S12) — label left, value right, dimmed unless highlighted. */
function StatRow({ x, y, label, value, t, start, end, highlight = 1 }:
  { x: number; y: number; label: string; value: string; t: number; start: number; end: number; highlight?: number }) {
  const p = prog(t, start, end);
  const op = 0.45 + 0.55 * highlight;
  return (
    <g opacity={p * op}>
      <text x={x} y={y} textAnchor="start" fontFamily={MONO} fontSize={9.5} fontWeight={700} letterSpacing={0.5} fill={MUTED}
        style={{ textTransform: "uppercase" }}>{label}</text>
      <text x={x + 108} y={y} textAnchor="start" fontFamily={MONO} fontSize={12} fontWeight={800} fill={highlight > 0.5 ? ACCENT : INK}>{value}</text>
    </g>
  );
}

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
================================================================= */

/* ---- S1 — your existing result system, taken further ---- */
const BIZ_NODE = { x: 480, y: 130 };
const S1_SENT = splitSentences(SEG.S1, ["And if you've already figured out how to generate revenue with your own business, you can take that experience even further."]);
const S1_NODE_IN = { start: SEG.S1.start + 150, end: SEG.S1.start + 650 };
const S1_BADGE_IN = { start: S1_NODE_IN.end + 120, end: S1_NODE_IN.end + 500 };
const S1_RING = { start: S1_BADGE_IN.end + 150, end: SEG.S1.end - 250 };

/* ---- S2 — other businesses enter the frame ---- */
const OTHER_A = { x: 300, y: 130 };
const OTHER_B = { x: 660, y: 130 };
const S2_SENT = splitSentences(SEG.S2, ["Maybe you want to help other businesses do the same."]);
const S2_A_IN = { start: SEG.S2.start + 150, end: SEG.S2.start + 450 };
const S2_B_IN = { start: S2_A_IN.end + 150, end: S2_A_IN.end + 450 };
const S2_LABEL_IN = { start: S2_B_IN.end + 120, end: S2_B_IN.end + 450 };

/* ---- S3 — teaching a course / growing an agency: a loose swarm ---- */
const SWARM_POINTS = [
  { x: 190, y: 260 }, { x: 290, y: 320 }, { x: 390, y: 250 }, { x: 480, y: 340 },
  { x: 570, y: 255 }, { x: 670, y: 325 }, { x: 770, y: 260 },
];
const S3_SENT = splitSentences(SEG.S3, ["Maybe you run a course teaching people how to build and grow a marketing agency."]);
const SWARM_IN = SWARM_POINTS.map((_, i) => ({ start: SEG.S3.start + 200 + i * 330, end: SEG.S3.start + 200 + i * 330 + 500 }));
const S3_LABEL_IN = { start: SEG.S3.end - 900, end: SEG.S3.end - 500 };

/* ---- S4 — or simply your own marketing team ---- */
const TEAM_ROW = [{ x: 350, y: 260 }, { x: 480, y: 260 }, { x: 610, y: 260 }];
const S4_SENT = splitSentences(SEG.S4, ["Or maybe you simply have a marketing team working for your own business."]);
const S4_TEAM_IN = TEAM_ROW.map((_, i) => ({ start: SEG.S4.start + 300 + i * 220, end: SEG.S4.start + 300 + i * 220 + 380 }));
const S4_LABEL_IN = { start: SEG.S4.end - 700, end: SEG.S4.end - 300 };

/* ---- S5 — the Operator Mode reveal (major product beat) ---- */
const OPERATOR_NODE = { x: 480, y: 120 };
const OPERATOR_TARGETS = [
  { x: 190, y: 290, label: "Team" }, { x: 390, y: 310, label: "Team" },
  { x: 580, y: 310, label: "Client" }, { x: 780, y: 290, label: "Client" },
];
const S5_SENT = splitSentences(SEG.S5, ["With Operator Mode, you can add team members or clients and see what they're actually doing."]);
const S5_BADGE_IN = { start: SEG.S5.start + 150, end: SEG.S5.start + 600 };
const S5_FAN = buildFanOut(S5_BADGE_IN.end + 150, OPERATOR_TARGETS.length, { stagger: 260, lineDraw: 280, nodeOpen: 260 });

/* ---- S6 — content chain: Content -> Performance -> Clicks -> Leads -> Revenue ---- */
const CHAIN_ITEMS = ["Content", "Performance", "Clicks", "Leads", "Revenue"];
const CHAIN_X = [110, 300, 490, 680, 860];
const CHAIN_Y = 440;
const S6_SENT = splitSentences(SEG.S6, ["You can see the content they're publishing, how it's performing, what's generating clicks, leads, and most importantly, revenue."]);
const S6_STAGGER = 950;
const S6_ITEMS_IN = CHAIN_ITEMS.map((_, i) => ({ start: SEG.S6.start + 350 + i * S6_STAGGER, end: SEG.S6.start + 350 + i * S6_STAGGER + 620 }));

/* ---- S7 — "what they say" ---- */
const SAY_TEXTS = ["Posting consistently", "Getting lots of engagement", "Growing the audience"];
const SAY_HEADING = { x: 300, y: 250 };
const SAY_CHIP_Y = [300, 340, 380];
const S7_SENT = splitSentences(SEG.S7, ["Because when you're helping someone, it's not enough to know what they say they're doing."]);
const S7_HEADING_IN = { start: SEG.S7.start + 100, end: SEG.S7.start + 400 };
const S7_CHIPS_IN = SAY_TEXTS.map((_, i) => ({ start: S7_HEADING_IN.end + 150 + i * 760, end: S7_HEADING_IN.end + 150 + i * 760 + 480 }));

/* ---- S8 — "what's actually happening" ---- */
const ACTUAL_TAGS = ["Clicks", "Leads", "Revenue", "Conversions"];
const ACTUAL_HEADING = { x: 660, y: 250 };
const ACTUAL_TAG_X = [560, 660, 760, 860];
const ACTUAL_TAG_Y = 340;
const S8_SENT = splitSentences(SEG.S8, ["You want to see what's actually happening."]);
const S8_HEADING_IN = { start: SEG.S8.start + 80, end: SEG.S8.start + 350 };
const S8_TAGS_IN = ACTUAL_TAGS.map((_, i) => ({ start: S8_HEADING_IN.end + 100 + i * 330, end: S8_HEADING_IN.end + 100 + i * 330 + 300 }));

/* ---- S9 — Content A: quietly exceeding expectations, unnoticed ---- */
const CARD_A = { x: 260, y: 300 };
const S9_SENT = splitSentences(SEG.S9, ["Maybe some content is exceeding your revenue expectations and deserves more attention \u2014 but nobody noticed."]);
const S9_CARD_IN = { start: SEG.S9.start + 150, end: SEG.S9.start + 480 };
const S9_VIEWS_IN = { start: S9_CARD_IN.end + 120, end: S9_CARD_IN.end + 120 + 380 };
const S9_REV_IN = { start: S9_VIEWS_IN.end + 120, end: S9_VIEWS_IN.end + 120 + 380 };
const S9_NOTICE_IN = { start: S9_REV_IN.end + 250, end: S9_REV_IN.end + 250 + 450 };

/* ---- S10 — Content B: lots of attention, hours to produce, weak impact ---- */
const CARD_B = { x: 700, y: 300 };
const S10_SENT = splitSentences(SEG.S10, ["Maybe other content is creating a lot of attention while taking hours to produce, without actually moving the business forward."]);
const S10_CARD_IN = { start: SEG.S10.start + 150, end: SEG.S10.start + 480 };
const S10_VIEWS_IN = { start: S10_CARD_IN.end + 120, end: S10_CARD_IN.end + 120 + 380 };
const S10_CLOCK_IN = { start: S10_VIEWS_IN.end + 120, end: S10_VIEWS_IN.end + 120 + 380 };
const S10_REV_IN = { start: S10_CLOCK_IN.end + 250, end: S10_CLOCK_IN.end + 250 + 380 };

/* ---- S11 — small details, hard to see one at a time ---- */
const S11_SENT = splitSentences(SEG.S11, ["These are the small details that are almost impossible to see when someone simply tells you what they're doing."]);
const HAZE_DOTS = [
  { x: 190, y: 260 }, { x: 230, y: 370 }, { x: 330, y: 240 }, { x: 630, y: 240 }, { x: 760, y: 260 }, { x: 740, y: 370 },
];
const HAZE_IN = HAZE_DOTS.map((_, i) => ({ start: SEG.S11.start + 300 + i * 220, end: SEG.S11.start + 300 + i * 220 + 500 }));

/* ---- S12 — zoom out: the pattern becomes visible (major transition) ---- */
const PATTERN_A = { x: 230, y: 150 };
const PATTERN_B = { x: 730, y: 150 };
const PATTERN_C = { x: 480, y: 230 };
const PATTERN_CENTER = { x: 480, y: 170 };
const S12_SENT = splitSentences(SEG.S12, ["But with more data, you can see the patterns."]);
const S12_A_IN = { start: SEG.S12.start + 100, end: SEG.S12.start + 350 };
const S12_B_IN = { start: S12_A_IN.end + 150, end: S12_A_IN.end + 500 };
const S12_C_IN = { start: S12_B_IN.end + 150, end: S12_B_IN.end + 500 };
const S12_LINES_IN = { start: S12_C_IN.end + 100, end: S12_C_IN.end + 550 };
const S12_LABEL_IN = { start: S12_LINES_IN.end + 50, end: S12_LINES_IN.end + 400 };

/* ---- S13 — the payoff: experience becomes more valuable ---- */
const EXPERIENCE_NODE = { x: 480, y: 420 };
const S13_SENT = splitSentences(SEG.S13, ["And that's where your experience becomes even more valuable."]);
const S13_LINES = [PATTERN_A, PATTERN_B, PATTERN_C].map((p, i) => ({ from: p, start: SEG.S13.start + 100 + i * 180, end: SEG.S13.start + 100 + i * 180 + 380 }));
const S13_LINES_END = Math.max(...S13_LINES.map((l) => l.end));
const S13_FOX_IN = { start: S13_LINES_END + 80, end: S13_LINES_END + 480 };
const S13_BADGE_IN = { start: S13_FOX_IN.end + 100, end: S13_FOX_IN.end + 480 };
const S13_PULSE = { start: S13_BADGE_IN.end, end: SEG.S13.end - 100 };

/* ---- S14 — teach them: recognize / recognize / capitalize / avoid ---- */
const TEACH_ITEMS = ["Recognize Success", "Recognize Failure", "Capitalize On What's Working", "Avoid Repeating What Isn't"];
const TEACH_X = 480;
const TEACH_Y = [150, 250, 350, 450];
const S14_SENT = splitSentences(SEG.S14, ["You can teach them how to recognize success, recognize failure, capitalize on what's working, and avoid repeating what isn't."]);
const S14_STAGGER = 1350;
const S14_ITEMS_IN = TEACH_ITEMS.map((_, i) => ({ start: SEG.S14.start + 300 + i * S14_STAGGER, end: SEG.S14.start + 300 + i * S14_STAGGER + 650 }));

/* ---- S15 — the 3% conversion-rate line ---- */
const CVR_CENTER = { x: 480, y: 240 };
const S15_SENT = splitSentences(SEG.S15, ["It's not just about abandoning content that didn't hit a 3% conversion rate."]);
const S15_NUM_IN = { start: SEG.S15.start + 250, end: SEG.S15.start + 750 };
const S15_LABEL_IN = { start: S15_NUM_IN.end + 100, end: S15_NUM_IN.end + 400 };

/* ---- S16 — the CVR line becomes a diagnostic question ---- */
const DIAG_TAGS = ["Low CTR?", "Wrong Audience?", "Weak Offer?"];
const DIAG_X = [230, 480, 730];
const DIAG_Y = 440;
const S16_SENT = splitSentences(SEG.S16, ["It's about understanding why it failed \u2014 and knowing what to do next."]);
const S16_SHRINK = { start: SEG.S16.start, end: SEG.S16.start + 350 };
const S16_ARROW_IN = { start: S16_SHRINK.end + 80, end: S16_SHRINK.end + 380 };
const S16_WHY_IN = { start: S16_ARROW_IN.end + 100, end: S16_ARROW_IN.end + 500 };
const S16_DIAG_FAN = buildFanOut(S16_WHY_IN.end + 150, DIAG_TAGS.length, { stagger: 280, lineDraw: 220, nodeOpen: 300 });

/* ---- S17 — final resolve: See -> Understand -> Improve ---- */
const RESOLVE_ITEMS = ["See", "Understand", "Improve"];
const RESOLVE_X = [230, 480, 730];
const RESOLVE_Y = 280;
const S17_SENT = splitSentences(SEG.S17, ["Because the better you can see what's happening, the better you can help them improve."]);
const S17_CHAIN = buildChain(SEG.S17.start + 200, RESOLVE_ITEMS.length, { lineDraw: 300, eyeOpen: 350, beatGap: 150, originOpen: 400 });
const S17_PULSE = { start: S17_CHAIN.end, end: SEG.S17.end - 350 };
const S17_FADE = { start: SEG.S17.end - 450, end: SEG.S17.end - 50 };

/* ---- Captions — exact, unabridged narration, sentence-for-sentence. ---- */
const CAPTIONS = [
  ...S1_SENT, ...S2_SENT, ...S3_SENT, ...S4_SENT, ...S5_SENT, ...S6_SENT, ...S7_SENT, ...S8_SENT,
  ...S9_SENT, ...S10_SENT, ...S11_SENT, ...S12_SENT, ...S13_SENT, ...S14_SENT, ...S15_SENT, ...S16_SENT, ...S17_SENT,
];

export interface OnboardingVideoSection04Props {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingVideoSection04({ onSkip, onComplete }: OnboardingVideoSection04Props = {}) {
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

  /* ---------------- Group opacities (contiguous visual scenes) ---------------- */
  const introOpacity = rangeOpacity(t, "S1", "S4");
  const operatorOpacity = rangeOpacity(t, "S5", "S8");
  const examplesOpacity = rangeOpacity(t, "S9", "S11");
  const patternOpacity = rangeOpacity(t, "S12", "S13");
  const teachOpacity = segOpacity(t, "S14");
  const cvrOpacity = rangeOpacity(t, "S15", "S16");
  const finalOpacity = segOpacity(t, "S17");
  const finalFadeOut = t > S17_FADE.start ? 1 - prog(t, S17_FADE.start, S17_FADE.end) : 1;

  /* ---------------- S1 — your business, taken further ---------------- */
  const s1RingP = t > S1_RING.start && t < S1_RING.end ? prog(t, S1_RING.start, S1_RING.end) : (t >= S1_RING.end ? 1 : 0);
  const s1RingOpacity = fadeWindow(t, S1_RING.start, S1_RING.start + 300, S1_RING.end - 200, S1_RING.end);

  /* ---------------- S2 — other businesses ---------------- */
  const s2LabelOpacity = fadeWindow(t, S2_LABEL_IN.start, S2_LABEL_IN.end, SEG.S2.end - 250, SEG.S2.end);

  /* ---------------- S3 — swarm ---------------- */
  const swarmGroupOpacity = fadeWindow(t, SEG.S3.start, SEG.S3.start + 200, SEG.S4.start + 400, SEG.S4.start + 800);
  const s3LabelOpacity = fadeWindow(t, S3_LABEL_IN.start, S3_LABEL_IN.end, SEG.S3.end - 150, SEG.S3.end);

  /* ---------------- S4 — team row ---------------- */
  const s4LabelOpacity = fadeWindow(t, S4_LABEL_IN.start, S4_LABEL_IN.end, SEG.S4.end - 150, SEG.S4.end);
  const teamRowOpacity = rangeOpacity(t, "S4", "S8", 250);

  /* ---------------- S5 — Operator Mode reveal ---------------- */
  const s5BadgePulse = t > S5_BADGE_IN.end && t < S5_BADGE_IN.end + 600 ? Math.sin(prog(t, S5_BADGE_IN.end, S5_BADGE_IN.end + 600) * Math.PI) : 0;
  const operatorBadgeOpacity = rangeOpacity(t, "S5", "S8", 250);

  /* ---------------- S7/S8 — say vs. actual ---------------- */
  const sayOpacity = fadeWindow(t, S7_HEADING_IN.start, S7_HEADING_IN.end, SEG.S8.start + 100, SEG.S8.start + 500);
  const actualOpacity = fadeWindow(t, S8_HEADING_IN.start, S8_HEADING_IN.end, SEG.S8.end - 150, SEG.S8.end);

  /* ---------------- S9 — Content A ---------------- */
  const s9RevPulse = t > S9_NOTICE_IN.start && t < S9_NOTICE_IN.start + 900 ? Math.sin(prog(t, S9_NOTICE_IN.start, S9_NOTICE_IN.start + 900) * Math.PI) : 0;

  /* ---------------- S11 — hard-to-see detail ---------------- */
  const s11Dim = 1 - 0.4 * fadeWindow(t, SEG.S11.start + 150, SEG.S11.start + 600, SEG.S11.end - 500, SEG.S11.end);

  /* ---------------- S13 — pulse on Your Experience badge ---------------- */
  const s13Pulse = t > S13_PULSE.start && t < S13_PULSE.end ? Math.sin(prog(t, S13_PULSE.start, S13_PULSE.end) * Math.PI) : 0;

  /* ---------------- S16 — CVR shrink + why fan ---------------- */
  const s16ShrinkP = prog(t, S16_SHRINK.start, S16_SHRINK.end);
  const cvrScale = lerp(1, 0.72, t > SEG.S16.start ? s16ShrinkP : 0);
  const cvrYOffset = lerp(0, -46, t > SEG.S16.start ? s16ShrinkP : 0);

  /* ---------------- S17 — final resolve ---------------- */
  const s17PulseVal = t > S17_PULSE.start && t < S17_PULSE.end ? Math.sin(prog(t, S17_PULSE.start, S17_PULSE.end) * Math.PI) : 0;

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1-S4 — from your business to your team ================= */}
          <g opacity={introOpacity}>
            {/* ---------- S1 — your business, expanding outward ---------- */}
            <circle cx={BIZ_NODE.x} cy={BIZ_NODE.y} r={14 + s1RingP * 46} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s1RingOpacity * 0.5} />
            <EyeNode x={BIZ_NODE.x} y={BIZ_NODE.y} t={t} arriveStart={S1_NODE_IN.start} arriveEnd={S1_NODE_IN.end} label="Your Business" labelSide="center" />
            <Badge x={BIZ_NODE.x} y={BIZ_NODE.y - 40} t={t} arriveStart={S1_BADGE_IN.start} arriveEnd={S1_BADGE_IN.end} label="Revenue" width={90} />

            {/* ---------- S2 — other businesses ---------- */}
            <DrawLine d={`M${BIZ_NODE.x - 16},${BIZ_NODE.y} L${OTHER_A.x + 16},${OTHER_A.y}`} t={t} start={S2_A_IN.start} end={S2_A_IN.end} width={1} color={ACCENT} opacity={0.55} />
            <DrawLine d={`M${BIZ_NODE.x + 16},${BIZ_NODE.y} L${OTHER_B.x - 16},${OTHER_B.y}`} t={t} start={S2_B_IN.start} end={S2_B_IN.end} width={1} color={ACCENT} opacity={0.55} />
            <EyeNode x={OTHER_A.x} y={OTHER_A.y} t={t} arriveStart={S2_A_IN.start} arriveEnd={S2_A_IN.end} r={4.6} />
            <EyeNode x={OTHER_B.x} y={OTHER_B.y} t={t} arriveStart={S2_B_IN.start} arriveEnd={S2_B_IN.end} r={4.6} />
            <text x={BIZ_NODE.x} y={BIZ_NODE.y + 34} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.8} fill={ACCENT}
              opacity={s2LabelOpacity} style={{ textTransform: "uppercase" }}>Other Businesses</text>

            {/* ---------- S3 — teaching a course: a loose swarm ---------- */}
            <g opacity={swarmGroupOpacity}>
              {SWARM_POINTS.map((p, i) => (
                <Dot key={`swarm-${i}`} x={p.x} y={p.y} t={t} start={SWARM_IN[i].start} end={SWARM_IN[i].end} r={3.4} />
              ))}
              <text x={480} y={225} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.8} fill={ACCENT}
                opacity={s3LabelOpacity} style={{ textTransform: "uppercase" }}>Teaching Others To Build Agencies</text>
            </g>

            {/* ---------- S4 — or simply your own team ---------- */}
            <g opacity={teamRowOpacity}>
              {TEAM_ROW.map((p, i) => (
                <React.Fragment key={`team-${i}`}>
                  <DrawLine d={`M${BIZ_NODE.x},${BIZ_NODE.y + 14} L${p.x},${p.y - 16}`} t={t} start={S4_TEAM_IN[i].start - 150} end={S4_TEAM_IN[i].start} width={1} opacity={0.5} />
                  <Person x={p.x} y={p.y} size={24} opacity={prog(t, S4_TEAM_IN[i].start, S4_TEAM_IN[i].end)} />
                </React.Fragment>
              ))}
              <text x={480} y={300} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.8} fill={ACCENT}
                opacity={s4LabelOpacity} style={{ textTransform: "uppercase" }}>Your Team</text>
            </g>
          </g>

          {/* ================= S5-S8 — Operator Mode: content, "say" vs. "actual" ================= */}
          <g opacity={operatorOpacity}>
            {/* ---------- S5 — Operator Mode reveal ---------- */}
            <EyeNode x={OPERATOR_NODE.x} y={OPERATOR_NODE.y} t={t} arriveStart={SEG.S5.start + 60} arriveEnd={SEG.S5.start + 360} label="Operator" labelSide="center" />
            <Badge x={OPERATOR_NODE.x} y={OPERATOR_NODE.y - 40} t={t} arriveStart={S5_BADGE_IN.start} arriveEnd={S5_BADGE_IN.end}
              label="Operator Mode" width={168} filled scalePulse={s5BadgePulse} />
            <g opacity={operatorBadgeOpacity}>
              {OPERATOR_TARGETS.map((p, i) => {
                const spoke = S5_FAN.spokes[i];
                return (
                  <React.Fragment key={`opfan-${i}`}>
                    <DrawLine d={`M${OPERATOR_NODE.x},${OPERATOR_NODE.y + 16} L${p.x},${p.y - 18}`} t={t} start={spoke.line.start} end={spoke.line.end} width={1.1} color={ACCENT} opacity={0.6} />
                    <Person x={p.x} y={p.y} size={24} opacity={prog(t, spoke.node.start, spoke.node.end)} />
                    <text x={p.x} y={p.y + 22} textAnchor="middle" fontFamily={MONO} fontSize={8.5} fontWeight={700} letterSpacing={0.6} fill={MUTED}
                      opacity={prog(t, spoke.node.start, spoke.node.end) * 0.85} style={{ textTransform: "uppercase" }}>{p.label}</text>
                  </React.Fragment>
                );
              })}
            </g>

            {/* ---------- S6 — content chain ---------- */}
            <g opacity={segOpacity(t, "S6")}>
              {CHAIN_ITEMS.map((label, i) => {
                const win = S6_ITEMS_IN[i];
                return (
                  <React.Fragment key={`chain-${i}`}>
                    {i > 0 && (
                      <DrawLine d={`M${CHAIN_X[i - 1] + 58},${CHAIN_Y} L${CHAIN_X[i] - 58},${CHAIN_Y}`} t={t} start={win.start - 260} end={win.start} width={1} color={ACCENT} opacity={0.5} />
                    )}
                    <Chip x={CHAIN_X[i]} y={CHAIN_Y} t={t} start={win.start} end={win.end} label={label} tone={i === 4 ? "filled" : "accent"} width={120} />
                  </React.Fragment>
                );
              })}
            </g>

            {/* ---------- S7 — what they say ---------- */}
            <g opacity={sayOpacity}>
              <text x={SAY_HEADING.x} y={SAY_HEADING.y} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fontWeight={800} letterSpacing={1} fill={MUTED}
                opacity={prog(t, S7_HEADING_IN.start, S7_HEADING_IN.end)} style={{ textTransform: "uppercase" }}>What They Say</text>
              {SAY_TEXTS.map((label, i) => (
                <Chip key={`say-${i}`} x={SAY_HEADING.x} y={SAY_CHIP_Y[i]} t={t} start={S7_CHIPS_IN[i].start} end={S7_CHIPS_IN[i].end} label={label} tone="muted" width={196} />
              ))}
            </g>

            {/* ---------- S8 — what's actually happening ---------- */}
            <g opacity={actualOpacity}>
              <text x={ACTUAL_HEADING.x} y={ACTUAL_HEADING.y} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fontWeight={800} letterSpacing={1} fill={ACCENT}
                opacity={prog(t, S8_HEADING_IN.start, S8_HEADING_IN.end)} style={{ textTransform: "uppercase" }}>What's Actually Happening</text>
              {ACTUAL_TAGS.map((label, i) => (
                <Chip key={`actual-${i}`} x={ACTUAL_TAG_X[i]} y={ACTUAL_TAG_Y} t={t} start={S8_TAGS_IN[i].start} end={S8_TAGS_IN[i].end} label={label} tone="accent" width={94} />
              ))}
            </g>
          </g>

          {/* ================= S9-S11 — two content pieces, easy to miss ================= */}
          <g opacity={examplesOpacity * s11Dim}>
            {/* ---------- S9 — Content A: quiet outperformer ---------- */}
            <g opacity={prog(t, S9_CARD_IN.start, S9_CARD_IN.end)}>
              <rect x={CARD_A.x - 100} y={CARD_A.y - 68} width={200} height={140} rx={12} fill="none" stroke={LINE} strokeWidth={1} />
              <text x={CARD_A.x} y={CARD_A.y - 42} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fontWeight={800} letterSpacing={0.8} fill={INK}
                style={{ textTransform: "uppercase" }}>Content A</text>
              <StatRow x={CARD_A.x - 78} y={CARD_A.y - 6} label="Views" value="4,200" t={t} start={S9_VIEWS_IN.start} end={S9_VIEWS_IN.end} highlight={0.3} />
              <StatRow x={CARD_A.x - 78} y={CARD_A.y + 24} label="Revenue" value="$2,650" t={t} start={S9_REV_IN.start} end={S9_REV_IN.end} highlight={1} />
              <circle cx={CARD_A.x + 78} cy={CARD_A.y + 24} r={5 + s9RevPulse * 5} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s9RevPulse * 0.6} />
              <text x={CARD_A.x} y={CARD_A.y + 56} textAnchor="middle" fontFamily={MONO} fontSize={9} fontWeight={700} letterSpacing={0.5} fill={MUTED}
                opacity={prog(t, S9_NOTICE_IN.start, S9_NOTICE_IN.end)}>— unnoticed</text>
            </g>

            {/* ---------- S10 — Content B: attention without impact ---------- */}
            <g opacity={prog(t, S10_CARD_IN.start, S10_CARD_IN.end)}>
              <rect x={CARD_B.x - 100} y={CARD_B.y - 68} width={200} height={140} rx={12} fill="none" stroke={LINE} strokeWidth={1} />
              <text x={CARD_B.x} y={CARD_B.y - 42} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fontWeight={800} letterSpacing={0.8} fill={INK}
                style={{ textTransform: "uppercase" }}>Content B</text>
              <StatRow x={CARD_B.x - 78} y={CARD_B.y - 6} label="Views" value="58,000" t={t} start={S10_VIEWS_IN.start} end={S10_VIEWS_IN.end} highlight={1} />
              <StatRow x={CARD_B.x - 78} y={CARD_B.y + 24} label="Revenue" value="$310" t={t} start={S10_REV_IN.start} end={S10_REV_IN.end} highlight={0.2} />
              <text x={CARD_B.x} y={CARD_B.y + 56} textAnchor="middle" fontFamily={MONO} fontSize={9} fontWeight={700} letterSpacing={0.5} fill={MUTED}
                opacity={prog(t, S10_CLOCK_IN.start, S10_CLOCK_IN.end)}>⏱ hours to produce</text>
            </g>

            {/* ---------- S11 — the small details, scattered ---------- */}
            {HAZE_DOTS.map((p, i) => (
              <Dot key={`haze-${i}`} x={p.x} y={p.y} t={t} start={HAZE_IN[i].start} end={HAZE_IN[i].end} r={2.4} />
            ))}
          </g>

          {/* ================= S12-S13 — the pattern, and the payoff ================= */}
          <g opacity={patternOpacity}>
            {/* ---------- S12 — zoom out: the pattern ---------- */}
            <EyeNode x={PATTERN_A.x} y={PATTERN_A.y} t={t} arriveStart={S12_A_IN.start} arriveEnd={S12_A_IN.end} label="A" labelSide="left" r={4.6} />
            <EyeNode x={PATTERN_B.x} y={PATTERN_B.y} t={t} arriveStart={S12_B_IN.start} arriveEnd={S12_B_IN.end} label="B" labelSide="right" r={4.6} />
            <EyeNode x={PATTERN_C.x} y={PATTERN_C.y} t={t} arriveStart={S12_C_IN.start} arriveEnd={S12_C_IN.end} label="C" labelSide="center" r={4.6} />
            <DrawLine d={`M${PATTERN_A.x},${PATTERN_A.y} L${PATTERN_B.x},${PATTERN_B.y} L${PATTERN_C.x},${PATTERN_C.y} Z`} t={t} start={S12_LINES_IN.start} end={S12_LINES_IN.end}
              width={1} color={ACCENT} dash="4 6" />
            <text x={PATTERN_CENTER.x} y={PATTERN_CENTER.y} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1.4} fill={ACCENT}
              opacity={prog(t, S12_LABEL_IN.start, S12_LABEL_IN.end)} style={{ textTransform: "uppercase" }}>Pattern</text>

            {/* ---------- S13 — data flows into experience ---------- */}
            {S13_LINES.map((l, i) => (
              <DrawLine key={`s13-line-${i}`} d={`M${l.from.x},${l.from.y} L${EXPERIENCE_NODE.x},${EXPERIENCE_NODE.y - 20}`} t={t} start={l.start} end={l.end} width={1} color={ACCENT} opacity={0.55} />
            ))}
            <Fox x={EXPERIENCE_NODE.x} y={EXPERIENCE_NODE.y} size={30} opacity={prog(t, S13_FOX_IN.start, S13_FOX_IN.end)} breathe={t - S13_FOX_IN.start} />
            <Badge x={EXPERIENCE_NODE.x} y={EXPERIENCE_NODE.y + 36} t={t} arriveStart={S13_BADGE_IN.start} arriveEnd={S13_BADGE_IN.end}
              label="Your Experience" width={168} filled scalePulse={s13Pulse} />
          </g>

          {/* ================= S14 — teach them what to do with it ================= */}
          <g opacity={teachOpacity}>
            {TEACH_ITEMS.map((label, i) => (
              <React.Fragment key={`teach-${i}`}>
                {i > 0 && (
                  <DrawLine d={`M${TEACH_X},${TEACH_Y[i - 1] + 16} L${TEACH_X},${TEACH_Y[i] - 16}`} t={t} start={S14_ITEMS_IN[i].start - 300} end={S14_ITEMS_IN[i].start} width={1} color={ACCENT} opacity={0.5} />
                )}
                <Chip x={TEACH_X} y={TEACH_Y[i]} t={t} start={S14_ITEMS_IN[i].start} end={S14_ITEMS_IN[i].end} label={label}
                  tone={i < 2 ? "accent" : "filled"} width={i < 2 ? 180 : 300} />
              </React.Fragment>
            ))}
          </g>

          {/* ================= S15-S16 — from a metric to a diagnosis ================= */}
          <g opacity={cvrOpacity}>
            <g style={{ transformOrigin: `${CVR_CENTER.x}px ${CVR_CENTER.y}px`, transform: `translate(0px, ${cvrYOffset}px) scale(${cvrScale})` }}>
              <text x={CVR_CENTER.x} y={CVR_CENTER.y} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={46} fill={INK}
                opacity={prog(t, S15_NUM_IN.start, S15_NUM_IN.end)}>2.7%</text>
              <text x={CVR_CENTER.x} y={CVR_CENTER.y + 30} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={1.4} fill={MUTED}
                opacity={prog(t, S15_LABEL_IN.start, S15_LABEL_IN.end)} style={{ textTransform: "uppercase" }}>Conversion Rate</text>
            </g>

            <DrawLine d={`M${CVR_CENTER.x},${CVR_CENTER.y + 60} L${CVR_CENTER.x},${CVR_CENTER.y + 130}`} t={t} start={S16_ARROW_IN.start} end={S16_ARROW_IN.end} width={1.3} color={ACCENT} />
            <text x={CVR_CENTER.x} y={CVR_CENTER.y + 168} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={22} letterSpacing={1} fill={ACCENT}
              opacity={prog(t, S16_WHY_IN.start, S16_WHY_IN.end)} style={{ textTransform: "uppercase" }}>Why?</text>

            {DIAG_TAGS.map((label, i) => {
              const spoke = S16_DIAG_FAN.spokes[i];
              return (
                <React.Fragment key={`diag-${i}`}>
                  <DrawLine d={`M${CVR_CENTER.x},${CVR_CENTER.y + 190} L${DIAG_X[i]},${DIAG_Y - 16}`} t={t} start={spoke.line.start} end={spoke.line.end} width={1} color={ACCENT} opacity={0.5} />
                  <Chip x={DIAG_X[i]} y={DIAG_Y} t={t} start={spoke.node.start} end={spoke.node.end} label={label} tone="muted" width={148} />
                </React.Fragment>
              );
            })}
          </g>

          {/* ================= S17 — See, understand, improve ================= */}
          <g opacity={finalOpacity}>
            {RESOLVE_ITEMS.map((label, i) => {
              const arrive = S17_CHAIN.arrive[i];
              return (
                <React.Fragment key={`resolve-${i}`}>
                  {i > 0 && (
                    <DrawLine d={`M${RESOLVE_X[i - 1] + 62},${RESOLVE_Y} L${RESOLVE_X[i] - 62},${RESOLVE_Y}`} t={t} start={S17_CHAIN.lines[i - 1].start} end={S17_CHAIN.lines[i - 1].end} width={1.1} color={ACCENT} />
                  )}
                  <Chip x={RESOLVE_X[i]} y={RESOLVE_Y} t={t} start={arrive.start} end={arrive.end} label={label} tone={i === 2 ? "filled" : "accent"} width={140} fontSize={11} />
                  {i === 2 && (
                    <circle cx={RESOLVE_X[i]} cy={RESOLVE_Y} r={22 + s17PulseVal * 26} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s17PulseVal * 0.45} />
                  )}
                </React.Fragment>
              );
            })}
          </g>
        </svg>
      </div>

      {/* ---------- Caption bar ---------- */}
      <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 6 }}>
        {CAPTIONS.map((c, i) => {
          const op = fadeWindow(t, c.a, c.b, c.c, c.d);
          if (op <= 0.001) return null;
          return (
            <p key={i} style={{
              position: "absolute", margin: 0, fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
              fontSize: 22, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center",
              whiteSpace: "pre-line", lineHeight: 1.35,
            }}>
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
