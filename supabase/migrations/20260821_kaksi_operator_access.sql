begin;

-- ============================================================
-- Kaksi Privileged Operator Access — Phase 1 (tables + RLS only)
--
-- Two new tables:
--   kaksi_operator_access  — explicit access list (Kaksi-added targets)
--   kaksi_viewing_log      — internal audit trail of viewing sessions
--
-- Both tables are readable/writable ONLY by Kaksi
-- (ee2f8a30-27b6-49f8-8a00-cff679e9da14). No other auth.uid() has any
-- policy granting access to either table — not even a SELECT.
--
-- This migration alone changes NO runtime behavior: is_operator_for_user()
-- is not modified in this step, so nothing yet reads these tables for
-- authorization purposes. Safe to deploy standalone.
-- Idempotent — safe to re-run.
-- ============================================================

-- ── kaksi_operator_access ────────────────────────────────────
create table if not exists public.kaksi_operator_access (
  id              uuid primary key default gen_random_uuid(),
  target_user_id  uuid not null references public.profiles(id),
  added_at        timestamptz not null default now(),
  status          text not null default 'active' check (status in ('active','removed')),
  removed_at      timestamptz
);

-- Partial unique index (NOT a table constraint — WHERE-qualified
-- uniqueness must be an index in Postgres, not a CONSTRAINT clause).
-- Ensures at most one ACTIVE row per target; re-adding after removal
-- is fine since only 'active' rows are covered.
create unique index if not exists kaksi_operator_access_active_target_idx
  on public.kaksi_operator_access (target_user_id)
  where status = 'active';

create index if not exists kaksi_operator_access_target_idx
  on public.kaksi_operator_access (target_user_id);

alter table public.kaksi_operator_access enable row level security;

drop policy if exists kaksi_operator_access_select on public.kaksi_operator_access;
create policy kaksi_operator_access_select on public.kaksi_operator_access
  for select
  using (auth.uid() = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid);

drop policy if exists kaksi_operator_access_insert on public.kaksi_operator_access;
create policy kaksi_operator_access_insert on public.kaksi_operator_access
  for insert
  with check (auth.uid() = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid);

drop policy if exists kaksi_operator_access_update on public.kaksi_operator_access;
create policy kaksi_operator_access_update on public.kaksi_operator_access
  for update
  using (auth.uid() = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid)
  with check (auth.uid() = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid);

-- No DELETE policy — removal is a status flip (audit trail preserved).
-- No policy of any kind for any other auth.uid() — default-deny.

grant select, insert, update on public.kaksi_operator_access to authenticated;

-- ── kaksi_viewing_log ─────────────────────────────────────────
create table if not exists public.kaksi_viewing_log (
  id              uuid primary key default gen_random_uuid(),
  target_user_id  uuid not null references public.profiles(id),
  viewed_at       timestamptz not null default now()
);

create index if not exists kaksi_viewing_log_target_idx
  on public.kaksi_viewing_log (target_user_id);

alter table public.kaksi_viewing_log enable row level security;

drop policy if exists kaksi_viewing_log_select on public.kaksi_viewing_log;
create policy kaksi_viewing_log_select on public.kaksi_viewing_log
  for select
  using (auth.uid() = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid);

drop policy if exists kaksi_viewing_log_insert on public.kaksi_viewing_log;
create policy kaksi_viewing_log_insert on public.kaksi_viewing_log
  for insert
  with check (auth.uid() = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14'::uuid);

-- No UPDATE or DELETE policy at all — append-only log, not editable
-- even by Kaksi. No policy for any other auth.uid().

grant select, insert on public.kaksi_viewing_log to authenticated;

commit;