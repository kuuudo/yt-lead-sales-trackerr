-- Onboarding research answers, collected before (and independent of) account creation.
-- One row per anonymous visitor session. `answers` is a JSON object, so adding a new
-- onboarding question never needs a migration: just send a new key.
--
-- Funnel events, all on this one row:
--   visited / abandoned  furthest_step (1 = Welcome, 2 = Role, 3 = Situation, 4 = Campaign ...
--                        the same numbers as the "0N / 06" progress label; only ever goes up)
--   account created      user_id IS NOT NULL (linked_at = when)
--   finished onboarding  completed_at IS NOT NULL

create table public.onboarding_responses (
  session_id    uuid primary key,                                   -- random id made in the visitor's browser
  user_id       uuid references auth.users (id) on delete set null, -- NULL until they sign up
  answers       jsonb not null default '{}'::jsonb,                 -- {"role": "...", "situation": "...", ...}
  version       int  not null default 1,                            -- questionnaire version at first save
  furthest_step int  not null default 0,
  completed_at  timestamptz,
  linked_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index onboarding_responses_user_id_idx
  on public.onboarding_responses (user_id) where user_id is not null;
create index onboarding_responses_created_at_idx
  on public.onboarding_responses (created_at);

-- Nobody can touch this table from the browser. Only the Edge Functions (service role) write to it.
alter table public.onboarding_responses enable row level security;   -- no policies = deny all
revoke all on public.onboarding_responses from anon, authenticated;

-- Upsert. Answers are merged into the existing ones; a key sent as null is REMOVED.
-- (The merge must use p_answers, not excluded.answers: the VALUES clause has already
--  stripped nulls from excluded.answers, so clears would never reach the existing row.)
create or replace function public.save_onboarding_answers(
  p_session_id uuid,
  p_answers    jsonb   default '{}'::jsonb,
  p_version    int     default 1,
  p_step       int     default null,
  p_completed  boolean default false
) returns void
language sql
as $$
  insert into public.onboarding_responses as r (session_id, answers, version, furthest_step, completed_at)
  values (
    p_session_id,
    jsonb_strip_nulls(p_answers),
    p_version,
    coalesce(p_step, 0),
    case when p_completed then now() end
  )
  on conflict (session_id) do update
    set answers       = jsonb_strip_nulls(r.answers || p_answers),
        furthest_step = greatest(r.furthest_step, coalesce(p_step, 0)),
        completed_at  = coalesce(r.completed_at, case when p_completed then now() end),
        updated_at    = now();
$$;

-- Attach a session to an account. Only fills an empty user_id; never overwrites one.
create or replace function public.link_onboarding_session(
  p_session_id uuid,
  p_user_id    uuid
) returns text
language plpgsql
as $$
declare
  v_owner uuid;
begin
  update public.onboarding_responses
     set user_id = p_user_id, linked_at = now(), updated_at = now()
   where session_id = p_session_id and user_id is null;
  if found then
    return 'linked';
  end if;

  select user_id into v_owner from public.onboarding_responses where session_id = p_session_id;
  if not found then
    return 'not_found';
  end if;
  return case when v_owner = p_user_id then 'already_linked' else 'claimed_by_other' end;
end;
$$;

revoke all on function public.save_onboarding_answers(uuid, jsonb, int, int, boolean) from public, anon, authenticated;
revoke all on function public.link_onboarding_session(uuid, uuid)                     from public, anon, authenticated;
grant execute on function public.save_onboarding_answers(uuid, jsonb, int, int, boolean) to service_role;
grant execute on function public.link_onboarding_session(uuid, uuid)                     to service_role;

-- Optional retention (run manually or schedule with pg_cron): drop anonymous rows after 12 months.
-- delete from public.onboarding_responses where user_id is null and created_at < now() - interval '12 months';
