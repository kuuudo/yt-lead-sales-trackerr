import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding video: "Build the journey backward, then
   understand tracking domains"

   VISUALS ONLY — NO NARRATION YET.

   Per the brief, this file intentionally contains no voiceover,
   subtitles, captions, or explanatory teaching copy. On-screen text
   is limited to the minimum needed to identify UI elements (video
   names, "Asset", domain names, page URLs). The narration track will
   be generated separately once these 11 scenes are approved, and can
   be dropped into a caption bar the same way Section 06 derives one
   from a SEG_SOURCE array — see autoCaption() in that file for the
   pattern to follow later.

   STORY (do not reorder — sequence is intentional):
     1.  Preview the finished journey A→B→C→D→E→F, then signal that
         we're about to build it backward.
     2.  Create Video F. Turn it into an Asset.
     3.  Create Video E, promoting the Video F asset. Turn E into an
         asset.
     4.  Repeat backward: D→E, C→D, B→C, A→B. Payoff: the full chain
         exists, built one piece at a time.
     5.  Teach the root-tracking-domain concept using subdomains of
         A→B→C→D (go/fly/cpu.novashop.com, all one root).
     6.  Show the messy version: unrelated root domains chained
         together, increasing complexity.
     7.  Show the real Tracking Domains settings page grouping those
         subdomains under one root.
     8.  Return to Video D: Video Detail lets you add another
         tracking link (→ Video M) without disturbing the existing
         journey.
     9.  Introduce a second journey (M→N→B→V, fitnessbrand.com) and
         show that Video B is shared between both journeys.
     10. Combine them into one real cross-root-domain journey:
         novashop.com → fitnessbrand.com.
     11. Summarize: 1 root domain preferred, 2 acceptable for a
         genuine cross-domain journey, 3+ discouraged — with a
         support/WhatsApp escape hatch for anyone who needs more.

   IMPLEMENTATION NOTE ON SCENES 2-4: rather than hard-cutting and
   re-fading the whole canvas between "create F", "create E", "create
   D"... those three sub-beats are rendered as ONE continuously-open
   canvas (nodes fade in and simply stay, exactly like a real screen
   recording would look) instead of three separate fade-in/fade-out
   groups. This keeps the backward-build feel intact — the viewer
   watches one chain assemble — without changing the taught order.
   Scenes 1 and 5-11 each remain their own discrete fading beat, in
   the same call-and-response rhythm as Sections 01-06.

   REUSED FROM SECTION 06: clamp / prog / fadeWindow / lerp /
   segOpacity (timing math), DrawLine (path reveal), Chip (tag/label
   grammar), the violet accent + monospace UI language, and the
   skip/replay control affordances.

   NEW IN THIS FILE: VideoNode, AssetTag, Arrow/ArrowHead, Bracket,
   ScreenFrame, DomainDivider — small primitives needed to depict
   actual VSTRK screens (Video Detail, Tracking Domains settings)
   and journey/domain relationships that Sections 01-06 didn't need.
----------------------------------------------------------------- */

const INK = "#15151f";
const LINE = "#d9d9e3";
const ACCENT = "#5b3df0"; // novashop.com / Journey 1
const ACCENT2 = "#0f9d8f"; // fitnessbrand.com / Journey 2
const WARN = "#d3555c";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const MUTED = "#9a9aa8";

/* ---------------------------------------------------------------
   Timing — 9 top-level fading beats. Beat 2 internally contains the
   four backward-build steps (F, E, D, C→B→A) as one persistent
   canvas, per the note above.
----------------------------------------------------------------- */
const GAP = 280;
const SCENE_SOURCE: [string, number][] = [
  ["SC1", 4000], // preview finished journey + "build it backward"
  ["SC_BUILD", 21200], // create F→asset, E, D, C, B, A, payoff
  ["SC5", 5200], // root tracking domain concept
  ["SC6", 4200], // messy cross-root-domain example
  ["SC7", 4200], // Tracking Domains settings page
  ["SC8", 4600], // Video Detail: add another tracking link
  ["SC9", 4800], // second journey, shared Video B
  ["SC10", 5200], // combined cross-domain journey
  ["SC11", 5600], // 1 / 2 / 3+ root domains + WhatsApp
];
const SEG: Record<string, { start: number; end: number; dur: number }> = {};
{
  let cursor = 0;
  for (const [key, dur] of SCENE_SOURCE) {
    SEG[key] = { start: cursor, end: cursor + dur, dur };
    cursor = cursor + dur + GAP;
  }
}
const TOTAL = SEG.SC11.end + 700;

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
/** helper: build an {start,end} arrive window `offset`ms into a scene */
function at(sceneKey: string, offset: number, dur = 420) {
  const s = SEG[sceneKey].start + offset;
  return { start: s, end: s + dur };
}

/* ---------------- Visual primitives ---------------- */

function DrawLine({ d, t, start, end, opacity = 1, width = 1.1, color = LINE, dash }:
  { d: string; t: number; start: number; end: number; opacity?: number; width?: number; color?: string; dash?: string }) {
  const p = prog(t, start, end);
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
      pathLength={1} strokeDasharray={dash ? dash : 1} strokeDashoffset={dash ? undefined : 1 - p} opacity={opacity * (dash ? p : 1)} />
  );
}

function ArrowHead({ x, y, angle, opacity = 1, color = ACCENT, size = 6 }:
  { x: number; y: number; angle: number; opacity?: number; color?: string; size?: number }) {
  if (opacity <= 0.001) return null;
  return (
    <polygon points={`0,${-size * 0.62} ${size * 1.5},0 0,${size * 0.62}`} fill={color} opacity={opacity}
      transform={`translate(${x},${y}) rotate(${angle})`} />
  );
}

function Arrow({ x1, y1, x2, y2, t, start, end, color = ACCENT, width = 1.3, dash }:
  { x1: number; y1: number; x2: number; y2: number; t: number; start: number; end: number; color?: string; width?: number; dash?: string }) {
  const p = prog(t, start, end);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <g>
      <DrawLine d={`M${x1},${y1} L${x2},${y2}`} t={t} start={start} end={end} color={color} width={width} dash={dash} />
      <ArrowHead x={x2} y={y2} angle={angle} color={color} opacity={p > 0.72 ? clamp((p - 0.72) / 0.28) : 0} />
    </g>
  );
}

/** A "Video X" card — the recurring unit of the whole journey chain. */
function VideoNode({ x, y, t, arriveStart, arriveEnd, label, scale = 1, glow = 0, fade = 1, tone = ACCENT }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; scale?: number; glow?: number; fade?: number; tone?: string }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const w = 108 * scale, h = 46 * scale;
  const bx = x - w / 2, by = y - h / 2;
  const sc = lerp(0.86, 1, p);
  return (
    <g opacity={p * fade} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${sc})` }}>
      <rect x={bx} y={by} width={w} height={h} rx={9} fill="#ffffff" stroke={tone} strokeWidth={1.3}
        style={{ filter: glow > 0 ? `drop-shadow(0 0 ${7 * glow}px ${tone})` : "drop-shadow(0 3px 8px rgba(21,21,31,0.08))" }} />
      <text x={x - w * 0.30} y={y + 3.5 * scale} textAnchor="middle" fontFamily={MONO} fontSize={11 * scale} fill={tone} opacity={0.85}>▶</text>
      <text x={x + w * 0.08} y={y + 3.5 * scale} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={10.5 * scale} letterSpacing={0.3} fill={INK}>{label}</text>
    </g>
  );
}

/** small pill stamped near a node's corner once it has been turned into an Asset */
function AssetTag({ x, y, t, arriveStart, arriveEnd, color = ACCENT }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; color?: string }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const w = 58, h = 18;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.8, 1, p)})` }}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={9} fill={color} style={{ filter: "drop-shadow(0 3px 6px rgba(21,21,31,0.18))" }} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={8.5} letterSpacing={0.9} fill="#ffffff">ASSET</text>
    </g>
  );
}

/** a bigger free-floating "this is now an Asset object" card, used once (Scene: create F) to teach the concept before it collapses into the small AssetTag used everywhere after */
function AssetCard({ x, y, t, arriveStart, arriveEnd, label, fade = 1 }:
  { x: number; y: number; t: number; arriveStart: number; arriveEnd: number; label: string; fade?: number }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  const w = 118, h = 44;
  return (
    <g opacity={p * fade} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.85, 1, p)})` }}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={9} fill={ACCENT} style={{ filter: "drop-shadow(0 6px 14px rgba(91,61,240,0.28))" }} />
      <text x={x} y={y - 2} textAnchor="middle" fontFamily={MONO} fontWeight={800} fontSize={9} letterSpacing={1} fill="#ffffffcc">ASSET</text>
      <text x={x} y={y + 13} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={10.5} fill="#ffffff">{label}</text>
    </g>
  );
}

function Chip({ x, y, t, start, end, label, tone = "accent", width = 118, fontSize = 9.5 }:
  { x: number; y: number; t: number; start: number; end: number; label: string; tone?: "muted" | "accent" | "filled" | "warn"; width?: number; fontSize?: number }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  const h = 22;
  const bx = x - width / 2, by = y - h / 2;
  const tColor = tone === "warn" ? WARN : ACCENT;
  const fill = tone === "filled" ? tColor : "#ffffff";
  const stroke = tone === "muted" ? LINE : tColor;
  const textFill = tone === "filled" ? "#ffffff" : tone === "muted" ? MUTED : tColor;
  return (
    <g opacity={p} style={{ transformOrigin: `${x}px ${y}px`, transform: `scale(${lerp(0.9, 1, p)})` }}>
      <rect x={bx} y={by} width={width} height={h} rx={11} fill={fill} stroke={stroke} strokeWidth={1.1} />
      <text x={x} y={y + 3.3} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={fontSize} letterSpacing={0.4} fill={textFill}
        style={{ textTransform: tone === "muted" ? "none" : "uppercase" }}>{label}</text>
    </g>
  );
}

function Label({ x, y, t, start, end, children, size = 10, color = MUTED, anchor = "middle" as const, weight = 700, upper = true }:
  { x: number; y: number; t: number; start: number; end: number; children: React.ReactNode; size?: number; color?: string; anchor?: "start" | "middle" | "end"; weight?: number; upper?: boolean }) {
  const p = prog(t, start, end);
  if (p <= 0.001) return null;
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontWeight={weight} fontSize={size} letterSpacing={0.5} fill={color} opacity={p}
      style={upper ? { textTransform: "uppercase" } : undefined}>{children}</text>
  );
}

/** connects 3 sibling x-positions down into one shared root pill — the "different subdomains, one root domain" grammar */
function Bracket({ xs, y, depth, rootX, rootY, t, start, end, color = ACCENT }:
  { xs: number[]; y: number; depth: number; rootX: number; rootY: number; t: number; start: number; end: number; color?: string }) {
  const midY = y + depth;
  const d = xs.map((x) => `M${x},${y} L${x},${midY}`).join(" ")
    + ` M${xs[0]},${midY} L${xs[xs.length - 1]},${midY}`
    + ` M${(xs[0] + xs[xs.length - 1]) / 2},${midY} L${rootX},${rootY}`;
  return <DrawLine d={d} t={t} start={start} end={end} color={color} width={1.1} />;
}

/** a simplified "browser chrome" frame standing in for a real VSTRK screen */
function ScreenFrame({ x, y, w, h, t, arriveStart, arriveEnd, url }:
  { x: number; y: number; w: number; h: number; t: number; arriveStart: number; arriveEnd: number; url: string }) {
  const p = prog(t, arriveStart, arriveEnd);
  if (p <= 0.001) return null;
  return (
    <g opacity={p}>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="#ffffff" stroke={LINE} strokeWidth={1.2}
        style={{ filter: "drop-shadow(0 10px 24px rgba(21,21,31,0.10))" }} />
      <path d={`M${x},${y + 10} a10,10 0 0 1 10,-10 h${w - 20} a10,10 0 0 1 10,10 v18 h${-w} Z`} fill="#f4f4f8" />
      <circle cx={x + 16} cy={y + 14} r={3} fill={WARN} opacity={0.55} />
      <circle cx={x + 28} cy={y + 14} r={3} fill="#e8b93a" opacity={0.55} />
      <circle cx={x + 40} cy={y + 14} r={3} fill="#4caf7d" opacity={0.55} />
      <text x={x + 58} y={y + 18} fontFamily={MONO} fontSize={9.5} fill={MUTED} letterSpacing={0.2}>{url}</text>
    </g>
  );
}

/* =================================================================
   COMPONENT
================================================================= */

export interface TrackingJourneyOnboardingVideoProps {
  onSkip?: () => void;
  onComplete?: () => void;
}

export default function TrackingJourneyOnboardingVideo({ onSkip, onComplete }: TrackingJourneyOnboardingVideoProps = {}) {
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

  /* ---------------- Beat opacities ---------------- */
  const sc1Opacity = segOpacity(t, "SC1");
  const buildOpacity = segOpacity(t, "SC_BUILD");
  const sc5Opacity = segOpacity(t, "SC5");
  const sc6Opacity = segOpacity(t, "SC6");
  const sc7Opacity = segOpacity(t, "SC7");
  const sc8Opacity = segOpacity(t, "SC8");
  const sc9Opacity = segOpacity(t, "SC9");
  const sc10Opacity = segOpacity(t, "SC10");
  const sc11Opacity = segOpacity(t, "SC11");
  const finalFadeOut = t > SEG.SC11.end - 500 ? 1 - prog(t, SEG.SC11.end - 500, SEG.SC11.end - 60) : 1;

  /* ================= SCENE 1 — finished journey, then "backward" ================= */
  const CHAIN_X = [90, 254, 418, 582, 746, 910];
  const CHAIN_LABEL = ["Video A", "Video B", "Video C", "Video D", "Video E", "Video F"];
  const CHAIN_Y = 300;

  const s1NodeIn = CHAIN_X.map((_, i) => at("SC1", 120 + i * 210, 320));
  const s1ArrowIn = CHAIN_X.slice(0, -1).map((_, i) => at("SC1", 120 + (i + 1) * 210 + 120, 260));
  const s1BackwardIn = at("SC1", 120 + 6 * 210 + 260, 480);
  const s1DimAmt = fadeWindow(t, s1BackwardIn.start, s1BackwardIn.end, Infinity, Infinity) * 0.5;

  /* ================= SCENE: BUILD (F, E, D, C, B, A, payoff) ================= */
  // Each phase offset is measured from SC_BUILD.start.
  const P_F = 0, P_E = 4000, P_D = 7800, P_C = 11000, P_B = 14200, P_A = 17400, P_PAYOFF = 20200;

  const fNodeIn = at("SC_BUILD", P_F + 100, 380);
  const fArrowDownIn = at("SC_BUILD", P_F + 700, 420);
  const fAssetCardIn = at("SC_BUILD", P_F + 1150, 420);
  const fChipIn = at("SC_BUILD", P_F + 900, 380);
  const fAssetTagIn = at("SC_BUILD", P_F + 1800, 360);
  const fAssetCardFadeStart = SEG.SC_BUILD.start + P_F + 3200;
  const fAssetCardFadeEnd = SEG.SC_BUILD.start + P_F + 3700;
  const fAssetCardFade = 1 - prog(t, fAssetCardFadeStart, fAssetCardFadeEnd);

  const eNodeIn = at("SC_BUILD", P_E + 100, 360);
  const eArrowIn = at("SC_BUILD", P_E + 650, 380);
  const eAssetTagIn = at("SC_BUILD", P_E + 1300, 340);

  const dNodeIn = at("SC_BUILD", P_D + 100, 360);
  const dArrowIn = at("SC_BUILD", P_D + 600, 360);
  const dAssetTagIn = at("SC_BUILD", P_D + 1200, 320);

  const cNodeIn = at("SC_BUILD", P_C + 100, 360);
  const cArrowIn = at("SC_BUILD", P_C + 600, 360);
  const cAssetTagIn = at("SC_BUILD", P_C + 1200, 320);

  const bNodeIn = at("SC_BUILD", P_B + 100, 360);
  const bArrowIn = at("SC_BUILD", P_B + 600, 360);
  const bAssetTagIn = at("SC_BUILD", P_B + 1200, 320);

  const aNodeIn = at("SC_BUILD", P_A + 100, 360);
  const aArrowIn = at("SC_BUILD", P_A + 600, 360);

  // payoff: a soft glow sweeps left-to-right across the completed chain
  const payoffStart = SEG.SC_BUILD.start + P_PAYOFF;
  const payoffEnd = SEG.SC_BUILD.end - 260;
  const payoffSweep = prog(t, payoffStart, payoffEnd);
  const nodeGlow = (i: number) => {
    const center = payoffSweep * 5; // 0..5 across 6 nodes
    const dist = Math.abs(center - i);
    return clamp(1 - dist, 0, 1) * (t > payoffStart && t < payoffEnd ? 1 : 0);
  };

  /* ================= SCENE 5 — root tracking domain ================= */
  const s5SubX = CHAIN_X.slice(0, 4); // A..D positions
  const s5NodeIn = s5SubX.map((_, i) => at("SC5", 60 + i * 90, 300));
  const s5ArrowIn = s5SubX.slice(0, -1).map((_, i) => at("SC5", 60 + (i + 1) * 90 + 60, 260));
  const s5SubdomainLabels = ["go.novashop.com", "fly.novashop.com", "cpu.novashop.com"];
  const s5SubdomainIn = s5SubdomainLabels.map((_, i) => at("SC5", 700 + i * 220, 360));
  const s5BracketIn = at("SC5", 1700, 500);
  const s5RootIn = at("SC5", 2150, 420);
  const s5UrlChipIn = at("SC5", 2900, 420);

  /* ================= SCENE 6 — messy cross-root-domain example ================= */
  const s6Labels = ["go.novashop.com", "go.otherbrand.com", "go.anotherbrand.com"];
  const s6X = [190, 480, 770];
  const s6Y = 260;
  const s6NodeIn = s6Labels.map((_, i) => at("SC6", 150 + i * 500, 380));
  const s6ArrowIn = [at("SC6", 700, 380), at("SC6", 1200, 380)];
  const s6RootColors = [ACCENT, "#a9539a", WARN];
  const s6RootIn = s6Labels.map((_, i) => at("SC6", 2000 + i * 260, 380));
  const s6NoteIn = at("SC6", 3100, 500);

  /* ================= SCENE 7 — Tracking Domains settings page ================= */
  const s7FrameIn = at("SC7", 80, 500);
  const s7RowLabels = ["go.novashop.com", "fly.novashop.com", "cpu.novashop.com"];
  const s7RowIn = s7RowLabels.map((_, i) => at("SC7", 700 + i * 260, 340));
  const s7RootIn = at("SC7", 1700, 420);
  const s7ConnectIn = at("SC7", 2200, 500);

  /* ================= SCENE 8 — Video Detail: add a tracking link ================= */
  const s8FrameIn = at("SC8", 80, 500);
  const s8ExistingRowIn = at("SC8", 700, 360);
  const s8ButtonIn = at("SC8", 1150, 360);
  const s8NewRowIn = at("SC8", 1750, 420);
  const s8DiagramIn = at("SC8", 2400, 480);
  const s8BranchArrowIn = at("SC8", 2900, 420);

  /* ================= SCENE 9 — second journey, shared Video B ================= */
  const J1_X = [90, 254, 418, 582, 746, 910];
  const J1_Y = 170;
  const J1_LABEL = ["A", "B", "C", "D", "E", "F"];
  const s9J1TitleIn = at("SC9", 60, 360);
  const s9J1NodeIn = J1_X.map((_, i) => at("SC9", 300 + i * 130, 280));
  const s9J1RootIn = at("SC9", 1300, 380);

  const J2_X = [150, 350, 550, 750];
  const J2_Y = 400;
  const J2_LABEL = ["M", "N", "B", "V"];
  const s9J2TitleIn = at("SC9", 1900, 360);
  const s9J2NodeIn = J2_X.map((_, i) => at("SC9", 2150 + i * 160, 280));
  const s9J2RootIn = at("SC9", 3050, 380);
  const s9SharedConnectIn = at("SC9", 3600, 600);
  const s9SharedPulseStart = SEG.SC9.start + 4200;
  const s9SharedPulse = t > s9SharedPulseStart && t < SEG.SC9.end - 200
    ? Math.sin(prog(t, s9SharedPulseStart, SEG.SC9.end - 200) * Math.PI) : 0;

  /* ================= SCENE 10 — combined cross-domain journey ================= */
  const S10_X = [80, 200, 320, 440, 560, 680, 800, 920];
  const S10_LABEL = ["A", "B", "C", "D", "M", "N", "B", "V"];
  const S10_TONE = [ACCENT, ACCENT, ACCENT, ACCENT, ACCENT2, ACCENT2, ACCENT2, ACCENT2];
  const s10NodeIn = S10_X.map((_, i) => at("SC10", 60 + i * 170, 300));
  const s10ArrowIn = S10_X.slice(0, -1).map((_, i) => at("SC10", 60 + (i + 1) * 170 + 60, 240));
  const s10BoundaryIn = at("SC10", 1900, 500);
  const s10LeftRootIn = at("SC10", 2450, 380);
  const s10RightRootIn = at("SC10", 2750, 380);
  const s10SharedPulseStart = SEG.SC10.start + 3400;
  const s10SharedPulse = t > s10SharedPulseStart && t < SEG.SC10.end - 200
    ? Math.sin(prog(t, s10SharedPulseStart, SEG.SC10.end - 200) * Math.PI) : 0;

  /* ================= SCENE 11 — 1 / 2 / 3+ root domains + WhatsApp ================= */
  const s11Row1In = at("SC11", 100, 420);
  const s11Row2In = at("SC11", 900, 420);
  const s11Row3In = at("SC11", 1900, 420);
  const s11ContactIn = at("SC11", 3600, 500);

  return (
    <div style={{
      width: "100%", minHeight: "100%", background: "#ffffff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "28px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      position: "relative",
    }}>
      <div style={{ width: "100%", maxWidth: 980, opacity: finalFadeOut }}>
        <svg viewBox="0 0 1000 620" style={{ width: "100%", height: "auto", display: "block" }}>

          {/* ================= SCENE 1 ================= */}
          <g opacity={sc1Opacity}>
            {s1ArrowIn.map((w, i) => (
              <Arrow key={`s1-arrow-${i}`} x1={CHAIN_X[i] + 54} y1={CHAIN_Y} x2={CHAIN_X[i + 1] - 54} y2={CHAIN_Y}
                t={t} start={w.start} end={w.end} color={ACCENT} />
            ))}
            {CHAIN_X.map((x, i) => (
              <VideoNode key={`s1-node-${i}`} x={x} y={CHAIN_Y} t={t} arriveStart={s1NodeIn[i].start} arriveEnd={s1NodeIn[i].end}
                label={CHAIN_LABEL[i]} fade={1 - s1DimAmt} />
            ))}
            <Label x={500} y={200} t={t} start={s1BackwardIn.start} end={s1BackwardIn.end} size={11} color={ACCENT} weight={800}>
              ⟲ building this backward
            </Label>
          </g>

          {/* ================= SCENE: BUILD ================= */}
          <g opacity={buildOpacity}>
            {/* Video F + its full "turn into asset" teaching moment */}
            <VideoNode x={CHAIN_X[5]} y={CHAIN_Y} t={t} arriveStart={fNodeIn.start} arriveEnd={fNodeIn.end} label="Video F" glow={nodeGlow(5)} />
            <DrawLine d={`M${CHAIN_X[5]},${CHAIN_Y + 24} L${CHAIN_X[5]},${CHAIN_Y + 96}`} t={t} start={fArrowDownIn.start} end={fArrowDownIn.end} color={ACCENT} width={1.2} />
            <Chip x={CHAIN_X[5] + 88} y={CHAIN_Y + 60} t={t} start={fChipIn.start} end={fChipIn.end} label="Turn into Asset" width={140} />
            <AssetCard x={CHAIN_X[5]} y={CHAIN_Y + 118} t={t} arriveStart={fAssetCardIn.start} arriveEnd={fAssetCardIn.end} label="Video F" fade={fAssetCardFade} />
            <AssetTag x={CHAIN_X[5] + 42} y={CHAIN_Y - 20} t={t} arriveStart={fAssetTagIn.start} arriveEnd={fAssetTagIn.end} />

            {/* Video E promotes the Video F asset */}
            <VideoNode x={CHAIN_X[4]} y={CHAIN_Y} t={t} arriveStart={eNodeIn.start} arriveEnd={eNodeIn.end} label="Video E" glow={nodeGlow(4)} />
            <Arrow x1={CHAIN_X[4] + 54} y1={CHAIN_Y} x2={CHAIN_X[5] - 54} y2={CHAIN_Y} t={t} start={eArrowIn.start} end={eArrowIn.end} color={ACCENT} />
            <AssetTag x={CHAIN_X[4] + 42} y={CHAIN_Y - 20} t={t} arriveStart={eAssetTagIn.start} arriveEnd={eAssetTagIn.end} />

            {/* Video D promotes Video E */}
            <VideoNode x={CHAIN_X[3]} y={CHAIN_Y} t={t} arriveStart={dNodeIn.start} arriveEnd={dNodeIn.end} label="Video D" glow={nodeGlow(3)} />
            <Arrow x1={CHAIN_X[3] + 54} y1={CHAIN_Y} x2={CHAIN_X[4] - 54} y2={CHAIN_Y} t={t} start={dArrowIn.start} end={dArrowIn.end} color={ACCENT} />
            <AssetTag x={CHAIN_X[3] + 42} y={CHAIN_Y - 20} t={t} arriveStart={dAssetTagIn.start} arriveEnd={dAssetTagIn.end} />

            {/* Video C promotes Video D */}
            <VideoNode x={CHAIN_X[2]} y={CHAIN_Y} t={t} arriveStart={cNodeIn.start} arriveEnd={cNodeIn.end} label="Video C" glow={nodeGlow(2)} />
            <Arrow x1={CHAIN_X[2] + 54} y1={CHAIN_Y} x2={CHAIN_X[3] - 54} y2={CHAIN_Y} t={t} start={cArrowIn.start} end={cArrowIn.end} color={ACCENT} />
            <AssetTag x={CHAIN_X[2] + 42} y={CHAIN_Y - 20} t={t} arriveStart={cAssetTagIn.start} arriveEnd={cAssetTagIn.end} />

            {/* Video B promotes Video C */}
            <VideoNode x={CHAIN_X[1]} y={CHAIN_Y} t={t} arriveStart={bNodeIn.start} arriveEnd={bNodeIn.end} label="Video B" glow={nodeGlow(1)} />
            <Arrow x1={CHAIN_X[1] + 54} y1={CHAIN_Y} x2={CHAIN_X[2] - 54} y2={CHAIN_Y} t={t} start={bArrowIn.start} end={bArrowIn.end} color={ACCENT} />
            <AssetTag x={CHAIN_X[1] + 42} y={CHAIN_Y - 20} t={t} arriveStart={bAssetTagIn.start} arriveEnd={bAssetTagIn.end} />

            {/* Video A promotes Video B — journey complete, no asset needed */}
            <VideoNode x={CHAIN_X[0]} y={CHAIN_Y} t={t} arriveStart={aNodeIn.start} arriveEnd={aNodeIn.end} label="Video A" glow={nodeGlow(0)} />
            <Arrow x1={CHAIN_X[0] + 54} y1={CHAIN_Y} x2={CHAIN_X[1] - 54} y2={CHAIN_Y} t={t} start={aArrowIn.start} end={aArrowIn.end} color={ACCENT} />

            <Label x={500} y={CHAIN_Y + 70} t={t} start={payoffStart} end={payoffStart + 500} size={11} color={ACCENT} weight={800}>
              one piece at a time
            </Label>
          </g>

          {/* ================= SCENE 5 — root tracking domain ================= */}
          <g opacity={sc5Opacity}>
            {s5ArrowIn.map((w, i) => (
              <Arrow key={`s5-arrow-${i}`} x1={s5SubX[i] + 54} y1={CHAIN_Y - 40} x2={s5SubX[i + 1] - 54} y2={CHAIN_Y - 40}
                t={t} start={w.start} end={w.end} color={ACCENT} />
            ))}
            {s5SubX.map((x, i) => (
              <VideoNode key={`s5-node-${i}`} x={x} y={CHAIN_Y - 40} t={t} arriveStart={s5NodeIn[i].start} arriveEnd={s5NodeIn[i].end} label={CHAIN_LABEL[i]} scale={0.92} />
            ))}
            {s5SubdomainLabels.map((label, i) => (
              <Label key={`s5-sub-${i}`} x={(s5SubX[i] + s5SubX[i + 1]) / 2} y={CHAIN_Y - 4} t={t} start={s5SubdomainIn[i].start} end={s5SubdomainIn[i].end} size={9.5} color={ACCENT} upper={false}>
                {label}
              </Label>
            ))}
            <Bracket xs={[(s5SubX[0] + s5SubX[1]) / 2, (s5SubX[1] + s5SubX[2]) / 2, (s5SubX[2] + s5SubX[3]) / 2]}
              y={CHAIN_Y + 20} depth={40} rootX={500} rootY={CHAIN_Y + 100} t={t} start={s5BracketIn.start} end={s5BracketIn.end} color={ACCENT} />
            <Chip x={500} y={CHAIN_Y + 120} t={t} start={s5RootIn.start} end={s5RootIn.end} label="novashop.com" tone="filled" width={150} />
            <Chip x={500} y={CHAIN_Y + 170} t={t} start={s5UrlChipIn.start} end={s5UrlChipIn.end} label="vstrk.com/settings/tracking-domains" tone="muted" width={330} />
          </g>

          {/* ================= SCENE 6 — messy cross-root-domain example ================= */}
          <g opacity={sc6Opacity}>
            {s6ArrowIn.map((w, i) => (
              <Arrow key={`s6-arrow-${i}`} x1={s6X[i] + 70} y1={s6Y} x2={s6X[i + 1] - 70} y2={s6Y} t={t} start={w.start} end={w.end} color={s6RootColors[i + 1]} />
            ))}
            {s6Labels.map((label, i) => (
              <Chip key={`s6-pill-${i}`} x={s6X[i]} y={s6Y} t={t} start={s6NodeIn[i].start} end={s6NodeIn[i].end} label={label} width={150} tone={i === 2 ? "warn" : "accent"} />
            ))}
            {s6Labels.map((_, i) => (
              <DrawLine key={`s6-drop-${i}`} d={`M${s6X[i]},${s6Y + 14} L${s6X[i]},${s6Y + 60}`} t={t} start={s6RootIn[i].start} end={s6RootIn[i].end} color={s6RootColors[i]} width={1} dash="2 4" />
            ))}
            {["novashop.com", "otherbrand.com", "anotherbrand.com"].map((label, i) => (
              <Chip key={`s6-root-${i}`} x={s6X[i]} y={s6Y + 90} t={t} start={s6RootIn[i].start} end={s6RootIn[i].end} label={label} width={150}
                tone={i === 2 ? "warn" : i === 1 ? "muted" : "accent"} />
            ))}
            <Label x={480} y={s6Y + 150} t={t} start={s6NoteIn.start} end={s6NoteIn.end} size={11} color={WARN} weight={800}>
              3 unrelated root domains in one journey
            </Label>
          </g>

          {/* ================= SCENE 7 — Tracking Domains settings ================= */}
          <g opacity={sc7Opacity}>
            <ScreenFrame x={280} y={70} w={440} h={230} t={t} arriveStart={s7FrameIn.start} arriveEnd={s7FrameIn.end} url="vstrk.com/settings/tracking-domains" />
            <Label x={310} y={140} t={t} start={s7FrameIn.start} end={s7FrameIn.end} size={9} color={MUTED} anchor="start">Subdomain</Label>
            <Label x={600} y={140} t={t} start={s7FrameIn.start} end={s7FrameIn.end} size={9} color={MUTED} anchor="start">Root domain</Label>
            {s7RowLabels.map((label, i) => (
              <g key={`s7-row-${i}`}>
                <Label x={310} y={168 + i * 34} t={t} start={s7RowIn[i].start} end={s7RowIn[i].end} size={10.5} color={INK} anchor="start" upper={false} weight={600}>{label}</Label>
                <Label x={600} y={168 + i * 34} t={t} start={s7RowIn[i].start} end={s7RowIn[i].end} size={10.5} color={ACCENT} anchor="start" upper={false} weight={700}>novashop.com</Label>
              </g>
            ))}
            <Chip x={500} y={340} t={t} start={s7RootIn.start} end={s7RootIn.end} label="novashop.com" tone="filled" width={150} />
            {s7RowLabels.map((_, i) => (
              <DrawLine key={`s7-connect-${i}`} d={`M${640},${175 + i * 34} L${500},${330}`} t={t} start={s7ConnectIn.start} end={s7ConnectIn.end} color={ACCENT} width={1} dash="2 4" />
            ))}
          </g>

          {/* ================= SCENE 8 — Video Detail: add a tracking link ================= */}
          <g opacity={sc8Opacity}>
            <ScreenFrame x={60} y={60} w={420} h={230} t={t} arriveStart={s8FrameIn.start} arriveEnd={s8FrameIn.end} url="vstrk.com/videos/d" />
            <Label x={90} y={130} t={t} start={s8FrameIn.start} end={s8FrameIn.end} size={11} color={INK} anchor="start" weight={800}>Video D</Label>
            <Label x={90} y={160} t={t} start={s8ExistingRowIn.start} end={s8ExistingRowIn.end} size={10} color={MUTED} anchor="start" upper={false}>→ Video E</Label>
            <Chip x={200} y={210} t={t} start={s8ButtonIn.start} end={s8ButtonIn.end} label="+ Add tracking link" width={170} />
            <Label x={90} y={250} t={t} start={s8NewRowIn.start} end={s8NewRowIn.end} size={10} color={ACCENT} anchor="start" weight={700} upper={false}>→ Video M</Label>

            <VideoNode x={620} y={90} t={t} arriveStart={s8DiagramIn.start} arriveEnd={s8DiagramIn.end} label="Video D" scale={0.9} />
            <Arrow x1={674} y1={90} x2={800} y2={60} t={t} start={s8DiagramIn.start} end={s8DiagramIn.end} color={ACCENT} />
            <Label x={810} y={56} t={t} start={s8DiagramIn.start} end={s8DiagramIn.end} size={10} color={ACCENT} anchor="start" upper={false} weight={700}>Video E → Video F</Label>
            <Arrow x1={620} y1={112} x2={620} y2={190} t={t} start={s8BranchArrowIn.start} end={s8BranchArrowIn.end} color={ACCENT} dash="1" />
            <VideoNode x={620} y={220} t={t} arriveStart={s8BranchArrowIn.start} arriveEnd={s8BranchArrowIn.end} label="Video M" scale={0.9} />
          </g>

          {/* ================= SCENE 9 — second journey, shared Video B ================= */}
          <g opacity={sc9Opacity}>
            <Label x={90} y={s9J1TitleIn ? J1_Y - 34 : J1_Y} t={t} start={s9J1TitleIn.start} end={s9J1TitleIn.end} size={10.5} color={ACCENT} anchor="start" weight={800}>Journey 1</Label>
            {J1_X.slice(0, -1).map((x, i) => (
              <Arrow key={`s9-j1-arrow-${i}`} x1={x + 40} y1={J1_Y} x2={J1_X[i + 1] - 40} y2={J1_Y} t={t} start={s9J1NodeIn[i + 1].start} end={s9J1NodeIn[i + 1].end} color={ACCENT} width={1} />
            ))}
            {J1_X.map((x, i) => (
              <VideoNode key={`s9-j1-node-${i}`} x={x} y={J1_Y} t={t} arriveStart={s9J1NodeIn[i].start} arriveEnd={s9J1NodeIn[i].end}
                label={J1_LABEL[i]} scale={0.62} tone={ACCENT} glow={J1_LABEL[i] === "B" ? s9SharedPulse * 0.7 : 0} />
            ))}
            <Chip x={90} y={J1_Y + 40} t={t} start={s9J1RootIn.start} end={s9J1RootIn.end} label="novashop.com" tone="filled" width={130} fontSize={8.5} />

            <Label x={90} y={J2_Y - 34} t={t} start={s9J2TitleIn.start} end={s9J2TitleIn.end} size={10.5} color={ACCENT2} anchor="start" weight={800}>Journey 2</Label>
            {J2_X.slice(0, -1).map((x, i) => (
              <Arrow key={`s9-j2-arrow-${i}`} x1={x + 40} y1={J2_Y} x2={J2_X[i + 1] - 40} y2={J2_Y} t={t} start={s9J2NodeIn[i + 1].start} end={s9J2NodeIn[i + 1].end} color={ACCENT2} width={1} />
            ))}
            {J2_X.map((x, i) => (
              <VideoNode key={`s9-j2-node-${i}`} x={x} y={J2_Y} t={t} arriveStart={s9J2NodeIn[i].start} arriveEnd={s9J2NodeIn[i].end}
                label={J2_LABEL[i]} scale={0.62} tone={ACCENT2} glow={J2_LABEL[i] === "B" ? s9SharedPulse * 0.7 : 0} />
            ))}
            <Chip x={150} y={J2_Y + 40} t={t} start={s9J2RootIn.start} end={s9J2RootIn.end} label="fitnessbrand.com" tone="filled" width={150} fontSize={8.5} />

            <DrawLine d={`M${J1_X[1]},${J1_Y + 20} C${J1_X[1] - 40},${(J1_Y + J2_Y) / 2} ${J2_X[2] + 40},${(J1_Y + J2_Y) / 2} ${J2_X[2]},${J2_Y - 20}`}
              t={t} start={s9SharedConnectIn.start} end={s9SharedConnectIn.end} color={INK} width={1.2} dash="2 5" />
            <Label x={(J1_X[1] + J2_X[2]) / 2} y={(J1_Y + J2_Y) / 2 + 4} t={t} start={s9SharedConnectIn.start} end={s9SharedConnectIn.end} size={9.5} color={INK} weight={800}>
              same Video B
            </Label>
          </g>

          {/* ================= SCENE 10 — combined cross-domain journey ================= */}
          <g opacity={sc10Opacity}>
            {s10ArrowIn.map((w, i) => (
              <Arrow key={`s10-arrow-${i}`} x1={S10_X[i] + 40} y1={CHAIN_Y} x2={S10_X[i + 1] - 40} y2={CHAIN_Y} t={t} start={w.start} end={w.end} color={S10_TONE[i + 1]} width={1.1} />
            ))}
            {S10_X.map((x, i) => (
              <VideoNode key={`s10-node-${i}`} x={x} y={CHAIN_Y} t={t} arriveStart={s10NodeIn[i].start} arriveEnd={s10NodeIn[i].end}
                label={S10_LABEL[i]} scale={0.68} tone={S10_TONE[i]} glow={i === 6 ? s10SharedPulse * 0.7 : 0} />
            ))}
            <DrawLine d={`M500,${CHAIN_Y - 60} L500,${CHAIN_Y + 60}`} t={t} start={s10BoundaryIn.start} end={s10BoundaryIn.end} color={MUTED} width={1} dash="2 5" />
            <Chip x={410} y={CHAIN_Y - 80} t={t} start={s10LeftRootIn.start} end={s10LeftRootIn.end} label="novashop.com" tone="accent" width={130} fontSize={8.5} />
            <Chip x={590} y={CHAIN_Y - 80} t={t} start={s10RightRootIn.start} end={s10RightRootIn.end} label="fitnessbrand.com" tone="filled" width={150} fontSize={8.5} />
          </g>

          {/* ================= SCENE 11 — 1 / 2 / 3+ root domains ================= */}
          <g opacity={sc11Opacity}>
            <DrawLine d="M200,140 L340,140" t={t} start={s11Row1In.start} end={s11Row1In.end} color={ACCENT} width={1.3} />
            <circle cx={200} cy={140} r={6} fill={ACCENT} opacity={prog(t, s11Row1In.start, s11Row1In.end)} />
            <Label x={370} y={144} t={t} start={s11Row1In.start} end={s11Row1In.end} size={11} color={INK} anchor="start" weight={700}>1 root domain</Label>
            <Chip x={720} y={140} t={t} start={s11Row1In.start} end={s11Row1In.end} label="Preferred" tone="accent" width={110} />

            <DrawLine d="M200,240 L280,240 L360,240" t={t} start={s11Row2In.start} end={s11Row2In.end} color={ACCENT2} width={1.3} />
            <circle cx={200} cy={240} r={6} fill={ACCENT} opacity={prog(t, s11Row2In.start, s11Row2In.end)} />
            <circle cx={360} cy={240} r={6} fill={ACCENT2} opacity={prog(t, s11Row2In.start, s11Row2In.end)} />
            <Label x={390} y={244} t={t} start={s11Row2In.start} end={s11Row2In.end} size={11} color={INK} anchor="start" weight={700}>2 root domains</Label>
            <Chip x={720} y={240} t={t} start={s11Row2In.start} end={s11Row2In.end} label="Acceptable" tone="accent" width={120} />

            <DrawLine d="M200,340 L270,330 L330,350 L390,340" t={t} start={s11Row3In.start} end={s11Row3In.end} color={WARN} width={1.3} />
            <circle cx={200} cy={340} r={6} fill={WARN} opacity={prog(t, s11Row3In.start, s11Row3In.end)} />
            <circle cx={330} cy={350} r={6} fill={WARN} opacity={prog(t, s11Row3In.start, s11Row3In.end)} />
            <circle cx={390} cy={340} r={6} fill={WARN} opacity={prog(t, s11Row3In.start, s11Row3In.end)} />
            <Label x={420} y={344} t={t} start={s11Row3In.start} end={s11Row3In.end} size={11} color={INK} anchor="start" weight={700}>3+ root domains</Label>
            <Chip x={720} y={340} t={t} start={s11Row3In.start} end={s11Row3In.end} label="Discouraged" tone="warn" width={130} />

            <text x={500} y={460} textAnchor="middle" fontSize={22} opacity={prog(t, s11ContactIn.start, s11ContactIn.end)}>💬</text>
            <Chip x={500} y={500} t={t} start={s11ContactIn.start} end={s11ContactIn.end} label="Message us on WhatsApp" tone="muted" width={230} />
          </g>

        </svg>
      </div>

      {/* ---------- Playback controls (no caption bar yet — narration TBD) ---------- */}
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
