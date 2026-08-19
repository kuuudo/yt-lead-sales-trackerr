import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding VSL, "Why Global Attribution on multiple
   websites?" — standalone, modular scene file.

   Same visual language as OnboardingVideoSection06 (self-contained,
   regenerates the shared design tokens and timing philosophy
   locally — no import-time dependency).

   STORY: Answers the single most common install question — "I
   already installed Global Attribution, why do I need it again?"
   The answer is one rule: Global Attribution is installed PER
   WEBSITE, not per funnel. Multiple funnels on the same website
   share one setup; funnels split across different websites/domains
   each need their own.

   PRODUCT GROUNDING: purely an installation-concept explainer — no
   code, no technical implementation detail (no localStorage, JS,
   cookies, APIs, schemas). The only unit on screen is "website" vs
   "funnel," matching the brief exactly.

   REUSED FROM SECTION 06 (regenerated locally, same shapes):
     - clamp / prog / fadeWindow / lerp / segOpacity / rangeOpacity
     - DrawLine, Badge, Chip                       (visual primitives)
     - the violet corner-tick Badge grammar, accent Chip grammar
     - autoCaption() — identical single-sentence caption derivation
     - Skip / replay / Get started control chrome

   NEW IN THIS FILE:
     - WebsiteCard — a small rounded card (globe glyph + domain
       label) representing one website/domain. This topic is about
       websites as the unit of installation, so it earns its own
       primitive the way WidgetCard did for "results" in Section 06.
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
   sentence (the two quoted-question beats and the two "remember"
   lines get their own beat too, matching Section 06's philosophy).
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "Why do I need to install Global Attribution on multiple websites?", 2800],
  ["S2a", "You might be wondering:", 1400],
  ["S2b", "\u201CIf I already installed Global Attribution, why do I need to install it again?\u201D", 3600],
  ["S3a", "The answer is simple.", 1400],
  ["S3b", "Global Attribution is installed per website.", 2800],
  ["S4", "If your Sales Booking, Consultation, and Direct Purchase pages are all part of the same website, you don\u2019t need to install a separate Global Attribution script for each one.", 7200],
  ["S5", "But if they are on different websites or domains, each website needs its own Global Attribution script.", 4800],
  ["S6a", "So remember:", 1200],
  ["S6b", "Same website \u2192 one Global Attribution setup.", 2600],
  ["S6c", "Different websites \u2192 each website needs its own setup.", 3000],
  ["S7", "That\u2019s it!", 1800],
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

/* NEW — a small "website" card: globe glyph + domain label. Stands
   in for the unit of installation this whole video is about. */
function WebsiteCard({ x, y, t, start, end, label, width = 176, height = 54, small = false }:
  { x: number; y: number; t: number; start: number; end: number; label: string; width?: number; height?: number; small?: boolean }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const bx = x - width / 2, by = y - height / 2;
  const scale = lerp(0.9, 1, p);
  const glyphSize = small ? 13 : 17;
  const textSize = small ? 10.5 : 12.5;
  const glyphY = small ? y - 3 : y - 8;
  const textY = small ? y + 13 : y + 17;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={height} rx={12} fill="#ffffff" stroke={ACCENT} strokeWidth={1.3}
        style={{ filter: "drop-shadow(0 4px 10px rgba(21,21,31,0.08))" }} />
      <text x={x} y={glyphY} textAnchor="middle" fontSize={glyphSize}>{"\uD83C\uDF10"}</text>
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
  const s3WebsiteIn = bw("S3b", 0.45, 0.72);
  const s3ArrowIn = bw("S3b", 0.6, 0.82);
  const s3GaIn = bw("S3b", 0.78, 1);

  /* ---------------- Scene 4 — same website ---------------- */
  const s4WebsiteIn = bw("S4", 0, 0.14);
  const s4FunnelsIn = FUNNELS.map((_, i) => bw("S4", 0.14 + i * 0.08, 0.32 + i * 0.08));
  const s4LinesIn = FUNNELS.map((_, i) => bw("S4", 0.2 + i * 0.08, 0.38 + i * 0.08));
  const s4TrunkIn = bw("S4", 0.5, 0.64);
  const s4GaIn = bw("S4", 0.58, 0.74);
  const s4LabelIn = bw("S4", 0.78, 0.96);

  /* ---------------- Scene 5 — different websites ---------------- */
  const SITES_5 = ["yoursite.com", "booking.example.com", "anotherbrand.com"];
  const s5SiteIn = SITES_5.map((_, i) => bw("S5", i * 0.1, 0.22 + i * 0.1));
  const s5LineIn = SITES_5.map((_, i) => bw("S5", 0.36 + i * 0.08, 0.5 + i * 0.08));
  const s5GaIn = SITES_5.map((_, i) => bw("S5", 0.42 + i * 0.08, 0.58 + i * 0.08));
  const s5CaptionIn = bw("S5", 0.76, 0.98);

  /* ---------------- Scene 6 — side-by-side comparison ---------------- */
  const s6DividerIn = bw("S6a", 0, 0.9);
  const s6LeftHeaderIn = bw("S6a", 0.1, 0.7);
  const s6RightHeaderIn = bw("S6b", 0, 0.35);
  const s6LeftSiteIn = bw("S6a", 0.35, 0.75);
  const s6LeftFunnelsIn = FUNNELS.map((_, i) => bw("S6a", 0.4 + i * 0.12, 0.7 + i * 0.12));
  const s6LeftGaIn = bw("S6b", 0.05, 0.35);
  const s6LeftLabelIn = bw("S6b", 0.4, 0.7);
  const SITES_6 = ["website-a.com", "website-b.com", "website-c.com"];
  const s6RightSiteIn = SITES_6.map((_, i) => bw("S6b", 0.15 + i * 0.14, 0.5 + i * 0.14));
  const s6RightGaIn = SITES_6.map((_, i) => bw("S6b", 0.25 + i * 0.14, 0.6 + i * 0.14));
  const s6RightLabelIn = bw("S6c", 0, 0.4);

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
            <text x={480} y={210} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={30} letterSpacing={1} fill={ACCENT}
              opacity={prog(t, s3TextIn.start, s3TextIn.end)}>
              IS INSTALLED PER WEBSITE.
            </text>

            <WebsiteCard x={480} y={330} t={t} start={s3WebsiteIn.start} end={s3WebsiteIn.end} label="WEBSITE A" width={200} height={60} />
            <DrawLine d="M480,362 L480,410" t={t} start={s3ArrowIn.start} end={s3ArrowIn.end} width={1.4} color={ACCENT} />
            <text x={480} y={412} textAnchor="middle" fontFamily={MONO} fontSize={13} fill={ACCENT}
              opacity={prog(t, s3ArrowIn.start, s3ArrowIn.end)}>&darr;</text>
            <Badge x={480} y={442} t={t} arriveStart={s3GaIn.start} arriveEnd={s3GaIn.end} label="Global Attribution \u2713" width={210} filled />
          </g>

          {/* ================= Scene 4 — same website, one setup ================= */}
          <g opacity={scene4Opacity}>
            <WebsiteCard x={480} y={100} t={t} start={s4WebsiteIn.start} end={s4WebsiteIn.end} label="yoursite.com" width={210} height={58} />
            {FUNNELS.map((_, i) => (
              <DrawLine key={`s4-l-${i}`} d={`M${280 + i * 200},188 L480,128`} t={t} start={s4LinesIn[i].start} end={s4LinesIn[i].end}
                width={1.1} color={LINE} />
            ))}
            {FUNNELS.map((f, i) => (
              <Chip key={`s4-f-${i}`} x={280 + i * 200} y={210} t={t} start={s4FunnelsIn[i].start} end={s4FunnelsIn[i].end}
                label={f} tone="muted" width={168} fontSize={11.5} />
            ))}
            <DrawLine d="M480,128 L480,330" t={t} start={s4TrunkIn.start} end={s4TrunkIn.end} width={1.6} color={ACCENT} />
            <Badge x={480} y={358} t={t} arriveStart={s4GaIn.start} arriveEnd={s4GaIn.end} label="Global Attribution \u2713" width={210} filled />
            <Chip x={480} y={404} t={t} start={s4LabelIn.start} end={s4LabelIn.end} label="One Setup" tone="filled" width={140} fontSize={11} />
          </g>

          {/* ================= Scene 5 — different websites, own setups ================= */}
          <g opacity={scene5Opacity}>
            {SITES_5.map((s, i) => (
              <WebsiteCard key={`s5-w-${i}`} x={175 + i * 305} y={130} t={t} start={s5SiteIn[i].start} end={s5SiteIn[i].end}
                label={s} width={220} height={58} />
            ))}
            {SITES_5.map((_, i) => (
              <DrawLine key={`s5-l-${i}`} d={`M${175 + i * 305},158 L${175 + i * 305},248`} t={t} start={s5LineIn[i].start} end={s5LineIn[i].end}
                width={1.4} color={ACCENT} />
            ))}
            {SITES_5.map((_, i) => (
              <Badge key={`s5-g-${i}`} x={175 + i * 305} y={280} t={t} arriveStart={s5GaIn[i].start} arriveEnd={s5GaIn[i].end}
                label="Global Attribution \u2713" width={210} filled />
            ))}
            <text x={480} y={430} textAnchor="middle" fontFamily={MONO} fontSize={13} fontWeight={700} letterSpacing={0.4} fill={INK}
              opacity={prog(t, s5CaptionIn.start, s5CaptionIn.end)} style={{ textTransform: "uppercase" }}>
              Different website &rarr; different setup
            </text>
          </g>

          {/* ================= Scene 6 — side-by-side comparison ================= */}
          <g opacity={scene6Opacity}>
            <DrawLine d="M480,110 L480,460" t={t} start={s6DividerIn.start} end={s6DividerIn.end} width={1} color={LINE} dash="4 6" />

            <Badge x={240} y={90} t={t} arriveStart={s6LeftHeaderIn.start} arriveEnd={s6LeftHeaderIn.end} label="Same Website" width={180} filled />
            <WebsiteCard x={240} y={150} t={t} start={s6LeftSiteIn.start} end={s6LeftSiteIn.end} label="yoursite.com" width={168} height={44} small />
            {FUNNELS.map((f, i) => (
              <Chip key={`s6-lf-${i}`} x={240} y={202 + i * 30} t={t} start={s6LeftFunnelsIn[i].start} end={s6LeftFunnelsIn[i].end}
                label={f} tone="muted" width={158} fontSize={9.5} />
            ))}
            <Badge x={240} y={324} t={t} arriveStart={s6LeftGaIn.start} arriveEnd={s6LeftGaIn.end} label="Global Attribution \u2713" width={190} filled />
            <Chip x={240} y={362} t={t} start={s6LeftLabelIn.start} end={s6LeftLabelIn.end} label="One Setup" tone="filled" width={130} fontSize={10} />

            <Badge x={720} y={90} t={t} arriveStart={s6RightHeaderIn.start} arriveEnd={s6RightHeaderIn.end} label="Different Websites" width={210} filled tone={WARN} />
            {SITES_6.map((s, i) => (
              <WebsiteCard key={`s6-rw-${i}`} x={720} y={150 + i * 58} t={t} start={s6RightSiteIn[i].start} end={s6RightSiteIn[i].end}
                label={s} width={168} height={44} small />
            ))}
            {SITES_6.map((_, i) => (
              <Badge key={`s6-rg-${i}`} x={860} y={150 + i * 58} t={t} arriveStart={s6RightGaIn[i].start} arriveEnd={s6RightGaIn[i].end}
                label="\u2713" width={54} filled />
            ))}
            <Chip x={720} y={368} t={t} start={s6RightLabelIn.start} end={s6RightLabelIn.end} label="Each Website" tone="warn" width={150} fontSize={10} />
          </g>

          {/* ================= Scene 7 — final ================= */}
          <g opacity={scene7Opacity}>
            <circle cx={480} cy={250} r={70 + s7RingVal * 30} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s7RingVal * 0.4} />
            <text x={480} y={246} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={22} letterSpacing={0.6} fill={INK}
              opacity={prog(t, s7Line1In.start, s7Line1In.end)}>
              SAME WEBSITE &rarr; ONE SETUP
            </text>
            <text x={480} y={284} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={22} letterSpacing={0.4} fill={ACCENT}
              opacity={prog(t, s7Line2In.start, s7Line2In.end)}>
              DIFFERENT WEBSITES &rarr; EACH GETS ITS OWN
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
