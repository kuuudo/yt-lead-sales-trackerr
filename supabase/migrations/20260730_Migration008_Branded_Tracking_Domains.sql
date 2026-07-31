-- ============================================================
-- Migration 008: Branded Tracking Domains
-- Additive only. redirect_links gains one nullable column.
-- No other existing table is touched.
-- ============================================================

create table public.branded_tracking_domains (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  hostname                  text not null,
  status                    text not null default 'pending',
  is_default                boolean not null default false,
  verification_token_hash   text not null,
  verified_at               timestamptz,
  created_by                uuid references auth.users(id) on delete set null,
  created_at                timestamptz not null default now(),

  constraint branded_tracking_domains_status_check
    check (status in ('pending', 'verified', 'failed')),

  constraint branded_tracking_domains_hostname_lowercase_check
    check (hostname = lower(hostname))
);

-- Global uniqueness — anti-hijack: no two orgs may claim the same hostname.
create unique index branded_tracking_domains_hostname_key
  on public.branded_tracking_domains (hostname);

-- One default domain per org.
create unique index branded_tracking_domains_org_default_key
  on public.branded_tracking_domains (organization_id)
  where is_default;

create index branded_tracking_domains_organization_id_idx
  on public.branded_tracking_domains (organization_id);

comment on table public.branded_tracking_domains is
  'Organization-owned branded tracking domains (Ch4 Art.8). status is '
  'permanent proof of DNS ownership and never reverts once verified; '
  'is_default governs whether new redirect_links resolve to this domain. '
  'Domain resolution happens at redirect_links creation time using the '
  'already-resolved organization_id — never by looking up assignment or '
  'campaign context.';

comment on column public.branded_tracking_domains.verification_token_hash is
  'SHA-256 hash of the one-time verification token shown once at creation. '
  'Plaintext is never persisted.';

alter table public.redirect_links
  add column tracking_hostname text;

comment on column public.redirect_links.tracking_hostname is
  'Snapshot of the branded domain hostname resolved at creation time. '
  'NULL = default vstrk.com. Written once at insert, never updated — '
  'historical links must never change hostname even if the organization''s '
  'default domain changes later. Resolved from organization_id at the '
  'point createRedirectLink() already has it (via promotions.organization_id '
  'for promoted assets, or the campaign''s own organization_id for personal '
  'tracking) — never via assignment or campaign lookup.';

-- ------------------------------------------------------------
-- RLS — org-member scoped. Deliberately NOT public-read, unlike
-- redirect_links: this table holds verification_token_hash and
-- domain-control state, which is org-internal.
-- ------------------------------------------------------------
alter table public.branded_tracking_domains enable row level security;

create policy "Org members can read their branded tracking domains"
  on public.branded_tracking_domains
  for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

create policy "Org members can insert branded tracking domains"
  on public.branded_tracking_domains
  for insert
  with check (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

create policy "Org members can update their branded tracking domains"
  on public.branded_tracking_domains
  for update
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

create policy "Org members can delete their branded tracking domains"
  on public.branded_tracking_domains
  for delete
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

-- NOTE: the redirect handler's Host-header lookup
-- (WHERE hostname = <Host> AND status = 'verified') is an unauthenticated
-- request from a visitor — it must run under the service role, not the
-- anon key, since this table has no public-read policy.