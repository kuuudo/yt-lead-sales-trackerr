-- ============================================================
-- POST-MIGRATION VERIFICATION — Operator Read-Only Viewing (Phase 1)
-- 100% read-only. No CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/GRANT/REVOKE.
-- ============================================================

with expected_functions as (
  select unnest(array[
    'is_operator_for_user',
    'is_operator_for_org',
    'is_operator_for_email',
    'resolve_member_organization'
  ]) as function_name
),

expected_policies as (
  select unnest(array[
    'operator_read_campaigns',
    'operator_read_stripe_configs',
    'operator_read_videos',
    'operator_read_assets',
    'operator_read_asset_resources',
    'operator_read_pixel_purchases',
    'operator_read_stripe_purchases',
    'operator_read_campaign_element_assets',
    'operator_read_events',
    'operator_read_assignment_user_states',
    'operator_read_promotion_user_states'
  ]) as policy_name
),

affected_tables as (
  select unnest(array[
    'organization_members','profiles','campaigns','stripe_configs',
    'videos','assets','asset_resources','pixel_purchases',
    'stripe_purchases','campaign_element_assets','events',
    'assignments','assignment_invitations','assignment_user_states',
    'promotion_user_states','redirect_links','assignment_collaborators',
    'promotions'
  ]) as table_name
),

-- 1 & 2. Function existence + SECURITY DEFINER + search_path
functions_check as (
  select jsonb_agg(to_jsonb(f) order by f.function_name) as result
  from (
    select
      ef.function_name,
      (p.oid is not null) as exists_in_db,
      case when p.oid is not null then (case when p.prosecdef then 'DEFINER' else 'INVOKER' end) end as security,
      p.proconfig as config_settings,
      (p.proconfig is not null and exists (
        select 1 from unnest(p.proconfig) cfg where cfg ilike 'search_path=public%'
      )) as search_path_is_public,
      pg_get_function_identity_arguments(p.oid) as arguments
    from expected_functions ef
    left join pg_proc p
      on p.proname = ef.function_name
     and p.pronamespace = 'public'::regnamespace
  ) f
),

-- 3. EXECUTE grants to authenticated
function_grants_check as (
  select jsonb_agg(to_jsonb(g) order by g.function_name) as result
  from (
    select
      ef.function_name,
      bool_or(rp.grantee = 'authenticated' and rp.privilege_type = 'EXECUTE') as authenticated_has_execute
    from expected_functions ef
    left join information_schema.routines r
      on r.routine_name = ef.function_name and r.routine_schema = 'public'
    left join information_schema.routine_privileges rp
      on rp.specific_name = r.specific_name and rp.specific_schema = r.specific_schema
    group by ef.function_name
  ) g
),

-- 4. New Operator policies exist, with their cmd/using expressions
new_policies_check as (
  select jsonb_agg(to_jsonb(p) order by p.policy_name) as result
  from (
    select
      ep.policy_name,
      (pol.policyname is not null) as exists_in_db,
      pol.tablename,
      pol.cmd,
      pol.roles,
      pol.qual as using_expression
    from expected_policies ep
    left join pg_policies pol
      on pol.policyname = ep.policy_name and pol.schemaname = 'public'
  ) p
),

-- 4b. Any expected policy names missing entirely
missing_policies_check as (
  select coalesce(jsonb_agg(policy_name), '[]'::jsonb) as result
  from expected_policies
  where policy_name not in (select policyname from pg_policies where schemaname = 'public')
),

-- 4c. Any expected function names missing entirely
missing_functions_check as (
  select coalesce(jsonb_agg(function_name), '[]'::jsonb) as result
  from expected_functions
  where function_name not in (
    select proname from pg_proc where pronamespace = 'public'::regnamespace
  )
),

-- 6. Confirm none of the new policies grant write access
new_policies_write_check as (
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) as result
  from (
    select policyname, tablename, cmd
    from pg_policies
    where schemaname = 'public'
      and policyname in (select policy_name from expected_policies)
      and cmd <> 'SELECT'
  ) p
  -- non-empty result here would be a problem: means a write policy was created
),

-- 5. Full current policy list on affected tables (compare row-by-row
-- against your pre-migration inspection output to confirm nothing
-- pre-existing was dropped/replaced)
all_current_policies as (
  select jsonb_agg(to_jsonb(p) order by p.tablename, p.policyname) as result
  from (
    select schemaname, tablename, policyname, cmd, roles
    from pg_policies
    where schemaname = 'public'
      and tablename in (select table_name from affected_tables)
  ) p
),

-- 7. RLS enabled/forced status on all affected tables (compare against
-- pre-migration baseline you already have)
rls_status_check as (
  select jsonb_agg(to_jsonb(r) order by r.table_name) as result
  from (
    select
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join affected_tables t on t.table_name = c.relname
    where n.nspname = 'public'
  ) r
)

select 'functions_check (expect exists_in_db=true, security=DEFINER, search_path_is_public=true for all 4)' as section, result from functions_check
union all
select 'function_grants_check (expect authenticated_has_execute=true for all 4)' as section, result from function_grants_check
union all
select 'new_policies_check (expect exists_in_db=true, cmd=SELECT for all 11)' as section, result from new_policies_check
union all
select 'missing_policies_check (expect empty array [])' as section, result from missing_policies_check
union all
select 'missing_functions_check (expect empty array [])' as section, result from missing_functions_check
union all
select 'new_policies_write_check (expect empty array [] — any entry here is a problem)' as section, result from new_policies_write_check
union all
select 'all_current_policies (compare against pre-migration list — every old policy name should still be present, plus the 11 new ones)' as section, result from all_current_policies
union all
select 'rls_status_check (compare rls_enabled per table against pre-migration baseline — should be identical)' as section, result from rls_status_check;