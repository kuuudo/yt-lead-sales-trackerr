// src/components/onboarding/OnboardingGate.tsx
//
// Post-signup onboarding for new accounts (see lib/onboardingProgress.ts for who
// qualifies and how the stage is derived from real data). Rendered once, in
// MainContent's logged-in branch (App.tsx), so it needs Router + Auth + Tutorial.
//
//   stage 'campaign' -> light Campaign pop-up over the app (after a short pause)
//   stage 'track'    -> starts the Track First Content onboarding guide
//   stage 'asset'    -> starts the onboarding Video Library asset guide (original minus the track-again button)
//   stage 'collab'   -> starts the onboarding Start First Collab guide (original steps, own id)
//   stage 'finish'   -> light "first stage complete" pop-up; "Continue to Setup" ends onboarding for good,
//                       opens /settings/getting-started and starts the separate Get Started Tour
//
// Guide completion: tutorial-overlay does not say WHICH guide finished, only that
// status went to 'completed' (last step "Done") or 'idle' (closed). Whenever that
// happens the stage is re-derived from the database, so the next stage (or the
// Finish screen) follows from what really exists.
//
// This file never creates a workspace (it never calls createUserWorkspace).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { readPersistedProgress, useTutorial } from '../../lib/tutorial-overlay';
import { useOnboarding, type OnboardingStage } from '../../lib/onboardingProgress';
import type { Tutorial } from '../../lib/tutorialTypes';
import { trackFirstContentOnboardingGuide } from '../../lib/tutorials/trackFirstContentOnboardingGuide';
import { createVideoLibraryAssetOnboardingGuide } from '../../lib/tutorials/createVideoLibraryAssetOnboardingGuide';
import { startFirstCollabOnboardingGuide } from '../../lib/tutorials/startFirstCollabOnboardingGuide';
import { getStartedTour } from '../../lib/tutorials/getStartedTour';
import { CampaignModal, FinishModal } from '../../pages/onboardingFlow/PostSignupSteps';

// Pacing: nothing should jump out the instant the page loads or a step ends.
const CAMPAIGN_POPUP_DELAY_MS = 1800; // let the app settle first after sign-in
const FINISH_POPUP_DELAY_MS = 600;
const GUIDE_START_DELAY_MS = 600; // a beat between a pop-up closing / a guide ending and the next guide

/** Renders its children only after a pause. They fade in on their own once mounted. */
function AfterDelay({ ms, children }: { ms: number; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return ready ? <>{children}</> : null;
}

export default function OnboardingGate() {
  const { user } = useAuth();
  const { status, start, resumeAt } = useTutorial();
  const { state, organizationId, refresh, finish } = useOnboarding();
  const navigate = useNavigate();
  const location = useLocation();

  // Stage whose guide was already auto-started in this page load. Stops a guide the
  // person just closed from popping straight back open.
  const autoStartedFor = useRef<OnboardingStage | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const guide: Tutorial | null =
    state === 'track'
      ? trackFirstContentOnboardingGuide
      : state === 'asset'
        ? createVideoLibraryAssetOnboardingGuide
        : state === 'collab'
          ? startFirstCollabOnboardingGuide
          : null;

  /** Same-device saved progress resumes at its step; otherwise (e.g. new device) step 1. */
  const launch = (g: Tutorial) => {
    const saved = readPersistedProgress(user?.id, g.id);
    if (saved) resumeAt(g, saved.stepIndex);
    else start(g);
  };

  // A guide ended ('completed' on its last step, 'idle' when closed): re-read real progress.
  useEffect(() => {
    if (status === 'active') return;
    if (stateRef.current === 'track' || stateRef.current === 'asset' || stateRef.current === 'collab') void refresh();
  }, [status, refresh]);

  // Start the guide for the current stage, once per stage per page load.
  // 'completed' must count as "not busy": the track guide's last step leaves status at
  // 'completed' (never back to 'idle'), and the asset guide has to start right after it.
  useEffect(() => {
    if (!guide || !user || status === 'active') return;
    if (autoStartedFor.current === state) return;
    const timer = window.setTimeout(() => {
      autoStartedFor.current = state as OnboardingStage;
      launch(guide);
    }, GUIDE_START_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, state, status, user]);

  // TEST TRIGGER for the Get Started Tour (separate from the onboarding stages): opening any page
  // with ?tour=get-started starts it, then removes the parameter. Works for any logged-in account.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('tour') !== 'get-started' || !user || status === 'active') return;
    params.delete('tour');
    const rest = params.toString();
    navigate({ pathname: '/settings/getting-started', search: rest ? `?${rest}` : '' }, { replace: true });
    start(getStartedTour);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, user]);

  if (state === 'off' || state === 'loading') return null;

  // data-theme-lock keeps these screens in the original colours whatever app theme is selected.
  return (
    <div data-theme-lock style={{ display: 'contents' }}>
      {state === 'campaign' && (
        <AfterDelay ms={CAMPAIGN_POPUP_DELAY_MS}>
          <CampaignModal organizationId={organizationId} onCreated={() => void refresh()} />
        </AfterDelay>
      )}

      {/* Not while a guide is open: the collab guide keeps going after its Promotion exists, so a page
          reload there must not cover the resumed guide with this pop-up. It appears once the guide ends. */}
      {state === 'finish' && status !== 'active' && (
        <AfterDelay ms={FINISH_POPUP_DELAY_MS}>
          <FinishModal
            onFinish={async () => {
              await finish(); // throws if saving fails; the pop-up shows the error
              navigate('/settings/getting-started');
              start(getStartedTour); // separate follow-up tour, not an onboarding stage
            }}
          />
        </AfterDelay>
      )}

      {/* Safety net: if the guide was closed mid-way there is otherwise no way to bring it back
          until the next page load. Only shown while a guided stage is waiting. Also shown after a guide
          ENDED ('completed') without finishing its stage (e.g. Next clicked past the real action). */}
      {guide && status !== 'active' && (
        <button
          type="button"
          onClick={() => launch(guide)}
          className="fixed bottom-5 left-5 z-[90] inline-flex items-center gap-2 rounded-full bg-white px-4 h-10 text-[10px] font-black uppercase tracking-widest text-zinc-900 shadow-2xl border border-zinc-200 hover:bg-zinc-100 transition-colors"
        >
          <Rocket size={12} />
          Continue setup
        </button>
      )}
    </div>
  );
}
