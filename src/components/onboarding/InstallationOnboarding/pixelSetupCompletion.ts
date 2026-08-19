// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/InstallationOnboarding/pixelSetupCompletion.ts
// ─────────────────────────────────────────────────────────────────────────
// Manual "Mark as complete" flag for each Pixel Setup screen. Deliberately
// its own type and its own localStorage key prefix — NOT shared with
// globalAttributionCompletion.ts — so Global Attribution completion and
// Pixel Setup completion can never leak into each other, by construction.
// No Supabase column, no migration — manual, browser-remembered only.
// ─────────────────────────────────────────────────────────────────────────

export type PixelSetupPath = 'purchase' | 'newsletter' | 'salesCall' | 'consultation';

function storageKey(campaignId: string, path: PixelSetupPath): string {
  return `vstrk_pixel_setup_${campaignId}_${path}`;
}

/**
 * Reads the manual completion flag for a given campaign + path.
 * Safe to call with null/undefined — returns false rather than throwing.
 */
export function isPixelSetupComplete(
  campaignId: string | null | undefined,
  path: PixelSetupPath | null | undefined
): boolean {
  if (!campaignId || !path) return false;
  try {
    return localStorage.getItem(storageKey(campaignId, path)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Sets (or clears) the manual completion flag for a given campaign + path.
 */
export function setPixelSetupComplete(
  campaignId: string,
  path: PixelSetupPath,
  completed: boolean = true
): void {
  try {
    if (completed) {
      localStorage.setItem(storageKey(campaignId, path), 'true');
    } else {
      localStorage.removeItem(storageKey(campaignId, path));
    }
  } catch {
    // non-critical manual flag — swallow storage errors silently
  }
}