// src/lib/tutorials/createVideoLibraryAssetOnboardingGuide.ts
//
// Post-signup variant of createVideoLibraryAssetGuide. Spreads the original and
// replaces only its first step:
//   - the "Track Your First Content" button is removed (onboarding users have just
//     tracked a video, and that button would send them back through the track guide)
//   - the copy says "you just tracked your first link, now turn it into an Asset"
// The last step ("You created your first Video Library Asset!") is unchanged.
//
// Different id on purpose, so the hub's original guide keeps its own saved progress.
// Registered in TUTORIAL_REGISTRY (TutorialRunner.tsx) so it resumes after a refresh.
// Videos.tsx needs no change: the "+ Asset" click reports its event regardless of guide id.

import type { Tutorial } from '../tutorialTypes';
import { createVideoLibraryAssetGuide } from './createVideoLibraryAssetGuide';

export const createVideoLibraryAssetOnboardingGuide: Tutorial = {
  ...createVideoLibraryAssetGuide,
  id: 'onboarding-create-video-library-asset',
  steps: createVideoLibraryAssetGuide.steps.map((step) => {
    if (step.id !== 'add-to-library') return step;
    const { ctaLinks: _ctaLinks, ...rest } = step;
    return {
      ...rest,
      title: 'Now turn it into an Asset',
      body:
        'You just tracked your first link. Now let\u2019s turn that video into an Asset you can reuse, share, or assign.' +
        '\n\nFind your video in the list and click **+ Asset** next to it.',
      fallbackNote:
        'Can\u2019t see **+ Asset**? Look for the video you just tracked in the list below, or refresh the page.',
    };
  }),
};
