// src/lib/tutorials/marketplaceTutorial.ts
//
// Content only — copy, step order, targets. No rendering logic lives
// here (see TutorialRunner.tsx). Mirrors assetsTutorial.ts's structure.
//
// PART 1 ONLY: Create Assignment. Invitation acceptance, Promotion
// Detail, and revoke flows are separate future parts — do not add
// those steps here without a new planning pass.

import type { Tutorial } from '../tutorialTypes';

export const marketplaceTutorial: Tutorial = {
  id: 'marketplace',
  steps: [
    {
      id: 'create-assignment',
      title: 'Create an Assignment',
      body:
        'This is where you create an assignment for someone else to promote your Assets. You decide what they can promote, how their links should be tracked, and who gets access.',
      tag: 'demo',
      route: '/marketplace',
      targetSelector: '[data-tutorial-id="marketplace-create-assignment"]',
      fallbackNote:
        'You\u2019ll find this button on your Marketplace page, above your Assignments.',
    },
    {
      id: 'select-assets',
      title: 'Select Assets',
      body:
        'Choose the Assets you want this collaborator to promote. You can select from your authorized Campaign Assets or add additional Library Assets.\n\n**The Assets you select here become the Assets this collaborator can promote.**',
      tag: 'demo',
      route: '/marketplace/assignments/new',
      targetSelector: '[data-tutorial-id="marketplace-select-assets"]',
    },
    {
      id: 'tracking-domains',
      title: 'Tracking Domains',
      body:
        '**Tracking Domains let your collaborators promote your links using your own domain instead of a VSTRK tracking URL.**\n\nFor example, instead of sharing vstrk.com/token, you can use yourdomain.com/token. Your link stays on your brand while VSTRK continues tracking the activity behind it.\n\nIf you haven\u2019t set up your own custom domain yet, you can [set one up here](/settings/tracking-domains).',
      tag: 'demo',
      route: '/marketplace/assignments/new',
      targetSelector: '[data-tutorial-id="marketplace-tracking-domains"]',
    },
    {
      id: 'invite-collaborators',
      title: 'Invite Collaborators',
      body:
        'You can invite anyone by email \u2014 even if they don\u2019t have a VSTRK account yet.\n\nEnter their email and we\u2019ll generate a special invitation link. They simply open the link and sign in using the same email address. VSTRK takes care of the rest.',
      tag: 'demo',
      route: '/marketplace/assignments/new',
      targetSelector: '[data-tutorial-id="marketplace-invite-collaborators"]',
    },
    {
      id: 'submit',
      title: 'Create the Assignment',
      body:
        'Once everything is ready, create the assignment. Your collaborator will receive an invitation with the Assets and tracking setup you\u2019ve selected.',
      tag: 'demo',
      route: '/marketplace/assignments/new',
      targetSelector: '[data-tutorial-id="marketplace-submit"]',
    },
  ],
};