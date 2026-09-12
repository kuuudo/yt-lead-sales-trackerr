/**
 * Entry Choice — browser-local UX gate in front of the Phase 3E discovery
 * block in Track.tsx.
 *
 * This is UX/permission state only. It answers exactly one question:
 * "has this browser already told us whether it's okay to attempt Relay?"
 *
 * It is explicitly NOT:
 *   - a journey ID
 *   - an attribution signal
 *   - a conversion or campaign signal
 *   - a visitor identity
 *   - a replacement for vt_visitor / visitor_journeys / events_journey
 *
 * The existing vt_visitor → visitor_journeys → journey recovery chain
 * remains the sole source of truth for whether a journey can actually be
 * recovered. This module never reads or writes that data.
 *
 * Storage: localStorage on the current origin, not a database row —
 * intentionally, so this feature does not add a row per visitor.
 * localStorage is origin-scoped, so vstrk.com and each branded custom
 * domain each hold an independent choice in this first version. A
 * visitor who crosses origins mid-journey (e.g. vstrk.com → a branded
 * domain) will see the gate once per origin, not once across the whole
 * VSTRK ecosystem. Solving that would require either a database row
 * keyed by visitor identity (which this feature intentionally avoids)
 * or a cross-origin sync mechanism — flagged as a known v1 limitation,
 * not solved here.
 */

const STORAGE_KEY = 'vt_entry_choice';

export type EntryChoice = 'direct' | 'continue';

const isBrowser =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export function getEntryChoice(): EntryChoice | null {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'direct' || raw === 'continue' ? raw : null;
  } catch {
    // Storage unavailable (private browsing, disabled storage, etc.) —
    // treat as "no choice recorded" rather than throwing. Worst case the
    // gate reappears on a later visit; it never blocks the redirect.
    return null;
  }
}

export function setEntryChoice(choice: EntryChoice): void {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Non-fatal for the same reason as above.
  }
}

/**
 * App-level feature flag for the Entry Choice gate.
 *
 * PLACEHOLDER — always returns false today. That preserves exactly the
 * current, pre-Entry-Choice behavior everywhere this is called: no
 * modal, no new decision, existing Track.tsx → existing Phase 3E →
 * existing Relay, unchanged.
 *
 * This needs to be wired to VSTRK's real settings/config source (an
 * org-level settings row, an env var, a feature-flag service — whatever
 * the existing app configuration architecture actually is). No
 * settings/config files were available to inspect, so this is left as
 * an explicit seam rather than a guess at unknown schema.
 */
export function isEntryChoiceEnabled(): boolean {
  return false;
}
