import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, "Why do we need Global Attribution?"

   Standalone, modular scene file. Independently renderable — does
   NOT require any other onboarding section to be mounted. It
   regenerates the same visual language, primitives and timing
   philosophy locally, exactly the way the Thank-You Page Pixel
   section and Section 06 stayed self-contained from one another.

   STORY: A visitor's first touch (say, a YouTube tracking link)
   and their later action (a purchase, days afterward) can be far
   apart in time. Global Attribution is what lets VSTRK remember
   that first source and connect it to whatever the visitor
   eventually does, so a completed action can be traced back to the
   traffic source that actually produced it.

   PRODUCT GROUNDING:
     - Deliberately non-technical. No mention of cookies,
       localStorage, JavaScript, code, APIs, databases, or event
       schemas — per the brief, the viewer only needs one idea:
       Global Attribution remembers where a visitor came from and
       connects that source to what they do later.
     - Distinct from (and a companion to) the Thank-You Page Pixel
       video: that video covers "the action was completed," this
       one covers "here's the traffic source that led to it." The
       two are not conflated on screen — this file only visualizes
       source → journey → result, never the completion signal itself.
     - The YouTube → purchase example is illustrative, matching the
       brief's own example; VSTRK supports several funnel/action
       types (Direct Purchase, Sales Booking, Paid Consultation,
       Newsletter/Sign-Up) — this file doesn't imply the mechanism
       is YouTube- or purchase-specific.
     - Narration is used verbatim, word-for-word, split one beat per
       sentence exactly as supplied — no rewrites, additions, or cuts.

   REUSED FROM PRIOR SECTIONS (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp / segOpacity / autoCaption   (timing math)
     - DrawLine, EyeNode, Person, Badge, Chip                        (visual primitives)
     - the violet corner-tick Badge grammar for concept labels
     - the accent Chip grammar for tags/short phrases
     - the caption bar + skip/replay/get-started control chrome

   NEW IN THIS FILE:
     - none. Reuses the established grammar rather than inventing
       new shapes, so it reads as a continuation of the same series.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const WARN = "#d3555c";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — one beat per exact narration sentence, played back to
   back with a 280ms cross-fade gap. S3 (the YouTube → purchase
   story, with its day-1-to-later time jump) and S4 (connecting the
   whole journey) are the longest beats — they carry the video's two
   most important visuals and need real time to land.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "So, why do we need Global Attribution?", 2200],
  ["S2", "It helps our system remember where your visitors came from.", 3800],
  ["S3", "For example, someone might click your tracking link from a YouTube video, visit your website, and then come back later to make a purchase.", 8500],
  ["S4", "Global Attribution helps us connect those actions together, so we can understand which traffic source led to the result.", 6800],
  ["S5", "That's why Global Attribution is an important part of our tracking system.", 3600],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S5.end + 700;

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

/* Derives caption fade timing directly from a beat's SEG window —
   identical single-sentence helper from prior sections. */
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

/* ---------------- Visual primitives — regenerated locally ---------------- */

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

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
================================================================= */

/* ---- S1 — the question ---- */
const S1_PERSON_IN = { start: SEG.S1.start + 100, end: SEG.S1.start + 500 };
const S1_ARROW_IN = { start: SEG.S1.start + 500, end: SEG.S1.start + 900 };
const S1_SITE_IN = { start: SEG.S1.start + 700, end: SEG.S1.start + 1100 };
const S1_Q_IN = { start: SEG.S1.start + 900, end: SEG.S1.start + 1300 };

/* ---- S2 — VSTRK remembers the source ---- */
const S2_YT_IN = { start: SEG.S2.start + 100, end: SEG.S2.start + 500 };
const S2_LINK_ARROW = { start: SEG.S2.start + 550, end: SEG.S2.start + 950 };
const S2_LINK_CHIP_IN = { start: SEG.S2.start + 600, end: SEG.S2.start + 1000 };
const S2_SITE_ARROW = { start: SEG.S2.start + 1100, end: SEG.S2.start + 1500 };
const S2_SITE_IN = { start: SEG.S2.start + 1150, end: SEG.S2.start + 1550 };
const S2_SOURCE_CHIP_IN = { start: SEG.S2.start + 1700, end: SEG.S2.start + 2200 };
const S2_REMEMBERS_IN = { start: SEG.S2.start + 2500, end: SEG.S2.start + 3000 };
const S2_PULSE = { start: S2_REMEMBERS_IN.end + 100, end: SEG.S2.end - 200 };

/* ---- S3 — the YouTube-to-purchase story, with a time jump ---- */
const S3_DAY1_IN = { start: SEG.S3.start + 100, end: SEG.S3.start + 500 };
const S3_YT_IN = { start: SEG.S3.start + 500, end: SEG.S3.start + 950 };
const S3_LINK_IN = { start: SEG.S3.start + 1050, end: SEG.S3.start + 1450 };
const S3_CLICK_ARROW = { start: SEG.S3.start + 1550, end: SEG.S3.start + 1950 };
const S3_SITE_IN = { start: SEG.S3.start + 2600, end: SEG.S3.start + 3100 };
const S3_PERSON_LEAVE = { start: SEG.S3.start + 3600, end: SEG.S3.start + 4100 };
const S3_LATER_IN = { start: SEG.S3.start + 4300, end: SEG.S3.start + 4800 };
const S3_PERSON_RETURN = { start: SEG.S3.start + 5000, end: SEG.S3.start + 5500 };
const S3_PURCHASE_ARROW = { start: SEG.S3.start + 5700, end: SEG.S3.start + 6100 };
const S3_PURCHASE_IN = { start: SEG.S3.start + 6300, end: SEG.S3.start + 6800 };
const S3_PULSE = { start: S3_PURCHASE_IN.end + 150, end: SEG.S3.end - 250 };

/* ---- S4 — connect the whole journey, highlight the source ---- */
const S4_NODES = [
  { x: 130, y: 220, emoji: "▶️", label: "YouTube" },
  { x: 320, y: 220, emoji: "🔗", label: "Tracking Link" },
  { x: 510, y: 220, emoji: "🌐", label: "Website Visit" },
  { x: 700, y: 220, emoji: "🔁", label: "Return Visit" },
  { x: 850, y: 220, emoji: "✅", label: "Purchase" },
];
const S4_STAGGER = 350;
const S4_NODES_IN = S4_NODES.map((_, i) => ({
  start: SEG.S4.start + 100 + i * S4_STAGGER, end: SEG.S4.start + 100 + i * S4_STAGGER + 350,
}));
const S4_LINES_IN = S4_NODES.slice(1).map((_, i) => ({
  start: S4_NODES_IN[i].end + 30, end: S4_NODES_IN[i].end + 30 + 300,
}));
const S4_CHAIN_GLOW = { start: S4_NODES_IN[4].end + 150, end: S4_NODES_IN[4].end + 700 };
const S4_HIGHLIGHT_IN = { start: S4_CHAIN_GLOW.end + 200, end: S4_CHAIN_GLOW.end + 800 };
const S4_PULSE = { start: S4_HIGHLIGHT_IN.end + 150, end: SEG.S4.end - 200 };

/* ---- S5 — clean overview ---- */
const S5_STEPS = [
  { x: 160, y: 260, label: "Traffic Source" },
  { x: 380, y: 260, label: "Visitor" },
  { x: 600, y: 260, label: "Website" },
  { x: 820, y: 260, label: "Conversion" },
];
const S5_STAGGER = 220;
const S5_STEPS_IN = S5_STEPS.map((_, i) => ({
  start: SEG.S5.start + 100 + i * S5_STAGGER, end: SEG.S5.start + 100 + i * S5_STAGGER + 320,
}));
const S5_LINES_IN = { start: S5_STEPS_IN[3].end + 60, end: S5_STEPS_IN[3].end + 500 };
const S5_UNDERLINE_IN = { start: S5_LINES_IN.end + 100, end: S5_LINES_IN.end + 500 };
const S5_BADGE_IN = { start: S5_UNDERLINE_IN.end + 100, end: S5_UNDERLINE_IN.end + 600 };
const S5_PULSE = { start: S5_BADGE_IN.end + 150, end: SEG.S5.end - 200 };

export interface OnboardingGlobalAttributionVideoProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingGlobalAttributionVideo({ onSkip, onComplete }: OnboardingGlobalAttributionVideoProps = {}) {
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

  /* ---------------- Group opacities (one per narration beat) ---------------- */
  const questionOpacity = segOpacity(t, "S1");
  const rememberOpacity = segOpacity(t, "S2");
  const storyOpacity = segOpacity(t, "S3");
  const connectOpacity = segOpacity(t, "S4");
  const overviewOpacity = segOpacity(t, "S5");
  const finalFadeOut = t > SEG.S5.end - 500 ? 1 - prog(t, SEG.S5.end - 500, SEG.S5.end - 60) : 1;

  /* ---------------- S2 pulse ---------------- */
  const s2PulseVal = t > S2_PULSE.start && t < S2_PULSE.end ? Math.sin(prog(t, S2_PULSE.start, S2_PULSE.end) * Math.PI) : 0;

  /* ---------------- S3 — leave/return fade + purchase pulse ---------------- */
  const s3PersonOpacity = 1 - fadeWindow(t, S3_PERSON_LEAVE.start, S3_PERSON_LEAVE.end, S3_PERSON_RETURN.start, S3_PERSON_RETURN.end);
  const s3PulseVal = t > S3_PULSE.start && t < S3_PULSE.end ? Math.sin(prog(t, S3_PULSE.start, S3_PULSE.end) * Math.PI) : 0;

  /* ---------------- S4 — chain glow + highlight pulse ---------------- */
  const s4GlowVal = t > S4_CHAIN_GLOW.start && t < S4_CHAIN_GLOW.end ? Math.sin(prog(t, S4_CHAIN_GLOW.start, S4_CHAIN_GLOW.end) * Math.PI) : 0;
  const s4PulseVal = t > S4_PULSE.start && t < S4_PULSE.end ? Math.sin(prog(t, S4_PULSE.start, S4_PULSE.end) * Math.PI) : 0;

  /* ---------------- S5 — badge pulse ---------------- */
  const s5PulseVal = t > S5_PULSE.start && t < S5_PULSE.end ? Math.sin(prog(t, S5_PULSE.start, S5_PULSE.end) * Math.PI) : 0;

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1 — why do we need Global Attribution? ================= */}
          <g opacity={questionOpacity}>
            <text x={480} y={110} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1.2} fill={ACCENT}
              opacity={prog(t, S1_PERSON_IN.start, S1_PERSON_IN.end)} style={{ textTransform: "uppercase" }}>
              Why Global Attribution?
            </text>

            <Person x={360} y={260} size={34} opacity={prog(t, S1_PERSON_IN.start, S1_PERSON_IN.end)} emoji="🧑" />
            <DrawLine d={`M390,260 L570,260`} t={t} start={S1_ARROW_IN.start} end={S1_ARROW_IN.end} width={1.2} color={LINE} />
            <rect x={570} y={230} width={120} height={60} rx={12} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
              opacity={prog(t, S1_SITE_IN.start, S1_SITE_IN.end)} />
            <text x={630} y={264} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9.5} letterSpacing={0.4} fill={INK}
              opacity={prog(t, S1_SITE_IN.start, S1_SITE_IN.end)} style={{ textTransform: "uppercase" }}>Website</text>

            <text x={480} y={210} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={22} fill={WARN}
              opacity={fadeWindow(t, S1_Q_IN.start, S1_Q_IN.end, SEG.S1.end - 200, SEG.S1.end)}>?</text>
          </g>

          {/* ================= S2 — VSTRK remembers the source ================= */}
          <g opacity={rememberOpacity}>
            <Person x={160} y={230} size={30} opacity={prog(t, S2_YT_IN.start, S2_YT_IN.end)} emoji="▶️" />
            <text x={160} y={266} textAnchor="middle" fontFamily={MONO} fontSize={9} fontWeight={700} letterSpacing={0.4} fill={MUTED}
              opacity={prog(t, S2_YT_IN.start, S2_YT_IN.end)} style={{ textTransform: "uppercase" }}>YouTube</text>

            <DrawLine d={`M200,230 L330,230`} t={t} start={S2_LINK_ARROW.start} end={S2_LINK_ARROW.end} width={1.1} color={LINE} />
            <Chip x={400} y={230} t={t} start={S2_LINK_CHIP_IN.start} end={S2_LINK_CHIP_IN.end} label="Tracking Link" tone="accent" width={140} />

            <DrawLine d={`M470,230 L600,230`} t={t} start={S2_SITE_ARROW.start} end={S2_SITE_ARROW.end} width={1.1} color={LINE} />
            <rect x={600} y={200} width={130} height={60} rx={12} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
              opacity={prog(t, S2_SITE_IN.start, S2_SITE_IN.end)} />
            <text x={665} y={234} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9.5} letterSpacing={0.4} fill={INK}
              opacity={prog(t, S2_SITE_IN.start, S2_SITE_IN.end)} style={{ textTransform: "uppercase" }}>Website</text>

            <Chip x={480} y={330} t={t} start={S2_SOURCE_CHIP_IN.start} end={S2_SOURCE_CHIP_IN.end} label="Source: YouTube" tone="filled" width={190} />

            <circle cx={480} cy={330} r={40 + s2PulseVal * 14} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s2PulseVal * 0.35} />
            <text x={480} y={400} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={0.5} fill={ACCENT}
              opacity={fadeWindow(t, S2_REMEMBERS_IN.start, S2_REMEMBERS_IN.end, SEG.S2.end - 150, SEG.S2.end)}
              style={{ textTransform: "uppercase" }}>
              VSTRK Remembers The Source
            </text>
          </g>

          {/* ================= S3 — the YouTube-to-purchase story ================= */}
          <g opacity={storyOpacity}>
            <text x={200} y={90} textAnchor="start" fontFamily={MONO} fontWeight={800} fontSize={11} letterSpacing={1} fill={MUTED}
              opacity={fadeWindow(t, S3_DAY1_IN.start, S3_DAY1_IN.end, S3_PERSON_LEAVE.start, S3_PERSON_LEAVE.end)}
              style={{ textTransform: "uppercase" }}>
              Day 1
            </text>

            <Person x={220} y={160} size={28} opacity={prog(t, S3_YT_IN.start, S3_YT_IN.end)} emoji="▶️" />
            <text x={220} y={192} textAnchor="middle" fontFamily={MONO} fontSize={8.5} fontWeight={700} letterSpacing={0.3} fill={MUTED}
              opacity={prog(t, S3_YT_IN.start, S3_YT_IN.end)} style={{ textTransform: "uppercase" }}>YouTube Video</text>

            <DrawLine d={`M220,200 L220,240`} t={t} start={S3_LINK_IN.start} end={S3_LINK_IN.end} width={1} color={LINE} />
            <Chip x={220} y={262} t={t} start={S3_LINK_IN.start} end={S3_LINK_IN.end} label="Tracking Link" tone="accent" width={140} />

            <DrawLine d={`M290,262 L440,262`} t={t} start={S3_CLICK_ARROW.start} end={S3_CLICK_ARROW.end} width={1.1} color={LINE} />

            <g opacity={s3PersonOpacity}>
              <rect x={440} y={232} width={140} height={60} rx={12} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
                opacity={prog(t, S3_SITE_IN.start, S3_SITE_IN.end)} />
              <text x={510} y={258} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9.5} letterSpacing={0.4} fill={INK}
                opacity={prog(t, S3_SITE_IN.start, S3_SITE_IN.end)} style={{ textTransform: "uppercase" }}>Your Website</text>
              <Person x={510} y={276} size={16} opacity={prog(t, S3_SITE_IN.start, S3_SITE_IN.end)} emoji="🧑" />
            </g>

            <text x={710} y={220} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={12} letterSpacing={1} fill={ACCENT}
              opacity={fadeWindow(t, S3_LATER_IN.start, S3_LATER_IN.end, S3_PURCHASE_ARROW.start, S3_PURCHASE_ARROW.end)}
              style={{ textTransform: "uppercase" }}>
              ⏱ Later
            </text>

            <g opacity={1 - s3PersonOpacity}>
              <text x={710} y={260} textAnchor="middle" fontSize={24}
                opacity={prog(t, S3_PERSON_RETURN.start, S3_PERSON_RETURN.end)}>🧑</text>
              <text x={710} y={286} textAnchor="middle" fontFamily={MONO} fontSize={8.5} fontWeight={700} letterSpacing={0.3} fill={MUTED}
                opacity={prog(t, S3_PERSON_RETURN.start, S3_PERSON_RETURN.end)} style={{ textTransform: "uppercase" }}>
                Returns
              </text>
            </g>

            <DrawLine d={`M740,262 L820,262`} t={t} start={S3_PURCHASE_ARROW.start} end={S3_PURCHASE_ARROW.end} width={1.1} color={LINE} />

            <circle cx={860} cy={262} r={38 + s3PulseVal * 12} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s3PulseVal * 0.4} />
            <Chip x={860} y={262} t={t} start={S3_PURCHASE_IN.start} end={S3_PURCHASE_IN.end} label="Purchase ✓" tone="filled" width={130} />
          </g>

          {/* ================= S4 — connect the journey, highlight the source ================= */}
          <g opacity={connectOpacity}>
            <text x={480} y={110} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1.2} fill={ACCENT}
              opacity={prog(t, S4_NODES_IN[0].start, S4_NODES_IN[0].end)} style={{ textTransform: "uppercase" }}>
              Connecting The Journey
            </text>

            {S4_NODES.map((n, i) => (
              <g key={`s4-node-${i}`}>
                <Person x={n.x} y={n.y} size={24} opacity={prog(t, S4_NODES_IN[i].start, S4_NODES_IN[i].end)} emoji={n.emoji} />
                <text x={n.x} y={n.y + 30} textAnchor="middle" fontFamily={MONO} fontSize={8} fontWeight={700} letterSpacing={0.3} fill={MUTED}
                  opacity={prog(t, S4_NODES_IN[i].start, S4_NODES_IN[i].end)} style={{ textTransform: "uppercase" }}>{n.label}</text>
              </g>
            ))}

            {S4_NODES.slice(1).map((n, i) => (
              <DrawLine key={`s4-line-${i}`} d={`M${S4_NODES[i].x + 22},${S4_NODES[i].y} L${n.x - 22},${n.y}`} t={t}
                start={S4_LINES_IN[i].start} end={S4_LINES_IN[i].end} width={1.1} color={ACCENT} opacity={0.55} />
            ))}

            <rect x={S4_NODES[0].x - 30} y={S4_NODES[0].y - 40} width={S4_NODES[4].x - S4_NODES[0].x + 60} height={80} rx={16}
              fill="none" stroke={ACCENT} strokeWidth={1} opacity={s4GlowVal * 0.3} />

            <text x={480} y={340} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={16} letterSpacing={0.6} fill={INK}
              opacity={prog(t, S4_HIGHLIGHT_IN.start, S4_HIGHLIGHT_IN.end)}>
              YouTube → Purchase
            </text>
            <circle cx={480} cy={330} r={90 + s4PulseVal * 16} fill="none" stroke={ACCENT} strokeWidth={1}
              opacity={fadeWindow(t, S4_HIGHLIGHT_IN.start, S4_HIGHLIGHT_IN.end, SEG.S4.end - 200, SEG.S4.end) * (0.15 + s4PulseVal * 0.25)} />
          </g>

          {/* ================= S5 — clean overview ================= */}
          <g opacity={overviewOpacity}>
            {S5_STEPS.map((s, i) => (
              <g key={`s5-step-${i}`}>
                <rect x={s.x - 74} y={s.y - 28} width={148} height={56} rx={12} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
                  opacity={prog(t, S5_STEPS_IN[i].start, S5_STEPS_IN[i].end)} />
                <text x={s.x} y={s.y + 4} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9.5} letterSpacing={0.4} fill={INK}
                  opacity={prog(t, S5_STEPS_IN[i].start, S5_STEPS_IN[i].end)} style={{ textTransform: "uppercase" }}>{s.label}</text>
              </g>
            ))}

            {S5_STEPS.slice(1).map((s, i) => (
              <DrawLine key={`s5-line-${i}`} d={`M${S5_STEPS[i].x + 76},${S5_STEPS[i].y} L${s.x - 76},${s.y}`} t={t}
                start={S5_LINES_IN.start} end={S5_LINES_IN.end} width={1.1} color={LINE} />
            ))}

            <DrawLine d={`M${S5_STEPS[0].x},${S5_STEPS[0].y + 46} C${S5_STEPS[0].x},${S5_STEPS[0].y + 100} ${S5_STEPS[3].x},${S5_STEPS[3].y + 100} ${S5_STEPS[3].x},${S5_STEPS[3].y + 46}`}
              t={t} start={S5_UNDERLINE_IN.start} end={S5_UNDERLINE_IN.end} width={1.3} color={ACCENT} dash="3 6" />

            <circle cx={480} cy={430} r={30 + s5PulseVal * 10} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s5PulseVal * 0.4} />
            <Badge x={480} y={430} t={t} arriveStart={S5_BADGE_IN.start} arriveEnd={S5_BADGE_IN.end} label="Global Attribution" width={220} filled />
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
              whiteSpace: "pre-line", lineHeight: 1.35, maxWidth: 720,
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
            Got it <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
