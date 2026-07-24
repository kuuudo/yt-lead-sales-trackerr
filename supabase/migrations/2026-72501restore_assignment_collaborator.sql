-- Phase 2A extension — Restore Collaborator
-- No migration needed: same column, same table, same text type as
-- remove_assignment_collaborator. This RPC is the mirror-image
-- counterpart: it is the only thing that writes 'active' back into
-- assignment_collaborators.status after a removal (accept_assignment_invitation
-- remains the only path that sets 'active' for a brand-new collaborator).
--
-- Authorization: IDENTICAL boundary to remove_assignment_collaborator —
-- assignments.created_by_user_id = auth.uid() only. Not
-- organization_members, not the collaborator themselves, not other
-- collaborators. Deliberately not reusing a shared helper function for
-- this one check — it's a single `distinct from` comparison, and
-- keeping it inline in both functions (matching the existing
-- create_promotion / accept_assignment_invitation convention of
-- self-contained validation per RPC) is simpler than introducing a new
-- shared authorization function for one line of logic.
--
-- Does NOT touch: assignments, assignment_assets, promotions,
-- promotion_assets, redirect_links, any archive/_user_states table,
-- promotion.status. Only ever writes assignment_collaborators.status for
-- one row. No cascading updates — every downstream permission check
-- already reads status='active' live, so restoring it here is
-- sufficient on its own for Shared Assets / Assignment Detail / the
-- Marketplace label to self-correct.

CREATE OR REPLACE FUNCTION public.restore_assignment_collaborator(
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
  -- Same rule as remove_assignment_collaborator, checked identically.
  if v_assignment_creator is distinct from auth.uid() then
    raise exception 'Not authorized: caller is not the creator of assignment %', v_assignment_id;
  end if;

  -- ── Idempotency guard — calling this twice is a harmless no-op ──────
  if v_current_status = 'active' then
    return;
  end if;

  -- ── The actual restoration: status flip only ────────────────────────
  update assignment_collaborators
  set status = 'active'
  where id = p_assignment_collaborator_id;
end;
$function$;
