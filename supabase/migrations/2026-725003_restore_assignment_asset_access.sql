-- Phase 2C — Restore Asset Access
--
-- Mirror-image of revoke_assignment_asset_access. Same authorization
-- boundary, same "status flip only" discipline.
--
-- No membership guard needed here (unlike revoke): if no
-- assignment_asset_access_states row exists at all, there is nothing to
-- restore and this is already a natural no-op — the asset was never
-- revoked in the first place, per the "absence of a row = active"
-- semantics.

CREATE OR REPLACE FUNCTION public.restore_assignment_asset_access(
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
  -- Same rule as revoke_assignment_asset_access, checked identically.
  if v_assignment_creator is distinct from auth.uid() then
    raise exception 'Not authorized: caller is not the creator of assignment %', v_assignment_id;
  end if;

  -- ── Restore: clear revoked_at. No-op if no row exists (never
  -- revoked) or already active — both cases naturally affect zero rows.
  update assignment_asset_access_states
  set revoked_at = null
  where assignment_collaborator_id = p_assignment_collaborator_id
    and asset_id = p_asset_id
    and revoked_at is not null;
end;
$function$;
