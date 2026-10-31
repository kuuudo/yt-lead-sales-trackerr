// src/lib/tutorials/getStartedTour.ts
//
// "Get Started Tour": the short follow-up that runs AFTER the main onboarding
// (Campaign -> Track -> Asset -> Collab). It is NOT an onboarding stage: it has no
// data check, no Continue-setup button and is never derived by onboardingProgress.ts.
// It is started by the "Continue to Setup" button (OnboardingGate), or for testing
// by opening any page with ?tour=get-started.
//
// Content only. Three cards on /settings/getting-started, each spotlighting the real card via the
// data-tutorial-id attributes in pages/GettingStarted.tsx (that page also scrolls the card into view).
// Also reopened by the "Show Guide" button on the Setup card there.
// Body markup supported by TutorialRunner: **bold** and [link](/path); paragraphs split by a blank line.

import type { Tutorial } from '../tutorialTypes';
import { workWithYourTeamGuide } from './workWithYourTeamGuide';

export const GET_STARTED_TOUR_ID = 'get-started-tour';

export const getStartedTour: Tutorial = {
  id: GET_STARTED_TOUR_ID,
  mode: 'follow-along',
  minimizable: true,
  steps: [
    {
      id: 'complete-setup',
      title: 'Step 1 \u00b7 Complete Your Setup',
      body:
        '**Required.** Install and configure your tracking setup, including your tracking Pixel, so VSTRK can track revenue, newsletter signups, sales calls and consultations.\n\nPress **Setup** on this card to begin.',
      route: '/settings/getting-started',
      targetSelector: '[data-tutorial-id="getting-started-setup"]',
      fallbackNote: 'Look for the Setup card on the Get Started page.',
    },
    {
      id: 'tracking-domain',
      title: 'Step 2 \u00b7 Set Up Your Tracking Domain',
      body:
        '**Recommended.** Use your own branded tracking links.\n\nFor example **go.yourdomain.com/token** instead of vstrk.com/token.',
      route: '/settings/getting-started',
      targetSelector: '[data-tutorial-id="getting-started-tracking-domain"]',
      fallbackNote: 'Look for "Set Up Your Tracking Domain" on the Get Started page.',
      ctaLinks: [
        {
          emoji: '\ud83c\udf10',
          title: 'Set Up Your Tracking Domain',
          description: 'Connect your own domain so your tracking links use your brand.',
          href: '/settings/tracking-domains',
        },
      ],
    },
    {
      id: 'explore-vstrk',
      title: 'Step 3 \u00b7 Explore VSTRK',
      body:
        '**Optional.** Discover what\u2019s possible with VSTRK.\n\nSee real examples of cross-platform marketing campaigns, customer journeys, and conversion and revenue tracking in the founder\u2019s account.',
      route: '/settings/getting-started',
      targetSelector: '[data-tutorial-id="getting-started-explore"]',
      fallbackNote: 'Look for "Get to Know VSTRK" at the bottom of the Get Started page.',
      ctaLinks: [
        {
          emoji: '\ud83d\udc41\ufe0f',
          title: 'Explore VSTRK',
          description: 'View the founder\u2019s account without switching your own.',
          startTutorial: workWithYourTeamGuide,
        },
      ],
    },
  ],
};
