import { useEffect } from 'react';
import { supabase } from './supabase'; // same client AuthProvider (lib/auth.tsx) and pages/Auth.tsx use, so it holds the login session

/** Bump when you change the question set in a way you want to tell apart in the data. */
export const ONBOARDING_VERSION = 1;

const SESSION_KEY = 'vstrk.onboarding.session';
const LINKED_KEY = 'vstrk.onboarding.linkedSession';
const MAX_TEXT = 500;

let memorySessionId: string | null = null; // used only if localStorage is unavailable

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** Anonymous visitor id. Created on first use and kept in the browser. */
export function getOnboardingSessionId(): string {
  const existing = readStore(SESSION_KEY) ?? memorySessionId;
  if (existing) return existing;
  const id = crypto.randomUUID();
  memorySessionId = id;
  writeStore(SESSION_KEY, id);
  return id;
}

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** otherText → other_text, ''/[] → null (null removes the answer on the server). */
function toDbAnswers(answers: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (typeof value === 'string') {
      const text = value.trim().slice(0, MAX_TEXT);
      out[toSnake(key)] = text === '' ? null : text;
    } else if (Array.isArray(value)) {
      out[toSnake(key)] = value.length === 0 ? null : value;
    } else {
      out[toSnake(key)] = value ?? null;
    }
  }
  return out;
}

/** Never throws, never blocks the UI. After a successful save it also retries linking (see below). */
async function send(extra: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('save-onboarding-answers', {
      body: { session_id: getOnboardingSessionId(), version: ONBOARDING_VERSION, ...extra },
    });
    if (error) return false;
    // The row exists now. If the visitor already signed up (and an earlier link attempt hit
    // 'not_found' because this save was still in flight), link right away instead of waiting
    // for the next page load or sign-in.
    void linkOnboardingToAccount();
    return true;
  } catch {
    return false;
  }
}

/** Saves the full set of answers (idempotent, so a failed save is repaired by the next one). */
export function saveOnboardingAnswers(answers: object): Promise<boolean> {
  return send({ answers: toDbAnswers(answers) });
}

/**
 * Funnel progress. `step` uses the same numbers as the "0N / 06" label (the server only ever
 * raises furthest_step). `completed` stamps completed_at the first time it is true.
 */
export function trackOnboardingStep(step: number, completed = false): Promise<boolean> {
  return send({ step, ...(completed ? { completed: true } : {}) });
}

/* ───────────── Linking the anonymous session to the account ───────────── */

let linking: Promise<void> | null = null;
let relink = false; // set when someone asks to link while an attempt is already running

async function attemptLink(): Promise<void> {
  const sessionId = readStore(SESSION_KEY) ?? memorySessionId;
  if (!sessionId || readStore(LINKED_KEY) === sessionId) return;

  // Anonymous visitors have no user to link to; skip the network call entirely.
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return;

  const { data, error } = await supabase.functions.invoke('link-onboarding', {
    body: { session_id: sessionId },
  });
  // 'not_found' means the first save hasn't landed yet: leave it, the next successful save retries.
  if (!error && data?.result && data.result !== 'not_found') writeStore(LINKED_KEY, sessionId);
}

/**
 * Ties this browser's anonymous answers to the signed-in account. Safe to call repeatedly.
 * If called while an attempt is running, it runs once more afterwards, so a save that lands
 * mid-attempt is never missed.
 */
export function linkOnboardingToAccount(): Promise<void> {
  if (linking) {
    relink = true;
    return linking;
  }
  linking = (async () => {
    try {
      do {
        relink = false;
        await attemptLink();
      } while (relink);
    } catch {
      /* try again on the next save, sign-in or page load */
    } finally {
      linking = null;
    }
  })();
  return linking;
}

/** Call once near the top of <App />. Links answers whenever someone is signed in. */
export function useLinkOnboardingOnSignIn() {
  useEffect(() => {
    // setTimeout: don't call Supabase from inside its own auth callback.
    const run = () => void setTimeout(() => void linkOnboardingToAccount(), 0);

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) run();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) run();
    });
    return () => sub.subscription.unsubscribe();
  }, []);
}
