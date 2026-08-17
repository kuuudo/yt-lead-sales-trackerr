// src/lib/tutorial-overlay.tsx
//
// Global state for the interactive product-tour system. Mirrors the
// existing lib/onboarding-overlay.tsx pattern (context + provider, no
// prop-drilling) but tracks step position and per-tutorial persistence,
// since a tour has to survive real react-router navigation between
// pages, not just an open/closed boolean.
//
// Deliberately a SEPARATE context from OnboardingOverlayContext — that
// one is shaped around the setup wizard's single linear step machine
// and a single boolean. Tours are multiple (addressable by id) and need
// to persist step position across routes/refresh, so keeping this
// separate avoids bending the setup wizard's context into a shape it
// wasn't built for.

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './auth';
import type { Tutorial } from './tutorialTypes';

type TutorialStatus = 'idle' | 'active' | 'completed';

interface TutorialState {
  tutorial: Tutorial | null;
  stepIndex: number;
  status: TutorialStatus;
  /** Event keys reported via notify() for the CURRENT step only — reset on every step change. */
  satisfiedEventKeys: string[];
}

interface TutorialContextValue extends TutorialState {
  start: (tutorial: Tutorial) => void;
  resumeAt: (tutorial: Tutorial, stepIndex: number) => void;
  next: () => void;
  back: () => void;
  close: () => void;
  /** Called by real app code (e.g. Assets.tsx's onImported) to unlock a 'try-it' step. */
  notify: (eventKey: string) => void;
}

const TutorialContext = createContext<TutorialContextValue | undefined>(undefined);

function storageKey(userId: string | undefined, tutorialId: string) {
  return `vstrk_tutorial:${userId ?? 'anon'}:${tutorialId}`;
}

const INITIAL_STATE: TutorialState = {
  tutorial: null,
  stepIndex: 0,
  status: 'idle',
  satisfiedEventKeys: [],
};

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<TutorialState>(INITIAL_STATE);

  const persist = useCallback(
    (tutorialId: string, stepIndex: number, status: TutorialStatus) => {
      try {
        localStorage.setItem(
          storageKey(user?.id, tutorialId),
          JSON.stringify({ stepIndex, status, updatedAt: Date.now() })
        );
      } catch {
        // Persistence is a resume convenience, not a requirement —
        // silently skip on quota/private-mode errors.
      }
    },
    [user?.id]
  );

  const start = useCallback(
    (tutorial: Tutorial) => {
      setState({ tutorial, stepIndex: 0, status: 'active', satisfiedEventKeys: [] });
      persist(tutorial.id, 0, 'active');
    },
    [persist]
  );

  const resumeAt = useCallback(
    (tutorial: Tutorial, stepIndex: number) => {
      const safeIndex = Math.min(Math.max(stepIndex, 0), tutorial.steps.length - 1);
      setState({ tutorial, stepIndex: safeIndex, status: 'active', satisfiedEventKeys: [] });
    },
    []
  );

  const next = useCallback(() => {
    setState(prev => {
      if (!prev.tutorial) return prev;
      const isLast = prev.stepIndex >= prev.tutorial.steps.length - 1;
      if (isLast) {
        persist(prev.tutorial.id, prev.stepIndex, 'completed');
        return { ...INITIAL_STATE, status: 'completed' };
      }
      const nextIndex = prev.stepIndex + 1;
      persist(prev.tutorial.id, nextIndex, 'active');
      return { ...prev, stepIndex: nextIndex, satisfiedEventKeys: [] };
    });
  }, [persist]);

  const back = useCallback(() => {
    setState(prev => {
      if (!prev.tutorial || prev.stepIndex === 0) return prev;
      const prevIndex = prev.stepIndex - 1;
      persist(prev.tutorial.id, prevIndex, 'active');
      return { ...prev, stepIndex: prevIndex, satisfiedEventKeys: [] };
    });
  }, [persist]);

  // Explicit close (e.g. user dismisses mid-tour) — does NOT mark
  // completed, so a resume check on next visit could pick it back up.
  // v1 doesn't auto-resume from this path; see TutorialRunner comment.
  const close = useCallback(() => {
    setState({ ...INITIAL_STATE });
  }, []);

  const notify = useCallback((eventKey: string) => {
    setState(prev =>
      prev.satisfiedEventKeys.includes(eventKey)
        ? prev
        : { ...prev, satisfiedEventKeys: [...prev.satisfiedEventKeys, eventKey] }
    );
  }, []);

  return (
    <TutorialContext.Provider value={{ ...state, start, resumeAt, next, back, close, notify }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error('useTutorial must be used within TutorialProvider');
  }
  return ctx;
}

/**
 * Reads any persisted 'active' progress for a given tutorial, scoped to
 * the current user. Returns null if there's nothing to resume. This is
 * intentionally just a read — TutorialRunner decides whether to call
 * resumeAt() with it (v1 does, on mount, once).
 */
export function readPersistedProgress(
  userId: string | undefined,
  tutorialId: string
): { stepIndex: number } | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, tutorialId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.status !== 'active' || typeof parsed?.stepIndex !== 'number') return null;
    return { stepIndex: parsed.stepIndex };
  } catch {
    return null;
  }
}