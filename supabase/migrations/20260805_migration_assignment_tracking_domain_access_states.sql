-- PR1 — Per-collaborator Tracking Domain Access.
--
-- Mirrors assignment_asset_access_states exactly: same grain
-- (assignment_collaborator_id, target_id), same "absence of a row =
-- active" convention, same authorization boundary
-- (assignments.created_by_user_id = auth.uid() only).
--
-- SCOPE OF THIS MIGRATION: table + RLS + RPCs only. No service layer,
-- no UI, no changes to getPromotionDetail.ts, PromotionDetail.tsx,
-- resolvePromotionContextForAsset.ts, getAssignmentDetail.ts, or
-- Videos.tsx. Those are separate PRs.
--
-- LOCKED BUSINESS RULES this schema encodes:
--   - Revocation is per (assignment_collaborator_id,
--     branded_tracking_domain_id) — never Assignment-wide, never
--     domain-wide. Revoking for one collaborator does not affect the
--     domain owner's own use of it, nor any other collaborator's.
--   - Existing redirect_links rows are a permanent snapshot — this
--     table has no relationship to redirect_links at all and never
--     will; revocation only affects what's offered for NEW link
--     generation going forward (Track New Content dropdown, PR4).
--   - assignment_tracking_domains (the Assignment-wide "what's shared"
--     list) is untouched by this table and stays the sole source of
--     truth for Assignment Detail, which never shows revoke status.

create table assignment_tracking_domain_access_states (
  assignment_collaborator_id  uuid not null references assignment_collaborators(id) on delete cascade,
  branded_tracking_domain_id  uuid not null references branded_tracking_domains(id) on delete cascade,
  revoked_at                  timestamptz null,
  primary key (assignment_collaborator_id, branded_tracking_domain_id)
);

alter table assignment_tracking_domain_access_states enable row level security;

-- Read access: the Assignment's creator can see all rows for their own
-- Assignment's collaborators (needed for Promotion Detail's Sponsor
-- view). A collaborator can see only their own rows (needed for both
-- Promotion Detail's collaborator view and, later, Track New Content's
-- filtered dropdown in PR4).
create policy "attd_access_states_select_by_creator"
  on assignment_tracking_domain_access_states
  for select
  using (
    exists (
      select 1
      from assignment_collaborators ac
      join assignments a on a.id = ac.assignment_id
      where ac.id = assignment_tracking_domain_access_states.assignment_collaborator_id
        and a.created_by_user_id = auth.uid()
    )
  );

create policy "attd_access_states_select_by_collaborator"
  on assignment_tracking_domain_access_states
  for select
  using (
    exists (
      select 1
      from assignment_collaborators ac
      where ac.id = assignment_tracking_domain_access_states.assignment_collaborator_id
        and ac.user_id = auth.uid()
    )
  );

-- No direct insert/update/delete policies — all writes go through the
-- two SECURITY DEFINER RPCs below, same convention as
-- assignment_asset_access_states.

-- ── Revoke ────────────────────────────────────────────────────────────
-- Revoke is only ever triggered by an explicit Sponsor click — no
-- automatic/time-based revocation. Authorization: caller must be the
-- creator of the Assignment this collaborator belongs to.
CREATE OR REPLACE FUNCTION public.revoke_assignment_tracking_domain_access(
  p_assignment_collaborator_id uuid,
  p_branded_tracking_domain_id uuid
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
  select ac.assignment_id, a.created_by_user_id
  into v_assignment_id, v_assignment_creator
  from assignment_collaborators ac
  join assignments a on a.id = ac.assignment_id
  where ac.id = p_assignment_collaborator_id;

  if v_assignment_id is null then
    raise exception 'assignment_collaborator_id % not found', p_assignment_collaborator_id;
  end if;

  if v_assignment_creator is distinct from auth.uid() then
    raise exception 'Not authorized: caller is not the creator of assignment %', v_assignment_id;
  end if;

  insert into assignment_tracking_domain_access_states (
    assignment_collaborator_id,
    branded_tracking_domain_id,
    revoked_at
  )
  values (
    p_assignment_collaborator_id,
    p_branded_tracking_domain_id,
    now()
  )
  on conflict (assignment_collaborator_id, branded_tracking_domain_id)
  do update set revoked_at = now();
end;
$function$;

-- ── Restore ───────────────────────────────────────────────────────────
-- Mirror-image of revoke. No-op if never revoked (no row exists) or
-- already active — both cases naturally affect zero rows, same
-- semantics as restore_assignment_asset_access.
CREATE OR REPLACE FUNCTION public.restore_assignment_tracking_domain_access(
  p_assignment_collaborator_id uuid,
  p_branded_tracking_domain_id uuid
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
  select ac.assignment_id, a.created_by_user_id
  into v_assignment_id, v_assignment_creator
  from assignment_collaborators ac
  join assignments a on a.id = ac.assignment_id
  where ac.id = p_assignment_collaborator_id;

  if v_assignment_id is null then
    raise exception 'assignment_collaborator_id % not found', p_assignment_collaborator_id;
  end if;

  if v_assignment_creator is distinct from auth.uid() then
    raise exception 'Not authorized: caller is not the creator of assignment %', v_assignment_id;
  end if;

  update assignment_tracking_domain_access_states
  set revoked_at = null
  where assignment_collaborator_id = p_assignment_collaborator_id
    and branded_tracking_domain_id = p_branded_tracking_domain_id
    and revoked_at is not null;
end;
$function$;
