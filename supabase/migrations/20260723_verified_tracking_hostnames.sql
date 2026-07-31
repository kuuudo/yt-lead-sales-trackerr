-- ============================================================
-- verified_tracking_hostnames
-- Narrow public-read view for the redirect handler's Host-header
-- guard. Exposes ONLY hostname for verified domains — never
-- verification_token_hash, organization_id, created_by, or any
-- other column on branded_tracking_domains, which stays org-scoped.
-- ============================================================

create view public.verified_tracking_hostnames as
  select hostname
  from public.branded_tracking_domains
  where status = 'verified';

grant select on public.verified_tracking_hostnames to anon, authenticated;