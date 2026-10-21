// ─────────────────────────────────────────────────────────────────────────
// pages/public/VSL/1ST/useSceneClock.ts
// ─────────────────────────────────────────────────────────────────────────
// Optional helper for timed scenes. Returns elapsed milliseconds that only
// advance while `playing` is true, and keep their value while paused.
// It starts at 0 on every mount, so Restart (remount) resets it.
// Pass `maxMs` (the scene length) to stop the loop once the scene is over.
//
//   const t = useSceneClock(playing, 38000);
//   const showStep2 = t > 2500;
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';

export function useSceneClock(playing: boolean, maxMs?: number): number {
  const [elapsed, setElapsed] = useState(0);
  const base = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const startBase = base.current;
    let raf = 0;
    const tick = (now: number) => {
      let value = startBase + (now - startedAt);
      if (maxMs !== undefined && value >= maxMs) {
        base.current = maxMs;
        setElapsed(maxMs);
        return; // scene finished: stop scheduling frames
      }
      base.current = value;
      setElapsed(value);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, maxMs]);

  return elapsed;
}
