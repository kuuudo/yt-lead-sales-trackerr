/**
 * src/services/assignment/assignmentTrackingDomainAccess.ts
 *
 * Per-collaborator Tracking Domain Access — direct mirror of
 * assignmentAssetAccess.ts. Same layering: this sits UNDER
 * assignment_collaborators (Layer 1: can this person participate at
 * all) and ABOVE which redirect_links actually got generated (Layer 3:
 * a permanent snapshot, untouched by anything in this file). This is
 * Layer 2: can this specific collaborator currently select this
 * specific Tracking Domain.
 *
 * TERMINOLOGY (locked, same as assets): "Revoke Access" / "Restore
 * Access" — the domain itself (branded_tracking_domains),
 * assignment_tracking_domains, and any promotion/redirect_links data
 * are never touched by anything in this file. Only
 * assignment_tracking_domain_access_states.revoked_at changes.
 *
 * GRAIN (locked): (assignment_collaborator_id, branded_tracking_domain_id)
 * — per person, per domain. Two collaborators on the same Assignment can
 * have independent access to the same domain. Never Assignment-wide,
 * never domain-wide. Revoking for one collaborator never affects the
 * domain owner's own use of it, nor any other collaborator's — see
 * locked business rule from the design discussion.
 *
 * Absence of a row = active (default), same convention as
 * assignment_asset_access_states and every other *_user_states /
 * *_access_states table in this codebase. A row only exists once
 * someone has revoked access at least once.
 *
 * Authorization for the write functions lives entirely server-side in
 * the RPCs (assignments.created_by_user_id = auth.uid() only) — this
 * file does not repeat or re-check that boundary, same convention as
 * assignmentAssetAccess.ts.
 *
 * Callers:
 *   - services/promotion/getPromotionDetail.ts (getTrackingDomainAccessStatesForCollaborator)
 *   - pages/PromotionDetail.tsx (revokeTrackingDomainAccess, restoreTrackingDomainAccess) — PR3
 */

import { supabase } from '../../lib/supabase';

/**
 * All (branded_tracking_domain_id -> revoked_at) access states for one
 * collaborator. Only domains that have ever been revoked appear here —
 * a branded_tracking_domain_id with no entry in this Map is active by
 * default. Mirrors getAssetAccessStatesForCollaborator's shape exactly.
 */
export async function getTrackingDomainAccessStatesForCollaborator(
  assignmentCollaboratorId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('assignment_tracking_domain_access_states')
    .select('branded_tracking_domain_id, revoked_at')
    .eq('assignment_collaborator_id', assignmentCollaboratorId)
    .not('revoked_at', 'is', null);

  if (error) {
    throw new Error(`Failed to load tracking domain access states: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row: any) => [row.branded_tracking_domain_id as string, row.revoked_at as string])
  );
}

/**
 * Revoke is only ever triggered by an explicit Sponsor click — there is
 * no automatic/time-based revocation anywhere.
 */
export async function revokeTrackingDomainAccess(
  assignmentCollaboratorId: string,
  brandedTrackingDomainId: string
): Promise<void> {
  const { error } = await supabase.rpc('revoke_assignment_tracking_domain_access', {
    p_assignment_collaborator_id: assignmentCollaboratorId,
    p_branded_tracking_domain_id: brandedTrackingDomainId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to revoke tracking domain access');
  }
}

/**
 * Restore only ever clears access for this exact (collaborator, domain)
 * pair — it can never affect another collaborator's access to the same
 * domain, and never touches assignment_tracking_domains,
 * branded_tracking_domains, or any promotion/redirect_links data.
 */
export async function restoreTrackingDomainAccess(
  assignmentCollaboratorId: string,
  brandedTrackingDomainId: string
): Promise<void> {
  const { error } = await supabase.rpc('restore_assignment_tracking_domain_access', {
    p_assignment_collaborator_id: assignmentCollaboratorId,
    p_branded_tracking_domain_id: brandedTrackingDomainId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to restore tracking domain access');
  }
}
