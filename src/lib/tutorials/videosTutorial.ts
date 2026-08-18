// src/lib/tutorials/videosTutorial.ts
//
// Content only — copy, step order, targets. No rendering logic lives
// here (see TutorialRunner.tsx). Mirrors assetsTutorial.ts's and
// marketplaceTutorial.ts's structure.
//
// PART 1 ONLY: Track New Content. Video Detail / Redirect Links is a
// separate future part — do not add those steps here without a new
// planning pass.
//
// All steps live on the same route ('/videos') — Track New Content is
// a same-page toggle, not a separate route like Marketplace's
// Create Assignment flow. Steps 2-9 target elements that only render
// once the user has clicked "Track New Content" to open the form; this
// is intentionally left as a plain 'demo' step (no requireAction) so
// the tour never forces a click. If the form isn't open yet, the
// runner's existing targetSelector timeout + fallbackNote already
// handles that gracefully — no TutorialRunner changes needed.

import type { Tutorial } from '../tutorialTypes';

export const videosTutorial: Tutorial = {
  id: 'videos',
  steps: [
    {
      id: 'track-new-content',
      title: 'Track New Content',
      body:
        'This is where you bring new content into VSTRK and turn it into a trackable link.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-track-new"]',
      fallbackNote:
        'You\u2019ll find this button at the top of your Videos page.',
    },
    {
      id: 'platform-url',
      title: 'Platform + URL',
      body:
        'VSTRK supports all 9 platforms: YouTube, TikTok, Instagram, LinkedIn, X, Threads, Facebook, Reddit, and Twitch.\n\nSimply select the platform and paste the content URL.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-platform-url"]',
      fallbackNote:
        'Click **Track New Content** above to see the Platform and URL fields.',
    },
    {
      id: 'campaign',
      title: 'Campaign',
      body:
        'Make sure the correct Campaign is selected before generating the tracking link.\n\nIf you haven\u2019t created and configured your Campaign yet, go to [Campaigns](/campaigns) first.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-campaign"]',
      fallbackNote:
        'Click **Track New Content** above to see the Campaign field.',
    },
    {
      id: 'objectives',
      title: 'Goals / Objectives',
      body:
        'These tell VSTRK what objective this content is associated with \u2014 Direct Sales, Newsletter Growth, Sales Call Booking, Paid Consultation, or Awareness / Viral.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-objectives"]',
      fallbackNote:
        'Click **Track New Content** above to see Goals / Objectives.',
    },
    {
      id: 'lead-magnet',
      title: 'Lead Magnet',
      body:
        'If this Campaign uses a Lead Magnet, check this box and select the appropriate one.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-lead-magnet"]',
      fallbackNote:
        'Click **Track New Content** above to see the Lead Magnet option.',
    },
    {
      id: 'tracking-type',
      title: 'Tracking Type',
      body:
        '**Asset + Campaign Objective** tracks the content as an Asset while also connecting it to the Campaign Objective.\n\n**Asset Only** tracks it as an Asset without attaching a Campaign Objective.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-tracking-type"]',
      fallbackNote:
        'Click **Track New Content** above to see Tracking Type.',
    },
    {
      id: 'promoted-asset',
      title: 'Promoted Asset',
      body:
        'You can optionally connect an existing Asset to this content. If someone has assigned an Asset to you through Marketplace, you can select it here too.\n\nNew to Assets? The Asset tutorial (via the fox button on your Assets page) walks through creating and receiving them.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-promoted-asset"]',
      fallbackNote:
        'Click **Track New Content** above to see Promoted Asset.',
    },
    {
      id: 'tracking-domain',
      title: 'Tracking Domain',
      body:
        'If you haven\u2019t configured a custom tracking domain, your generated link will use vstrk.com/token.\n\nWant yourdomain.com/token instead? [Set up a tracking domain](/settings/tracking-domains).',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-tracking-domain"]',
      fallbackNote:
        'Click **Track New Content** above to see Tracking Domain.',
    },
    {
      id: 'generate',
      title: 'Generate Tracking Link',
      body:
        'Once everything is configured, generate the tracking link. This is the link you\u2019ll actually use when promoting this piece of content.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-generate"]',
      fallbackNote:
        'Click **Track New Content** above to see the Generate button.',
    },
  ],
};
