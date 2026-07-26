-- Phase 2C — Revoke Asset Access
--
-- Terminology note (locked): this REVOKES ACCESS, it does not "remove"
-- or delete the asset, assignment_assets row, or anything else. The
-- asset remains permanently authorized into the Assignment
-- (assignment_assets is untouched) — only this one collaborator's
-- permission to it changes.
--
-- Authorization: IDENTICAL boundary to remove_assignment_collaborator /
-- restore_assignment_collaborator — assignments.created_by_user_id =
-- auth.uid() only. Not organization_members, not the collaborator
-- themselves, not other collaborators.
--
-- Additional guard this RPC needs that the collaborator-lifecycle RPCs
-- didn't: verifying (assignment_collaborator_id, asset_id) is actually a
-- real, currently-authorized pair — i.e. this asset genuinely belongs to
-- this collaborator's Assignment via assignment_assets. Without this,
-- the RPC would happily create an access-state row for an asset that
-- was never part of the Assignment at all.
--
-- Does NOT touch: assignment_assets, promotion_assets, assets,
-- promotions, promotions.status, assignment_collaborators. Only ever
-- writes assignment_asset_access_states for one (collaborator, asset)
-- pair.

CREATE OR REPLACE FUNCTION public.revoke_assignment_asset_access(
  p_assignment_collaborator_id uuid,
  p_asset_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_assignment_id uuid;
  v_assignment_creator uuid;
begin
  -- ── Resolve the collaborator's Assignment + its creator ─────────────
  select ac.assignment_id, a.created_by_user_id
  into v_assignment_id, v_assignment_creator
  from assignment_collaborators ac
  join assignments a on a.id = ac.assignment_id
  where ac.id = p_assignment_collaborator_id;

  if v_assignment_id is null then
    raise exception 'assignment_collaborator_id % not found', p_assignment_collaborator_id;
  end if;

  -- ── Authorization: caller must be this Assignment's creator ─────────
  if v_assignment_creator is distinct from auth.uid() then
    raise exception 'Not authorized: caller is not the creator of assignment %', v_assignment_id;
  end if;

  -- ── Guard: asset must actually be authorized into this Assignment ───
  if not exists (
    select 1 from assignment_assets
    where assignment_id = v_assignment_id and asset_id = p_asset_id
  ) then
    raise exception 'Asset % is not authorized into assignment %', p_asset_id, v_assignment_id;
  end if;

  -- ── Revoke: upsert, since this is very likely the first row ever ────
  -- written for this (collaborator, asset) pair — absence of a row
  -- means active, per the locked semantics. Idempotent: revoking an
  -- already-revoked pair just re-sets the same revoked_at value (functionally
  -- a no-op from the caller's perspective).
  insert into assignment_asset_access_states (
    assignment_collaborator_id,
    asset_id,
    revoked_at
  )
  values (
    p_assignment_collaborator_id,
    p_asset_id,
    now()
  )
  on conflict (assignment_collaborator_id, asset_id)
  do update set revoked_at = excluded.revoked_at
  where assignment_asset_access_states.revoked_at is null;
end;
$function$;
