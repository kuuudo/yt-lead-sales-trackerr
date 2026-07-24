-- Create per-user archive state for promotions
-- Archive is a view-level annotation, not a deletion.
-- Each user can independently archive/restore promotions.

create table promotion_user_states (
  id uuid primary key default gen_random_uuid(),

  promotion_id uuid not null
    references promotions(id),

  user_id uuid not null
    references auth.users(id),

  archived_at timestamptz null,

  created_at timestamptz not null default now(),

  unique (promotion_id, user_id)
);


-- Enable Row Level Security

alter table promotion_user_states
enable row level security;


-- Users can view their own promotion archive states

create policy "Users can view own promotion archive states"
on promotion_user_states
for select
using (
  user_id = auth.uid()
);


-- Users can create their own promotion archive states

create policy "Users can insert own promotion archive states"
on promotion_user_states
for insert
with check (
  user_id = auth.uid()
);


-- Users can update their own promotion archive states

create policy "Users can update own promotion archive states"
on promotion_user_states
for update
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


-- Users can delete their own promotion archive states

create policy "Users can delete own promotion archive states"
on promotion_user_states
for delete
using (
  user_id = auth.uid()
);