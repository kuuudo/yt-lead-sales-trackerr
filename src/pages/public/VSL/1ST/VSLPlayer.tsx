// ─────────────────────────────────────────────────────────────────────────
// pages/public/VSL/1ST/VSLPlayer.tsx
// ─────────────────────────────────────────────────────────────────────────
// Local "stage" for VSL animations. Pick a scene, press Play, screen-record.
// Registered in App.tsx at /vsl1stversionanimation.
//
// Presentation only: imports no Supabase client, no auth hook and no
// user/org context. Deliberately separate from the onboarding video system
// and from InterviewDemo (both untouched). Visual language mirrors InterviewDemo.
//
// Shortcuts:  Space = play/pause · R = restart · H = recording mode · Esc = exit recording mode
// ─────────────────────────────────────────────────────────────────────────

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { VSL_SCENES } from './vslRegistry';

const ACCENT = '#5b3df0';
const INK = '#15151f';
const LINE = '#d9d9e3';
const MUTED = '#6b6b78';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Keeps a broken scene from taking the player (or other scenes) down. */
class SceneBoundary extends React.Component<{ children: React.ReactNode; label: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error(`[VSL] scene "${this.props.label}" crashed:`, error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 560, margin: '40px auto', padding: 20, border: '1.5px dashed #e5a3a3', borderRadius: 14, background: '#fff6f6', color: '#a02020' }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>
            Scene “{this.props.label}” crashed
          </div>
          <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
            {this.state.error.message} — fix the scene file, then press Restart.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const isTypingTarget = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable);
};

export default function VSLPlayer() {
  const [sceneId, setSceneId] = useState<string | null>(() => {
    const fromHash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    return VSL_SCENES.find((s) => s.id === fromHash)?.id ?? VSL_SCENES[0]?.id ?? null;
  });
  const [runId, setRunId] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);

  const scene = VSL_SCENES.find((s) => s.id === sceneId) ?? null;
  const timed = scene?.kind === 'timed';

  const selectScene = useCallback((id: string) => {
    setSceneId(id);
    setPlaying(false);
    setRunId((r) => r + 1);
    window.history.replaceState(null, '', `#${id}`);
  }, []);

  /** Remounts the scene (fresh state) and returns to idle, ready for the next take. */
  const restart = useCallback(() => {
    setPlaying(false);
    setRunId((r) => r + 1);
  }, []);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (timed ? setPlaying((p) => !p) : setPlaying(true)), [timed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'Escape') setRecording(false);
      else if (e.key === 'h' || e.key === 'H') setRecording((r) => !r);
      else if (e.key === 'r' || e.key === 'R') restart();
      else if (e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [restart, toggle]);

  // Blur after click so a focused button never double-fires on Space.
  const act = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    fn();
    e.currentTarget.blur();
  };

  const pill = (active: boolean): React.CSSProperties => ({
    flex: '0 0 auto', padding: '7px 13px', borderRadius: 999, whiteSpace: 'nowrap', cursor: 'pointer',
    border: active ? `1px solid ${ACCENT}` : `1px solid ${LINE}`,
    background: active ? ACCENT : '#fff', color: active ? '#fff' : MUTED,
    fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
  });

  const ctrl = (kind: 'primary' | 'plain', disabled = false): React.CSSProperties => ({
    flex: '0 0 auto', padding: '8px 15px', borderRadius: 8, fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
    border: kind === 'primary' ? 'none' : `1px solid ${LINE}`,
    background: kind === 'primary' ? ACCENT : '#fff',
    color: kind === 'primary' ? '#fff' : INK,
  });

  const SceneComponent = scene?.component;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column',
        background: '#fff', color: INK,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      }}
    >
      {/* Control bar — not rendered at all in recording mode */}
      {!recording && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', borderBottom: `1px solid ${LINE}`, background: '#fafafa' }}>
          <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 0, overflowX: 'auto' }}>
            {VSL_SCENES.length === 0 ? (
              <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, padding: '7px 0' }}>No scenes registered</span>
            ) : (
              VSL_SCENES.map((s) => (
                <button key={s.id} type="button" onClick={act(() => selectScene(s.id))} style={pill(s.id === sceneId)} aria-current={s.id === sceneId ? 'true' : undefined}>
                  {s.label}
                </button>
              ))
            )}
          </div>

          <span style={{ fontFamily: MONO, fontSize: 10, color: '#9a9aa8', whiteSpace: 'nowrap' }}>
            SPACE play/pause · R restart · H record mode · ESC exit
          </span>

          <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
            <button type="button" onClick={act(play)} disabled={!scene || playing} style={ctrl('primary', !scene || playing)}>
              ▶ Play
            </button>
            {timed && (
              <button type="button" onClick={act(pause)} disabled={!playing} style={ctrl('plain', !playing)}>
                ❚❚ Pause
              </button>
            )}
            <button type="button" onClick={act(restart)} disabled={!scene} style={ctrl('plain', !scene)}>
              ↻ Restart
            </button>
            <button type="button" onClick={act(() => setRecording(true))} style={ctrl('plain')}>
              <span style={{ color: '#e03131' }}>●</span> Recording mode
            </button>
          </div>
        </div>
      )}

      {/* Stage — fills all remaining space */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {SceneComponent && scene ? (
          <SceneBoundary key={`${scene.id}-${runId}`} label={scene.label}>
            <Suspense fallback={null}>
              <SceneComponent playing={playing} recording={recording} />
            </Suspense>
          </SceneBoundary>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ maxWidth: 560, padding: '28px 20px', textAlign: 'center', border: `1.5px dashed ${LINE}`, borderRadius: 14, background: '#fafafa', color: MUTED }}>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>No scenes yet</div>
              <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                Register a scene in <code>vslRegistry.tsx</code>.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
