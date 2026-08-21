begin;

-- ============================================================
-- Kaksi Privileged Operator Access — Phase 2
-- Adds ONE more OR branch to is_operator_for_user(), on top of the
-- currently-deployed version (Alin branch + original owner/member
-- branch, both left byte-for-byte unchanged below).
--
-- New branch: auth.uid() = KAKSI_UUID AND target has an ACTIVE row
-- in kaksi_operator_access. Not unconditional — Kaksi is authorized
-- ONLY for targets explicitly added via that table.
--
-- resolve_member_organization(), is_operator_for_org(), and all 11
-- operator_read_* RLS policies are untouched — they call this
-- function and inherit the new branch automatically, with zero
-- changes needed on their end.
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
    -- Kaksi branch: privileged caller identity is checked server-side
    -- via auth.uid() (set by Supabase from the verified JWT), never
    -- from anything the frontend sends. Requires an ACTIVE row in
    -- kaksi_operator_access for THIS specific target — Kaksi does not
    -- pass for arbitrary UUIDs, only ones explicitly added.
    (
      auth.uid() = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid
      and exists (
        select 1 from kaksi_operator_access koa
        where koa.target_user_id = is_operator_for_user.target_user_id
          and koa.status = 'active'
      )
    )
    or
    -- Alin POC bypass — unchanged from the currently deployed version.
    (
      target_user_id = 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid
      and exists (
        select 1 from organization_members owner_row
        where owner_row.user_id = auth.uid()
          and owner_row.role = 'owner'
      )
    )
    or
    -- Original owner/member same-org logic — unchanged.
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