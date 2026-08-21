// src/lib/tutorials/workWithYourTeamGuide.ts
//
// Content only — copy, step order, targets. No rendering logic lives
// here (see TutorialRunner.tsx). Mirrors trackFirstContentGuide.ts's
// mode: 'follow-along' structure — real actions gated on real success
// callbacks (notify()), not on clicks.
//
// This is the Operator "Work With Your Team" guide. Scope is
// intentionally the MVP only: Operator -> add existing user (POC:
// alinospam2020@gmail.com) -> View Account -> Read-Only explainer.
// Do NOT add more steps (permissions, removal, assignment collaborators,
// etc.) without a new planning pass — see the product notes this guide
// was built from.

import type { Tutorial } from '../tutorialTypes';

const ALIN_POC_EMAIL = 'alinospam2020@gmail.com';

export const workWithYourTeamGuide: Tutorial = {
  id: 'work-with-your-team',
  mode: 'follow-along',
  steps: [
    {
      id: 'invite-member-intro',
      title: 'Work With Your Team',
      body:
        'Invite teammates to your workspace and manage them as Operators.\n\nFor this demo, click **+ Invite Member** below to get started.',
      tag: 'try-it',
      route: '/operator',
      targetSelector: '[data-tutorial-id="operator-invite-member"]',
      fallbackNote:
        'Look for the **+ Invite Member** button near the top of your Operator page.',
    },
    {
      id: 'enter-alin-email',
      title: 'Add a teammate',
      body:
        `You can add any existing account here. For this demo, enter:\n\n**${ALIN_POC_EMAIL}**\n\nWe use this account so you can safely see how Operator viewing works.`,
      tag: 'try-it',
      route: '/operator/members/invite',
      targetSelector: '[data-tutorial-id="invite-member-email-input"]',
      fallbackNote: `Enter ${ALIN_POC_EMAIL} in the email field.`,
    },
    {
      id: 'create-invitation',
      title: 'Add them as an Operator Member',
      body:
        'Click **Create Invitation** to add them instantly \u2014 no acceptance needed for this account.',
      tag: 'try-it',
      route: '/operator/members/invite',
      targetSelector: '[data-tutorial-id="invite-member-submit-button"]',
      requireAction: { eventKey: 'operator-alin-added' },
      fallbackNote:
        'Enter the email above first, then look for the Create Invitation button.',
    },
    {
      id: 'view-alin-account',
      title: 'View their account',
      body:
        'Alin now appears as an Operator Member. Find her in the list and click **View Account** to see her account from an Operator\u2019s perspective.',
      tag: 'try-it',
      route: '/operator',
      targetSelector: '[data-tutorial-id="operator-view-account-alin"]',
      requireAction: { eventKey: 'operator-alin-viewing-entered' },
      fallbackNote:
        'Look for Alin (POC) in your Members list, then click View Account next to her name.',
    },
    {
      id: 'read-only-explainer',
      title: 'You\u2019re in Read-Only mode',
      body:
        'You\u2019re now viewing another user\u2019s account in Read-Only mode. You can explore their data, but you can\u2019t make changes.',
      route: '/dashboard',
    },
  ],
};