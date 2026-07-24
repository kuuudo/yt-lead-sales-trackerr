-- Phase 2A — Remove Collaborator
-- No migration needed: assignment_collaborators.status is already `text`
-- with no CHECK constraint. This RPC is the only thing that writes
-- 'removed' into it. Mirrors accept_assignment_invitation /
-- create_promotion's shape: SECURITY DEFINER, validate, single status
-- write, no cascading deletes anywhere.
--
-- PHASE 2B FIX: authorization corrected to match the LOCKED rule —
-- assignments.created_by_user_id = auth.uid() only. The previous version
-- of this function checked organization_members instead (a deliberate
-- MVP shortcut at the time), which meant ANY member of the Assignment's
-- organization could remove any collaborator on it — not restricted to
-- the Assignment's creator. That no longer matches the product decision
-- and has been replaced outright, not extended alongside.
--
-- Does NOT touch: assignments, assignment_assets, promotions,
-- promotion_assets, any archive/_user_states table, promotion.status.
-- Only ever writes assignment_collaborators.status for one row.
-- Idempotency (no-op if already 'removed') is unchanged from before.

CREATE OR REPLACE FUNCTION public.remove_assignment_collaborator(
  p_assignment_collaborator_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_assignment_id uuid;
  v_assignment_creator uuid;
  v_current_status text;
begin
  -- ── Resolve the collaborator row + its Assignment's creator ─────────
  select ac.assignment_id, ac.status, a.created_by_user_id
  into v_assignment_id, v_current_status, v_assignment_creator
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

  -- ── Idempotency guard — calling this twice is a harmless no-op ──────
  if v_current_status = 'removed' then
    return;
  end if;

  -- ── The actual revocation: status flip only ─────────────────────────
  update assignment_collaborators
  set status = 'removed'
  where id = p_assignment_collaborator_id;
end;
$function$;
