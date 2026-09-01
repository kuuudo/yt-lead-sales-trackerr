create table if not exists video_user_states (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id),
  user_id uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (video_id, user_id)
);

alter table video_user_states enable row level security;

create policy "Users can view own video archive states"
  on video_user_states for select
  using (user_id = auth.uid());

create policy "Users can insert own video archive states"
  on video_user_states for insert
  with check (user_id = auth.uid());

create policy "Users can update own video archive states"
  on video_user_states for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());