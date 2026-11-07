-- =====================================================================
-- 04  ROLLBACK  -  undoes 01_migration.sql
--
-- BEFORE RUNNING, check who is currently deactivated (read-only):
--     select email, access_revoked_by from public.customer_members
--     where access_revoked_by is not null;
-- Dropping the column ERASES these markers: those members get Team access
-- back immediately (if their customer is active). Re-deactivate them by
-- another route if that is not acceptable.
--
-- ORDER: roll back the FRONTEND first (the new Team/Admin pages select the
-- column and call the two functions removed below), then run this script.
-- useAccessStatus.ts needs nothing from the database and can stay.
--
-- Restores team_has_active_membership() to the exact definition inspected
-- before the migration. Seats, subscriptions, Stripe, claim_team_membership,
-- team_set_access / account_access were never touched, so nothing to restore.
-- One transaction: any error rolls it all back.
-- =====================================================================
begin;

-- 1. Restore the original function FIRST, so nothing references the column.
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
      and c.status = 'active'
  );
$function$;

-- 2. Remove the two new functions.
drop function if exists public.admin_set_member_access(uuid, boolean);
drop function if exists public.owner_set_member_access(uuid, boolean);

-- 3. Remove the constraints, then the column.
alter table public.customer_members
  drop constraint if exists customer_members_owner_never_revoked,
  drop constraint if exists customer_members_revoked_by_valid;

alter table public.customer_members
  drop column if exists access_revoked_by;

commit;


--------------------------------
-- =====================================================================
-- 06  MEMBER LIMIT TEST  (self-rolling-back: NOTHING is saved)
-- Same idea as 03: the "error" at the end IS the report (PASS / FAIL lines).
-- Uses customer "99test" and the Admin account. Run AFTER 05.
-- =====================================================================
do $test$
declare
  c_admin constant uuid := 'ee2f8a30-27b6-49f8-8a00-cff679e9da14';
  v_out text := '';
  v_fail integer;
  v_cust public.customers%rowtype;
  v_used integer;
  v_owner public.customer_members%rowtype;
  v_member public.customer_members%rowtype;
  v_res jsonb;
begin
  select * into v_cust from public.customers where name = '99test';
  if not found then raise exception 'setup: customer 99test not found'; end if;
  select count(*) into v_used from public.customer_members where customer_id = v_cust.id;
  select * into v_owner from public.customer_members where customer_id = v_cust.id and role = 'owner';
  select * into v_member from public.customer_members where customer_id = v_cust.id and role = 'member' and status = 'active' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin)::text, true);
  perform set_config('request.jwt.claim.sub', c_admin::text, true);
  if auth.uid() is distinct from c_admin then
    raise exception 'auth.uid() is NULL here; use the manual UI test instead.';
  end if;

  v_res := public.admin_set_member_limit(v_cust.id, v_used + 9);
  v_out := v_out || case when (v_res->>'success')::boolean and (v_res->>'member_limit')::int = v_used + 9 then 'PASS ' else 'FAIL ' end
        || '01 admin raises the limit: ' || v_res::text || E'\n';
  v_out := v_out || case when (select member_limit from public.customers where id = v_cust.id) = v_used + 9 then 'PASS ' else 'FAIL ' end
        || '02 customers.member_limit really changed' || E'\n';

  v_res := public.admin_set_member_limit(v_cust.id, v_used + 9);
  v_out := v_out || case when (v_res->>'success')::boolean and (v_res->>'unchanged')::boolean then 'PASS ' else 'FAIL ' end
        || '03 same value again is a harmless no-op' || E'\n';

  v_res := public.admin_set_member_limit(v_cust.id, v_used);
  v_out := v_out || case when (v_res->>'success')::boolean then 'PASS ' else 'FAIL ' end
        || '04 lowering to exactly the used count is allowed: ' || v_res::text || E'\n';

  v_res := public.admin_set_member_limit(v_cust.id, v_used - 1);
  v_out := v_out || case when v_res->>'error' = 'below_current_count' and (v_res->>'used')::int = v_used then 'PASS ' else 'FAIL ' end
        || '05 below the used count is refused: ' || v_res::text || E'\n';

  -- deactivated members still occupy a seat
  perform public.admin_set_member_access(v_member.id, false);
  v_res := public.admin_set_member_limit(v_cust.id, v_used - 1);
  v_out := v_out || case when v_res->>'error' = 'below_current_count' and (v_res->>'used')::int = v_used then 'PASS ' else 'FAIL ' end
        || '06 a deactivated member still counts as a used seat' || E'\n';

  v_res := public.admin_set_member_limit(v_cust.id, 0);
  v_out := v_out || case when v_res->>'error' = 'invalid_member_limit' then 'PASS ' else 'FAIL ' end || '07 limit 0 refused' || E'\n';
  v_res := public.admin_set_member_limit(v_cust.id, null);
  v_out := v_out || case when v_res->>'error' = 'invalid_member_limit' then 'PASS ' else 'FAIL ' end || '08 NULL limit refused' || E'\n';
  v_res := public.admin_set_member_limit(gen_random_uuid(), 5);
  v_out := v_out || case when v_res->>'error' = 'customer_not_found' then 'PASS ' else 'FAIL ' end || '09 unknown customer refused' || E'\n';

  -- raising the limit gives the owner real room (seat logic itself untouched)
  perform public.admin_set_member_limit(v_cust.id, v_used + 2);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner.user_id)::text, true);
  perform set_config('request.jwt.claim.sub', v_owner.user_id::text, true);
  v_res := public.owner_add_members(array['limit-test-1@example.com','limit-test-2@example.com']);
  v_out := v_out || case when (v_res->>'success')::boolean and (v_res->>'added')::int = 2 and (v_res->>'remaining')::int = 0 then 'PASS ' else 'FAIL ' end
        || '10 owner can then add exactly the new seats: ' || v_res::text || E'\n';
  v_res := public.owner_add_members(array['limit-test-3@example.com']);
  v_out := v_out || case when v_res->>'error' = 'over_limit' then 'PASS ' else 'FAIL ' end
        || '11 the next one is over the limit' || E'\n';

  -- not allowed callers
  v_res := public.admin_set_member_limit(v_cust.id, 50);
  v_out := v_out || case when v_res->>'error' = 'not_admin' then 'PASS ' else 'FAIL ' end
        || '12 the customer owner cannot change their own limit' || E'\n';

  v_fail := length(v_out) - length(replace(v_out, 'FAIL ', ''));
  raise exception E'MEMBER LIMIT TEST REPORT (nothing was saved)\n%\n%',
    v_out, case when v_fail = 0 then 'RESULT: ALL PASS' else 'RESULT: AT LEAST ONE FAIL' end;
end
$test$;