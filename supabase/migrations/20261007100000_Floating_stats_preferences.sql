-- Floating Stats overlay: per-account display preferences.
-- Stores which of the 11 overlay metrics are HIDDEN. No row / empty array = show all 11.

create table public.floating_stats_preferences (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  hidden_metrics text[] not null default '{}',
  updated_at     timestamptz not null default now(),
  constraint floating_stats_hidden_metrics_size
    check (cardinality(hidden_metrics) <= 50)
);

alter table public.floating_stats_preferences enable row level security;

-- Only signed-in users may touch this table; anon gets nothing. No DELETE for anyone.
revoke all on table public.floating_stats_preferences from anon;
revoke all on table public.floating_stats_preferences from authenticated;
grant select, insert, update on table public.floating_stats_preferences to authenticated;

-- READ: your own row, or the row of an account you are allowed to operate on.
create policy "fsp_select_own_or_operator"
  on public.floating_stats_preferences
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or public.is_operator_for_user(user_id)
  );

-- CREATE: only your own row.
create policy "fsp_insert_own"
  on public.floating_stats_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- CHANGE: only your own row, and it must stay yours.
create policy "fsp_update_own"
  on public.floating_stats_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);



-- Floating Stats: Global metric visibility
-- Uses Kaksi Digitals' existing preference row.
-- No new tables or RLS policy changes.

create or replace function public.get_floating_stats_hidden_metrics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select to_jsonb(p.hidden_metrics)
      from public.floating_stats_preferences p
      where p.user_id = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid
      limit 1
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.get_floating_stats_hidden_metrics()
from public, anon;

grant execute on function public.get_floating_stats_hidden_metrics()
to authenticated;


  ----------------------------
  risks 

  Claude's concern	Do we already have the answer?
Does the overlay work on YouTube?	Yes, basic functionality tested.
Does it work on TikTok?	Yes, basic functionality tested.
Does it work on Instagram?	Yes, basic functionality tested.
Do short TikTok links (vm.tiktok.com) work after redirect?	Not confirmed.
Does YouTube redirect from /watch to /shorts/ preserve the overlay?	Not confirmed.
Does Instagram /p/ redirect to /reel/ preserve the overlay?	Not confirmed.
Does the new VSTRK snapshot integration work with real analytics data?	Not yet.
Does the Supabase preference system work?	Database security tests passed, but UI integration is not done.


now i also tested operator mode, it works, and its showing the correct numbers and i think right now it only work for    (youtube , tiktok)        following doesnt work (fb, threads, IG, linkedin, twitch, x, )(the overlay is not showing at all) 