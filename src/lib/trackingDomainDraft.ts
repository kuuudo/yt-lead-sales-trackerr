/**
 * lib/trackingDomainDraft.ts
 *
 * Temporary, browser-local draft of the Step 1 root domain in the onboarding
 * tracking-domain step. It is NOT a tracking domain and NOT a source of truth:
 *
 *   • stores only { root, savedAt } — no hostname, token, status, or any
 *     branded-domain field
 *   • never written to Supabase; never touches campaigns.root_domain
 *   • only used to prefill the Step 1 input after a refresh / return visit
 *   • every read re-validates, so a stale, corrupt or hand-edited entry is
 *     deleted and ignored
 *
 * Key:   vstrk_tracking_domain_setup_draft:<userId>:<campaignId>
 * Value: {"root":"kaksidigitals.com","savedAt":1791200000000}
 *
 * All storage access is wrapped in try/catch (private mode / blocked storage);
 * on any failure the functions simply behave as "no draft".
 */

import { isSupportedOnboardingRoot } from './trackingHostname';

export const DRAFT_KEY_PREFIX = 'vstrk_tracking_domain_setup_draft';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000; // tolerate 1 day of clock skew

const keyFor = (userId: string, campaignId: string) => `${DRAFT_KEY_PREFIX}:${userId}:${campaignId}`;

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Returns a still-valid draft root, or null. Invalid/stale entries are deleted. */
export function readDraft(
  userId: string | null | undefined,
  campaignId: string,
  now: number = Date.now()
): string | null {
  if (!userId || !campaignId) return null;
  const store = storage();
  if (!store) return null;
  const key = keyFor(userId, campaignId);

  try {
    const raw = store.getItem(key);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const { root, savedAt } = parsed as { root?: unknown; savedAt?: unknown };
      if (
        typeof root === 'string' &&
        typeof savedAt === 'number' &&
        Number.isFinite(savedAt) &&
        now - savedAt <= MAX_AGE_MS &&
        savedAt <= now + MAX_FUTURE_SKEW_MS &&
        isSupportedOnboardingRoot(root)
      ) {
        return root;
      }
    }
    store.removeItem(key); // stale, malformed or no longer valid
    return null;
  } catch {
    try {
      store.removeItem(key); // corrupt JSON
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** Saves a draft. Refuses (returns false) unless `root` is already a valid normalized root. */
export function saveDraft(
  userId: string | null | undefined,
  campaignId: string,
  root: string,
  now: number = Date.now()
): boolean {
  if (!userId || !campaignId || !isSupportedOnboardingRoot(root)) return false;
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(keyFor(userId, campaignId), JSON.stringify({ root, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(userId: string | null | undefined, campaignId: string): void {
  if (!userId || !campaignId) return;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(keyFor(userId, campaignId));
  } catch {
    /* ignore */
  }
}
