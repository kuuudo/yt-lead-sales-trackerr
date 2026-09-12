-- Additive migration: persist root_domain on branded_tracking_domains
-- Scope: branded_tracking_domains ONLY.

ALTER TABLE branded_tracking_domains
  ADD COLUMN IF NOT EXISTS root_domain text;

UPDATE branded_tracking_domains
SET root_domain = CASE
  WHEN array_length(regexp_split_to_array(hostname, '\.'), 1) >= 3
    AND (
      array_to_string(
        (regexp_split_to_array(hostname, '\.'))[
          array_length(regexp_split_to_array(hostname, '\.'), 1) - 1
          : array_length(regexp_split_to_array(hostname, '\.'), 1)
        ],
        '.'
      )
    ) IN (
      'co.uk','org.uk','ac.uk','gov.uk',
      'com.au','net.au','org.au',
      'co.nz','com.br','com.mx','co.jp','com.cn','com.hk','com.sg',
      'co.in','com.tw','co.kr','com.ar','com.tr'
    )
  THEN array_to_string(
    (regexp_split_to_array(hostname, '\.'))[
      greatest(array_length(regexp_split_to_array(hostname, '\.'), 1) - 2, 1)
      : array_length(regexp_split_to_array(hostname, '\.'), 1)
    ],
    '.'
  )
  WHEN array_length(regexp_split_to_array(hostname, '\.'), 1) >= 2
  THEN array_to_string(
    (regexp_split_to_array(hostname, '\.'))[
      array_length(regexp_split_to_array(hostname, '\.'), 1) - 1
      : array_length(regexp_split_to_array(hostname, '\.'), 1)
    ],
    '.'
  )
  ELSE hostname
END
WHERE root_domain IS NULL;

-- Additive migration: campaigns.root_domain
--
-- Scope: campaigns ONLY. Nullable, no default, no backfill — per explicit
-- instruction, existing Campaigns must NOT be assigned a guessed
-- root_domain from unrelated existing branded_tracking_domains rows.
-- A Campaign's root_domain is only ever set going forward, the first
-- time a Tracking Domain is created for it (see addBrandedDomain()).

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS root_domain text;

-- Deliberately no UPDATE / backfill statement here.
-- Deliberately no UNIQUE constraint here — "one root_domain per org" is
-- enforced at the application layer in addBrandedDomain(), not via a DB
-- constraint, per the smallest-change scope of this step.