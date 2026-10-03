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