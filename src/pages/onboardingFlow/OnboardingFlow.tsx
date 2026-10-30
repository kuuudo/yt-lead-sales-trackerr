import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import OnboardingShell from '../../components/onboardingFlow/OnboardingShell';
import {
  isMethodComplete,
  isSituationComplete,
  isTrackComplete,
  isUsageComplete,
  TOTAL_STEPS,
  TRACK_OTHER_ID,
  useOnboardingAnswers,
  type RoleId,
} from '../../lib/onboardingFlow';
import { trackOnboardingStep } from '../../lib/onboardingSync';
import { MethodStep, RoleStep, SituationStep, TrackStep, UsageStep, WelcomeStep } from './steps';
import SignupStep, { SIGNUP_SUBMIT_ID } from './SignupStep';

const STEP_IDS = ['welcome', 'role', 'situation', 'track', 'method', 'usage', 'signup'] as const;
type StepId = (typeof STEP_IDS)[number];
// Same numbers as the "0N / 06" label. 'signup' is the account page after the last question: the
// progress bar stays full (Math.min below) while furthest_step records 7, so "reached sign-up" is
// visible in the funnel.
const STEP_NUMBER: Record<StepId, number> = {
  welcome: 1,
  role: 2,
  situation: 3,
  track: 4,
  method: 5,
  usage: 6,
  signup: 7,
};

/**
 * Public, pre-signup onboarding. The step lives in the URL (?step=role) so the
 * browser Back button works; answers live in localStorage so a refresh keeps them.
 */
export default function OnboardingFlow() {
  const [params, setParams] = useSearchParams();
  const [signupLocked, setSignupLocked] = useState(false); // signing up, or confirmation email sent
  const { answers, update } = useOnboardingAnswers();
  const reduce = useReducedMotion();

  const requested = params.get('step');
  let step: StepId = (STEP_IDS as readonly string[]).includes(requested ?? '') ? (requested as StepId) : 'welcome';

  // Guards: never show a step whose earlier answers are missing (e.g. a pasted link).
  // Each gate says: to be past this step, its answer must be complete.
  const gates: [StepId, boolean][] = [
    ['role', !!answers.role],
    ['situation', isSituationComplete(answers)],
    ['track', isTrackComplete(answers)],
    ['method', isMethodComplete(answers)],
    ['usage', isUsageComplete(answers)],
  ];
  for (const [gate, done] of gates) {
    if (!done && STEP_IDS.indexOf(step) > STEP_IDS.indexOf(gate)) {
      step = gate;
      break;
    }
  }

  useEffect(() => {
    if (requested && requested !== step) setParams({ step }, { replace: true });
  }, [requested, step, setParams]);

  // Research funnel: record the furthest step reached. Reaching 'signup' (the hand-off after the
  // last question) means every question is answered (guards above), so that is "completed".
  // Whether they then create an account is the separate user_id field. When you add more questions,
  // put them before 'signup' and the gates above keep this correct.
  useEffect(() => {
    void trackOnboardingStep(STEP_NUMBER[step], step === 'signup');
  }, [step]);

  const go = (next: StepId) => setParams({ step: next });

  const pickRole = (role: RoleId) => {
    if (role !== answers.role) update({ role, situation: null, otherText: '' });
  };

  const toggleTrack = (id: string) => {
    const has = answers.trackGoals.includes(id);
    update({
      trackGoals: has ? answers.trackGoals.filter((g) => g !== id) : [...answers.trackGoals, id],
      // Unticking "Other" drops the typed text so it isn't saved.
      ...(has && id === TRACK_OTHER_ID ? { trackOther: '' } : {}),
    });
  };

  const footer = {
    welcome: { next: () => go('role'), label: 'Let’s get started', disabled: false },
    role: { back: () => go('welcome'), next: () => go('situation'), label: 'Continue', disabled: !answers.role },
    situation: {
      back: () => go('role'),
      next: () => go('track'),
      label: 'Continue',
      disabled: !isSituationComplete(answers),
    },
    track: { back: () => go('situation'), next: () => go('method'), label: 'Continue', disabled: !isTrackComplete(answers) },
    method: { back: () => go('track'), next: () => go('usage'), label: 'Continue', disabled: !isMethodComplete(answers) },
    usage: { back: () => go('method'), next: () => go('signup'), label: 'Continue', disabled: !isUsageComplete(answers) },
    signup: {
      back: () => go('usage'),
      next: () => document.getElementById(SIGNUP_SUBMIT_ID)?.click(),
      label: 'Create my account',
      disabled: signupLocked,
    },
  }[step] as { back?: () => void; next: () => void; label: string; disabled: boolean };

  return (
    <OnboardingShell
      step={Math.min(STEP_NUMBER[step], TOTAL_STEPS)}
      width={step === 'welcome' ? 'wide' : 'narrow'}
      scrollKey={step}
      onBack={footer.back}
      onNext={footer.next}
      nextLabel={footer.label}
      nextDisabled={footer.disabled}
      footerNote="Track. Attribute. Grow."
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {step === 'welcome' && <WelcomeStep />}
          {step === 'role' && <RoleStep value={answers.role} onChange={pickRole} />}
          {step === 'situation' && answers.role && (
            <SituationStep
              role={answers.role}
              situation={answers.situation}
              otherText={answers.otherText}
              onSituation={(situation) => update({ situation })}
              onOtherText={(otherText) => update({ otherText })}
            />
          )}
          {step === 'track' && (
            <TrackStep
              goals={answers.trackGoals}
              otherText={answers.trackOther}
              onToggle={toggleTrack}
              onOtherText={(trackOther) => update({ trackOther })}
            />
          )}
          {step === 'method' && (
            <MethodStep value={answers.currentTracking} onChange={(currentTracking) => update({ currentTracking })} />
          )}
          {step === 'usage' && (
            <UsageStep value={answers.usagePlan} onChange={(usagePlan) => update({ usagePlan })} />
          )}
          {step === 'signup' && <SignupStep onLockedChange={setSignupLocked} />}
        </motion.div>
      </AnimatePresence>
    </OnboardingShell>
  );
}