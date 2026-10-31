// src/components/onboarding/OnboardingGate.tsx
//
// Post-signup onboarding for new accounts (see lib/onboardingProgress.ts for who
// qualifies and how the stage is derived from real data). Rendered once, in
// MainContent's logged-in branch (App.tsx), so it needs Router + Auth + Tutorial.
//
//   stage 'campaign' -> full-screen light Campaign screen
//   stage 'track'    -> starts the Track First Content onboarding guide
//   stage 'asset'    -> starts the Video Library asset guide (unchanged original)
//   stage 'finish'   -> full-screen light Finish screen; Finish ends onboarding for good
//
// Guide completion: tutorial-overlay does not say WHICH guide finished, only that
// status went to 'completed' (last step "Done") or 'idle' (closed). Whenever that
// happens the stage is re-derived from the database, so the next stage (or the
// Finish screen) follows from what really exists.
//
// This file never creates a workspace (it never calls createUserWorkspace).

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { readPersistedProgress, useTutorial } from '../../lib/tutorial-overlay';
import { useOnboarding, type OnboardingStage } from '../../lib/onboardingProgress';
import type { Tutorial } from '../../lib/tutorialTypes';
import { trackFirstContentOnboardingGuide } from '../../lib/tutorials/trackFirstContentOnboardingGuide';
import { createVideoLibraryAssetGuide } from '../../lib/tutorials/createVideoLibraryAssetGuide';
import { CampaignScreen, FinishScreen } from '../../pages/onboardingFlow/PostSignupSteps';

export default function OnboardingGate() {
  const { user } = useAuth();
  const { status, start, resumeAt } = useTutorial();
  const { state, organizationId, refresh, finish } = useOnboarding();
  const navigate = useNavigate();

  // Stage whose guide was already auto-started in this page load. Stops a guide the
  // person just closed from popping straight back open.
  const autoStartedFor = useRef<OnboardingStage | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const guide: Tutorial | null =
    state === 'track' ? trackFirstContentOnboardingGuide : state === 'asset' ? createVideoLibraryAssetGuide : null;

  /** Same-device saved progress resumes at its step; otherwise (e.g. new device) step 1. */
  const launch = (g: Tutorial) => {
    const saved = readPersistedProgress(user?.id, g.id);
    if (saved) resumeAt(g, saved.stepIndex);
    else start(g);
  };

  // A guide ended ('completed' on its last step, 'idle' when closed): re-read real progress.
  useEffect(() => {
    if (status === 'active') return;
    if (stateRef.current === 'track' || stateRef.current === 'asset') void refresh();
  }, [status, refresh]);

  // Start the guide for the current stage, once per stage per page load.
  // 'completed' must count as "not busy": the track guide's last step leaves status at
  // 'completed' (never back to 'idle'), and the asset guide has to start right after it.
  useEffect(() => {
    if (!guide || !user || status === 'active') return;
    if (autoStartedFor.current === state) return;
    autoStartedFor.current = state as OnboardingStage;
    launch(guide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, state, status, user]);

  if (state === 'off' || state === 'loading') return null;

  // data-theme-lock keeps these screens in the original colours whatever app theme is selected.
  return (
    <div data-theme-lock style={{ display: 'contents' }}>
      {state === 'campaign' && (
        <CampaignScreen organizationId={organizationId} onCreated={() => void refresh()} />
      )}

      {state === 'finish' && (
        <FinishScreen
          onFinish={async () => {
            await finish(); // throws if saving fails; the screen shows the error
            navigate('/tree');
          }}
        />
      )}

      {/* Safety net: if the guide was closed mid-way there is otherwise no way to bring it back
          until the next page load. Only shown while a guided stage is waiting. */}
      {guide && status === 'idle' && (
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
