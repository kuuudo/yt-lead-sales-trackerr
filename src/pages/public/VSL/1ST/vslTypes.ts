// ─────────────────────────────────────────────────────────────────────────
// pages/public/VSL/1ST/vslTypes.ts
// ─────────────────────────────────────────────────────────────────────────
// Shared contract between the VSL player and every scene. Types only.
// ─────────────────────────────────────────────────────────────────────────

import type React from 'react';

/**
 * Props the player passes to every scene.
 *
 * RESET RULE: "Restart" and switching scenes remount the scene component
 * (React `key`). So a scene must keep ALL of its state inside the component
 * (useState / useRef) — never in module-level variables — and then every
 * restart is a guaranteed return to the initial state.
 */
export interface VSLSceneProps {
  /** false = idle (initial state, waiting for Play) or paused. */
  playing: boolean;
  /** true when the control bar is hidden for screen recording. */
  recording: boolean;
}

export type VSLSceneComponent =
  | React.ComponentType<VSLSceneProps>
  | React.LazyExoticComponent<React.ComponentType<VSLSceneProps>>;

export interface VSLSceneDefinition {
  /** Unique, URL-safe. Also used as the #hash so a refresh keeps the scene. */
  id: string;
  /** Text on the selector pill. */
  label: string;
  /**
   * 'timed'       → runs on its own once Play is pressed; Pause is available.
   * 'interactive' → you drive it with the mouse; Pause is hidden.
   */
  kind: 'timed' | 'interactive';
  component: VSLSceneComponent;
}
