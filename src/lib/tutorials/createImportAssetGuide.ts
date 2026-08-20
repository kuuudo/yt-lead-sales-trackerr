// src/lib/tutorials/createImportAssetGuide.ts
//
// Content only — copy, step order, targets. No rendering logic lives here
// (see TutorialRunner.tsx). PATH 3 of "Create Your First Asset."
//
// Real workflow (confirmed from Assets.tsx + ImportAssetModal.tsx):
//   1. Click "+ Import Asset" on /assets — opens ImportAssetModal.
//   2. Paste a URL (Asset Name is optional — auto-filled if left blank).
//   3. Click "Import".
//   4. On success, Assets.tsx's onImported callback fires — real gate.
//
// Two real milestones gated, same shape as trackFirstContentGuide.ts:
// modal opened, and import succeeded. Both notify() calls are safe to
// add directly in Assets.tsx because that file is page-specific (unlike
// PublishAssetButton.tsx, it isn't a shared component reused elsewhere).
//
// New selectors needed (see edit notes given separately):
//   assets-import-open      — the real "+ Import Asset" button
//   import-asset-url-input  — the real URL <input> inside the modal
//   import-asset-submit     — the real "Import" button inside the modal

import type { Tutorial } from '../tutorialTypes';

export const createImportAssetGuide: Tutorial = {
  id: 'create-import-asset',
  mode: 'follow-along',
  steps: [
    {
      id: 'open-import',
      title: 'Click + Import Asset',
      body: 'Let\u2019s import a link directly into your Asset Library.',
      tag: 'try-it',
      route: '/assets',
      targetSelector: '[data-tutorial-id="assets-import-open"]',
      requireAction: { eventKey: 'follow-along-import-opened' },
      fallbackNote: 'You\u2019ll find this button at the top of your Asset Library.',
    },
    {
      id: 'paste-url',
      title: 'Paste your link',
      body:
        'Paste any URL \u2014 a document, image, page, or almost anything else. Asset Name is optional; leave it blank and we\u2019ll fill it in for you.',
      route: '/assets',
      targetSelector: '[data-tutorial-id="import-asset-url-input"]',
      fallbackNote: 'Click **+ Import Asset** above to see the URL field.',
    },
    {
      id: 'import',
      title: 'Click Import',
      body: 'This creates your real, trackable Asset.',
      tag: 'try-it',
      route: '/assets',
      targetSelector: '[data-tutorial-id="import-asset-submit"]',
      requireAction: { eventKey: 'follow-along-import-created' },
      fallbackNote: 'Paste a link above first \u2014 the Import button turns on once there\u2019s a URL.',
    },
    {
      id: 'complete',
      title: 'You imported your first Asset! \ud83c\udf89',
      body: 'It\u2019s now in your Asset Library, ready to share, assign, or track.',
      route: '/assets',
    },
  ],
};
