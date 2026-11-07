-- =====================================================================
-- 00  PREFLIGHT  (READ-ONLY, changes nothing)
-- Run first. Returns ONE result set; compare each section to "expect".
-- =====================================================================
select 'a. existing functions (expect exactly 3: team_has_active_membership(), team_owned_customer_id(), team_is_admin())' as check_name,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as item,
       'secdef=' || p.prosecdef::text as detail
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('team_has_active_membership','team_owned_customer_id','team_is_admin')

union all
select 'b. new functions must NOT exist yet (expect 0 rows)',
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', '-'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_set_member_access','owner_set_member_access')

union all
select 'c. new column must NOT exist yet (expect 0 rows)', column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'customer_members'
  and column_name = 'access_revoked_by'

union all
select 'd. baseline rows by role/status (record these; seat counts must be identical after migration)',
       role || ' / ' || status, count(*)::text
from public.customer_members
group by role, status

union all
select 'e. current team_has_active_membership() body (expect: status=active AND customers.status=active, nothing about revocation)',
       p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'team_has_active_membership'

order by 1, 2;


-- =====================================================================
-- 01  MIGRATION  -  Team member deactivation
--
-- Adds ONE nullable column, ONE predicate in team_has_active_membership(),
-- and TWO RPCs. Nothing else.
--
-- NOT touched: seats / owner_add_members / admin_create_customer,
--   claim_team_membership, admin_set_customer_status, team_set_access,
--   account_access, subscriptions, Stripe, organizations, RLS policies,
--   grants on any existing table.
--
-- Everything runs in one transaction: any error rolls it all back.
-- Safe to run once. To undo, run 04_rollback.sql.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 0. Preconditions: stop immediately if the database is not in the state
--    we inspected (or if this migration was already applied).
-- ---------------------------------------------------------------------
do $pre$
begin
  if to_regclass('public.customer_members') is null then
    raise exception 'precondition failed: public.customer_members not found';
  end if;
  if to_regprocedure('public.team_has_active_membership()') is null then
    raise exception 'precondition failed: team_has_active_membership() not found';
  end if;
  if to_regprocedure('public.team_owned_customer_id()') is null then
    raise exception 'precondition failed: team_owned_customer_id() not found';
  end if;
  if to_regprocedure('public.team_is_admin()') is null then
    raise exception 'precondition failed: team_is_admin() not found';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_members'
      and column_name = 'access_revoked_by'
  ) then
    raise exception 'already applied: customer_members.access_revoked_by exists';
  end if;
end
$pre$;

-- ---------------------------------------------------------------------
-- 1. Revocation marker.
--    NULL  = access not revoked (every existing row stays NULL).
--    'admin' / 'owner' = who deactivated the member.
--    The row, its status and its user_id are never changed, so the slot
--    stays used and claim_team_membership() cannot undo the revocation
--    (it only touches rows whose status is 'pending').
-- ---------------------------------------------------------------------
alter table public.customer_members
  add column access_revoked_by text;

alter table public.customer_members
  add constraint customer_members_revoked_by_valid
    check (access_revoked_by is null or access_revoked_by in ('admin', 'owner')),
  add constraint customer_members_owner_never_revoked
    check (role <> 'owner' or access_revoked_by is null);

-- ---------------------------------------------------------------------
-- 2. Team entitlement: the existing definition plus ONE predicate.
--    Customer-level deactivation already worked here (c.status = 'active').
--    CREATE OR REPLACE keeps the owner and existing grants.
-- ---------------------------------------------------------------------
create or replace function public.team_has_active_membership()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.customer_members cm
    join public.customers c on c.id = cm.customer_id
    where cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.access_revoked_by is null
      and c.status = 'active'
  );
$function$;

-- ---------------------------------------------------------------------
-- 3. Admin: deactivate / reactivate ONE member of any customer.
--    - Locks only the member row (claim_team_membership locks member then
--      customer; locking the customer here could deadlock with it).
--    - Admin deactivation always records 'admin', so an Owner cannot undo it.
--    - Admin reactivation clears either kind.
--    - Owner rows can never be changed (also enforced by the CHECK above).
-- ---------------------------------------------------------------------
create or replace function public.admin_set_member_access(p_member_id uuid, p_active boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.customer_members%rowtype;
begin
  if not public.team_is_admin() then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  if p_member_id is null or p_active is null then
    return jsonb_build_object('success', false, 'error', 'invalid_input');
  end if;

  select * into v_row
  from public.customer_members
  where id = p_member_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'member_not_found');
  end if;

  if v_row.role = 'owner' then
    return jsonb_build_object('success', false, 'error', 'cannot_change_owner');
  end if;

  if v_row.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'member_not_active');
  end if;

  if p_active then
    -- Reactivate
    if v_row.access_revoked_by is null then
      return jsonb_build_object('success', true, 'member_id', v_row.id,
                                'access', 'active', 'unchanged', true);
    end if;

    update public.customer_members
    set access_revoked_by = null
    where id = v_row.id;

    return jsonb_build_object('success', true, 'member_id', v_row.id,
                              'access', 'active', 'unchanged', false);
  end if;

  -- Deactivate
  if v_row.access_revoked_by = 'admin' then
    return jsonb_build_object('success', true, 'member_id', v_row.id,
                              'access', 'revoked', 'unchanged', true);
  end if;

  update public.customer_members
  set access_revoked_by = 'admin'      -- also upgrades an 'owner' revocation
  where id = v_row.id;

  return jsonb_build_object('success', true, 'member_id', v_row.id,
                            'access', 'revoked', 'unchanged', false);
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Owner: deactivate / reactivate a member of THEIR OWN customer.
--    - Caller must be the approved Owner (team_owned_customer_id()).
--    - Another customer's member id is reported as member_not_found.
--    - Owner rows cannot be changed.
--    - An Admin revocation is never overwritten and can never be undone here.
-- ---------------------------------------------------------------------
create or replace function public.owner_set_member_access(p_member_id uuid, p_active boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid         uuid := auth.uid();
  v_customer_id uuid;
  v_cust_status text;
  v_row         public.customer_members%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_member_id is null or p_active is null then
    return jsonb_build_object('success', false, 'error', 'invalid_input');
  end if;

  v_customer_id := public.team_owned_customer_id();
  if v_customer_id is null then
    return jsonb_build_object('success', false, 'error', 'not_owner');
  end if;

  select status into v_cust_status
  from public.customers
  where id = v_customer_id;

  if v_cust_status is distinct from 'active' then
    return jsonb_build_object('success', false, 'error', 'customer_inactive');
  end if;

  select * into v_row
  from public.customer_members
  where id = p_member_id
    and customer_id = v_customer_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'member_not_found');
  end if;

  if v_row.role = 'owner' then
    return jsonb_build_object('success', false, 'error', 'cannot_change_owner');
  end if;

  if v_row.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'member_not_active');
  end if;

  if p_active then
    -- Reactivate
    if v_row.access_revoked_by is null then
      return jsonb_build_object('success', true, 'member_id', v_row.id,
                                'access', 'active', 'unchanged', true);
    end if;
    if v_row.access_revoked_by = 'admin' then
      return jsonb_build_object('success', false, 'error', 'revoked_by_admin');
    end if;

    update public.customer_members
    set access_revoked_by = null
    where id = v_row.id;

    return jsonb_build_object('success', true, 'member_id', v_row.id,
                              'access', 'active', 'unchanged', false);
  end if;

  -- Deactivate (never overwrite an existing revocation, in particular not 'admin')
  if v_row.access_revoked_by is not null then
    return jsonb_build_object('success', true, 'member_id', v_row.id,
                              'access', 'revoked', 'unchanged', true);
  end if;

  update public.customer_members
  set access_revoked_by = 'owner'
  where id = v_row.id;

  return jsonb_build_object('success', true, 'member_id', v_row.id,
                            'access', 'revoked', 'unchanged', false);
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Execute rights: signed-in users only (each function also checks the
--    caller itself). Applies to the two NEW functions only.
-- ---------------------------------------------------------------------
revoke all on function public.admin_set_member_access(uuid, boolean) from public, anon;
revoke all on function public.owner_set_member_access(uuid, boolean) from public, anon;
grant execute on function public.admin_set_member_access(uuid, boolean) to authenticated;
grant execute on function public.owner_set_member_access(uuid, boolean) to authenticated;

commit;


-- =====================================================================
-- 02  VERIFY AFTER MIGRATION  (READ-ONLY)
-- One result set. Every row has an "expect" in its first column.
-- =====================================================================
select 'column exists (expect 1 row: access_revoked_by / text / YES)' as check_name,
       column_name || ' / ' || data_type || ' / ' || is_nullable as result
from information_schema.columns
where table_schema = 'public' and table_name = 'customer_members' and column_name = 'access_revoked_by'

union all
select 'new constraints (expect 2 rows)', conname || ': ' || pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.customer_members'::regclass
  and conname in ('customer_members_revoked_by_valid','customer_members_owner_never_revoked')

union all
select 'team_has_active_membership has the revoked predicate (expect true)',
       (pg_get_functiondef('public.team_has_active_membership()'::regprocedure) ilike '%access_revoked_by is null%')::text

union all
select 'rows already revoked (expect 0 right after migration)',
       count(*)::text from public.customer_members where access_revoked_by is not null

union all
select 'baseline rows by role/status (must equal preflight section d)',
       role || ' / ' || status || ' = ' || count(*)::text
from public.customer_members group by role, status

union all
select 'EXECUTE rights (expect anon=false, authenticated=true for both)',
       f.fn || ': anon=' || has_function_privilege('anon', f.fn, 'EXECUTE')::text
            || ' authenticated=' || has_function_privilege('authenticated', f.fn, 'EXECUTE')::text
from (values ('public.admin_set_member_access(uuid,boolean)'),
             ('public.owner_set_member_access(uuid,boolean)')) as f(fn)

union all
select 'authenticated can read the new column (expect true; Admin/Owner reads still go through the existing RLS)',
       has_column_privilege('authenticated', 'public.customer_members', 'access_revoked_by', 'SELECT')::text

order by 1, 2;


-- =====================================================================
-- 03  BEHAVIOUR TEST  (self-rolling-back: NOTHING is saved)
--
-- Runs the real functions inside one DO block and ends by raising an
-- exception, which rolls the whole transaction back. The "error" you see
-- IS the report: look for PASS / FAIL lines, and a final summary.
--
-- Uses existing test data: customer "99test" with member 97test@gmail.com,
-- and the Admin account. Acts as each user by setting the JWT claims for
-- this transaction only. If auth.uid() is NULL in your editor, the report
-- says so on the first line; use the manual UI tests instead.
-- Run AFTER 01_migration.sql.
-- =====================================================================
do $test$
declare
  c_admin     constant uuid := 'ee2f8a30-27b6-49f8-8a00-cff679e9da14';
  v_out       text := '';
  v_fail      integer := 0;
  v_member    public.customer_members%rowtype;
  v_owner     public.customer_members%rowtype;
  v_other_id  uuid;
  v_rows_before integer;
  v_rows_after  integer;
  v_res       jsonb;
  v_has       boolean;
  v_marker    text;
begin
  select * into v_member from public.customer_members where email = '97test@gmail.com';
  if not found or v_member.status <> 'active' then
    raise exception 'setup: 97test@gmail.com must exist and be active';
  end if;
  select * into v_owner from public.customer_members
   where customer_id = v_member.customer_id and role = 'owner';
  select id into v_other_id from public.customer_members
   where customer_id <> v_member.customer_id and role = 'member' limit 1;
  select count(*) into v_rows_before from public.customer_members where customer_id = v_member.customer_id;

  -- act as the Admin and check auth.uid() works in this editor
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  if auth.uid() is distinct from c_admin then
    raise exception 'auth.uid() is NULL here; this test cannot impersonate users in this editor. Use the manual UI tests.';
  end if;

  -- 1 baseline: member has Team access
  perform set_config('request.jwt.claims', json_build_object('sub', v_member.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_member.user_id::text, true);
  v_has := public.team_has_active_membership();
  v_out := v_out || case when v_has then 'PASS ' else 'FAIL ' end || '01 baseline: active member has Team access' || E'\n';

  -- 2 admin deactivates the member
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  v_res := public.admin_set_member_access(v_member.id, false);
  v_out := v_out || case when (v_res->>'success')::boolean then 'PASS ' else 'FAIL ' end || '02 admin deactivates member: ' || v_res::text || E'\n';

  -- 3 member now has no Team access, and claim_team_membership does not undo it
  perform set_config('request.jwt.claims', json_build_object('sub', v_member.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_member.user_id::text, true);
  v_has := public.team_has_active_membership();
  v_out := v_out || case when not v_has then 'PASS ' else 'FAIL ' end || '03 revoked member has NO Team access' || E'\n';
  v_res := public.claim_team_membership();
  v_has := public.team_has_active_membership();
  v_out := v_out || case when not v_has then 'PASS ' else 'FAIL ' end
        || '04 claim_team_membership does not undo the revocation (claim says ' || v_res::text || ')' || E'\n';

  -- 4 owner cannot undo an Admin revocation
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_owner.user_id::text, true);
  v_res := public.owner_set_member_access(v_member.id, true);
  v_out := v_out || case when v_res->>'error' = 'revoked_by_admin' then 'PASS ' else 'FAIL ' end || '05 owner cannot reactivate an Admin revocation: ' || v_res::text || E'\n';

  -- 5 admin reactivates
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  v_res := public.admin_set_member_access(v_member.id, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_member.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_member.user_id::text, true);
  v_has := public.team_has_active_membership();
  v_out := v_out || case when (v_res->>'success')::boolean and v_has then 'PASS ' else 'FAIL ' end || '06 admin reactivates: member has Team access again' || E'\n';

  -- 6 owner deactivates / reactivates their own revocation
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_owner.user_id::text, true);
  v_res := public.owner_set_member_access(v_member.id, false);
  select access_revoked_by into v_marker from public.customer_members where id = v_member.id;
  v_out := v_out || case when (v_res->>'success')::boolean and v_marker = 'owner' then 'PASS ' else 'FAIL ' end || '07 owner deactivates a member (marker=owner)' || E'\n';
  v_res := public.owner_set_member_access(v_member.id, true);
  select access_revoked_by into v_marker from public.customer_members where id = v_member.id;
  v_out := v_out || case when (v_res->>'success')::boolean and v_marker is null then 'PASS ' else 'FAIL ' end || '08 owner reactivates own revocation (marker cleared)' || E'\n';

  -- 7 an owner revocation is upgraded by Admin; owner then cannot undo it
  v_res := public.owner_set_member_access(v_member.id, false);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  v_res := public.admin_set_member_access(v_member.id, false);
  select access_revoked_by into v_marker from public.customer_members where id = v_member.id;
  v_out := v_out || case when v_marker = 'admin' then 'PASS ' else 'FAIL ' end || '09 admin deactivation upgrades an owner revocation to admin' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_owner.user_id::text, true);
  v_res := public.owner_set_member_access(v_member.id, true);
  v_out := v_out || case when v_res->>'error' = 'revoked_by_admin' then 'PASS ' else 'FAIL ' end || '10 owner still cannot undo it' || E'\n';

  -- 8 individual revocation survives customer deactivate -> reactivate
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  perform public.admin_set_customer_status(v_member.customer_id, 'inactive');
  perform public.admin_set_customer_status(v_member.customer_id, 'active');
  perform set_config('request.jwt.claims', json_build_object('sub', v_member.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_member.user_id::text, true);
  v_has := public.team_has_active_membership();
  v_out := v_out || case when not v_has then 'PASS ' else 'FAIL ' end || '11 individually revoked member stays out after customer deactivate + reactivate' || E'\n';

  -- 9 customer deactivation cuts owner AND members; reactivation restores the non-revoked
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  perform public.admin_set_member_access(v_member.id, true);
  perform public.admin_set_customer_status(v_member.customer_id, 'inactive');
  perform set_config('request.jwt.claims', json_build_object('sub', v_member.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_member.user_id::text, true);
  v_has := public.team_has_active_membership();
  v_out := v_out || case when not v_has then 'PASS ' else 'FAIL ' end || '12 customer inactive: member has no Team access' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_owner.user_id::text, true);
  v_has := public.team_has_active_membership();
  v_out := v_out || case when not v_has then 'PASS ' else 'FAIL ' end || '13 customer inactive: owner has no Team access' || E'\n';
  v_res := public.claim_team_membership();
  v_out := v_out || case when v_res->>'error' = 'customer_inactive' then 'PASS ' else 'FAIL ' end
        || '14 claim reports customer_inactive (the frontend treats this as Team-bound): ' || v_res::text || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  perform public.admin_set_customer_status(v_member.customer_id, 'active');
  perform set_config('request.jwt.claims', json_build_object('sub', v_member.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_member.user_id::text, true);
  v_has := public.team_has_active_membership();
  v_out := v_out || case when v_has then 'PASS ' else 'FAIL ' end || '15 customer reactivated: non-revoked member has Team access again' || E'\n';

  -- 10 owner rows are protected
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  v_res := public.admin_set_member_access(v_owner.id, false);
  v_out := v_out || case when v_res->>'error' = 'cannot_change_owner' then 'PASS ' else 'FAIL ' end || '16 admin cannot deactivate an owner row' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_owner.user_id::text, true);
  v_res := public.owner_set_member_access(v_owner.id, false);
  v_out := v_out || case when v_res->>'error' = 'cannot_change_owner' then 'PASS ' else 'FAIL ' end || '17 owner cannot deactivate themselves' || E'\n';

  -- 11 callers who are not allowed
  perform set_config('request.jwt.claims', json_build_object('sub', v_member.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_member.user_id::text, true);
  v_res := public.admin_set_member_access(v_member.id, false);
  v_out := v_out || case when v_res->>'error' = 'not_admin' then 'PASS ' else 'FAIL ' end || '18 a plain member cannot call the admin function' || E'\n';
  v_res := public.owner_set_member_access(v_member.id, false);
  v_out := v_out || case when v_res->>'error' = 'not_owner' then 'PASS ' else 'FAIL ' end || '19 a plain member cannot call the owner function' || E'\n';
  if v_other_id is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner.user_id)::text, true);
    perform set_config('request.jwt.claim.sub', v_owner.user_id::text, true);
    v_res := public.owner_set_member_access(v_other_id, false);
    v_out := v_out || case when v_res->>'error' = 'member_not_found' then 'PASS ' else 'FAIL ' end || '20 an owner cannot touch ANOTHER customer''s member' || E'\n';
  else
    v_out := v_out || 'SKIP 20 (no member of another customer in the data)' || E'\n';
  end if;

  -- 12 seats never change
  select count(*) into v_rows_after from public.customer_members where customer_id = v_member.customer_id;
  v_out := v_out || case when v_rows_after = v_rows_before then 'PASS ' else 'FAIL ' end
        || '21 seat rows unchanged by all of the above (' || v_rows_before || ' -> ' || v_rows_after || ')' || E'\n';

  v_fail := length(v_out) - length(replace(v_out, 'FAIL ', ''));
  raise exception E'BEHAVIOUR TEST REPORT (nothing was saved)\n%\n%',
    v_out,
    case when v_fail = 0 then 'RESULT: ALL PASS' else 'RESULT: AT LEAST ONE FAIL' end;
end
$test$;
