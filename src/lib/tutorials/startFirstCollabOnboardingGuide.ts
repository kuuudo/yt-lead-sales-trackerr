// src/lib/tutorials/startFirstCollabOnboardingGuide.ts
//
// Post-signup onboarding variant of the Start First Collab guide.
// The original (`start-first-collab`, used by the Get Started hub) is NOT modified.
// A separate id keeps the two guides' saved progress apart, same pattern as
// trackFirstContentOnboardingGuide / createVideoLibraryAssetOnboardingGuide.
//
// Steps are spread from the original unchanged. Only the id and the card style differ:
// the white follow-along card, like the other onboarding guides.
//
// IMPORTANT: pages that fire this guide's events (collab-invitation-opened,
// collab-form-opened, collab-promotion-opened) must also accept this id, or the
// "try-it" steps would wait forever. See the grep request for the exact places.

import type { Tutorial } from '../tutorialTypes';
import { startFirstCollabGuide } from './startFirstCollabGuide';

export const ONBOARDING_START_FIRST_COLLAB_ID = 'onboarding-start-first-collab';

export const startFirstCollabOnboardingGuide: Tutorial = {
  ...startFirstCollabGuide,
  id: ONBOARDING_START_FIRST_COLLAB_ID,
  mode: 'follow-along',
};
