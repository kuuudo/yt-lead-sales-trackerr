// src/components/tutorial/TutorialRunner.tsx
//
// Mount this ONCE near the root of the app, inside the Router (it needs
// useNavigate/useLocation). Renders nothing when no tutorial is active.
// When active, it dims the current real page, cuts a spotlight around
// the real DOM element(s) matching the current step's targetSelector,
// and shows a small card next to them with Next/Back.
//
// Deliberately NOT a modal like OnboardingOverlay.tsx — the whole point
// here is that the real page stays visible and interactive underneath.

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useTutorial, readPersistedProgress } from '../../lib/tutorial-overlay';
import { useAuth } from '../../lib/auth';
import { assetsTutorial } from '../../lib/tutorials/assetsTutorial';
import { marketplaceTutorial } from '../../lib/tutorials/marketplaceTutorial';
import { promotionTutorial } from '../../lib/tutorials/promotionTutorial';
import { videosTutorial } from '../../lib/tutorials/videosTutorial';
import { trackFirstContentGuide } from '../../lib/tutorials/trackFirstContentGuide';
import { createFirstAssetGuide } from '../../lib/tutorials/createFirstAssetGuide';
import { createCampaignAssetGuide } from '../../lib/tutorials/createCampaignAssetGuide';
import { createVideoLibraryAssetGuide } from '../../lib/tutorials/createVideoLibraryAssetGuide';
import { createImportAssetGuide } from '../../lib/tutorials/createImportAssetGuide';
import { workWithYourTeamGuide } from '../../lib/tutorials/workWithYourTeamGuide';
// Registry of tutorials the runner knows how to resume after a refresh.
// Add future tutorials (collaboration, content, operator) here — nothing
// else in this file needs to change to support them. trackFirstContentGuide
// is the first `mode: 'follow-along'` entry — resume/persistence works
// identically to the tour-mode entries, no special-casing needed.
const TUTORIAL_REGISTRY = {
  [assetsTutorial.id]: assetsTutorial,
  [marketplaceTutorial.id]: marketplaceTutorial,
  [videosTutorial.id]: videosTutorial,
  [promotionTutorial.id]: promotionTutorial,
  [trackFirstContentGuide.id]: trackFirstContentGuide,
  [createFirstAssetGuide.id]: createFirstAssetGuide,
  [createCampaignAssetGuide.id]: createCampaignAssetGuide,
  [createVideoLibraryAssetGuide.id]: createVideoLibraryAssetGuide,
  [createImportAssetGuide.id]: createImportAssetGuide,
  [workWithYourTeamGuide.id]: workWithYourTeamGuide,
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function measureGroup(selector: string): Rect | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (els.length === 0) return null;
  const rects = els.map(el => el.getBoundingClientRect());
  const x = Math.min(...rects.map(r => r.left));
  const y = Math.min(...rects.map(r => r.top));
  const right = Math.max(...rects.map(r => r.right));
  const bottom = Math.max(...rects.map(r => r.bottom));
  const pad = 8;
  return { x: x - pad, y: y - pad, w: right - x + pad * 2, h: bottom - y + pad * 2 };
}

function renderBody(body: string, navigate: (path: string) => void, isLight: boolean) {
  return body.split('\n\n').map((para, i) => (
    <p key={i} className={`text-xs leading-relaxed mb-3 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
      {para.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((chunk, j) => {
        if (chunk.startsWith('**') && chunk.endsWith('**')) {
          return (
            <span key={j} className={`font-bold ${isLight ? 'text-orange-600' : 'text-orange-500'}`}>
              {chunk.slice(2, -2)}
            </span>
          );
        }
        const linkMatch = chunk.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          return (
            <button
              key={j}
              type="button"
              onClick={() => navigate(linkMatch[2])}
              className={isLight ? 'underline text-zinc-700 hover:text-zinc-950' : 'underline text-zinc-300 hover:text-white'}
            >
              {linkMatch[1]}
            </button>
          );
        }
        return chunk;
      })}
    </p>
  ));
}

export default function TutorialRunner() {
  const { tutorial, stepIndex, status, satisfiedEventKeys, next, back, close, resumeAt, start } =
    useTutorial();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [rect, setRect] = useState<Rect | null>(null);
  const [routeResolved, setRouteResolved] = useState(false);
  const [routeMissing, setRouteMissing] = useState(false);
  const resumedRef = useRef(false);

  const step = tutorial?.steps[stepIndex] ?? null;

  // One-time resume-after-refresh check. Only runs once per mount, and
  // only if nothing is already active (e.g. a fresh page load, not a
  // tutorial the user just started).
  useEffect(() => {
    if (resumedRef.current || status !== 'idle') return;
    resumedRef.current = true;
    for (const t of Object.values(TUTORIAL_REGISTRY)) {
      const progress = readPersistedProgress(user?.id, t.id);
      if (progress) {
        resumeAt(t, progress.stepIndex);
        break;
      }
    }
  }, [status, user?.id, resumeAt]);

  // Resolve + navigate to this step's route, if it needs one.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    setRouteResolved(false);
    setRouteMissing(false);

    async function ensureRoute() {
      let target: string | null = step!.route ?? null;
      if (step!.resolveRoute) {
        target = await step!.resolveRoute();
      }
      if (cancelled) return;
      if (target === null && step!.resolveRoute) {
        // Dynamic route had nothing to resolve to (e.g. no campaigns yet).
        setRouteMissing(true);
        setRouteResolved(true);
        return;
      }
      if (target && location.pathname !== target) {
        navigate(target);
      }
      setRouteResolved(true);
    }
    ensureRoute();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, stepIndex]);

  // Wait for the target element(s) once we're on the right route.
  useEffect(() => {
    if (!step || !routeResolved || routeMissing) {
      setRect(null);
      return;
    }
    if (!step.targetSelector) {
      setRect(null);
      return;
    }

    let cancelled = false;
    const timeoutMs = step.waitTimeoutMs ?? 4000;
    const deadline = Date.now() + timeoutMs;

    function tryMeasure() {
      if (cancelled) return;
      const r = measureGroup(step!.targetSelector!);
      if (r) {
        setRect(r);
        return;
      }
      if (Date.now() < deadline) {
        requestAnimationFrame(tryMeasure);
      } else {
        setRect(null); // give up — falls back to centered card + fallbackNote
      }
    }
    tryMeasure();

    const onResize = () => {
      const r = measureGroup(step!.targetSelector!);
      if (r) setRect(r);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [step, routeResolved, routeMissing]);

  const showFallback = routeMissing || (!!step?.targetSelector && !rect && routeResolved);
  const isLastStep = !!tutorial && stepIndex === tutorial.steps.length - 1;
  const handleNext = useCallback(() => next(), [next]);
  const handleContinueTour = useCallback(() => {
    if (step?.handoffTutorial) start(step.handoffTutorial);
  }, [start, step]);

  // requireAction gating — computed here (before the early return below) so
  // the auto-advance effect for Follow-Along can use it. Tour-mode behavior
  // is unchanged either way: it never auto-advances, so needsAction/
  // actionSatisfied only ever drove the existing Next/"Waiting…" button swap.
  const needsAction = !!step?.requireAction;
  const actionSatisfied = needsAction
    ? satisfiedEventKeys.includes(step!.requireAction!.eventKey)
    : true;
  const isFollowAlong = tutorial?.mode === 'follow-along';

  // Follow-Along's own collapsed/expanded state — a small 🎓 launcher when
  // collapsed, the full white guide card when expanded. Tour mode never
  // reads this and is unaffected. Defaults to expanded so the very first
  // step is visible right after the user starts the guide; resets to
  // expanded again whenever a (new) tutorial becomes active.
  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => {
    setPanelOpen(true);
  }, [tutorial?.id]);

  // Auto-advance: once a Follow-Along step's real-world action is detected,
  // move on automatically instead of waiting for a Next click — this is the
  // "Instruction → user performs action → detect → continue" behavior from
  // the spec. Tour mode is untouched; its requireAction steps (if any) still
  // require an explicit Next click via the existing button below.
  useEffect(() => {
    if (isFollowAlong && needsAction && actionSatisfied && status === 'active') {
      next();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFollowAlong, needsAction, actionSatisfied, status]);

  if (status !== 'active' || !tutorial || !step) return null;

  // Collapsed Follow-Along state: just the small 🎓 launcher, bottom-right,
  // no spotlight/dim — fully out of the way until the user wants it back.
  // Tour mode never reaches this branch (isFollowAlong is false for it).
  if (isFollowAlong && !panelOpen) {
    return (
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 2147483000 }} aria-live="polite">
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label="Reopen the Track Your First Content guide"
          className="pointer-events-auto fixed bottom-5 right-5 w-12 h-12 rounded-full bg-white border border-zinc-200 text-lg shadow-2xl flex items-center justify-center hover:scale-105 transition-transform"
        >
          🎓
        </button>
      </div>
    );
  }

  const cardWidth = step.previewImage ? 320 : (isFollowAlong ? 300 : 280);
  const isMobile = window.innerWidth < 640;
    let cardStyle: any; // needs x/y (not transform) so Framer Motion can compose it with its own scale animation

  if (isFollowAlong && !isMobile) {
    // Follow-Along always anchors bottom-right on desktop, regardless of
    // where the spotlighted element is — the spotlight (drawn separately
    // below, unchanged) is what points at the real element; the card's job
    // is just to stay out of the way as a persistent, predictable guide.
    cardStyle = {
      position: 'fixed',
      right: 20,
      bottom: 20,
      width: cardWidth,
      maxHeight: '60vh',
      overflowY: 'auto',
    };
  } else if (isMobile) {
    // Bottom sheet on small screens — floating the card next to a
    // target, or dead-center, isn't reliable on short viewports and
    // risks colliding with persistent UI like MobileRankingsButton.
    cardStyle = {
      position: 'fixed',
      left: 16,
      right: 16,
      bottom: 'max(16px, env(safe-area-inset-bottom))',
      width: 'auto',
      maxHeight: '45vh',
      overflowY: 'auto',
    };
  } else if (rect && !step.previewImage) {
    const spaceRight = window.innerWidth - (rect.x + rect.w);
    const placeRight = spaceRight > cardWidth + 24;
    let left = placeRight ? rect.x + rect.w + 16 : rect.x - cardWidth - 16;
    left = Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16));
    cardStyle = {
      position: 'fixed',
      top: Math.max(16, Math.min(rect.y, window.innerHeight - 260)),
      left,
      width: cardWidth,
    };
  } else if (!isMobile) {
    // Desktop fallback (previewImage steps, or target not found).
    // Park the card on the right so it doesn't cover page content.
    cardStyle = step.cardOffset
      ? {
          position: 'fixed',
          top: step.cardOffset.top,
          left: step.cardOffset.left,
          x: '-50%',
          y: '-50%',
          width: cardWidth,
          maxHeight: 'calc(100dvh - 96px)',
          overflowY: 'auto',
        }
      : {
          position: 'fixed',
          right: 20,
          top: '50%',
          y: '-50%',
          width: cardWidth,
          maxHeight: 'calc(100dvh - 96px)',
          overflowY: 'auto',
        };
  } else {
    cardStyle = {
      position: 'fixed',
      left: 16,
      right: 16,
      bottom: 'max(16px, env(safe-area-inset-bottom))',
      width: 'auto',
      maxHeight: '45vh',
      overflowY: 'auto',
    };
  }

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 2147483000 }} aria-live="polite">
      {/* Dim layer with a cut-out around the real target — pointer-events
          left on so the user can still click the real app underneath.
          The card itself re-enables pointer-events below. */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="tutorial-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={8} fill="black" />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tutorial-spotlight-mask)"
        />
      </svg>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${stepIndex}-${rect ? 'r' : 'c'}`}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18 }}
          style={cardStyle}
          className={
            isFollowAlong
              ? 'pointer-events-auto bg-white border border-zinc-200 rounded-xl p-4 shadow-2xl'
              : 'pointer-events-auto bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-2xl'
          }
        >
          {isFollowAlong && (
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1 flex items-center gap-1">
              🎓 Follow Along
            </p>
          )}
          {step.tag && (
            <span
              className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-2 ${
                step.tag === 'try-it'
                  ? 'bg-red-600 text-white'
                  : isFollowAlong
                    ? 'bg-zinc-100 text-zinc-600'
                    : 'bg-zinc-700 text-zinc-300'
              }`}
            >
              {step.tag === 'try-it' ? 'Try it' : 'Demo'}
            </span>
          )}
          <p className={`text-sm font-semibold mb-1.5 ${isFollowAlong ? 'text-zinc-900' : 'text-white'}`}>
            {step.title}
          </p>
          {renderBody(step.body, navigate, isFollowAlong)}

          {step.previewImage && (
            <div
              className={`relative rounded-lg overflow-hidden mb-3 flex items-center justify-center max-h-64 ${
                isFollowAlong ? 'border border-zinc-200 bg-zinc-50' : 'border border-zinc-700 bg-zinc-950'
              }`}
            >
              <img
                src={step.previewImage.src}
                alt={step.previewImage.alt}
                className="w-full h-auto max-h-64 object-contain block"
              />
              
            </div>
          )}

{step.ctaLinks && (
            <div className="flex flex-col gap-2 mb-3">
              {step.ctaLinks.map((cta, i) => (
                <button
                  key={i}
                  onClick={() => {
                  if (cta.startTutorial) {
                  start(cta.startTutorial);
                  return;
                  }
                  if (cta.href) navigate(cta.href);
                  }}
                  disabled={!cta.href && !cta.startTutorial}
                  className={
                    isFollowAlong
                      ? 'text-left bg-zinc-50 border border-zinc-200 rounded-lg p-3 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'text-left bg-zinc-800 border border-zinc-700 rounded-lg p-3 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed'
                  }
                >
                  <p className={`text-xs font-bold mb-1 ${isFollowAlong ? 'text-zinc-900' : 'text-white'}`}>
                    {cta.emoji} {cta.title}
                  </p>
                  <p className={`text-[11px] leading-relaxed ${isFollowAlong ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {cta.description}
                  </p>
                </button>
              ))}
            </div>
          )}
          {showFallback && step.fallbackNote && (
            <p className={`text-xs italic leading-relaxed mb-3 ${isFollowAlong ? 'text-zinc-500' : 'text-zinc-500'}`}>
              {step.fallbackNote}
            </p>
          )}

          <div className="flex items-center justify-between mt-2">
            <button
              onClick={back}
              disabled={stepIndex === 0}
              className={
                isFollowAlong
                  ? 'text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-900 disabled:opacity-30 disabled:hover:text-zinc-400'
                  : 'text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-500'
              }
            >
              Back
            </button>
            <div className="flex items-center gap-1">
              {tutorial.steps.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${
                    i === stepIndex
                      ? (isFollowAlong ? 'bg-zinc-900' : 'bg-white')
                      : (isFollowAlong ? 'bg-zinc-200' : 'bg-zinc-700')
                  }`}
                />
              ))}
            </div>
            {needsAction && !actionSatisfied ? (
              <span className={`text-[10px] font-black uppercase tracking-widest ${isFollowAlong ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Waiting…
              </span>
            ) : (
              <button
                onClick={handleNext}
                className={
                  isFollowAlong
                    ? 'text-[10px] font-black uppercase tracking-widest bg-zinc-900 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-700'
                    : 'text-[10px] font-black uppercase tracking-widest bg-white text-zinc-950 px-3 py-1.5 rounded-lg hover:bg-zinc-200'
                }
              >
                {stepIndex === tutorial.steps.length - 1 ? 'Done' : 'Next'}
              </button>
            )}
          </div>

          {isLastStep && step.handoffTutorial && (
            <button
              onClick={handleContinueTour}
              className="mt-3 w-full text-center text-[10px] font-black uppercase tracking-widest bg-orange-600 hover:bg-orange-500 text-white px-3 py-2.5 rounded-lg"
            >
              Continue the Promotion Tour
            </button>
          )}

          {isFollowAlong && (
            <button
              onClick={() => setPanelOpen(false)}
              className="absolute -top-2 -right-9 w-6 h-6 rounded-full bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-900 text-xs flex items-center justify-center shadow"
              aria-label="Minimize guide"
            >
              –
            </button>
          )}

          <button
            onClick={close}
            className={
              isFollowAlong
                ? 'absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-900 text-xs flex items-center justify-center shadow'
                : 'absolute -top-2 -right-2 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-white text-xs flex items-center justify-center'
            }
            aria-label="Close tutorial"
          >
            ✕
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}