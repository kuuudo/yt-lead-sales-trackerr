import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Campaign Onboarding Video: Stripe Tracking
   "If you use Stripe, VSTRK can track your purchases directly
   through Stripe." → "...we take care of the tracking."

   Standalone, modular scene file. Self-contained — regenerates the
   same visual language, primitives, and timing philosophy locally
   as CampaignOnboardingVideo.tsx / Section06 (no import-time
   dependency on either), so it reads as the same product without
   creating a shared-file coupling.

   PURPOSE: sits on the "How do customers pay you?" step, attached
   to the "I use Stripe" option. Short, simple, premium explainer —
   deliberately NOT as elaborate as the main Campaign onboarding
   video. One idea per scene, four beats total, minimal motion.

   SCRIPT: used verbatim, word-for-word, split one beat per sentence
   (narrator S1–S3, Vix S4) — identical philosophy to the Campaign
   video.

   CANVAS — 400x360 (portrait, shorter than the Campaign video's
   400x460). Fewer elements means less vertical room is needed; this
   keeps the clip visually "lighter" inside the onboarding panel.

   STORY: Customer → Stripe → VSTRK (payment confirmed, purchase +
   revenue tracked automatically) → no pixel needed on the Thank You
   page → Vix confirms, simple.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — one beat per exact narration sentence (4 beats), played
   back to back with a 280ms cross-fade gap.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "If you use Stripe, VSTRK can track your purchases directly through Stripe.", 3400],
  ["S2", "Stripe confirms when a payment comes in, so your purchase and revenue data are tracked automatically.", 4200],
  ["S3", "Setup is also a little easier — no pixel is needed on your Thank You page. Pixel tracking is still easy, but Stripe means one less thing to set up.", 6200],
  ["S4", "Simple. Stripe tells us when the money comes in, and we take care of the tracking.", 3800],
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

/* ---------------- Visual primitives — regenerated from Campaign video ---------------- */

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

function Badge({ x, y, t, arriveStart, arriveEnd, label, scalePulse = 0, width = 96, filled = false, muted = false, tone = ACCENT, fontSize = 11, h = 26 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; scalePulse?: number; width?: number; filled?: boolean; muted?: boolean; tone?: string; fontSize?: number; h?: number }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const bx = x - width / 2, by = y - h / 2;
  const scale = lerp(0.85, 1, p) * (1 + 0.04 * scalePulse);
  const strokeColor = muted ? LINE : tone;
  const textColor = filled ? "#ffffff" : muted ? MUTED : tone;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={13} fill={filled ? tone : "#ffffff"} stroke={strokeColor} strokeWidth={1.2}
        style={{ filter: filled ? `drop-shadow(0 3px 8px rgba(91,61,240,0.2))` : undefined }} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={fontSize}
        letterSpacing={0.8} fill={textColor} style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function Chip({ x, y, t, start, end, label, tone = "accent", width = 118, fontSize = 8.5 }:
  { x: number; y: number; t: number; start: number; end: number; label: string; tone?: "muted" | "accent" | "filled"; width?: number; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 22;
  const bx = x - width / 2, by = y - h / 2;
  const tColor = ACCENT;
  const fill = tone === "filled" ? tColor : "#ffffff";
  const stroke = tone === "muted" ? LINE : tColor;
  const textFill = tone === "filled" ? "#ffffff" : tone === "muted" ? MUTED : tColor;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={11} fill={fill} stroke={stroke} strokeWidth={1} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.2} fill={textFill}
        style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

/* =================================================================
   BEAT-SPECIFIC TIMING & LAYOUT
   Canvas: viewBox "0 0 400 360" — shorter than the Campaign video
   since this clip carries far fewer elements.
================================================================= */
const CX = 200;
const ROW_Y = 130;
const CUST_X = 78;
const STRIPE_X = 200;
const VSTRK_X = 322;

/* ---- S1 — customer → Stripe ---- */
const S1_CUST_IN = { start: SEG.S1.start + 150, end: SEG.S1.start + 600 };
const S1_LINE1_IN = { start: SEG.S1.start + 500, end: SEG.S1.start + 950 };
const S1_STRIPE_IN = { start: SEG.S1.start + 850, end: SEG.S1.start + 1300 };
const S1_HOLD = { start: S1_STRIPE_IN.end + 150, end: SEG.S1.end - 150 };

/* ---- S2 — Stripe → VSTRK, purchase / revenue / tracked ---- */
const S2_LINE2_IN = { start: SEG.S2.start + 150, end: SEG.S2.start + 600 };
const S2_VSTRK_IN = { start: SEG.S2.start + 500, end: SEG.S2.start + 950 };
const S2_CHIPS = ["Purchase", "Revenue", "Tracked"];
const S2_CHIP_STAGGER = 260;
const S2_CHIPS_IN = S2_CHIPS.map((_, i) => ({
  start: S2_VSTRK_IN.end + 150 + i * S2_CHIP_STAGGER, end: S2_VSTRK_IN.end + 150 + i * S2_CHIP_STAGGER + 420,
}));
const S2_LAST_END = S2_CHIPS_IN[S2_CHIPS_IN.length - 1].end;
const S2_PULSE = { start: S2_LAST_END + 150, end: SEG.S2.end - 150 };

/* ---- S3 — no pixel needed on the Thank You page ---- */
const S3_CARD_IN = { start: SEG.S3.start + 150, end: SEG.S3.start + 650 };
const S3_MARK_IN = { start: SEG.S3.start + 900, end: SEG.S3.start + 1350 };
const S3_BADGE_IN = { start: SEG.S3.start + 1650, end: SEG.S3.start + 2150 };
const S3_HOLD = { start: S3_BADGE_IN.end + 150, end: SEG.S3.end - 150 };

/* ---- S4 — Vix confirms, quiet echo of Stripe → VSTRK behind her ---- */
const S4_VIX_IN = { start: SEG.S4.start + 100, end: SEG.S4.start + 550 };
const S4_LABEL_IN = { start: SEG.S4.start + 450, end: SEG.S4.start + 850 };
const S4_ECHO_IN = { start: SEG.S4.start + 700, end: SEG.S4.start + 1150 };

export interface CampaignOnboardingStripeVideoProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function CampaignOnboardingStripeVideo({ onSkip, onComplete }: CampaignOnboardingStripeVideoProps = {}) {
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

  /* ---------------- Group opacities ---------------- */
  const flowInOpacity = segOpacity(t, "S1");
  const confirmOpacity = segOpacity(t, "S2");
  const noPixelOpacity = segOpacity(t, "S3");
  const vixOpacity = segOpacity(t, "S4");
  const finalFadeOut = t > SEG.S4.end - 500 ? 1 - prog(t, SEG.S4.end - 500, SEG.S4.end - 60) : 1;

  /* ---------------- S2 — hold pulse once purchase/revenue/tracked have landed ---------------- */
  const s2PulseVal = t > S2_PULSE.start && t < S2_PULSE.end ? Math.sin(prog(t, S2_PULSE.start, S2_PULSE.end) * Math.PI) : 0;

  /* ---------------- S3 — hold pulse on "no pixel needed" ---------------- */
  const s3PulseVal = t > S3_HOLD.start && t < S3_HOLD.end ? Math.sin(prog(t, S3_HOLD.start, S3_HOLD.end) * Math.PI) : 0;

  return (
    <div style={{
      width: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "16px 10px 2px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 700, opacity: finalFadeOut }}>
        <svg viewBox="0 0 400 360" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1 — customer → Stripe ================= */}
          <g opacity={flowInOpacity}>
            <g opacity={prog(t, S1_CUST_IN.start, S1_CUST_IN.end)}
              style={{ transformOrigin: `${CUST_X}px ${ROW_Y}px`, transform: `scale(${lerp(0.8, 1, prog(t, S1_CUST_IN.start, S1_CUST_IN.end))})` }}>
              <Person x={CUST_X} y={ROW_Y} size={30} emoji="🧑" />
            </g>
            <DrawLine d={`M${CUST_X + 22},${ROW_Y} L${STRIPE_X - 52},${ROW_Y}`} t={t}
              start={S1_LINE1_IN.start} end={S1_LINE1_IN.end} width={1.2} color={ACCENT} />
            <Badge x={STRIPE_X} y={ROW_Y} t={t} arriveStart={S1_STRIPE_IN.start} arriveEnd={S1_STRIPE_IN.end}
              label="Stripe" width={92} filled />
          </g>

          {/* ================= S2 — Stripe → VSTRK, purchase / revenue / tracked ================= */}
          <g opacity={confirmOpacity}>
            {/* quiet echo of S1's customer → Stripe so the row reads as one continuous flow */}
            <g opacity={0.5}>
              <Person x={CUST_X} y={ROW_Y} size={30} emoji="🧑" />
            </g>
            <DrawLine d={`M${CUST_X + 22},${ROW_Y} L${STRIPE_X - 52},${ROW_Y}`} t={t} start={0} end={1} opacity={0.5} width={1.2} color={ACCENT} />
            <Badge x={STRIPE_X} y={ROW_Y} t={t} arriveStart={0} arriveEnd={1} label="Stripe" width={92} filled />

            <DrawLine d={`M${STRIPE_X + 46},${ROW_Y} L${VSTRK_X - 40},${ROW_Y}`} t={t}
              start={S2_LINE2_IN.start} end={S2_LINE2_IN.end} width={1.2} color={ACCENT} />
            <Badge x={VSTRK_X} y={ROW_Y} t={t} arriveStart={S2_VSTRK_IN.start} arriveEnd={S2_VSTRK_IN.end}
              label="VSTRK" width={76} filled />
            <circle cx={VSTRK_X} cy={ROW_Y} r={22 + s2PulseVal * 12} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s2PulseVal * 0.35} />

            {S2_CHIPS.map((label, i) => (
              <Chip key={label} x={VSTRK_X} y={172 + i * 30} t={t}
                start={S2_CHIPS_IN[i].start} end={S2_CHIPS_IN[i].end} label={label} tone="accent" width={92} />
            ))}
          </g>

          {/* ================= S3 — no pixel needed on the Thank You page ================= */}
          <g opacity={noPixelOpacity}>
            <g opacity={prog(t, S3_CARD_IN.start, S3_CARD_IN.end)}
              style={{ transformOrigin: `${CX}px 150px`, transform: `scale(${lerp(0.94, 1, prog(t, S3_CARD_IN.start, S3_CARD_IN.end))})` }}>
              <rect x={CX - 92} y={108} width={184} height={84} rx={12} fill="#ffffff" stroke={LINE} strokeWidth={1.2} />
              <text x={CX} y={132} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={9.5} letterSpacing={0.4} fill={INK}
                style={{ textTransform: "uppercase" }}>Thank You Page</text>
              <line x1={CX - 68} y1={144} x2={CX + 68} y2={144} stroke={LINE} strokeWidth={1} />
            </g>

            <g opacity={prog(t, S3_MARK_IN.start, S3_MARK_IN.end)}>
              <circle cx={CX} cy={168} r={11} fill="none" stroke={MUTED} strokeWidth={1.4} strokeDasharray="2 3" />
              <line x1={CX - 7} y1={161} x2={CX + 7} y2={175} stroke={MUTED} strokeWidth={1.4} strokeLinecap="round" />
            </g>

            <Badge x={CX} y={218} t={t} arriveStart={S3_BADGE_IN.start} arriveEnd={S3_BADGE_IN.end}
              label="No Pixel Needed" width={168} fontSize={9.5} muted />
            <circle cx={CX} cy={150} r={64 + s3PulseVal * 8} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s3PulseVal * 0.18} />
          </g>

          {/* ================= S4 — Vix confirms ================= */}
          <g opacity={vixOpacity}>
            <g opacity={prog(t, S4_VIX_IN.start, S4_VIX_IN.end)}
              style={{ transformOrigin: `${CX}px 96px`, transform: `scale(${lerp(0.7, 1, prog(t, S4_VIX_IN.start, S4_VIX_IN.end))})` }}>
              <Person x={CX} y={96} size={42} emoji="🦊" />
            </g>
            <Badge x={CX} y={144} t={t} arriveStart={S4_LABEL_IN.start} arriveEnd={S4_LABEL_IN.end} label="Vix" width={64} filled />

            {/* quiet echo of the Stripe → VSTRK relationship behind her */}
            <g opacity={0.45 * prog(t, S4_ECHO_IN.start, S4_ECHO_IN.end)}>
              <Badge x={CX - 70} y={210} t={t} arriveStart={0} arriveEnd={1} label="Stripe" width={78} fontSize={9} h={22} filled />
              <DrawLine d={`M${CX - 30},210 L${CX + 30},210`} t={t} start={0} end={1} width={1} color={ACCENT} />
              <Badge x={CX + 70} y={210} t={t} arriveStart={0} arriveEnd={1} label="VSTRK" width={70} fontSize={9} h={22} filled />
            </g>
          </g>
        </svg>
      </div>

      {/* ---------- Caption bar ---------- */}
      <div style={{ minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, padding: "0 18px" }}>
        {CAPTIONS.map((c, i) => {
          const op = fadeWindow(t, c.a, c.b, c.c, c.d);
          if (op <= 0.001) return null;
          return (
            <p key={i} style={{
              position: "absolute", margin: 0, fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
              fontSize: 14.5, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center",
              whiteSpace: "pre-line", lineHeight: 1.4, maxWidth: 380,
            }}>
              {c.text}
            </p>
          );
        })}
      </div>

      {/* ---------- Playback controls ---------- */}
      {!finished ? (
        <button type="button" onClick={() => { setElapsed(TOTAL); onSkip?.(); }} style={{
          position: "absolute", top: 6, right: 8,
          display: "flex", alignItems: "center", gap: 5,
          background: "rgba(255,255,255,0.9)", border: `1px solid ${LINE}`,
          borderRadius: 999, fontFamily: MONO, fontSize: 9.5,
          fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
          color: "#6b6b78", cursor: "pointer", padding: "5px 10px",
        }}>
          Skip video <span aria-hidden="true">→</span>
        </button>
      ) : (
        <button type="button" onClick={replay} style={{
          position: "absolute", bottom: 2, right: 8,
          background: "none", border: "none", fontFamily: MONO, fontSize: 10,
          letterSpacing: 0.4, color: "#9a9aa8", cursor: "pointer", padding: 4,
        }}>
          ↻ replay
        </button>
      )}
    </div>
  );
}
