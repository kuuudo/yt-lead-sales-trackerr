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

/** A plain choice card. `description` is optional. */
export interface ChoiceOption {
  id: string;
  title: string;
  description?: string;
}

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

/** Step 4 (pick several). "Other" opens a text box, so you can see what people want tracked that VSTRK doesn't cover yet. */
export const TRACK_OTHER_ID = 'other';
export const TRACK_OPTIONS: ChoiceOption[] = [
  { id: 'sales_purchases', title: 'Sales & purchases', description: 'Purchases and closed deals.' },
  { id: 'revenue', title: 'Revenue generated', description: 'How much money your content and links bring in.' },
  { id: 'consultations_bookings', title: 'Consultations & bookings', description: 'Booked calls, consultations and sales calls.' },
  { id: 'leads_signups', title: 'Leads & newsletter signups', description: 'Potential customers and email subscribers.' },
  { id: 'clicks_traffic', title: 'Link clicks & traffic', description: 'Who clicks your links and visits your site.' },
  { id: TRACK_OTHER_ID, title: 'Other', description: 'Tell us what you’d like to track.' },
];

/** Step 5 (pick one). */
export const METHOD_OPTIONS: ChoiceOption[] = [
  { id: 'spreadsheets', title: 'Spreadsheets (Excel / Google Sheets)' },
  { id: 'platform_analytics', title: 'Platform analytics (YouTube, Instagram, TikTok, etc.)' },
  { id: 'links_or_utm', title: 'Tracking links or UTM parameters' },
  { id: 'mix_of_tools', title: 'A mix of different tools' },
  { id: 'not_tracking', title: 'I’m not tracking my results yet' },
];

/** Step 6 (pick one). */
export const USAGE_OPTIONS: ChoiceOption[] = [
  { id: 'own_content', title: 'Track my own content and campaigns' },
  { id: 'collaborate', title: 'Let creators, partners or marketers promote my business' },
  { id: 'both', title: 'Both — track my own content and collaborate with others' },
  { id: 'not_sure', title: 'I’m not sure yet' },
];

export interface OnboardingAnswers {
  role: RoleId | null;
  situation: string | null;
  otherText: string;
  trackGoals: string[];
  trackOther: string;
  currentTracking: string | null;
  usagePlan: string | null;
}

const STORAGE_KEY = 'vstrk.onboarding.v1';
const EMPTY: OnboardingAnswers = {
  role: null,
  situation: null,
  otherText: '',
  trackGoals: [],
  trackOther: '',
  currentTracking: null,
  usagePlan: null,
};

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
      trackGoals: Array.isArray(p.trackGoals)
        ? p.trackGoals.filter((g: unknown) => TRACK_OPTIONS.some((o) => o.id === g))
        : [],
      trackOther: typeof p.trackOther === 'string' ? p.trackOther : '',
      currentTracking: METHOD_OPTIONS.some((o) => o.id === p.currentTracking) ? p.currentTracking : null,
      usagePlan: USAGE_OPTIONS.some((o) => o.id === p.usagePlan) ? p.usagePlan : null,
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

export function isTrackComplete(a: OnboardingAnswers): boolean {
  if (a.trackGoals.length === 0) return false;
  if (a.trackGoals.includes(TRACK_OTHER_ID)) {
    return !OTHER_REASON_REQUIRED || a.trackOther.trim().length >= OTHER_REASON_MIN_LENGTH;
  }
  return true;
}

export const isMethodComplete = (a: OnboardingAnswers): boolean =>
  METHOD_OPTIONS.some((o) => o.id === a.currentTracking);

export const isUsageComplete = (a: OnboardingAnswers): boolean =>
  USAGE_OPTIONS.some((o) => o.id === a.usagePlan);

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
    const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (lastSent.current === 0 && Object.values(answers).every(isEmpty)) return;
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
