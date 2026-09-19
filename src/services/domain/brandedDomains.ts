/**
 * Minimal verified branded-domain loader for Sponsor org (Promotion Detail).
 */
import { supabase } from '../../lib/supabase';

export interface VerifiedDomainOption {
  id: string;
  hostname: string;
}

export async function listVerifiedBrandedDomains(
  organizationId: string
): Promise<VerifiedDomainOption[]> {
  // Prefer status = verified when column exists; fall back to all org domains.
  let q = supabase
    .from('branded_tracking_domains')
    .select('id, hostname, status')
    .eq('organization_id', organizationId)
    .order('hostname');

  const { data, error } = await q;
  if (error) {
    throw new Error(error.message ?? 'Failed to list branded tracking domains');
  }

  return (data ?? [])
    .filter((d: any) => {
      const st = (d.status as string | undefined)?.toLowerCase();
      if (!st) return true;
      return st === 'verified' || st === 'active' || st === 'ok';
    })
    .map((d: any) => ({
      id: d.id as string,
      hostname: (d.hostname as string) || (d.id as string),
    }));
}
