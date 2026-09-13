ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS creative_creation_mode text NULL
    CHECK (
      creative_creation_mode IS NULL
      OR creative_creation_mode IN (
        'none',
        'campaign_asset_only',
        'campaign_links_and_assets'
      )
    );

    ALTER TABLE assignment_assets
  ADD COLUMN IF NOT EXISTS allow_marketer_domain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_sponsor_domain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_vstrk_domain boolean NOT NULL DEFAULT false;