/**
 * Phase 3E Step 1 — continuation pre-check for cookie candidates.
 *
 * Cookie presence alone is NOT a HIT. A candidate is usable only if the
 * previous hop (from vt_token) looks like a valid continuation into the
 * token the visitor just clicked.
 *
 * Does NOT replace validateJourneyContinuation / appendJourneyNode —
 * those remain authoritative after recovery. This is discovery-only.
 */

import { resolveRedirectToken } from './redirects';
import { resolveDestinationVideoId } from './tracker';

/**
 * Returns true when previousToken's resolved destination aligns with
 * currentToken's video_id (same fast-path idea as the locked journey validator).
 */
export async function isContinuationPrecheckHit(
  previousToken: string,
  currentToken: string
): Promise<boolean> {
  if (!previousToken || !currentToken) return false;
  if (previousToken === currentToken) return false;

  try {
    const [prevLink, currLink] = await Promise.all([
      resolveRedirectToken(previousToken),
      resolveRedirectToken(currentToken),
    ]);

    if (!prevLink || !currLink) return false;

    const currentVideoId = (currLink as { video_id?: string }).video_id;
    if (!currentVideoId) return false;

    const previousDestinationVideoId = await resolveDestinationVideoId(
      (prevLink as { destination_url?: string }).destination_url,
      (prevLink as { asset_id?: string | null }).asset_id ?? null
    );

    if (!previousDestinationVideoId) return false;

    const hit = previousDestinationVideoId === currentVideoId;
    console.log('[continuationPrecheck]', {
      previousToken,
      currentToken,
      previousDestinationVideoId,
      currentVideoId,
      hit,
    });
    return hit;
  } catch (err) {
    console.warn('[continuationPrecheck] failed — treating as MISS', err);
    return false;
  }
}

/** True when this origin has a vt_token that prechecks as continuation into currentToken. */
export async function currentOriginCookieIsUsableHit(
  currentToken: string,
  getStoredRedirectToken: () => string | null
): Promise<boolean> {
  const previousToken = getStoredRedirectToken();
  if (!previousToken) return false;
  return isContinuationPrecheckHit(previousToken, currentToken);
}
