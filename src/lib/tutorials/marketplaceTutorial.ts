// src/lib/tutorials/marketplaceTutorial.ts
//
// Content only — copy, step order, targets. No rendering logic lives
// here (see TutorialRunner.tsx). Mirrors assetsTutorial.ts's structure.
//
// PART 1: Create Assignment (steps 1-5).
//
// PART 2A: What happens for the collaborator — invitation, accept,
// select assets, start promoting (steps 6-8). These are DEMO-only,
// screenshot-based (previewImage) steps: the Sponsor taking this
// tutorial cannot see the collaborator's own pending-invitation /
// asset-picker screens from their own account, so there's nothing
// live to spotlight here.
//
// Promotion Detail (live spotlight) and revoke/access-management flows
// are separate future parts (2B, 3) — do not add those steps here
// without a new planning pass.

import type { Tutorial } from '../tutorialTypes';
import invitationMarketplaceExample from '../../assets/tutorial/invitation-marketplace-example.png';
import invitationAcceptExample from '../../assets/tutorial/invitation-accept-example.png';
import startPromotingExample from '../../assets/tutorial/start-promoting-example.png';
import promotionDetailOverview from '../../assets/tutorial/promotion-detail-overview.png';
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
    {
      id: 'collaborator-invitation',
      title: 'Your collaborator receives an invitation',
      body:
        'Your collaborator will first see your invitation here, in their own Marketplace \u2014 under Invitations. They simply open it to see what you\u2019ve assigned to them.',
      tag: 'demo',
      route: '/marketplace',
      previewImage: {
        src: invitationMarketplaceExample,
        alt: 'The Invitations tab in Marketplace showing a pending invitation',
      },
    },
    {
      id: 'collaborator-accept',
      title: 'They open it and accept',
      body:
        'They\u2019ll see the Assignment you sent them, and can simply press **Accept Invitation** to become an active collaborator.\n\nThey don\u2019t need to recreate anything you already set up.',
      tag: 'demo',
      route: '/marketplace',
      previewImage: {
        src: invitationAcceptExample,
        alt: 'The Assignment invitation page with the Accept Invitation button',
      },
    },
    {
      id: 'collaborator-start-promoting',
      title: 'They choose what to promote',
      body:
        'After accepting, they choose which of the assigned Assets they want to promote. Once they\u2019re ready, they press **Start Promoting**.\n\nThat\u2019s when their promotion workspace is created and they can start managing the promotion \u2014 using the Assets and tracking setup you selected. They\u2019re not getting your whole VSTRK account, just access to what you assigned them.',
      tag: 'demo',
      route: '/marketplace',
      previewImage: {
        src: startPromotingExample,
        alt: 'The Select Assets to Promote screen with the Start Promoting button',
      },
    },
    {
      id: 'promotion-detail-intro',
      title: 'Your Promotion Control Center',
      body:
        'This is where you can see the Promotion once it\u2019s created \u2014 the collaborator, the Assets they\u2019re promoting, and the access controls you have over both.\n\nLook for the \ud83e\udd8a icon on that page for a deeper tour of everything you can control there.',
      tag: 'demo',
      route: '/marketplace',
      previewImage: {
        src: promotionDetailOverview,
        alt: 'The full Promotion Detail page',
      },
    },
  ],
};