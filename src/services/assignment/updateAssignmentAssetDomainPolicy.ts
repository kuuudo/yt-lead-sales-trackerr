/**
 * Phase 1 — Promotion Detail per-asset domain capability writes.
 * Target: assignment_assets (Sponsor permission layer), NOT promotion_assets usage.
 */
import { supabase } from '../../lib/supabase';

export interface AssignmentAssetDomainPolicy {
  allow_marketer_domain: boolean;
  allow_sponsor_domain: boolean;
  allow_vstrk_domain: boolean;
  selected_sponsor_domain_id: string | null;
}

/**
 * Update Path B capability flags for one (assignment_id, asset_id).
 * When allow_sponsor_domain is false, selected_sponsor_domain_id is forced NULL.
 */
export async function updateAssignmentAssetDomainPolicy(
  assignmentId: string,
  assetId: string,
  patch: Partial<AssignmentAssetDomainPolicy>
): Promise<void> {
  const next: Partial<AssignmentAssetDomainPolicy> = { ...patch };
  if (next.allow_sponsor_domain === false) {
    next.selected_sponsor_domain_id = null;
  }

  const { data: existing, error: findErr } = await supabase
    .from('assignment_assets')
    .select('id, allow_marketer_domain, allow_sponsor_domain, allow_vstrk_domain, selected_sponsor_domain_id')
    .eq('assignment_id', assignmentId)
    .eq('asset_id', assetId)
    .maybeSingle();

  if (findErr) {
    throw new Error(findErr.message ?? 'Failed to load assignment asset policy');
  }
  if (!existing) {
    throw new Error('This asset is not on the Assignment — cannot update domain policy');
  }

  const payload = {
    allow_marketer_domain:
      next.allow_marketer_domain ?? !!existing.allow_marketer_domain,
    allow_sponsor_domain:
      next.allow_sponsor_domain ?? !!existing.allow_sponsor_domain,
    allow_vstrk_domain:
      next.allow_vstrk_domain ?? !!existing.allow_vstrk_domain,
    selected_sponsor_domain_id:
      next.allow_sponsor_domain === false
        ? null
        : next.selected_sponsor_domain_id !== undefined
          ? next.selected_sponsor_domain_id
          : (existing.selected_sponsor_domain_id as string | null),
  };

  if (!payload.allow_sponsor_domain) {
    payload.selected_sponsor_domain_id = null;
  }

  const { error } = await supabase
    .from('assignment_assets')
    .update(payload)
    .eq('id', existing.id);

  if (error) {
    throw new Error(error.message ?? 'Failed to update assignment asset domain policy');
  }
}

/**
 * Load Path B capability rows for an assignment (for Promotion Detail merge).
 */
export async function listAssignmentAssetDomainPolicies(
  assignmentId: string
): Promise<
  Map<
    string,
    AssignmentAssetDomainPolicy & { hostname?: string | null }
  >
> {
  const { data, error } = await supabase
    .from('assignment_assets')
    .select(
      'asset_id, allow_marketer_domain, allow_sponsor_domain, allow_vstrk_domain, selected_sponsor_domain_id'
    )
    .eq('assignment_id', assignmentId);

  if (error) {
    throw new Error(error.message ?? 'Failed to load assignment asset domain policies');
  }

  const domainIds = Array.from(
    new Set(
      (data ?? [])
        .map((r: any) => r.selected_sponsor_domain_id as string | null)
        .filter(Boolean) as string[]
    )
  );

  const hostnameById = new Map<string, string>();
  if (domainIds.length > 0) {
    const { data: domains } = await supabase
      .from('branded_tracking_domains')
      .select('id, hostname')
      .in('id', domainIds);
    for (const d of domains ?? []) {
      hostnameById.set(d.id as string, (d.hostname as string) || d.id);
    }
  }

  const map = new Map<
    string,
    AssignmentAssetDomainPolicy & { hostname?: string | null }
  >();
  for (const r of data ?? []) {
    const sid = r.selected_sponsor_domain_id as string | null;
    map.set(r.asset_id as string, {
      allow_marketer_domain: !!r.allow_marketer_domain,
      allow_sponsor_domain: !!r.allow_sponsor_domain,
      allow_vstrk_domain: !!r.allow_vstrk_domain,
      selected_sponsor_domain_id: sid,
      hostname: sid ? hostnameById.get(sid) ?? null : null,
    });
  }
  return map;
}
