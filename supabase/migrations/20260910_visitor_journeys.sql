-- Minimal visitor → journey mapping for the cross-origin YouTube bridge PoC.
-- Does NOT duplicate event_journey. event_journey remains the source of truth.

create table if not exists public.visitor_journeys (
  visitor_id  uuid primary key,
  journey_id  uuid not null,
  updated_at  timestamptz not null default now()
);

create index if not exists visitor_journeys_updated_at_idx
  on public.visitor_journeys (updated_at desc);

-- Anon-safe upsert (SECURITY DEFINER so RLS does not block the tracking page)
create or replace function public.upsert_visitor_journey(
  p_visitor_id uuid,
  p_journey_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.visitor_journeys (visitor_id, journey_id, updated_at)
  values (p_visitor_id, p_journey_id, now())
  on conflict (visitor_id)
  do update set
    journey_id = excluded.journey_id,
    updated_at = now();
end;
$$;

-- Anon-safe lookup
create or replace function public.get_journey_for_visitor(
  p_visitor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journey_id uuid;
begin
  select journey_id into v_journey_id
  from public.visitor_journeys
  where visitor_id = p_visitor_id;

  return v_journey_id;
end;
$$;

grant execute on function public.upsert_visitor_journey(uuid, uuid) to anon, authenticated;
grant execute on function public.get_journey_for_visitor(uuid) to anon, authenticated;
