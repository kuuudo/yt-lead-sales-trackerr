-- supabase/migrations/20261003000000_team_v1_foundation.sql
-- Patch 1: manual access flag. One table, purely additive.
-- No row for a user = access allowed. Rows are managed manually (SQL Editor / service role).

begin;

create table public.account_access (
  user_id uuid not null
    primary key
    references auth.users(id) on delete cascade,
  status  text not null,
  constraint account_access_status_valid
    check (status in ('active', 'inactive'))
);

alter table public.account_access enable row level security;

-- Supabase gives new public tables broad default grants, so strip them first.
revoke all on public.account_access from public, anon, authenticated;

-- Logged-in users may read (RLS limits this to their own row). No write grants.
grant select on public.account_access to authenticated;

-- Server-side / manual management.
grant all on public.account_access to service_role;

create policy account_access_select_own
  on public.account_access
  for select
  to authenticated
  using (user_id = (select auth.uid()));

commit;


Updated Patch 1 plan (still tables only)
No change to the overall shape. Only the documented intent and a couple of small tightenings.
1. customers (unchanged structure)
SQLcreate table public.customers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  member_limit  integer not null,          -- total permanent slots (includes Owner)
  status        text not null default 'active',
  created_at    timestamptz not null default now(),

  constraint customers_name_not_blank
    check (length(trim(name)) > 0),

  constraint customers_member_limit_positive
    check (member_limit >= 1),

  constraint customers_status_valid
    check (status in ('active', 'inactive'))
);
member_limit = maximum number of rows that may ever exist in customer_members for this customer.
2. customer_members
SQLcreate table public.customer_members (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null
                  references public.customers(id) on delete restrict,
  email         text not null,
  role          text not null,
  status        text not null default 'pending',
  user_id       uuid
                  references auth.users(id) on delete cascade,  -- keep CASCADE for MVP
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,

  constraint customer_members_email_normalized
    check (email = lower(trim(email)) and position('@' in email) > 1),

  constraint customer_members_role_valid
    check (role in ('owner', 'member')),

  constraint customer_members_status_valid
    check (status in ('pending', 'active')),

  -- active must be fully claimed
  constraint customer_members_active_complete
    check (
      (status = 'active' and user_id is not null and activated_at is not null)
      or
      (status = 'pending')
    ),

  -- only Owner is allowed to be pending *with* a user_id
  -- (claimed but waiting for admin approval)
  constraint customer_members_member_pending_no_user
    check (
      not (role = 'member' and status = 'pending' and user_id is not null)
    )
);
3. Uniqueness & indexes (same as before)
SQLcreate unique index customer_members_email_unique
  on public.customer_members (email);

create unique index customer_members_user_id_unique
  on public.customer_members (user_id)
  where user_id is not null;

create unique index customer_members_one_owner_per_customer
  on public.customer_members (customer_id)
  where role = 'owner';

create index customer_members_customer_id_idx
  on public.customer_members (customer_id);
4. RLS + privileges (still no policies)
SQLalter table public.customers enable row level security;
alter table public.customer_members enable row level security;

revoke all on public.customers from public, anon, authenticated;
revoke all on public.customer_members from public, anon, authenticated;

grant select on public.customers to authenticated;
grant select on public.customer_members to authenticated;
-- service_role keeps full access by default
Because we never grant INSERT / UPDATE / DELETE to authenticated or anon, the only way rows can ever be written is through the SECURITY DEFINER functions we will add later. Those functions will simply not offer:

update of email
delete of any customer_members row
moving a row to another customer

That is how the immutability rule is enforced in practice.


-- =============================================================================
-- Patch A — Helpers + SELECT policies + claim_team_membership + Admin RPCs
-- Scope: database only. Does not modify Patch 1 tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- Single source of truth for the Kaksi admin identity.
create or replace function public.team_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid;
$$;

revoke all on function public.team_is_admin() from public;
revoke execute on function public.team_is_admin() from anon, authenticated;
-- Called only from other SECURITY DEFINER functions and from RLS policies
-- (Postgres evaluates policy expressions as the table owner / definer context
-- when the helper itself is SECURITY DEFINER). Grant to authenticated so
-- RLS can evaluate it for the current user.
grant execute on function public.team_is_admin() to authenticated;


-- Returns the single customer_id for which the caller is an approved Owner
-- (role = owner AND status = active). Used by RLS to avoid recursion.
create or replace function public.team_owned_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.customer_id
  from public.customer_members cm
  where cm.user_id = auth.uid()
    and cm.role = 'owner'
    and cm.status = 'active'
  limit 1;
$$;

revoke all on function public.team_owned_customer_id() from public;
revoke execute on function public.team_owned_customer_id() from anon;
grant execute on function public.team_owned_customer_id() to authenticated;


-- Sole writer of account_access from the Team system.
-- Internal only — EXECUTE is revoked from every client role.
create or replace function public.team_set_access(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'team_set_access: p_user_id is required';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'team_set_access: invalid status %', p_status;
  end if;

  insert into public.account_access (user_id, status)
  values (p_user_id, p_status)
  on conflict (user_id) do update
    set status = excluded.status;
end;
$$;

revoke all on function public.team_set_access(uuid, text) from public;
revoke execute on function public.team_set_access(uuid, text) from anon, authenticated;
-- No GRANT — only other SECURITY DEFINER functions can call it.


-- ---------------------------------------------------------------------------
-- 2. SELECT policies
-- ---------------------------------------------------------------------------

-- customers
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select
  to authenticated
  using (
    public.team_is_admin()
    or id = public.team_owned_customer_id()
  );

-- customer_members
drop policy if exists customer_members_select on public.customer_members;
create policy customer_members_select on public.customer_members
  for select
  to authenticated
  using (
    public.team_is_admin()
    or customer_id = public.team_owned_customer_id()
  );


-- ---------------------------------------------------------------------------
-- 3. claim_team_membership
-- ---------------------------------------------------------------------------

create or replace function public.claim_team_membership()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_row   public.customer_members%rowtype;
  v_cust  public.customers%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- Authoritative email from auth.users (not profiles, not JWT claims).
  select lower(trim(email)) into v_email
  from auth.users
  where id = v_uid;

  if v_email is null or v_email = '' then
    return jsonb_build_object('success', false, 'error', 'no_email');
  end if;

  -- Find the membership row (email is globally unique).
  select * into v_row
  from public.customer_members
  where email = v_email
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'no_match');
  end if;

  -- Lock the customer row (always customers → customer_members order).
  select * into v_cust
  from public.customers
  where id = v_row.customer_id
  for update;

  if not found or v_cust.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'customer_inactive');
  end if;

  -- Already claimed and active → idempotent success.
  if v_row.status = 'active' then
    return jsonb_build_object(
      'success', true,
      'customer_id', v_row.customer_id,
      'role', v_row.role,
      'already_active', true
    );
  end if;

  -- pending → active for both Owner and Member (identical behaviour).
  update public.customer_members
  set
    user_id      = v_uid,
    status       = 'active',
    activated_at = now()
  where id = v_row.id;

  perform public.team_set_access(v_uid, 'active');

  return jsonb_build_object(
    'success', true,
    'customer_id', v_row.customer_id,
    'role', v_row.role,
    'already_active', false
  );
end;
$$;

revoke all on function public.claim_team_membership() from public;
revoke execute on function public.claim_team_membership() from anon;
grant execute on function public.claim_team_membership() to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Admin RPCs
-- ---------------------------------------------------------------------------

-- 4a. admin_create_customer
create or replace function public.admin_create_customer(
  p_name          text,
  p_member_limit  integer,
  p_owner_email   text,
  p_emails        text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name          text := trim(p_name);
  v_owner_email   text := lower(trim(p_owner_email));
  v_limit         integer := p_member_limit;
  v_customer_id   uuid;
  v_normalized    text[];
  v_email         text;
  v_seen          text[] := '{}';
  v_valid         text[] := '{}';
  v_skipped       jsonb := '[]'::jsonb;
  v_existing      integer;
  v_remaining     integer;
  v_inserted      integer := 0;
begin
  if not public.team_is_admin() then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  if v_name is null or length(v_name) = 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_name');
  end if;

  if v_limit is null or v_limit < 1 then
    return jsonb_build_object('success', false, 'error', 'invalid_member_limit');
  end if;

  if v_owner_email is null
     or position('@' in v_owner_email) < 2 then
    return jsonb_build_object('success', false, 'error', 'invalid_owner_email');
  end if;

  -- Owner already used anywhere?
  if exists (
    select 1 from public.customer_members where email = v_owner_email
  ) then
    return jsonb_build_object('success', false, 'error', 'owner_email_taken');
  end if;

  -- Normalize + deduplicate the member list (owner is handled separately).
  if p_emails is not null then
    foreach v_email in array p_emails loop
      v_email := lower(trim(v_email));

      if v_email is null or v_email = '' or position('@' in v_email) < 2 then
        v_skipped := v_skipped || jsonb_build_array(
          jsonb_build_object('email', v_email, 'reason', 'invalid_format')
        );
        continue;
      end if;

      if v_email = v_owner_email then
        v_skipped := v_skipped || jsonb_build_array(
          jsonb_build_object('email', v_email, 'reason', 'is_owner')
        );
        continue;
      end if;

      if v_email = any (v_seen) then
        v_skipped := v_skipped || jsonb_build_array(
          jsonb_build_object('email', v_email, 'reason', 'duplicate_in_batch')
        );
        continue;
      end if;

      v_seen := array_append(v_seen, v_email);

      if exists (
        select 1 from public.customer_members where email = v_email
      ) then
        v_skipped := v_skipped || jsonb_build_array(
          jsonb_build_object('email', v_email, 'reason', 'already_used')
        );
        continue;
      end if;

      v_valid := array_append(v_valid, v_email);
    end loop;
  end if;

  if cardinality(v_valid) > 500 then
    return jsonb_build_object('success', false, 'error', 'batch_too_large');
  end if;

  -- Owner occupies 1 slot; members occupy the rest.
  -- Total rows that would exist after this call = 1 + cardinality(v_valid)
  if (1 + coalesce(cardinality(v_valid), 0)) > v_limit then
    return jsonb_build_object(
      'success', false,
      'error', 'over_limit',
      'member_limit', v_limit,
      'would_create', 1 + coalesce(cardinality(v_valid), 0),
      'skipped', v_skipped
    );
  end if;

  -- Create customer
  insert into public.customers (name, member_limit, status)
  values (v_name, v_limit, 'active')
  returning id into v_customer_id;

  -- Owner row (pending, no user_id yet)
  insert into public.customer_members (customer_id, email, role, status)
  values (v_customer_id, v_owner_email, 'owner', 'pending');

  -- Member rows
  if cardinality(v_valid) > 0 then
    insert into public.customer_members (customer_id, email, role, status)
    select v_customer_id, unnest(v_valid), 'member', 'pending';
    get diagnostics v_inserted = row_count;
  end if;

  return jsonb_build_object(
    'success', true,
    'customer_id', v_customer_id,
    'owner_email', v_owner_email,
    'members_added', v_inserted,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.admin_create_customer(text, integer, text, text[]) from public;
revoke execute on function public.admin_create_customer(text, integer, text, text[]) from anon;
grant execute on function public.admin_create_customer(text, integer, text, text[]) to authenticated;


-- 4b. admin_set_customer_status
create or replace function public.admin_set_customer_status(
  p_customer_id uuid,
  p_status      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust public.customers%rowtype;
  r      record;
begin
  if not public.team_is_admin() then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  if p_status not in ('active', 'inactive') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  select * into v_cust
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'customer_not_found');
  end if;

  if v_cust.status = p_status then
    return jsonb_build_object(
      'success', true,
      'customer_id', p_customer_id,
      'status', p_status,
      'unchanged', true
    );
  end if;

  update public.customers
  set status = p_status
  where id = p_customer_id;

  -- Propagate access only for already-claimed (active + user_id) members.
  -- Pending rows are left untouched; membership rows are never deleted.
  for r in
    select user_id
    from public.customer_members
    where customer_id = p_customer_id
      and status = 'active'
      and user_id is not null
  loop
    perform public.team_set_access(r.user_id, p_status);
  end loop;

  return jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'status', p_status,
    'unchanged', false
  );
end;
$$;

revoke all on function public.admin_set_customer_status(uuid, text) from public;
revoke execute on function public.admin_set_customer_status(uuid, text) from anon;
grant execute on function public.admin_set_customer_status(uuid, text) to authenticated;


-- =============================================================================
-- End of Patch A
-- =============================================================================



-- =============================================================================
-- Patch B1 — Owner RPC: owner_add_members
-- Scope: database only. Does not modify Patch 1 tables or Patch A objects.
-- =============================================================================

create or replace function public.owner_add_members(p_emails text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_customer_id uuid;
  v_cust        public.customers%rowtype;
  v_used        integer;
  v_remaining   integer;
  v_email       text;
  v_seen        text[] := '{}';
  v_valid       text[] := '{}';
  v_skipped     jsonb := '[]'::jsonb;
  v_inserted    integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- Resolve the caller's approved Owner membership and lock the customer.
  select cm.customer_id into v_customer_id
  from public.customer_members cm
  where cm.user_id = v_uid
    and cm.role = 'owner'
    and cm.status = 'active'
  limit 1;

  if v_customer_id is null then
    return jsonb_build_object('success', false, 'error', 'not_owner');
  end if;

  select * into v_cust
  from public.customers
  where id = v_customer_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'customer_not_found');
  end if;

  if v_cust.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'customer_inactive');
  end if;

  -- Permanent slots already consumed (Owner + all pending/active members).
  select count(*) into v_used
  from public.customer_members
  where customer_id = v_customer_id;

  v_remaining := v_cust.member_limit - v_used;

  if p_emails is null or cardinality(p_emails) = 0 then
    return jsonb_build_object(
      'success', true,
      'added', 0,
      'remaining', v_remaining,
      'skipped', v_skipped
    );
  end if;

  if cardinality(p_emails) > 500 then
    return jsonb_build_object('success', false, 'error', 'batch_too_large');
  end if;

  -- Normalize, deduplicate, and classify.
  foreach v_email in array p_emails loop
    v_email := lower(trim(v_email));

    if v_email is null or v_email = '' or position('@' in v_email) < 2 then
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('email', v_email, 'reason', 'invalid_format')
      );
      continue;
    end if;

    if v_email = any (v_seen) then
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('email', v_email, 'reason', 'duplicate_in_batch')
      );
      continue;
    end if;

    v_seen := array_append(v_seen, v_email);

    if exists (
      select 1 from public.customer_members where email = v_email
    ) then
      -- Do not reveal whether the email belongs to this customer or another.
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('email', v_email, 'reason', 'unavailable')
      );
      continue;
    end if;

    v_valid := array_append(v_valid, v_email);
  end loop;

  -- Whole-batch rejection when over remaining capacity.
  if coalesce(cardinality(v_valid), 0) > v_remaining then
    return jsonb_build_object(
      'success', false,
      'error', 'over_limit',
      'remaining', v_remaining,
      'would_add', cardinality(v_valid),
      'skipped', v_skipped
    );
  end if;

  if cardinality(v_valid) > 0 then
    insert into public.customer_members (customer_id, email, role, status)
    select v_customer_id, unnest(v_valid), 'member', 'pending';
    get diagnostics v_inserted = row_count;
  end if;

  return jsonb_build_object(
    'success', true,
    'added', v_inserted,
    'remaining', v_remaining - v_inserted,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.owner_add_members(text[]) from public;
revoke execute on function public.owner_add_members(text[]) from anon;
grant execute on function public.owner_add_members(text[]) to authenticated;

-- =============================================================================
-- End of Patch B1
-- =============================================================================