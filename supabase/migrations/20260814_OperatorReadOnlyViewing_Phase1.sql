begin;

-- ============================================================
-- Operator Read-Only Viewing — Phase 1 (DB / RLS only)
-- Idempotent: safe to run once, and safe to re-run if needed.
-- ============================================================

-- ── Helper functions ─────────────────────────────────────────
-- All SECURITY DEFINER + fixed search_path, matching the existing
-- can_view_member_profile() pattern already in production. Each
-- reads organization_members directly (not through RLS policies),
-- so there is no policy-recursion path.

create or replace function public.is_operator_for_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from organization_members owner_row
    join organization_members target_row
      on target_row.organization_id = owner_row.organization_id
    where owner_row.user_id = auth.uid()
      and owner_row.role = 'owner'
      and target_row.user_id = target_user_id
      and target_row.role = 'member'
  );
$$;

create or replace function public.is_operator_for_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from organization_members owner_row
    where owner_row.organization_id = target_organization_id
      and owner_row.role = 'owner'
      and public.is_operator_for_user(owner_row.user_id)
  );
$$;

create or replace function public.is_operator_for_email(target_email text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from profiles p
    where p.email = target_email
      and public.is_operator_for_user(p.id)
  );
$$;

create or replace function public.resolve_member_organization(member_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select organization_id
  from organization_members
  where user_id = member_user_id
    and role = 'owner'
    and public.is_operator_for_user(member_user_id)
  limit 1;
$$;

-- ── Grants ────────────────────────────────────────────────────
grant execute on function public.is_operator_for_user(uuid) to authenticated;
grant execute on function public.is_operator_for_org(uuid) to authenticated;
grant execute on function public.is_operator_for_email(text) to authenticated;
grant execute on function public.resolve_member_organization(uuid) to authenticated;

-- ── SELECT-only policies ─────────────────────────────────────
-- campaigns: Installation.tsx filters by user_id; other pages by
-- organization_id (nullable). Cover both.
drop policy if exists operator_read_campaigns on public.campaigns;
create policy operator_read_campaigns on public.campaigns
  for select
  using (
    public.is_operator_for_user(user_id)
    or (organization_id is not null and public.is_operator_for_org(organization_id))
  );

-- stripe_configs: no organization_id column, user_id only.
drop policy if exists operator_read_stripe_configs on public.stripe_configs;
create policy operator_read_stripe_configs on public.stripe_configs
  for select
  using (public.is_operator_for_user(user_id));

-- videos: organization_id nullable.
drop policy if exists operator_read_videos on public.videos;
create policy operator_read_videos on public.videos
  for select
  using (organization_id is not null and public.is_operator_for_org(organization_id));

-- assets: organization_id not null, no user_id column.
drop policy if exists operator_read_assets on public.assets;
create policy operator_read_assets on public.assets
  for select
  using (public.is_operator_for_org(organization_id));

-- asset_resources: organization_id not null, no user_id column.
drop policy if exists operator_read_asset_resources on public.asset_resources;
create policy operator_read_asset_resources on public.asset_resources
  for select
  using (public.is_operator_for_org(organization_id));

-- pixel_purchases: organization_id nullable.
drop policy if exists operator_read_pixel_purchases on public.pixel_purchases;
create policy operator_read_pixel_purchases on public.pixel_purchases
  for select
  using (organization_id is not null and public.is_operator_for_org(organization_id));

-- stripe_purchases: organization_id nullable.
drop policy if exists operator_read_stripe_purchases on public.stripe_purchases;
create policy operator_read_stripe_purchases on public.stripe_purchases
  for select
  using (organization_id is not null and public.is_operator_for_org(organization_id));

-- campaign_element_assets: NO organization_id column — route through
-- campaigns, mirroring the existing "Org members can view..." policy shape.
drop policy if exists operator_read_campaign_element_assets on public.campaign_element_assets;
create policy operator_read_campaign_element_assets on public.campaign_element_assets
  for select
  using (
    campaign_id in (
      select c.id
      from public.campaigns c
      where c.organization_id is not null
        and public.is_operator_for_org(c.organization_id)
    )
  );

-- events: organization_id nullable.
drop policy if exists operator_read_events on public.events;
create policy operator_read_events on public.events
  for select
  using (organization_id is not null and public.is_operator_for_org(organization_id));

-- assignment_user_states: user_id not null, personal archive state.
drop policy if exists operator_read_assignment_user_states on public.assignment_user_states;
create policy operator_read_assignment_user_states on public.assignment_user_states
  for select
  using (public.is_operator_for_user(user_id));

-- promotion_user_states: user_id not null, personal archive state.
drop policy if exists operator_read_promotion_user_states on public.promotion_user_states;
create policy operator_read_promotion_user_states on public.promotion_user_states
  for select
  using (public.is_operator_for_user(user_id));

-- ── Explicitly untouched (verified, not modified) ────────────
-- redirect_links          : already has public SELECT ("Public can read redirect links", using true)
-- organization_members    : deliberately not widened; helper functions resolve cross-org via SECURITY DEFINER
-- profiles                : existing can_view_member_profile()-backed policy already covers this case
-- assignments              : RLS disabled — out of scope, not modified
-- assignment_invitations   : RLS disabled — out of scope, not modified
-- assignment_collaborators : RLS disabled — explicitly out of scope, not modified
-- promotions                : RLS disabled — explicitly out of scope, not modified

commit;