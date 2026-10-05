import { supabase } from './supabase';

/**
 * Thin wrapper around claim_team_membership RPC.
 * Safe to call on every session load — idempotent on the server.
 * Errors are logged; callers should treat null as "no claim / no change".
 */
export async function claimTeamMembership(): Promise<{
  success: boolean;
  error?: string;
  customer_id?: string;
  role?: string;
  already_active?: boolean;
} | null> {
  try {
    const { data, error } = await supabase.rpc('claim_team_membership');
    if (error) {
      console.error('[claimTeamMembership] rpc error:', error);
      return null;
    }
    return data as {
      success: boolean;
      error?: string;
      customer_id?: string;
      role?: string;
      already_active?: boolean;
    };
  } catch (err) {
    console.error('[claimTeamMembership] unexpected error:', err);
    return null;
  }
}
