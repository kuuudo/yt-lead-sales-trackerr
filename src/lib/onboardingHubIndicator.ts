// src/lib/onboardingHubIndicator.ts
//
// Drives the "Get Started" dot in the main nav. This is an INDICATOR only —
// nothing here opens a popup or navigates anywhere. The Getting Started page
// (/settings/getting-started) is a normal page the user opens when ready.
//
// One localStorage record per REAL signed-in user (useAuth().user.id).
// Deliberately NOT useEffectiveIdentity().userId: during Operator viewing
// mode that returns the viewed member's id, which would mix up state
// between accounts.
//
// The dot shows when ANY of these is true:
//   1. New user      — no record yet (seenReleaseKey is null).
//   2. Product update — seenReleaseKey !== HUB_RELEASE_KEY. To intentionally
//      re-surface the Hub, bump HUB_RELEASE_KEY in a commit. Routine deploys
//      do nothing.
//   3. Inactive return — the user was away INACTIVE_DAYS or more
//      (needsAttention is persisted so every hook instance agrees).
//
// Opening the Getting Started page (markSeen) clears 2 and 3. It never
// touches tutorial progress — Hub state and guide state are independent.
// No database, no migrations.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';

/** Bump this string to show the indicator again to every user (new feature / important update). */
export const HUB_RELEASE_KEY = '2026-10';

/** Days away before the indicator comes back. */
const INACTIVE_DAYS = 10;
const INACTIVE_MS = INACTIVE_DAYS * 24 * 60 * 60 * 1000;

const CHANGE_EVENT = 'vstrk-onboarding-hub-changed';

interface HubRecord {
  seenReleaseKey: string | null;
  needsAttention: boolean;
  lastActiveAt: number;
}

function storageKey(userId: string) {
  return `vstrk_onboarding_hub:${userId}`;
}

function readRecord(userId: string): HubRecord | null {
  const raw = localStorage.getItem(storageKey(userId));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return {
    seenReleaseKey: typeof parsed?.seenReleaseKey === 'string' ? parsed.seenReleaseKey : null,
    needsAttention: parsed?.needsAttention === true,
    lastActiveAt: typeof parsed?.lastActiveAt === 'number' ? parsed.lastActiveAt : Date.now(),
  };
}

function writeRecord(userId: string, record: HubRecord) {
  localStorage.setItem(storageKey(userId), JSON.stringify(record));
}

function shouldShow(record: HubRecord): boolean {
  return record.seenReleaseKey !== HUB_RELEASE_KEY || record.needsAttention;
}

/**
 * Runs on each app load for the signed-in user: applies the inactivity rule,
 * stamps lastActiveAt, and returns whether the dot should show. Safe to call
 * from several hook instances — the persisted needsAttention flag means a
 * second call can't "forget" an inactivity gap the first call detected.
 * Any storage failure (private mode, quota) => no dot, never an error.
 */
function touchAndEvaluate(userId: string): boolean {
  try {
    const now = Date.now();
    const existing = readRecord(userId);
    const record: HubRecord = existing ?? {
      seenReleaseKey: null,
      needsAttention: false,
      lastActiveAt: now,
    };
    if (existing && now - existing.lastActiveAt >= INACTIVE_MS) {
      record.needsAttention = true;
    }
    record.lastActiveAt = now;
    writeRecord(userId, record);
    return shouldShow(record);
  } catch {
    return false;
  }
}

function evaluate(userId: string): boolean {
  try {
    const record = readRecord(userId);
    return record ? shouldShow(record) : false;
  } catch {
    return false;
  }
}

function markSeenFor(userId: string) {
  try {
    const existing = readRecord(userId);
    writeRecord(userId, {
      seenReleaseKey: HUB_RELEASE_KEY,
      needsAttention: false,
      lastActiveAt: existing?.lastActiveAt ?? Date.now(),
    });
  } catch {
    // Indicator is a convenience — ignore storage failures.
  }
}

export function useOnboardingHubIndicator(): { showDot: boolean; markSeen: () => void } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [showDot, setShowDot] = useState(false);

  useEffect(() => {
    if (!userId) {
      setShowDot(false);
      return;
    }
    setShowDot(touchAndEvaluate(userId));

    // Keep every instance (desktop nav, mobile nav, the page itself) and
    // other tabs in sync when the dot is cleared.
    const onChange = () => setShowDot(evaluate(userId));
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [userId]);

  const markSeen = useCallback(() => {
    if (!userId) return;
    markSeenFor(userId);
    setShowDot(false);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [userId]);

  return { showDot, markSeen };
}
