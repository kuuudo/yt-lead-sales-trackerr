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
import promotionDetailOverview from '../../assets/tutorial/promotion-detail-overview.png';
import removeCollaboratorExample from '../../assets/tutorial/remove-collaborator-example.png';
import allowCollaboratorDomainsExample from '../../assets/tutorial/allow-collaborator-domains-example.png';
import allowCollaboratorDomainsEnabled from '../../assets/tutorial/allow-collaborator-domains-enabled.png';
import allowCollaboratorDomainsDisabled from '../../assets/tutorial/allow-collaborator-domains-disabled.png';
import addAssetExample from '../../assets/tutorial/add-asset-example.png';
import revokeAssetAccessExample from '../../assets/tutorial/revoke-asset-access-example.png';
import restoreAssetAccessExample from '../../assets/tutorial/restore-asset-access-example.png';
import trackingDomainManagementExample from '../../assets/tutorial/tracking-domain-management-example.png';
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
        'Give it a title and select at least one Asset — this is what your collaborator (you!) will be promoting.\n\nIf you don’t have an Asset yet, create your first one first. Go to **Assets**, click the 🦊 icon, then click **🎓 Create Your First Asset**.',
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
        'Once you submit, you’ll be invited to your own Assignment — just like a real collaborator would be.',
      tag: 'try-it',
      route: '/marketplace/assignments/new',
      targetSelector: '[data-tutorial-id="marketplace-submit"]',
      
    },
    {
      id: 'go-to-invitations-tab',
      title: 'Check Your Invitations',
      body:
        '(No action required in this step)Your invitation will show up right here, in your own Invitations tab — exactly where a real collaborator would see it.',
      tag: 'demo',
      route: '/marketplace',
      targetSelector: '[data-tutorial-id="marketplace-invitations-tab"]',
    },
    {
      id: 'open-your-invitation',
      title: 'Open Your Invitation',
      body: 'Click on the invitation below to open it.',
      tag: 'try-it',
      route: '/marketplace',
      targetSelector: '[data-tutorial-id="marketplace-pending-invitation"]',
      fallbackNote:
        'If nothing appears here yet, give it a moment and refresh — it can take a second to show up after creating the Assignment.',
      requireAction: { eventKey: 'collab-invitation-opened' },
    },
    {
      id: 'accept-invitation',
      title: 'Accept Your Invitation',
      body:
        'This is what your collaborator will see the moment they open your invitation. Go ahead and accept it.',
      tag: 'try-it',
      targetSelector: '[data-tutorial-id="assignment-accept-invitation"]',
      fallbackNote: 'If you don\u2019t see this yet, the page may still be loading your invitation.',
      
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

        // … previous steps stay the same …

    {
      id: 'select-promoted-asset',
      title: 'Select Your Assigned Asset',
      body:
        'Here\u2019s the Asset you were assigned earlier. This is where it appears \u2014 the actual connection between the Collab workflow and your Video/Redirect link.',
      tag: 'demo',
      route: '/videos',
      targetSelector: '[data-tutorial-id="videos-promoted-asset"]',
      fallbackNote: 'Click **Track New Content** above, then fill in the platform/URL/campaign to see this field.',
    },

    // ── transition into Promotion Detail ──────────────────────────────
    {
      id: 'go-to-promotion-detail',
      title: 'Open your new Promotion, Click on the Gamepad Icon',
      body:
        'Open the Promotion you just started — Click the controller (gamepad) icon on the right of the row.',
      tag: 'try-it',
      route: '/marketplace',
      targetSelector: '[data-tutorial-id="marketplace-promotion-manage"]',
      // Point at whatever selector shows the newly-created promotion row
      // (you may need to add data-tutorial-id="marketplace-promotion-row" if it doesn’t exist yet)
      targetSelector: '[data-tutorial-id="marketplace-promotion-row"]',
      requireAction: { eventKey: 'collab-promotion-opened' },
    },

    // ── continuation of promotionTutorial steps ───────────────────────
    {
      id: 'overview',
      title: 'Your Promotion Control Center',
      body:
        'Once someone starts promoting your Assets through an Assignment, this is where you can see and manage that Promotion \u2014 who\u2019s involved, what they\u2019re promoting, and what they have access to.',
      tag: 'demo',
      
      targetSelector: '[data-tutorial-id="marketplace-promotion-row"]',
      previewImage: { src: promotionDetailOverview, alt: 'The full Promotion Detail page' },
    },
    {
      id: 'remove-collaborator',
      title: 'Remove Collaborator',
      body:
        'This removes the collaborator from THIS Promotion \u2014 not their VSTRK account.\n\nOnce removed, they can no longer promote the Assets in this Promotion, or use the Tracking Domains assigned through it.',
      tag: 'demo',
      targetSelector: '[data-tutorial-id="promotion-collaborator-actions"]',
      fallbackNote: 'This only appears once this Promotion has a collaborator.',
      previewImage: { src: removeCollaboratorExample, alt: 'The Remove Collaborator button' },
    },
    // … paste the rest of the steps from promotionTutorial.ts exactly as they are …
    {
      id: 'tracking-domain-management',
      title: 'Tracking Domain access works the same way',
      body:
        'Just like you control which Assets someone can promote, you control which Tracking Domains they can use.\n\n**Assign Tracking Domain** adds a new one to the Promotion. **Access Management \u2014 Tracking Domains** lets you revoke or restore access to any of them.',
      tag: 'demo',
      targetSelector: '[data-tutorial-id="promotion-assign-tracking-domain"]',
      fallbackNote: 'This section appears once this Promotion has an active collaborator. The Access Management list below it only appears after at least one domain has been assigned.',
      previewImage: { src: trackingDomainManagementExample, alt: 'Assign Tracking Domain and Access Management — Tracking Domains sections' },
    },

    {
      id: 'learn-more',
      title: 'There’s More Here — But No Rush',
      body:
        'I don’t want to overwhelm you — there are a few more tools and functions on this page, but they’re not necessary for your first Collab.\n\nFor now, you’ve seen the core workflow from start to finish. 🎉\n\nIf you want to explore what else you can do here, look for the **🦊 icon** on this page. It will show you more tutorials and guides for the different features available.',
      tag: 'demo',
      targetSelector: '[data-tutorial-id="promotion-page-fox"]',
      fallbackNote: 'Look for the 🦊 icon on the Promotion page to explore more tutorials when you’re ready.',
      
    },
    
     {
      id: 'collab-complete',
      title: 'Congratulations! 🎉',
      body:
        'You’ve created your first Collab!\n\nYou’ve now gone through the full workflow yourself — from creating an Assignment and inviting a collaborator, to accepting the invitation, selecting an Asset, and starting a Promotion.\n\nYou now know exactly what a real collaborator will experience. Great job!',
      tag: 'demo',
    },
    

  ],
};