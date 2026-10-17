// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/sponsor/sponsorDemoVideos.tsx
// ─────────────────────────────────────────────────────────────────────────
// Single wiring point between the public sponsor demo and your EXISTING
// explainer-video components. Nothing is copied or recreated — each slot
// just points at the component your logged-in onboarding already uses.
//
// TO WIRE: uncomment each import and set the real relative path, then put
// the component in the matching slot below. Until a slot is wired, its tab
// shows a "not connected yet" notice (the page still builds and runs).
//
// Every existing video takes the same optional props:
//   { onSkip?: () => void; onComplete?: () => void }
// ─────────────────────────────────────────────────────────────────────────

import type React from 'react';

// import TrackingVideo from '../../../../components/onboarding/<<PATH>>';
// import AssetVideo from '../../../../components/onboarding/<<PATH>>';
// import CollabVideo from '../../../../components/onboarding/<<PATH>>';
// import OperatorVideo from '../../../../components/onboarding/<<PATH>>';
// import WorkspaceVideo from '../../../../components/onboarding/<<PATH>>';
// import TrackingJourneyOnboardingVideo from '../../../../components/onboarding/<<PATH>>/TrackingJourneyOnboardingVideo';

export type DemoVideoProps = { onSkip?: () => void; onComplete?: () => void };
export type DemoVideoComponent = React.ComponentType<DemoVideoProps>;

export const SPONSOR_DEMO_VIDEOS: Record<
  'tracking' | 'asset' | 'collab' | 'operator' | 'workspace' | 'journey',
  DemoVideoComponent | null
> = {
  tracking: null, // TrackingVideo
  asset: null, // AssetVideo
  collab: null, // CollabVideo
  operator: null, // OperatorVideo
  workspace: null, // WorkspaceVideo
  journey: null, // TrackingJourneyOnboardingVideo
};
