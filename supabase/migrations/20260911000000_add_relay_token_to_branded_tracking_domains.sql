-- Phase 1: permanent continuation-relay identity per branded tracking domain.
-- Infrastructure only. Does not touch redirect_links, events, or journey tables.

ALTER TABLE branded_tracking_domains
  ADD COLUMN IF NOT EXISTS relay_token text;

-- Backfill existing rows with a stable opaque token (same generator style as verification_token).
-- Uses md5(random()::text || id::text || clock_timestamp()::text) for URL-safe hex;
-- uniqueness is enforced by the constraint below.
UPDATE branded_tracking_domains
SET relay_token = substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 24)
WHERE relay_token IS NULL;

-- Enforce uniqueness and non-null going forward.
ALTER TABLE branded_tracking_domains
  ALTER COLUMN relay_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS branded_tracking_domains_relay_token_key
  ON branded_tracking_domains (relay_token);

COMMENT ON COLUMN branded_tracking_domains.relay_token IS
  'Permanent opaque infrastructure token for the /r/:relayToken continuation relay. Not a redirect_links token. Never used for journey/analytics.';
