import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Campaign Onboarding Video: Thank You Page
   Explains what a Purchase Thank You Page is and why Pixel Tracking
   needs it. Triggered only when the user focuses the Purchase Thank
   You URL field — does not auto-play on arrival.

   Canvas 400x360 — matched pair with Stripe / Pixel clips.
   Very simple: boxes, arrows, one idea per beat. No complex motion.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

const GAP = 240;
const SEG_SOURCE: [string, string, number][] = [
  ["S1", "What is a Thank You Page?", 2800],
  ["S2", "After someone completes their purchase, they are sent to a Thank You Page.", 3600],
  ["S3", "For Pixel Tracking, we need this page so we have a place to install the VSTRK tracking code.", 4200],
  ["S4", "When the customer reaches this page, VSTRK knows the purchase was completed and can record the conversion.", 4400],
  ["S5", "Don't have a Thank You Page? No problem.", 2400],
  ["S6", "You can ask Claude or ChatGPT to generate one for you, or join our WhatsApp group and we'll help you set it up.", 4800],
];

const SEG: Record<string, { start: number; end: number; dur: number; text: string }> = {};
{
  let cursor = 0;
  for (const [key, text, dur] of SEG_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur, text };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.S6.end + 600;

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
function segOpacity(t: number, key: string, edge = 220) {
  const { start, end } = SEG[key];
  return fadeWindow(t, start, start + edge, end - edge, end);
}

function autoCaption(key: string, opts: { lead?: number; tail?: number; fade?: number } = {}) {
  const { lead = 180, tail = 220, fade = 180 } = opts;
  const seg = SEG[key];
  const a = seg.start + lead;
  const d = seg.end - tail;
  const b = Math.min(a + fade, a + (d - a) / 2);
  const c = Math.max(b, d - fade);
  return { text: seg.text, a, b, c, d };
}
const CAPTIONS = SEG_SOURCE.map(([key]) => autoCaption(key));

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE, dash }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string; dash?: string }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      pathLength={1} strokeDasharray={dash ? dash : 1} strokeDashoffset={dash ? undefined : 1 - p} opacity={opacity * (dash ? p : 1)} />
  );
}

function Box({ x, y, w, h, label, t, start, end, filled = false, fontSize = 10 }:
  { x: number; y: number; w: number; h: number; label: string; t: number; start: number; end: number; filled?: boolean; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const scale = lerp(0.9, 1, p);
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${scale})` }}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={10}
        fill={filled ? ACCENT : "#ffffff"} stroke={filled ? ACCENT : LINE} strokeWidth={1.2}
        style={{ filter: filled ? `drop-shadow(0 3px 8px rgba(91,61,240,0.18))` : undefined }} />
      <text x={x} y={y} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800}
        fontSize={fontSize} letterSpacing={0.4} fill={filled ? "#ffffff" : INK}
        style={{ textTransform: "uppercase" }}>{label}</text>
    </g>
  );
}

function ArrowDown({ x, y1, y2, t, start, end }: { x: number; y1: number; y2: number; t: number; start: number; end: number }) {
  return <DrawLine d={`M${x},${y1} L${x},${y2}`} t={t} start={start} end={end} width={1.3} color={ACCENT} />;
}

const CX = 200;

/* S1 — Purchase → Checkout → Thank You Page */
const S1_B1 = { start: SEG.S1.start + 200, end: SEG.S1.start + 600 };
const S1_A1 = { start: SEG.S1.start + 550, end: SEG.S1.start + 900 };
const S1_B2 = { start: SEG.S1.start + 850, end: SEG.S1.start + 1250 };
const S1_A2 = { start: SEG.S1.start + 1200, end: SEG.S1.start + 1550 };
const S1_B3 = { start: SEG.S1.start + 1500, end: SEG.S1.start + 1950 };

/* S2 — Checkout → Payment successful → Thank You! */
const S2_B1 = { start: SEG.S2.start + 150, end: SEG.S2.start + 550 };
const S2_A1 = { start: SEG.S2.start + 500, end: SEG.S2.start + 850 };
const S2_B2 = { start: SEG.S2.start + 800, end: SEG.S2.start + 1250 };
const S2_A2 = { start: SEG.S2.start + 1200, end: SEG.S2.start + 1550 };
const S2_B3 = { start: SEG.S2.start + 1500, end: SEG.S2.start + 2000 };

/* S3 — focus Thank You → VSTRK Pixel */
const S3_TY = { start: SEG.S3.start + 150, end: SEG.S3.start + 600 };
const S3_A = { start: SEG.S3.start + 700, end: SEG.S3.start + 1100 };
const S3_PX = { start: SEG.S3.start + 1050, end: SEG.S3.start + 1600 };

/* S4 — Customer → Thank You → VSTRK → Purchase Recorded */
const S4_C = { start: SEG.S4.start + 150, end: SEG.S4.start + 500 };
const S4_A1 = { start: SEG.S4.start + 450, end: SEG.S4.start + 750 };
const S4_TY = { start: SEG.S4.start + 700, end: SEG.S4.start + 1100 };
const S4_A2 = { start: SEG.S4.start + 1050, end: SEG.S4.start + 1350 };
const S4_V = { start: SEG.S4.start + 1300, end: SEG.S4.start + 1700 };
const S4_A3 = { start: SEG.S4.start + 1650, end: SEG.S4.start + 1950 };
const S4_R = { start: SEG.S4.start + 1900, end: SEG.S4.start + 2400 };

/* S5 — Thank You Page appears (easy to create) */
const S5_IN = { start: SEG.S5.start + 200, end: SEG.S5.start + 900 };

/* S6 — Claude / ChatGPT → Thank You Page (+ soft support hint) */
const S6_AI = { start: SEG.S6.start + 150, end: SEG.S6.start + 600 };
const S6_A = { start: SEG.S6.start + 550, end: SEG.S6.start + 950 };
const S6_TY = { start: SEG.S6.start + 900, end: SEG.S6.start + 1400 };
const S6_WA = { start: SEG.S6.start + 1800, end: SEG.S6.start + 2400 };

export interface CampaignOnboardingThankYouVideoProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function CampaignOnboardingThankYouVideo({ onSkip, onComplete }: CampaignOnboardingThankYouVideoProps = {}) {
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

  const finalFadeOut = t > SEG.S6.end - 400 ? 1 - prog(t, SEG.S6.end - 400, SEG.S6.end - 40) : 1;

  return (
    <div style={{
      width: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "16px 10px 2px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 700, opacity: finalFadeOut }}>
        <svg viewBox="0 0 400 360" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* S1 — Purchase → Checkout → Thank You Page */}
          <g opacity={segOpacity(t, "S1")}>
            <Box x={CX} y={70} w={120} h={28} label="Purchase" t={t} start={S1_B1.start} end={S1_B1.end} />
            <ArrowDown x={CX} y1={88} y2={118} t={t} start={S1_A1.start} end={S1_A1.end} />
            <Box x={CX} y={140} w={120} h={28} label="Checkout" t={t} start={S1_B2.start} end={S1_B2.end} />
            <ArrowDown x={CX} y1={158} y2={188} t={t} start={S1_A2.start} end={S1_A2.end} />
            <Box x={CX} y={210} w={150} h={30} label="Thank You Page" t={t} start={S1_B3.start} end={S1_B3.end} filled />
          </g>

          {/* S2 — Checkout → Payment successful → Thank You! */}
          <g opacity={segOpacity(t, "S2")}>
            <Box x={CX} y={70} w={120} h={28} label="Checkout" t={t} start={S2_B1.start} end={S2_B1.end} />
            <ArrowDown x={CX} y1={88} y2={118} t={t} start={S2_A1.start} end={S2_A1.end} />
            <Box x={CX} y={140} w={160} h={28} label="Payment successful" t={t} start={S2_B2.start} end={S2_B2.end} />
            <ArrowDown x={CX} y1={158} y2={188} t={t} start={S2_A2.start} end={S2_A2.end} />
            <Box x={CX} y={210} w={130} h={30} label="Thank You!" t={t} start={S2_B3.start} end={S2_B3.end} filled />
          </g>

          {/* S3 — Thank You Page → VSTRK Pixel */}
          <g opacity={segOpacity(t, "S3")}>
            <Box x={CX} y={110} w={160} h={32} label="Thank You Page" t={t} start={S3_TY.start} end={S3_TY.end} filled />
            <ArrowDown x={CX} y1={130} y2={170} t={t} start={S3_A.start} end={S3_A.end} />
            <Box x={CX} y={195} w={140} h={30} label="VSTRK Pixel" t={t} start={S3_PX.start} end={S3_PX.end} />
          </g>

          {/* S4 — Customer → Thank You Page → VSTRK → Purchase Recorded */}
          <g opacity={segOpacity(t, "S4")}>
            <Box x={70} y={160} w={100} h={28} label="Customer" t={t} start={S4_C.start} end={S4_C.end} fontSize={9} />
            <DrawLine d="M125,160 L155,160" t={t} start={S4_A1.start} end={S4_A1.end} width={1.3} color={ACCENT} />
            <Box x={200} y={160} w={130} h={28} label="Thank You Page" t={t} start={S4_TY.start} end={S4_TY.end} fontSize={8.5} filled />
            <DrawLine d="M270,160 L300,160" t={t} start={S4_A2.start} end={S4_A2.end} width={1.3} color={ACCENT} />
            <Box x={340} y={160} w={80} h={28} label="VSTRK" t={t} start={S4_V.start} end={S4_V.end} fontSize={9} />
            <DrawLine d="M340,178 L340,210" t={t} start={S4_A3.start} end={S4_A3.end} width={1.3} color={ACCENT} />
            <Box x={340} y={235} w={140} h={28} label="Purchase Recorded" t={t} start={S4_R.start} end={S4_R.end} fontSize={8.5} filled />
          </g>

          {/* S5 — Thank You Page appears */}
          <g opacity={segOpacity(t, "S5")}>
            <g opacity={prog(t, S5_IN.start, S5_IN.end)}
              style={{ transformOrigin: `${CX}px 160px`, transform: `scale(${lerp(0.75, 1, prog(t, S5_IN.start, S5_IN.end))})` }}>
              <rect x={CX - 90} y={130} width={180} height={60} rx={12} fill="#ffffff" stroke={ACCENT} strokeWidth={1.5}
                style={{ filter: `drop-shadow(0 4px 12px rgba(91,61,240,0.15))` }} />
              <text x={CX} y={160} dy="0.34em" textAnchor="middle" fontFamily={MONO} fontWeight={800}
                fontSize={11} letterSpacing={0.5} fill={ACCENT} style={{ textTransform: "uppercase" }}>Thank You Page</text>
            </g>
          </g>

          {/* S6 — Claude / ChatGPT → Thank You Page (+ support hint) */}
          <g opacity={segOpacity(t, "S6")}>
            <Box x={110} y={140} w={140} h={30} label="Claude / ChatGPT" t={t} start={S6_AI.start} end={S6_AI.end} fontSize={8.5} />
            <DrawLine d="M185,140 L230,140" t={t} start={S6_A.start} end={S6_A.end} width={1.3} color={ACCENT} />
            <Box x={300} y={140} w={130} h={30} label="Thank You Page" t={t} start={S6_TY.start} end={S6_TY.end} fontSize={8.5} filled />
            <g opacity={prog(t, S6_WA.start, S6_WA.end)}>
              <text x={CX} y={220} textAnchor="middle" fontFamily={MONO} fontWeight={700}
                fontSize={10} letterSpacing={0.3} fill={MUTED} style={{ textTransform: "uppercase" }}>
                or WhatsApp support
              </text>
            </g>
          </g>
        </svg>
      </div>

      {/* Caption bar */}
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

      {/* Playback controls */}
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