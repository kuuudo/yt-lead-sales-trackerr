// src/lib/tutorials/assetsTutorial.ts
//
// Content only — copy, step order, targets. No rendering logic lives
// here (see TutorialRunner.tsx). This is the file to edit when the
// wording changes; it should never require touching Assets.tsx,
// CampaignDetail.tsx, or Videos.tsx.

import { supabase } from '../supabase';
import campaignPublishExample from '../../assets/tutorial/campaign-publish-example.png';
import videoAssetExample from '../../assets/tutorial/videoasset-publish-example.png';
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
        'You\u2019re now on the Campaign Detail page.\n\nLanding Page URL, Newsletter Signup URL, Sales Call Booking Page URL, Consultation Booking Page URL \u2014 they can all turn into an Asset. Just press **Publish as Asset**.\n\nThis is a medium-sized piece of your funnel. It goes beyond the link itself by carrying the connected thank-you page, attribution, and revenue tracking. That means when you share or assign this Asset to someone else, VSTRK can continue tracking their journey and the revenue it generates.',
      tag: 'demo',
      resolveRoute: resolveMostRecentCampaignRoute,
      targetSelector: '[data-tutorial-id^="campaign-publish-"]',
      previewImage: {
        src: campaignPublishExample,
        alt: 'The Publish as Asset action on a campaign element',
      },
    },
    {
      id: 'video-asset',
      title: 'Turn your video into an asset',
      body:
        'This can be a larger piece of your funnel. When your video is connected to a sales page and thank-you page, the Asset can carry that entire journey \u2014 including video tracking, attribution, and revenue tracking. So when you share or assign it, VSTRK can track the journey from the video all the way to revenue.\n\n**If your video doesn\u2019t have those links connected, that\u2019s okay too \u2014 it can simply be a smaller piece of the funnel, focused on the video itself.**\n\nIf you want to turn content into an asset, just press the +ASSET button.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-add-to-library"]',
      previewImage: {
        src: videoAssetExample,
        alt: 'The +Asset button on a video',
      },
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