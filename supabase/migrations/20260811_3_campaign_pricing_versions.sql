-- ============================================================
-- 1) New table: campaign_pricing_versions
-- ============================================================
-- This is the "price history book" for each Campaign.
-- Each row = one price version.
--
-- Campaigns are archived rather than deleted, so pricing history
-- remains permanently attached to the campaign.

CREATE TABLE IF NOT EXISTS public.campaign_pricing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_id uuid NOT NULL
    REFERENCES public.campaigns(id)
    ON DELETE RESTRICT,

  -- 1, 2, 3... per campaign
  version integer NOT NULL,

  -- When this price was active
  effective_from timestamptz NOT NULL,

  -- NULL = this is the CURRENT price
  effective_to timestamptz NULL,

  -- Snapshot of pricing numbers at this version
  offer_price            numeric NOT NULL DEFAULT 0,
  consultation_fee       numeric NOT NULL DEFAULT 0,
  estimated_close_rate   numeric NOT NULL DEFAULT 0,
  base_offer_value       numeric NOT NULL DEFAULT 0,
  upsell_probability     numeric NOT NULL DEFAULT 0,
  average_upsell_value   numeric NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Same campaign cannot have two rows with the same version number
  CONSTRAINT campaign_pricing_versions_campaign_version_unique
    UNIQUE (campaign_id, version)
);

COMMENT ON TABLE public.campaign_pricing_versions IS
  'Historical pricing versions per campaign. Archived campaigns retain their complete pricing history. Only one row per campaign may have effective_to IS NULL (current).';


-- ============================================================
-- 2) Indexes for fast lookup
-- ============================================================

-- Find all versions for a campaign
CREATE INDEX IF NOT EXISTS idx_cpv_campaign_id
  ON public.campaign_pricing_versions (campaign_id);

-- Find the version active at a given event time
-- Backend:
-- effective_from <= event_time
-- AND (effective_to IS NULL OR event_time < effective_to)
CREATE INDEX IF NOT EXISTS idx_cpv_campaign_effective_range
  ON public.campaign_pricing_versions (
    campaign_id,
    effective_from,
    effective_to
  );


-- ============================================================
-- 3) Add pricing_version_id to pixel_purchases (nullable)
-- ============================================================
-- Old rows stay NULL.
-- New purchases will be linked to the pricing version
-- that was active when the purchase occurred.

ALTER TABLE public.pixel_purchases
  ADD COLUMN IF NOT EXISTS pricing_version_id uuid NULL;


-- A pixel purchase may point to a pricing version.
-- ON DELETE SET NULL protects the purchase record itself if
-- a pricing version were ever removed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pixel_purchases_pricing_version_id_fkey'
  ) THEN
    ALTER TABLE public.pixel_purchases
      ADD CONSTRAINT pixel_purchases_pricing_version_id_fkey
      FOREIGN KEY (pricing_version_id)
      REFERENCES public.campaign_pricing_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;


CREATE INDEX IF NOT EXISTS idx_pixel_purchases_pricing_version_id
  ON public.pixel_purchases (pricing_version_id);


-- ============================================================
-- 4) Backfill: one version per existing Campaign
-- ============================================================
-- This is NOT historical truth.
-- It means:
-- "This was the pricing state when version tracking started."
--
-- effective_from = migration time.
-- Archived campaigns are included because their campaign rows
-- still exist.

INSERT INTO public.campaign_pricing_versions (
  campaign_id,
  version,
  effective_from,
  effective_to,
  offer_price,
  consultation_fee,
  estimated_close_rate,
  base_offer_value,
  upsell_probability,
  average_upsell_value,
  created_at
)
SELECT
  c.id,
  1,
  now(),
  NULL,
  COALESCE(c.offer_price, 0),
  COALESCE(c.consultation_fee, 0),
  COALESCE(c.estimated_close_rate, 0),
  COALESCE(c.base_offer_value, 0),
  COALESCE(c.upsell_probability, 0),
  COALESCE(c.average_upsell_value, 0),
  now()
FROM public.campaigns c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.campaign_pricing_versions v
  WHERE v.campaign_id = c.id
);


-- ============================================================
-- 5) HARD RULE: only ONE current version per Campaign
-- ============================================================
-- Among rows where effective_to IS NULL,
-- campaign_id must be unique.

CREATE UNIQUE INDEX IF NOT EXISTS idx_cpv_one_current_per_campaign
  ON public.campaign_pricing_versions (campaign_id)
  WHERE effective_to IS NULL;