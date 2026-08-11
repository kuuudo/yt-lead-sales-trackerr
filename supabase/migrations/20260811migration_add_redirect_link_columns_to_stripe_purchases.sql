-- Migration: add original-redirect-link attribution to stripe_purchases
--
-- Additive only. Does not touch stripe_purchases.token (remains the
-- campaign-level checkout token, e.g. 'mGVj'), and does not touch any
-- other existing column. Both new columns are nullable — historical
-- purchases are never rewritten and will simply have NULL here.

ALTER TABLE stripe_purchases
  ADD COLUMN IF NOT EXISTS redirect_link_id uuid NULL,
  ADD COLUMN IF NOT EXISTS redirect_link_token varchar(16) NULL;

COMMENT ON COLUMN stripe_purchases.redirect_link_id IS
  'redirect_links.id of the ORIGINAL (first-touch) redirect link the customer clicked — distinct from stripe_purchases.token, which is the campaign-level checkout token. NULL for purchases recorded before this column existed.';

COMMENT ON COLUMN stripe_purchases.redirect_link_token IS
  'redirect_links.token (short string, e.g. "9vSr") of the ORIGINAL (first-touch) redirect link the customer clicked. NULL for purchases recorded before this column existed.';

-- Optional but recommended: keep referential integrity without ever
-- blocking a purchase write. ON DELETE SET NULL means if a redirect_links
-- row is ever deleted, the purchase record survives with this attribution
-- cleared rather than being blocked or cascaded.
-- Uncomment if redirect_links.id is the correct FK target in your schema
-- and you want this enforced at the DB level:
--
-- ALTER TABLE stripe_purchases
--   ADD CONSTRAINT stripe_purchases_redirect_link_id_fkey
--   FOREIGN KEY (redirect_link_id) REFERENCES redirect_links(id)
--   ON DELETE SET NULL;

-- Optional: index if you expect to query/aggregate purchases by
-- original redirect link (e.g. "revenue by landing-page link").
-- CREATE INDEX IF NOT EXISTS idx_stripe_purchases_redirect_link_id
--   ON stripe_purchases(redirect_link_id);
