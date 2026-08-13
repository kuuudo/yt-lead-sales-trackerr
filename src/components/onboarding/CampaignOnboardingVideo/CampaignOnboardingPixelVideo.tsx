import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Campaign Onboarding Video: Pixel Tracking
   "Don't use Stripe? That's okay..." → "...we record it in your
   analytics."

   Standalone, modular scene file. Self-contained — regenerates the
   same visual language, primitives, and timing philosophy locally
   as CampaignOnboardingVideo.tsx / CampaignOnboardingStripeVideo.tsx
   (no import-time dependency on either), so it reads as the same
   product without creating a shared-file coupling.

   PURPOSE: sits on the "How do customers pay you?" step, attached
   to the "I use another payment method" option. Short, simple,
   premium explainer — three beats, minimal motion, one idea per
   scene.

   SCRIPT: the source script had a few grammatical rough edges
   ("some country dont support strip", "Dotn worry", a dangling
   question mark). Per direction, those are lightly cleaned up here
   so the line reads smoothly and is easy to follow on a single
   watch — the content and meaning are unchanged. S2 and S3 are
   used as provided, with only a small punctuation tweak in S3 for
   readability.

   CANVAS — 400x360 (portrait, shorter than the Campaign video's
   400x460) — same footprint as the Stripe video so the two clips
   feel like a matched pair.

   STORY: no Stripe → Pixel Tracking instead → add VSTRK code to the
   Thank You page → customer completes an action → pixel fires →
   VSTRK Analytics records the conversion. Vix appears silently at
   the very end, beside the result — no line, no extra scene.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — one beat per sentence (3 beats), played back to back
   with a 280ms cross-fade gap.
----------------------------------------------------------------- */
const GAP = 280;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "Don't use Stripe? That's okay — some countries don't support it. VSTRK can still track your conversions with Pixel Tracking.", 4400],
  ["S2", "We simply add VSTRK code into your thank-you page. That's it.", 2800],
  ["S3", "When someone completes an action — like submitting a newsletter signup, booking a call, or completing a purchase — the pixel tells VSTRK the conversion happened, and we record it in your analytics.", 6600],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S3.end + 700;

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
   Canvas: viewBox "0 0 400 360" — matches the Stripe video's
   footprint so the two clips feel like a matched pair.
================================================================= */
const CX = 200;

/* ---- S1 — no Stripe → Pixel Tracking instead ---- */
const S1_STRIPE_IN = { start: SEG.S1.start + 200, end: SEG.S1.start + 650 };
const S1_LINE_IN = { start: SEG.S1.start + 900, end: SEG.S1.start + 1300 };
const S1_PIXEL_IN = { start: SEG.S1.start + 1250, end: SEG.S1.start + 1700 };
const S1_HOLD = { start: S1_PIXEL_IN.end + 150, end: SEG.S1.end - 150 };

/* ---- Thank You page card — persists across S2 → S3, same
   "hub" continuity technique as the Campaign video's HUB badge ---- */
const CARD = { x: CX, y: 150 };
const CARD_IN = { start: SEG.S2.start + 150, end: SEG.S2.start + 650 };
const CARD_LABEL_RANGE: [string, string] = ["S2", "S3"];

/* ---- S2 — add VSTRK code to the Thank You page, that's it ---- */
const S2_MARK_IN = { start: SEG.S2.start + 750, end: SEG.S2.start + 1150 };
const S2_BADGE_IN = { start: SEG.S2.start + 1350, end: SEG.S2.start + 1800 };
const S2_HOLD = { start: S2_BADGE_IN.end + 100, end: SEG.S2.end - 100 };

/* ---- S3 — action happens → pixel fires → VSTRK Analytics records it ---- */
const S3_ACTIONS = ["Newsletter", "Booking", "Purchase"];
const S3_ACTION_STAGGER = 240;
const S3_ACTIONS_IN = S3_ACTIONS.map((_, i) => ({
  start: SEG.S3.start + 200 + i * S3_ACTION_STAGGER, end: SEG.S3.start + 200 + i * S3_ACTION_STAGGER + 420,
}));
const S3_ACTIONS_LAST_END = S3_ACTIONS_IN[S3_ACTIONS_IN.length - 1].end;
const S3_PULSE_TRAVEL = { start: S3_ACTIONS_LAST_END + 250, end: S3_ACTIONS_LAST_END + 900 };
const S3_ANALYTICS_IN = { start: S3_PULSE_TRAVEL.end - 100, end: S3_PULSE_TRAVEL.end + 350 };
const S3_RING = { start: S3_ANALYTICS_IN.end + 100, end: S3_ANALYTICS_IN.end + 900 };

/* ---- Vix — silent cameo in the final stretch of S3, beside the
   VSTRK Analytics result. No line, no separate scene. ---- */
const S3_VIX_IN = { start: S3_RING.start + 150, end: S3_RING.start + 550 };

export interface CampaignOnboardingPixelVideoProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function CampaignOnboardingPixelVideo({ onSkip, onComplete }: CampaignOnboardingPixelVideoProps = {}) {
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
  const introOpacity = segOpacity(t, "S1");
  const cardLabelOpacity = rangeOpacity(t, CARD_LABEL_RANGE[0], CARD_LABEL_RANGE[1]);
  const codeAddedOpacity = segOpacity(t, "S2");
  const conversionOpacity = segOpacity(t, "S3");
  const finalFadeOut = t > SEG.S3.end - 500 ? 1 - prog(t, SEG.S3.end - 500, SEG.S3.end - 60) : 1;

  /* ---------------- S3 — pulse travels from the page to VSTRK Analytics ---------------- */
  const travelP = prog(t, S3_PULSE_TRAVEL.start, S3_PULSE_TRAVEL.end);
  const pulseVisible = t > S3_PULSE_TRAVEL.start && t < S3_PULSE_TRAVEL.end;
  const pulseX = lerp(CARD.x, CX, travelP);
  const pulseY = lerp(CARD.y + 38, 268, travelP);
  const s3RingVal = t > S3_RING.start && t < S3_RING.end ? Math.sin(prog(t, S3_RING.start, S3_RING.end) * Math.PI) : 0;

  return (
    <div style={{
      width: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "16px 10px 2px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 700, opacity: finalFadeOut }}>
        <svg viewBox="0 0 400 360" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= S1 — no Stripe → Pixel Tracking instead ================= */}
          <g opacity={introOpacity}>
            <Badge x={140} y={130} t={t} arriveStart={S1_STRIPE_IN.start} arriveEnd={S1_STRIPE_IN.end}
              label="Stripe" width={84} fontSize={9.5} h={24} muted />
            <DrawLine d={`M${140 + 46},130 L${280 - 62},130`} t={t}
              start={S1_LINE_IN.start} end={S1_LINE_IN.end} width={1.2} color={ACCENT} />
            <Badge x={280} y={130} t={t} arriveStart={S1_PIXEL_IN.start} arriveEnd={S1_PIXEL_IN.end}
              label="Pixel Tracking" width={140} fontSize={9.5} h={26} filled />
          </g>

          {/* ================= persistent Thank You page card (S2 → S3) ================= */}
          <g opacity={cardLabelOpacity}>
            <g opacity={prog(t, CARD_IN.start, CARD_IN.end)}
              style={{ transformOrigin: `${CARD.x}px ${CARD.y}px`, transform: `scale(${lerp(0.94, 1, prog(t, CARD_IN.start, CARD_IN.end))})` }}>
              <rect x={CARD.x - 92} y={CARD.y - 42} width={184} height={84} rx={12} fill="#ffffff" stroke={LINE} strokeWidth={1.2} />
              <text x={CARD.x} y={CARD.y - 18} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={9.5} letterSpacing={0.4} fill={INK}
                style={{ textTransform: "uppercase" }}>Thank You Page</text>
              <line x1={CARD.x - 68} y1={CARD.y - 6} x2={CARD.x + 68} y2={CARD.y - 6} stroke={LINE} strokeWidth={1} />
            </g>
          </g>

          {/* ================= S2 — add VSTRK code, that's it ================= */}
          <g opacity={codeAddedOpacity}>
            <g opacity={prog(t, S2_MARK_IN.start, S2_MARK_IN.end)}>
              <circle cx={CARD.x + 70} cy={CARD.y - 36} r={7} fill={ACCENT} />
              <text x={CARD.x + 70} y={CARD.y - 36} dy="0.32em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={8} fill="#ffffff">{"<>"}</text>
            </g>
            <Badge x={CX} y={222} t={t} arriveStart={S2_BADGE_IN.start} arriveEnd={S2_BADGE_IN.end}
              label="Code Added — That's It" width={198} fontSize={9} />
          </g>

          {/* ================= S3 — action → pixel fires → VSTRK Analytics ================= */}
          <g opacity={conversionOpacity}>
            {/* small dot marker persists visually from S2, quietly re-declared here */}
            <circle cx={CARD.x + 70} cy={CARD.y - 36} r={7} fill={ACCENT} opacity={0.9} />
            <text x={CARD.x + 70} y={CARD.y - 36} dy="0.32em" textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={8} fill="#ffffff">{"<>"}</text>

            {S3_ACTIONS.map((label, i) => (
              <Chip key={label} x={70 + i * 130} y={60} t={t}
                start={S3_ACTIONS_IN[i].start} end={S3_ACTIONS_IN[i].end} label={label} tone="accent" width={112} />
            ))}

            {pulseVisible && (
              <circle cx={pulseX} cy={pulseY} r={5} fill={ACCENT} opacity={1 - travelP * 0.15} />
            )}

            <DrawLine d={`M${CARD.x},${CARD.y + 42} L${CX},${252}`} t={t}
              start={S3_PULSE_TRAVEL.start} end={S3_PULSE_TRAVEL.end} width={1} color={LINE} dash="2 5" />

            <Badge x={CX} y={268} t={t} arriveStart={S3_ANALYTICS_IN.start} arriveEnd={S3_ANALYTICS_IN.end}
              label="VSTRK Analytics" width={172} fontSize={9.5} filled />
            <circle cx={CX} cy={268} r={22 + s3RingVal * 12} fill="none" stroke={ACCENT} strokeWidth={1} opacity={s3RingVal * 0.35} />

            {/* ---- Vix — silent cameo beside the final result ---- */}
            <g opacity={prog(t, S3_VIX_IN.start, S3_VIX_IN.end)}
              style={{ transformOrigin: "300px 268px", transform: `scale(${lerp(0.7, 1, prog(t, S3_VIX_IN.start, S3_VIX_IN.end))})` }}>
              <Person x={300} y={268} size={28} emoji="🦊" />
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
