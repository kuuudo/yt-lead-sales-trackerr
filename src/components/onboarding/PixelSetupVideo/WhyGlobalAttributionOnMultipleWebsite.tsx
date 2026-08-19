import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, "Why do I need to install Global
   Attribution on multiple websites?" — standalone, modular scene
   file.

   Same visual language as OnboardingVideoSection06 (self-contained,
   regenerates the shared design tokens and timing philosophy
   locally — no import-time dependency).

   STORY: Answers the single most common install question — "I
   already installed Global Attribution, why do I need it again?"
   The answer is a simple operational rule, not a technical one:
   Global Attribution is part of whatever setup VSTRK is currently
   walking the user through. A finished setup does not carry over
   to a new one. Whenever VSTRK shows another Global Attribution
   setup step, that step needs to be completed too — no exceptions,
   no assumptions.

   PRODUCT GROUNDING: purely an operational explainer — no code, no
   technical implementation detail (no localStorage, JS, cookies,
   APIs, schemas, domains). There is no "same website" / "different
   website" rule anywhere in this file. The only idea on screen is
   "setup," and whether it has its own Global Attribution step
   completed yet.

   REUSED FROM SECTION 06 (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp / segOpacity / rangeOpacity
     - DrawLine, Badge, Chip                       (visual primitives)
     - the violet corner-tick Badge grammar, accent Chip grammar
     - autoCaption() — identical single-sentence caption derivation
     - Skip / replay / Get started control chrome

   NEW IN THIS FILE:
     - SetupCard — a small rounded card (gear glyph + "SETUP N"
       label) representing one VSTRK setup. This topic is about
       setups as the unit that needs Global Attribution, so it
       earns its own primitive the way WidgetCard did for "results"
       in Section 06. (Replaces the old WebsiteCard — no domain
       labels anywhere.)
     - bw() — a small helper that expresses a sub-animation as a
       fraction of a beat's own duration, so each scene's timing
       stays readable without a wall of hand-computed millisecond
       constants.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const WARN = "#d3555c";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — narration used word-for-word, split one beat per
   sentence (the two quoted-question beats and the three "don't
   assume / complete it / follow exactly" lines each get their own
   beat too, matching Section 06's philosophy). Beats run a little
   longer than a strict word-count would suggest, giving the visual
   room to land before the caption changes.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "Why do I need to install Global Attribution on multiple websites?", 4800],
  ["S2a", "You might be wondering:", 2200],
  ["S2b", "\u201CIf I already installed Global Attribution, why do I need to install it again?\u201D", 5400],
  ["S3a", "The answer is simple.", 2200],
  ["S3b", "Global Attribution is part of the setup you\u2019re completing.", 4800],
  ["S4", "Each setup needs Global Attribution so VSTRK can track the activity happening through that setup.", 6600],
  ["S5", "That\u2019s why, when VSTRK gives you another Global Attribution setup, you need to complete it as well.", 6200],
  ["S6a", "So don\u2019t assume a previous installation covers a new setup.", 5000],
  ["S6b", "If you see a Global Attribution setup step, complete it.", 4800],
  ["S6c", "Follow each setup exactly as shown.", 4600],
  ["S7", "That\u2019s it!", 3600],
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
/* Expresses a sub-animation window as a fraction of one beat's own
   duration, e.g. bw("S4", 0.15, 0.4) — readable per-scene timing. */
function bw(key: string, a: number, b: number) {
  const seg = SEG[key];
  const dur = seg.end - seg.start;
  return { start: seg.start + dur * a, end: seg.start + dur * b };
}

function autoCaption(key: string, opts: { lead?: number; tail?: number; fade?: number } = {}) {
  const { lead = 200, tail = 220, fade = 220 } = opts;
  const seg = SEG[key];
  const a = seg.start + lead;
  const d = seg.end - tail;
  const b = Math.min(a + fade, a + (d - a) / 2);
  const c = Math.max(b, d - fade);
  return { text: seg.text, a, b, c, d };
}
const CAPTIONS = SEG_SOURCE.map(([key]) => autoCaption(key));

/* ---------------- Visual primitives ---------------- */

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
  { x: number; y: number; t: number; start: number; end: number; label: string; tone?: "muted" | "accent" | "filled" | "warn"; width?: number; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 24;
  const bx = x - width / 2, by = y - h / 2;
  const tColor = tone === "warn" ? WARN : ACCENT;
  const fill = tone === "filled" ? tColor : "#ffffff";
  const stroke = tone === "muted" ? LINE : tColor;
  const textFill = tone === "filled" ? "#ffffff" : tone === "muted" ? INK : tColor;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.1} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.3} fill={textFill}
        style={{ textTransform: tone === "muted" ? "none" : "uppercase" }}>{label}</text>
    </g>
  );
}

/* NEW — a small "setup" card: gear glyph + "SETUP N" label. Stands
   in for the unit this whole video is about — a setup VSTRK gives
   the user, not a website or a domain. */
function SetupCard({ x, y, t, start, end, label, width = 176, height = 54, small = false, dim = false }:
  { x: number; y: number; t: number; start: number; end: number; label: string; width?: number; height?: number; small?: boolean; dim?: boolean }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const bx = x - width / 2, by = y - height / 2;
  const scale = lerp(0.9, 1, p);
  const glyphSize = small ? 13 : 17;
  const textSize = small ? 10.5 : 12.5;
  const glyphY = small ? y - 3 : y - 8;
  const textY = small ? y + 13 : y + 17;
  const strokeColor = dim ? LINE : ACCENT;
  return (
    <g opacity={p * (dim ? 0.6 : 1)} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={height} rx={12} fill="#ffffff" stroke={strokeColor} strokeWidth={1.3}
        style={{ filter: "drop-shadow(0 4px 10px rgba(21,21,31,0.08))" }} />
      <text x={x} y={glyphY} textAnchor="middle" fontSize={glyphSize}>{"\u2699\uFE0F"}</text>
      <text x={x} y={textY} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={textSize} letterSpacing={0.2} fill={INK}>{label}</text>
    </g>
  );
}

const FUNNELS = ["Sales Booking", "Consultation", "Direct Purchase"];

export interface OnboardingVideoGlobalAttributionProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function OnboardingVideoGlobalAttribution({ onSkip, onComplete }: OnboardingVideoGlobalAttributionProps = {}) {
  const [elapsed, setElapsed] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    let raf: number;
    const startedAt = performance.now();
    function loop(now: number) {
      const tt = now - startedAt;
      setElapsed(Math.min(tt, TOTAL));
      if (tt < TOTAL) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runId]);

  const t = elapsed;
  const finished = t >= TOTAL;
  const replay = () => { setElapsed(0); setRunId((id) => id + 1); };

  /* ---------------- Scene group opacities ---------------- */
  const scene1Opacity = segOpacity(t, "S1");
  const scene2Opacity = rangeOpacity(t, "S2a", "S2b");
  const scene3Opacity = rangeOpacity(t, "S3a", "S3b");
  const scene4Opacity = segOpacity(t, "S4");
  const scene5Opacity = segOpacity(t, "S5");
  const scene6Opacity = rangeOpacity(t, "S6a", "S6c");
  const scene7Opacity = segOpacity(t, "S7");
  const finalFadeOut = t > SEG.S7.end - 500 ? 1 - prog(t, SEG.S7.end - 500, SEG.S7.end - 60) : 1;

  /* ---------------- Scene 1 — the setup question ---------------- */
  const s1HeaderIn = bw("S1", 0, 0.16);
  const s1FunnelsIn = FUNNELS.map((_, i) => bw("S1", 0.16 + i * 0.1, 0.36 + i * 0.1));
  const s1GhostIn = FUNNELS.map((_, i) => bw("S1", 0.46 + i * 0.06, 0.62 + i * 0.06));
  const s1CaptionIn = bw("S1", 0.74, 0.96);

  /* ---------------- Scene 2 — the user's question ---------------- */
  const s2BadgeIn = bw("S2a", 0, 0.7);
  const s2DoubtIn = bw("S2a", 0.55, 1);
  const s2FunnelsIn = FUNNELS.map((_, i) => bw("S2b", 0.12 + i * 0.1, 0.32 + i * 0.1));
  const s2LinesIn = FUNNELS.map((_, i) => bw("S2b", 0.22 + i * 0.1, 0.42 + i * 0.1));
  const s2CaptionIn = bw("S2b", 0.72, 0.98);

  /* ---------------- Scene 3 — the simple answer ---------------- */
  const s3TextIn = { start: SEG.S3a.start + 150, end: SEG.S3b.start + (SEG.S3b.end - SEG.S3b.start) * 0.35 };
  const s3SetupIn = bw("S3b", 0.45, 0.72);
  const s3ArrowIn = bw("S3b", 0.6, 0.82);
  const s3GaIn = bw("S3b", 0.78, 1);

  /* ---------------- Scene 4 — one setup, one Global Attribution step ---------------- */
  const s4SetupIn = bw("S4", 0, 0.18);
  const s4Arrow1In = bw("S4", 0.22, 0.34);
  const s4GaIn = bw("S4", 0.36, 0.56);
  const s4Arrow2In = bw("S4", 0.6, 0.72);
  const s4LabelIn = bw("S4", 0.76, 0.96);

  /* ---------------- Scene 5 — a new setup appears ---------------- */
  const s5LeftSetupIn = bw("S5", 0, 0.16);
  const s5LeftGaIn = bw("S5", 0.1, 0.26);
  const s5CrossIn = bw("S5", 0.3, 0.48);
  const s5RightSetupIn = bw("S5", 0.44, 0.62);
  const s5RightGaIn = bw("S5", 0.58, 0.78);
  const s5CaptionIn = bw("S5", 0.8, 0.98);

  /* ---------------- Scene 6 — don't assume, complete it, follow exactly ---------------- */
  const s6WarnIn = bw("S6a", 0, 0.5);
  const s6Step1In = bw("S6a", 0.45, 0.95);
  const s6Step2In = bw("S6b", 0, 0.55);
  const s6Check2In = bw("S6b", 0.35, 0.7);
  const s6Step3In = bw("S6c", 0, 0.6);
  const s6Check3In = bw("S6c", 0.4, 0.85);

  /* ---------------- Scene 7 — final ---------------- */
  const s7Line1In = bw("S7", 0, 0.5);
  const s7Line2In = bw("S7", 0.2, 0.7);
  const s7RingWindow = bw("S7", 0.15, 0.95);
  const s7RingVal = t > s7RingWindow.start && t < s7RingWindow.end
    ? Math.sin(prog(t, s7RingWindow.start, s7RingWindow.end) * Math.PI) : 0;
  const s7BrandIn = bw("S7", 0.55, 0.95);

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 900, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 560" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= Scene 1 — the setup question ================= */}
          <g opacity={scene1Opacity}>
            <Badge x={480} y={90} t={t} arriveStart={s1HeaderIn.start} arriveEnd={s1HeaderIn.end} label="Your VSTRK Funnels" width={230} />
            {FUNNELS.map((f, i) => (
              <Chip key={`s1-f-${i}`} x={280 + i * 200} y={210} t={t} start={s1FunnelsIn[i].start} end={s1FunnelsIn[i].end}
                label={f} tone="muted" width={168} fontSize={11.5} />
            ))}
            {FUNNELS.map((_, i) => (
              <g key={`s1-g-${i}`} opacity={0.55}>
                <Chip x={280 + i * 200} y={266} t={t} start={s1GhostIn[i].start} end={s1GhostIn[i].end}
                  label="Global Attribution?" tone="accent" width={164} fontSize={9} />
              </g>
            ))}
            <text x={480} y={430} textAnchor="middle" fontFamily={MONO} fontSize={13} fontWeight={700} letterSpacing={0.4} fill={INK}
              opacity={prog(t, s1CaptionIn.start, s1CaptionIn.end)} style={{ textTransform: "uppercase" }}>
              Do I really need to install it again?
            </text>
          </g>

          {/* ================= Scene 2 — the user's question ================= */}
          <g opacity={scene2Opacity}>
            <Badge x={480} y={110} t={t} arriveStart={s2BadgeIn.start} arriveEnd={s2BadgeIn.end}
              label="Global Attribution \u2713" width={230} filled />
            <DrawLine d="M480,128 L480,180" t={t} start={s2DoubtIn.start} end={s2DoubtIn.end} width={1.2} color={WARN} dash="3 6" />
            <text x={480} y={210} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={22} fill={WARN}
              opacity={prog(t, s2DoubtIn.start, s2DoubtIn.end)}>
              &times;3?
            </text>
            {FUNNELS.map((f, i) => (
              <DrawLine key={`s2-l-${i}`} d={`M480,232 L${280 + i * 200},290`} t={t} start={s2LinesIn[i].start} end={s2LinesIn[i].end}
                width={1} color={LINE} dash="2 6" />
            ))}
            {FUNNELS.map((f, i) => (
              <Chip key={`s2-f-${i}`} x={280 + i * 200} y={320} t={t} start={s2FunnelsIn[i].start} end={s2FunnelsIn[i].end}
                label={f} tone="muted" width={168} fontSize={11.5} />
            ))}
            <text x={480} y={430} textAnchor="middle" fontFamily={MONO} fontSize={13} fontWeight={700} letterSpacing={0.4} fill={INK}
              opacity={prog(t, s2CaptionIn.start, s2CaptionIn.end)} style={{ textTransform: "uppercase" }}>
              Do I have to install this three times?
            </text>
          </g>

          {/* ================= Scene 3 — the simple answer ================= */}
          <g opacity={scene3Opacity}>
            <text x={480} y={168} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={30} letterSpacing={1} fill={ACCENT}
              opacity={prog(t, s3TextIn.start, s3TextIn.end)}>
              GLOBAL ATTRIBUTION
            </text>
            <text x={480} y={210} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={26} letterSpacing={1} fill={ACCENT}
              opacity={prog(t, s3TextIn.start, s3TextIn.end)}>
              IS PART OF THIS SETUP.
            </text>

            <SetupCard x={480} y={330} t={t} start={s3SetupIn.start} end={s3SetupIn.end} label="SETUP 01" width={200} height={60} />
            <DrawLine d="M480,362 L480,410" t={t} start={s3ArrowIn.start} end={s3ArrowIn.end} width={1.4} color={ACCENT} />
            <text x={480} y={412} textAnchor="middle" fontFamily={MONO} fontSize={13} fill={ACCENT}
              opacity={prog(t, s3ArrowIn.start, s3ArrowIn.end)}>&darr;</text>
            <Badge x={480} y={442} t={t} arriveStart={s3GaIn.start} arriveEnd={s3GaIn.end} label="Global Attribution \u2713" width={210} filled />
          </g>

          {/* ================= Scene 4 — every setup carries its own Global Attribution step ================= */}
          <g opacity={scene4Opacity}>
            <SetupCard x={480} y={110} t={t} start={s4SetupIn.start} end={s4SetupIn.end} label="SETUP 01" width={210} height={58} />
            <DrawLine d="M480,140 L480,196" t={t} start={s4Arrow1In.start} end={s4Arrow1In.end} width={1.4} color={ACCENT} />
            <text x={480} y={198} textAnchor="middle" fontFamily={MONO} fontSize={13} fill={ACCENT}
              opacity={prog(t, s4Arrow1In.start, s4Arrow1In.end)}>&darr;</text>
            <Badge x={480} y={230} t={t} arriveStart={s4GaIn.start} arriveEnd={s4GaIn.end} label="Global Attribution \u2713" width={220} filled />
            <DrawLine d="M480,246 L480,300" t={t} start={s4Arrow2In.start} end={s4Arrow2In.end} width={1.4} color={ACCENT} />
            <text x={480} y={302} textAnchor="middle" fontFamily={MONO} fontSize={13} fill={ACCENT}
              opacity={prog(t, s4Arrow2In.start, s4Arrow2In.end)}>&darr;</text>
            <Chip x={480} y={336} t={t} start={s4LabelIn.start} end={s4LabelIn.end} label="Completed" tone="filled" width={150} fontSize={11} />
          </g>

          {/* ================= Scene 5 — another setup, another Global Attribution step ================= */}
          <g opacity={scene5Opacity}>
            <SetupCard x={230} y={130} t={t} start={s5LeftSetupIn.start} end={s5LeftSetupIn.end} label="SETUP 01" width={190} height={54} dim />
            <Badge x={230} y={196} t={t} arriveStart={s5LeftGaIn.start} arriveEnd={s5LeftGaIn.end} label="Completed \u2713" width={170} filled />

            <DrawLine d="M330,150 L630,150" t={t} start={s5CrossIn.start} end={s5CrossIn.end} width={1.2} color={WARN} dash="3 6" />
            <text x={480} y={130} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={20} fill={WARN}
              opacity={prog(t, s5CrossIn.start, s5CrossIn.end)}>&#8856;</text>

            <SetupCard x={730} y={130} t={t} start={s5RightSetupIn.start} end={s5RightSetupIn.end} label="SETUP 02" width={190} height={54} />
            <Badge x={730} y={196} t={t} arriveStart={s5RightGaIn.start} arriveEnd={s5RightGaIn.end} label="Complete this setup" width={200} />

            <text x={480} y={430} textAnchor="middle" fontFamily={MONO} fontSize={13} fontWeight={700} letterSpacing={0.4} fill={INK}
              opacity={prog(t, s5CaptionIn.start, s5CaptionIn.end)} style={{ textTransform: "uppercase" }}>
              A finished setup doesn&rsquo;t cover a new one
            </text>
          </g>

          {/* ================= Scene 6 — don't assume, complete it, follow exactly ================= */}
          <g opacity={scene6Opacity}>
            <Chip x={480} y={82} t={t} start={s6WarnIn.start} end={s6WarnIn.end} label="Skip it? \u2715" tone="warn" width={140} fontSize={11} />

            <rect x={300} y={126} width={360} height={2} fill={LINE} opacity={prog(t, s6Step1In.start, s6Step1In.end)} />

            <Badge x={340} y={168} t={t} arriveStart={s6Step1In.start} arriveEnd={s6Step1In.end} label="1" width={34} filled />
            <text x={390} y={173} fontFamily={MONO} fontSize={13.5} fontWeight={700} fill={INK}
              opacity={prog(t, s6Step1In.start, s6Step1In.end)}>See a Global Attribution setup</text>

            <Badge x={340} y={230} t={t} arriveStart={s6Step2In.start} arriveEnd={s6Step2In.end} label="2" width={34} filled />
            <text x={390} y={235} fontFamily={MONO} fontSize={13.5} fontWeight={700} fill={INK}
              opacity={prog(t, s6Step2In.start, s6Step2In.end)}>Complete it</text>
            <text x={860} y={235} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={18} fill={ACCENT}
              opacity={prog(t, s6Check2In.start, s6Check2In.end)}>&#10003;</text>

            <Badge x={340} y={292} t={t} arriveStart={s6Step3In.start} arriveEnd={s6Step3In.end} label="3" width={34} filled />
            <text x={390} y={297} fontFamily={MONO} fontSize={13.5} fontWeight={700} fill={INK}
              opacity={prog(t, s6Step3In.start, s6Step3In.end)}>Follow it exactly as shown</text>
            <text x={860} y={297} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={18} fill={ACCENT}
              opacity={prog(t, s6Check3In.start, s6Check3In.end)}>&#10003;</text>
          </g>

          {/* ================= Scene 7 — final ================= */}
          <g opacity={scene7Opacity}>
            <circle cx={480} cy={250} r={70 + s7RingVal * 30} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s7RingVal * 0.4} />
            <text x={480} y={246} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={22} letterSpacing={0.6} fill={INK}
              opacity={prog(t, s7Line1In.start, s7Line1In.end)}>
              EVERY SETUP GETS ITS OWN
            </text>
            <text x={480} y={284} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={22} letterSpacing={0.4} fill={ACCENT}
              opacity={prog(t, s7Line2In.start, s7Line2In.end)}>
              GLOBAL ATTRIBUTION STEP &mdash; COMPLETE EACH ONE
            </text>
            <text x={480} y={360} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={13} letterSpacing={3} fill={MUTED}
              opacity={prog(t, s7BrandIn.start, s7BrandIn.end)}>
              VSTRK
            </text>
          </g>
        </svg>
      </div>

      {/* ---------- Caption bar ---------- */}
      <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 6, position: "relative", width: "100%", maxWidth: 900 }}>
        {CAPTIONS.map((c, i) => {
          const op = fadeWindow(t, c.a, c.b, c.c, c.d);
          if (op <= 0.001) return null;
          return (
            <p key={i} style={{
              position: "absolute", margin: 0, fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
              fontSize: 20, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center",
              whiteSpace: "pre-line", lineHeight: 1.35, padding: "0 24px",
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
          Skip video <span aria-hidden="true">&rarr;</span>
        </button>
      ) : (
        <div style={{ position: "absolute", bottom: 14, right: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <button type="button" onClick={replay} style={{ background: "none", border: "none", fontFamily: MONO, fontSize: 11, letterSpacing: 0.4, color: "#9a9aa8", cursor: "pointer", padding: 4 }}>
            &#8635; replay
          </button>
          <button type="button" onClick={onComplete} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: ACCENT, border: "none", borderRadius: 8,
            fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
            letterSpacing: 0.6, textTransform: "uppercase",
            color: "#ffffff", cursor: "pointer", padding: "10px 18px",
            boxShadow: `0 8px 20px rgba(91,61,240,0.35)`,
          }}>
            Got it <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      )}
    </div>
  );
}
