// ─────────────────────────────────────────────────────────────────────────
// pages/public/VSL/1ST/scenes/PlayerCheck.tsx
// ─────────────────────────────────────────────────────────────────────────
// Throw-away diagnostic scene — NOT a real VSL animation. It exists only to
// prove the player works: the timer runs on Play, freezes on Pause, and
// returns to 0 on Restart. Also doubles as a minimal template for new scenes.
// Imports only React + the shared hook: no Supabase, auth or user data.
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import type { VSLSceneProps } from '../vslTypes';
import { useSceneClock } from '../useSceneClock';

const ACCENT = '#5b3df0';
const INK = '#15151f';
const MUTED = '#6b6b78';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function PlayerCheck({ playing }: VSLSceneProps) {
  const t = useSceneClock(playing);
  const [clicks, setClicks] = useState(0); // proves local state resets on Restart
  const pct = Math.min(100, (t / 10000) * 100);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, color: INK }}>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: MUTED }}>
        Player check · {playing ? 'playing' : t > 0 ? 'paused' : 'idle'}
      </div>
      <div style={{ fontSize: 96, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{(t / 1000).toFixed(1)}s</div>
      <div style={{ width: 'min(480px, 70%)', height: 8, borderRadius: 999, background: '#ececf3', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: ACCENT }} />
      </div>
      <button
        type="button"
        onClick={() => setClicks((c) => c + 1)}
        style={{ padding: '10px 18px', borderRadius: 8, border: `1px solid ${ACCENT}`, background: '#fff', color: ACCENT, fontWeight: 700, cursor: 'pointer' }}
      >
        Clicked {clicks}×
      </button>
    </div>
  );
}
