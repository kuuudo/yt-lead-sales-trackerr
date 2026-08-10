import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, SECTION 05 ONLY
   "Data can tell different stories" → "VSTRK grows with you."

   Standalone, modular scene file for Section 05. Independently
   renderable — does NOT require Sections 01-04 to be mounted. It
   regenerates the same visual language, primitives and timing
   philosophy locally (no import-time dependency), exactly the way
   Section 04 stayed self-contained from the sections before it.

   STORY: Section 04 closed on "operator mode" — seeing what a whole
   roster is actually doing. Section 05 hands that same lens back to
   the individual operator and reframes Workspace as a visual
   investigation board: you don't collect more data, you pull out
   the specific views that answer the specific question you're
   asking right now. It walks through four example questions
   (who's really working harder, is the content evergreen, how
   platform-dependent am I, which days actually make money), then
   resolves on the idea that Workspace declutters down to only what
   answers today's question, and grows with the business.

   PRODUCT GROUNDING (per the brief supplied alongside Workspace.tsx,
   WorkspaceHub.tsx and DashboardWidget.tsx):
     - Workspace.tsx confirms Workspace is a real, present-tense
       canvas surface — a named board a user creates and returns to
       via the Hub, with a floating widget toolbar for adding views.
     - DashboardWidget.tsx confirms a real "Top Content" widget exists,
       wired directly to Supabase/analyticsEngine with a real
       date-range, platform, and sort-metric config — i.e. Workspace
       already is a place you "pull out the charts and views you
       want to see."
     - Nothing in the provided codebase implements an Evergreen
       Score, a Content Decay Graph, a Platform Risk Diversification
       view, or a Revenue Heatmap. Per the brief, this file does NOT
       build any of those as production features, does not add
       Supabase queries, and does not touch DashboardWidget or the
       widget registry. Every number below (marketer stats, the
       decay curve, the 92/5/3 platform split, the weekday revenue
       figures) is illustrative demo data invented for this scene
       only, isolated from real application data, matching how
       Section 04 invented its own illustrative VSL numbers rather
       than sourcing them from Overview.tsx.
     - Visually this is a cinematic abstraction of "Workspace as an
       investigation board" — a generic canvas frame with small
       widget-card glyphs — not a pixel recreation of Workspace.tsx's
       real toolbar/canvas chrome, matching how Section 04 abstracted
       Operator Mode rather than recreating Overview.tsx's real page.

   REUSED FROM SECTIONS 01-04 (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp / segOpacity / rangeOpacity  (timing math)
     - DrawLine, EyeNode, Person, Badge, Chip, StatRow               (visual primitives)
     - the violet corner-tick Badge grammar for product-concept badges
     - the EyeNode "seeing" motif for "investigate what's happening"
     - the accent Chip grammar for tags/metrics/questions

   NEW IN THIS FILE:
     - Bar() — a single vertical bar that grows from a baseline, used
       for the Content Decay Graph's four-week curve. One primitive,
       reused four times rather than four bespoke shapes.
     - PlatformRow() — a horizontal share-of-revenue bar with a
       trailing percentage, used for the Platform Risk Diversification
       scene (YouTube / Instagram / TikTok).
     - HeatCell() — a small day-of-week cell whose fill intensity
       encodes relative revenue, used for the Revenue Heatmap scene.
     - WidgetCard() — a tiny abstract "chart card" glyph (a rounded
       rect with a sparkline path inside), used for the Workspace
       canvas beats (opening board, and the S46-S49 declutter beat)
       so Workspace reads as "a place full of little views" without
       reproducing any real widget's chrome.
     - autoCaption() — replaces Section 04's per-segment
       splitSentences() call (which existed to split multi-sentence
       beats). Every Section 05 beat is already exactly one sentence
       of the script, so this is a thin, single-purpose helper that
       derives lead/fade/tail caption timing straight from each
       SEG window.

   NOT included on purpose (reserved for real product work): an
   actual Evergreen Score algorithm, a real content-decay model, a
   real platform-risk score, or a real revenue-by-weekday query. This
   section explains the *concept* of investigating your own data; it
   does not ship the analytics behind the examples it narrates.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const WARN = "#d3555c";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — one beat per exact sentence of the Section 05 script
   (53 beats), played back to back with a 280ms cross-fade gap,
   same philosophy as Sections 01-04. Durations are sized to spoken
   length (~230-280ms/word, plus lead/tail margins), with deliberate
   extra headroom on beats that carry a multi-item visual reveal the
   audience needs time to actually read (S5 workspace reveal, S9
   marketer stat comparison, S29 platform view, S40 heatmap view,
   S51 payoff) rather than just hear. The word-for-word text is
   carried alongside each duration so caption + timing stay in sync
   from a single source of truth.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "And we all know one thing about data:", 2600],
  ["S2", "Data can tell different stories.", 2600],
  ["S3", "That's why VSTRK isn't just about giving you more numbers.", 2800],
  ["S4", "It's about helping you investigate what's actually happening in your business.", 3200],
  ["S5", "Inside your Workspace, you can pull out the charts and views you want to see — almost like a visual investigation board.", 5400],
  ["S6", "You decide what questions you want to answer.", 2600],

  ["S7", "For example:", 1400],
  ["S8", "Who's actually putting in more work?", 2400],
  ["S9", "You could compare Marketer A and Marketer B by content output, publishing frequency, platform activity, and the revenue their content generates.", 6800],
  ["S10", "Because posting more doesn't necessarily mean performing better.", 2600],
  ["S11", "And publishing more frequently only tells you one part of the story.", 3000],
  ["S12", "You might also want to know:", 1800],

  ["S13", "Are they creating content that keeps working?", 2400],
  ["S14", "That's where something like an Evergreen Score can become interesting.", 3400],
  ["S15", "Or look at a Content Decay Graph:", 2400],
  ["S16", "Video A", 1400],
  ["S17", "Week 1 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588", 1400],
  ["S18", "Week 2 \u2588\u2588\u2588\u2588\u2588\u2588\u2588", 1300],
  ["S19", "Week 3 \u2588\u2588\u2588\u2588", 1300],
  ["S20", "Week 4 \u2588\u2588", 1300],
  ["S21", "Now you can see how long that piece of content continued to produce results.", 3600],
  ["S22", "Because creating evergreen content often takes more thought, more care, and more effort than simply pushing out another post.", 4600],

  ["S23", "So instead of asking:", 1600],
  ["S24", "\u201CWho posted the most?\u201D", 2000],
  ["S25", "You can start asking:", 1600],
  ["S26", "\u201CWho is creating content that keeps working?\u201D", 2800],

  ["S27", "And maybe you're posting on every platform because you don't want to miss out.", 3600],
  ["S28", "That's another question VSTRK can help you investigate.", 2600],
  ["S29", "You could pull up a Platform Risk Diversification view and see where your revenue is actually coming from.", 4800],
  ["S30", "For example:", 1400],
  ["S31", "YouTube \u2014 92%", 1800],
  ["S32", "Instagram \u2014 5%", 1600],
  ["S33", "TikTok \u2014 3%", 1600],
  ["S34", "Risk: High", 2200],
  ["S35", "Now you can see that your business isn't really diversified.", 3000],
  ["S36", "You're heavily dependent on one platform.", 2400],
  ["S37", "And maybe that's something you want to fix before that platform changes its algorithm, your reach drops, or your account runs into a problem.", 5800],

  ["S38", "Then there's another question:", 1600],
  ["S39", "When should you actually be putting in the work?", 2800],
  ["S40", "Instead of looking at views, you could pull up a Revenue Heatmap and discover something like:", 4400],
  ["S41", "Monday \u2014 $300", 1800],
  ["S42", "Tuesday \u2014 $1,200", 1800],
  ["S43", "Wednesday \u2014 $800", 1800],
  ["S44", "Now you might realize that certain days consistently produce more revenue than others.", 3400],
  ["S45", "So you can decide where to put more of your time, attention, and resources.", 3600],

  ["S46", "And that's the point.", 1800],
  ["S47", "You don't have to look at every chart.", 2600],
  ["S48", "You don't have to track every number.", 2400],
  ["S49", "You simply pull out the views that help you answer the questions you actually care about.", 4000],
  ["S50", "Because the goal isn't to collect more data.", 2600],
  ["S51", "The goal is to use data to find the truth behind what's happening in your business.", 4400],

  ["S52", "And as your business grows, the questions you need to answer change.", 3400],
  ["S53", "VSTRK grows with you.", 3400],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S53.end + 600;

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
function segOpacity(t: number, key: string, edge = 260) {
  const { start, end } = SEG[key];
  return fadeWindow(t, start, start + edge, end - edge, end);
}
function rangeOpacity(t: number, fromKey: string, toKey: string, edge = 260) {
  return fadeWindow(t, SEG[fromKey].start, SEG[fromKey].start + edge, SEG[toKey].end - edge, SEG[toKey].end);
}

/* Derives caption fade timing directly from a beat's SEG window —
   the single-sentence equivalent of Sections 01-03's
   splitSentences(), since every Section 05 beat is already exactly
   one sentence. */
function autoCaption(key: string, opts: { lead?: number; tail?: number; fade?: number } = {}) {
  const { lead = 220, tail = 260, fade = 220 } = opts;
  const seg = SEG[key];
  const a = seg.start + lead;
  const d = seg.end - tail;
  const b = Math.min(a + fade, a + (d - a) / 2);
  const c = Math.max(b, d - fade);
  return { text: seg.text, a, b, c, d };
}
const CAPTIONS = SEG_SOURCE.map(([key]) => autoCaption(key));

/* ---------------- Visual primitives — regenerated from Sections 01-04 ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE, dash }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string; dash?: string }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray={dash ? dash : 1} strokeDashoffset={dash ? undefined : 1 - p} opacity={opacity * (dash ? p : 1)} />
  );
}

function EyeNode({ x, y, t, arriveStart, arriveEnd, label, labelSide = "right", pulse = 0, opacity = 1, r = 5.5 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label?: string; labelSide?: "left" | "right" | "center"; pulse?: number; opacity?: number; r?: number }) {
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
        <text x={labelX} y={y} dy="0.34em" textAnchor={anchor} fontFamily={MONO} fontSize={10.5} letterSpacing={0.6}
          fill={INK} opacity={0.82} style={{ textTransform: "uppercase" }}>{label}</text>
      )}
    </g>
  );
}

function Person({ x, y, size = 26, opacity = 1, emoji = "🧑" }: { x: number; y: number; size?: number; opacity?: number; emoji?: string }) {
  return <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} opacity={opacity}>{emoji}</text>;
}

function Badge({ x, y, t, arriveStart, arriveEnd, label, scalePulse = 0, width = 96, filled = false, tone = ACCENT }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; scalePulse?: number; width?: number; filled?: boolean; tone?: string }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const h = 28;
  const bx = x - width / 2, by = y - h / 2;
  const scale = lerp(0.85, 1, p) * (1 + 0.04 * scalePulse);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={14} fill={filled ? tone : "#ffffff"} stroke={tone} strokeWidth={1.3}
        style={{ filter: `drop-shadow(0 4px 10px rgba(91,61,240,0.2))` }} />
      {!filled && <path d={`M${bx + 2},${by + 2} l10,0 M${bx + 2},${by + 2} l0,10`} stroke={tone} strokeWidth={1.3} strokeLinecap="round" fill="none" />}
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={11}
        letterSpacing={1.1} fill={filled ? "#ffffff" : tone} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function Chip({ x, y, t, start, end, label, tone = "accent", width = 118, fontSize = 9.5 }:
  { x: number; y: number; t: number; start: number; end: number; label: string; tone?: "muted" | "accent" | "filled" | "warn"; width?: number; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 24;
  const bx = x - width / 2, by = y - h / 2;
  const tColor = tone === "warn" ? WARN : ACCENT;
  const fill = tone === "filled" ? tColor : "#ffffff";
  const stroke = tone === "muted" ? LINE : tColor;
  const textFill = tone === "filled" ? "#ffffff" : tone === "muted" ? MUTED : tColor;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.1} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.4} fill={textFill}
        style={{ textTransform: tone === "muted" ? "none" : "uppercase" }}>{label}</text>
    </g>
  );
}

/* Label-left, value-right stat row, dimmed unless highlighted —
   reused verbatim from Section 04. */
function StatRow({ x, y, label, value, t, start, end, highlight = 1 }:
  { x: number; y: number; label: string; value: string; t: number; start: number; end: number; highlight?: number }) {
  const p = prog(t, start, end);
  const op = 0.45 + 0.55 * highlight;
  return (
    <g opacity={p * op}>
      <text x={x} y={y} textAnchor="start" fontFamily={MONO} fontSize={9.5} fontWeight={700} letterSpacing={0.5} fill={MUTED}
        style={{ textTransform: "uppercase" }}>{label}</text>
      <text x={x + 118} y={y} textAnchor="start" fontFamily={MONO} fontSize={12} fontWeight={800} fill={highlight > 0.5 ? ACCENT : INK}>{value}</text>
    </g>
  );
}

/* NEW — a single vertical bar growing from a shared baseline, used
   for the four-week Content Decay Graph. */
function Bar({ x, baseline, maxH, frac, t, start, end, width = 40, label, value, tone = "accent" }:
  { x: number; baseline: number; maxH: number; frac: number; t: number; start: number; end: number; width?: number; label: string; value?: string; tone?: "accent" | "filled" }) {
  const p = prog(t, start, end);
  const h = maxH * frac * p;
  const fill = tone === "filled" ? ACCENT : "#ffffff";
  return (
    <g opacity={0.35 + 0.65 * p}>
      <rect x={x - width / 2} y={baseline - h} width={width} height={h} rx={6} fill={fill} stroke={ACCENT} strokeWidth={1.2} />
      <text x={x} y={baseline + 20} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fontWeight={700} letterSpacing={0.4} fill={MUTED}
        style={{ textTransform: "uppercase" }}>{label}</text>
      {value && (
        <text x={x} y={baseline - h - 10} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={800} fill={INK} opacity={p}>{value}</text>
      )}
    </g>
  );
}

/* NEW — a horizontal share-of-revenue bar with a trailing
   percentage, used for the Platform Risk Diversification scene. */
function PlatformRow({ x, y, label, pct, maxWidth, t, start, end, warn = false }:
  { x: number; y: number; label: string; pct: number; maxWidth: number; t: number; start: number; end: number; warn?: boolean }) {
  const p = prog(t, start, end);
  const w = maxWidth * (pct / 100) * p;
  const color = warn ? WARN : ACCENT;
  return (
    <g opacity={0.4 + 0.6 * p}>
      <text x={x} y={y - 12} textAnchor="start" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.5} fill={INK}
        style={{ textTransform: "uppercase" }}>{label}</text>
      <rect x={x} y={y} width={maxWidth} height={14} rx={7} fill="none" stroke={LINE} strokeWidth={1} />
      <rect x={x} y={y} width={w} height={14} rx={7} fill={color} opacity={0.85} />
      <text x={x + maxWidth + 14} y={y + 11} textAnchor="start" fontFamily={MONO} fontSize={11} fontWeight={800} fill={color}>{Math.round(pct * prog(t, start, end))}%</text>
    </g>
  );
}

/* NEW — a day-of-week cell whose fill intensity encodes relative
   revenue, used for the Revenue Heatmap scene. */
function HeatCell({ x, y, day, value, intensity, t, start, end, active = true }:
  { x: number; y: number; day: string; value?: string; intensity: number; t: number; start: number; end: number; active?: boolean }) {
  const p = prog(t, start, end);
  const size = 56;
  const fillOpacity = active ? 0.16 + intensity * 0.72 : 0.06;
  return (
    <g opacity={active ? p : 0.5 * p}>
      <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={10} fill={ACCENT} opacity={fillOpacity} stroke={active ? ACCENT : LINE} strokeWidth={1} />
      <text x={x} y={y - size / 2 - 8} textAnchor="middle" fontFamily={MONO} fontSize={9} fontWeight={700} letterSpacing={0.4} fill={MUTED}
        style={{ textTransform: "uppercase" }}>{day}</text>
      {value && (
        <text x={x} y={y + 4} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} fill={intensity > 0.5 ? "#ffffff" : INK}>{value}</text>
      )}
    </g>
  );
}

/* NEW — a tiny abstract "chart card" glyph: a rounded rect with a
   sparkline path inside. Used so the Workspace canvas beats read as
   "a place full of little views" without reproducing any real
   widget's chrome. */
function WidgetCard({ x, y, t, start, end, w = 130, h = 84, path, fade = 1 }:
  { x: number; y: number; t: number; start: number; end: number; w?: number; h?: number; path: string; fade?: number }) {
  const p = prog(t, start, end);
  return (
    <g opacity={p * fade}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={10} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      <path d={path} transform={`translate(${x - w / 2 + 10},${y})`} fill="none" stroke={ACCENT} strokeWidth={1.4} opacity={0.75} />
    </g>
  );
}

const SPARK_A = "M0,10 L14,2 L28,14 L42,-6 L56,4 L70,-10 L84,0";
const SPARK_B = "M0,-4 L14,8 L28,-8 L42,2 L56,-2 L70,10 L84,-6";
const SPARK_C = "M0,4 L14,-8 L28,0 L42,-4 L56,10 L70,-2 L84,-10";

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
================================================================= */

/* ---- S1-S6 — Workspace as an investigation board ---- */
const WS_FRAME = { x: 480, y: 260, w: 620, h: 340 };
const WS_CARDS = [
  { x: 340, y: 190, path: SPARK_A }, { x: 500, y: 190, path: SPARK_B },
  { x: 660, y: 190, path: SPARK_C }, { x: 410, y: 320, path: SPARK_C },
  { x: 570, y: 320, path: SPARK_A },
];
const S5_FRAME_IN = { start: SEG.S5.start + 100, end: SEG.S5.start + 500 };
const S5_CARDS_IN = WS_CARDS.map((_, i) => ({ start: S5_FRAME_IN.end + 150 + i * 380, end: S5_FRAME_IN.end + 150 + i * 380 + 420 }));
const S6_EYE_IN = { start: SEG.S6.start + 150, end: SEG.S6.start + 550 };

/* ---- S7-S12 — Marketer A vs Marketer B ---- */
const MKT_A = { x: 300, y: 150 };
const MKT_B = { x: 660, y: 150 };
const MKT_ROWS = [
  { label: "Content Output", a: "12 pieces", b: "27 pieces", hi: "b" },
  { label: "Publish Freq.", a: "3 / wk", b: "6 / wk", hi: "b" },
  { label: "Platform Activity", a: "2 platforms", b: "5 platforms", hi: "b" },
  { label: "Revenue", a: "$4,900", b: "$2,100", hi: "a" },
];
const S8_HEADING_IN = { start: SEG.S8.start + 100, end: SEG.S8.start + 450 };
const S9_NODE_IN = { start: SEG.S9.start + 150, end: SEG.S9.start + 500 };
const S9_STAGGER = 1450;
const S9_ROWS_IN = MKT_ROWS.map((_, i) => ({ start: S9_NODE_IN.end + 150 + i * S9_STAGGER, end: S9_NODE_IN.end + 150 + i * S9_STAGGER + 620 }));
const S10_NOTE_IN = { start: SEG.S10.start + 150, end: SEG.S10.start + 550 };

/* ---- S13-S22 — Evergreen Score, then Content Decay Graph ---- */
const EG_CENTER = { x: 480, y: 190 };
const S14_NUM_IN = { start: SEG.S14.start + 200, end: SEG.S14.start + 700 };
const S14_LABEL_IN = { start: S14_NUM_IN.end + 100, end: S14_NUM_IN.end + 400 };
const S15_TITLE_IN = { start: SEG.S15.start + 100, end: SEG.S15.start + 450 };
const S16_SUB_IN = { start: SEG.S16.start + 80, end: SEG.S16.start + 400 };
const DECAY_BASE = 400;
const DECAY_MAXH = 210;
const DECAY_X = [340, 430, 520, 610];
const DECAY_FRAC = [1, 0.7, 0.4, 0.2];
const DECAY_VALUES = ["100%", "70%", "40%", "20%"];
const DECAY_WINDOWS = [
  { start: SEG.S17.start + 80, end: SEG.S17.end },
  { start: SEG.S18.start + 60, end: SEG.S18.end },
  { start: SEG.S19.start + 60, end: SEG.S19.end },
  { start: SEG.S20.start + 60, end: SEG.S20.end },
];
const S21_LINE_IN = { start: SEG.S21.start + 150, end: SEG.S21.start + 700 };

/* ---- S23-S26 — reframing the question ---- */
const Q_CENTER = { x: 480, y: 210 };
const Q2_CENTER = { x: 480, y: 330 };
const S24_CHIP_IN = { start: SEG.S24.start + 80, end: SEG.S24.start + 450 };
const S25_STRIKE_IN = { start: SEG.S25.start + 60, end: SEG.S25.start + 500 };
const S25_ARROW_IN = { start: SEG.S25.start + 250, end: SEG.S25.start + 650 };
const S26_CHIP_IN = { start: SEG.S26.start + 80, end: SEG.S26.start + 600 };
const S26_PULSE = { start: S26_CHIP_IN.end + 100, end: SEG.S26.end - 100 };

/* ---- S27-S37 — Platform Risk Diversification ---- */
const S29_BADGE_IN = { start: SEG.S29.start + 150, end: SEG.S29.start + 600 };
const PLAT_ROWS_META = [
  { label: "YouTube", pct: 92, warn: true },
  { label: "Instagram", pct: 5, warn: false },
  { label: "TikTok", pct: 3, warn: false },
];
const PLAT_X = 300;
const PLAT_Y = [270, 320, 370];
const PLAT_MAXW = 380;
const PLAT_WINDOWS = [
  { start: SEG.S31.start + 60, end: SEG.S31.end },
  { start: SEG.S32.start + 60, end: SEG.S32.end },
  { start: SEG.S33.start + 60, end: SEG.S33.end },
];
const S34_BADGE_IN = { start: SEG.S34.start + 100, end: SEG.S34.start + 550 };
const S36_RING = { start: SEG.S36.start + 100, end: SEG.S37.end - 300 };

/* ---- S38-S45 — Revenue Heatmap ---- */
const S40_BADGE_IN = { start: SEG.S40.start + 150, end: SEG.S40.start + 600 };
const HEAT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HEAT_X = [270, 350, 430, 510, 590, 670, 750];
const HEAT_Y = 300;
const HEAT_ACTIVE = [true, true, true, false, false, false, false];
const HEAT_VALUES = ["$300", "$1,200", "$800", undefined, undefined, undefined, undefined];
const HEAT_INTENSITY = [0.32, 1, 0.62, 0, 0, 0, 0];
const HEAT_BG_IN = { start: SEG.S40.end - 200, end: SEG.S40.end + 200 };
const HEAT_WINDOWS = [
  { start: SEG.S41.start + 60, end: SEG.S41.end },
  { start: SEG.S42.start + 60, end: SEG.S42.end },
  { start: SEG.S43.start + 60, end: SEG.S43.end },
];
const S45_NOTE_IN = { start: SEG.S45.start + 100, end: SEG.S45.start + 500 };

/* ---- S46-S51 — declutter, then the truth payoff ---- */
const CORE_CARDS = [
  { x: 240, y: 170, path: SPARK_A }, { x: 380, y: 150, path: SPARK_B }, { x: 500, y: 190, path: SPARK_C },
  { x: 620, y: 150, path: SPARK_A }, { x: 740, y: 170, path: SPARK_B }, { x: 300, y: 280, path: SPARK_C },
  { x: 660, y: 280, path: SPARK_A },
];
const KEEP_INDICES = [2, 5];
const S46_CARDS_IN = CORE_CARDS.map((_, i) => ({ start: SEG.S46.start + 40 + i * 90, end: SEG.S46.start + 40 + i * 90 + 260 }));
const DECLUTTER = { start: SEG.S48.end - 200, end: SEG.S49.start + 700 };
const TRUTH_CENTER = { x: 480, y: 220 };
const S50_NODE_IN = { start: SEG.S50.start + 100, end: SEG.S50.start + 500 };
const S51_BADGE_IN = { start: S50_NODE_IN.end + 150, end: S50_NODE_IN.end + 600 };
const S51_RING = { start: S51_BADGE_IN.end + 100, end: SEG.S51.end - 200 };

/* ---- S52-S53 — questions change, VSTRK grows with you ---- */
const S52_SHIFT = { start: SEG.S52.start + 100, end: SEG.S52.end - 200 };
const S53_WORDMARK_IN = { start: SEG.S53.start + 150, end: SEG.S53.start + 650 };
const S53_TAG_IN = { start: S53_WORDMARK_IN.end + 150, end: S53_WORDMARK_IN.end + 550 };
const S53_PULSE = { start: S53_TAG_IN.end, end: SEG.S53.end - 200 };

export interface OnboardingVideoSection05Props {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingVideoSection05({ onSkip, onComplete }: OnboardingVideoSection05Props = {}) {
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
  const introOpacity = rangeOpacity(t, "S1", "S6");
  const marketerOpacity = rangeOpacity(t, "S7", "S12");
  const decayOpacity = rangeOpacity(t, "S13", "S22");
  const reframeOpacity = rangeOpacity(t, "S23", "S26");
  const platformOpacity = rangeOpacity(t, "S27", "S37");
  const heatmapOpacity = rangeOpacity(t, "S38", "S45");
  const coreOpacity = rangeOpacity(t, "S46", "S51");
  const finalOpacity = segOpacity(t, "S52") + segOpacity(t, "S53") > 0 ? rangeOpacity(t, "S52", "S53") : 0;
  const finalFadeOut = t > SEG.S53.end - 450 ? 1 - prog(t, SEG.S53.end - 450, SEG.S53.end - 50) : 1;

  /* ---------------- S5-S6 — workspace board ---------------- */
  const wsFrameOpacity = prog(t, S5_FRAME_IN.start, S5_FRAME_IN.end);

  /* ---------------- S9 — marketer contrast note ---------------- */
  const s10NoteOpacity = fadeWindow(t, S10_NOTE_IN.start, S10_NOTE_IN.end, SEG.S12.start + 200, SEG.S12.start + 600);

  /* ---------------- S14 — evergreen score gauge pulse ---------------- */
  const egPulse = t > S14_LABEL_IN.end && t < S14_LABEL_IN.end + 700 ? Math.sin(prog(t, S14_LABEL_IN.end, S14_LABEL_IN.end + 700) * Math.PI) : 0;
  const evergreenGroupOpacity = fadeWindow(t, SEG.S13.start, SEG.S13.start + 200, SEG.S15.start + 100, SEG.S15.start + 500);
  const decayGraphOpacity = fadeWindow(t, SEG.S15.start + 150, SEG.S15.start + 550, SEG.S22.end - 200, SEG.S22.end);

  /* ---------------- S24-S26 — reframe strike + pulse ---------------- */
  const strikeP = prog(t, S25_STRIKE_IN.start, S25_STRIKE_IN.end);
  const q1Opacity = 1 - 0.65 * fadeWindow(t, S25_STRIKE_IN.start, S25_STRIKE_IN.end, SEG.S26.end - 200, SEG.S26.end);
  const q2Pulse = t > S26_PULSE.start && t < S26_PULSE.end ? Math.sin(prog(t, S26_PULSE.start, S26_PULSE.end) * Math.PI) : 0;

  /* ---------------- S34-S37 — risk badge pulse + dependency ring ---------------- */
  const riskPulse = t > S34_BADGE_IN.end && t < S34_BADGE_IN.end + 700 ? Math.sin(prog(t, S34_BADGE_IN.end, S34_BADGE_IN.end + 700) * Math.PI) : 0;
  const ringP = t > S36_RING.start && t < S36_RING.end ? prog(t, S36_RING.start, S36_RING.end) : (t >= S36_RING.end ? 1 : 0);
  const ringOpacity = fadeWindow(t, S36_RING.start, S36_RING.start + 250, S36_RING.end - 150, S36_RING.end);

  /* ---------------- S40-S45 — heatmap background + note ---------------- */
  const heatBgOpacity = prog(t, HEAT_BG_IN.start, HEAT_BG_IN.end);

  /* ---------------- S46-S49 — declutter ---------------- */
  const declutterP = prog(t, DECLUTTER.start, DECLUTTER.end);

  /* ---------------- S51 — truth payoff ring ---------------- */
  const s51PulseVal = t > S51_RING.start && t < S51_RING.end ? Math.sin(prog(t, S51_RING.start, S51_RING.end) * Math.PI) : 0;

  /* ---------------- S53 — wordmark pulse ---------------- */
  const s53PulseVal = t > S53_PULSE.start && t < S53_PULSE.end ? Math.sin(prog(t, S53_PULSE.start, S53_PULSE.end) * Math.PI) : 0;
  const s52ShiftP = prog(t, S52_SHIFT.start, S52_SHIFT.end);

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1-S6 — Workspace as an investigation board ================= */}
          <g opacity={introOpacity}>
            <text x={480} y={70} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1.4} fill={ACCENT}
              opacity={segOpacity(t, "S2")} style={{ textTransform: "uppercase" }}>Data Can Tell Different Stories</text>

            <g opacity={wsFrameOpacity}>
              <rect x={WS_FRAME.x - WS_FRAME.w / 2} y={WS_FRAME.y - WS_FRAME.h / 2} width={WS_FRAME.w} height={WS_FRAME.h} rx={18}
                fill="none" stroke={LINE} strokeWidth={1.3} />
              <text x={WS_FRAME.x - WS_FRAME.w / 2 + 18} y={WS_FRAME.y - WS_FRAME.h / 2 + 30} fontFamily={MONO} fontSize={10} fontWeight={800}
                letterSpacing={1} fill={MUTED} style={{ textTransform: "uppercase" }}>Workspace</text>
            </g>

            {WS_CARDS.map((c, i) => (
              <WidgetCard key={`ws-${i}`} x={c.x} y={c.y} t={t} start={S5_CARDS_IN[i].start} end={S5_CARDS_IN[i].end} path={c.path} />
            ))}

            <EyeNode x={WS_FRAME.x + WS_FRAME.w / 2 - 46} y={WS_FRAME.y - WS_FRAME.h / 2 + 30} t={t}
              arriveStart={S6_EYE_IN.start} arriveEnd={S6_EYE_IN.end} label="You Decide" labelSide="left" r={4.6} />
          </g>

          {/* ================= S7-S12 — Marketer A vs Marketer B ================= */}
          <g opacity={marketerOpacity}>
            <text x={480} y={80} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1.2} fill={ACCENT}
              opacity={fadeWindow(t, S8_HEADING_IN.start, S8_HEADING_IN.end, SEG.S9.end - 200, SEG.S9.end)} style={{ textTransform: "uppercase" }}>
              Who's Actually Putting In More Work?
            </text>

            <Person x={MKT_A.x} y={MKT_A.y} size={30} opacity={prog(t, S9_NODE_IN.start, S9_NODE_IN.end)} />
            <Badge x={MKT_A.x} y={MKT_A.y + 34} t={t} arriveStart={S9_NODE_IN.start} arriveEnd={S9_NODE_IN.end} label="Marketer A" width={132} />
            <Person x={MKT_B.x} y={MKT_B.y} size={30} opacity={prog(t, S9_NODE_IN.start, S9_NODE_IN.end)} emoji="🧑" />
            <Badge x={MKT_B.x} y={MKT_B.y + 34} t={t} arriveStart={S9_NODE_IN.start} arriveEnd={S9_NODE_IN.end} label="Marketer B" width={132} />

            {MKT_ROWS.map((row, i) => {
              const win = S9_ROWS_IN[i];
              const y = 270 + i * 46;
              return (
                <React.Fragment key={`mkt-row-${i}`}>
                  <StatRow x={MKT_A.x - 96} y={y} label={row.label} value={row.a} t={t} start={win.start} end={win.end} highlight={row.hi === "a" ? 1 : 0.3} />
                  <StatRow x={MKT_B.x - 96} y={y} label={row.label} value={row.b} t={t} start={win.start} end={win.end} highlight={row.hi === "b" ? 1 : 0.3} />
                </React.Fragment>
              );
            })}

            <text x={480} y={490} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.4} fill={MUTED}
              opacity={s10NoteOpacity}>more output ≠ more revenue</text>
          </g>

          {/* ================= S13-S22 — Evergreen Score → Content Decay Graph ================= */}
          <g opacity={decayOpacity}>
            <g opacity={evergreenGroupOpacity}>
              <text x={EG_CENTER.x} y={EG_CENTER.y} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={44} fill={INK}
                opacity={prog(t, S14_NUM_IN.start, S14_NUM_IN.end)}>82</text>
              <circle cx={EG_CENTER.x} cy={EG_CENTER.y - 12} r={58 + egPulse * 10} fill="none" stroke={ACCENT} strokeWidth={1} opacity={egPulse * 0.4} />
              <text x={EG_CENTER.x} y={EG_CENTER.y + 30} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={1.4} fill={MUTED}
                opacity={prog(t, S14_LABEL_IN.start, S14_LABEL_IN.end)} style={{ textTransform: "uppercase" }}>Evergreen Score</text>
            </g>

            <g opacity={decayGraphOpacity}>
              <text x={480} y={130} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1.2} fill={ACCENT}
                opacity={prog(t, S15_TITLE_IN.start, S15_TITLE_IN.end)} style={{ textTransform: "uppercase" }}>Content Decay Graph</text>
              <text x={480} y={155} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.6} fill={MUTED}
                opacity={prog(t, S16_SUB_IN.start, S16_SUB_IN.end)} style={{ textTransform: "uppercase" }}>Video A</text>

              <DrawLine d={`M${300},${DECAY_BASE} L${660},${DECAY_BASE}`} t={t} start={SEG.S17.start} end={SEG.S17.start + 300} width={1.2} color={LINE} />

              {DECAY_X.map((x, i) => (
                <Bar key={`decay-${i}`} x={x} baseline={DECAY_BASE} maxH={DECAY_MAXH} frac={DECAY_FRAC[i]} t={t}
                  start={DECAY_WINDOWS[i].start} end={DECAY_WINDOWS[i].end} label={`Week ${i + 1}`} value={DECAY_VALUES[i]}
                  tone={i === 0 ? "filled" : "accent"} />
              ))}

              <DrawLine d={`M${300},${DECAY_BASE - DECAY_MAXH * 0.16} L${660},${DECAY_BASE - DECAY_MAXH * 0.16}`} t={t}
                start={S21_LINE_IN.start} end={S21_LINE_IN.end} width={1} color={ACCENT} dash="4 6" />
              <text x={670} y={DECAY_BASE - DECAY_MAXH * 0.16 + 4} fontFamily={MONO} fontSize={8.5} fontWeight={700} fill={ACCENT}
                opacity={prog(t, S21_LINE_IN.start, S21_LINE_IN.end)} style={{ textTransform: "uppercase" }}>still working</text>

              <text x={480} y={500} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fontWeight={700} letterSpacing={0.3} fill={MUTED}
                opacity={segOpacity(t, "S22")}>more thought · more care · more effort</text>
            </g>
          </g>

          {/* ================= S23-S26 — reframing the question ================= */}
          <g opacity={reframeOpacity}>
            <g opacity={q1Opacity}>
              <Chip x={Q_CENTER.x} y={Q_CENTER.y} t={t} start={S24_CHIP_IN.start} end={S24_CHIP_IN.end} label="“Who posted the most?”" tone="muted" width={330} fontSize={11} />
              <DrawLine d={`M${Q_CENTER.x - 150},${Q_CENTER.y} L${Q_CENTER.x + 150},${Q_CENTER.y}`} t={t} start={S25_STRIKE_IN.start} end={S25_STRIKE_IN.end}
                width={1.4} color={WARN} opacity={0.85 * strikeP} />
            </g>

            <DrawLine d={`M${Q_CENTER.x},${Q_CENTER.y + 20} L${Q2_CENTER.x},${Q2_CENTER.y - 20}`} t={t} start={S25_ARROW_IN.start} end={S25_ARROW_IN.end}
              width={1.3} color={ACCENT} />

            <g style={{ transformOrigin: `${Q2_CENTER.x}px ${Q2_CENTER.y}px`, transform: `scale(${1 + 0.04 * q2Pulse})` }}>
              <Chip x={Q2_CENTER.x} y={Q2_CENTER.y} t={t} start={S26_CHIP_IN.start} end={S26_CHIP_IN.end}
                label="“Who is creating content that keeps working?”" tone="filled" width={470} fontSize={11} />
            </g>
          </g>

          {/* ================= S27-S37 — Platform Risk Diversification ================= */}
          <g opacity={platformOpacity}>
            <Badge x={480} y={110} t={t} arriveStart={S29_BADGE_IN.start} arriveEnd={S29_BADGE_IN.end} label="Platform Risk Diversification" width={330} filled />

            {PLAT_ROWS_META.map((row, i) => (
              <PlatformRow key={`plat-${i}`} x={PLAT_X} y={PLAT_Y[i]} label={row.label} pct={row.pct} maxWidth={PLAT_MAXW} t={t}
                start={PLAT_WINDOWS[i].start} end={PLAT_WINDOWS[i].end} warn={row.warn} />
            ))}

            <circle cx={PLAT_X + PLAT_MAXW * 0.46} cy={PLAT_Y[0] + 7} r={40 + ringP * 20} fill="none" stroke={WARN} strokeWidth={1.2} opacity={ringOpacity * 0.55} />

            <Badge x={780} y={300} t={t} arriveStart={S34_BADGE_IN.start} arriveEnd={S34_BADGE_IN.end} label="Risk: High" width={140} filled tone={WARN} scalePulse={riskPulse} />

            <text x={480} y={430} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.4} fill={MUTED}
              opacity={fadeWindow(t, SEG.S35.start + 150, SEG.S35.start + 550, SEG.S37.end - 250, SEG.S37.end)}>
              heavily dependent on one platform
            </text>
          </g>

          {/* ================= S38-S45 — Revenue Heatmap ================= */}
          <g opacity={heatmapOpacity}>
            <Badge x={480} y={110} t={t} arriveStart={S40_BADGE_IN.start} arriveEnd={S40_BADGE_IN.end} label="Revenue Heatmap" width={220} filled />

            <g opacity={heatBgOpacity}>
              {HEAT_DAYS.map((day, i) => (
                <HeatCell key={`heat-${i}`} x={HEAT_X[i]} y={HEAT_Y} day={day} value={HEAT_VALUES[i]} intensity={HEAT_INTENSITY[i]}
                  active={HEAT_ACTIVE[i]} t={t}
                  start={i < 3 ? HEAT_WINDOWS[i].start : HEAT_BG_IN.start} end={i < 3 ? HEAT_WINDOWS[i].end : HEAT_BG_IN.end} />
              ))}
            </g>

            <text x={480} y={410} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.4} fill={ACCENT}
              opacity={prog(t, S45_NOTE_IN.start, S45_NOTE_IN.end)} style={{ textTransform: "uppercase" }}>Best Day: Tuesday</text>
          </g>

          {/* ================= S46-S51 — declutter, then the truth payoff ================= */}
          <g opacity={coreOpacity}>
            <g opacity={1 - declutterP * 0.85}>
              {CORE_CARDS.map((c, i) => {
                const keep = KEEP_INDICES.includes(i);
                const fadeOut = keep ? 1 : 1 - declutterP;
                return (
                  <WidgetCard key={`core-${i}`} x={keep ? [c.x, 380, 580][KEEP_INDICES.indexOf(i)] ?? c.x : c.x}
                    y={keep ? 260 : c.y} t={t} start={S46_CARDS_IN[i].start} end={S46_CARDS_IN[i].end} path={c.path}
                    w={keep ? 160 : 120} h={keep ? 100 : 76} fade={fadeOut} />
                );
              })}
            </g>

            <EyeNode x={TRUTH_CENTER.x} y={TRUTH_CENTER.y} t={t} arriveStart={S50_NODE_IN.start} arriveEnd={S50_NODE_IN.end} r={7} />
            <circle cx={TRUTH_CENTER.x} cy={TRUTH_CENTER.y} r={26 + s51PulseVal * 30} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s51PulseVal * 0.45} />
            <Badge x={TRUTH_CENTER.x} y={TRUTH_CENTER.y + 54} t={t} arriveStart={S51_BADGE_IN.start} arriveEnd={S51_BADGE_IN.end} label="The Truth" width={140} filled />

            <text x={480} y={340} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.4} fill={MUTED}
              opacity={segOpacity(t, "S47") + segOpacity(t, "S48") + segOpacity(t, "S49") > 0.02
                ? fadeWindow(t, SEG.S47.start + 100, SEG.S47.start + 450, SEG.S49.end - 200, SEG.S49.end) : 0}>
              only the views that answer your question
            </text>
          </g>

          {/* ================= S52-S53 — questions change, VSTRK grows with you ================= */}
          <g opacity={finalOpacity}>
            <g opacity={1 - s52ShiftP * 0.5} style={{ transform: `translate(0px, ${-24 * s52ShiftP}px)` }}>
              <Chip x={300} y={430} t={t} start={S52_SHIFT.start} end={S52_SHIFT.start + 500} label="Today's Question" tone="muted" width={190} />
              <Chip x={660} y={430} t={t} start={S52_SHIFT.start + 250} end={S52_SHIFT.start + 750} label="Tomorrow's Question" tone="muted" width={210} />
            </g>

            <g style={{ transformOrigin: "480px 240px", transform: `scale(${1 + 0.03 * s53PulseVal})` }}>
              <text x={480} y={250} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={54} letterSpacing={2} fill={INK}
                opacity={prog(t, S53_WORDMARK_IN.start, S53_WORDMARK_IN.end)}>VSTRK</text>
              <circle cx={480} cy={225} r={90 + s53PulseVal * 24} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s53PulseVal * 0.4} />
            </g>
            <Badge x={480} y={310} t={t} arriveStart={S53_TAG_IN.start} arriveEnd={S53_TAG_IN.end} label="Grows With You" width={190} filled />
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
