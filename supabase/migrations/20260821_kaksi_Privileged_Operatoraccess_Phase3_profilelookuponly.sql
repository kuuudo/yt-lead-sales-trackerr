begin;

-- ============================================================
-- Kaksi Privileged Operator Access — Phase 3 (profile lookup only)
--
-- Root cause: profiles SELECT RLS has no branch that lets Kaksi look
-- up an arbitrary existing account by email — Kaksi matches none of
-- the 3 existing SELECT policies (own row / promotion counterpart /
-- org-owner via can_view_member_profile()) for a user Kaksi hasn't
-- been granted org access to yet. This is a NEW, separate policy —
-- it does not modify, replace, or interact with any of the 3
-- existing SELECT policies on profiles, which remain byte-for-byte
-- unchanged.
--
-- Scope: SELECT only, gated purely on auth.uid() = KAKSI_UUID.
-- This is intentionally NOT scoped to kaksi_operator_access, because
-- this policy's only job is DISCOVERY (finding the id for an email
-- before any access decision is possible) — the actual account
-- viewing authorization remains entirely behind
-- kaksi_operator_access -> is_operator_for_user() -> the existing
-- 11 operator_read_* RLS policies, none of which are touched here.
-- Idempotent — safe to re-run.
-- ============================================================

drop policy if exists kaksi_can_lookup_any_profile on public.profiles;
create policy kaksi_can_lookup_any_profile on public.profiles
  for select
  using (auth.uid() = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid);

commit;