import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, "Why do we need the Thank-You Page Pixel?"

   Standalone, modular scene file. Independently renderable — does
   NOT require any other onboarding section to be mounted. It
   regenerates the same visual language, primitives and timing
   philosophy locally (no import-time dependency), exactly the way
   Section 06 stayed self-contained from the sections before it.

   STORY: A visitor clicking a tracked link only tells VSTRK someone
   showed up — not that they actually finished the goal (a purchase,
   a booking, a sign-up). The Thank-You Page Pixel is what tells
   VSTRK the action really happened, so it has to live on the
   Thank-You Page for that specific funnel. This section walks:
   the pixel's job → click vs. completion → where it goes → you're
   not on your own setting it up (WhatsApp support).

   PRODUCT GROUNDING:
     - Deliberately non-technical. No mention of JavaScript, code,
       localStorage, event schemas, APIs, or backend architecture —
       per the brief, the viewer only needs the one idea: the pixel
       confirms the action actually completed.
     - Does not imply one pixel tracks every action on a site — the
       pixel is tied to the specific completed action represented by
       that Thank-You Page (Direct Purchase / Sales Booking / Paid
       Consultation / Newsletter Sign-Up are shown as examples of
       that action, not as things one pixel universally covers).
     - Narration is used verbatim, split one beat per sentence,
       matching the established one-sentence-per-beat philosophy.
       Installation steps are explicitly NOT covered — that's a
       separate video, per the brief.

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
   back with a 280ms cross-fade gap, same philosophy as prior
   sections. S1 (what the pixel does) and S4 (support) are the
   longest beats — S1 has three example actions to land, S4 carries
   the full WhatsApp reassurance line.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "The Thank-You Page Pixel tells us when someone has successfully completed an action, such as making a purchase, booking a consultation, or signing up.", 7000],
  ["S2", "So instead of only knowing that someone clicked your link, we can know when they actually completed the action.", 5200],
  ["S3", "That's why the pixel needs to be installed on your Thank-You Page.", 3400],
  ["S4", "And remember, if you have any questions or you're not sure where to install it, just join our WhatsApp support group and we'll help you with the setup.", 6800],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S4.end + 700;

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

/* ---- S1 — what the pixel does: actions -> Thank-You Page -> VSTRK ---- */
const S1_TITLE_IN = { start: SEG.S1.start + 100, end: SEG.S1.start + 550 };
const ACTION_NODES = [
  { x: 220, y: 190, emoji: "🛒", label: "Purchase" },
  { x: 340, y: 150, emoji: "📅", label: "Booking" },
  { x: 460, y: 190, emoji: "✍️", label: "Sign Up" },
];
const S1_ACTION_STAGGER = 220;
const S1_ACTIONS_IN = ACTION_NODES.map((_, i) => ({
  start: SEG.S1.start + 700 + i * S1_ACTION_STAGGER, end: SEG.S1.start + 700 + i * S1_ACTION_STAGGER + 420,
}));
const TY_BOX = { x: 340, y: 300 };
const S1_TY_BOX_IN = { start: S1_ACTIONS_IN[2].end + 250, end: S1_ACTIONS_IN[2].end + 750 };
const S1_LINES_IN = ACTION_NODES.map((n, i) => ({
  start: S1_TY_BOX_IN.end + 80 + i * 80, end: S1_TY_BOX_IN.end + 80 + i * 80 + 380,
}));
const S1_PIXEL_IN = { start: S1_LINES_IN[2].end + 150, end: S1_LINES_IN[2].end + 650 };
const HUB = { x: 700, y: 300 };
const S1_LINE_TO_HUB = { start: S1_PIXEL_IN.end + 100, end: S1_PIXEL_IN.end + 500 };
const S1_HUB_IN = { start: S1_LINE_TO_HUB.end + 80, end: S1_LINE_TO_HUB.end + 560 };
const S1_COMPLETED_CHIP = { start: S1_HUB_IN.end + 120, end: S1_HUB_IN.end + 600 };
const S1_PULSE = { start: S1_COMPLETED_CHIP.end + 150, end: SEG.S1.end - 200 };

/* ---- S2 — click vs. completed ---- */
const S2_LEFT_LABEL_IN = { start: SEG.S2.start + 100, end: SEG.S2.start + 500 };
const S2_LINK_IN = { start: SEG.S2.start + 550, end: SEG.S2.start + 1000 };
const S2_CLICK_CHIP_IN = { start: SEG.S2.start + 1050, end: SEG.S2.start + 1500 };
const S2_DIVIDER_IN = { start: SEG.S2.start + 1200, end: SEG.S2.start + 1600 };
const S2_RIGHT_LABEL_IN = { start: SEG.S2.start + 1300, end: SEG.S2.start + 1700 };
const S2_COMPLETE_CHIP_IN = { start: SEG.S2.start + 1800, end: SEG.S2.start + 2300 };
const S2_NEQ_TEXT_IN = { start: SEG.S2.start + 2500, end: SEG.S2.start + 3000 };
const S2_ARROW_TEXT_IN = { start: SEG.S2.start + 3400, end: SEG.S2.start + 3900 };
const S2_PULSE = { start: S2_ARROW_TEXT_IN.end + 150, end: SEG.S2.end - 200 };

/* ---- S3 — the funnel, Thank-You Page highlighted ---- */
const FUNNEL_STEPS = [
  { x: 220, y: 260, label: "Landing Page" },
  { x: 480, y: 260, label: "Checkout / Booking" },
  { x: 740, y: 260, label: "Thank-You Page" },
];
const S3_STEP_STAGGER = 180;
const S3_STEPS_IN = FUNNEL_STEPS.map((_, i) => ({
  start: SEG.S3.start + 100 + i * S3_STEP_STAGGER, end: SEG.S3.start + 100 + i * S3_STEP_STAGGER + 380,
}));
const S3_ARROWS_IN = { start: S3_STEPS_IN[2].end + 60, end: S3_STEPS_IN[2].end + 460 };
const S3_HIGHLIGHT = { start: S3_ARROWS_IN.end + 100, end: SEG.S3.end - 300 };
const S3_PIXEL_MARK_IN = { start: S3_ARROWS_IN.end + 150, end: S3_ARROWS_IN.end + 600 };
const S3_TEXT_IN = { start: S3_PIXEL_MARK_IN.end + 100, end: S3_PIXEL_MARK_IN.end + 550 };

/* ---- S4 — support ---- */
const S4_BUBBLE_IN = { start: SEG.S4.start + 200, end: SEG.S4.start + 800 };
const S4_BADGE_IN = { start: SEG.S4.start + 900, end: SEG.S4.start + 1400 };
const S4_TEXT_IN = { start: SEG.S4.start + 1700, end: SEG.S4.start + 2300 };
const S4_PULSE = { start: S4_BADGE_IN.end + 200, end: SEG.S4.end - 300 };

export interface OnboardingThankYouPixelVideoProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingThankYouPixelVideo({ onSkip, onComplete }: OnboardingThankYouPixelVideoProps = {}) {
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
  const whatItDoesOpacity = segOpacity(t, "S1");
  const clickVsCompletedOpacity = segOpacity(t, "S2");
  const funnelOpacity = segOpacity(t, "S3");
  const supportOpacity = segOpacity(t, "S4");
  const finalFadeOut = t > SEG.S4.end - 500 ? 1 - prog(t, SEG.S4.end - 500, SEG.S4.end - 60) : 1;

  /* ---------------- S1 pulses ---------------- */
  const s1PulseVal = t > S1_PULSE.start && t < S1_PULSE.end ? Math.sin(prog(t, S1_PULSE.start, S1_PULSE.end) * Math.PI) : 0;

  /* ---------------- S2 pulses ---------------- */
  const s2PulseVal = t > S2_PULSE.start && t < S2_PULSE.end ? Math.sin(prog(t, S2_PULSE.start, S2_PULSE.end) * Math.PI) : 0;

  /* ---------------- S3 highlight ring ---------------- */
  const s3HighlightVal = t > S3_HIGHLIGHT.start && t < S3_HIGHLIGHT.end ? Math.sin(prog(t, S3_HIGHLIGHT.start, S3_HIGHLIGHT.end) * Math.PI) : 0;

  /* ---------------- S4 pulses ---------------- */
  const s4PulseVal = t > S4_PULSE.start && t < S4_PULSE.end ? Math.sin(prog(t, S4_PULSE.start, S4_PULSE.end) * Math.PI) : 0;

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1 — what the pixel does ================= */}
          <g opacity={whatItDoesOpacity}>
            <Badge x={480} y={62} t={t} arriveStart={S1_TITLE_IN.start} arriveEnd={S1_TITLE_IN.end} label="Thank-You Page Pixel" width={280} filled />

            {ACTION_NODES.map((n, i) => (
              <g key={`act-${i}`}>
                <Person x={n.x} y={n.y} size={26} opacity={prog(t, S1_ACTIONS_IN[i].start, S1_ACTIONS_IN[i].end)} emoji={n.emoji} />
                <text x={n.x} y={n.y + 26} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fontWeight={700} letterSpacing={0.4} fill={MUTED}
                  opacity={prog(t, S1_ACTIONS_IN[i].start, S1_ACTIONS_IN[i].end)} style={{ textTransform: "uppercase" }}>{n.label}</text>
              </g>
            ))}

            <rect x={TY_BOX.x - 90} y={TY_BOX.y - 32} width={180} height={64} rx={12} fill="#ffffff" stroke={ACCENT} strokeWidth={1.3}
              opacity={prog(t, S1_TY_BOX_IN.start, S1_TY_BOX_IN.end)}
              style={{ filter: "drop-shadow(0 4px 10px rgba(91,61,240,0.14))" }} />
            <text x={TY_BOX.x} y={TY_BOX.y - 4} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={10.5} letterSpacing={0.6} fill={INK}
              opacity={prog(t, S1_TY_BOX_IN.start, S1_TY_BOX_IN.end)} style={{ textTransform: "uppercase" }}>Thank-You Page</text>
            <text x={TY_BOX.x} y={TY_BOX.y + 16} textAnchor="middle" fontSize={16}
              opacity={prog(t, S1_TY_BOX_IN.start, S1_TY_BOX_IN.end)}>🎉</text>

            {ACTION_NODES.map((n, i) => (
              <DrawLine key={`line-act-${i}`} d={`M${n.x},${n.y + 18} L${TY_BOX.x + (i - 1) * 30},${TY_BOX.y - 34}`} t={t}
                start={S1_LINES_IN[i].start} end={S1_LINES_IN[i].end} width={1} color={LINE} />
            ))}

            <EyeNode x={TY_BOX.x} y={TY_BOX.y + 46} t={t} arriveStart={S1_PIXEL_IN.start} arriveEnd={S1_PIXEL_IN.end}
              label="Pixel" labelSide="center" r={6.5} pulse={s1PulseVal * 0.4} />

            <DrawLine d={`M${TY_BOX.x + 90},${TY_BOX.y} L${HUB.x - 34},${HUB.y}`} t={t}
              start={S1_LINE_TO_HUB.start} end={S1_LINE_TO_HUB.end} width={1.2} color={ACCENT} opacity={0.65} />

            <circle cx={HUB.x} cy={HUB.y} r={26 + s1PulseVal * 14} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s1PulseVal * 0.45} />
            <Badge x={HUB.x} y={HUB.y} t={t} arriveStart={S1_HUB_IN.start} arriveEnd={S1_HUB_IN.end} label="VSTRK" width={100} filled />

            <Chip x={HUB.x} y={HUB.y + 54} t={t} start={S1_COMPLETED_CHIP.start} end={S1_COMPLETED_CHIP.end} label="Completed ✓" tone="filled" width={140} />
          </g>

          {/* ================= S2 — click vs. completed ================= */}
          <g opacity={clickVsCompletedOpacity}>
            <Badge x={260} y={140} t={t} arriveStart={S2_LEFT_LABEL_IN.start} arriveEnd={S2_LEFT_LABEL_IN.end} label="Click" width={110} />
            <Person x={260} y={210} size={30} emoji="🔗" opacity={prog(t, S2_LINK_IN.start, S2_LINK_IN.end)} />
            <Chip x={260} y={266} t={t} start={S2_CLICK_CHIP_IN.start} end={S2_CLICK_CHIP_IN.end} label="Visitor Clicked" tone="muted" width={160} />

            <DrawLine d={`M480,120 L480,300`} t={t} start={S2_DIVIDER_IN.start} end={S2_DIVIDER_IN.end} width={1} color={LINE} dash="2 6" />

            <Badge x={700} y={140} t={t} arriveStart={S2_RIGHT_LABEL_IN.start} arriveEnd={S2_RIGHT_LABEL_IN.end} label="Completed" width={140} filled />
            <Person x={700} y={210} size={30} emoji="✅" opacity={prog(t, S2_COMPLETE_CHIP_IN.start, S2_COMPLETE_CHIP_IN.end)} />
            <Chip x={700} y={266} t={t} start={S2_COMPLETE_CHIP_IN.start} end={S2_COMPLETE_CHIP_IN.end} label="Action Finished" tone="filled" width={170} />

            <text x={480} y={360} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={16} letterSpacing={1} fill={INK}
              opacity={fadeWindow(t, S2_NEQ_TEXT_IN.start, S2_NEQ_TEXT_IN.end, SEG.S2.end - 250, SEG.S2.end)}>
              Click ≠ Completion
            </text>

            <text x={480} y={396} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={0.5} fill={ACCENT}
              opacity={fadeWindow(t, S2_ARROW_TEXT_IN.start, S2_ARROW_TEXT_IN.end, SEG.S2.end - 150, SEG.S2.end)}
              style={{ textTransform: "uppercase" }}>
              Thank-You Page Pixel → Completion
            </text>
          </g>

          {/* ================= S3 — the funnel, Thank-You Page highlighted ================= */}
          <g opacity={funnelOpacity}>
            <text x={480} y={110} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={800} letterSpacing={1.2} fill={ACCENT}
              opacity={prog(t, S3_STEPS_IN[0].start, S3_STEPS_IN[0].end)} style={{ textTransform: "uppercase" }}>
              Where The Pixel Lives
            </text>

            {FUNNEL_STEPS.map((s, i) => {
              const isTY = i === 2;
              const p = prog(t, S3_STEPS_IN[i].start, S3_STEPS_IN[i].end);
              return (
                <g key={`step-${i}`} opacity={p}>
                  <rect x={s.x - 90} y={s.y - 30} width={180} height={60} rx={12}
                    fill="#ffffff" stroke={isTY ? ACCENT : LINE} strokeWidth={isTY ? 1.6 : 1.1}
                    style={{ filter: isTY ? "drop-shadow(0 4px 12px rgba(91,61,240,0.2))" : "none" }} />
                  <text x={s.x} y={s.y - 4} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9.5} letterSpacing={0.4}
                    fill={isTY ? ACCENT : INK} style={{ textTransform: "uppercase" }}>{`${i + 1}. ${s.label}`}</text>
                  {isTY && (
                    <text x={s.x} y={s.y + 16} textAnchor="middle" fontSize={14}>🎉</text>
                  )}
                </g>
              );
            })}

            <DrawLine d={`M${FUNNEL_STEPS[0].x + 92},${FUNNEL_STEPS[0].y} L${FUNNEL_STEPS[1].x - 92},${FUNNEL_STEPS[1].y}`} t={t}
              start={S3_ARROWS_IN.start} end={S3_ARROWS_IN.end} width={1} color={LINE} />
            <DrawLine d={`M${FUNNEL_STEPS[1].x + 92},${FUNNEL_STEPS[1].y} L${FUNNEL_STEPS[2].x - 92},${FUNNEL_STEPS[2].y}`} t={t}
              start={S3_ARROWS_IN.start} end={S3_ARROWS_IN.end} width={1} color={LINE} />

            <circle cx={FUNNEL_STEPS[2].x} cy={FUNNEL_STEPS[2].y} r={70 + s3HighlightVal * 16} fill="none" stroke={ACCENT} strokeWidth={1}
              opacity={s3HighlightVal * 0.35} />

            <EyeNode x={FUNNEL_STEPS[2].x} y={FUNNEL_STEPS[2].y + 56} t={t} arriveStart={S3_PIXEL_MARK_IN.start} arriveEnd={S3_PIXEL_MARK_IN.end}
              label="Pixel Installs Here" labelSide="center" r={6.5} />

            <text x={480} y={470} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.5} fill={MUTED}
              opacity={fadeWindow(t, S3_TEXT_IN.start, S3_TEXT_IN.end, SEG.S3.end - 150, SEG.S3.end)}
              style={{ textTransform: "uppercase" }}>
              this is where the thank-you page pixel goes
            </text>
          </g>

          {/* ================= S4 — support ================= */}
          <g opacity={supportOpacity}>
            <circle cx={480} cy={220} r={44 + s4PulseVal * 14} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s4PulseVal * 0.4} />
            <Person x={480} y={220} size={44} emoji="💬" opacity={prog(t, S4_BUBBLE_IN.start, S4_BUBBLE_IN.end)} />

            <Badge x={480} y={300} t={t} arriveStart={S4_BADGE_IN.start} arriveEnd={S4_BADGE_IN.end} label="WhatsApp Support" width={220} filled />

            <text x={480} y={360} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={11} letterSpacing={0.4} fill={MUTED}
              opacity={fadeWindow(t, S4_TEXT_IN.start, S4_TEXT_IN.end, SEG.S4.end - 200, SEG.S4.end)}
              style={{ textTransform: "uppercase" }}>
              you don't have to figure this out alone
            </text>
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
