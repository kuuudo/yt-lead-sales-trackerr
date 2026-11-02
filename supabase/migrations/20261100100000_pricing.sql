-- Stage A: force trial on client INSERT; block fake paid/trial on insert.
-- service_role UPDATE path (Stripe webhook) unchanged.

begin;

create or replace function public.subscriptions_force_trial_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Client signup path: no Stripe subscription id yet.
  -- Force a clean 3-day trial; ignore whatever the client sent.
  if new.stripe_subscription_id is null then
    new.status := 'trialing';
    new.trial_ends_at := now() + interval '3 days';

    -- Never allow client to plant paid identity on insert
    new.stripe_customer_id := null;
    -- leave organization_id as provided (still subject to RLS WITH CHECK)
  end if;

  return new;
end;
$$;

drop trigger if exists trg_subscriptions_force_trial_on_insert on public.subscriptions;

create trigger trg_subscriptions_force_trial_on_insert
  before insert on public.subscriptions
  for each row
  execute function public.subscriptions_force_trial_on_insert();

commit;

begin;

create or replace function public.subscriptions_force_trial_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Force all non-service-role inserts into a clean 3-day trial.
  if coalesce(auth.role(), '') <> 'service_role' then
    new.status := 'trialing';
    new.trial_ends_at := now() + interval '3 days';

    -- Never allow client-provided Stripe identity.
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
  end if;

  return new;
end;
$$;

commit;



-- Phase B: subscription plan catalog
-- Clients may SELECT enabled plans only. No client writes.
-- Stripe Price IDs must be filled in after creating Prices in Stripe Dashboard.

begin;

create table if not exists public.pricing_plans (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  description     text,
  interval        text not null,
  amount_cents    integer not null,
  currency        text not null default 'usd',
  stripe_price_id text not null,
  is_enabled      boolean not null default true,
  is_recommended  boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint pricing_plans_interval_valid
    check (interval in ('week', 'month', 'year')),

  constraint pricing_plans_amount_positive
    check (amount_cents > 0),

  constraint pricing_plans_code_not_blank
    check (length(trim(code)) > 0)
);

create index if not exists pricing_plans_enabled_sort_idx
  on public.pricing_plans (is_enabled, sort_order);

alter table public.pricing_plans enable row level security;

revoke all on public.pricing_plans from public, anon, authenticated;
grant select on public.pricing_plans to authenticated;
grant all on public.pricing_plans to service_role;

drop policy if exists pricing_plans_select_enabled on public.pricing_plans;
create policy pricing_plans_select_enabled
  on public.pricing_plans
  for select
  to authenticated
  using (is_enabled = true);

-- Seed three plans.
-- IMPORTANT: replace REPLACE_ME_* with real Stripe Price IDs (price_...)
-- before or immediately after running this migration.
insert into public.pricing_plans (
  code, name, description, interval, amount_cents, currency,
  stripe_price_id, is_enabled, is_recommended, sort_order
) values
  (
    'weekly',
    'Weekly',
    'Maximum flexibility. No long-term commitment.',
    'week',
    900,
    'usd',
    'REPLACE_ME_WEEKLY_PRICE_ID',
    true,
    false,
    1
  ),
  (
    'monthly',
    'Monthly',
    'Best balance of price and flexibility.',
    'month',
    2900,
    'usd',
    'REPLACE_ME_MONTHLY_PRICE_ID',
    true,
    true,
    2
  ),
  (
    'yearly',
    'Yearly',
    'Best value. Save versus weekly and monthly billing.',
    'year',
    19900,
    'usd',
    'REPLACE_ME_YEARLY_PRICE_ID',
    true,
    false,
    3
  )
on conflict (code) do nothing;

commit;

-- After creating Stripe Prices, run (example):
-- update public.pricing_plans set stripe_price_id = 'price_xxx', updated_at = now() where code = 'weekly';
-- update public.pricing_plans set stripe_price_id = 'price_yyy', updated_at = now() where code = 'monthly';
-- update public.pricing_plans set stripe_price_id = 'price_zzz', updated_at = now() where code = 'yearly';


-- Phase C: Admin Billing RPCs
-- Admin = team_is_admin() only (UUID ee2f8a30-27b6-49f8-8a00-cff679e9da14)
-- No broad UPDATE grants on pricing_plans or subscriptions for authenticated.

begin;

-- ---------------------------------------------------------------------------
-- admin_list_pricing_plans — all plans including disabled
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_pricing_plans()
returns setof public.pricing_plans
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.team_is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select *
  from public.pricing_plans
  order by sort_order asc, code asc;
end;
$$;

revoke all on function public.admin_list_pricing_plans() from public;
revoke execute on function public.admin_list_pricing_plans() from anon;
grant execute on function public.admin_list_pricing_plans() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_update_pricing_plan
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_pricing_plan(
  p_id               uuid,
  p_name             text,
  p_description      text,
  p_stripe_price_id  text,
  p_amount_cents     integer,
  p_is_enabled       boolean,
  p_is_recommended   boolean,
  p_sort_order       integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_name);
  v_price text := trim(p_stripe_price_id);
  v_row public.pricing_plans%rowtype;
begin
  if not public.team_is_admin() then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  if p_id is null then
    return jsonb_build_object('success', false, 'error', 'id_required');
  end if;

  if v_name is null or length(v_name) = 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_name');
  end if;

  if v_price is null or length(v_price) = 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_stripe_price_id');
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount_cents');
  end if;

  if p_sort_order is null then
    return jsonb_build_object('success', false, 'error', 'invalid_sort_order');
  end if;

  select * into v_row
  from public.pricing_plans
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'plan_not_found');
  end if;

  -- Only one recommended plan at a time when enabling recommended.
  if coalesce(p_is_recommended, false) then
    update public.pricing_plans
    set is_recommended = false,
        updated_at = now()
    where id <> p_id
      and is_recommended = true;
  end if;

  update public.pricing_plans
  set
    name = v_name,
    description = nullif(trim(coalesce(p_description, '')), ''),
    stripe_price_id = v_price,
    amount_cents = p_amount_cents,
    is_enabled = coalesce(p_is_enabled, true),
    is_recommended = coalesce(p_is_recommended, false),
    sort_order = p_sort_order,
    updated_at = now()
  where id = p_id;

  return jsonb_build_object(
    'success', true,
    'id', p_id
  );
end;
$$;

revoke all on function public.admin_update_pricing_plan(uuid, text, text, text, integer, boolean, boolean, integer) from public;
revoke execute on function public.admin_update_pricing_plan(uuid, text, text, text, integer, boolean, boolean, integer) from anon;
grant execute on function public.admin_update_pricing_plan(uuid, text, text, text, integer, boolean, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_subscriptions — read-only roster for Admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_subscriptions()
returns table (
  subscription_id         uuid,
  organization_id         uuid,
  organization_name       text,
  owner_user_id           uuid,
  owner_email             text,
  status                  text,
  plan_name               text,
  billing_interval        text,
  trial_ends_at           timestamptz,
  current_period_end      timestamptz,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  created_at              timestamptz,
  updated_at              timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.team_is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    s.id,
    s.organization_id,
    o.name,
    o.owner_id,
    u.email::text,
    s.status,
    s.plan_name,
    s.billing_interval,
    s.trial_ends_at,
    s.current_period_end,
    s.stripe_customer_id,
    s.stripe_subscription_id,
    s.created_at,
    s.updated_at
  from public.subscriptions s
  join public.organizations o on o.id = s.organization_id
  left join auth.users u on u.id = o.owner_id
  order by s.updated_at desc nulls last, s.created_at desc;
end;
$$;

revoke all on function public.admin_list_subscriptions() from public;
revoke execute on function public.admin_list_subscriptions() from anon;
grant execute on function public.admin_list_subscriptions() to authenticated;

commit;




-- Upgrade (scheduled plan change) — schema + admin RPCs.
--
-- Three levels of control:
--   1. Global switch ............ billing_settings.upgrade_enabled
--   2. Show plan on Pricing ..... pricing_plans.is_enabled            (existing, unchanged)
--   3. Show plan on Upgrade ..... pricing_plans.available_in_upgrade (new)
--
-- Pending plan change is mirrored on the existing one-row-per-org
-- public.subscriptions table. Stripe remains the billing authority; these
-- columns are written only by Edge Functions / the webhook (service_role).
--
-- Nothing here touches the first-purchase Checkout flow or the 3-day trial trigger.

begin;

-- ---------------------------------------------------------------------------
-- 1. Per-plan Upgrade availability (independent of is_enabled)
-- ---------------------------------------------------------------------------
alter table public.pricing_plans
  add column if not exists available_in_upgrade boolean not null default false;

-- Clients may read plans that are enabled for Pricing (existing policy) OR
-- available in Upgrade (new policy). Permissive policies are OR-ed together.
drop policy if exists pricing_plans_select_upgrade on public.pricing_plans;
create policy pricing_plans_select_upgrade
  on public.pricing_plans
  for select
  to authenticated
  using (available_in_upgrade = true);

-- ---------------------------------------------------------------------------
-- 2. Global Upgrade switch (single-row settings table, no client access)
-- ---------------------------------------------------------------------------
create table if not exists public.billing_settings (
  id              boolean primary key default true,
  upgrade_enabled boolean not null default false,
  updated_at      timestamptz not null default now(),
  constraint billing_settings_singleton check (id)
);

insert into public.billing_settings (id, upgrade_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from public, anon, authenticated;
grant all on public.billing_settings to service_role;
-- No policies on purpose: authenticated users read it only via get_upgrade_enabled().

create or replace function public.get_upgrade_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select upgrade_enabled from public.billing_settings where id = true),
    false
  );
$$;

revoke all on function public.get_upgrade_enabled() from public;
revoke execute on function public.get_upgrade_enabled() from anon;
grant execute on function public.get_upgrade_enabled() to authenticated;

create or replace function public.admin_get_billing_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.team_is_admin() then
    raise exception 'not_admin';
  end if;

  return jsonb_build_object(
    'upgrade_enabled',
    coalesce((select upgrade_enabled from public.billing_settings where id = true), false)
  );
end;
$$;

revoke all on function public.admin_get_billing_settings() from public;
revoke execute on function public.admin_get_billing_settings() from anon;
grant execute on function public.admin_get_billing_settings() to authenticated;

create or replace function public.admin_set_upgrade_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.team_is_admin() then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  if p_enabled is null then
    return jsonb_build_object('success', false, 'error', 'invalid_value');
  end if;

  insert into public.billing_settings (id, upgrade_enabled, updated_at)
  values (true, p_enabled, now())
  on conflict (id) do update
    set upgrade_enabled = excluded.upgrade_enabled,
        updated_at = now();

  return jsonb_build_object('success', true, 'upgrade_enabled', p_enabled);
end;
$$;

revoke all on function public.admin_set_upgrade_enabled(boolean) from public;
revoke execute on function public.admin_set_upgrade_enabled(boolean) from anon;
grant execute on function public.admin_set_upgrade_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pending plan change mirror on the existing subscriptions row
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists stripe_schedule_id      text,
  add column if not exists pending_plan_code       text,
  add column if not exists pending_plan_name       text,
  add column if not exists pending_billing_interval text,
  add column if not exists pending_effective_at    timestamptz,
  add column if not exists pending_stripe_price_id text;

-- One Stripe Subscription Schedule per subscription row, never shared.
create unique index if not exists subscriptions_stripe_schedule_id_key
  on public.subscriptions (stripe_schedule_id)
  where stripe_schedule_id is not null;

-- ---------------------------------------------------------------------------
-- 4. admin_update_pricing_plan: add p_available_in_upgrade
--    The old 8-argument signature is dropped (not overloaded) so PostgREST
--    never sees two candidates. The new argument defaults to NULL = "keep
--    current value", so an old client calling with 8 named args still works.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_update_pricing_plan(
  uuid, text, text, text, integer, boolean, boolean, integer
);

create or replace function public.admin_update_pricing_plan(
  p_id                   uuid,
  p_name                 text,
  p_description          text,
  p_stripe_price_id      text,
  p_amount_cents         integer,
  p_is_enabled           boolean,
  p_is_recommended       boolean,
  p_sort_order           integer,
  p_available_in_upgrade boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_name);
  v_price text := trim(p_stripe_price_id);
  v_row public.pricing_plans%rowtype;
begin
  if not public.team_is_admin() then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  if p_id is null then
    return jsonb_build_object('success', false, 'error', 'id_required');
  end if;

  if v_name is null or length(v_name) = 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_name');
  end if;

  if v_price is null or length(v_price) = 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_stripe_price_id');
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount_cents');
  end if;

  if p_sort_order is null then
    return jsonb_build_object('success', false, 'error', 'invalid_sort_order');
  end if;

  select * into v_row
  from public.pricing_plans
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'plan_not_found');
  end if;

  -- Only one recommended plan at a time when enabling recommended.
  if coalesce(p_is_recommended, false) then
    update public.pricing_plans
    set is_recommended = false,
        updated_at = now()
    where id <> p_id
      and is_recommended = true;
  end if;

  update public.pricing_plans
  set
    name = v_name,
    description = nullif(trim(coalesce(p_description, '')), ''),
    stripe_price_id = v_price,
    amount_cents = p_amount_cents,
    is_enabled = coalesce(p_is_enabled, true),
    is_recommended = coalesce(p_is_recommended, false),
    sort_order = p_sort_order,
    available_in_upgrade = coalesce(p_available_in_upgrade, v_row.available_in_upgrade),
    updated_at = now()
  where id = p_id;

  return jsonb_build_object(
    'success', true,
    'id', p_id
  );
end;
$$;

revoke all on function public.admin_update_pricing_plan(
  uuid, text, text, text, integer, boolean, boolean, integer, boolean
) from public;
revoke execute on function public.admin_update_pricing_plan(
  uuid, text, text, text, integer, boolean, boolean, integer, boolean
) from anon;
grant execute on function public.admin_update_pricing_plan(
  uuid, text, text, text, integer, boolean, boolean, integer, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. admin_list_subscriptions: also show schedule + pending plan.
--    Return type changes, so the function must be dropped and recreated.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_subscriptions();

create or replace function public.admin_list_subscriptions()
returns table (
  subscription_id          uuid,
  organization_id          uuid,
  organization_name        text,
  owner_user_id            uuid,
  owner_email              text,
  status                   text,
  plan_name                text,
  billing_interval         text,
  trial_ends_at            timestamptz,
  current_period_end       timestamptz,
  stripe_customer_id       text,
  stripe_subscription_id   text,
  created_at               timestamptz,
  updated_at               timestamptz,
  stripe_schedule_id       text,
  pending_plan_name        text,
  pending_billing_interval text,
  pending_effective_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.team_is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    s.id,
    s.organization_id,
    o.name,
    o.owner_id,
    u.email::text,
    s.status,
    s.plan_name,
    s.billing_interval,
    s.trial_ends_at,
    s.current_period_end,
    s.stripe_customer_id,
    s.stripe_subscription_id,
    s.created_at,
    s.updated_at,
    s.stripe_schedule_id,
    s.pending_plan_name,
    s.pending_billing_interval,
    s.pending_effective_at
  from public.subscriptions s
  join public.organizations o on o.id = s.organization_id
  left join auth.users u on u.id = o.owner_id
  order by s.updated_at desc nulls last, s.created_at desc;
end;
$$;

revoke all on function public.admin_list_subscriptions() from public;
revoke execute on function public.admin_list_subscriptions() from anon;
grant execute on function public.admin_list_subscriptions() to authenticated;

commit;
