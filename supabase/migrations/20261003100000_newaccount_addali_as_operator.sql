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
      select new.id, u, 'member'
      from unnest(array[
        'cd180432-44c5-4a20-b778-66b7753191f0'::uuid,
        '8a70fb9f-23b6-41f2-997c-5e07569e7b92'::uuid
      ]) as u
      where u <> new.owner_id
      on conflict do nothing;
    exception when others then
      raise warning 'add_foundation_operator_member failed for org %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;  

create table public.operator_hidden_members (
  operator_id uuid not null references auth.users(id) on delete cascade,
  member_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (operator_id, member_id)
);

alter table public.operator_hidden_members enable row level security;

create policy "own select" on public.operator_hidden_members
  for select using (operator_id = auth.uid());
create policy "own insert" on public.operator_hidden_members
  for insert with check (operator_id = auth.uid());
create policy "own delete" on public.operator_hidden_members
  for delete using (operator_id = auth.uid());



  ---------------------------------------------------
  (i didnt run following, i used to run but deleted) 


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


drop trigger if exists trg_add_customer_to_alin_workspace
on public.organizations;

drop function if exists public.add_customer_to_alin_workspace();

delete from public.organization_members
where organization_id = '9d9a8937-518f-4525-997e-7067d604238f'::uuid
  and role = 'member'
  and user_id in (
    '990edc1d-4423-4385-a2c2-156657e5d423'::uuid,
    '63933d85-4714-432e-bf52-ed0d25ee985b'::uuid
  );









The confirmed successful test is the source of truth: customer user ID goes into Ali's Workspace ID, with role member.    following is the line i make previous new account jan succesffuly see alinospa account 明白了！那我們現在確定目標了：
Jan 要像 Wemood 一樣，看到 Ali Workspace 裡的資料。
也就是：

Ali Workspace
├── Ali       (owner)
├── Wemood    (member) ✓ 看得到資料
└── Jan       (member) ← 我們要讓 Jan 也有這個權限
目前問題
Jan 現在只有這筆：

Jan Workspace
└── Ali (member)
但缺少真正讓 Jan 看到 Ali Workspace 的這筆：

Ali Workspace
└── Jan (member)
第一步：先測試 Jan 的邀請 membership
在 Supabase SQL Editor 執行：
這會新增一筆 membership

insert into public.organization_members (
  organization_id,
  user_id,
  role
)
values (
  '9d9a8937-518f-4525-997e-7067d604238f'::uuid,
  '021e3520-6d2c-4e51-aa35-f29b41873b1d'::uuid,
  'member'
)
on conflict do nothing;
這代表：

Workspace：Ali 的 Workspace
User：Jan
Role：member
不會刪除 Jan 自己 Workspace 裡的資料，也不會改變 Jan 的 Owner 身分。
第二步：確認結果
執行：

select
  o.id as organization_id,
  owner.email as workspace_owner,
  member.email as member_email,
  om.role
from public.organization_members om
join public.organizations o
  on o.id = om.organization_id
join auth.users owner
  on owner.id = o.owner_id
join auth.users member
  on member.id = om.user_id
where
  o.id = '9d9a8937-518f-4525-997e-7067d604238f'::uuid
  and om.user_id = '021e3520-6d2c-4e51-aa35-f29b41873b1d'::uuid;
預期結果：

workspace_owner         member_email   role
alinospam2020@gmail.com jan@gmail.com  member
然後用 Jan 帳號重新登入，測試能否看到 Ali Workspace 的資料。
如果這樣成功，我們就找到正確方向了：新客戶建立帳號時，需要把客戶加入 Ali Workspace，而不是只把 Ali 加入客戶 Workspace。 但後續還要檢查登入後的 Workspace 選擇邏輯，不能只靠新增 membership 就假設整個介面會自動切換