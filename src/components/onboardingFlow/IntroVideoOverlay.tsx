import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { FONT } from './OnboardingShell';

/** Lives in public/videoloop/, next to your other loop videos. The name is case-sensitive on Vercel. */
export const INTRO_VIDEO_SRC = '/videoloop/loadingScreen.mp4';

const SEEN_KEY = 'vstrk.onboarding.introSeen';
/** If playback hasn't started by then (slow network, blocked autoplay), move on instead of waiting. */
const START_TIMEOUT_MS = 8000;

function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

/**
 * One-time cinematic brand moment between the last onboarding question and signup.
 * Centered 16:9 video over a dimmed page. Muted, plays once, no controls.
 * Calls `onDone` exactly once: when the video ends, on Skip / Escape, or if the video can't play.
 * Someone who already watched or skipped it gets `onDone` straight away (nothing is shown).
 */
export default function IntroVideoOverlay({
  onDone,
  src = INTRO_VIDEO_SRC,
}: {
  onDone: () => void;
  src?: string;
}) {
  const reduce = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const started = useRef(false);
  const finished = useRef(false);
  const latestOnDone = useRef(onDone);
  latestOnDone.current = onDone;
  const [alreadySeen] = useState(hasSeenIntro);

  /** `watched` is false when the video failed, so a broken load doesn't count as "seen". */
  const finish = useCallback((watched: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (watched) markIntroSeen();
    latestOnDone.current();
  }, []);

  useEffect(() => {
    if (alreadySeen) {
      finish(false);
      return;
    }
    const v = video.current;
    if (v) {
      v.muted = true; // React doesn't always reflect the muted attribute; autoplay needs it
      v.play()?.catch((err: unknown) => {
        const name = (err as { name?: string } | null)?.name;
        if (name === 'NotAllowedError' || name === 'NotSupportedError') finish(false);
      });
    }
    const timer = window.setTimeout(() => {
      if (!started.current) finish(false);
    }, START_TIMEOUT_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(true);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [alreadySeen, finish]);

  if (alreadySeen) return null;

  // Portal: a fixed overlay must not live inside a transformed (animated) ancestor.
  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to VSTRK"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 px-4 sm:px-8"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* very faint violet atmosphere behind the video */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(48rem_28rem_at_50%_50%,rgba(91,61,245,0.14),transparent_70%)]"
      />

      {/* 16:9 box: at most 960px wide, never wider than the screen, never taller than the screen */}
      <div className="relative" style={{ width: 'min(100%, 960px, calc((100vh - 7rem) * 16 / 9))' }}>
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
          <video
            ref={video}
            src={src}
            className="h-full w-full object-contain"
            autoPlay
            muted
            playsInline
            preload="auto"
            onPlaying={() => {
              started.current = true;
            }}
            onEnded={() => finish(true)}
            onError={() => finish(false)}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={() => finish(true)}
            className="flex items-center gap-2 rounded px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25"
            style={FONT.mono}
          >
            Skip <ArrowRight size={14} className="text-[#F97316]" aria-hidden />
          </button>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
