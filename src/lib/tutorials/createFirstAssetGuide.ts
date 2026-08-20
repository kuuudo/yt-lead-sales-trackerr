// src/lib/tutorials/createFirstAssetGuide.ts
//
// Content only — copy, step order, targets. No rendering logic lives here
// (see TutorialRunner.tsx). This is the PARENT "Create Your First Asset"
// Follow-Along Guide. It has exactly ONE step: a simple choice between
// the three real asset-creation paths.
//
// Each choice hands off immediately using the existing ctaLinks +
// startTutorial mechanism (TutorialRunner.tsx already has this — same
// trick used at the end of assetsTutorial.ts's recap step). Clicking a
// choice calls start(thatTutorial) right away, no extra click needed.
//
// Deliberately NOT one big tutorial with branching steps inside it —
// tutorialTypes.ts has no branching field, and this reuses exactly what
// already exists instead of inventing something new.
//
// Do NOT add real instructions here. This step's only job is the choice.
// All real instructions live in the 3 child guide files.

import type { Tutorial } from '../tutorialTypes';
import { createCampaignAssetGuide } from './createCampaignAssetGuide';
import { createVideoLibraryAssetGuide } from './createVideoLibraryAssetGuide';
import { createImportAssetGuide } from './createImportAssetGuide';

export const createFirstAssetGuide: Tutorial = {
  id: 'create-first-asset',
  mode: 'follow-along',
  steps: [
    {
      id: 'choose-path',
      title: 'Create Your First Asset',
      body:
        'There are three ways to create an Asset. Choose the one you\u2019d like to try \u2014 you can always come back and try the others later.',
      ctaLinks: [
        {
          emoji: '\ud83d\ude80',
          title: 'Create a Campaign Element Asset',
          description: 'Turn a URL from one of your campaigns (like a Landing Page) into an Asset.',
          startTutorial: createCampaignAssetGuide,
        },
        {
          emoji: '\ud83c\udfa5',
          title: 'Create a Video Library Asset',
          description: 'Turn a video you\u2019ve already tracked into a reusable Asset.',
          startTutorial: createVideoLibraryAssetGuide,
        },
        {
          emoji: '\ud83d\udd17',
          title: 'Import an Asset',
          description: 'Paste any link directly into your Asset Library.',
          startTutorial: createImportAssetGuide,
        },
      ],
    },
  ],
};
