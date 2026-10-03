import React, { useEffect, useState } from "react";

/* ---------------------------------------------------------------
   VSTRK — Onboarding video: "Build the journey backward, then
   understand tracking domains"

   PHASE 2 — NARRATION ADDED.

   Teaching narration/captions have now been layered onto the
   existing, already-approved visual sequence. The scene order,
   nodes, domains, and animation choreography are unchanged; only
   (a) caption text, (b) how long each beat holds on screen, and
   (c) small offsets *within* a beat (so a reveal lands next to the
   sentence describing it) were touched. See CAPTION NOTES below for
   exactly what changed and why.

   CAPTION NOTES:
     - Reused directly from Section 06: the caption-bar JSX/CSS
       (centered serif paragraph, cross-fade via fadeWindow), and its
       fade-timing shape (`lead`/`fade`/`tail` offsets in from a
       window's start/end).
     - Section 06's `autoCaption(key)` assumes exactly one caption
       per top-level SEG entry. Several scenes here need more than
       one sentence per visual beat (SC1's setup has 3 sentences;
       SC_BUILD alone carries 4), so that assumption doesn't hold.
       `windowCaption(text, start, end)` below is the same function
       with that one assumption generalized: it takes an explicit
       {start, end} window instead of a SEG key, so it works both for
       a whole scene (one caption) and for a hand-placed sub-window
       inside a scene (several captions). The fade math itself is
       untouched.
     - Reading time, not narration length alone, drove how long each
       scene now holds: every beat was re-timed so the slowest of
       (hear the line / read the caption / watch the reveal finish)
       sets the pace, per the brief. Scenes with denser narration
       (SC_BUILD, SC9, SC10, SC11) grew the most. Total runtime is
       now well beyond the original silent-preview length — see the
       implementation report for the exact before/after per scene.
     - Within a beat, elements that already existed (nodes, chips,
       arrows) were NOT reworked — only *when* they arrive was
       nudged so a reveal lands under the sentence describing it
       (e.g. the "fitnessbrand.com" chip now appears as the line
       naming it plays, instead of earlier). Nothing was added,
       removed, resized, or recolored.

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
   grammar), the violet accent + monospace UI language, the
   skip/replay control affordances, and the caption-bar pattern
   (serif center-fade paragraph driven by fadeWindow).

   NEW IN THIS FILE: VideoNode, AssetTag, Arrow/ArrowHead, Bracket,
   ScreenFrame, DomainDivider — small primitives needed to depict
   actual VSTRK screens (Video Detail, Tracking Domains settings)
   and journey/domain relationships that Sections 01-06 didn't need.
   Also windowCaption() — Section 06's autoCaption() generalized to
   take an explicit {start, end} window instead of a SEG key, so a
   single scene can carry more than one caption (see CAPTION NOTES
   above).
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
// Durations below are sized for narration, not just the visual reveal:
// each equals the sum of that scene's caption windows (see CAPTIONS),
// so the slowest of "hear it / read it / watch it finish" sets the pace.
const SCENE_SOURCE: [string, number][] = [
  ["SC1", 17000], // preview finished journey + "build it backward" (3 lines)
  ["SC_BUILD", 40200], // create F→asset, E, D, C, B, A, payoff (4 lines)
  ["SC5", 18300], // root tracking domain concept (3 lines)
  ["SC6", 19900], // messy cross-root-domain example (2 lines)
  ["SC7", 9000], // Tracking Domains settings page (1 line)
  ["SC8", 19000], // Video Detail: add another tracking link (2 lines)
  ["SC9", 21600], // second journey, shared Video B (3 lines)
  ["SC10", 26600], // combined cross-domain journey (4 lines)
  ["SC11", 28300], // 1 / 2 / 3+ root domains + WhatsApp (4 lines)
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
/** helper: absolute-ms offset `offset` into scene `sceneKey` (for caption windows / sub-phase math) */
function into(sceneKey: string, offset: number) {
  return SEG[sceneKey].start + offset;
}

/* ---------------------------------------------------------------
   Captions — see CAPTION NOTES at the top of this file.
   windowCaption() is autoCaption() from Section 06 with the same
   fade shape (lead in / cross-fade / tail out before the window
   ends), generalized to take an explicit {start,end} window instead
   of a single SEG key, since several scenes below carry more than
   one caption.
----------------------------------------------------------------- */
function windowCaption(text: string, start: number, end: number, opts: { lead?: number; tail?: number; fade?: number } = {}) {
  const { lead = 220, tail = 260, fade = 220 } = opts;
  const a = start + lead;
  const d = end - tail;
  const b = Math.min(a + fade, a + (d - a) / 2);
  const c = Math.max(b, d - fade);
  return { text, a, b, c, d };
}

const CAPTIONS = [
  // ---- SC1: why we build backward (3 lines) ----
  windowCaption(
    "Let's say you want to build a more complex marketing campaign, where multiple videos work together to educate and nurture a potential customer.",
    into("SC1", 0), into("SC1", 7600)
  ),
  windowCaption(
    "You might have one complete journey, from Video A all the way to Video F.",
    into("SC1", 7600), into("SC1", 12400)
  ),
  windowCaption(
    "But instead of starting with Video A, we're going to build this journey backward.",
    into("SC1", 12400), into("SC1", 17000)
  ),

  // ---- SC_BUILD: start with F, E promotes F, repeat backward, payoff (4 lines) ----
  windowCaption(
    "So we start with the final piece, Video F. Once Video F is ready, we turn it into an asset — now there's something the previous video can promote.",
    into("SC_BUILD", 0), into("SC_BUILD", 10000)
  ),
  windowCaption(
    "Now we create Video E, and have it promote the Video F asset — so Video E leads into Video F. Then we turn Video E into an asset too, so the video before it can promote it.",
    into("SC_BUILD", 10000), into("SC_BUILD", 22000)
  ),
  windowCaption(
    "And we simply keep repeating that process — Video D promotes Video E, Video C promotes Video D, Video B promotes Video C, and finally Video A promotes Video B. By working backward, we build the entire journey one piece at a time.",
    into("SC_BUILD", 22000), into("SC_BUILD", 35000)
  ),
  windowCaption(
    "And now we have our complete journey — from Video A all the way to Video F.",
    into("SC_BUILD", 35000), into("SC_BUILD", 40200)
  ),

  // ---- SC5: one root tracking domain (3 lines) ----
  windowCaption(
    "Now let's talk about tracking domains. For each user journey, we recommend keeping everything under one root tracking domain.",
    into("SC5", 0), into("SC5", 6200)
  ),
  windowCaption(
    "You can still use different subdomains, like go.novashop.com, fly.novashop.com, or cpu.novashop.com — they're all still part of the same root domain: novashop.com.",
    into("SC5", 6200), into("SC5", 13900)
  ),
  windowCaption(
    "You can create and manage these tracking domains from your Tracking Domains settings.",
    into("SC5", 13900), into("SC5", 18300)
  ),

  // ---- SC6: multiple root domains (2 lines) ----
  windowCaption(
    "What we don't recommend is constantly jumping between unrelated root domains in the same journey — going from novashop.com, to otherbrand.com, to anotherbrand.com creates multiple domain boundaries inside one journey.",
    into("SC6", 0), into("SC6", 9200)
  ),
  windowCaption(
    "VSTRK can technically handle more complex cross-domain journeys, but every extra root domain makes the tracking relationship harder to manage. For a normal journey, keeping everything under one root domain is simpler and safer.",
    into("SC6", 9200), into("SC6", 19900)
  ),

  // ---- SC7: Tracking Domains settings (1 line) ----
  windowCaption(
    "And this is where you manage those tracking domains in VSTRK — you can have multiple subdomains, while keeping them organized under the same root domain for the journey.",
    into("SC7", 0), into("SC7", 9000)
  ),

  // ---- SC8: add another tracking link from Video Detail (2 lines) ----
  windowCaption(
    "Here's another useful feature. From Video Detail, you can add another tracking link to a video. So even though Video D is already part of our A-to-F journey, you might also want it to promote another piece of content, like Video M.",
    into("SC8", 0), into("SC8", 13100)
  ),
  windowCaption(
    "That doesn't mean we've changed the original journey — we've simply given Video D another path it can promote.",
    into("SC8", 13100), into("SC8", 19000)
  ),

  // ---- SC9: a second journey can share Video B (3 lines) ----
  windowCaption(
    "Now let's make this a little more interesting — maybe Video M starts a completely different user journey: Video M leads to Video N, then to Video B, and eventually to Video V.",
    into("SC9", 0), into("SC9", 10100)
  ),
  windowCaption(
    "This second journey can use a different root tracking domain, like fitnessbrand.com.",
    into("SC9", 10100), into("SC9", 14200)
  ),
  windowCaption(
    "Notice that Video B is shared between these two journeys — the same piece of content can be part of more than one journey.",
    into("SC9", 14200), into("SC9", 21600)
  ),

  // ---- SC10: cross-domain journey (4 lines) ----
  windowCaption(
    "So what happens when someone actually moves from one journey into another? VSTRK can handle that too.",
    into("SC10", 0), into("SC10", 5600)
  ),
  windowCaption(
    "In this example, the journey starts under novashop.com, moves through Video D, then continues through Video M and Video N, and eventually reaches Video B and Video V under fitnessbrand.com.",
    into("SC10", 5600), into("SC10", 15100)
  ),
  windowCaption(
    "So VSTRK can track a single user journey across two different root domains.",
    into("SC10", 15100), into("SC10", 19500)
  ),
  windowCaption(
    "And two root domains can be perfectly reasonable — as long as there's a real business reason for the journey to cross domains.",
    into("SC10", 19500), into("SC10", 26600)
  ),

  // ---- SC11: one, two, or more root domains (4 lines) ----
  windowCaption(
    "Our recommendation is simple: use one root tracking domain whenever you can.",
    into("SC11", 0), into("SC11", 4100)
  ),
  windowCaption(
    "If your journey genuinely needs to cross into a second root domain, that's okay.",
    into("SC11", 4100), into("SC11", 8800)
  ),
  windowCaption(
    "But once you start adding a third, fourth, or more root domains, the journey becomes much harder to manage and secure.",
    into("SC11", 8800), into("SC11", 15600)
  ),
  windowCaption(
    "More complex setups may technically be possible — but we strongly recommend talking to us first. If you need a more complex multi-domain journey, message us on WhatsApp and we'll help you figure out the right setup.",
    into("SC11", 15600), into("SC11", 28300)
  ),
];

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

  // Nodes fade in one-by-one across caption 1 ("multiple videos work
  // together"); arrows connect them across caption 2 ("one complete
  // journey, A to F"); the backward signal lands with caption 3.
  const s1NodeIn = CHAIN_X.map((_, i) => at("SC1", 300 + i * 1300, 420));
  const s1ArrowIn = CHAIN_X.slice(0, -1).map((_, i) => at("SC1", 7900 + i * 780, 380));
  const s1BackwardIn = at("SC1", 12700, 600);
  const s1DimAmt = fadeWindow(t, s1BackwardIn.start, s1BackwardIn.end, Infinity, Infinity) * 0.5;

  /* ================= SCENE: BUILD (F, E, D, C, B, A, payoff) ================= */
  // Each phase offset is measured from SC_BUILD.start.
  // Phase starts now match the 4 caption windows above (F | E | D-C-B-A | payoff).
  // Each phase's own internal reveal offsets (node → arrow → asset tag) are
  // unchanged — they still fire in the first ~1.2-3.7s of the phase, exactly as
  // before; the extra room simply lets that reveal hold on screen while its
  // sentence is read, instead of cutting to the next phase immediately after.
  const P_F = 0, P_E = 10000, P_D = 22000, P_C = 25200, P_B = 28400, P_A = 31600, P_PAYOFF = 35000;

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
  // Caption 1 (0-6200): the generic "one root domain" idea — journey nodes only.
  const s5NodeIn = s5SubX.map((_, i) => at("SC5", 300 + i * 1400, 400));
  const s5ArrowIn = s5SubX.slice(0, -1).map((_, i) => at("SC5", 1000 + i * 1400, 350));
  // Caption 2 (6200-13900): subdomains named, then grouped under the root pill.
  const s5SubdomainLabels = ["go.novashop.com", "fly.novashop.com", "cpu.novashop.com"];
  const s5SubdomainIn = s5SubdomainLabels.map((_, i) => at("SC5", 6500 + i * 1600, 400));
  const s5BracketIn = at("SC5", 12000, 600);
  const s5RootIn = at("SC5", 12800, 500);
  // Caption 3 (13900-18300): where to manage them.
  const s5UrlChipIn = at("SC5", 14200, 500);

  /* ================= SCENE 6 — messy cross-root-domain example ================= */
  const s6Labels = ["go.novashop.com", "go.otherbrand.com", "go.anotherbrand.com"];
  const s6X = [190, 480, 770];
  const s6Y = 260;
  // Caption 1 (0-9200): the three domain chips appearing, one jump at a time.
  const s6NodeIn = s6Labels.map((_, i) => at("SC6", 400 + i * 2800, 500));
  const s6ArrowIn = [at("SC6", 2000, 500), at("SC6", 4800, 500)];
  const s6RootColors = [ACCENT, "#a9539a", WARN];
  // Caption 2 (9200-19900): the root-domain boundaries, then the warning line.
  const s6RootIn = s6Labels.map((_, i) => at("SC6", 9600 + i * 2800, 500));
  const s6NoteIn = at("SC6", 16200, 600);

  /* ================= SCENE 7 — Tracking Domains settings page ================= */
  const s7FrameIn = at("SC7", 300, 600);
  const s7RowLabels = ["go.novashop.com", "fly.novashop.com", "cpu.novashop.com"];
  const s7RowIn = s7RowLabels.map((_, i) => at("SC7", 1800 + i * 1800, 500));
  const s7RootIn = at("SC7", 6800, 500);
  const s7ConnectIn = at("SC7", 7600, 600);

  /* ================= SCENE 8 — Video Detail: add a tracking link ================= */
  // Caption 1 (0-13100): Video Detail screen — existing link, then the new one.
  const s8FrameIn = at("SC8", 300, 600);
  const s8ExistingRowIn = at("SC8", 2000, 500);
  const s8ButtonIn = at("SC8", 5000, 500);
  const s8NewRowIn = at("SC8", 8500, 600);
  // Caption 2 (13100-19000): the reassurance — D still leads into E→F, plus M.
  const s8DiagramIn = at("SC8", 13400, 650);
  const s8BranchArrowIn = at("SC8", 15300, 600);

  /* ================= SCENE 9 — second journey, shared Video B ================= */
  const J1_X = [90, 254, 418, 582, 746, 910];
  const J1_Y = 170;
  const J1_LABEL = ["A", "B", "C", "D", "E", "F"];
  // Caption 1 (0-10100): quick Journey 1 recap, then Journey 2 builds
  // node-by-node as the narration lists "M leads to N, then to B, then to V".
  const s9J1TitleIn = at("SC9", 100, 400);
  const s9J1NodeIn = J1_X.map((_, i) => at("SC9", 500 + i * 250, 300));
  const s9J1RootIn = at("SC9", 2400, 400);

  const J2_X = [150, 350, 550, 750];
  const J2_Y = 400;
  const J2_LABEL = ["M", "N", "B", "V"];
  const s9J2TitleIn = at("SC9", 3200, 400);
  const s9J2NodeIn = J2_X.map((_, i) => at("SC9", 3800 + i * 1500, 350));
  // Caption 2 (10100-14200): the second journey's own root domain.
  const s9J2RootIn = at("SC9", 10400, 450);
  // Caption 3 (14200-21600): Video B is shared between the two journeys.
  const s9SharedConnectIn = at("SC9", 14500, 700);
  const s9SharedPulseStart = SEG.SC9.start + 15400;
  const s9SharedPulse = t > s9SharedPulseStart && t < SEG.SC9.end - 200
    ? Math.sin(prog(t, s9SharedPulseStart, SEG.SC9.end - 200) * Math.PI) : 0;

  /* ================= SCENE 10 — combined cross-domain journey ================= */
  const S10_X = [80, 200, 320, 440, 560, 680, 800, 920];
  const S10_LABEL = ["A", "B", "C", "D", "M", "N", "B", "V"];
  const S10_TONE = [ACCENT, ACCENT, ACCENT, ACCENT, ACCENT2, ACCENT2, ACCENT2, ACCENT2];
  // Nodes/arrows walk through across captions 1-2 (0-15100), matching
  // "the journey starts under novashop.com ... reaches B and V under
  // fitnessbrand.com". Captions 3-4 then hold on the finished diagram
  // as the summary/recommendation plays — no new reveals needed there.
  const s10NodeIn = S10_X.map((_, i) => at("SC10", 3000 + i * 1500, 350));
  const s10ArrowIn = S10_X.slice(0, -1).map((_, i) => at("SC10", 3750 + i * 1500, 300));
  const s10BoundaryIn = at("SC10", 8300, 500);
  const s10LeftRootIn = at("SC10", 4800, 450);
  const s10RightRootIn = at("SC10", 9500, 450);
  const s10SharedPulseStart = SEG.SC10.start + 14000;
  const s10SharedPulse = t > s10SharedPulseStart && t < SEG.SC10.end - 200
    ? Math.sin(prog(t, s10SharedPulseStart, SEG.SC10.end - 200) * Math.PI) : 0;

  /* ================= SCENE 11 — 1 / 2 / 3+ root domains + WhatsApp ================= */
  const s11Row1In = at("SC11", 300, 500); // caption 1: one root domain
  const s11Row2In = at("SC11", 4400, 500); // caption 2: a second is okay
  const s11Row3In = at("SC11", 9100, 500); // caption 3: 3+ gets harder to manage
  const s11ContactIn = at("SC11", 18100, 600); // caption 4: talk to us / WhatsApp

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

      {/* ---------- Caption bar ----------
          Same pattern as Section 06 (centered serif paragraph, cross-fades
          via fadeWindow, sits below the canvas so it never overlaps the
          animation). Taller and slightly smaller type than Section 06's,
          since these lines run longer (up to ~40 words vs. one short
          sentence there) and need room to wrap onto several lines without
          crowding the canvas above. */}
      <div style={{ position: "relative", width: "100%", maxWidth: 720, minHeight: 118, margin: "10px auto 0", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px" }}>
        {CAPTIONS.map((c, i) => {
          const op = fadeWindow(t, c.a, c.b, c.c, c.d);
          if (op <= 0.001) return null;
          return (
            <p key={i} style={{
              position: "absolute", margin: 0, fontFamily: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
              fontSize: 18.5, fontWeight: 400, color: INK, opacity: op, letterSpacing: 0.1, textAlign: "center",
              whiteSpace: "pre-line", lineHeight: 1.42,
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
