-- Phase 0: persist the plaintext verification token so it can be
-- redisplayed on every page load while a domain is pending.
--
-- Does NOT touch verification_token_hash or the verify-domain.ts
-- comparison logic — that security path is unchanged. This column
-- is display-only.

alter table branded_tracking_domains
  add column if not exists verification_token text;

-- Existing pending rows (added before this migration) have no
-- retrievable plaintext token — their hash-only token is lost per
-- the original design. They cannot be backfilled. Any currently
-- pending domain (e.g. go.kaksidigitals.com if unverified) must be
-- deleted and re-added after this migration ships, so a fresh
-- plaintext token gets generated and stored.
--
-- Run this to find affected rows before deploying:
-- select id, hostname, created_at from branded_tracking_domains
--   where status = 'pending' and verification_token is null;
