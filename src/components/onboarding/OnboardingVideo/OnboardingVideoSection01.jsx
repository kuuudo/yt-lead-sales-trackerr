import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, SECTION 01 ONLY
   "You are a business owner." → "...tracking starts when someone clicks."

   This is a standalone, modular scene file for Section 01 of the new
   master VSL. It intentionally does NOT include Sections 02+ (Assets,
   Promotions, Operator Mode, Analytics, Marketplace, etc). Those will
   be implemented in later conversations and eventually composed with
   this file into the full master video — every helper below is kept
   general enough to make that composition straightforward.

   REUSED FROM OnboardingVideo.jsx v2, unmodified or lightly renamed:
     - clamp / prog / fadeWindow / lerp        (timing math)
     - DrawLine, EyeNode, Fox, Panel           (visual primitives)
     - buildChain()                            (sequential node-chain timing)
     - SampleTag → generalized to Tag()        (small uppercase panel tag)
     - the hand-off grammar (steady eye -> ink line draws into a corner ->
       dark panel fades up -> violet corner-bracket), reused for the
       tracking-link panel in Segments 10-11
     - the "platform ring" visual from the old Scene 01 (fox + 9 nodes),
       reused for Segments 01-02
     - the vertical chain-draw engine from the old Scene 02, reused for
       the first half of Segment 07's journey chain

   REUSED BUT GENERALIZED:
     - buildFan() — extracted from the old Scene 06's inline
       asset -> promoters fan-out. Same shape, now a reusable helper.
       Used here for Segment 07's branching journey ending, and left
       generic for later sections that need the same 1 -> N shape
       (e.g. Marketer A/B).

   NEW IN THIS FILE:
     - Segment 03 — two-video views-vs-revenue contrast
     - Segment 04 — three content -> outcome pairs (retargeted from the
       old Scene 03 fan-in; the old Content Decay panel hand-off is
       deliberately NOT used here — that belongs to a later section)
     - Segment 05 — the "you never really know" uncertainty beat
     - Segment 06 — thesis pivot (single eye holds open)
     - Segment 08 — "VSTRK is built for this" wordmark beat
     - Segment 09 — "magic into the link" spark beat
     - Segment 10 panel content — link/domain display WITHOUT revenue
       or purchase numbers (the old LINK_CARD's revenue fields are
       deliberately left out of this section — reuse them later,
       once the script has actually earned a results reveal)
     - Segment 12 — content -> link -> paste -> click workflow

   NOT included on purpose (reserved for later sections/conversations):
     Content Decay / Evergreen, Lead Quality Score, Marketer A/B
     revenue comparison, funnel analytics, Operator Mode, Workspace
     analytics — and no revenue/purchase numbers anywhere in this file.

   UPDATED (script-fidelity pass):
     - CAPTIONS now carry the exact, unabridged VSL narration —
       word-for-word, sentence-for-sentence — instead of condensed
       summary phrases. Where a condensed phrase already existed as an
       in-scene visual accent (Segment 06's "The entire journey",
       Segment 08's "If it has a URL, VSTRK can track it"), it's kept
       as optional visual emphasis, per the script owner's note; it no
       longer appears in the caption bar.
     - Segment durations were recalculated from the actual narration
       word count (~230ms/word, plus a short pause between sentences
       within a segment), not the old condensed captions. Segments
       03/04/05/06/07/08/09/11/12 grew to fit their full sentences;
       Segments 01/02/10 already had enough headroom and are
       unchanged.
     - splitSentences() / chainAtTimes() (new, small, local helpers)
       divide a segment's runtime across its sentences by word count.
       For Segments 04/07/12 — where each sentence maps to a distinct
       row/node — the reveals are pinned to those per-sentence windows
       so the visual lands in sync with the sentence being read,
       instead of finishing its animation early and holding on a
       static frame for the rest of the segment.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";

const DARK_PANEL = "#15151a";
const DARK_BORDER = "#27272a";
const DARK_TEXT_BRIGHT = "#e4e4e7";
const DARK_LABEL = "#52525b";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const PLATFORMS = ["Instagram", "YouTube", "X", "TikTok", "Facebook", "Threads", "LinkedIn", "Reddit", "Twitch"];

/* ---------------------------------------------------------------
   Timing — twelve narration-driven segments, played back to back with
   a short 300ms cross-fade gap between each. Durations are sized to
   the spoken length of each segment's FULL sentence(s) (~230ms/word,
   plus a short pause between sentences within a segment), not an
   arbitrary clock, so pacing stays tied to the actual VSL script.
----------------------------------------------------------------- */
const GAP = 300;
const SEG_DURATIONS = [
  ["S1", 1800],   // "You are a business owner." (5 words)
  ["S2", 4200],   // "You post content to promote your business — on Instagram, YouTube, X, TikTok, and everywhere else." (15 words)
  ["S3", 6400],   // "You might have one video getting thousands of views, while another video with a fraction of the views is actually generating customers and bringing in revenue." (26 words)
  ["S4", 7800],   // 3 sentences / 29 words: "Some content drives more people to your sales page." / "Some gets fewer conversions, but leads to more actual sales." / "And some content might make you money six months later."
  ["S5", 3900],   // "But most of the time, you never really know whether your effort is actually working." (15 words)
  ["S6", 4200],   // 2 sentences / 15 words: "What if you could track the entire journey?" / "I'm talking about the entire customer journey."
  ["S7", 8600],   // 6 sentences / 28 words: "Someone sees your content." ... "Or they actually buy your product."
  ["S8", 5800],   // 2 sentences / 22 words: "If you're selling something online, and it has a URL, VSTRK can help you track it." / "That's what VSTRK is built for."
  ["S9", 2200],   // "We simply put the magic into the link." (8 words)
  ["S10", 6000],  // 2 sentences / 20 words: vstrk.com/token + custom domain
  ["S11", 3200],  // "Your branding stays consistent, while VSTRK tracks what happens after someone clicks." (12 words)
  ["S12", 9400],  // 3 sentences / 36 words: generate link -> paste -> click starts tracking
];
const SEG = {};
{
  let cursor = 0;
  for (const [key, dur] of SEG_DURATIONS) {
    SEG[key] = { start: cursor, end: cursor + dur, dur };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S12.end + 600;

function clamp(v, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, v)); }
function prog(t, start, end) { return clamp((t - start) / (end - start)); }
function fadeWindow(t, a, b, c, d) {
  if (t < a) return 0;
  if (t < b) return clamp((t - a) / (b - a));
  if (c === Infinity) return 1;
  if (t < c) return 1;
  if (t < d) return 1 - clamp((t - c) / (d - c));
  return 0;
}
function lerp(a, b, t) { return a + (b - a) * t; }
/* Fades one segment's <g> in/out around its own window. */
function segOpacity(t, key, edge = 300) {
  const { start, end } = SEG[key];
  return fadeWindow(t, start, start + edge, end - edge, end);
}
/* Fades a combined run of segments (e.g. S1 through S2) as one scene,
   for cases where two narration beats share one continuous visual. */
function rangeOpacity(t, fromKey, toKey, edge = 300) {
  return fadeWindow(t, SEG[fromKey].start, SEG[fromKey].start + edge, SEG[toKey].end - edge, SEG[toKey].end);
}

/* Sequential node chain: node arrives -> line draws to next node -> next
   node arrives, with a short beat between each arrival and the next
   line start. REUSED VERBATIM from OnboardingVideo.jsx. */
function buildChain(base, count, { lineDraw, eyeOpen, beatGap, originOpen }) {
  const arrive = [{ start: base, end: base + originOpen }];
  const lines = [];
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

/* Root -> N parallel targets fan-out: lines stagger out from one node,
   each ending in its own eye. GENERALIZED from the old Scene 06's
   inline asset -> promoters pattern into a reusable helper. */
function buildFan(rootEnd, count, { lineStagger, lineDraw, eyeOpen, startGap = 40 }) {
  const targets = [];
  for (let i = 0; i < count; i++) {
    const lineStart = rootEnd + startGap + i * lineStagger;
    const lineEnd = lineStart + lineDraw;
    targets.push({ line: { start: lineStart, end: lineEnd }, eye: { start: lineEnd, end: lineEnd + eyeOpen } });
  }
  const end = Math.max(...targets.map((x) => x.eye.end));
  return { targets, end };
}

/* NEW — divides a segment's runtime across its sentences, proportional
   to each sentence's word count (~230ms/word), with a short pause
   between sentences and small lead-in/tail-out margins. Returns one
   {text, a, b, c, d, start, end} entry per sentence — (a,b,c,d) feed
   fadeWindow() directly for the caption bar, and (start,end) are the
   plain window bounds for pinning a matching visual reveal. */
function splitSentences(seg, sentences, { lead = 260, tail = 320, pause = 340, fade = 220 } = {}) {
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

/* NEW — like buildChain(), but each node's arrival is pinned to an
   explicit timestamp (typically a sentence window's start from
   splitSentences) rather than a fixed per-step duration. Used where
   a chain needs to track uneven narration pacing instead of a uniform
   stagger. Same {arrive, lines, end} shape as buildChain(). */
function chainAtTimes(times, { eyeOpen = 220, lineDraw = 260 } = {}) {
  const arrive = times.map((start) => ({ start, end: start + eyeOpen }));
  const lines = [];
  for (let i = 0; i < times.length - 1; i++) {
    lines.push({ start: Math.max(arrive[i].end, times[i + 1] - lineDraw), end: times[i + 1] });
  }
  return { arrive, lines, end: arrive[arrive.length - 1].end };
}

/* ---------------- Visual primitives — REUSED VERBATIM from OnboardingVideo.jsx ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength="1" strokeDasharray="1" strokeDashoffset={1 - p} opacity={opacity} />
  );
}

function EyeNode({ x, y, t, arriveStart, arriveEnd, label, labelSide = "right", mono = true, pulse = 0 }) {
  const openP = prog(t, arriveStart, arriveEnd);
  const eyeP = prog(t, arriveEnd, arriveEnd + 260);
  const baseGlow = clamp(openP) * (1 - 0.4 * (1 - eyeP));
  const glow = clamp(baseGlow + pulse, 0, 1.6);
  const ry = lerp(0.6, 3.1, eyeP);
  const labelX = labelSide === "right" ? x + 13 : labelSide === "left" ? x - 13 : x;
  const anchor = labelSide === "right" ? "start" : labelSide === "left" ? "end" : "middle";
  return (
    <g opacity={openP}>
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

function Fox({ x, y, size = 30, breathe }) {
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size}
      style={{ transformOrigin: `${x}px ${y}px`, transform: breathe ? `scale(${1 + 0.03 * Math.sin(breathe / 480)})` : "none" }}>
      🦊
    </text>
  );
}

/* Generalized from the old SampleTag — same look, but the text is now a
   prop. Segment 10's link example isn't fake analytics data, so it
   shouldn't say "Illustrative data"; later sections that DO reuse this
   for sample metrics can pass that text explicitly. */
function Tag({ children = "Illustrative data" }) {
  return (
    <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: DARK_LABEL }}>
      {children}
    </span>
  );
}

/* Native-dark-mode card with a thin violet corner-bracket — the only
   mythology mark allowed to touch a real panel. REUSED VERBATIM. */
function Panel({ x, y, width, height, opacity, children }) {
  if (opacity <= 0.01) return null;
  return (
    <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: "visible" }}>
      <div xmlns="http://www.w3.org/1999/xhtml" style={{
        width: "100%", height: "100%", boxSizing: "border-box", background: DARK_PANEL,
        border: `1px solid ${DARK_BORDER}`, borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,0.20)",
        opacity, position: "relative", fontFamily: MONO, overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -1, left: -1, width: 16, height: 16, borderTop: `1.4px solid ${ACCENT}`, borderLeft: `1.4px solid ${ACCENT}`, borderTopLeftRadius: 8, opacity: 0.85, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -1, right: -1, width: 16, height: 16, borderBottom: `1.4px solid ${ACCENT}`, borderRight: `1.4px solid ${ACCENT}`, borderBottomRightRadius: 8, opacity: 0.85, pointerEvents: "none" }} />
        {children}
      </div>
    </foreignObject>
  );
}

/* =================================================================
   SEGMENT-SPECIFIC TIMING & LAYOUT
================================================================= */

/* ---- Segments 01-02 — fox intro + platform ring (reused from old Scene 01) ---- */
const RING_CENTER = { x: 480, y: 250 };
const FOX_IN = { start: SEG.S1.start + 80, end: SEG.S1.start + 480 };
const PLATFORM_BASE = SEG.S2.start + 100;
const PLATFORM_GAPS = [0, 240, 210, 180, 150, 125, 100, 85, 70];
const PLATFORM_DRAW = 260;
const PLATFORM_STARTS = (() => {
  let acc = 0;
  return PLATFORM_GAPS.map((g) => { acc += g; return PLATFORM_BASE + acc; });
})();
const PLATFORM_LAST_EYE_END = PLATFORM_STARTS[PLATFORM_STARTS.length - 1] + PLATFORM_DRAW * 1.05;
const PLATFORM_PULSE = { start: PLATFORM_LAST_EYE_END + 150, end: PLATFORM_LAST_EYE_END + 150 + 400 };

/* ---- Segment 03 — views vs. revenue (NEW) ---- */
const S3_BIG = { x: 260, y: 250 };
const S3_SMALL = { x: 700, y: 170 };
const S3_REV = { x: 700, y: 400 };
const S3_BIG_ARRIVE = { start: SEG.S3.start + 100, end: SEG.S3.start + 420 };
const S3_SMALL_ARRIVE = { start: SEG.S3.start + 550, end: SEG.S3.start + 850 };
const S3_LINE = { start: SEG.S3.start + 900, end: SEG.S3.start + 1200 };
const S3_REV_ARRIVE = { start: S3_LINE.end, end: S3_LINE.end + 220 };

/* ---- Segment 04 — three content -> outcome pairs (retargeted from old Scene 03) ----
   Each row now maps 1:1 to one full sentence, and its reveal is pinned to
   that sentence's window (via splitSentences) instead of a fixed 900ms
   stagger, so all three rows no longer finish in the first ~40% of the
   segment and sit static for the rest of it. */
const S4_ROWS = [
  { src: "Content A", dst: "More Traffic" },
  { src: "Content B", dst: "More Sales" },
  { src: "Content C", dst: "Revenue \u2014 Later" },
];
const S4_ROW_Y = [90, 270, 450];
const S4_SRC_X = 190;
const S4_DST_X = 760;
const S4_SENT = splitSentences(SEG.S4, [
  "Some content drives more people to your sales page.",
  "Some gets fewer conversions, but leads to more actual sales.",
  "And some content might make you money six months later.",
]);
const S4_ROWS_TIMING = S4_SENT.map((w) => {
  const base = w.start;
  return {
    src: { start: base, end: base + 260 },
    line: { start: base + 260, end: base + 260 + 320 },
    dst: { start: base + 580, end: base + 580 + 260 },
  };
});

/* ---- Segment 05 — uncertainty (NEW, deliberately minimal) ---- */
const S5_CENTER = { x: 480, y: 280 };
const S5_RING = { start: SEG.S5.start + 150, end: SEG.S5.start + 600 };

/* ---- Segment 06 — thesis pivot (NEW, minimal) ----
   Two sentences now: the eye opens on the first ("What if you could
   track the entire journey?"), the label appears on the second ("I'm
   talking about the entire customer journey."), each pinned to its own
   sentence window. */
const S6_CENTER = { x: 480, y: 280 };
const S6_SENT = splitSentences(SEG.S6, [
  "What if you could track the entire journey?",
  "I'm talking about the entire customer journey.",
]);
const S6_EYE = { start: S6_SENT[0].start, end: S6_SENT[0].start + 400 };
const S6_LABEL = { start: S6_SENT[1].start, end: S6_SENT[1].start + 300 };

/* ---- Segment 07 — journey chain + branching ending ----
   Six full sentences now, mapping 1:1 to the six reveals that were
   already in this scene: the 3-node chain (content/link/sales page)
   and the 3-way branch (call booked/newsletter/purchase). Both are
   re-timed off the matching sentence window via chainAtTimes(), rather
   than a fixed draw/beat-gap pace, so the chain and branch land across
   the full, longer segment instead of both finishing in the first
   ~35% of it. */
const JOURNEY_CHAIN = ["CONTENT", "LINK", "SALES PAGE"];
const S7_X = 480;
const S7_NODE_Y = [70, 210, 350];
const S7_SENT = splitSentences(SEG.S7, [
  "Someone sees your content.",
  "They click your link.",
  "They visit your sales page.",
  "They book a call.",
  "They subscribe to your newsletter.",
  "Or they actually buy your product.",
]);
const S7_CHAIN = chainAtTimes(S7_SENT.slice(0, 3).map((w) => w.start), { eyeOpen: 220, lineDraw: 260 });
const S7_BRANCH_TARGETS = [
  { x: 230, y: 490, label: "CALL BOOKED" },
  { x: 480, y: 520, label: "NEWSLETTER" },
  { x: 730, y: 490, label: "PURCHASE" },
];
const S7_FAN = {
  targets: S7_BRANCH_TARGETS.map((_, i) => {
    const arriveStart = S7_SENT[3 + i].start;
    return {
      line: { start: Math.max(S7_CHAIN.end + 40, arriveStart - 260), end: arriveStart },
      eye: { start: arriveStart, end: arriveStart + 220 },
    };
  }),
};

/* ---- Segment 08 — "VSTRK is built for this" (NEW, minimal) ----
   Two sentences: the VSTRK wordmark appears on the first ("If you're
   selling something online... VSTRK can help you track it."), the
   sub-line on the second ("That's what VSTRK is built for."). The
   sub-line's on-screen text stays the existing condensed accent
   ("If it has a URL, VSTRK can track it.") per the script owner's note
   that it can remain as optional visual emphasis — the caption bar
   below now carries the exact full sentence instead. */
const S8_SENT = splitSentences(SEG.S8, [
  "If you're selling something online, and it has a URL, VSTRK can help you track it.",
  "That's what VSTRK is built for.",
]);
const S8_WORD_IN = { start: S8_SENT[0].start, end: S8_SENT[0].start + 400 };
const S8_SUB_IN = { start: S8_SENT[1].start, end: S8_SENT[1].start + 350 };

/* ---- Segment 09 — "magic into the link" spark (NEW, minimal) ---- */
const S9_SPARK = { start: SEG.S9.start + 150, end: SEG.S9.end - 200 };

/* ---- Segments 10-11 — link/domain hand-off panel (reused hand-off grammar) ---- */
const S10_EYE = { x: 480, y: 90 };
const S10_EYE_ARRIVE = { start: SEG.S10.start + 100, end: SEG.S10.start + 400 };
const S10_HANDOFF_LINE = { start: S10_EYE_ARRIVE.end + 100, end: S10_EYE_ARRIVE.end + 100 + 350 };
const S10_PANEL_IN_END = S10_HANDOFF_LINE.end + 500;

/* ---- Segment 12 — content -> link -> paste -> click (NEW) ----
   Three sentences now, but four nodes (New Content / Tracking Link /
   Pasted In Description / Click) — the first sentence covers both the
   "New Content" and "Tracking Link" nodes, so that node lands partway
   through the first sentence's window rather than at its very start.
   The remaining two nodes are pinned to the second and third sentence
   windows respectively, via chainAtTimes(), so the chain is paced
   across the full segment instead of finishing early. */
const S12_LABELS = ["New Content", "Tracking Link", "Pasted In Description", "Click"];
const S12_X = [110, 370, 630, 870];
const S12_Y = 300;
const S12_SENT = splitSentences(SEG.S12, [
  "Every time you create content, VSTRK can generate a unique tracking link for it.",
  "All you have to do is paste that link — for example, into your YouTube description.",
  "And the tracking starts when someone clicks.",
]);
const S12_TIMES = [
  S12_SENT[0].start,
  S12_SENT[0].start + (S12_SENT[0].end - S12_SENT[0].start) * 0.6,
  S12_SENT[1].start,
  S12_SENT[2].start,
];
const S12_CHAIN = chainAtTimes(S12_TIMES, { eyeOpen: 220, lineDraw: 280 });
const S12_TRACK_LABEL = { start: S12_CHAIN.end + 200, end: S12_CHAIN.end + 550 };

/* ---- Captions — the exact, unabridged VSL narration, sentence-for-
   sentence (source of truth: the original script). Multi-sentence
   segments (04/06/07/08/12) reuse the same splitSentences() windows
   that drive their visuals above, so the caption text and the reveal
   it describes always land together. ---- */
const CAPTIONS = [
  ...splitSentences(SEG.S1, ["You are a business owner."]),
  ...splitSentences(SEG.S2, ["You post content to promote your business — on Instagram, YouTube, X, TikTok, and everywhere else."]),
  ...splitSentences(SEG.S3, ["You might have one video getting thousands of views, while another video with a fraction of the views is actually generating customers and bringing in revenue."]),
  ...S4_SENT,
  ...splitSentences(SEG.S5, ["But most of the time, you never really know whether your effort is actually working."]),
  ...S6_SENT,
  ...S7_SENT,
  ...S8_SENT,
  ...splitSentences(SEG.S9, ["We simply put the magic into the link."]),
  ...splitSentences(SEG.S10, [
    "You can use a VSTRK tracking link like: vstrk.com/token",
    "Or connect your own custom domain, so it looks like: go.yourdomain.com/token",
  ]),
  ...splitSentences(SEG.S11, ["Your branding stays consistent, while VSTRK tracks what happens after someone clicks."]),
  ...S12_SENT,
];

export default function OnboardingVideoSection01({ onSkip, onComplete } = {}) {
  const [elapsed, setElapsed] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let raf;
    const startedAt = performance.now();
    function loop(now) {
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

  /* ---------------- Segments 01-02 — fox + platform ring ---------------- */
  const scene12Opacity = rangeOpacity(t, "S1", "S2");
  const foxAppear = prog(t, FOX_IN.start, FOX_IN.end);
  const platformNodes = PLATFORMS.map((label, i) => {
    const angle = ((-90 + i * (360 / PLATFORMS.length)) * Math.PI) / 180;
    const r = 195;
    return {
      label, x: RING_CENTER.x + r * Math.cos(angle), y: RING_CENTER.y + r * Math.sin(angle),
      start: PLATFORM_STARTS[i], draw: PLATFORM_DRAW,
    };
  });
  const platformPulse = t > PLATFORM_PULSE.start && t < PLATFORM_PULSE.end
    ? Math.sin(prog(t, PLATFORM_PULSE.start, PLATFORM_PULSE.end) * Math.PI)
    : 0;
  const ringOpacity = fadeWindow(t, SEG.S1.start + 300, SEG.S1.start + 700, SEG.S2.end - 300, SEG.S2.end) * 0.35;
  const ringExpand = clamp(prog(t, PLATFORM_PULSE.start, PLATFORM_PULSE.end + 250));

  /* ---------------- Segment 03 — views vs. revenue ---------------- */
  const s3Opacity = segOpacity(t, "S3");
  const s3BigPulse = t > S3_BIG_ARRIVE.end
    ? Math.abs(Math.sin((t - S3_BIG_ARRIVE.end) / 300))
    : 0;

  /* ---------------- Segment 04 — content -> outcome pairs ---------------- */
  const s4Opacity = segOpacity(t, "S4");

  /* ---------------- Segment 05 — uncertainty ---------------- */
  const s5Opacity = segOpacity(t, "S5");
  const s5RingOpacity = fadeWindow(t, S5_RING.start, S5_RING.end, SEG.S5.end - 300, SEG.S5.end) * 0.4;

  /* ---------------- Segment 06 — thesis pivot ---------------- */
  const s6Opacity = segOpacity(t, "S6");
  const s6LabelOpacity = fadeWindow(t, S6_LABEL.start, S6_LABEL.end, SEG.S6.end - 200, SEG.S6.end);

  /* ---------------- Segment 07 — journey chain + branch ---------------- */
  const s7Opacity = segOpacity(t, "S7");
  const s7Nodes = JOURNEY_CHAIN.map((label, i) => ({ label, x: S7_X, y: S7_NODE_Y[i] }));
  const s7FoxY = lerp(S7_NODE_Y[0], S7_NODE_Y[S7_NODE_Y.length - 1], prog(t, S7_CHAIN.arrive[0].start, S7_CHAIN.end));

  /* ---------------- Segment 08 — VSTRK intro line ---------------- */
  const s8Opacity = segOpacity(t, "S8");
  const s8WordOpacity = fadeWindow(t, S8_WORD_IN.start, S8_WORD_IN.end, SEG.S8.end - 300, SEG.S8.end);
  const s8SubOpacity = fadeWindow(t, S8_SUB_IN.start, S8_SUB_IN.end, SEG.S8.end - 200, SEG.S8.end);

  /* ---------------- Segment 09 — magic into the link ---------------- */
  const s9Opacity = segOpacity(t, "S9");
  const s9Spark = t > S9_SPARK.start && t < S9_SPARK.end
    ? Math.sin(prog(t, S9_SPARK.start, S9_SPARK.end) * Math.PI)
    : 0;

  /* ---------------- Segments 10-11 — link/domain panel ---------------- */
  const scene1011Opacity = rangeOpacity(t, "S10", "S11");
  const s10PanelOpacity = fadeWindow(t, S10_HANDOFF_LINE.end, S10_PANEL_IN_END, SEG.S11.end - 300, SEG.S11.end);
  const domainHighlighted = t >= SEG.S11.start;

  /* ---------------- Segment 12 — generate -> paste -> click ---------------- */
  const s12Opacity = segOpacity(t, "S12");
  const s12Nodes = S12_LABELS.map((label, i) => ({ label, x: S12_X[i], y: S12_Y }));
  const s12TrackOpacity = fadeWindow(t, S12_TRACK_LABEL.start, S12_TRACK_LABEL.end, SEG.S12.end - 200, SEG.S12.end);
  const s12LinkNodeOpacity = fadeWindow(t, S12_CHAIN.arrive[1].start, S12_CHAIN.arrive[1].end, S12_CHAIN.arrive[1].end + 500, S12_CHAIN.arrive[1].end + 900);

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ---------- SEGMENTS 01-02 — "You are a business owner." / "You post content..." ---------- */}
          <g opacity={scene12Opacity}>
            <circle cx={RING_CENTER.x} cy={RING_CENTER.y} r={195} fill="none" stroke={LINE} strokeWidth={1} opacity={ringOpacity} />
            <circle cx={RING_CENTER.x} cy={RING_CENTER.y} r={195} fill="none" stroke={ACCENT} strokeWidth={1.4}
              opacity={(1 - ringExpand) * 0.5 * (platformPulse > 0 || t < PLATFORM_PULSE.end + 250 ? 1 : 0)}
              style={{ transformOrigin: `${RING_CENTER.x}px ${RING_CENTER.y}px`, transform: `scale(${lerp(0.86, 1.08, ringExpand)})` }}
            />
            {platformNodes.map((n, i) => (
              <DrawLine key={`plat-line-${i}`} d={`M${RING_CENTER.x},${RING_CENTER.y} L${n.x},${n.y}`} t={t} start={n.start} end={n.start + n.draw} />
            ))}
            {platformNodes.map((n, i) => (
              <EyeNode key={`plat-node-${i}`} x={n.x} y={n.y} t={t}
                arriveStart={n.start + n.draw * 0.6} arriveEnd={n.start + n.draw * 1.05}
                label={n.label}
                labelSide={n.x > RING_CENTER.x + 15 ? "right" : n.x < RING_CENTER.x - 15 ? "left" : n.y < RING_CENTER.y ? "right" : "right"}
                pulse={platformPulse}
              />
            ))}
            <g opacity={foxAppear}><Fox x={RING_CENTER.x} y={RING_CENTER.y} size={34} breathe={t} /></g>
          </g>

          {/* ---------- SEGMENT 03 — "One video getting thousands of views... bringing in revenue." ---------- */}
          <g opacity={s3Opacity}>
            <EyeNode x={S3_BIG.x} y={S3_BIG.y} t={t} arriveStart={S3_BIG_ARRIVE.start} arriveEnd={S3_BIG_ARRIVE.end} label="Video A" labelSide="left" />
            <circle cx={S3_BIG.x} cy={S3_BIG.y} r={9 + s3BigPulse * 10} fill="none" stroke={ACCENT} strokeWidth={1}
              opacity={s3BigPulse * 0.4 * prog(t, S3_BIG_ARRIVE.start, S3_BIG_ARRIVE.end)} />
            <text x={S3_BIG.x} y={S3_BIG.y + 34} textAnchor="middle" fontFamily={MONO} fontSize={9.5} letterSpacing={0.6} fill={INK}
              opacity={0.55 * prog(t, S3_BIG_ARRIVE.start, S3_BIG_ARRIVE.end)} style={{ textTransform: "uppercase" }}>Thousands of views</text>

            <EyeNode x={S3_SMALL.x} y={S3_SMALL.y} t={t} arriveStart={S3_SMALL_ARRIVE.start} arriveEnd={S3_SMALL_ARRIVE.end} label="Video B" labelSide="right" />
            <DrawLine d={`M${S3_SMALL.x},${S3_SMALL.y + 12} L${S3_REV.x},${S3_REV.y - 12}`} t={t} start={S3_LINE.start} end={S3_LINE.end} width={1.4} color={ACCENT} />
            <EyeNode x={S3_REV.x} y={S3_REV.y} t={t} arriveStart={S3_REV_ARRIVE.start} arriveEnd={S3_REV_ARRIVE.end} label="Revenue" labelSide="right" />
          </g>

          {/* ---------- SEGMENT 04 — "Some content drives more people... six months later." ---------- */}
          <g opacity={s4Opacity}>
            {S4_ROWS.map((row, i) => {
              const timing = S4_ROWS_TIMING[i];
              const y = S4_ROW_Y[i];
              return (
                <React.Fragment key={`s4row-${i}`}>
                  <EyeNode x={S4_SRC_X} y={y} t={t} arriveStart={timing.src.start} arriveEnd={timing.src.end} label={row.src} labelSide="left" mono={false} />
                  <DrawLine d={`M${S4_SRC_X + 10},${y} L${S4_DST_X - 10},${y}`} t={t} start={timing.line.start} end={timing.line.end} />
                  <EyeNode x={S4_DST_X} y={y} t={t} arriveStart={timing.dst.start} arriveEnd={timing.dst.end} label={row.dst} labelSide="right" />
                </React.Fragment>
              );
            })}
          </g>

          {/* ---------- SEGMENT 05 — "...you never really know whether your effort is actually working." ---------- */}
          <g opacity={s5Opacity}>
            <circle cx={S5_CENTER.x} cy={S5_CENTER.y} r={90} fill="none" stroke={LINE} strokeWidth={1} opacity={s5RingOpacity} />
            <Fox x={S5_CENTER.x} y={S5_CENTER.y} size={30} breathe={t} />
          </g>

          {/* ---------- SEGMENT 06 — "What if you could track the entire journey?" ---------- */}
          <g opacity={s6Opacity}>
            <EyeNode x={S6_CENTER.x} y={S6_CENTER.y} t={t} arriveStart={S6_EYE.start} arriveEnd={S6_EYE.end} />
            <text x={S6_CENTER.x} y={S6_CENTER.y + 40} textAnchor="middle" fontFamily={MONO} fontSize={11} letterSpacing={1} fill={ACCENT}
              opacity={s6LabelOpacity} style={{ textTransform: "uppercase" }}>The entire journey</text>
          </g>

          {/* ---------- SEGMENT 07 — "Someone sees your content... buy your product." ---------- */}
          <g opacity={s7Opacity}>
            {S7_CHAIN.lines.map((w, i) => (
              <DrawLine key={`s7line-${i}`} d={`M${s7Nodes[i].x},${s7Nodes[i].y} L${s7Nodes[i + 1].x},${s7Nodes[i + 1].y}`} t={t} start={w.start} end={w.end} width={1.3} />
            ))}
            {s7Nodes.map((n, i) => (
              <EyeNode key={`s7node-${i}`} x={n.x} y={n.y} t={t} arriveStart={S7_CHAIN.arrive[i].start} arriveEnd={S7_CHAIN.arrive[i].end} label={n.label} labelSide="right" />
            ))}
            <Fox x={S7_X - 46} y={s7FoxY} size={22} breathe={t} />

            {S7_BRANCH_TARGETS.map((target, i) => (
              <DrawLine key={`s7branch-line-${i}`} d={`M${S7_X},${S7_NODE_Y[2]} Q ${(S7_X + target.x) / 2},${(S7_NODE_Y[2] + target.y) / 2} ${target.x},${target.y}`}
                t={t} start={S7_FAN.targets[i].line.start} end={S7_FAN.targets[i].line.end} width={1.2} />
            ))}
            {S7_BRANCH_TARGETS.map((target, i) => (
              <EyeNode key={`s7branch-node-${i}`} x={target.x} y={target.y} t={t}
                arriveStart={S7_FAN.targets[i].eye.start} arriveEnd={S7_FAN.targets[i].eye.end}
                label={target.label} labelSide={target.x < S7_X ? "left" : target.x > S7_X ? "right" : "right"} />
            ))}
          </g>

          {/* ---------- SEGMENT 08 — "If you're selling something online... built for." ---------- */}
          <g opacity={s8Opacity}>
            <text x={480} y={260} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={40} letterSpacing={2} fill={INK} opacity={s8WordOpacity}>VSTRK</text>
            <text x={480} y={300} textAnchor="middle" fontFamily={MONO} fontSize={12} letterSpacing={0.6} fill={ACCENT} opacity={s8SubOpacity} style={{ textTransform: "uppercase" }}>
              If it has a URL, VSTRK can track it
            </text>
          </g>

          {/* ---------- SEGMENT 09 — "We simply put the magic into the link." ---------- */}
          <g opacity={s9Opacity}>
            <g style={{ transformOrigin: "480px 280px", transform: `scale(${1 + 0.25 * s9Spark})` }}>
              <text x={480} y={280} textAnchor="middle" dominantBaseline="middle" fontSize={30}
                style={{ filter: s9Spark > 0.1 ? `drop-shadow(0 0 ${10 * s9Spark}px ${ACCENT})` : "none" }}>🔗</text>
            </g>
          </g>

          {/* ---------- SEGMENTS 10-11 — link + custom domain (hand-off into panel, no revenue) ---------- */}
          <g opacity={scene1011Opacity}>
            <EyeNode x={S10_EYE.x} y={S10_EYE.y} t={t} arriveStart={S10_EYE_ARRIVE.start} arriveEnd={S10_EYE_ARRIVE.end} />
            <DrawLine d={`M${S10_EYE.x},${S10_EYE.y + 12} L620,150`} t={t} start={S10_HANDOFF_LINE.start} end={S10_HANDOFF_LINE.end} width={1} color={ACCENT} opacity={0.6} />

            <Panel x={280} y={140} width={400} height={210} opacity={s10PanelOpacity}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "12px 16px 6px" }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: DARK_TEXT_BRIGHT }}>Your Tracking Link</span>
                <Tag>Example</Tag>
              </div>

              <div style={{ padding: "10px 16px 4px" }}>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: DARK_LABEL, marginBottom: 4 }}>Default</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: DARK_TEXT_BRIGHT }}>vstrk.com/token</div>
              </div>

              <div style={{ padding: "14px 16px 16px", borderTop: `1px solid ${DARK_BORDER}`, marginTop: 8 }}>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: DARK_LABEL, marginBottom: 4 }}>Custom domain</div>
                <div style={{
                  fontSize: 15, fontWeight: 700,
                  color: domainHighlighted ? ACCENT : DARK_TEXT_BRIGHT,
                  transition: "color 300ms",
                }}>go.yourdomain.com/token</div>
              </div>
            </Panel>
          </g>

          {/* ---------- SEGMENT 12 — content -> link -> paste -> click starts tracking ---------- */}
          <g opacity={s12Opacity}>
            {S12_CHAIN.lines.map((w, i) => (
              <DrawLine key={`s12line-${i}`} d={`M${s12Nodes[i].x},${s12Nodes[i].y} L${s12Nodes[i + 1].x},${s12Nodes[i + 1].y}`} t={t} start={w.start} end={w.end} width={1.2} />
            ))}
            {s12Nodes.map((n, i) => (
              <EyeNode key={`s12node-${i}`} x={n.x} y={n.y} t={t} arriveStart={S12_CHAIN.arrive[i].start} arriveEnd={S12_CHAIN.arrive[i].end} label={n.label} labelSide="right" />
            ))}
            <g opacity={s12LinkNodeOpacity}><Fox x={S12_X[1]} y={S12_Y - 34} size={20} breathe={t} /></g>

            <text x={(S12_X[2] + S12_X[3]) / 2} y={S12_Y + 60} textAnchor="middle" fontFamily={MONO} fontSize={11} letterSpacing={1} fill={ACCENT}
              opacity={s12TrackOpacity} style={{ textTransform: "uppercase" }}>Tracking started</text>
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
