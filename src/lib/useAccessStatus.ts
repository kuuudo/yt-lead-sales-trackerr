import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type AccessState = 'loading' | 'allowed' | 'inactive';

type Result = { userId: string; state: 'allowed' | 'inactive' };

/**
 * Manual access flag. Reads the signed-in user's own row in public.account_access.
 *  - status = 'inactive'                -> 'inactive'
 *  - status = 'active' / no row         -> 'allowed'
 *  - query error (V1: fail-open, logged) -> 'allowed'
 * Checked once per user id (login / page load).
 */
export function useAccessStatus(userId: string | null | undefined): AccessState {
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      let state: Result['state'] = 'allowed';
      try {
        const { data, error } = await supabase
          .from('account_access')
          .select('status')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.error('[useAccessStatus] query failed, failing open:', error);
        } else if (data?.status === 'inactive') {
          state = 'inactive';
        }
      } catch (err) {
        console.error('[useAccessStatus] unexpected error, failing open:', err);
      }
      if (!cancelled) setResult({ userId, state });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return 'allowed';
  // A result for a previous user must never apply to the current one.
  if (!result || result.userId !== userId) return 'loading';
  return result.state;
}