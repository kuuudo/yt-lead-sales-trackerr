create or replace function public.add_foundation_operator_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id <> 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid then
    begin
      insert into public.organization_members (organization_id, user_id, role)
      values (new.id, 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid, 'member')
      on conflict do nothing;
    exception when others then
      raise warning 'add_foundation_operator_member failed for org %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_add_foundation_operator_member on public.organizations;

create trigger trg_add_foundation_operator_member
after insert on public.organizations
for each row execute function public.add_foundation_operator_member();








（foloowing is a eixisiting account manually add and bypass rls) 
-- 2. Existing accounts: 
-- Add Ali as a member of every existing customer Workspace.

insert into public.organization_members (
  organization_id,
  user_id,
  role
)
select
  o.id,
  'cd180432-44c5-4a20-b778-66b7753191f0'::uuid,
  'member'
from public.organizations o
where o.owner_id <> 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid
on conflict do nothing;


create or replace function public.operator_backfill_alin_membership()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  -- Only Kaksi may run this global backfill
  if auth.uid() is distinct from 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  )
  select
    o.id,
    'cd180432-44c5-4a20-b778-66b7753191f0'::uuid,
    'member'
  from public.organizations o
  where o.owner_id <> 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

revoke all on function public.operator_backfill_alin_membership() from public, anon;
grant execute on function public.operator_backfill_alin_membership() to authenticated;


create or replace function public.operator_backfill_alin_membership()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  -- Any account with Operator Mode access may run this (same check as View account on Ali)
  if auth.uid() is null
     or not coalesce(public.is_operator_for_user('cd180432-44c5-4a20-b778-66b7753191f0'::uuid), false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  )
  select
    o.id,
    'cd180432-44c5-4a20-b778-66b7753191f0'::uuid,
    'member'
  from public.organizations o
  where o.owner_id <> 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

revoke all on function public.operator_backfill_alin_membership() from public, anon;
grant execute on function public.operator_backfill_alin_membership() to authenticated;



-- A) New customers: add the workspace owner to Ali's Workspace
create or replace function public.add_customer_to_alin_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> '9d9a8937-518f-4525-997e-7067d604238f'::uuid
     and new.owner_id is not null
     and new.owner_id <> 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid then
    begin
      insert into public.organization_members (
        organization_id,
        user_id,
        role
      )
      values (
        '9d9a8937-518f-4525-997e-7067d604238f'::uuid,
        new.owner_id,
        'member'
      )
      on conflict do nothing;
    exception when others then
      -- never block account creation; the backfill button can repair it later
      raise warning 'add_customer_to_alin_workspace failed for %: %', new.owner_id, sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_add_customer_to_alin_workspace on public.organizations;
create trigger trg_add_customer_to_alin_workspace
after insert on public.organizations
for each row execute function public.add_customer_to_alin_workspace();

-- B) Existing customers: corrected direction, same RPC name
create or replace function public.operator_backfill_alin_membership()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if auth.uid() is null
     or not coalesce(public.is_operator_for_user('cd180432-44c5-4a20-b778-66b7753191f0'::uuid), false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role
  )
  select distinct
    '9d9a8937-518f-4525-997e-7067d604238f'::uuid,
    o.owner_id,
    'member'
  from public.organizations o
  where o.id <> '9d9a8937-518f-4525-997e-7067d604238f'::uuid
    and o.owner_id is not null
    and o.owner_id <> 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

revoke all on function public.operator_backfill_alin_membership() from public, anon;
grant execute on function public.operator_backfill_alin_membership() to authenticated;