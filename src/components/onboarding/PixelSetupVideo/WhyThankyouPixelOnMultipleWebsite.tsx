import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL — Thank-You Page Pixels
   "Why do I need to install a pixel on every Thank-You Page?"

   Standalone, modular scene file. Independently renderable.
   Regenerates the same visual language, primitives and timing
   philosophy locally (no import-time dependency), matching
   OnboardingVideoSection06 and the rest of the series.

   STORY: Explains why different Thank-You Pages need their own
   pixels. Each Thank-You Page represents a different completed
   action (Purchase, Booking, Consultation). Global Attribution
   is website-level; Thank-You Page Pixels identify completed
   actions.

   PRODUCT GROUNDING:
     - Conceptual / illustrative only. No real marketplace UI,
       no new schema, no technical implementation details.
     - Narration used verbatim, word-for-word, split into beats
       that map cleanly to the visual scenes.

   REUSED (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp / segOpacity / rangeOpacity
     - DrawLine, Badge, Chip, Person
     - violet corner-tick Badge grammar
     - accent Chip grammar
     - autoCaption()
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const WARN = "#d3555c";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";
const SUCCESS = "#2f9e6b";

/* ---------------------------------------------------------------
   Timing — one beat per exact narration unit, 280ms cross-fade
   gaps, same philosophy as Section 06. Longer beats give the
   key visual ideas room to land.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "You might be wondering:\n“Why do I need to install a pixel on every Thank-You Page?”", 4200],
  ["S2", "Because each Thank-You Page represents a different completed action.", 3800],
  ["S3", "For example:\nYour Purchase Thank-You Page tells us someone purchased.", 4000],
  ["S4", "Your Booking Thank-You Page tells us someone completed a booking.", 3600],
  ["S5", "Your Consultation Thank-You Page tells us someone completed a consultation.", 4000],
  ["S6", "So if you have different funnels with different Thank-You Pages, each one needs its own pixel.", 4800],
  ["S7", "Remember:\nGlobal Attribution is for the website.\nThank-You Page Pixels are for the completed action.", 5200],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S7.end + 700;

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

/* ---------------- Visual primitives — same grammar as Section 06 ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE, dash }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string; dash?: string }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray={dash ? dash : 1} strokeDashoffset={dash ? undefined : 1 - p} opacity={opacity * (dash ? p : 1)} />
  );
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
  { x: number; y: number; t: number; start: number; end: number; label: string; tone?: "muted" | "accent" | "filled" | "warn" | "success"; width?: number; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 24;
  const bx = x - width / 2, by = y - h / 2;
  const tColor = tone === "warn" ? WARN : tone === "success" ? SUCCESS : ACCENT;
  const fill = tone === "filled" || tone === "success" ? tColor : "#ffffff";
  const stroke = tone === "muted" ? LINE : tColor;
  const textFill = tone === "filled" || tone === "success" ? "#ffffff" : tone === "muted" ? MUTED : tColor;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.1} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.4} fill={textFill}
        style={{ textTransform: tone === "muted" ? "none" : "uppercase" }}>{label}</text>
    </g>
  );
}

function Person({ x, y, size = 26, opacity = 1, emoji = "🧑" }: { x: number; y: number; size?: number; opacity?: number; emoji?: string }) {
  return <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} opacity={opacity}>{emoji}</text>;
}

/* Simple page-card glyph used for Thank-You Page mockups */
function PageCard({ x, y, t, start, end, title, subtitle, w = 150, h = 90, fade = 1 }:
  { x: number; y: number; t: number; start: number; end: number; title: string; subtitle?: string; w?: number; h?: number; fade?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p * fade} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={10} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.06))" }} />
      <rect x={x - w / 2} y={y - h / 2} width={w} height={18} rx={10} fill={ACCENT} opacity={0.12} />
      <text x={x} y={y - 12} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={10} letterSpacing={0.4} fill={INK}
        style={{ textTransform: "uppercase" }}>{title}</text>
      {subtitle && (
        <text x={x} y={y + 12} textAnchor="middle" fontFamily={MONO} fontSize={9} fill={MUTED}>{subtitle}</text>
      )}
    </g>
  );
}

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
================================================================= */

/* ---- S1 — the question + three funnels ---- */
const S1_HEAD = { start: SEG.S1.start + 80, end: SEG.S1.start + 500 };
const S1_FUNNELS = [
  { start: SEG.S1.start + 600, end: SEG.S1.start + 1000 },
  { start: SEG.S1.start + 900, end: SEG.S1.start + 1300 },
  { start: SEG.S1.start + 1200, end: SEG.S1.start + 1600 },
];
const S1_ARROWS = { start: SEG.S1.start + 1700, end: SEG.S1.start + 2300 };
const S1_PAGES = { start: SEG.S1.start + 2400, end: SEG.S1.start + 2900 };
const S1_Q = { start: SEG.S1.start + 3100, end: SEG.S1.end - 200 };

/* ---- S2 — core concept: three distinct Thank-You Pages ---- */
const S2_HEAD = { start: SEG.S2.start + 80, end: SEG.S2.start + 500 };
const S2_PAGES = [
  { start: SEG.S2.start + 600, end: SEG.S2.start + 1000 },
  { start: SEG.S2.start + 900, end: SEG.S2.start + 1300 },
  { start: SEG.S2.start + 1200, end: SEG.S2.start + 1600 },
];
const S2_ACTIONS = { start: SEG.S2.start + 1800, end: SEG.S2.start + 2400 };
const S2_NOTE = { start: SEG.S2.start + 2600, end: SEG.S2.end - 200 };

/* ---- S3 — Purchase example ---- */
const S3_FUNNEL = { start: SEG.S3.start + 100, end: SEG.S3.start + 500 };
const S3_ARROW1 = { start: SEG.S3.start + 550, end: SEG.S3.start + 900 };
const S3_PAGE = { start: SEG.S3.start + 950, end: SEG.S3.start + 1400 };
const S3_ARROW2 = { start: SEG.S3.start + 1450, end: SEG.S3.start + 1800 };
const S3_DONE = { start: SEG.S3.start + 1850, end: SEG.S3.start + 2300 };
const S3_PIXEL = { start: SEG.S3.start + 2500, end: SEG.S3.end - 200 };

/* ---- S4 — Booking example (same structure, shifted) ---- */
const S4_FUNNEL = { start: SEG.S4.start + 100, end: SEG.S4.start + 500 };
const S4_ARROW1 = { start: SEG.S4.start + 550, end: SEG.S4.start + 900 };
const S4_PAGE = { start: SEG.S4.start + 950, end: SEG.S4.start + 1400 };
const S4_ARROW2 = { start: SEG.S4.start + 1450, end: SEG.S4.start + 1800 };
const S4_DONE = { start: SEG.S4.start + 1850, end: SEG.S4.start + 2300 };
const S4_PIXEL = { start: SEG.S4.start + 2500, end: SEG.S4.end - 200 };

/* ---- S5 — Consultation example ---- */
const S5_FUNNEL = { start: SEG.S5.start + 100, end: SEG.S5.start + 500 };
const S5_ARROW1 = { start: SEG.S5.start + 550, end: SEG.S5.start + 900 };
const S5_PAGE = { start: SEG.S5.start + 950, end: SEG.S5.start + 1400 };
const S5_ARROW2 = { start: SEG.S5.start + 1450, end: SEG.S5.start + 1800 };
const S5_DONE = { start: SEG.S5.start + 1850, end: SEG.S5.start + 2300 };
const S5_PIXEL = { start: SEG.S5.start + 2500, end: SEG.S5.end - 200 };

/* ---- S6 — all three funnels together ---- */
const S6_HEAD = { start: SEG.S6.start + 80, end: SEG.S6.start + 500 };
const S6_COL1 = { start: SEG.S6.start + 600, end: SEG.S6.start + 1100 };
const S6_COL2 = { start: SEG.S6.start + 900, end: SEG.S6.start + 1400 };
const S6_COL3 = { start: SEG.S6.start + 1200, end: SEG.S6.start + 1700 };
const S6_NOTE = { start: SEG.S6.start + 2000, end: SEG.S6.end - 200 };

/* ---- S7 — side-by-side comparison ---- */
const S7_LEFT = { start: SEG.S7.start + 100, end: SEG.S7.start + 700 };
const S7_RIGHT = { start: SEG.S7.start + 400, end: SEG.S7.start + 1000 };
const S7_DIVIDER = { start: SEG.S7.start + 800, end: SEG.S7.start + 1200 };
const S7_GLOBAL = { start: SEG.S7.start + 1300, end: SEG.S7.start + 2000 };
const S7_PIXELS = { start: SEG.S7.start + 1600, end: SEG.S7.start + 2400 };
const S7_HOLD = { start: SEG.S7.start + 2600, end: SEG.S7.end - 200 };

export interface OnboardingVideoThankYouPixelsProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingVideoThankYouPixels({ onSkip, onComplete }: OnboardingVideoThankYouPixelsProps = {}) {
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

  /* ---------------- Group opacities ---------------- */
  const s1Op = segOpacity(t, "S1");
  const s2Op = segOpacity(t, "S2");
  const s3Op = segOpacity(t, "S3");
  const s4Op = segOpacity(t, "S4");
  const s5Op = segOpacity(t, "S5");
  const s6Op = segOpacity(t, "S6");
  const s7Op = segOpacity(t, "S7");
  const finalFadeOut = t > SEG.S7.end - 500 ? 1 - prog(t, SEG.S7.end - 500, SEG.S7.end - 60) : 1;

  /* Layout helpers for three-column examples */
  const COL = [240, 480, 720];
  const FUNNEL_Y = 160;
  const PAGE_Y = 280;
  const DONE_Y = 400;

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1 — the question ================= */}
          <g opacity={s1Op}>
            <Badge x={480} y={56} t={t} arriveStart={S1_HEAD.start} arriveEnd={S1_HEAD.end} label="The Question" width={180} filled />

            {/* Three funnel labels */}
            {["Purchase", "Booking", "Consultation"].map((label, i) => (
              <g key={`f1-${i}`}>
                <Chip x={COL[i]} y={FUNNEL_Y} t={t} start={S1_FUNNELS[i].start} end={S1_FUNNELS[i].end}
                  label={label} tone="accent" width={130} />
                <DrawLine d={`M${COL[i]},${FUNNEL_Y + 20} L${COL[i]},${PAGE_Y - 50}`} t={t}
                  start={S1_ARROWS.start} end={S1_ARROWS.end} width={1.2} color={ACCENT} opacity={0.6} />
                <PageCard x={COL[i]} y={PAGE_Y} t={t} start={S1_PAGES.start} end={S1_PAGES.end}
                  title="Thank-You" subtitle={`${label}`} w={140} h={70} />
              </g>
            ))}

            <text x={480} y={430} textAnchor="middle" fontFamily={MONO} fontSize={13} fontWeight={700} letterSpacing={0.5} fill={ACCENT}
              opacity={fadeWindow(t, S1_Q.start, S1_Q.start + 200, SEG.S1.end - 200, SEG.S1.end)}
              style={{ textTransform: "uppercase" }}>
              Why does each Thank-You Page need a pixel?
            </text>
          </g>

          {/* ================= S2 — core concept ================= */}
          <g opacity={s2Op}>
            <Badge x={480} y={56} t={t} arriveStart={S2_HEAD.start} arriveEnd={S2_HEAD.end} label="Core Concept" width={180} filled />

            {[
              { title: "Thank You", sub: "Purchase Complete", action: "Purchase ✓" },
              { title: "Thank You", sub: "Booking Complete", action: "Booking ✓" },
              { title: "Thank You", sub: "Consultation Complete", action: "Consultation ✓" },
            ].map((item, i) => (
              <g key={`s2p-${i}`}>
                <PageCard x={COL[i]} y={200} t={t} start={S2_PAGES[i].start} end={S2_PAGES[i].end}
                  title={item.title} subtitle={item.sub} w={160} h={80} />
                <DrawLine d={`M${COL[i]},${250} L${COL[i]},${320}`} t={t}
                  start={S2_ACTIONS.start} end={S2_ACTIONS.end} width={1.2} color={ACCENT} opacity={0.55} />
                <Chip x={COL[i]} y={350} t={t} start={S2_ACTIONS.start} end={S2_ACTIONS.end}
                  label={item.action} tone="success" width={150} />
              </g>
            ))}

            <text x={480} y={440} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={0.6} fill={MUTED}
              opacity={fadeWindow(t, S2_NOTE.start, S2_NOTE.start + 200, SEG.S2.end - 150, SEG.S2.end)}
              style={{ textTransform: "uppercase" }}>
              Different Thank-You Page = Different completed action
            </text>
          </g>

          {/* ================= S3 — Purchase ================= */}
          <g opacity={s3Op}>
            <text x={480} y={70} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={800} letterSpacing={1.2} fill={ACCENT}
              opacity={prog(t, S3_FUNNEL.start, S3_FUNNEL.end)} style={{ textTransform: "uppercase" }}>
              Purchase Example
            </text>

            <Chip x={480} y={140} t={t} start={S3_FUNNEL.start} end={S3_FUNNEL.end} label="Purchase Funnel" tone="accent" width={180} />
            <DrawLine d={`M480,160 L480,210`} t={t} start={S3_ARROW1.start} end={S3_ARROW1.end} width={1.3} color={ACCENT} />
            <PageCard x={480} y={260} t={t} start={S3_PAGE.start} end={S3_PAGE.end}
              title="Thank You" subtitle="Purchase Complete" w={180} h={80} />
            <DrawLine d={`M480,310 L480,360`} t={t} start={S3_ARROW2.start} end={S3_ARROW2.end} width={1.3} color={ACCENT} />
            <Chip x={480} y={390} t={t} start={S3_DONE.start} end={S3_DONE.end} label="Purchase Completed ✓" tone="success" width={200} />
            <Badge x={480} y={460} t={t} arriveStart={S3_PIXEL.start} arriveEnd={S3_PIXEL.end} label="Purchase Pixel ✓" width={180} filled />
          </g>

          {/* ================= S4 — Booking ================= */}
          <g opacity={s4Op}>
            <text x={480} y={70} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={800} letterSpacing={1.2} fill={ACCENT}
              opacity={prog(t, S4_FUNNEL.start, S4_FUNNEL.end)} style={{ textTransform: "uppercase" }}>
              Booking Example
            </text>

            <Chip x={480} y={140} t={t} start={S4_FUNNEL.start} end={S4_FUNNEL.end} label="Booking Funnel" tone="accent" width={180} />
            <DrawLine d={`M480,160 L480,210`} t={t} start={S4_ARROW1.start} end={S4_ARROW1.end} width={1.3} color={ACCENT} />
            <PageCard x={480} y={260} t={t} start={S4_PAGE.start} end={S4_PAGE.end}
              title="Thank You" subtitle="Booking Complete" w={180} h={80} />
            <DrawLine d={`M480,310 L480,360`} t={t} start={S4_ARROW2.start} end={S4_ARROW2.end} width={1.3} color={ACCENT} />
            <Chip x={480} y={390} t={t} start={S4_DONE.start} end={S4_DONE.end} label="Booking Completed ✓" tone="success" width={200} />
            <Badge x={480} y={460} t={t} arriveStart={S4_PIXEL.start} arriveEnd={S4_PIXEL.end} label="Booking Pixel ✓" width={180} filled />
          </g>

          {/* ================= S5 — Consultation ================= */}
          <g opacity={s5Op}>
            <text x={480} y={70} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={800} letterSpacing={1.2} fill={ACCENT}
              opacity={prog(t, S5_FUNNEL.start, S5_FUNNEL.end)} style={{ textTransform: "uppercase" }}>
              Consultation Example
            </text>

            <Chip x={480} y={140} t={t} start={S5_FUNNEL.start} end={S5_FUNNEL.end} label="Consultation Funnel" tone="accent" width={200} />
            <DrawLine d={`M480,160 L480,210`} t={t} start={S5_ARROW1.start} end={S5_ARROW1.end} width={1.3} color={ACCENT} />
            <PageCard x={480} y={260} t={t} start={S5_PAGE.start} end={S5_PAGE.end}
              title="Thank You" subtitle="Consultation Complete" w={190} h={80} />
            <DrawLine d={`M480,310 L480,360`} t={t} start={S5_ARROW2.start} end={S5_ARROW2.end} width={1.3} color={ACCENT} />
            <Chip x={480} y={390} t={t} start={S5_DONE.start} end={S5_DONE.end} label="Consultation Completed ✓" tone="success" width={230} />
            <Badge x={480} y={460} t={t} arriveStart={S5_PIXEL.start} arriveEnd={S5_PIXEL.end} label="Consultation Pixel ✓" width={210} filled />
          </g>

          {/* ================= S6 — multiple funnels together ================= */}
          <g opacity={s6Op}>
            <Badge x={480} y={50} t={t} arriveStart={S6_HEAD.start} arriveEnd={S6_HEAD.end} label="Multiple Funnels" width={200} filled />

            {[
              { funnel: "Purchase", page: "Purchase TY", pixel: "Purchase Pixel", start: S6_COL1 },
              { funnel: "Booking", page: "Booking TY", pixel: "Booking Pixel", start: S6_COL2 },
              { funnel: "Consultation", page: "Consultation TY", pixel: "Consultation Pixel", start: S6_COL3 },
            ].map((col, i) => (
              <g key={`s6-${i}`}>
                <Chip x={COL[i]} y={130} t={t} start={col.start.start} end={col.start.end} label={col.funnel} tone="accent" width={140} />
                <DrawLine d={`M${COL[i]},150 L${COL[i]},195`} t={t} start={col.start.start + 200} end={col.start.end + 200} width={1.1} color={ACCENT} opacity={0.55} />
                <PageCard x={COL[i]} y={240} t={t} start={col.start.start + 300} end={col.start.end + 300}
                  title="Thank-You" subtitle={col.page} w={140} h={70} />
                <DrawLine d={`M${COL[i]},285 L${COL[i]},330`} t={t} start={col.start.start + 500} end={col.start.end + 500} width={1.1} color={ACCENT} opacity={0.55} />
                <Badge x={COL[i]} y={360} t={t} arriveStart={col.start.start + 600} arriveEnd={col.start.end + 700}
                  label={col.pixel} width={150} filled />
              </g>
            ))}

            <text x={480} y={450} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} letterSpacing={0.5} fill={MUTED}
              opacity={fadeWindow(t, S6_NOTE.start, S6_NOTE.start + 200, SEG.S6.end - 150, SEG.S6.end)}
              style={{ textTransform: "uppercase" }}>
              Different completed actions → different pixels
            </text>
          </g>

          {/* ================= S7 — Global vs Thank-You Page Pixels ================= */}
          <g opacity={s7Op}>
            {/* Left column — Global Attribution */}
            <g opacity={prog(t, S7_LEFT.start, S7_LEFT.end)}>
              <text x={250} y={70} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1} fill={ACCENT}
                style={{ textTransform: "uppercase" }}>Global Attribution</text>
              <text x={250} y={92} textAnchor="middle" fontFamily={MONO} fontSize={10} fill={MUTED}
                style={{ textTransform: "uppercase" }}>Website Level</text>

              <rect x={120} y={120} width={260} height={280} rx={12} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
                style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.05))" }} />

              <Chip x={250} y={160} t={t} start={S7_GLOBAL.start} end={S7_GLOBAL.end} label="Website" tone="accent" width={140} />
              <DrawLine d={`M250,180 L250,220`} t={t} start={S7_GLOBAL.start + 200} end={S7_GLOBAL.end + 200} width={1.1} color={LINE} />
              <text x={250} y={245} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fill={MUTED} opacity={prog(t, S7_GLOBAL.start + 300, S7_GLOBAL.end + 300)}>
                Sales Booking · Consultation · Direct Purchase
              </text>
              <DrawLine d={`M250,265 L250,300`} t={t} start={S7_GLOBAL.start + 400} end={S7_GLOBAL.end + 400} width={1.1} color={LINE} />
              <Badge x={250} y={340} t={t} arriveStart={S7_GLOBAL.start + 500} arriveEnd={S7_GLOBAL.end + 600}
                label="One Global Setup" width={180} filled />
            </g>

            {/* Divider */}
            <line x1={480} y1={110} x2={480} y2={420} stroke={LINE} strokeWidth={1.2} strokeDasharray="4 6"
              opacity={prog(t, S7_DIVIDER.start, S7_DIVIDER.end) * 0.7} />

            {/* Right column — Thank-You Page Pixels */}
            <g opacity={prog(t, S7_RIGHT.start, S7_RIGHT.end)}>
              <text x={710} y={70} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1} fill={ACCENT}
                style={{ textTransform: "uppercase" }}>Thank-You Page Pixels</text>
              <text x={710} y={92} textAnchor="middle" fontFamily={MONO} fontSize={10} fill={MUTED}
                style={{ textTransform: "uppercase" }}>Completed Action</text>

              <rect x={580} y={120} width={260} height={280} rx={12} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
                style={{ filter: "drop-shadow(0 3px 8px rgba(21,21,31,0.05))" }} />

              {[
                { page: "Purchase TY", pixel: "Purchase Pixel", dy: 0 },
                { page: "Booking TY", pixel: "Booking Pixel", dy: 70 },
                { page: "Consultation TY", pixel: "Consultation Pixel", dy: 140 },
              ].map((row, i) => (
                <g key={`s7r-${i}`}>
                  <text x={650} y={170 + row.dy} textAnchor="start" fontFamily={MONO} fontSize={9.5} fill={INK}
                    opacity={prog(t, S7_PIXELS.start + i * 150, S7_PIXELS.end + i * 150)}>{row.page}</text>
                  <text x={650} y={188 + row.dy} textAnchor="start" fontFamily={MONO} fontSize={9} fill={ACCENT}
                    opacity={prog(t, S7_PIXELS.start + i * 150 + 80, S7_PIXELS.end + i * 150 + 80)}>→ {row.pixel}</text>
                </g>
              ))}
            </g>

            {/* Final takeaway line */}
            <text x={480} y={460} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={700} letterSpacing={0.6} fill={INK}
              opacity={fadeWindow(t, S7_HOLD.start, S7_HOLD.start + 200, SEG.S7.end - 200, SEG.S7.end)}
              style={{ textTransform: "uppercase" }}>
              Global = Website  ·  Pixels = Completed Actions
            </text>
          </g>
        </svg>
      </div>

      {/* ---------- Caption bar ---------- */}
      <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 6, position: "relative", width: "100%", maxWidth: 720 }}>
        {CAPTIONS.map((c, i) => {
          const op = fadeWindow(t, c.a, c.b, c.c, c.d);
          if (op <= 0.001) return null;
          return (
            <p key={i} style={{
              position: "absolute", margin: 0, fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
              fontSize: 20, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center",
              whiteSpace: "pre-line", lineHeight: 1.4,
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
            Get started <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
