// src/lib/tutorials/trackFirstContentGuide.ts
//
// Content only — copy, step order, targets. No rendering logic lives here
// (see TutorialRunner.tsx). Mirrors videosTutorial.ts's structure exactly,
// including reusing 4 of its exact data-tutorial-id selectors, but this is
// a SEPARATE tutorial object (`mode: 'follow-along'`) — videosTutorial.ts
// is intentionally left untouched.
//
// This is the FIRST and, for now, ONLY Follow-Along Guide. Do not add
// Create Your First Asset / Start Your First Collab / Work With Your Team
// here — those are separate future guides using this same pattern.
//
// Reused selectors (already real, already tagged, no DOM changes needed):
//   videos-track-new, videos-platform-url, videos-campaign, videos-generate
// New selectors added in Videos.tsx for this guide only:
//   videos-save-to-list      — the real "Save To My List" button
//   videos-saved-modal-copy  — the real Copy button in the "🎉 Video Saved!" modal
//
// Milestone detection (see the 3 new useEffects in Videos.tsx) is
// deliberately limited to 3 real events — form opened, Generate succeeded,
// Save succeeded — matching the locked decision not to force validation on
// every field. Platform/URL and Campaign stay plain instructional steps,
// advanced with a normal Next click, exactly like the existing Interactive
// Tour.
//
// IMPORTANT: Generate alone does NOT produce a real, savable link —
// handleGenerate() in Videos.tsx only builds a local preview with a
// placeholder link string. The real token-backed redirect link only exists
// after Save succeeds and the "Video Saved" modal opens. This guide's copy
// step is gated on that modal, never on Generate, so it never tells the
// user to copy a placeholder.

import type { Tutorial } from '../tutorialTypes';

export const trackFirstContentGuide: Tutorial = {
  id: 'track-first-content',
  mode: 'follow-along',
  steps: [
    {
      id: 'open-form',
      title: 'Click + Track New Content',
      body:
        'Let\u2019s track your first piece of content. Click the button below to open the form.',
      tag: 'try-it',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-track-new"]',
      requireAction: { eventKey: 'follow-along-form-opened' },
      fallbackNote:
        'You\u2019ll find this button at the top of your Videos page.',
    },
    {
      id: 'platform-url',
      title: 'Choose your platform and paste the URL',
      body:
        'Select the platform your content is on, then paste the content URL. VSTRK will usually detect the platform automatically once you paste a link.',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-platform-url"]',
      fallbackNote:
        'Click **Track New Content** above to see the Platform and URL fields.',
    },
    {
      id: 'campaign',
      title: 'Select your Campaign',
      body:
        'Choose which Campaign this content belongs to \u2014 this connects your tracking link to the right funnel.',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-campaign"]',
      fallbackNote:
        'Click **Track New Content** above to see the Campaign field.',
    },
    {
      id: 'generate',
      title: 'Click Generate',
      body:
        'Once your URL and Campaign are set, generate your tracking link. This creates a preview \u2014 you\u2019ll save it in the next step.',
      tag: 'try-it',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-generate"]',
      requireAction: { eventKey: 'follow-along-generated' },
      fallbackNote:
        'Fill in the URL and Campaign above, then look for the Generate button.',
    },
    {
      id: 'save',
      title: 'Click Save To My List',
      body:
        'Generating only built a preview \u2014 **Save To My List** is what actually creates your real, trackable link.',
      tag: 'try-it',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-save-to-list"]',
      requireAction: { eventKey: 'follow-along-saved' },
      fallbackNote:
        'Click **Generate** above first \u2014 the Save button appears once your preview is ready.',
    },
    {
      id: 'copy-link',
      title: 'Copy your real tracking link',
      body:
        'This is your real, live tracking link. Click the copy icon to copy it.',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-saved-modal-copy"]',
      fallbackNote:
        'Your saved link will appear here once Save finishes.',
    },
    {
      id: 'where-to-use',
      title: 'Use it anywhere you promote this content',
      body:
        'Paste this link wherever you\u2019d normally share this content \u2014 your social post, video description, bio, or email. VSTRK tracks everything that happens after someone clicks it.',
      route: '/videos',
    },
    {
      id: 'complete',
      title: 'You tracked your first content! \ud83c\udf89',
      body:
        'That\u2019s the whole flow \u2014 you can repeat it any time you have new content to track.',
      route: '/videos',
    },
  ],
};
