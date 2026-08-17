// src/lib/tutorials/assetsTutorial.ts
//
// Content only — copy, step order, targets. No rendering logic lives
// here (see TutorialRunner.tsx). This is the file to edit when the
// wording changes; it should never require touching Assets.tsx,
// CampaignDetail.tsx, or Videos.tsx.

import { supabase } from '../supabase';
import campaignPublishExample from '../../assets/tutorial/campaign-publish-example.png';
import type { Tutorial } from '../tutorialTypes';

// Resolves to the user's most recently created campaign, since Campaign
// Detail is a dynamic route (/campaigns/:id) and the tutorial has no
// specific campaign to point to otherwise. Returns null if the org has
// no campaigns yet — TutorialRunner falls back to fallbackNote instead
// of navigating anywhere.

async function resolveMostRecentCampaignRoute(): Promise<string | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return `/campaigns/${data.id}`;
}

export const assetsTutorial: Tutorial = {
  id: 'assets',
  steps: [
    {
      id: 'intro',
      title: 'What is an asset?',
      body:
        "An asset is more than a link. It's a piece of your content or funnel that VSTRK can track, share, and use in collaborations and promotions.",
      route: '/assets',
    },
    {
      id: 'three-ways',
      title: 'Three ways to create one',
      body:
        'You can publish a campaign element, turn a video into an asset, or import a link directly. Let\u2019s look at each.',
      route: '/assets',
    },
    {
      id: 'campaign-element',
      title: 'Campaign elements can become assets',
      body:
        'Landing Page URL, Newsletter Signup URL, Sales Call Booking Page URL, Consultation Booking Page URL \u2014 they can all turn into an Asset. Just press **Publish as Asset**.\n\nThis is a medium-sized piece of your funnel. It goes beyond the link itself by carrying the connected thank-you page, attribution, and revenue tracking. That means when you share or assign this Asset to someone else, VSTRK can continue tracking their journey and the revenue it generates.',
      tag: 'demo',
      resolveRoute: resolveMostRecentCampaignRoute,
      targetSelector: '[data-tutorial-id^="campaign-publish-"]',
      fallbackNote:
        "You don't have a campaign yet \u2014 once you create one, its elements can become assets like this.",
      previewImage: {
        src: campaignPublishExample,
        alt: 'The Publish as Asset action on a campaign element',
      },
    },
    {
      id: 'video-asset',
      title: 'Turn your video into an asset',
      body:
        'Your video can carry the journey connected to it \u2014 so it\u2019s more than just content.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-add-to-library"]',
      fallbackNote:
        "None of your videos are ready for this right now, but the same action shows up here once one is.",
    },
    {
      id: 'import-asset',
      title: 'Now try it yourself',
      body: 'Import a link to create your first asset.',
      tag: 'try-it',
      route: '/assets',
      targetSelector: '[data-tutorial-id="assets-import"]',
      requireAction: { eventKey: 'assets-import-success' },
    },
    {
      id: 'recap',
      title: "You're ready to use assets",
      body:
        'Campaign elements carry setup, videos carry journey context, imports are the simplest link \u2014 all three land in one library.',
      route: '/assets',
    },
  ],
};