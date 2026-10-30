import { useCallback, useEffect, useRef, useState } from 'react';
import { saveOnboardingAnswers } from './onboardingSync';

/** Total segments in the progress bar for the whole onboarding (not just the 3 built so far). */
export const TOTAL_STEPS = 6;

/** "Something else" must come with a short reason. Flip to false to make it optional. */
export const OTHER_REASON_REQUIRED = true;
export const OTHER_REASON_MIN_LENGTH = 3;

export type RoleId = 'business_owner' | 'marketer' | 'agency' | 'sponsor_brand' | 'creator';

export interface RoleOption {
  id: RoleId;
  title: string;
  description: string;
}

export interface SituationOption {
  id: string;
  title: string;
  description: string;
}

// If you add, rename or remove a role here, update ALLOWED_VALUES.role in
// supabase/functions/save-onboarding-answers/index.ts too (functions can't import from src/),
// then redeploy that function. Otherwise saves containing the new role are rejected.
export const ROLES: RoleOption[] = [
  { id: 'business_owner', title: 'Business owner', description: 'Grow your business through content.' },
  { id: 'marketer', title: 'Marketer', description: 'Make every campaign easier to measure.' },
  { id: 'agency', title: 'Agency', description: 'Organize content and results for clients.' },
  { id: 'sponsor_brand', title: 'Sponsor & brand', description: 'Understand your creator partnerships.' },
  { id: 'creator', title: 'YouTuber / content creator', description: 'Turn your content into measurable results.' },
];

export const OTHER_OPTION: SituationOption = {
  id: 'other',
  title: 'Something else',
  description: 'Tell us in a few words.',
};

/** Step 3. "Something else" is appended to every list automatically. */
export const SITUATIONS: Record<RoleId, { question: string; options: SituationOption[] }> = {
  business_owner: {
    question: 'Are you promoting your own products or working with marketers?',
    options: [
      { id: 'track_own_content', title: 'Tracking my own content', description: 'See which posts and videos lead to revenue.' },
      { id: 'hiring_marketers', title: 'Hiring marketers', description: 'Lots of applicants, unclear who actually performs.' },
      { id: 'working_with_agency', title: 'Working with an agency', description: 'I want transparency into what they deliver.' },
    ],
  },
  marketer: {
    question: 'How do you work as a marketer?',
    options: [
      { id: 'internal_team', title: 'Inside a business', description: 'I’m the in-house marketing team for a business owner.' },
      { id: 'help_businesses_promote', title: 'For other businesses', description: 'I help other businesses promote.' },
    ],
  },
  agency: {
    question: 'What brings your agency to VSTRK?',
    options: [
      { id: 'old_strategies', title: 'Old strategies stopped working', description: 'They no longer help me close and retain clients.' },
      { id: 'help_promote', title: 'Helping businesses promote', description: 'I run promotion for other businesses.' },
      { id: 'help_grow_scale', title: 'Helping clients grow and scale', description: 'I want to show the growth I deliver.' },
    ],
  },
  sponsor_brand: {
    question: 'Where are you with marketers and creators?',
    options: [
      { id: 'hiring_or_planning', title: 'Already hiring, or about to', description: 'I want to know what their content is actually doing.' },
    ],
  },
  creator: {
    question: 'What do you use your content for?',
    options: [
      { id: 'own_product', title: 'Promoting my own product', description: 'I have my own website or product to promote.' },
      { id: 'sponsor_collabs', title: 'Working with sponsors and brands', description: 'I collaborate with other sponsors and brands.' },
    ],
  },
};

export interface OnboardingAnswers {
  role: RoleId | null;
  situation: string | null;
  otherText: string;
}

const STORAGE_KEY = 'vstrk.onboarding.v1';
const EMPTY: OnboardingAnswers = { role: null, situation: null, otherText: '' };

/** Safe to call anywhere (e.g. the sign-up step, to save answers to the new account). */
export function readOnboardingAnswers(): OnboardingAnswers {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    const role: RoleId | null = ROLES.some((r) => r.id === p.role) ? p.role : null;
    return {
      role,
      situation: role && typeof p.situation === 'string' ? p.situation : null,
      otherText: typeof p.otherText === 'string' ? p.otherText : '',
    };
  } catch {
    return EMPTY;
  }
}

export function clearOnboardingAnswers() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function isSituationComplete(a: OnboardingAnswers): boolean {
  if (!a.role || !a.situation) return false;
  if (a.situation === 'other') {
    return !OTHER_REASON_REQUIRED || a.otherText.trim().length >= OTHER_REASON_MIN_LENGTH;
  }
  return SITUATIONS[a.role].options.some((o) => o.id === a.situation);
}

/** Minimum gap between saves while someone is typing. The first change after a pause saves immediately. */
const SAVE_THROTTLE_MS = 800;

/**
 * Answers survive a refresh (localStorage) and are saved to Supabase as they change, even before
 * sign-up. Each save sends every answer, so a failed save is repaired by the next one and never
 * blocks the user. New fields added to OnboardingAnswers are saved automatically (camelCase → snake_case).
 */
export function useOnboardingAnswers() {
  const [answers, setAnswers] = useState<OnboardingAnswers>(readOnboardingAnswers);
  const latest = useRef(answers);
  const timer = useRef<number | undefined>(undefined);
  const lastSent = useRef(0);

  useEffect(() => {
    latest.current = answers;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
    } catch {
      /* storage unavailable */
    }

    // Nothing to send until something is answered (after the first send, always send so clears reach the server).
    if (lastSent.current === 0 && Object.values(answers).every((v) => v == null || v === '')) return;
    if (timer.current !== undefined) return; // a save is already queued and will read the latest answers
    const wait = Math.max(0, SAVE_THROTTLE_MS - (Date.now() - lastSent.current));
    // No cleanup on purpose: a queued save should still go out if the user navigates away.
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      lastSent.current = Date.now();
      void saveOnboardingAnswers(latest.current);
    }, wait);
  }, [answers]);

  const update = useCallback(
    (patch: Partial<OnboardingAnswers>) => setAnswers((prev) => ({ ...prev, ...patch })),
    [],
  );

  return { answers, update };
}
