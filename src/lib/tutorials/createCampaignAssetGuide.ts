// src/lib/tutorials/createCampaignAssetGuide.ts
//
// Content only — copy, step order, targets. No rendering logic lives here
// (see TutorialRunner.tsx). PATH 1 of "Create Your First Asset."
//
// Real workflow (confirmed from CampaignDetail.tsx + PublishAssetButton.tsx):
//   1. Land on the user's most recent campaign (dynamic route — same
//      resolveMostRecentCampaignRoute pattern already used by
//      assetsTutorial.ts's 'campaign-element' step, copied here so this
//      file doesn't depend on editing assetsTutorial.ts).
//   2. Make sure the Landing Page URL field has a value — the
//      "Publish as Asset" button is disabled (currentUrl) until it does.
//   3. Click "Publish as Asset" — opens PublishAssetButton's own modal.
//   4. Click "Create Asset" inside that modal.
//
// Only ONE real milestone is gated: the asset actually being created
// (fires from CampaignDetail.tsx's onPublished callback, see edit notes).
// "Open the modal" is left as a plain instructional step (Next click)
// instead of a detected event — PublishAssetButton.tsx is a shared/
// generic component reused for 4 different fields on this page, so
// keeping the real notify() call in CampaignDetail.tsx (page-specific)
// avoids adding tutorial-specific logic into a generic component.
//
// New selectors needed (see edit notes given separately):
//   campaign-landing-page-url-input          — the real Landing Page URL <input>
//   campaign-publish-landing_page_url         — the real "Publish as Asset" button (landing page instance)
//   campaign-publish-submit-landing_page_url  — the real "Create Asset" button inside the modal

import { supabase } from '../supabase';
import type { Tutorial } from '../tutorialTypes';

// Same query as assetsTutorial.ts's resolveMostRecentCampaignRoute.
// Duplicated on purpose (not imported) so this guide has zero dependency
// on assetsTutorial.ts and never risks touching Interactive Tour behavior.
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

export const createCampaignAssetGuide: Tutorial = {
  id: 'create-campaign-asset',
  mode: 'follow-along',
  steps: [
    {
      id: 'open-campaign',
      title: 'Open your campaign',
      body:
        'Let\u2019s turn part of a campaign into an Asset. Here\u2019s your most recent campaign.',
      resolveRoute: resolveMostRecentCampaignRoute,
      fallbackNote:
        'You don\u2019t have a campaign yet \u2014 create one first, then come back to this guide.',
    },
    {
      id: 'enter-url',
      title: 'Make sure your Landing Page URL is filled in',
      body:
        'The **Publish as Asset** button only turns on once there\u2019s a URL here. Paste your Landing Page URL if it\u2019s empty.',
      targetSelector: '[data-tutorial-id="campaign-landing-page-url-input"]',
      fallbackNote: 'Scroll to the Landing Page URL field on this page.',
    },
    {
      id: 'open-publish',
      title: 'Click Publish as Asset',
      body: 'This opens a small form where you\u2019ll name your new Asset.',
      targetSelector: '[data-tutorial-id="campaign-publish-landing_page_url"]',
      fallbackNote:
        'Fill in the Landing Page URL above first \u2014 the button turns on once there\u2019s a link.',
    },
    {
      id: 'create-asset',
      title: 'Click Create Asset',
      body:
        'You can leave the Asset Name as-is, or change it. Click **Create Asset** to finish.',
      tag: 'try-it',
      targetSelector: '[data-tutorial-id="campaign-publish-submit-landing_page_url"]',
      requireAction: { eventKey: 'create-campaign-asset-created' },
      fallbackNote:
        'Click **Publish as Asset** above first \u2014 the Create Asset button appears once the form opens.',
    },
    {
      id: 'complete',
      title: 'You created your first Asset! \ud83c\udf89',
      body:
        'This Asset now carries your Landing Page\u2019s tracking and attribution. You can share or assign it any time from your Asset Library.',
    },
  ],
};
