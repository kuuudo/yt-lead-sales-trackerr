import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type TeamCustomer = {
  id: string;
  name: string;
  member_limit: number;
  status: string;
};

export type TeamMember = {
  id: string;
  email: string;
  role: string;
  status: string;
  user_id: string | null;
  activated_at: string | null;
  created_at: string;
};

type MyTeamState = {
  customer: TeamCustomer | null;
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * Reads the approved Owner's own customer + members via RLS.
 * Returns empty customer when the caller is not an approved Owner.
 */
export function useMyTeam(): MyTeamState {
  const [customer, setCustomer] = useState<TeamCustomer | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // RLS: only returns a row when caller is the approved Owner of that customer.
        const { data: customers, error: cErr } = await supabase
          .from('customers')
          .select('id, name, member_limit, status')
          .limit(1);

        if (cErr) throw cErr;

        const cust = (customers && customers[0]) ? customers[0] as TeamCustomer : null;

        if (!cust) {
          if (!cancelled) {
            setCustomer(null);
            setMembers([]);
            setLoading(false);
          }
          return;
        }

        const { data: memberRows, error: mErr } = await supabase
          .from('customer_members')
          .select('id, email, role, status, user_id, activated_at, created_at')
          .eq('customer_id', cust.id)
          .order('created_at', { ascending: true });

        if (mErr) throw mErr;

        if (!cancelled) {
          setCustomer(cust);
          setMembers((memberRows ?? []) as TeamMember[]);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('[useMyTeam]', err);
        if (!cancelled) {
          setCustomer(null);
          setMembers([]);
          setError(err?.message ?? 'Failed to load team');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { customer, members, loading, error, refresh };
}
