import React, { useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding Prototype, v2 (Scenes 04–08 real-product hybrid)

   White-background mythology diagram, unchanged for Scenes 01/02/05/09/Final.
   Scenes 03, 04, 07, 08 now hand off into real-product dark panels —
   styled directly from InDepthAnalyticsWidget.tsx's palette — using the
   SAME master-clock engine (buildChain / DrawLine / EyeNode / fadeWindow).
   No new animation system. Every new timing constant is just more of the
   same additive arithmetic the original file already used.

   Hand-off grammar (used every time myth -> real product):
     1. the relevant node's eye holds steady (fully open, no more blinking)
     2. thin ink lines draw inward toward one corner of empty space
     3. a dark panel fades up there, in its OWN native colors — never
        recolored into the violet/white mythology palette
     4. a thin violet corner-bracket sits on the panel for its whole
        duration — the only mythology mark allowed to touch a real panel
     5. on scene exit, panel + bracket fade together and mythology resumes

   The fox never enters a panel's bounds. Eyes never render inside one.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const ACCENT_DIM = "#efecff";

/* Real-product palette — lifted directly from InDepthAnalyticsWidget.tsx.
   Used ONLY inside Panel components. Never blended with the mythology
   colors above. */
const DARK_PANEL = "#15151a";
const DARK_BORDER = "#27272a";
const DARK_TEXT = "#a1a1aa";
const DARK_TEXT_BRIGHT = "#e4e4e7";
const DARK_LABEL = "#52525b";
const DARK_RED = "#dc2626";
const DARK_GREEN = "#34d399";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const PLATFORMS = ["YouTube", "TikTok", "Instagram", "Facebook", "X", "Threads", "LinkedIn", "Reddit", "Twitch"];
const CHAIN = ["CONTENT", "VSTRK LINK", "LANDING PAGE", "SALES CALL", "CONSULTATION", "CHECKOUT", "PURCHASE", "REVENUE"];
const SOURCES = ["VIDEO A", "VIDEO B", "VIDEO C", "TikTok", "Instagram", "YouTube"];
const LINK_CHAIN = ["VSTRK LINK", "CONTENT", "LANDING PAGE", "CHECKOUT", "PURCHASE"];
const ASSET_ITEMS = ["VIDEO", "VSL", "CAMPAIGN ELEMENT", "IMPORTED CONTENT"];
const PROMOTERS = ["Promoter A", "Promoter B", "Promoter C"];
const PROMOTER_PLATFORMS = ["TikTok", "Instagram", "YouTube"];
const PROMO_ROWS = [
  { label: "Clicks", a: "4,821", b: "5,102" },
  { label: "Visitors", a: "3,204", b: "3,891" },
  { label: "Leads", a: "184", b: "92" },
  { label: "Checkouts", a: "71", b: "28" },
  { label: "Purchases", a: "23", b: "7" },
  { label: "Revenue", a: "$8,420", b: "$1,840" },
];
const OBSERVATORY_METRICS = [
  "Revenue by Asset", "Revenue by Promotion", "Revenue by Promoter", "Funnel Drop-off",
  "Evergreen Score", "Content Decay", "Revenue Velocity", "Promotion Conversion",
];
const TEAM_ROLES = ["Campaigns", "Assets", "Promotions", "Revenue"];
const TEAM_PEOPLE = ["Alex", "Sam", "Mia"];

/* ---------------------------------------------------------------
   Real-product illustrative data — every number below is prototype
   sample data, not a real customer's numbers or a fixed VSTRK metric.
----------------------------------------------------------------- */
const DECAY_ITEMS = [
  { title: "5 AI Tools for Solopreneurs", platform: "YouTube", weeks: [100, 72, 51, 38, 29, 24], score: 94, revenue: "$20,050", evergreen: true },
  { title: "The $10K Automation Stack", platform: "TikTok", weeks: [100, 40, 12, 4, 2, 1], score: 18, revenue: "$3,120" },
  { title: "Why Your Funnel Is Leaking Money", platform: "Newsletter", weeks: [100, 55, 22, 9, 5, 3], score: 31, revenue: "$4,860" },
];
const LINK_CARD = {
  title: "Consultation Funnel — Podcast Ep. 12",
  domain: "go.yourbrand.com/fox",
  revenue: "$5,309",
  purchases: 24,
  trail: ["CONTENT", "LANDING", "CHECKOUT", "PURCHASE"],
};
const FUNNEL_A = {
  label: "Promoter A",
  stages: [
    { name: "Views", value: 12400 },
    { name: "Clicks", value: 3820 },
    { name: "Leads", value: 612 },
    { name: "Sales", value: 89 },
  ],
  revenue: "$20,050",
};
const FUNNEL_B = {
  label: "Promoter B",
  stages: [
    { name: "Views", value: 9100 },
    { name: "Clicks", value: 2240 },
    { name: "Leads", value: 96 },
    { name: "Sales", value: 11 },
  ],
  revenue: "$1,840",
};
const TOP_CONTENT_ROWS = [
  { rank: 1, title: "5 AI Tools for Solopreneurs", platform: "YouTube", revenue: "$20,050", rpc: "$4.82", inRange: true },
  { rank: 2, title: "The $10K Automation Stack", platform: "TikTok", revenue: "$12,180", rpc: "$1.14" },
  { rank: 3, title: "Why Your Funnel Is Leaking Money", platform: "Newsletter", revenue: "$9,760", rpc: "$6.03" },
];
const KPI_TOTAL = { label: "Total Revenue (30d)", value: "$142,890", delta: "+18% vs prior 30d" };

/* ---------------------------------------------------------------
   Scene 01 timing — nine platforms wake up in an accelerating
   sequence (slow → fast), then illuminate together as one system.
----------------------------------------------------------------- */
const S1_START = 500;
const S1_GAPS = [0, 260, 220, 190, 160, 130, 105, 85, 70];
const S1_DRAW = 260;
const S1_STARTS = (() => {
  let acc = 0;
  return S1_GAPS.map((g) => {
    acc += g;
    return S1_START + acc;
  });
})();
const S1_LAST_EYE_END = S1_STARTS[S1_STARTS.length - 1] + S1_DRAW * 1.05;
const S1_PULSE_START = S1_LAST_EYE_END + 150;
const S1_PULSE_END = S1_PULSE_START + 400;

/* Builds a linear causal chain: node arrives → line draws to next node →
   next node arrives, with a short beat between each arrival and the next
   line start. Returns { arrive: [{start,end}...], lines: [{start,end}...], end }. */
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

const S2_BASE = 3400;
const S2_LINE_DRAW = 260;
const S2_EYE_OPEN = 220;
const S2_BEAT_GAP = 40;
const S2_ORIGIN_OPEN = 240;

const S2_NODE_ARRIVE = [{ start: S2_BASE, end: S2_BASE + S2_ORIGIN_OPEN }];
const S2_LINE_WINDOWS = [];
{
  let cursor = S2_BASE + S2_ORIGIN_OPEN;
  for (let i = 0; i < CHAIN.length - 1; i++) {
    const lineStart = cursor;
    const lineEnd = lineStart + S2_LINE_DRAW;
    const eyeStart = lineEnd;
    const eyeEnd = eyeStart + S2_EYE_OPEN;
    S2_LINE_WINDOWS.push({ start: lineStart, end: lineEnd });
    S2_NODE_ARRIVE.push({ start: eyeStart, end: eyeEnd });
    cursor = eyeEnd + S2_BEAT_GAP;
  }
}
const S2_END = S2_NODE_ARRIVE[S2_NODE_ARRIVE.length - 1].end;

/* ---------------------------------------------------------------
   Scene 03 — THE STORY → CONTENT DECAY REVEAL.
   Mural branch diagram draws first (mythology). Once the revenue
   eye is lit, everything hands off into a real Content Decay panel.
----------------------------------------------------------------- */
const S3_BASE = S2_END + 300;
const S3_SOURCE_LAST_START = S3_BASE + 120 + (SOURCES.length - 1) * 210;
const S3_BRANCH_END = S3_SOURCE_LAST_START + 300 + 200; // last source line drawn + revenue eye lit
const S3_HANDOFF = { start: S3_BRANCH_END + 150, end: S3_BRANCH_END + 150 + 450 };
const S3_PANEL_BASE = S3_HANDOFF.end;
const S3_PANEL_IN_END = S3_PANEL_BASE + 500;
const S3_PANEL_HOLD_END = S3_PANEL_IN_END + 3600; // real reveal gets real time to read
const S3_END = S3_PANEL_HOLD_END + 400;

/* ---------------------------------------------------------------
   Scene 04 — THE LINK → LINK/REVENUE UI REVEAL.
   Same recap chain as before, then a hand-off into a real link card.
----------------------------------------------------------------- */
const S4_BASE = S3_END + 300;
const S4_CHAIN_BASE = S4_BASE + 450;
const S4_CHAIN = buildChain(S4_CHAIN_BASE, LINK_CHAIN.length, { lineDraw: 220, eyeOpen: 170, beatGap: 30, originOpen: 200 });
const S4_CHAIN_END = S4_CHAIN.end;
const S4_HANDOFF = { start: S4_CHAIN_END + 150, end: S4_CHAIN_END + 150 + 450 };
const S4_PANEL_BASE = S4_HANDOFF.end;
const S4_PANEL_IN_END = S4_PANEL_BASE + 500;
const S4_PANEL_HOLD_END = S4_PANEL_IN_END + 3400;
const S4_END = S4_PANEL_HOLD_END + 400;

/* ---------------------------------------------------------------
   Scene 05 — TURN WHAT WORKS INTO AN ASSET. Unchanged — this stays
   fully abstract; it's the one scene where the fox physically acts.
----------------------------------------------------------------- */
const S5_BASE = S4_END + 300;
const S5_ITEMS_BASE = S5_BASE + 200;
const S5_ITEM_STAGGER = 90;
const S5_ITEM_DRAW = 260;
const S5_ITEMS_END = S5_ITEMS_BASE + (ASSET_ITEMS.length - 1) * S5_ITEM_STAGGER + S5_ITEM_DRAW;
const S5_FOX_START = S5_ITEMS_END + 250;
const S5_FOX_END = S5_FOX_START + 750;
const S5_TOUCH_START = S5_FOX_END;
const S5_TOUCH_END = S5_TOUCH_START + 350;
const S5_END = S5_TOUCH_END + 900;

/* ---------------------------------------------------------------
   Scene 06 — MULTIPLY THE WIN. Simplified to two hops (Asset →
   Promoters → Revenue) — the old intermediate "platform" row was
   redundant with the promoter label and was the main source of the
   "too busy" feeling, so it's folded into the promoter's own label.
----------------------------------------------------------------- */
const S6_BASE = S5_END + 300;
const S6_ROOT = { start: S6_BASE, end: S6_BASE + 220 };
const S6_FAN1 = PROMOTERS.map((_, i) => {
  const lineStart = S6_ROOT.end + i * 70;
  const lineEnd = lineStart + 240;
  return { line: { start: lineStart, end: lineEnd }, eye: { start: lineEnd, end: lineEnd + 180 } };
});
const S6_CONVERGE = PROMOTERS.map((_, i) => {
  const lineStart = S6_FAN1[i].eye.end + 40;
  const lineEnd = lineStart + 260;
  return { start: lineStart, end: lineEnd };
});
const S6_CONVERGE_END = Math.max(...S6_CONVERGE.map((c) => c.end));
const S6_REVENUE = { start: S6_CONVERGE_END, end: S6_CONVERGE_END + 300 };
const S6_END = S6_REVENUE.end + 500;

/* ---------------------------------------------------------------
   Scene 07 — THE PROMOTION → FUNNEL REVEAL.
   Abstract stat columns build first, then hand off into a real
   Views→Clicks→Leads→Sales funnel comparing Promoter A vs B.
----------------------------------------------------------------- */
const S7_BASE = S6_END + 300;
const S7_ROW_STAGGER = 110;
const S7_ROW_DRAW = 260;
const S7_ROWS_END = S7_BASE + (PROMO_ROWS.length - 1) * S7_ROW_STAGGER + 40 + S7_ROW_DRAW;
const S7_BEAM_A = { start: S7_ROWS_END + 150, end: S7_ROWS_END + 150 + 300 };
const S7_BEAM_B = { start: S7_ROWS_END + 210, end: S7_ROWS_END + 210 + 300 };
const S7_BEAM_END = Math.max(S7_BEAM_A.end, S7_BEAM_B.end);
const S7_PANEL_BASE = S7_BEAM_END + 150;
const S7_PANEL_IN_END = S7_PANEL_BASE + 500;
const S7_PANEL_HOLD_END = S7_PANEL_IN_END + 3400;
const S7_END = S7_PANEL_HOLD_END + 400;

/* ---------------------------------------------------------------
   Scene 08 — THE OBSERVATORY → WORKSPACE + ANALYTICS REVEAL.
   The mural ring is now a fast lead-in (not the payoff), then hands
   off into three real panels styled from InDepthAnalyticsWidget.tsx,
   scattered like the Miro-style investigation board from the PDF.
   This is the longest scene — the thesis shot of the whole video.
----------------------------------------------------------------- */
const S8_BASE = S7_END + 300;
const S8_ITEM_STAGGER = 110;
const S8_ITEM_DRAW = 260;
const S8_ITEMS_END = S8_BASE + (OBSERVATORY_METRICS.length - 1) * S8_ITEM_STAGGER + S8_ITEM_DRAW;
const S8_PULSE_START = S8_ITEMS_END + 150;
const S8_PULSE_END = S8_PULSE_START + 400;
const S8_HANDOFF = { start: S8_PULSE_END + 100, end: S8_PULSE_END + 100 + 500 };
const S8_PANEL_BASE = S8_HANDOFF.end;
const S8_PANEL1_IN_END = S8_PANEL_BASE + 500; // table
const S8_PANEL2_IN_END = S8_PANEL_BASE + 800; // KPI card
const S8_PANEL3_IN_END = S8_PANEL_BASE + 1100; // funnel echo
const S8_HOLD_END = S8_PANEL3_IN_END + 3800;
const S8_END = S8_HOLD_END + 500;

/* ---------------------------------------------------------------
   Scene 09 — WHEN YOU GROW. Left exactly as-is pending review —
   only its start time shifts, automatically, because S8_END changed.
----------------------------------------------------------------- */
const S9_BASE = S8_END + 300;
const S9_YOU = { start: S9_BASE, end: S9_BASE + 220 };
const S9_ROLES_BASE = S9_YOU.end + 80;
const S9_ROLES_END = S9_ROLES_BASE + (TEAM_ROLES.length - 1) * 60 + 180;
const S9_TEAM_LINE = { start: S9_ROLES_END + 120, end: S9_ROLES_END + 120 + 240 };
const S9_TEAM_EYE = { start: S9_TEAM_LINE.end, end: S9_TEAM_LINE.end + 200 };
const S9_PEOPLE = TEAM_PEOPLE.map((_, i) => {
  const lineStart = S9_TEAM_EYE.end + 40 + i * 60;
  const lineEnd = lineStart + 220;
  return { line: { start: lineStart, end: lineEnd }, eye: { start: lineEnd, end: lineEnd + 180 } };
});
const S9_PEOPLE_END = Math.max(...S9_PEOPLE.map((p) => p.eye.end));
const S9_END = S9_PEOPLE_END + 700;

/* ---------------------------------------------------------------
   FINAL — RETURN TO VENUS. Also unchanged pending review.
----------------------------------------------------------------- */
const FINAL_BASE = S9_END + 300;
const FINAL_RING = { start: FINAL_BASE, end: FINAL_BASE + 500 };
const FINAL_CAP1 = { a: FINAL_BASE + 300, b: FINAL_BASE + 550, c: FINAL_BASE + 1900, d: FINAL_BASE + 2150 };
const FINAL_CAP2 = { a: FINAL_BASE + 2150, b: FINAL_BASE + 2400, c: FINAL_BASE + 3600, d: FINAL_BASE + 3850 };
const FINAL_CTA_START = FINAL_CAP2.c;
const FINAL_END = FINAL_CAP2.d + 500;

const TOTAL = FINAL_END + 800;

const CAPTIONS = [
  { text: "Nine platforms. One view of your revenue.", a: S1_PULSE_START, b: S1_PULSE_START + 250, c: S2_BASE - 400, d: S2_BASE - 100 },
  { text: "From the first click…", a: S2_NODE_ARRIVE[1].start, b: S2_NODE_ARRIVE[1].start + 250, c: S2_NODE_ARRIVE[2].end, d: S2_NODE_ARRIVE[2].end + 250 },
  { text: "VSTRK follows what happens next.", a: S2_NODE_ARRIVE[4].start, b: S2_NODE_ARRIVE[4].start + 250, c: S2_NODE_ARRIVE[5].end, d: S2_NODE_ARRIVE[5].end + 250 },
  { text: "All the way to revenue.", a: S2_NODE_ARRIVE[6].start, b: S2_NODE_ARRIVE[6].start + 220, c: S3_BASE - 150, d: S3_BASE + 100 },

  { text: "Some content sells today.", a: S3_BASE + 700, b: S3_BASE + 950, c: S3_BRANCH_END - 150, d: S3_BRANCH_END + 100 },
  { text: "Some keeps selling months later.", a: S3_PANEL_BASE, b: S3_PANEL_BASE + 300, c: S3_PANEL_IN_END + 700, d: S3_PANEL_IN_END + 950 },
  { text: "Find your evergreen winners.", a: S3_PANEL_IN_END + 1000, b: S3_PANEL_IN_END + 1250, c: S3_END - 150, d: S3_END + 100 },

  { text: "One link.", a: S4_BASE, b: S4_BASE + 250, c: S4_CHAIN_BASE - 100, d: S4_CHAIN_BASE + 100 },
  { text: "A trail of everything that happens after it.", a: S4_CHAIN_BASE + 150, b: S4_CHAIN_BASE + 400, c: S4_CHAIN_END, d: S4_CHAIN_END + 250 },
  { text: "Every step, tied to the sale.", a: S4_PANEL_IN_END + 150, b: S4_PANEL_IN_END + 400, c: S4_END - 300, d: S4_END - 50 },

  { text: "When something works…", a: S5_BASE, b: S5_BASE + 250, c: S5_TOUCH_START - 150, d: S5_TOUCH_START + 100 },
  { text: "Turn it into an asset.", a: S5_TOUCH_START, b: S5_TOUCH_START + 250, c: S5_END - 300, d: S5_END - 50 },

  { text: "Let others promote what already works.", a: S6_BASE, b: S6_BASE + 250, c: Math.max(...S6_FAN1.map((f) => f.eye.end)), d: Math.max(...S6_FAN1.map((f) => f.eye.end)) + 250 },
  { text: "One asset. Multiple paths to revenue.", a: S6_CONVERGE_END - 100, b: S6_CONVERGE_END + 150, c: S6_END - 300, d: S6_END - 50 },

  { text: "Now watch what happens.", a: S7_BASE, b: S7_BASE + 250, c: S7_ROWS_END - 100, d: S7_ROWS_END + 150 },
  { text: "Know who is actually moving the needle.", a: S7_ROWS_END + 150, b: S7_ROWS_END + 400, c: S7_END - 300, d: S7_END - 50 },

  { text: "There is more beneath the surface.", a: S8_BASE, b: S8_BASE + 250, c: S8_ITEMS_END, d: S8_ITEMS_END + 250 },
  { text: "Build your own view of the data.", a: S8_PULSE_START, b: S8_PULSE_START + 250, c: S8_END - 300, d: S8_END - 50 },

  { text: "And when your team grows…", a: S9_BASE, b: S9_BASE + 250, c: S9_TEAM_EYE.end, d: S9_TEAM_EYE.end + 250 },
  { text: "See what everyone is building.", a: S9_PEOPLE[0].line.start, b: S9_PEOPLE[0].line.start + 250, c: S9_END - 350, d: S9_END - 100 },
  { text: "VSTRK grows with you.", a: S9_END - 250, b: S9_END, c: FINAL_BASE + 100, d: FINAL_BASE + 350 },

  { text: "Welcome to VSTRK.", a: FINAL_CAP1.a, b: FINAL_CAP1.b, c: FINAL_CAP1.c, d: FINAL_CAP1.d },
  { text: "Let's see what you can build.", a: FINAL_CAP2.a, b: FINAL_CAP2.b, c: FINAL_CAP2.c, d: FINAL_CAP2.d },
];

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

/* A line whose stroke draws itself, keyed to a start/end window on the master clock. */
function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE }) {
  const p = prog(t, start, end);
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      pathLength="1"
      strokeDasharray="1"
      strokeDashoffset={1 - p}
      opacity={opacity}
    />
  );
}

/* A node that illuminates: small ring + "eye" that opens once the line has arrived. */
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
      <circle
        cx={x}
        cy={y}
        r={5.5}
        fill="#fff"
        stroke={openP > 0.05 ? ACCENT : LINE}
        strokeWidth={1.2}
        style={{ filter: glow > 0.15 ? `drop-shadow(0 0 ${5 * glow}px ${ACCENT})` : "none" }}
      />
      <ellipse cx={x} cy={y} rx={3.1} ry={ry} fill={ACCENT} opacity={eyeP} />
      {label && (
        <text
          x={labelX}
          y={y}
          dy="0.34em"
          textAnchor={anchor}
          fontFamily={mono ? MONO : "inherit"}
          fontSize={mono ? 10.5 : 12}
          letterSpacing={mono ? 0.6 : 0}
          fill={INK}
          opacity={0.82}
          style={{ textTransform: mono ? "uppercase" : "none" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function Fox({ x, y, size = 30, breathe }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={size}
      style={{
        transformOrigin: `${x}px ${y}px`,
        transform: breathe ? `scale(${1 + 0.03 * Math.sin(breathe / 480)})` : "none",
      }}
    >
      🦊
    </text>
  );
}

/* Small uppercase tag marking a panel's numbers as illustrative prototype
   data — not real customer data, not a fixed VSTRK metric. */
function SampleTag() {
  return (
    <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: DARK_LABEL }}>
      Illustrative data
    </span>
  );
}

/* The hand-off container itself: a native-dark-mode card with a thin
   violet corner-bracket — the only mythology mark allowed to touch a
   real panel. Renders as HTML (foreignObject) so it can reuse the same
   dense-table visual language as the real product. */
function Panel({ x, y, width, height, opacity, children }) {
  if (opacity <= 0.01) return null;
  return (
    <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: "visible" }}>
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          background: DARK_PANEL,
          border: `1px solid ${DARK_BORDER}`,
          borderRadius: 10,
          boxShadow: "0 16px 40px rgba(0,0,0,0.20)",
          opacity,
          position: "relative",
          fontFamily: MONO,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: -1, left: -1, width: 16, height: 16, borderTop: `1.4px solid ${ACCENT}`, borderLeft: `1.4px solid ${ACCENT}`, borderTopLeftRadius: 8, opacity: 0.85, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -1, right: -1, width: 16, height: 16, borderBottom: `1.4px solid ${ACCENT}`, borderRight: `1.4px solid ${ACCENT}`, borderBottomRightRadius: 8, opacity: 0.85, pointerEvents: "none" }} />
        {children}
      </div>
    </foreignObject>
  );
}

export default function OnboardingVideo({ onSkip, onComplete } = {}) {
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
  // The video does NOT auto-advance when it ends — it just reveals a
  // "Next step" button so the person stays in control of pacing.
  const finished = t >= TOTAL;
  const replay = () => { setElapsed(0); setRunId((id) => id + 1); };

  const s1Opacity = fadeWindow(t, 0, 300, 3000, 3300);
  const s2Opacity = fadeWindow(t, 3100, S2_BASE, S2_END, S2_END + 300);
  const s3Opacity = fadeWindow(t, S3_BASE, S3_BASE + 300, S3_END, S3_END + 300);
  const s4Opacity = fadeWindow(t, S4_BASE, S4_BASE + 300, S4_END, S4_END + 300);
  const s5Opacity = fadeWindow(t, S5_BASE, S5_BASE + 300, S5_END, S5_END + 300);
  const s6Opacity = fadeWindow(t, S6_BASE, S6_BASE + 300, S6_END, S6_END + 300);
  const s7Opacity = fadeWindow(t, S7_BASE, S7_BASE + 300, S7_END, S7_END + 300);
  const s8Opacity = fadeWindow(t, S8_BASE, S8_BASE + 300, S8_END, S8_END + 300);
  const s9Opacity = fadeWindow(t, S9_BASE, S9_BASE + 300, S9_END, S9_END + 300);
  const finalOpacity = fadeWindow(t, FINAL_BASE, FINAL_BASE + 300, Infinity, Infinity);

  /* ---------------- Scene 01 — The Watchers ---------------- */
  const c1 = { x: 480, y: 250 };
  const s1Nodes = PLATFORMS.map((label, i) => {
    const angle = ((-90 + i * (360 / 9)) * Math.PI) / 180;
    const r = 195;
    const x = c1.x + r * Math.cos(angle);
    const y = c1.y + r * Math.sin(angle);
    return { label, x, y, start: S1_STARTS[i], draw: S1_DRAW };
  });
  const foxAppear = prog(t, 60, 420);
  const s1Pulse = t > S1_PULSE_START && t < S1_PULSE_END
    ? Math.sin(prog(t, S1_PULSE_START, S1_PULSE_END) * Math.PI)
    : 0;
  const ringOpacity = fadeWindow(t, S1_START - 100, S1_START + 400, 3000, 3300) * 0.35;
  const ringExpand = clamp(prog(t, S1_PULSE_START, S1_PULSE_END + 250));

  /* ---------------- Scene 02 — The Journey ---------------- */
  const s2X = 480;
  const s2Nodes = CHAIN.map((label, i) => ({ label, x: s2X, y: 78 + i * 66 }));
  const s2NodeArrive = S2_NODE_ARRIVE;
  const s2LineWindows = S2_LINE_WINDOWS;
  const foxY2 = lerp(78, 78 + (CHAIN.length - 1) * 66, prog(t, S2_BASE, S2_END));

  /* ---------------- Scene 03 — The Story → Content Decay reveal ---------------- */
  const revenueNode = { x: 830, y: 260 };
  const s3Sources = SOURCES.map((label, i) => ({
    label, x: 130, y: 55 + i * 82,
    start: S3_BASE + 120 + i * 210, draw: 300,
  }));
  const branchOpacity = fadeWindow(t, S3_BASE, S3_BASE + 250, S3_BRANCH_END - 100, S3_BRANCH_END + 200);
  const s3PanelOpacity = fadeWindow(t, S3_PANEL_BASE, S3_PANEL_IN_END, S3_END - 250, S3_END);

  /* ---------------- Scene 04 — The Link → Link/Revenue UI reveal ---------------- */
  const s4X = 480;
  const s4Nodes = LINK_CHAIN.map((label, i) => ({ label, x: s4X, y: 70 + i * 90 }));
  const s4StarOpacity = fadeWindow(t, S4_BASE, S4_BASE + 250, S4_CHAIN_BASE + 200, S4_CHAIN_BASE + 500);
  const s4PanelOpacity = fadeWindow(t, S4_PANEL_BASE, S4_PANEL_IN_END, S4_END - 250, S4_END);

  /* ---------------- Scene 05 — Turn What Works Into an Asset ---------------- */
  const s5ItemsX = [150, 370, 590, 810];
  const s5Items = ASSET_ITEMS.map((label, i) => ({
    label, x: s5ItemsX[i], y: 260,
    start: S5_ITEMS_BASE + i * S5_ITEM_STAGGER, draw: S5_ITEM_DRAW,
  }));
  const s5FoxX = lerp(50, s5ItemsX[0], prog(t, S5_FOX_START, S5_FOX_END));
  const s5TouchP = prog(t, S5_TOUCH_START, S5_TOUCH_END);
  const s5TouchPulse = t > S5_TOUCH_START && t < S5_TOUCH_END + 400
    ? Math.sin(prog(t, S5_TOUCH_START, S5_TOUCH_END + 400) * Math.PI)
    : 0;

  /* ---------------- Scene 06 — Multiply the Win (Asset → Promoters → Revenue) ---------------- */
  const s6Root = { x: 480, y: 70 };
  const s6PromoterX = [210, 480, 750];
  const s6Promoters = PROMOTERS.map((label, i) => ({
    label: `${label} · ${PROMOTER_PLATFORMS[i]}`, x: s6PromoterX[i], y: 230,
  }));
  const s6Revenue = { x: 480, y: 440 };
  const s6Pulse = t > S6_REVENUE.start && t < S6_REVENUE.end + 350
    ? Math.sin(prog(t, S6_REVENUE.start, S6_REVENUE.end + 350) * Math.PI)
    : 0;

  /* ---------------- Scene 07 — The Promotion → Funnel reveal ---------------- */
  const s7ColX = { a: 250, b: 710 };
  const s7RowY0 = 90, s7RowH = 42;
  const s7BeamBottomY = s7RowY0 + (PROMO_ROWS.length - 1) * s7RowH + 30;
  const s7ConvergePoint = { x: 480, y: 340 };
  const s7PanelOpacity = fadeWindow(t, S7_PANEL_BASE, S7_PANEL_IN_END, S7_END - 250, S7_END);

  /* ---------------- Scene 08 — The Observatory → Workspace + Analytics reveal ---------------- */
  const s8Center = { x: 480, y: 290 };
  const s8Nodes = OBSERVATORY_METRICS.map((label, i) => {
    const angle = ((-90 + i * (360 / OBSERVATORY_METRICS.length)) * Math.PI) / 180;
    const r = 205;
    return {
      label, x: s8Center.x + r * Math.cos(angle), y: s8Center.y + r * Math.sin(angle),
      start: S8_BASE + i * S8_ITEM_STAGGER, draw: S8_ITEM_DRAW,
    };
  });
  const s8Pulse = t > S8_PULSE_START && t < S8_PULSE_END
    ? Math.sin(prog(t, S8_PULSE_START, S8_PULSE_END) * Math.PI)
    : 0;
  const s8RingOpacity = fadeWindow(t, S8_BASE, S8_BASE + 200, S8_HANDOFF.start, S8_HANDOFF.end);
  const s8TableOpacity = fadeWindow(t, S8_PANEL_BASE, S8_PANEL1_IN_END, Infinity, Infinity);
  const s8KpiOpacity = fadeWindow(t, S8_PANEL_BASE + 300, S8_PANEL2_IN_END, Infinity, Infinity);
  const s8FunnelOpacity = fadeWindow(t, S8_PANEL_BASE + 600, S8_PANEL3_IN_END, Infinity, Infinity);
  const s8WatchFoxOpacity = fadeWindow(t, S8_PANEL_BASE, S8_PANEL_BASE + 400, Infinity, Infinity);

  /* ---------------- Scene 09 — When You Grow (unchanged) ---------------- */
  const s9You = { x: 480, y: 70 };
  const s9Roles = TEAM_ROLES.map((label, i) => ({
    label, x: 480 + (i - (TEAM_ROLES.length - 1) / 2) * 90, y: 150,
    start: S9_ROLES_BASE + i * 60, draw: 180,
  }));
  const s9Team = { x: 480, y: 250 };
  const s9PeopleX = [270, 480, 690];
  const s9People = TEAM_PEOPLE.map((label, i) => ({ label, x: s9PeopleX[i], y: 380 }));

  /* ---------------- FINAL — Return to Venus (unchanged) ---------------- */
  const finalCenter = { x: 480, y: 270 };
  const finalFoxOpacity = fadeWindow(t, FINAL_RING.start, FINAL_RING.end, Infinity, Infinity);
  const finalRingOpacity = finalFoxOpacity * 0.35;
  const finalCtaOpacity = fadeWindow(t, FINAL_CTA_START, FINAL_CTA_START + 300, Infinity, Infinity);

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900 }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ---------- SCENE 01 ---------- */}
          <g opacity={s1Opacity}>
            <circle cx={c1.x} cy={c1.y} r={195} fill="none" stroke={LINE} strokeWidth={1} opacity={ringOpacity} />
            <circle cx={c1.x} cy={c1.y} r={195} fill="none" stroke={ACCENT} strokeWidth={1.4}
              opacity={(1 - ringExpand) * 0.5 * (s1Pulse > 0 || t < S1_PULSE_END + 250 ? 1 : 0)}
              style={{ transformOrigin: `${c1.x}px ${c1.y}px`, transform: `scale(${lerp(0.86, 1.08, ringExpand)})` }}
            />
            {s1Nodes.map((n, i) => (
              <DrawLine key={`s1line-${i}`} d={`M${c1.x},${c1.y} L${n.x},${n.y}`} t={t} start={n.start} end={n.start + n.draw} />
            ))}
            {s1Nodes.map((n, i) => (
              <EyeNode key={`s1node-${i}`} x={n.x} y={n.y} t={t}
                arriveStart={n.start + n.draw * 0.6} arriveEnd={n.start + n.draw * 1.05}
                label={n.label}
                labelSide={n.x > c1.x + 15 ? "right" : n.x < c1.x - 15 ? "left" : n.y < c1.y ? "right" : "right"}
                pulse={s1Pulse}
              />
            ))}
            <g opacity={foxAppear}><Fox x={c1.x} y={c1.y} size={34} breathe={t} /></g>
          </g>

          {/* ---------- SCENE 02 ---------- */}
          <g opacity={s2Opacity}>
            {s2LineWindows.map((w, i) => (
              <DrawLine key={`s2line-${i}`} d={`M${s2Nodes[i].x},${s2Nodes[i].y} L${s2Nodes[i + 1].x},${s2Nodes[i + 1].y}`} t={t} start={w.start} end={w.end} width={1.3} />
            ))}
            {s2Nodes.map((n, i) => (
              <EyeNode key={`s2node-${i}`} x={n.x} y={n.y} t={t} arriveStart={s2NodeArrive[i].start} arriveEnd={s2NodeArrive[i].end} label={n.label} labelSide="right" />
            ))}
            <Fox x={s2X - 46} y={foxY2} size={24} breathe={t} />
          </g>

          {/* ---------- SCENE 03 — mural branch → Content Decay reveal ---------- */}
          <g opacity={s3Opacity}>
            <g opacity={branchOpacity}>
              {s3Sources.map((s, i) => (
                <DrawLine key={`s3line-${i}`} d={`M${s.x + 10},${s.y} Q ${480},${s.y} ${revenueNode.x - 14},${revenueNode.y}`} t={t} start={s.start} end={s.start + s.draw} width={1.1} />
              ))}
              {s3Sources.map((s, i) => (
                <EyeNode key={`s3node-${i}`} x={s.x} y={s.y} t={t} arriveStart={s.start} arriveEnd={s.start + s.draw * 0.5} label={s.label} labelSide="left" />
              ))}
              <EyeNode x={revenueNode.x} y={revenueNode.y} t={t}
                arriveStart={s3Sources[0].start + s3Sources[0].draw} arriveEnd={s3Sources[0].start + s3Sources[0].draw + 200}
                label="REVENUE" labelSide="right" />
            </g>

            <DrawLine d={`M${revenueNode.x},${revenueNode.y} L720,150`} t={t} start={S3_HANDOFF.start} end={S3_HANDOFF.end} width={1} color={ACCENT} opacity={0.6} />

            <Panel x={250} y={130} width={460} height={235} opacity={s3PanelOpacity}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "12px 16px 4px" }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: DARK_TEXT_BRIGHT }}>Content Decay</span>
                <SampleTag />
              </div>
              <div style={{ padding: "4px 16px 14px" }}>
                {DECAY_ITEMS.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < DECAY_ITEMS.length - 1 ? `1px solid ${DARK_BORDER}` : "none" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: item.evergreen ? DARK_TEXT_BRIGHT : DARK_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: DARK_LABEL, marginTop: 2 }}>{item.platform}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 28, flexShrink: 0 }}>
                      {item.weeks.map((v, wi) => (
                        <div key={wi} style={{ width: 5, borderRadius: 1, height: Math.max(2, (v / 100) * 28), background: item.evergreen ? DARK_RED : "#3f3f46" }} />
                      ))}
                    </div>
                    <div style={{ width: 66, textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: item.evergreen ? DARK_GREEN : DARK_TEXT }}>{item.score}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: DARK_LABEL, fontVariantNumeric: "tabular-nums" }}>{item.revenue}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </g>

          {/* ---------- SCENE 04 — recap chain → Link/Revenue UI reveal ---------- */}
          <g opacity={s4Opacity}>
            <text x={s4X} y={38} textAnchor="middle" fontSize={16} fill={ACCENT} opacity={s4StarOpacity} style={{ fontFamily: MONO }}>✦</text>
            {S4_CHAIN.lines.map((w, i) => (
              <DrawLine key={`s4line-${i}`} d={`M${s4Nodes[i].x},${s4Nodes[i].y} L${s4Nodes[i + 1].x},${s4Nodes[i + 1].y}`} t={t} start={w.start} end={w.end} width={1.3} />
            ))}
            {s4Nodes.map((n, i) => (
              <EyeNode key={`s4node-${i}`} x={n.x} y={n.y} t={t} arriveStart={S4_CHAIN.arrive[i].start} arriveEnd={S4_CHAIN.arrive[i].end} label={n.label} labelSide="right" />
            ))}

            <DrawLine d={`M${s4X},${s4Nodes[s4Nodes.length - 1].y} L680,180`} t={t} start={S4_HANDOFF.start} end={S4_HANDOFF.end} width={1} color={ACCENT} opacity={0.6} />

            <Panel x={560} y={140} width={340} height={230} opacity={s4PanelOpacity}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 10px" }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#dc2626,#7f1d1d)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DARK_TEXT_BRIGHT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{LINK_CARD.title}</div>
                  <div style={{ fontSize: 9, color: DARK_LABEL, marginTop: 2 }}>{LINK_CARD.domain}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 16px" }}>
                <span style={{ fontSize: 27, fontWeight: 700, color: DARK_RED, fontVariantNumeric: "tabular-nums" }}>{LINK_CARD.revenue}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: DARK_GREEN, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{LINK_CARD.purchases} purchases</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 16px 4px" }}>
                {LINK_CARD.trail.map((step, i) => (
                  <span key={i} style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: DARK_LABEL, border: `1px solid ${DARK_BORDER}`, borderRadius: 4, padding: "3px 6px" }}>
                    {step}{i < LINK_CARD.trail.length - 1 ? " →" : ""}
                  </span>
                ))}
              </div>
              <div style={{ padding: "8px 16px 0" }}><SampleTag /></div>
            </Panel>
          </g>

          {/* ---------- SCENE 05 — unchanged ---------- */}
          <g opacity={s5Opacity}>
            {s5Items.map((it, i) => {
              const arrive = fadeWindow(t, it.start, it.start + it.draw, Infinity, Infinity);
              const isTarget = i === 0;
              const labelOpacity = isTarget ? arrive * (1 - s5TouchP) : arrive * (t > S5_TOUCH_START ? 0.45 : 1);
              return (
                <g key={`s5item-${i}`}>
                  <circle cx={it.x} cy={it.y} r={5.5} fill="#fff" stroke={LINE} strokeWidth={1.2} opacity={arrive} />
                  <text x={it.x} y={it.y + 24} textAnchor="middle" fontFamily={MONO} fontSize={10.5} letterSpacing={0.6} fill={INK} opacity={labelOpacity} style={{ textTransform: "uppercase" }}>{it.label}</text>
                </g>
              );
            })}
            <g opacity={s5TouchP}>
              <circle cx={s5Items[0].x} cy={s5Items[0].y} r={7} fill="#fff" stroke={ACCENT} strokeWidth={1.4} style={{ filter: `drop-shadow(0 0 ${5 + 4 * s5TouchPulse}px ${ACCENT})` }} />
              <text x={s5Items[0].x} y={s5Items[0].y + 26} textAnchor="middle" fontFamily={MONO} fontSize={11} letterSpacing={1} fill={ACCENT} style={{ textTransform: "uppercase" }}>✦ ASSET ✦</text>
            </g>
            <Fox x={s5FoxX} y={s5Items[0].y - 34} size={24} breathe={t} />
          </g>

          {/* ---------- SCENE 06 — Asset → Promoters → Revenue (2 hops) ---------- */}
          <g opacity={s6Opacity}>
            <EyeNode x={s6Root.x} y={s6Root.y} t={t} arriveStart={S6_ROOT.start} arriveEnd={S6_ROOT.end} label="YOUR ASSET" labelSide="right" />
            {s6Promoters.map((p, i) => (
              <React.Fragment key={`s6prom-${i}`}>
                <DrawLine d={`M${s6Root.x},${s6Root.y} L${p.x},${p.y}`} t={t} start={S6_FAN1[i].line.start} end={S6_FAN1[i].line.end} />
                <EyeNode x={p.x} y={p.y} t={t} arriveStart={S6_FAN1[i].eye.start} arriveEnd={S6_FAN1[i].eye.end} label={p.label} labelSide={i === 0 ? "left" : "right"} pulse={s6Pulse} />
              </React.Fragment>
            ))}
            {s6Promoters.map((p, i) => (
              <DrawLine key={`s6conv-${i}`} d={`M${p.x},${p.y} Q ${480},${(p.y + s6Revenue.y) / 2} ${s6Revenue.x},${s6Revenue.y}`} t={t} start={S6_CONVERGE[i].start} end={S6_CONVERGE[i].end} width={1.3} />
            ))}
            <EyeNode x={s6Revenue.x} y={s6Revenue.y} t={t} arriveStart={S6_REVENUE.start} arriveEnd={S6_REVENUE.end} label="REVENUE" labelSide="right" pulse={s6Pulse} />
          </g>

          {/* ---------- SCENE 07 — stat columns → Funnel reveal ---------- */}
          <g opacity={s7Opacity}>
            <text x={s7ColX.a} y={55} textAnchor="middle" fontFamily={MONO} fontSize={11} letterSpacing={0.6} fill={ACCENT}
              opacity={fadeWindow(t, S7_BASE, S7_BASE + 250, Infinity, Infinity)} style={{ textTransform: "uppercase" }}>Promoter A</text>
            <text x={s7ColX.b} y={55} textAnchor="middle" fontFamily={MONO} fontSize={11} letterSpacing={0.6} fill="#9a9aa8"
              opacity={fadeWindow(t, S7_BASE + 40, S7_BASE + 290, Infinity, Infinity)} style={{ textTransform: "uppercase" }}>Promoter B</text>
            {PROMO_ROWS.map((row, i) => {
              const startA = S7_BASE + i * S7_ROW_STAGGER;
              const startB = startA + 40;
              const opA = fadeWindow(t, startA, startA + S7_ROW_DRAW, Infinity, Infinity);
              const opB = fadeWindow(t, startB, startB + S7_ROW_DRAW, Infinity, Infinity);
              const y = s7RowY0 + i * s7RowH;
              return (
                <React.Fragment key={`s7row-${i}`}>
                  <text x={s7ColX.a - 55} y={y} textAnchor="end" fontFamily={MONO} fontSize={10} fill={INK} opacity={opA * 0.55}>{row.label}</text>
                  <text x={s7ColX.a + 55} y={y} textAnchor="start" fontFamily={MONO} fontSize={12.5} fill={row.label === "Revenue" ? ACCENT : INK} opacity={opA}>{row.a}</text>
                  <text x={s7ColX.b - 55} y={y} textAnchor="end" fontFamily={MONO} fontSize={10} fill={INK} opacity={opB * 0.4}>{row.label}</text>
                  <text x={s7ColX.b + 55} y={y} textAnchor="start" fontFamily={MONO} fontSize={12.5} fill="#9a9aa8" opacity={opB * 0.8}>{row.b}</text>
                </React.Fragment>
              );
            })}
            <DrawLine d={`M${s7ColX.a},${s7BeamBottomY} Q ${480},${(s7BeamBottomY + s7ConvergePoint.y) / 2} ${s7ConvergePoint.x - 8},${s7ConvergePoint.y}`} t={t} start={S7_BEAM_A.start} end={S7_BEAM_A.end} width={2.2} color={ACCENT} />
            <DrawLine d={`M${s7ColX.b},${s7BeamBottomY} Q ${480},${(s7BeamBottomY + s7ConvergePoint.y) / 2} ${s7ConvergePoint.x + 8},${s7ConvergePoint.y}`} t={t} start={S7_BEAM_B.start} end={S7_BEAM_B.end} width={1} color="#c7c7d1" />

            <Panel x={310} y={350} width={340} height={200} opacity={s7PanelOpacity}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "10px 14px 6px" }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: DARK_TEXT_BRIGHT }}>Funnel — A vs B</span>
                <SampleTag />
              </div>
              <div style={{ padding: "2px 14px 8px" }}>
                {FUNNEL_A.stages.map((stage, i) => {
                  const stageB = FUNNEL_B.stages[i];
                  const max = FUNNEL_A.stages[0].value;
                  const wA = Math.max(6, (stage.value / max) * 100);
                  const wB = Math.max(4, (stageB.value / max) * 100);
                  return (
                    <div key={i} style={{ marginBottom: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7.5, letterSpacing: "0.06em", textTransform: "uppercase", color: DARK_LABEL, marginBottom: 2 }}>
                        <span>{stage.name}</span>
                        <span style={{ color: DARK_TEXT_BRIGHT, fontVariantNumeric: "tabular-nums" }}>{stage.value.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 7, background: "#000", borderRadius: 3, overflow: "hidden", marginBottom: 1 }}>
                        <div style={{ width: `${wA}%`, height: "100%", background: DARK_RED, borderRadius: 3 }} />
                      </div>
                      <div style={{ height: 3, background: "#000", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${wB}%`, height: "100%", background: "#3f3f46", borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 14px 10px", borderTop: `1px solid ${DARK_BORDER}` }}>
                <span style={{ fontSize: 9.5, color: DARK_RED, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>A · {FUNNEL_A.revenue}</span>
                <span style={{ fontSize: 9.5, color: "#71717a", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>B · {FUNNEL_B.revenue}</span>
              </div>
            </Panel>
          </g>

          {/* ---------- SCENE 08 — mural ring → Workspace + Analytics reveal (climax) ---------- */}
          <g opacity={s8Opacity}>
            <g opacity={s8RingOpacity}>
              {s8Nodes.map((n, i) => (
                <DrawLine key={`s8line-${i}`} d={`M${s8Center.x},${s8Center.y} L${n.x},${n.y}`} t={t} start={n.start} end={n.start + n.draw} />
              ))}
              {s8Nodes.map((n, i) => (
                <EyeNode key={`s8node-${i}`} x={n.x} y={n.y} t={t}
                  arriveStart={n.start + n.draw * 0.6} arriveEnd={n.start + n.draw * 1.05}
                  label={n.label}
                  labelSide={n.x > s8Center.x + 15 ? "right" : n.x < s8Center.x - 15 ? "left" : n.y < s8Center.y ? "right" : "right"}
                  pulse={s8Pulse}
                />
              ))}
              <Fox x={s8Center.x} y={s8Center.y} size={30} breathe={t} />
            </g>

            <Panel x={40} y={60} width={380} height={190} opacity={s8TableOpacity}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "10px 14px 4px" }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: DARK_TEXT_BRIGHT }}>Top Content</span>
                <SampleTag />
              </div>
              <div style={{ display: "flex", padding: "4px 14px 2px", borderBottom: `1px solid ${DARK_BORDER}` }}>
                <span style={{ flex: 1, fontSize: 7, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: DARK_LABEL }}>Content</span>
                <span style={{ width: 70, fontSize: 7, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: DARK_LABEL, textAlign: "right" }}>Revenue</span>
                <span style={{ width: 54, fontSize: 7, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: DARK_LABEL, textAlign: "right" }}>Rev/Clk</span>
              </div>
              {TOP_CONTENT_ROWS.map((row, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "7px 14px", borderBottom: i < TOP_CONTENT_ROWS.length - 1 ? `1px solid ${DARK_BORDER}` : "none", background: row.inRange ? "rgba(16,185,129,0.04)" : "transparent" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: DARK_TEXT_BRIGHT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.title}</span>
                      {row.inRange && <span style={{ fontSize: 6.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: DARK_GREEN, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 4, padding: "1px 4px", flexShrink: 0 }}>Live</span>}
                    </div>
                    <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: DARK_LABEL, marginTop: 1 }}>{row.platform}</div>
                  </div>
                  <span style={{ width: 70, fontSize: 10.5, fontWeight: 700, color: DARK_RED, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.revenue}</span>
                  <span style={{ width: 54, fontSize: 9, fontWeight: 700, color: DARK_TEXT, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.rpc}</span>
                </div>
              ))}
            </Panel>

            <Panel x={460} y={60} width={200} height={110} opacity={s8KpiOpacity}>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DARK_LABEL, marginBottom: 8 }}>{KPI_TOTAL.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: DARK_TEXT_BRIGHT, fontVariantNumeric: "tabular-nums", marginBottom: 6 }}>{KPI_TOTAL.value}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: DARK_GREEN }}>{KPI_TOTAL.delta}</div>
              </div>
            </Panel>

            <Panel x={460} y={190} width={200} height={190} opacity={s8FunnelOpacity}>
              <div style={{ padding: "12px 14px" }}>
                <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: DARK_LABEL, marginBottom: 8 }}>Funnel Drop-off</div>
                {FUNNEL_A.stages.map((stage, i) => {
                  const max = FUNNEL_A.stages[0].value;
                  const w = Math.max(8, (stage.value / max) * 100);
                  return (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: DARK_LABEL, marginBottom: 2 }}>
                        <span style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>{stage.name}</span>
                        <span style={{ color: DARK_TEXT_BRIGHT, fontVariantNumeric: "tabular-nums" }}>{stage.value.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 6, background: "#000", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${w}%`, height: "100%", background: DARK_RED, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <g opacity={s8WatchFoxOpacity}><Fox x={860} y={500} size={22} breathe={t} /></g>
          </g>

          {/* ---------- SCENE 09 — unchanged, pending review ---------- */}
          <g opacity={s9Opacity}>
            <EyeNode x={s9You.x} y={s9You.y} t={t} arriveStart={S9_YOU.start} arriveEnd={S9_YOU.end} label="YOU" labelSide="right" />
            {s9Roles.map((r, i) => {
              const op = fadeWindow(t, r.start, r.start + r.draw, Infinity, Infinity);
              return (
                <text key={`s9role-${i}`} x={r.x} y={r.y} textAnchor="middle" fontFamily={MONO} fontSize={9.5} letterSpacing={0.5} fill={INK} opacity={op * 0.6} style={{ textTransform: "uppercase" }}>{r.label}</text>
              );
            })}
            <DrawLine d={`M${s9You.x},${s9You.y + 14} L${s9Team.x},${s9Team.y - 14}`} t={t} start={S9_TEAM_LINE.start} end={S9_TEAM_LINE.end} width={1.3} />
            <EyeNode x={s9Team.x} y={s9Team.y} t={t} arriveStart={S9_TEAM_EYE.start} arriveEnd={S9_TEAM_EYE.end} label="TEAM" labelSide="right" />
            {s9People.map((p, i) => (
              <React.Fragment key={`s9person-${i}`}>
                <DrawLine d={`M${s9Team.x},${s9Team.y} L${p.x},${p.y}`} t={t} start={S9_PEOPLE[i].line.start} end={S9_PEOPLE[i].line.end} />
                <EyeNode x={p.x} y={p.y} t={t} arriveStart={S9_PEOPLE[i].eye.start} arriveEnd={S9_PEOPLE[i].eye.end} label={p.label} labelSide="right" mono={false} />
              </React.Fragment>
            ))}
          </g>

          {/* ---------- FINAL — unchanged, pending review ---------- */}
          <g opacity={finalOpacity}>
            <circle cx={finalCenter.x} cy={finalCenter.y} r={195} fill="none" stroke={LINE} strokeWidth={1} opacity={finalRingOpacity} />
            <g opacity={finalFoxOpacity}><Fox x={finalCenter.x} y={finalCenter.y} size={40} breathe={t} /></g>
            <text x={finalCenter.x} y={finalCenter.y + 120} textAnchor="middle" fontFamily={MONO} fontSize={12} letterSpacing={1} fill={ACCENT} opacity={finalCtaOpacity} style={{ textTransform: "uppercase" }}>Let's begin →</text>
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
        <button
          type="button"
          onClick={onSkip}
          style={{
            position: "absolute", top: 14, right: 18,
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(255,255,255,0.9)", border: `1px solid ${LINE}`,
            borderRadius: 999, fontFamily: MONO, fontSize: 10.5,
            fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
            color: "#6b6b78", cursor: "pointer", padding: "7px 14px",
          }}
        >
          Skip video <span aria-hidden="true">→</span>
        </button>
      ) : (
        <div style={{ position: "absolute", bottom: 14, right: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            onClick={replay}
            style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 11, letterSpacing: 0.4, color: "#9a9aa8", cursor: "pointer", padding: 4 }}
          >
            ↻ replay
          </button>
          <button
            type="button"
            onClick={onComplete}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: ACCENT, border: "none", borderRadius: 8,
              fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
              letterSpacing: 0.6, textTransform: "uppercase",
              color: "#ffffff", cursor: "pointer", padding: "10px 18px",
              boxShadow: `0 8px 20px rgba(91,61,240,0.35)`,
            }}
          >
            Next step <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
