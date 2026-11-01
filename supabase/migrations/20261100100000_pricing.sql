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