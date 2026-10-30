import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import OnboardingShell from '../../components/onboardingFlow/OnboardingShell';
import {
  isSituationComplete,
  useOnboardingAnswers,
  type RoleId,
} from '../../lib/onboardingFlow';
import { trackOnboardingStep } from '../../lib/onboardingSync';
import { NextStepPlaceholder, RoleStep, SituationStep, WelcomeStep } from './steps';

const STEP_IDS = ['welcome', 'role', 'situation', 'campaign'] as const;
type StepId = (typeof STEP_IDS)[number];
const STEP_NUMBER: Record<StepId, number> = { welcome: 1, role: 2, situation: 3, campaign: 4 };

/**
 * Public, pre-signup onboarding. The step lives in the URL (?step=role) so the
 * browser Back button works; answers live in localStorage so a refresh keeps them.
 */
export default function OnboardingFlow() {
  const [params, setParams] = useSearchParams();
  const { answers, update } = useOnboardingAnswers();
  const reduce = useReducedMotion();

  const requested = params.get('step');
  let step: StepId = (STEP_IDS as readonly string[]).includes(requested ?? '') ? (requested as StepId) : 'welcome';

  // Guards: never show a step whose earlier answers are missing (e.g. a pasted link).
  if ((step === 'situation' || step === 'campaign') && !answers.role) step = 'role';
  if (step === 'campaign' && !isSituationComplete(answers)) step = 'situation';

  useEffect(() => {
    if (requested && requested !== step) setParams({ step }, { replace: true });
  }, [requested, step, setParams]);

  // Research funnel: record the furthest step reached. Reaching 'campaign' means every question
  // built so far is answered (guards above), so that is "completed". When you add more questions,
  // move the 'campaign' check to the new last question step.
  useEffect(() => {
    void trackOnboardingStep(STEP_NUMBER[step], step === 'campaign');
  }, [step]);

  const go = (next: StepId) => setParams({ step: next });

  const pickRole = (role: RoleId) => {
    if (role !== answers.role) update({ role, situation: null, otherText: '' });
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
    campaign: { back: () => go('situation'), next: () => {}, label: 'Continue', disabled: true },
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
          {step === 'campaign' && <NextStepPlaceholder answers={answers} />}
        </motion.div>
      </AnimatePresence>
    </OnboardingShell>
  );
}
