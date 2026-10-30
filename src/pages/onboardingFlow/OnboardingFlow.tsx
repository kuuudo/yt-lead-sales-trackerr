import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import IntroVideoOverlay from '../../components/onboardingFlow/IntroVideoOverlay';
import OnboardingShell from '../../components/onboardingFlow/OnboardingShell';
import {
  isMethodComplete,
  isSituationComplete,
  isTrackComplete,
  isUsageComplete,
  TRACK_OTHER_ID,
  useOnboardingAnswers,
  type RoleId,
} from '../../lib/onboardingFlow';
import { trackOnboardingStep } from '../../lib/onboardingSync';
import { MethodStep, RoleStep, SituationStep, TrackStep, UsageStep, WelcomeStep } from './steps';

const STEP_IDS = ['welcome', 'role', 'situation', 'track', 'method', 'usage', 'campaign'] as const;
type StepId = (typeof STEP_IDS)[number];
// Same numbers as the "0N / 06" label. 'campaign' is the hand-off after the last question (the intro
// video, then signup), so it shares 6.
const STEP_NUMBER: Record<StepId, number> = {
  welcome: 1,
  role: 2,
  situation: 3,
  track: 4,
  method: 5,
  usage: 6,
  campaign: 6,
};

/**
 * Public, pre-signup onboarding. The step lives in the URL (?step=role) so the
 * browser Back button works; answers live in localStorage so a refresh keeps them.
 */
export default function OnboardingFlow() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
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

  // Research funnel: record the furthest step reached. Reaching 'campaign' (the hand-off after the
  // last question) means every question is answered (guards above), so that is "completed". When you
  // add more questions, put them before 'campaign' and the gates above keep this correct.
  useEffect(() => {
    void trackOnboardingStep(STEP_NUMBER[step], step === 'campaign');
  }, [step]);

  const go = (next: StepId) => setParams({ step: next });

  // After the intro video (ended, skipped, or unable to play) go to the existing sign-up page.
  // `replace`, so Back from sign-up returns to the last question instead of replaying the video.
  const toSignup = () => navigate('/login?mode=signup', { replace: true });

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
      next: () => go('campaign'),
      label: 'Continue',
      disabled: !isSituationComplete(answers),
    },
    track: { back: () => go('situation'), next: () => go('method'), label: 'Continue', disabled: !isTrackComplete(answers) },
    method: { back: () => go('track'), next: () => go('usage'), label: 'Continue', disabled: !isMethodComplete(answers) },
    usage: { back: () => go('method'), next: () => go('campaign'), label: 'Continue', disabled: !isUsageComplete(answers) },
    campaign: { back: () => go('usage'), next: () => {}, label: 'Continue', disabled: true },
  }[step] as { back?: () => void; next: () => void; label: string; disabled: boolean };

  return (
    <OnboardingShell
      step={STEP_NUMBER[step]}
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
          key={step === 'campaign' ? 'usage' : step} // the hand-off keeps the last question as the dimmed backdrop
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
          {(step === 'usage' || step === 'campaign') && (
            <UsageStep value={answers.usagePlan} onChange={(usagePlan) => update({ usagePlan })} />
          )}
        </motion.div>
      </AnimatePresence>
      {step === 'campaign' && <IntroVideoOverlay onDone={toSignup} />}
    </OnboardingShell>
  );
}
