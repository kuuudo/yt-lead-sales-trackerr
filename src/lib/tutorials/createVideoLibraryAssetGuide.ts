// src/lib/tutorials/createVideoLibraryAssetGuide.ts
//
// Content only — copy, step order, targets. No rendering logic lives here
// (see TutorialRunner.tsx). PATH 2 of "Create Your First Asset."
//
// UPDATED: now targets the "+ Asset" button in the Videos.tsx LIST
// (the real, already-existing per-row button, condition:
// v.status === 'no_data' && v.asset_id && !libraryStatus.get(v.asset_id))
// instead of the "Add to Asset Library" button on VideoDetail.tsx. Same
// underlying rule either way — a video needs a real tracking link
// (asset_id) and must not already be in the library — so no VideoDetail.tsx
// spot is used anymore.
//
// This version is SIMPLER than the old one: no dynamic route lookup is
// needed. The button only renders when an eligible video exists, so we
// just send the user to the static '/videos' page and target the real
// button directly. If no eligible video exists, the button simply won't
// be on the page — the runner's normal wait-then-fallback behavior
// handles that (see fallbackNote + ctaLinks below), same idea as before,
// just without a custom resolver function.
//
// IMPORTANT PREREQUISITE (unchanged): a user with zero tracked videos
// still cannot complete this path. fallbackNote + the "Track Your First
// Content" ctaLinks handoff below cover that case.
//
// New selector needed (see edit notes given separately):
//   videos-add-to-library — the real "+ Asset" button in the Videos.tsx list row

import type { Tutorial } from '../tutorialTypes';
import { trackFirstContentGuide } from './trackFirstContentGuide';

export const createVideoLibraryAssetGuide: Tutorial = {
  id: 'create-video-library-asset',
  mode: 'follow-along',
  steps: [
    {
      id: 'add-to-library',
      title: 'Click + Asset',
      body:
        'Find a tracked video in your list and click **+ Asset** next to it. This turns it into a reusable, shareable Asset.',
      tag: 'try-it',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-add-to-library"]',
      requireAction: { eventKey: 'follow-along-video-added-to-library' },
      fallbackNote:
        'Before you can create a Video Library Asset, you need to track a video first.',
      ctaLinks: [
        {
          emoji: '\ud83c\udfac',
          title: 'Track Your First Content',
          description: 'Track a video so you have one ready to turn into an Asset.',
          startTutorial: trackFirstContentGuide,
        },
      ],
    },
    {
      id: 'complete',
      title: 'You created your first Video Library Asset! \ud83c\udf89',
      body: 'It\u2019s now in your Asset Library, ready to share, assign, or track.',
    },
  ],
};