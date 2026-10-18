// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/agency/agencyDemoVideos.tsx
// ─────────────────────────────────────────────────────────────────────────
// Single wiring point between the public agency and multi-client operator demo and your EXISTING
// explainer-video components. Nothing is copied or recreated — each slot
// points at the component your logged-in onboarding already uses, in its
// original location (src/components/onboarding/OnboardingVideo/).
//
// Public-safety: all six files import ONLY React — no Supabase, auth,
// router or user context — so they render the same for logged-out visitors.
//
// Not used here on purpose: OnboardingVideoSection06 (Marketplace vision).
//
// Every video takes the same optional props:
//   { onSkip?: () => void; onComplete?: () => void }
// (Section 04 also accepts onStartTutorial; it is NOT passed here, so its
//  logged-in-only "First Team Setup" box stays hidden.)
// ─────────────────────────────────────────────────────────────────────────

import type React from 'react';

import TrackingVideo from '../../../../components/onboarding/OnboardingVideo/OnboardingVideoSection01';
import AssetVideo from '../../../../components/onboarding/OnboardingVideo/OnboardingVideoSection02';
import CollabVideo from '../../../../components/onboarding/OnboardingVideo/OnboardingVideoSection03';
import OperatorVideo from '../../../../components/onboarding/OnboardingVideo/OnboardingVideoSection04';
import WorkspaceVideo from '../../../../components/onboarding/OnboardingVideo/OnboardingVideoSection05';
import TrackingJourneyOnboardingVideo from '../../../../components/onboarding/OnboardingVideo/TrackingJourneyOnboardingVideo';

export type DemoVideoProps = { onSkip?: () => void; onComplete?: () => void };
export type DemoVideoComponent = React.ComponentType<DemoVideoProps>;

export const AGENCY_DEMO_VIDEOS: Record<
  'tracking' | 'asset' | 'collab' | 'operator' | 'workspace' | 'journey',
  DemoVideoComponent | null
> = {
  tracking: TrackingVideo, // Section 01
  asset: AssetVideo, // Section 02
  collab: CollabVideo, // Section 03
  operator: OperatorVideo, // Section 04
  workspace: WorkspaceVideo, // Section 05
  journey: TrackingJourneyOnboardingVideo,
};