begin;

-- ============================================================
-- Operator POC — single-account bypass for Alin
-- alinospam2020@gmail.com (id: cd180432-44c5-4a20-b778-66b7753191f0)
--
-- Adds ONE extra OR condition to the existing gate. Original
-- owner+member same-org check is untouched below it. No new
-- tables, no changes to member_invitations / accept_invitation.
-- Idempotent — safe to re-run.
-- ============================================================

create or replace function public.is_operator_for_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    -- POC bypass: this one hardcoded target_user_id skips the
    -- organization_members check entirely. Any operator (owner
    -- of any org) passes for THIS target only.
    (
      target_user_id = 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid
      and exists (
        select 1 from organization_members owner_row
        where owner_row.user_id = auth.uid()
          and owner_row.role = 'owner'
      )
    )
    or
    -- Original logic — unchanged.
    exists (
      select 1
      from organization_members owner_row
      join organization_members target_row
        on target_row.organization_id = owner_row.organization_id
      where owner_row.user_id = auth.uid()
        and owner_row.role = 'owner'
        and target_row.user_id = target_user_id
        and target_row.role = 'member'
    );
$$;

commit;