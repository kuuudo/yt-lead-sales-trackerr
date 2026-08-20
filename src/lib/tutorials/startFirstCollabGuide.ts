// src/lib/tutorials/startFirstCollabGuide.ts
//
// Content only — copy, step order, targets. No rendering logic lives
// here (see TutorialRunner.tsx). Mirrors trackFirstContentGuide.ts /
// createFirstAssetGuide.ts's structure and philosophy.
//
// LOCKED PRODUCT DECISION: the user invites THEMSELVES for this guide,
// so they experience the full collaborator workflow once before ever
// inviting a real person. See planning discussion — do not redesign
// this around waiting for a second person to accept.
//
// Verified against real code (not assumed):
//   - Self-invitation is not blocked anywhere in createAssignment.ts,
//     inviteCollaborator.ts, or CreateAssignment.tsx's email field.
//   - "Shared Assets" (Assets.tsx ownershipFilter === 'shared') only
//     populates once a Promotion exists (promotion_assets row) — NOT
//     merely from accepting an invitation. Step order below reflects
//     this: Accept -> Select -> Start Promoting -> THEN Shared Assets.
//   - The Promoted Asset field's per-asset "Shared Domains" selector on
//     Videos.tsx is a SEPARATE UI element from the general
//     `videos-tracking-domain` field. This guide points at the new
//     `videos-asset-shared-domain` selector, never at
//     `videos-tracking-domain`.
//   - "Generate" is preview-only; "Save" is what actually creates the
//     video + redirect links. Mirrors trackFirstContentGuide exactly.
//
// Does NOT touch, replace, or duplicate the existing Interactive Tour
// (marketplaceTutorial.ts / promotionTutorial.ts / videosTutorial.ts).

import type { Tutorial } from '../tutorialTypes';

export const startFirstCollabGuide: Tutorial = {
  id: 'start-first-collab',
  steps: [
    {
      id: 'go-to-collab',
      title: 'Go to Collab',
      body:
        'Let\u2019s walk through the entire Collab workflow together \u2014 you\u2019ll invite yourself, accept your own invitation, and promote an Asset, so you know exactly what a real collaborator will experience.',
      tag: 'demo',
      route: '/marketplace',
      targetSelector: '[data-tutorial-id="marketplace-create-assignment"]',
      fallbackNote: 'You\u2019ll find this button on your Marketplace page.',
    },
    {
      id: 'create-assignment',
      title: 'Create an Assignment',
      body:
        'Give it a title and select at least one Asset \u2014 this is what your collaborator (you!) will be promoting.',
      tag: 'demo',
      route: '/marketplace/assignments/new',
      targetSelector: '[data-tutorial-id="marketplace-select-assets"]',
    },
    {
      id: 'invite-yourself',
      title: 'Invite Yourself',
      body:
        'Type in **your own email address** here \u2014 the same one you\u2019re signed in with.\n\nYou\u2019re about to experience both sides of this workflow: the Sponsor who assigns, and the Collaborator who promotes.',
      tag: 'demo',
      route: '/marketplace/assignments/new',
      targetSelector: '[data-tutorial-id="marketplace-invite-collaborators"]',
    },
    {
      id: 'submit-assignment',
      title: 'Create the Assignment',
      body:
        'Once you submit, you\u2019ll be invited to your own Assignment \u2014 just like a real collaborator would be.',
      tag: 'try-it',
      route: '/marketplace/assignments/new',
      targetSelector: '[data-tutorial-id="marketplace-submit"]',
      requireAction: { eventKey: 'collab-assignment-created' },
    },
    {
      id: 'accept-invitation',
      title: 'Accept Your Invitation',
      body:
        'This is what your collaborator will see the moment they open your invitation. Go ahead and accept it.',
      tag: 'try-it',
      targetSelector: '[data-tutorial-id="assignment-accept-invitation"]',
      fallbackNote: 'If you don\u2019t see this yet, the page may still be loading your invitation.',
      requireAction: { eventKey: 'collab-invitation-accepted' },
    },
    {
      id: 'select-asset',
      title: 'Select the Asset to Promote',
      body:
        'These are the Assets available to you through this Assignment. Choose the one you added earlier.',
      tag: 'demo',
      targetSelector: '[data-tutorial-id="assignment-select-assets"]',
    },
    {
      id: 'start-promoting',
      title: 'Start Promoting',
      body:
        'This is the real moment a Promotion gets created. Once you press this, you officially become a collaborator promoting this Asset \u2014 for real.',
      tag: 'try-it',
      targetSelector: '[data-tutorial-id="assignment-start-promoting"]',
      requireAction: { eventKey: 'collab-promotion-started' },
    },
    {
      id: 'shared-assets-explain',
      title: 'Your Asset is now in Shared Assets',
      body:
        'Your assigned Asset is now available in Shared Assets.\n\nWhen you\u2019re assigned an Asset for promotion, you\u2019ll find it here \u2014 separate from your own Assets.',
      tag: 'demo',
      route: '/assets',
      targetSelector: '[data-tutorial-id="assets-shared-filter"]',
      fallbackNote: 'Look for the **Shared** filter above your Asset list.',
    },
    {
      id: 'go-to-videos',
      title: 'Go to Videos',
      body:
        'Now let\u2019s actually promote it. Head to your Videos page \u2014 this is where you turn content into a trackable link for the Asset you were just assigned.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-track-new"]',
    },
    {
      id: 'track-new-content',
      title: 'Track New Content',
      body:
        'Click this to open the form. This is the same flow you\u2019d use for any content \u2014 nothing collab-specific here yet.',
      tag: 'try-it',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-track-new"]',
      requireAction: { eventKey: 'collab-form-opened' },
    },
    {
      id: 'platform-url',
      title: 'Platform + URL',
      body: 'Pick the platform and paste the content URL, same as always.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-platform-url"]',
      fallbackNote: 'Click **Track New Content** above to see this field.',
    },
    {
      id: 'campaign',
      title: 'Campaign',
      body: 'Select a Campaign \u2014 this needs to be set before you can choose a Promoted Asset below.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-campaign"]',
      fallbackNote: 'Click **Track New Content** above to see this field.',
    },
    {
      id: 'objectives',
      title: 'Goals / Objectives',
      body: 'Set the objective for this content, same as normal.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-objectives"]',
      fallbackNote: 'Click **Track New Content** above to see this field.',
    },
    {
      id: 'select-promoted-asset',
      title: 'Select Your Assigned Asset',
      body:
        'Here\u2019s the Asset you were assigned earlier. This is the actual connection between the Collab workflow and your Video/Redirect link.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-promoted-asset"]',
      fallbackNote: 'Click **Track New Content** above to see this field.',
    },
    {
      id: 'shared-tracking-domain-explain',
      title: 'A shared Tracking Domain may appear here',
      body:
        'Once you select an assigned Asset, a domain may appear here that was shared with you specifically for this Asset \u2014 separate from your own Tracking Domain setting above.\n\nThis lets a Sponsor let you use their domain for links you generate on their behalf.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-asset-shared-domain"]',
      fallbackNote: 'This only appears once an assigned Asset with a shared domain is selected.',
    },
    {
      id: 'generate',
      title: 'Generate',
      body: 'This builds a preview \u2014 nothing is saved yet.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-generate"]',
    },
    {
      id: 'save',
      title: 'Save To My List',
      body: 'This is the real save \u2014 your video and its tracking links get created now.',
      tag: 'try-it',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-save-to-list"]',
      requireAction: { eventKey: 'collab-saved' },
    },
    {
      id: 'copy-link',
      title: 'Copy Your Tracking Link',
      body: 'Here\u2019s your real, working tracking link \u2014 copy it and it\u2019s ready to share.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-saved-modal-copy"]',
    },
    {
      id: 'complete',
      title: 'You\u2019ve completed the full Collab workflow!',
      body:
        'You just experienced everything a real collaborator will see \u2014 the invitation, accepting it, Shared Assets, and generating a tracking link.\n\nYou\u2019re ready to invite a real collaborator with confidence.',
      tag: 'demo',
    },
  ],
};
