/**
 * Thin server-side mapping: vt_visitor → journey_id
 * Does NOT duplicate event_journey. event_journey remains source of truth.
 */

import { supabase } from './supabase';
import { getOrCreateVisitorId, getVisitorId } from './visitorCookie';

/**
 * Fire-and-forget association.
 * Call when leaving VSTRK for an external destination so the browser
 * identity is linked to the journey that is about to go to YouTube.
 * Never blocks navigation.
 */
export function associateVisitorWithJourney(journeyId: string | null): void {
  if (!journeyId) return;

  try {
    const visitorId = getOrCreateVisitorId();

    // Fire-and-forget — do not await.
    void supabase
      .rpc('upsert_visitor_journey', {
        p_visitor_id: visitorId,
        p_journey_id: journeyId,
      })
      .then(({ error }: { error: any }) => {
        if (error) {
          console.warn('[visitorJourney] upsert failed (non-fatal):', error.message);
        } else {
          console.debug('[visitorJourney] associated', { visitorId, journeyId });
        }
      });
  } catch (err) {
    console.warn('[visitorJourney] associate threw (non-fatal):', err);
  }
}

/**
 * Non-blocking lookup. Returns the previously associated journey_id or null.
 * Intended to run in parallel with existing Track fetches.
 */
export async function getJourneyIdForVisitor(): Promise<string | null> {
  const visitorId = getVisitorId();
  if (!visitorId) return null;

  try {
    const { data, error } = await supabase.rpc('get_journey_for_visitor', {
      p_visitor_id: visitorId,
    });

    if (error) {
      console.warn('[visitorJourney] lookup failed (non-fatal):', error.message);
      return null;
    }

    return (data as string | null) ?? null;
  } catch (err) {
    console.warn('[visitorJourney] lookup threw (non-fatal):', err);
    return null;
  }
}
