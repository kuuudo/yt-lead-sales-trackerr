// src/lib/tutorials/promotionTutorial.ts
//
// Content only — copy, step order, targets. No rendering logic lives
// here (see TutorialRunner.tsx). Mirrors assetsTutorial.ts /
// marketplaceTutorial.ts's structure.
//
// This is the DEEP Promotion Detail tour, launched from the 🦊 button
// on PromotionDetail.tsx — NOT part of the marketplaceTutorial flow.
// marketplaceTutorial.ts only gives a one-step, high-level intro to
// Promotion Detail; this file covers every control on the page.
//
// Screenshot-based (previewImage), not live-spotlight-based: most
// users won't have an existing Promotion with a real active
// collaborator, revoked assets, etc. — so there's nothing live to
// point at for most of these steps. All 9 screenshots are real UI.

import type { Tutorial } from '../tutorialTypes';
import promotionDetailOverview from '../../assets/tutorial/promotion-detail-overview.png';
import removeCollaboratorExample from '../../assets/tutorial/remove-collaborator-example.png';
import allowCollaboratorDomainsExample from '../../assets/tutorial/allow-collaborator-domains-example.png';
import allowCollaboratorDomainsEnabled from '../../assets/tutorial/allow-collaborator-domains-enabled.png';
import allowCollaboratorDomainsDisabled from '../../assets/tutorial/allow-collaborator-domains-disabled.png';
import addAssetExample from '../../assets/tutorial/add-asset-example.png';
import revokeAssetAccessExample from '../../assets/tutorial/revoke-asset-access-example.png';
import restoreAssetAccessExample from '../../assets/tutorial/restore-asset-access-example.png';
import trackingDomainManagementExample from '../../assets/tutorial/tracking-domain-management-example.png';

export const promotionTutorial: Tutorial = {
  id: 'promotion-detail',
  steps: [
    {
      id: 'overview',
      title: 'Your Promotion Control Center',
      body:
        'Once someone starts promoting your Assets through an Assignment, this is where you can see and manage that Promotion \u2014 who\u2019s involved, what they\u2019re promoting, and what they have access to.',
      tag: 'demo',
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
    {
      id: 'allow-collaborator-domains-intro',
      title: 'Allow Collaborator Domains',
      body:
        'This decides whether your collaborator can use **their own** tracking domain when promoting **your** Assets.\n\nIf allowed, they can use their own domain for redirect links. If not, they must use the domains you\u2019ve assigned to the Promotion.',
      tag: 'demo',
      targetSelector: '[data-tutorial-id="promotion-allow-collaborator-domains"]',
      fallbackNote: 'This checkbox appears next to each promoted Asset, once this Promotion has an active collaborator.',
      previewImage: { src: allowCollaboratorDomainsExample, alt: 'The Allow Collaborator Domains checkbox next to a promoted asset' },
    },
    {
      id: 'allow-collaborator-domains-enabled',
      title: 'Enabled: they can use their own domain',
      body:
        'Sorry if the example image is a little confusing — the domains shown are the same because this is a test.\n\n**ON** means the collaborator can use **their own tracking domain** when promoting this Asset. For example, if they own `nike.com`, it appears under **Your domains**. Domains you assign to them, such as `shop.kaksidigitals.com` or `lucky.kaksidigitals.com`, appear under **Shared domains**.',
      tag: 'demo',
      previewImage: { src: allowCollaboratorDomainsEnabled, alt: 'Allow Collaborator Domains enabled, showing the collaborator’s own domains available' },
    },
    {
      id: 'allow-collaborator-domains-disabled',
      title: 'Disabled: they use your domains only',
      body:
        '**OFF** \u2014 the collaborator cannot use their own domain, and must use one of the Tracking Domains you\u2019ve provided for this Promotion.',
      tag: 'demo',
      previewImage: { src: allowCollaboratorDomainsDisabled, alt: 'Allow Collaborator Domains disabled, showing only shared domains available' },
    },
    {
      id: 'add-asset',
      title: 'Add Asset',
      body:
        'You\u2019re not limited to the Assets originally selected. If you want your collaborator to promote something else later, add it here.',
      tag: 'demo',
      targetSelector: '[data-tutorial-id="promotion-add-asset"]',
      fallbackNote: 'This appears once this Promotion has an active collaborator.',
      previewImage: { src: addAssetExample, alt: 'The Add Asset / Select Assets to Add button' },
    },
    {
      id: 'revoke-asset-access',
      title: 'Revoke Access (one Asset)',
      body:
        'This removes the collaborator\u2019s access to **this one Asset only** \u2014 it does not remove them from the whole Promotion. They can no longer promote this specific Asset, but keep access to everything else.',
      tag: 'demo',
      targetSelector: '[data-tutorial-id="promotion-asset-access-management"]',
      fallbackNote: 'This list appears once this Promotion has an active collaborator with assigned Assets.',
      previewImage: { src: revokeAssetAccessExample, alt: 'The Access Management — Assigned Assets list with Revoke Access buttons' },
    },
    {
      id: 'restore-asset-access',
      title: 'Restore Access',
      body:
        'If you accidentally revoke access, don\u2019t worry \u2014 you can restore it later. Restoring lets the collaborator use that Asset again. Nothing was permanently deleted.',
      tag: 'demo',
      targetSelector: '[data-tutorial-id="promotion-asset-access-management"]',
      fallbackNote: 'This appears in the same list as Revoke Access, above, once an Asset has actually been revoked.',
      previewImage: { src: restoreAssetAccessExample, alt: 'A revoked asset with a Restore Access button' },
    },
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
  ],
};
