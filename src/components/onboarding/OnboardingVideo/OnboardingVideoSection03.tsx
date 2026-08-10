import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, SECTION 03 ONLY
   "What if you're working with other people?" → "...compare them
   based on the results."

   Standalone, modular scene file for Section 03. Independently
   renderable — does NOT require Section 01 or Section 02 to be
   mounted. Their visual language, timing philosophy and primitives
   are regenerated locally below (same shapes, no import-time
   dependency), matching how Section 02 stayed self-contained from
   Section 01.

   STORY: Section 02 showed one Asset being promoted by a network of
   content. Section 03 expands that from "multiple pieces of content"
   to "multiple PEOPLE promoting the same Asset" — and shows that
   VSTRK measures who is actually driving results, rather than who
   simply has the most views.

   PRODUCT GROUNDING (from Marketplace.tsx):
     - A Sponsor creates an ASSIGNMENT and assigns an Asset (plus a
       custom tracking domain) to a Marketer/Collaborator.
     - The Marketer accepts an INVITATION.
     - Acceptance turns that Assignment into a PROMOTION, owned by
       the Marketer, still tied back to the Assignment/Asset.
     - Each Promotion gets its own tracking link, and every
       click/conversion/purchase against that link attributes back
       to that specific Promotion.
     This file visualizes exactly that chain — Asset -> Assignment ->
     Promotion -> tracking link -> attributed results — without
     inventing a different workflow, and without reproducing the
     literal Marketplace UI (tabs, archive, cards) since this is a
     cinematic explainer, not a product tutorial.

   REUSED FROM SECTIONS 01/02 (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp        (timing math)
     - DrawLine, EyeNode, Fox                  (visual primitives)
     - buildChain(), buildFanIn()               (node-chain / fan-in timing)
     - splitSentences()                        (per-sentence caption + reveal timing)
     - segOpacity() / rangeOpacity()            (segment fade helpers)
     - the violet corner-tick chip primitive Section 02 introduced as
       AssetBadge, generalized here into Badge() so it can also carry
       the "Promotion" label — same visual grammar marking a node as
       a first-class VSTRK product concept
     - the 🔗 tracking-link spark beat from Section 01
     - the ripple/echo motif from Section 02's reuse-loop beat, reused
       here for "use that strategy across the rest of your team"

   NEW IN THIS FILE:
     - StatBar — a small horizontal bar + count-up numeric readout,
       used only for the Marketer A vs. Marketer B comparison. Two
       bars per metric row (one per marketer), each row's bars scaled
       against that row's own max so Views/Purchases/Revenue all read
       clearly despite very different magnitudes.
     - A grouped-bar comparison layout (Views / Purchases / Revenue
       rows, A vs. B) that lets the section shift visual emphasis
       from the Views row to the Revenue row as the narration does —
       the same numbers, re-framed, rather than a new chart appearing.

   NOT included on purpose (reserved for later sections):
     Operator role, Workspace-level analytics, campaign elements,
     revenue reconciliation/payouts, dispute handling — nothing here
     contradicts Marketplace.tsx, it's a deliberately narrower slice
     of it.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — twenty narration beats, played back to back with a short
   300ms cross-fade gap between each. Durations are sized to the
   spoken length of each beat's exact sentence(s) (~230ms/word, plus
   lead/tail margins), same philosophy as Sections 01/02. The
   Marketer A/B reveal beats (S13/S14) and the comparison beats
   (S15/S16/S17) carry deliberate extra headroom beyond their word
   count — the brief is explicit that the audience needs time to
   actually read the numbers, not just hear the sentence.
----------------------------------------------------------------- */
const GAP = 300;
const SEG_DURATIONS: [string, number][] = [
  ["S1", 2700],  // "What if you're working with other people?" (8 words)
  ["S2", 7700],  // 3 sentences / 28 words: agency / sponsor+influencers / team
  ["S3", 5000],  // "With VSTRK, you can turn your sales page... into an asset." (17 words)
  ["S4", 5800],  // "Then you can create an assignment... custom tracking domain." (19 words) — key beat
  ["S5", 2200],  // "The marketer accepts the invitation." (5 words)
  ["S6", 2800],  // "That assignment becomes a Promotion." (5 words) — key beat
  ["S7", 2700],  // "And they get their own unique tracking link." (8 words)
  ["S8", 4600],  // "Now every click, conversion, and sale can be traced back to that specific promotion." (14 words)
  ["S9", 3900],  // "And from your side, you can see exactly what every marketer is doing." (13 words)
  ["S10", 4300], // 4 sentences / 11 words: clicks / conversions / purchases / revenue
  ["S11", 2300], // "And compare them side by side." (6 words)
  ["S12", 3000], // "For example, imagine two marketers promoting the same asset." (9 words)
  ["S13", 4600], // "Marketer A might generate: 21,500 views / 17 purchases / $3,400 in revenue." — reading time for 3 numbers
  ["S14", 4600], // "While Marketer B generates: 130,000 views / 11 purchases / $2,200 in revenue."
  ["S15", 3500], // "Marketer B got more than six times the views." (9 words)
  ["S16", 4600], // "But Marketer A generated more revenue — despite reaching a fraction of the audience." (13 words)
  ["S17", 3700], // "Now you can see exactly who is moving the needle." (10 words)
  ["S18", 6600], // "And when someone is performing exceptionally well... rest of your team." (25 words)
  ["S19", 3200], // "Imagine having multiple marketers or influencers promoting the same asset." (10 words)
  ["S20", 4900], // "Instead of guessing who is actually performing, you can compare them based on the results." (15 words)
];
const SEG: Record<string, { start: number; end: number; dur: number }> = {};
{
  let cursor = 0;
  for (const [key, dur] of SEG_DURATIONS) {
    SEG[key] = { start: cursor, end: cursor + dur, dur };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S20.end + 600;

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

/* Sequential node chain — reused verbatim from Sections 01/02. */
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

/* N sources, each with its own staggered arrival, followed by a line
   drawing FROM that source INTO a shared center — reused from
   Section 02. */
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

/* Divides a beat's runtime across its sentences by word count —
   reused verbatim from Sections 01/02. Newlines inside a "sentence"
   (used for the Marketer A/B number reveals) count as whitespace for
   word-count purposes, so timing still scales with how much there is
   to read. */
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

/* ---------------- Visual primitives — regenerated from Sections 01/02 ---------------- */

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

/* Person/collaborator node — same emoji-as-hand-drawn-icon grammar as
   Fox and the 🔗 link spark. Used for the marketer/collaborator that
   enters the story in this section. */
function Person({ x, y, size = 26, opacity = 1, emoji = "🧑" }: { x: number; y: number; size?: number; opacity?: number; emoji?: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} opacity={opacity}>{emoji}</text>
  );
}

/* Generalized from Section 02's AssetBadge: a small chip that marks a
   node as a first-class VSTRK concept. `filled` gives Promotion (the
   concept this section introduces) a heavier, more activated look
   than Asset's plain outline chip, so the two stay visually distinct
   even though they share the same grammar. */
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

/* NEW — a single comparison-row bar: label on the left, a track +
   filled bar scaled to (value / rowMax), and a count-up numeric
   readout. Used only for the Marketer A vs. B hero comparison. */
function StatBar({
  x, y, trackWidth, t, start, end, value, rowMax, color, formatter, highlight = 1,
}: {
  x: number; y: number; trackWidth: number; t: number; start: number; end: number;
  value: number; rowMax: number; color: string; formatter: (n: number) => string; highlight?: number;
}) {
  const p = prog(t, start, end);
  const eased = 1 - Math.pow(1 - p, 2);
  const w = trackWidth * (value / rowMax) * eased;
  const shown = Math.round(value * eased);
  const opacity = 0.35 + 0.65 * highlight;
  return (
    <g opacity={opacity}>
      <rect x={x} y={y - 6} width={trackWidth} height={12} rx={6} fill="none" stroke={LINE} strokeWidth={1} />
      <rect x={x} y={y - 6} width={Math.max(0, w)} height={12} rx={6} fill={color} opacity={p > 0.01 ? 1 : 0} />
      <text x={x + trackWidth + 12} y={y} dy="0.34em" fontFamily={MONO} fontSize={11.5} fontWeight={700} fill={INK} opacity={p}>
        {formatter(shown)}
      </text>
    </g>
  );
}

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
================================================================= */

/* ---- S1-S2 — a collaborator enters the story ---- */
const COLLAB = { x: 480, y: 190 };
const ASSET_ECHO = { x: 480, y: 400 };
const S1_SENT = splitSentences(SEG.S1, ["What if you're working with other people?"]);
const S1_PERSON_IN = { start: SEG.S1.start + 250, end: SEG.S1.start + 650 };
const S1_ECHO_IN = { start: SEG.S1.start + 60, end: SEG.S1.start + 380 };

const S2_SENT = splitSentences(SEG.S2, [
  "Maybe you want to hire a marketing agency.",
  "Maybe you're a sponsor working with influencers.",
  "Or maybe you simply have someone on your team doing marketing for you.",
]);
const S2_LABELS = ["Agency", "Sponsor", "Team Member"];

/* ---- S3 — sales page / URL becomes an Asset ---- */
const URL_NODE = { x: 250, y: 120 };
const ASSET_NODE = { x: 480, y: 190 };
const S3_SENT = splitSentences(SEG.S3, ["With VSTRK, you can turn your sales page \u2014 or practically anything with a URL \u2014 into an asset."]);
const S3_URL_IN = { start: SEG.S3.start + 150, end: SEG.S3.start + 480 };
const S3_LINE = { start: S3_URL_IN.end + 80, end: S3_URL_IN.end + 80 + 320 };
const S3_ASSET_IN = { start: S3_LINE.end, end: S3_LINE.end + 260 };
const S3_BADGE_IN = { start: S3_ASSET_IN.end + 120, end: S3_ASSET_IN.end + 120 + 400 };

/* ---- S4 — Assignment: Asset + custom domain -> Assignment -> Marketer ---- */
const DOMAIN_CHIP = { x: 700, y: 190 };
const ASSIGNMENT_NODE = { x: 480, y: 300 };
const MARKETER_NODE = { x: 480, y: 430 };
const S4_SENT = splitSentences(SEG.S4, ["Then you can create an assignment and assign that asset to a marketer, along with your custom tracking domain."]);
const S4_DOMAIN_IN = { start: SEG.S4.start + 150, end: SEG.S4.start + 500 };
const S4_LINE_A = { start: S4_DOMAIN_IN.end + 60, end: S4_DOMAIN_IN.end + 60 + 260 }; // asset -> assignment
const S4_LINE_D = { start: S4_LINE_A.start, end: S4_LINE_A.end }; // domain -> assignment (parallel)
const S4_ASSIGNMENT_IN = { start: S4_LINE_A.end, end: S4_LINE_A.end + 300 };
const S4_LINE_M = { start: S4_ASSIGNMENT_IN.end + 60, end: S4_ASSIGNMENT_IN.end + 60 + 260 };
const S4_MARKETER_IN = { start: S4_LINE_M.end, end: S4_LINE_M.end + 300 };

/* ---- S5 — invitation pending -> accepted ---- */
const S5_SENT = splitSentences(SEG.S5, ["The marketer accepts the invitation."]);
const S5_PENDING = { start: SEG.S5.start + 80, end: SEG.S5.start + 350 };
const S5_ACCEPT = { start: SEG.S5.start + 1200, end: SEG.S5.start + 1550 };

/* ---- S6 — Assignment becomes a Promotion (key beat) ---- */
const S6_SENT = splitSentences(SEG.S6, ["That assignment becomes a Promotion."]);
const S6_MORPH = { start: SEG.S6.start + 300, end: SEG.S6.start + 900 };
const S6_PULSE = { start: S6_MORPH.end, end: S6_MORPH.end + 700 };

/* ---- S7 — unique tracking link ---- */
const S7_SENT = splitSentences(SEG.S7, ["And they get their own unique tracking link."]);
const S7_SPARK = { start: SEG.S7.start + 300, end: SEG.S7.end - 300 };

/* ---- S8 — attribution: click / conversion / purchase trace back to the Promotion ---- */
const PROMO_HUB = { x: 480, y: 350 };
const S8_EVENTS = [
  { x: 250, y: 130, label: "Click" },
  { x: 480, y: 90, label: "Conversion" },
  { x: 710, y: 130, label: "Purchase" },
];
const S8_SENT = splitSentences(SEG.S8, ["Now every click, conversion, and sale can be traced back to that specific promotion."]);
const S8_FAN = buildFanIn(SEG.S8.start + 250, S8_EVENTS.length, { nodeStagger: 420, nodeOpen: 220, lineDraw: 340 });

/* ---- S9 — owner's perspective: pull back to a wider view ---- */
const S9_SENT = splitSentences(SEG.S9, ["And from your side, you can see exactly what every marketer is doing."]);
const OWNER_EYE = { x: 480, y: 90 };
const CARD_A = { x: 300, y: 260 };
const CARD_B = { x: 660, y: 260 };
const S9_EYE_IN = { start: SEG.S9.start + 120, end: SEG.S9.start + 420 };
const S9_CARD_A_IN = { start: SEG.S9.start + 600, end: SEG.S9.start + 900 };
const S9_CARD_B_IN = { start: SEG.S9.start + 900, end: SEG.S9.start + 1200 };

/* ---- S10 — clicks / conversions / purchases / revenue tags ---- */
const S10_SENT = splitSentences(SEG.S10, ["You can see their clicks.", "Their conversions.", "Their purchases.", "Their revenue."], { pause: 260 });
const S10_METRICS = ["Clicks", "Conversions", "Purchases", "Revenue"];
const S10_METRIC_X = [180, 380, 580, 780];

/* ---- S11 — pivot into the side-by-side comparison ---- */
const S11_SENT = splitSentences(SEG.S11, ["And compare them side by side."]);

/* ---- S12 — introduce the two-marketer example ---- */
const S12_SENT = splitSentences(SEG.S12, ["For example, imagine two marketers promoting the same asset."]);
const HEADER_A = { x: 300, y: 90 };
const HEADER_B = { x: 660, y: 90 };
const S12_A_IN = { start: SEG.S12.start + 200, end: SEG.S12.start + 550 };
const S12_B_IN = { start: SEG.S12.start + 700, end: SEG.S12.start + 1050 };

/* ---- Comparison layout — grouped bars, one row per metric ---- */
const ROW_LABEL_X = 30;
const BAR_X = 190;
const BAR_TRACK_WIDTH = 460;
const ROW_VIEWS_Y = 180;
const ROW_PURCH_Y = 300;
const ROW_REV_Y = 420;
const BAR_A_OFFSET = -14;
const BAR_B_OFFSET = 14;

const MARKETER_A = { views: 21500, purchases: 17, revenue: 3400 };
const MARKETER_B = { views: 130000, purchases: 11, revenue: 2200 };
const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtMoney = (n: number) => `$${n.toLocaleString("en-US")}`;

/* ---- S13/S14 — Marketer A then Marketer B reveal ---- */
const S13_SENT = splitSentences(SEG.S13, ["Marketer A might generate:\n21,500 views\n17 purchases\n$3,400 in revenue"]);
const S13_VIEWS_IN = { start: SEG.S13.start + 250, end: SEG.S13.start + 900 };
const S13_PURCH_IN = { start: S13_VIEWS_IN.end + 80, end: S13_VIEWS_IN.end + 80 + 700 };
const S13_REV_IN = { start: S13_PURCH_IN.end + 80, end: S13_PURCH_IN.end + 80 + 700 };

const S14_SENT = splitSentences(SEG.S14, ["While Marketer B generates:\n130,000 views\n11 purchases\n$2,200 in revenue"]);
const S14_VIEWS_IN = { start: SEG.S14.start + 250, end: SEG.S14.start + 900 };
const S14_PURCH_IN = { start: S14_VIEWS_IN.end + 80, end: S14_VIEWS_IN.end + 80 + 700 };
const S14_REV_IN = { start: S14_PURCH_IN.end + 80, end: S14_PURCH_IN.end + 80 + 700 };

/* Both marketers' bars are fully drawn by the end of S14; all later
   beats (S15-S17) only change which ROW is visually emphasized. */
const BARS_DRAWN_AT = S14_REV_IN.end;

/* ---- S15 — emphasize the Views row (B dwarfs A) ---- */
const S15_SENT = splitSentences(SEG.S15, ["Marketer B got more than six times the views."]);
const S15_TAG_IN = { start: SEG.S15.start + 600, end: SEG.S15.start + 1000 };

/* ---- S16 — emphasis flips to the Revenue row (A wins) ---- */
const S16_SENT = splitSentences(SEG.S16, ["But Marketer A generated more revenue \u2014 despite reaching a fraction of the audience."]);
const S16_TAG_IN = { start: SEG.S16.start + 900, end: SEG.S16.start + 1300 };

/* ---- S17 — resolution: who's moving the needle ---- */
const S17_SENT = splitSentences(SEG.S17, ["Now you can see exactly who is moving the needle."]);
const S17_LABEL_IN = { start: SEG.S17.start + 400, end: SEG.S17.start + 800 };

/* Emphasis driver: 0 = neutral (both rows equal weight), used before
   S15. From S15 the Views row is emphasized; from S16 onward the
   Revenue row is emphasized instead — the same bars, re-framed. */
function rowHighlight(t: number, row: "views" | "purchases" | "revenue") {
  const inViewsPhase = t >= SEG.S15.start && t < SEG.S16.start;
  const inRevenuePhase = t >= SEG.S16.start;
  if (row === "views") {
    if (inViewsPhase) return 1;
    if (inRevenuePhase) return 0.35;
    return 0.75;
  }
  if (row === "revenue") {
    if (inRevenuePhase) return 1;
    if (inViewsPhase) return 0.35;
    return 0.75;
  }
  // purchases row stays legible throughout, slightly dimmed only
  // while Views is being called out
  return inViewsPhase ? 0.5 : 0.75;
}

/* ---- S18 — scale the winning strategy across the team ---- */
const S18_SENT = splitSentences(SEG.S18, ["And when someone is performing exceptionally well, you can look at what they're doing differently \u2014 and use that strategy across the rest of your team."]);
const S18_TEAM = [
  { x: 180, y: 480 },
  { x: 480, y: 500 },
  { x: 780, y: 480 },
];
const S18_ECHO = { start: SEG.S18.start + 400, end: SEG.S18.end - 400 };
const S18_TEAM_FAN = buildFanIn(SEG.S18.start + 700, S18_TEAM.length, { nodeStagger: 500, nodeOpen: 220, lineDraw: 320 });

/* ---- S19 — pull back: multiple marketers/influencers around the same Asset ---- */
const NET_CENTER = { x: 480, y: 280 };
const NET_PROMOTERS = [
  { x: 130, y: 160, label: "Promotion" },
  { x: 330, y: 70, label: "Promotion" },
  { x: 630, y: 70, label: "Promotion" },
  { x: 830, y: 160, label: "Promotion" },
];
const NET_FAN = buildFanIn(SEG.S19.start + 150, NET_PROMOTERS.length, { nodeStagger: 320, nodeOpen: 220, lineDraw: 280 });
const S19_SENT = splitSentences(SEG.S19, ["Imagine having multiple marketers or influencers promoting the same asset."]);

/* ---- S20 — closing resolve ---- */
const S20_SENT = splitSentences(SEG.S20, ["Instead of guessing who is actually performing, you can compare them based on the results."]);
const S20_PULSE = { start: SEG.S20.start + 400, end: SEG.S20.end - 500 };
const S20_FADE = { start: SEG.S20.end - 450, end: SEG.S20.end - 50 };

/* ---- Captions — exact, unabridged narration, sentence-for-sentence. ---- */
const CAPTIONS = [
  ...S1_SENT, ...S2_SENT, ...S3_SENT, ...S4_SENT, ...S5_SENT, ...S6_SENT, ...S7_SENT, ...S8_SENT, ...S9_SENT,
  ...S10_SENT, ...S11_SENT, ...S12_SENT, ...S13_SENT, ...S14_SENT, ...S15_SENT, ...S16_SENT, ...S17_SENT,
  ...S18_SENT, ...S19_SENT, ...S20_SENT,
];

export interface OnboardingVideoSection03Props {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingVideoSection03({ onSkip, onComplete }: OnboardingVideoSection03Props = {}) {
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

  /* ---------------- S1-S2 — collaborator enters ---------------- */
  const s12Opacity = rangeOpacity(t, "S1", "S2");
  const echoOpacity = fadeWindow(t, S1_ECHO_IN.start, S1_ECHO_IN.end, SEG.S2.end - 400, SEG.S2.end) * 0.4;
  const collabLabel = t < S2_SENT[0].start ? null : t < S2_SENT[1].start ? S2_LABELS[0] : t < S2_SENT[2].start ? S2_LABELS[1] : S2_LABELS[2];
  const collabLabelOpacity = fadeWindow(t, SEG.S2.start + 100, SEG.S2.start + 400, SEG.S2.end - 300, SEG.S2.end);

  /* ---------------- S3 — URL -> Asset ---------------- */
  const s3Opacity = segOpacity(t, "S3");
  const s3UrlOpacity = prog(t, S3_URL_IN.start, S3_URL_IN.end);
  const s3BadgePulse = t > S3_BADGE_IN.end && t < S3_BADGE_IN.end + 700
    ? Math.sin(prog(t, S3_BADGE_IN.end, S3_BADGE_IN.end + 700) * Math.PI) : 0;

  /* ---------------- S4 — Assignment ---------------- */
  const s4Opacity = segOpacity(t, "S4");
  const s4DomainOpacity = prog(t, S4_DOMAIN_IN.start, S4_DOMAIN_IN.end);

  /* Once the Assignment exists it persists (with its Asset/Domain
     tributaries) through S5, fading only once it visually becomes the
     Promotion badge in S6. */
  const assignmentSceneOpacity = rangeOpacity(t, "S3", "S6");

  /* ---------------- S5 — pending -> accepted ---------------- */
  const s5Opacity = segOpacity(t, "S5");
  const s5PendingOpacity = fadeWindow(t, S5_PENDING.start, S5_PENDING.end, S5_ACCEPT.start, S5_ACCEPT.start + 150);
  const s5AcceptOpacity = fadeWindow(t, S5_ACCEPT.start, S5_ACCEPT.end, SEG.S5.end - 200, SEG.S5.end);

  /* ---------------- S6 — Promotion morph ---------------- */
  const s6Opacity = segOpacity(t, "S6");
  const s6AssignmentFade = 1 - prog(t, S6_MORPH.start, S6_MORPH.end);
  const s6PromoScalePulse = t > S6_PULSE.start && t < S6_PULSE.end ? Math.sin(prog(t, S6_PULSE.start, S6_PULSE.end) * Math.PI) : 0;
  const promotionBadgeOpacity = rangeOpacity(t, "S6", "S8");

  /* ---------------- S7 — tracking link spark ---------------- */
  const s7Opacity = segOpacity(t, "S7");
  const s7Spark = t > S7_SPARK.start && t < S7_SPARK.end ? Math.sin(prog(t, S7_SPARK.start, S7_SPARK.end) * Math.PI) : 0;

  /* ---------------- S8 — attribution fan-in ---------------- */
  const s8Opacity = segOpacity(t, "S8");

  /* ---------------- S9 — owner pivot ---------------- */
  const s9Opacity = segOpacity(t, "S9");
  const s9EyeOpacity = prog(t, S9_EYE_IN.start, S9_EYE_IN.end);

  /* ---------------- S9-S17 — the comparison stage persists once the two cards land ---------------- */
  const comparisonSceneOpacity = rangeOpacity(t, "S9", "S17");

  /* ---------------- S10 — metric tags ---------------- */
  const s10Opacity = segOpacity(t, "S10");

  /* ---------------- S12 — marketer headers ---------------- */
  const s12HeaderOpacity = rangeOpacity(t, "S12", "S17");

  /* ---------------- S13/S14 — bar reveals (persist through the resolution beats) ---------------- */
  const barsOpacity = rangeOpacity(t, "S13", "S17");
  const highlightViews = rowHighlight(t, "views");
  const highlightPurch = rowHighlight(t, "purchases");
  const highlightRev = rowHighlight(t, "revenue");

  /* ---------------- S15/S16 — emphasis tags ---------------- */
  const s15TagOpacity = fadeWindow(t, S15_TAG_IN.start, S15_TAG_IN.end, SEG.S16.start - 100, SEG.S16.start + 150);
  const s16TagOpacity = fadeWindow(t, S16_TAG_IN.start, S16_TAG_IN.end, SEG.S17.end - 300, SEG.S17.end);

  /* ---------------- S17 — resolution label ---------------- */
  const s17LabelOpacity = fadeWindow(t, S17_LABEL_IN.start, S17_LABEL_IN.end, SEG.S17.end - 200, SEG.S17.end);

  /* ---------------- S18 — scale the strategy ---------------- */
  const s18Opacity = segOpacity(t, "S18");
  const s18EchoOpacity = fadeWindow(t, S18_ECHO.start, S18_ECHO.start + 300, S18_ECHO.end - 300, S18_ECHO.end) * 0.5;

  /* ---------------- S19-S20 — network of promotions around the Asset ---------------- */
  const networkOpacity = rangeOpacity(t, "S19", "S20");
  const s20PulseVal = t > S20_PULSE.start && t < S20_PULSE.end ? Math.sin(prog(t, S20_PULSE.start, S20_PULSE.end) * Math.PI) : 0;
  const finalFadeOut = t > S20_FADE.start ? 1 - prog(t, S20_FADE.start, S20_FADE.end) : 1;

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ---------- S1-S2 — a collaborator enters ---------- */}
          <g opacity={s12Opacity}>
            <g opacity={echoOpacity}>
              <circle cx={ASSET_ECHO.x} cy={ASSET_ECHO.y} r={7} fill="none" stroke={ACCENT} strokeWidth={1} />
              <text x={ASSET_ECHO.x} y={ASSET_ECHO.y + 26} textAnchor="middle" fontFamily={MONO} fontSize={9.5} letterSpacing={0.8} fill={ACCENT}
                style={{ textTransform: "uppercase" }}>Your Asset</text>
            </g>
            <EyeNode x={COLLAB.x} y={COLLAB.y} t={t} arriveStart={S1_PERSON_IN.start} arriveEnd={S1_PERSON_IN.end} />
            <g opacity={collabLabelOpacity}>
              {collabLabel && (
                <text x={COLLAB.x} y={COLLAB.y - 34} textAnchor="middle" fontFamily={MONO} fontSize={11.5} fontWeight={700} letterSpacing={0.8} fill={ACCENT}
                  style={{ textTransform: "uppercase" }}>{collabLabel}</text>
              )}
            </g>
          </g>

          {/* ---------- S3-S6 — Asset + custom domain -> Assignment -> Promotion ---------- */}
          <g opacity={assignmentSceneOpacity}>
            <g opacity={s3Opacity}>
              <Person x={URL_NODE.x} y={URL_NODE.y - 18} size={0} opacity={0} />
              <text x={URL_NODE.x} y={URL_NODE.y} textAnchor="middle" dominantBaseline="middle" fontSize={13} opacity={s3UrlOpacity}>🔗</text>
              <text x={URL_NODE.x} y={URL_NODE.y + 22} textAnchor="middle" fontFamily={MONO} fontSize={9.5} letterSpacing={0.5} fill={INK}
                opacity={s3UrlOpacity * 0.75} style={{ textTransform: "uppercase" }}>Sales Page</text>
              <DrawLine d={`M${URL_NODE.x + 14},${URL_NODE.y + 6} Q ${(URL_NODE.x + ASSET_NODE.x) / 2},${URL_NODE.y + 40} ${ASSET_NODE.x - 14},${ASSET_NODE.y - 4}`}
                t={t} start={S3_LINE.start} end={S3_LINE.end} width={1.2} color={ACCENT} />
            </g>

            <EyeNode x={ASSET_NODE.x} y={ASSET_NODE.y} t={t} arriveStart={S3_ASSET_IN.start} arriveEnd={S3_ASSET_IN.end} label="Asset" labelSide="left" />
            <Badge x={ASSET_NODE.x} y={ASSET_NODE.y - 32} t={t} arriveStart={S3_BADGE_IN.start} arriveEnd={S3_BADGE_IN.end} label="Asset" width={70} scalePulse={s3BadgePulse} />

            <g opacity={s4Opacity}>
              <text x={DOMAIN_CHIP.x} y={DOMAIN_CHIP.y} textAnchor="middle" dominantBaseline="middle" fontSize={13} opacity={s4DomainOpacity}>🌐</text>
              <text x={DOMAIN_CHIP.x} y={DOMAIN_CHIP.y + 22} textAnchor="middle" fontFamily={MONO} fontSize={9.5} letterSpacing={0.5} fill={INK}
                opacity={s4DomainOpacity * 0.75} style={{ textTransform: "uppercase" }}>Custom Domain</text>
            </g>

            <DrawLine d={`M${ASSET_NODE.x},${ASSET_NODE.y + 12} L${ASSIGNMENT_NODE.x - 6},${ASSIGNMENT_NODE.y - 26}`} t={t} start={S4_LINE_A.start} end={S4_LINE_A.end} width={1.2} color={ACCENT} />
            <DrawLine d={`M${DOMAIN_CHIP.x},${DOMAIN_CHIP.y + 12} L${ASSIGNMENT_NODE.x + 6},${ASSIGNMENT_NODE.y - 26}`} t={t} start={S4_LINE_D.start} end={S4_LINE_D.end} width={1.2} color={ACCENT} />

            {/* Assignment node — fades out as it morphs into the Promotion badge in S6 */}
            <g opacity={s6AssignmentFade}>
              <EyeNode x={ASSIGNMENT_NODE.x} y={ASSIGNMENT_NODE.y} t={t} arriveStart={S4_ASSIGNMENT_IN.start} arriveEnd={S4_ASSIGNMENT_IN.end} />
              <Badge x={ASSIGNMENT_NODE.x} y={ASSIGNMENT_NODE.y - 34} t={t} arriveStart={S4_ASSIGNMENT_IN.start} arriveEnd={S4_ASSIGNMENT_IN.start + 400} label="Assignment" width={104} />
            </g>

            <DrawLine d={`M${ASSIGNMENT_NODE.x},${ASSIGNMENT_NODE.y + 12} L${MARKETER_NODE.x},${MARKETER_NODE.y - 20}`} t={t} start={S4_LINE_M.start} end={S4_LINE_M.end} width={1.2} />
            <Person x={MARKETER_NODE.x} y={MARKETER_NODE.y} size={26} opacity={prog(t, S4_MARKETER_IN.start, S4_MARKETER_IN.end)} />
            <text x={MARKETER_NODE.x} y={MARKETER_NODE.y + 26} textAnchor="middle" fontFamily={MONO} fontSize={10} letterSpacing={0.6} fill={INK}
              opacity={prog(t, S4_MARKETER_IN.start, S4_MARKETER_IN.end) * 0.8} style={{ textTransform: "uppercase" }}>Marketer</text>

            {/* ---------- S5 — pending -> accepted ---------- */}
            <g opacity={s5Opacity}>
              <text x={MARKETER_NODE.x + 60} y={MARKETER_NODE.y} textAnchor="start" fontFamily={MONO} fontSize={9.5} fontWeight={800} letterSpacing={0.8} fill={MUTED}
                opacity={s5PendingOpacity} style={{ textTransform: "uppercase" }}>Pending</text>
              <text x={MARKETER_NODE.x + 60} y={MARKETER_NODE.y} textAnchor="start" fontFamily={MONO} fontSize={9.5} fontWeight={800} letterSpacing={0.8} fill={ACCENT}
                opacity={s5AcceptOpacity} style={{ textTransform: "uppercase" }}>✓ Accepted</text>
            </g>

            {/* ---------- S6 — Promotion badge (replaces the Assignment node) ---------- */}
            <g opacity={promotionBadgeOpacity}>
              <Badge x={ASSIGNMENT_NODE.x} y={ASSIGNMENT_NODE.y - 4} t={t} arriveStart={S6_MORPH.start} arriveEnd={S6_MORPH.end}
                label="Promotion" width={128} filled scalePulse={s6PromoScalePulse} />
            </g>

            {/* ---------- S7 — tracking link spark ---------- */}
            <g opacity={s7Opacity}>
              <g style={{ transformOrigin: `${ASSIGNMENT_NODE.x + 90}px ${ASSIGNMENT_NODE.y - 4}px`, transform: `scale(${1 + 0.3 * s7Spark})` }}>
                <text x={ASSIGNMENT_NODE.x + 90} y={ASSIGNMENT_NODE.y - 4} textAnchor="middle" dominantBaseline="middle" fontSize={22}
                  style={{ filter: s7Spark > 0.1 ? `drop-shadow(0 0 ${8 * s7Spark}px ${ACCENT})` : "none" }}>🔗</text>
              </g>
            </g>
          </g>

          {/* ---------- S8 — attribution: click / conversion / purchase trace back ---------- */}
          <g opacity={s8Opacity}>
            {S8_EVENTS.map((ev, i) => {
              const fan = S8_FAN.sources[i];
              return (
                <React.Fragment key={`s8-${i}`}>
                  <DrawLine d={`M${ev.x},${ev.y} L${PROMO_HUB.x},${PROMO_HUB.y}`} t={t} start={fan.line.start} end={fan.line.end} width={1.1} color={ACCENT} />
                  <EyeNode x={ev.x} y={ev.y} t={t} arriveStart={fan.node.start} arriveEnd={fan.node.end} label={ev.label} labelSide={ev.x < PROMO_HUB.x ? "left" : ev.x > PROMO_HUB.x ? "right" : "center"} />
                </React.Fragment>
              );
            })}
            <Badge x={PROMO_HUB.x} y={PROMO_HUB.y} t={t} arriveStart={SEG.S8.start + 100} arriveEnd={SEG.S8.start + 500} label="Promotion" width={128} filled />
          </g>

          {/* ---------- S9-S17 — owner perspective + the comparison stage ---------- */}
          <g opacity={comparisonSceneOpacity}>
            <g opacity={s9Opacity}>
              <g opacity={s9EyeOpacity}>
                <circle cx={OWNER_EYE.x} cy={OWNER_EYE.y} r={5.5} fill="#fff" stroke={ACCENT} strokeWidth={1.2} />
                <ellipse cx={OWNER_EYE.x} cy={OWNER_EYE.y} rx={3.1} ry={3.1} fill={ACCENT} />
                <text x={OWNER_EYE.x} y={OWNER_EYE.y - 16} textAnchor="middle" fontFamily={MONO} fontSize={9.5} letterSpacing={0.8} fill={ACCENT}
                  opacity={s9EyeOpacity} style={{ textTransform: "uppercase" }}>Your view</text>
              </g>
            </g>

            {/* Two placeholder promotion cards land during S9, then relabel as Marketer A/B headers from S12 */}
            <g opacity={prog(t, S9_CARD_A_IN.start, S9_CARD_A_IN.end)}>
              <rect x={CARD_A.x - 90} y={CARD_A.y - 22} width={180} height={44} rx={10} fill="none" stroke={LINE} strokeWidth={1} />
            </g>
            <g opacity={prog(t, S9_CARD_B_IN.start, S9_CARD_B_IN.end)}>
              <rect x={CARD_B.x - 90} y={CARD_B.y - 22} width={180} height={44} rx={10} fill="none" stroke={LINE} strokeWidth={1} />
            </g>

            {/* ---------- S10 — clicks / conversions / purchases / revenue tags ---------- */}
            <g opacity={s10Opacity}>
              {S10_METRICS.map((m, i) => {
                const win = S10_SENT[i];
                const op = fadeWindow(t, win.start, win.start + 220, SEG.S10.end - 200, SEG.S10.end);
                return (
                  <text key={`metric-${i}`} x={S10_METRIC_X[i]} y={40} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1} fill={ACCENT}
                    opacity={op} style={{ textTransform: "uppercase" }}>{m}</text>
                );
              })}
            </g>

            {/* ---------- S12 — Marketer A / Marketer B headers ---------- */}
            <g opacity={s12HeaderOpacity}>
              <text x={HEADER_A.x} y={HEADER_A.y} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={16} letterSpacing={1} fill={INK}
                opacity={prog(t, S12_A_IN.start, S12_A_IN.end)} style={{ textTransform: "uppercase" }}>Marketer A</text>
              <text x={HEADER_B.x} y={HEADER_B.y} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={16} letterSpacing={1} fill={INK}
                opacity={prog(t, S12_B_IN.start, S12_B_IN.end)} style={{ textTransform: "uppercase" }}>Marketer B</text>
              <text x={480} y={90} textAnchor="middle" fontFamily={MONO} fontSize={11} fill={MUTED}
                opacity={prog(t, S12_B_IN.start, S12_B_IN.end)}>vs</text>
            </g>

            {/* ---------- S13-S17 — grouped comparison bars ---------- */}
            <g opacity={barsOpacity}>
              <text x={ROW_LABEL_X} y={ROW_VIEWS_Y} dy="0.34em" fontFamily={MONO} fontSize={10.5} fontWeight={800} letterSpacing={0.8} fill={INK}
                opacity={highlightViews} style={{ textTransform: "uppercase" }}>Views</text>
              <StatBar x={BAR_X} y={ROW_VIEWS_Y + BAR_A_OFFSET} trackWidth={BAR_TRACK_WIDTH} t={t} start={S13_VIEWS_IN.start} end={S13_VIEWS_IN.end}
                value={MARKETER_A.views} rowMax={MARKETER_B.views} color={ACCENT} formatter={fmtInt} highlight={highlightViews} />
              <StatBar x={BAR_X} y={ROW_VIEWS_Y + BAR_B_OFFSET} trackWidth={BAR_TRACK_WIDTH} t={t} start={S14_VIEWS_IN.start} end={S14_VIEWS_IN.end}
                value={MARKETER_B.views} rowMax={MARKETER_B.views} color={MUTED} formatter={fmtInt} highlight={highlightViews} />

              <text x={ROW_LABEL_X} y={ROW_PURCH_Y} dy="0.34em" fontFamily={MONO} fontSize={10.5} fontWeight={800} letterSpacing={0.8} fill={INK}
                opacity={highlightPurch} style={{ textTransform: "uppercase" }}>Purchases</text>
              <StatBar x={BAR_X} y={ROW_PURCH_Y + BAR_A_OFFSET} trackWidth={BAR_TRACK_WIDTH} t={t} start={S13_PURCH_IN.start} end={S13_PURCH_IN.end}
                value={MARKETER_A.purchases} rowMax={MARKETER_A.purchases} color={ACCENT} formatter={fmtInt} highlight={highlightPurch} />
              <StatBar x={BAR_X} y={ROW_PURCH_Y + BAR_B_OFFSET} trackWidth={BAR_TRACK_WIDTH} t={t} start={S14_PURCH_IN.start} end={S14_PURCH_IN.end}
                value={MARKETER_B.purchases} rowMax={MARKETER_A.purchases} color={MUTED} formatter={fmtInt} highlight={highlightPurch} />

              <text x={ROW_LABEL_X} y={ROW_REV_Y} dy="0.34em" fontFamily={MONO} fontSize={10.5} fontWeight={800} letterSpacing={0.8} fill={INK}
                opacity={highlightRev} style={{ textTransform: "uppercase" }}>Revenue</text>
              <StatBar x={BAR_X} y={ROW_REV_Y + BAR_A_OFFSET} trackWidth={BAR_TRACK_WIDTH} t={t} start={S13_REV_IN.start} end={S13_REV_IN.end}
                value={MARKETER_A.revenue} rowMax={MARKETER_A.revenue} color={ACCENT} formatter={fmtMoney} highlight={highlightRev} />
              <StatBar x={BAR_X} y={ROW_REV_Y + BAR_B_OFFSET} trackWidth={BAR_TRACK_WIDTH} t={t} start={S14_REV_IN.start} end={S14_REV_IN.end}
                value={MARKETER_B.revenue} rowMax={MARKETER_A.revenue} color={MUTED} formatter={fmtMoney} highlight={highlightRev} />
            </g>

            {/* ---------- S15 — "six times the views" emphasis tag ---------- */}
            <g opacity={s15TagOpacity}>
              <text x={BAR_X + BAR_TRACK_WIDTH + 70} y={ROW_VIEWS_Y} dy="0.34em" textAnchor="start" fontFamily={MONO} fontWeight={800} fontSize={12} letterSpacing={0.6} fill={ACCENT}>
                6x the views
              </text>
            </g>

            {/* ---------- S16 — revenue-emphasis tag ---------- */}
            <g opacity={s16TagOpacity}>
              <text x={BAR_X + BAR_TRACK_WIDTH + 70} y={ROW_REV_Y} dy="0.34em" textAnchor="start" fontFamily={MONO} fontWeight={800} fontSize={12} letterSpacing={0.6} fill={ACCENT}>
                more revenue
              </text>
            </g>

            {/* ---------- S17 — resolution label under Marketer A ---------- */}
            <g opacity={s17LabelOpacity}>
              <text x={HEADER_A.x} y={ROW_REV_Y + 46} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11.5} letterSpacing={0.8} fill={ACCENT}
                style={{ textTransform: "uppercase" }}>Moving the needle</text>
            </g>
          </g>

          {/* ---------- S18 — scale the winning strategy across the team ---------- */}
          <g opacity={s18Opacity}>
            <circle cx={HEADER_A.x} cy={ROW_REV_Y} r={30} fill="none" stroke={ACCENT} strokeWidth={1} strokeDasharray="3 5" opacity={s18EchoOpacity} />
            {S18_TEAM.map((p, i) => {
              const fan = S18_TEAM_FAN.sources[i];
              return (
                <React.Fragment key={`s18-${i}`}>
                  <DrawLine d={`M${HEADER_A.x},${ROW_REV_Y} L${p.x},${p.y}`} t={t} start={fan.line.start} end={fan.line.end} width={1} color={ACCENT} opacity={0.6} />
                  <Person x={p.x} y={p.y} size={20} opacity={prog(t, fan.node.start, fan.node.end)} />
                </React.Fragment>
              );
            })}
          </g>

          {/* ---------- S19-S20 — pull back: multiple promotions around the same Asset ---------- */}
          <g opacity={networkOpacity}>
            <EyeNode x={NET_CENTER.x} y={NET_CENTER.y} t={t} arriveStart={SEG.S19.start} arriveEnd={SEG.S19.start + 200} label="Asset" labelSide="center" />
            {NET_PROMOTERS.map((n, i) => {
              const fan = NET_FAN.sources[i];
              return (
                <React.Fragment key={`net-${i}`}>
                  <DrawLine d={`M${n.x},${n.y} L${NET_CENTER.x},${NET_CENTER.y}`} t={t} start={fan.line.start} end={fan.line.end} width={1.1} />
                  <EyeNode x={n.x} y={n.y} t={t} arriveStart={fan.node.start} arriveEnd={fan.node.end} label={n.label} labelSide={n.x < NET_CENTER.x ? "left" : "right"} />
                </React.Fragment>
              );
            })}
            <circle cx={NET_CENTER.x} cy={NET_CENTER.y} r={14 + s20PulseVal * 40} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s20PulseVal * 0.4} />
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
