-- Phase 2A — Remove Collaborator
-- No migration needed: assignment_collaborators.status is already `text`
-- with no CHECK constraint. This RPC is the only thing that writes
-- 'removed' into it. Mirrors accept_assignment_invitation's shape:
-- SECURITY DEFINER, validate, single status write, no cascading
-- deletes anywhere.
--
-- Authorization (LOCKED): assignments.created_by_user_id only. This is
-- an Assignment management operation, not an organization-level one —
-- the Sponsor who created the Assignment is the sole authority over who
-- collaborates on it. Superseded decision: an earlier MVP version used
-- organization_members (any org member could remove any collaborator).
-- That was a deliberate shortcut at the time but is not the locked
-- product rule — replaced outright, not extended. create_promotion's
-- org-owner path is intentionally left on organization_members; the two
-- RPCs now use different boundaries for different kinds of operations
-- (promoting vs. revoking access), which is a deliberate distinction,
-- not an inconsistency.
--
-- The collaborator themselves (assignment_collaborators.user_id) can
-- never remove themselves via this RPC — there is no self-service
-- "leave collaboration" path here by design. If a collaborator no
-- longer wants to participate, the product answer is to stop using the
-- assets or archive their own Promotion/Assignment view — not to revoke
-- the Sponsor's grant.
--
-- assignments.created_by_user_id is confirmed NOT NULL with zero
-- existing null rows (verified against the schema before this change),
-- so this comparison can never silently lock out a legitimate Sponsor
-- due to missing data.
--
-- Does NOT touch: assignment_assets, promotions, promotion_assets, any
-- archive/_user_states table, promotion.status. Only ever writes
-- assignment_collaborators.status for one row.

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
  v_assignment_created_by uuid;
  v_current_status text;
begin
  -- ── Resolve the collaborator row + its Assignment's creator ─────────
  select ac.assignment_id, ac.status, a.created_by_user_id
  into v_assignment_id, v_current_status, v_assignment_created_by
  from assignment_collaborators ac
  join assignments a on a.id = ac.assignment_id
  where ac.id = p_assignment_collaborator_id;

  if v_assignment_id is null then
    raise exception 'assignment_collaborator_id % not found', p_assignment_collaborator_id;
  end if;

  -- ── Authorization: caller must be the Assignment's creator (Sponsor) ─
  if v_assignment_created_by is distinct from auth.uid() then
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
