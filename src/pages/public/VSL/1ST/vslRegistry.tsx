// ─────────────────────────────────────────────────────────────────────────
// pages/public/VSL/1ST/vslRegistry.tsx
// ─────────────────────────────────────────────────────────────────────────
// Central list of VSL scenes. One entry = one pill in the player.
//
// To add a scene:
//   1. Create scenes/MyScene.tsx with a default export (see PlayerCheck.tsx).
//   2. Add one line below.
//
// Scenes are loaded with lazy() so each one is its own chunk: a scene that
// has a runtime error cannot break the player or the other scenes.
// ─────────────────────────────────────────────────────────────────────────

import { lazy } from 'react';
import type { VSLSceneDefinition } from './vslTypes';

export const VSL_SCENES: VSLSceneDefinition[] = [
  // 38 s intro: content → click → website → outcomes → revenue
  { id: 'uni1', label: 'uni1', kind: 'timed', component: lazy(() => import('./scenes/universalvsl1')) },

  // 10 s: custom tracking domain (shop.yourdomain.com)
  { id: 'domain', label: 'domain', kind: 'timed', component: lazy(() => import('./scenes/trackingdomainvsl')) },

  // 10 s: the two options (promote your own product / work with others)
  { id: 'two-options', label: 'two options', kind: 'timed', component: lazy(() => import('./scenes/twooptions')) },

  // 10 s: the nine supported platforms
  { id: '9platform', label: '9platform', kind: 'timed', component: lazy(() => import('./scenes/9platforms')) },

  // Diagnostic scene to verify Play / Pause / Restart / Recording mode.
  // Delete this line (and scenes/PlayerCheck.tsx) when you no longer need it.
  { id: 'player-check', label: 'Player Check', kind: 'timed', component: lazy(() => import('./scenes/PlayerCheck')) },

  // { id: 'my-scene', label: 'My Scene', kind: 'timed', component: lazy(() => import('./scenes/MyScene')) },
];
