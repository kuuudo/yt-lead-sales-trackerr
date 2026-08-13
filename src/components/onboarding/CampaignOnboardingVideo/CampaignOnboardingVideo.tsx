import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Campaign Onboarding Video
   "Let's set up your first campaign together." → "Let's start with
   the basics."

   Standalone, modular scene file for the Campaign Onboarding step's
   intro video. Independently renderable — regenerates the same
   visual language, primitives, and timing philosophy locally as
   OnboardingVideoSection06 (no import-time dependency on it), so it
   reads as the same product without creating a shared-file coupling.

   PURPOSE: replaces the large explanatory paragraph that used to sit
   above the Campaign Name / Landing Page URL / Offer Price fields on
   the "What are you promoting?" step. Vix introduces the concept of
   a Campaign and visually explains what a Campaign contains, so the
   user understands the concept without reading a wall of text.

   SCRIPT: used verbatim, word-for-word, split one beat per sentence
   — identical philosophy to Section06. The two-clause final sentence
   ("You can create as many campaigns... one offer, one world.") gets
   one beat (S5) with two internal visual phases, the same way
   Section06's S2 packs multiple sub-beats into its longest segment.

   NEW IN THIS FILE:
     - a polar() helper to ring nodes evenly around a hub (used for
       the eight campaign-piece chips in S3/S4). Everything else
       (DrawLine, Person, Badge, Chip, timing math, caption grammar,
       skip/replay chrome) is regenerated from Section06's primitives
       so this reads as a continuation of the same design system, not
       a new one.

   NOT included on purpose: no form logic, no validation, no Supabase
   calls. This component only explains the concept — the real
   Campaign Name / Landing Page URL / Offer Price fields stay exactly
   where they are in CampaignOnboardingStep.tsx, right below this.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — one beat per exact narration sentence (6 beats), played
   back to back with a 280ms cross-fade gap. S3 (everything that
   belongs to the offer) is the longest beat — it carries the eight-
   piece "campaign world" reveal and needs real time to land. S5
   (multiple campaigns / one world) is the second-longest since it
   carries two visual phases inside one sentence.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "Let's set up your first campaign together.", 2600],
  ["S2", "Think of a campaign as one product, service, or offer you're promoting.", 3600],
  ["S3", "Everything that belongs to that same offer — your sales page, checkout, thank-you page, newsletter, sales calls, paid consultations, lead magnets, and the content that sends people there — lives inside this one campaign.", 7600],
  ["S4", "You don't need to set all of that up now; you can add each piece later.", 3600],
  ["S5", "You can create as many campaigns as you have offers — just remember, one campaign is one offer, one world.", 6400],
  ["S6", "Let's start with the basics.", 2600],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S6.end + 700;

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
/* Places a node on an ellipse around (cx, cy) — used to ring the
   eight campaign-piece chips evenly around the central hub. */
function polar(cx: number, cy: number, rx: number, ry: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) };
}

/* Derives caption fade timing directly from a beat's SEG window —
   identical single-sentence helper from Section06. */
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

/* ---------------- Visual primitives — regenerated from Section06 ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE, dash }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string; dash?: string }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray={dash ? dash : 1} strokeDashoffset={dash ? undefined : 1 - p} opacity={opacity * (dash ? p : 1)} />
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
  const tColor = ACCENT;
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

/* ---- S1 — Vix appears, warm welcome ---- */
const S1_RING = { start: SEG.S1.start + 150, end: SEG.S1.end - 200 };
const S1_VIX_IN = { start: SEG.S1.start + 150, end: SEG.S1.start + 650 };
const S1_LABEL_IN = { start: SEG.S1.start + 550, end: SEG.S1.start + 950 };

/* ---- S2 — ONE CAMPAIGN = product / service / offer ---- */
const HUB = { x: 480, y: 280 };
const S2_HEAD_IN = { start: SEG.S2.start + 100, end: SEG.S2.start + 600 };
const S2_HUB_IN = { start: SEG.S2.start + 150, end: SEG.S2.start + 650 };
const S2_SUB = [
  { label: "PRODUCT", x: 350 },
  { label: "SERVICE", x: 480 },
  { label: "OFFER", x: 610 },
];
const S2_SUB_STAGGER = 260;
const S2_SUB_IN = S2_SUB.map((_, i) => ({
  start: S2_HUB_IN.end + 150 + i * S2_SUB_STAGGER, end: S2_HUB_IN.end + 150 + i * S2_SUB_STAGGER + 420,
}));

/* ---- Hub label persists across S2 → S3, then hands off to S4's badge ---- */
const HUB_LABEL_RANGE: [string, string] = ["S2", "S3"];

/* ---- S3 — everything belonging to that offer (8-piece campaign world) ---- */
const S3_NODE_DEFS = [
  { label: "Sales Page", width: 100 },
  { label: "Checkout", width: 98 },
  { label: "Thank You", width: 100 },
  { label: "Newsletter", width: 112 },
  { label: "Sales Call", width: 100 },
  { label: "Paid Consultation", width: 156 },
  { label: "Lead Magnet", width: 114 },
  { label: "Content", width: 90 },
];
const S3_RADIUS = { rx: 250, ry: 158 };
const S3_NODE_POS = S3_NODE_DEFS.map((_, i) => polar(HUB.x, HUB.y, S3_RADIUS.rx, S3_RADIUS.ry, -90 + i * 45));
const S3_STAGGER = 610;
const S3_NODES_IN = S3_NODE_DEFS.map((_, i) => ({
  start: SEG.S3.start + 550 + i * S3_STAGGER, end: SEG.S3.start + 550 + i * S3_STAGGER + 460,
}));
const S3_LINES_IN = S3_NODE_DEFS.map((_, i) => ({
  start: S3_NODES_IN[i].start - 60, end: S3_NODES_IN[i].start + 340,
}));
const S3_LAST_END = S3_NODES_IN[S3_NODES_IN.length - 1].end;
const S3_PULSE = { start: S3_LAST_END + 150, end: SEG.S3.end - 150 };

/* ---- S4 — you don't need everything now; start with the basics ---- */
const S4_NODES_MUTED_IN = { start: SEG.S4.start + 50, end: SEG.S4.start + 650 };
const S4_BADGE_IN = { start: SEG.S4.start + 950, end: SEG.S4.start + 1500 };
const S4_HOLD = { start: S4_BADGE_IN.end + 150, end: SEG.S4.end - 150 };

/* ---- S5 — as many campaigns as offers, then: one offer, one world ---- */
const S5_CAMPAIGNS = [
  { x: 220, y: 250, emoji: "🛍️", label: "CAMPAIGN 01" },
  { x: 480, y: 250, emoji: "📚", label: "CAMPAIGN 02" },
  { x: 740, y: 250, emoji: "🎓", label: "CAMPAIGN 03" },
];
const S5_STAGGER = 300;
const S5_CAMP_IN = S5_CAMPAIGNS.map((_, i) => ({
  start: SEG.S5.start + 150 + i * S5_STAGGER, end: SEG.S5.start + 150 + i * S5_STAGGER + 460,
}));
const S5_LAST_END = S5_CAMP_IN[S5_CAMP_IN.length - 1].end;
const S5_HOLD = { start: S5_LAST_END + 150, end: S5_LAST_END + 1500 };
const S5_CONVERGE = { start: S5_HOLD.end, end: S5_HOLD.end + 1400 };
const S5_FINAL_BADGE_IN = { start: S5_CONVERGE.start + 450, end: S5_CONVERGE.start + 950 };
const S5_PULSE = { start: S5_CONVERGE.end + 150, end: SEG.S5.end - 150 };

/* ---- S6 — Vix guides toward the form ---- */
const S6_VIX_IN = { start: SEG.S6.start + 100, end: SEG.S6.start + 550 };
const S6_ARROW_IN = { start: SEG.S6.start + 480, end: SEG.S6.start + 980 };
const S6_FIELDS = ["Campaign Name", "Landing Page URL", "Offer Price"];
const S6_FIELDS_X = [300, 480, 660];
const S6_FIELDS_STAGGER = 220;
const S6_FIELDS_IN = S6_FIELDS.map((_, i) => ({
  start: S6_ARROW_IN.end + 100 + i * S6_FIELDS_STAGGER, end: S6_ARROW_IN.end + 100 + i * S6_FIELDS_STAGGER + 400,
}));

export interface CampaignOnboardingVideoProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function CampaignOnboardingVideo({ onSkip, onComplete }: CampaignOnboardingVideoProps = {}) {
  const [elapsed, setElapsed] = useState(0);
  const [runId, setRunId] = useState(0);
  const [everFinished, setEverFinished] = useState(false);

  useEffect(() => {
    let raf: number;
    const startedAt = performance.now();
    function loop(now: number) {
      const t = now - startedAt;
      setElapsed(Math.min(t, TOTAL));
      if (t < TOTAL) raf = requestAnimationFrame(loop);
      else if (!everFinished) { setEverFinished(true); onComplete?.(); }
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const t = elapsed;
  const finished = t >= TOTAL;
  const replay = () => { setElapsed(0); setRunId((id) => id + 1); };

  /* ---------------- Group opacities (contiguous visual scenes) ---------------- */
  const welcomeOpacity = segOpacity(t, "S1");
  const hubLabelOpacity = rangeOpacity(t, HUB_LABEL_RANGE[0], HUB_LABEL_RANGE[1]);
  const conceptOpacity = segOpacity(t, "S2");
  const worldOpacity = segOpacity(t, "S3");
  const laterOpacity = segOpacity(t, "S4");
  const campaignsOpacity = segOpacity(t, "S5");
  const handoffOpacity = segOpacity(t, "S6");
  const finalFadeOut = t > SEG.S6.end - 500 ? 1 - prog(t, SEG.S6.end - 500, SEG.S6.end - 60) : 1;

  /* ---------------- S1 — welcome ring pulse ---------------- */
  const s1RingP = prog(t, S1_RING.start, S1_RING.end);
  const s1RingVal = t > S1_RING.start && t < S1_RING.end ? Math.sin(s1RingP * Math.PI) : 0;

  /* ---------------- S3 — hold pulse once the world is built ---------------- */
  const s3PulseVal = t > S3_PULSE.start && t < S3_PULSE.end ? Math.sin(prog(t, S3_PULSE.start, S3_PULSE.end) * Math.PI) : 0;

  /* ---------------- S4 — hold pulse on "start with the basics" ---------------- */
  const s4PulseVal = t > S4_HOLD.start && t < S4_HOLD.end ? Math.sin(prog(t, S4_HOLD.start, S4_HOLD.end) * Math.PI) : 0;

  /* ---------------- S5 — three worlds converge into one ---------------- */
  const convergeP = prog(t, S5_CONVERGE.start, S5_CONVERGE.end);
  const s5PulseVal = t > S5_PULSE.start && t < S5_PULSE.end ? Math.sin(prog(t, S5_PULSE.start, S5_PULSE.end) * Math.PI) : 0;

  return (
    <div style={{
      width: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "18px 12px 4px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 720, opacity: finalFadeOut }}>
        <svg viewBox="0 0 960 520" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1 — Vix appears, warm welcome ================= */}
          <g opacity={welcomeOpacity}>
            <circle cx={480} cy={230} r={44 + s1RingVal * 22} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s1RingVal * 0.4} />
            <g opacity={prog(t, S1_VIX_IN.start, S1_VIX_IN.end)}
              style={{ transformOrigin: "480px 230px", transform: `scale(${lerp(0.7, 1, prog(t, S1_VIX_IN.start, S1_VIX_IN.end))})` }}>
              <Person x={480} y={230} size={64} emoji="🦊" />
            </g>
            <Badge x={480} y={296} t={t} arriveStart={S1_LABEL_IN.start} arriveEnd={S1_LABEL_IN.end} label="Vix" width={78} filled />
          </g>

          {/* ================= persistent hub label (S2 → S3) ================= */}
          <g opacity={hubLabelOpacity}>
            <Badge x={HUB.x} y={HUB.y} t={t} arriveStart={S2_HUB_IN.start} arriveEnd={S2_HUB_IN.end} label="Campaign" width={150} filled />
          </g>

          {/* ================= S2 — one campaign = product / service / offer ================= */}
          <g opacity={conceptOpacity}>
            <Badge x={480} y={170} t={t} arriveStart={S2_HEAD_IN.start} arriveEnd={S2_HEAD_IN.end} label="One Campaign" width={190} />
            {S2_SUB.map((s, i) => (
              <React.Fragment key={s.label}>
                <DrawLine d={`M${s.x},${378} L${s.x + (480 - s.x) * 0.35},${330}`} t={t}
                  start={S2_SUB_IN[i].start} end={S2_SUB_IN[i].end} width={1} color={LINE} />
                <Chip x={s.x} y={392} t={t} start={S2_SUB_IN[i].start} end={S2_SUB_IN[i].end} label={s.label} tone="accent" width={104} />
              </React.Fragment>
            ))}
          </g>

          {/* ================= S3 — everything belonging to that offer ================= */}
          <g opacity={worldOpacity}>
            {S3_NODE_DEFS.map((n, i) => (
              <DrawLine key={`line-${n.label}`} d={`M${HUB.x},${HUB.y} L${S3_NODE_POS[i].x},${S3_NODE_POS[i].y}`} t={t}
                start={S3_LINES_IN[i].start} end={S3_LINES_IN[i].end} width={1} color={ACCENT} opacity={0.45} />
            ))}
            {S3_NODE_DEFS.map((n, i) => (
              <Chip key={n.label} x={S3_NODE_POS[i].x} y={S3_NODE_POS[i].y} t={t}
                start={S3_NODES_IN[i].start} end={S3_NODES_IN[i].end} label={n.label} tone="accent" width={n.width} />
            ))}
            <circle cx={HUB.x} cy={HUB.y} r={22 + s3PulseVal * 14} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s3PulseVal * 0.35} />
            <text x={480} y={470} textAnchor="middle" fontFamily={MONO} fontSize={10} fontWeight={700} letterSpacing={0.6} fill={MUTED}
              opacity={fadeWindow(t, S3_LAST_END, S3_LAST_END + 250, SEG.S3.end - 200, SEG.S3.end)} style={{ textTransform: "uppercase" }}>
              all one offer, all one campaign
            </text>
          </g>

          {/* ================= S4 — you don't need everything now ================= */}
          <g opacity={laterOpacity}>
            {S3_NODE_DEFS.map((n, i) => (
              <React.Fragment key={`later-${n.label}`}>
                <DrawLine d={`M${HUB.x},${HUB.y} L${S3_NODE_POS[i].x},${S3_NODE_POS[i].y}`} t={t}
                  start={S4_NODES_MUTED_IN.start} end={S4_NODES_MUTED_IN.end} width={1} color={LINE} dash="2 5" />
                <g opacity={0.55 * prog(t, S4_NODES_MUTED_IN.start, S4_NODES_MUTED_IN.end)}>
                  <Chip x={S3_NODE_POS[i].x} y={S3_NODE_POS[i].y} t={t}
                    start={S4_NODES_MUTED_IN.start} end={S4_NODES_MUTED_IN.end} label={n.label} tone="muted" width={n.width} />
                </g>
              </React.Fragment>
            ))}
            <circle cx={HUB.x} cy={HUB.y} r={54 + s4PulseVal * 10} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s4PulseVal * 0.3} />
            <Badge x={HUB.x} y={HUB.y} t={t} arriveStart={S4_BADGE_IN.start} arriveEnd={S4_BADGE_IN.end} label="Start With The Basics" width={260} filled />
          </g>

          {/* ================= S5 — as many campaigns as offers, then: one world ================= */}
          <g opacity={campaignsOpacity}>
            {S5_CAMPAIGNS.map((c, i) => {
              const cx = lerp(c.x, HUB.x, convergeP);
              const cy = lerp(c.y, HUB.y, convergeP);
              const fade = 1 - convergeP;
              return (
                <g key={c.label} opacity={prog(t, S5_CAMP_IN[i].start, S5_CAMP_IN[i].end) * (convergeP > 0 ? fade : 1)}>
                  <Person x={cx} y={cy - 34} size={30} emoji={c.emoji} />
                  <Badge x={cx} y={cy + 6} t={t} arriveStart={S5_CAMP_IN[i].start} arriveEnd={S5_CAMP_IN[i].end} label={c.label} width={132} />
                </g>
              );
            })}
            <circle cx={HUB.x} cy={HUB.y} r={20 + s5PulseVal * 16} fill="none" stroke={ACCENT} strokeWidth={1}
              opacity={s5PulseVal * 0.4 * prog(t, S5_FINAL_BADGE_IN.start, S5_FINAL_BADGE_IN.end)} />
            <Badge x={HUB.x} y={HUB.y + 4} t={t} arriveStart={S5_FINAL_BADGE_IN.start} arriveEnd={S5_FINAL_BADGE_IN.end}
              label="One Offer → One Campaign" width={310} filled />
          </g>

          {/* ================= S6 — Vix guides you into the form ================= */}
          <g opacity={handoffOpacity}>
            <g opacity={prog(t, S6_VIX_IN.start, S6_VIX_IN.end)}>
              <Person x={480} y={140} size={44} emoji="🦊" />
            </g>
            <DrawLine d="M480,172 L480,270" t={t} start={S6_ARROW_IN.start} end={S6_ARROW_IN.end} width={1.2} color={ACCENT} />
            <path d="M470,262 L480,278 L490,262" fill="none" stroke={ACCENT} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"
              opacity={prog(t, S6_ARROW_IN.start + 200, S6_ARROW_IN.end)} />
            {S6_FIELDS.map((f, i) => (
              <React.Fragment key={f}>
                <DrawLine d={`M480,282 L${S6_FIELDS_X[i]},322`} t={t} start={S6_FIELDS_IN[i].start} end={S6_FIELDS_IN[i].end} width={1} color={LINE} />
                <Chip x={S6_FIELDS_X[i]} y={336} t={t} start={S6_FIELDS_IN[i].start} end={S6_FIELDS_IN[i].end} label={f} tone="accent" width={f.length * 7 + 34} fontSize={9} />
              </React.Fragment>
            ))}
          </g>
        </svg>
      </div>

      {/* ---------- Caption bar ---------- */}
      <div style={{ minHeight: 58, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, padding: "0 20px" }}>
        {CAPTIONS.map((c, i) => {
          const op = fadeWindow(t, c.a, c.b, c.c, c.d);
          if (op <= 0.001) return null;
          return (
            <p key={i} style={{
              position: "absolute", margin: 0, fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
              fontSize: 15.5, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center",
              whiteSpace: "pre-line", lineHeight: 1.4, maxWidth: 620,
            }}>
              {c.text}
            </p>
          );
        })}
      </div>

      {/* ---------- Playback controls ---------- */}
      {!finished ? (
        <button type="button" onClick={() => { setElapsed(TOTAL); onSkip?.(); }} style={{
          position: "absolute", top: 8, right: 10,
          display: "flex", alignItems: "center", gap: 5,
          background: "rgba(255,255,255,0.9)", border: `1px solid ${LINE}`,
          borderRadius: 999, fontFamily: MONO, fontSize: 10,
          fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
          color: "#6b6b78", cursor: "pointer", padding: "6px 12px",
        }}>
          Skip video <span aria-hidden="true">→</span>
        </button>
      ) : (
        <button type="button" onClick={replay} style={{
          position: "absolute", bottom: 2, right: 10,
          background: "none", border: "none", fontFamily: MONO, fontSize: 10.5,
          letterSpacing: 0.4, color: "#9a9aa8", cursor: "pointer", padding: 4,
        }}>
          ↻ replay
        </button>
      )}
    </div>
  );
}
