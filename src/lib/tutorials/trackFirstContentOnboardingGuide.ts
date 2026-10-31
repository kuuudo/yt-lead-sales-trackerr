// src/lib/tutorials/trackFirstContentOnboardingGuide.ts
//
// Post-signup variant of trackFirstContentGuide. It is NOT a copy: it spreads
// the original and replaces only three steps, so the other seven steps stay a
// single source of truth.
//
//   platform-url              -> tells the person which example URL to paste
//   configure-campaign-links  -> info only (no "click Setup" action needed)
//   complete                  -> introduces the Asset step that comes next
//
// The id differs from the original on purpose, so the original guide in the
// Get Started hub keeps its own saved progress. This guide must be registered
// in TUTORIAL_REGISTRY (TutorialRunner.tsx) so it resumes after a refresh.

import type { Tutorial, TutorialStep } from '../tutorialTypes';
import { trackFirstContentGuide } from './trackFirstContentGuide';

export const ONBOARDING_EXAMPLE_VIDEO_URL = 'https://youtu.be/Gh8G2uZu9O4';

function override(step: TutorialStep): TutorialStep {
  switch (step.id) {
    case 'platform-url':
      return {
        ...step,
        title: 'Paste this example video URL',
        body:
          `Paste this YouTube link into the URL field:\n\n**${ONBOARDING_EXAMPLE_VIDEO_URL}**\n\n` +
          'It\u2019s just a sample so you can see how tracking works. You can track your own content any time.',
      };
    case 'configure-campaign-links': {
      // Info only: drop the "click Setup and close the window" requirement.
      const { requireAction: _requireAction, tag: _tag, ...rest } = step;
      return {
        ...rest,
        title: 'Your tracking links',
        body:
          'Right now your tracking links look like **vstrk.com/token**. If you\u2019d rather use ' +
          'go.yourdomain.com/token, you can set up a custom domain later. ' +
          'This is just a tour, so let\u2019s keep moving.',
      };
    }
    case 'complete':
      return {
        ...step,
        title: 'You tracked your first content! \ud83c\udf89',
        body:
          'VSTRK has three ways to create Assets. We\u2019ll try the easiest one now: turning the video ' +
          'you just tracked into a reusable Asset.\n\nClick **Done** and we\u2019ll show you how.',
      };
    default:
      return step;
  }
}

export const trackFirstContentOnboardingGuide: Tutorial = {
  ...trackFirstContentGuide,
  id: 'onboarding-track-first-content',
  steps: trackFirstContentGuide.steps.map(override),
};
