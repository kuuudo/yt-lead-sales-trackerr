// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/InstallationOnboarding/globalAttributionCompletion.ts
// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for the Global Attribution "Mark as complete"
// flag. This is a MANUAL, browser-remembered confirmation — not a
// server-verified state — so it deliberately lives in localStorage, not
// Supabase. No migration, no new column.
//
// Scoped by campaignId + path so multiple campaigns and multiple paths
// (Direct Purchase / Newsletter / Sales Call / Paid Consultation) never
// bleed into each other. `path` reuses the exact same string literals
// already used by installationHelpers.ts's getFunnelState/getTrackingState
// ('purchase' | 'newsletter' | 'salesCall' | 'consultation') rather than
// inventing a second taxonomy.
//
// Both OnboardingOverlay.tsx (to gate Pixel Setup clickability) and
// GlobalAttributionOnboarding.tsx (to show its own toggle) read/write
// through these functions — the key format itself is never duplicated.
// ─────────────────────────────────────────────────────────────────────────

export type GlobalAttributionPath = 'purchase' | 'newsletter' | 'salesCall' | 'consultation';

function storageKey(campaignId: string, path: GlobalAttributionPath): string {
  return `vstrk_global_attribution_${campaignId}_${path}`;
}

/**
 * Reads the manual completion flag for a given campaign + path.
 * Safe to call with null/undefined (e.g. before campaignId/path are known)
 * — returns false rather than throwing.
 */
export function isGlobalAttributionComplete(
  campaignId: string | null | undefined,
  path: GlobalAttributionPath | null | undefined
): boolean {
  if (!campaignId || !path) return false;
  try {
    return localStorage.getItem(storageKey(campaignId, path)) === 'true';
  } catch {
    // localStorage can throw (private browsing, disabled storage, SSR) —
    // this is a non-critical manual flag, so fail safe to "not complete"
    // rather than crash the hub.
    return false;
  }
}

/**
 * Sets (or clears) the manual completion flag for a given campaign + path.
 */
export function setGlobalAttributionComplete(
  campaignId: string,
  path: GlobalAttributionPath,
  completed: boolean = true
): void {
  try {
    if (completed) {
      localStorage.setItem(storageKey(campaignId, path), 'true');
    } else {
      localStorage.removeItem(storageKey(campaignId, path));
    }
  } catch {
    // Same reasoning as above — swallow storage errors silently.
  }
}
