-- =============================================================================
-- 004_operator_revenue_read.sql
--
-- Root causes (from the policy / function dump):
--   1. organization_members SELECT is own-row OR is_org_owner(org). An Operator
--      cannot read a MEMBER's own org owner-row -> memberRevenue.ts
--      resolveMemberOrganizationId() got null -> "Member organization not found".
--      FIX: frontend now calls the EXISTING SECURITY DEFINER RPC
--      resolve_member_organization(member_user_id), which already gates on
--      is_operator_for_user(). No new function needed.
--   2. campaign_monthly_snapshots has only "own organization" policies, so an
--      Operator reads 0 rows from a member's org. (campaigns already has
--      operator_read_campaigns, so listOrgCampaigns is not the blocker.)
--      FIX: add ONE read-only SELECT policy reusing the same authorization the
--      campaigns table already trusts: is_operator_for_org(organization_id).
--
-- What this does NOT do:
--   - no INSERT/UPDATE/DELETE policy for operators (no cross-org writes)
--   - no change to existing policies; normal users keep org isolation
--   - no RLS disabled, no service-role key, no SELECT granted to all users
--   - policies are permissive/OR'd: this one only adds rows where
--     is_operator_for_org() is true for auth.uid()
-- =============================================================================

begin;

-- 1. Operator read access to the member's snapshots (read-only, authenticated).
drop policy if exists campaign_monthly_snapshots_select_operator
  on public.campaign_monthly_snapshots;

create policy campaign_monthly_snapshots_select_operator
  on public.campaign_monthly_snapshots
  for select
  to authenticated
  using (public.is_operator_for_org(organization_id));

-- 2. Harden the existing resolver: signed-in users only (it already returns
--    null unless is_operator_for_user() passes, this just removes anon access).
--    Not used inside any RLS policy, so this cannot break policy evaluation.
revoke execute on function public.resolve_member_organization(uuid) from public;
revoke execute on function public.resolve_member_organization(uuid) from anon;
grant  execute on function public.resolve_member_organization(uuid) to authenticated;

commit;

-- =============================================================================
-- ROLLBACK
--   drop policy if exists campaign_monthly_snapshots_select_operator
--     on public.campaign_monthly_snapshots;
-- =============================================================================

-- =============================================================================
-- VERIFY in the Supabase SQL editor (run each block separately).
-- Replace the <placeholders>. set_config(..., true) is transaction-local.
-- =============================================================================
--
-- A. Operator (owner of the org that has the member) -> expect the member's rows
--
--   begin;
--   select set_config('request.jwt.claims',
--     '{"sub":"<OPERATOR_USER_ID>","role":"authenticated"}', true);
--   set local role authenticated;
--   select public.resolve_member_organization('<MEMBER_USER_ID>');   -- expect member's org uuid
--   select count(*), sum(revenue) from public.campaign_monthly_snapshots
--     where organization_id = '<MEMBER_ORG_ID>';                     -- expect > 0
--   rollback;
--
-- B. Ordinary user with NO operator relationship -> expect null and 0 rows
--
--   begin;
--   select set_config('request.jwt.claims',
--     '{"sub":"<UNRELATED_USER_ID>","role":"authenticated"}', true);
--   set local role authenticated;
--   select public.resolve_member_organization('<MEMBER_USER_ID>');   -- expect NULL
--   select count(*) from public.campaign_monthly_snapshots
--     where organization_id = '<MEMBER_ORG_ID>';                     -- expect 0
--   rollback;
--
-- C. Operator cannot write another org's snapshots -> expect RLS error / 0 rows
--
--   begin;
--   select set_config('request.jwt.claims',
--     '{"sub":"<OPERATOR_USER_ID>","role":"authenticated"}', true);
--   set local role authenticated;
--   update public.campaign_monthly_snapshots set revenue = revenue
--     where organization_id = '<MEMBER_ORG_ID>';                     -- expect UPDATE 0
--   rollback;
