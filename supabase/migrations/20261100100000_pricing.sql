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
