-- ============================================================
-- archive_ui_visibility
--
-- Level 1 <-> Level 2 UI VISIBILITY PERSISTENCE ONLY.
-- This table is NEVER the source of truth for archive state and NEVER
-- stores archive reasons. It answers exactly one question: "has this
-- viewer hidden this already-archived entity from their Level 1
-- Archive Tab?"
--
--   no row for (entity_type, entity_id, viewer)  -> Level 1 (visible)
--   row exists for (entity_type, entity_id, viewer) -> Level 2 (hidden)
--
-- Product decision (confirmed): Unhide DELETES the row rather than
-- nulling hidden_at. hidden_at is NOT NULL by design — the table's
-- whole semantics is row-presence, not a nullable flag.
--
-- Assignment is deliberately excluded from entity_type — Assignment
-- Level 1/Level 2 is explicitly deferred, not decided against, per
-- ARCHIVE_SYSTEM_DESIGN.md.
-- ============================================================

create table if not exists public.archive_ui_visibility (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  user_id uuid not null references auth.users(id),
  hidden_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint archive_ui_visibility_entity_type_check
    check (entity_type in ('asset', 'video', 'campaign', 'promotion')),
  constraint archive_ui_visibility_entity_user_key
    unique (entity_type, entity_id, user_id)
);

create index if not exists idx_archive_ui_visibility_user_id
  on public.archive_ui_visibility using btree (user_id);

create index if not exists idx_archive_ui_visibility_entity
  on public.archive_ui_visibility using btree (entity_type, entity_id);

alter table public.archive_ui_visibility enable row level security;

-- SELECT: viewer can only see their own hide state.
create policy "Users can view own archive ui visibility rows"
  on public.archive_ui_visibility
  for select
  using (user_id = auth.uid());

-- INSERT: viewer can only create rows for themselves (Hide).
create policy "Users can insert own archive ui visibility rows"
  on public.archive_ui_visibility
  for insert
  with check (user_id = auth.uid());

-- UPDATE: kept for upsert-onConflict robustness (re-hiding after a
-- concurrent write); the app-level service never nulls hidden_at.
create policy "Users can update own archive ui visibility rows"
  on public.archive_ui_visibility
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: this IS the Unhide action — viewer can only delete their own row.
create policy "Users can delete own archive ui visibility rows"
  on public.archive_ui_visibility
  for delete
  using (user_id = auth.uid());

-- ============================================================
-- ASSUMPTION FLAGGED: I don't have visibility into this project's
-- actual supabase/migrations/ folder or naming convention (timestamp
-- format, whether RLS grants also need explicit `grant` statements
-- alongside policies the way other migrations in this repo do). This
-- follows the same RLS shape as the confirmed asset_user_states /
-- assignment_user_states / promotion_user_states policies (scoped to
-- auth.uid()), but please diff this against one real prior migration
-- file before applying, rather than trusting the filename/format as-is.
-- ============================================================
