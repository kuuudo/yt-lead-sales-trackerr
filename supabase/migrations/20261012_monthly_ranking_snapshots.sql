-- monthly_ranking_snapshots
-- Persistent monthly history: Total Revenue + Top 10 Marketers + Top 10 Promotions.
-- This is a SNAPSHOT of canonical Revenue results, not a second attribution engine.
--
-- Timezone: period_start / period_end are calendar-month bounds stored as date
-- (UTC month boundaries unless the app later passes an explicit workspace TZ).
-- Do not invent a per-workspace timezone here; document when product adds one.
--
-- Lifecycle:
--   provisional — current (or open) month; may be fully replaced on refresh
--   finalized   — historical; ordinary refresh must not overwrite
-- Restatement after finalization uses a new snapshot_version (explicit correction).

CREATE TABLE IF NOT EXISTS public.monthly_ranking_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  ranking_type text NOT NULL
    CHECK (ranking_type IN ('total_revenue', 'marketer', 'promotion')),
  -- NULL for total_revenue aggregate; 1..10 for ranked rows
  rank integer NULL
    CHECK (rank IS NULL OR (rank >= 1 AND rank <= 10)),
  marketer_id uuid NULL,
  promotion_id uuid NULL,
  entity_name_snapshot text NULL,
  revenue numeric(18, 2) NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  rpc numeric(18, 4) NOT NULL DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'provisional'
    CHECK (status IN ('provisional', 'finalized')),
  -- Increments only for explicit finalized restatements; provisional stays at 1 until finalized
  snapshot_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_ranking_period_ok CHECK (period_end >= period_start),
  CONSTRAINT monthly_ranking_type_ids_ok CHECK (
    (ranking_type = 'total_revenue' AND rank IS NULL AND marketer_id IS NULL AND promotion_id IS NULL)
    OR (ranking_type = 'marketer' AND rank IS NOT NULL AND marketer_id IS NOT NULL)
    OR (ranking_type = 'promotion' AND rank IS NOT NULL AND promotion_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.monthly_ranking_snapshots IS
  'Monthly snapshot of Total Revenue and Top 10 Marketer/Promotion rankings. Snapshot of canonical conversion attribution; not an attribution engine.';

-- Fast lookup by org + month
CREATE INDEX IF NOT EXISTS monthly_ranking_snapshots_org_period_idx
  ON public.monthly_ranking_snapshots (organization_id, period_start, ranking_type, status);

CREATE INDEX IF NOT EXISTS monthly_ranking_snapshots_org_status_idx
  ON public.monthly_ranking_snapshots (organization_id, status, period_start DESC);

-- At most one provisional total_revenue row per org/month
CREATE UNIQUE INDEX IF NOT EXISTS monthly_ranking_snapshots_provisional_total_uidx
  ON public.monthly_ranking_snapshots (organization_id, period_start)
  WHERE status = 'provisional' AND ranking_type = 'total_revenue';

-- At most one provisional row per rank for marketer/promotion (rank 1..10)
CREATE UNIQUE INDEX IF NOT EXISTS monthly_ranking_snapshots_provisional_rank_uidx
  ON public.monthly_ranking_snapshots (organization_id, period_start, ranking_type, rank)
  WHERE status = 'provisional' AND ranking_type IN ('marketer', 'promotion');

-- Finalized history: unique per version + type + rank (or total)
CREATE UNIQUE INDEX IF NOT EXISTS monthly_ranking_snapshots_finalized_total_uidx
  ON public.monthly_ranking_snapshots (organization_id, period_start, snapshot_version)
  WHERE status = 'finalized' AND ranking_type = 'total_revenue';

CREATE UNIQUE INDEX IF NOT EXISTS monthly_ranking_snapshots_finalized_rank_uidx
  ON public.monthly_ranking_snapshots (organization_id, period_start, ranking_type, snapshot_version, rank)
  WHERE status = 'finalized' AND ranking_type IN ('marketer', 'promotion');

-- RLS: organization isolation (same pattern as other org-scoped tables)
ALTER TABLE public.monthly_ranking_snapshots ENABLE ROW LEVEL SECURITY;

-- Adjust policy expressions to match your project's org membership helper if different.
-- Common pattern: organization_members.user_id = auth.uid()
DROP POLICY IF EXISTS monthly_ranking_snapshots_select_org ON public.monthly_ranking_snapshots;
CREATE POLICY monthly_ranking_snapshots_select_org
  ON public.monthly_ranking_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = monthly_ranking_snapshots.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS monthly_ranking_snapshots_insert_org ON public.monthly_ranking_snapshots;
CREATE POLICY monthly_ranking_snapshots_insert_org
  ON public.monthly_ranking_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = monthly_ranking_snapshots.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS monthly_ranking_snapshots_update_org ON public.monthly_ranking_snapshots;
CREATE POLICY monthly_ranking_snapshots_update_org
  ON public.monthly_ranking_snapshots
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = monthly_ranking_snapshots.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS monthly_ranking_snapshots_delete_org ON public.monthly_ranking_snapshots;
CREATE POLICY monthly_ranking_snapshots_delete_org
  ON public.monthly_ranking_snapshots
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = monthly_ranking_snapshots.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- Support multiple ranking windows (last_7_days, last_30_days, this_month, …)
-- in addition to calendar-month snapshots.

ALTER TABLE public.monthly_ranking_snapshots
  ADD COLUMN IF NOT EXISTS ranking_window text NOT NULL DEFAULT 'this_month';

COMMENT ON COLUMN public.monthly_ranking_snapshots.ranking_window IS
  'Preset window key: last_7_days | last_30_days | this_month | last_12_months | all_time | custom';

-- Drop old provisional uniqueness (month-only) and recreate including ranking_window
DROP INDEX IF EXISTS monthly_ranking_snapshots_provisional_total_uidx;
DROP INDEX IF EXISTS monthly_ranking_snapshots_provisional_rank_uidx;
DROP INDEX IF EXISTS monthly_ranking_snapshots_finalized_total_uidx;
DROP INDEX IF EXISTS monthly_ranking_snapshots_finalized_rank_uidx;

CREATE UNIQUE INDEX monthly_ranking_snapshots_provisional_total_uidx
  ON public.monthly_ranking_snapshots (organization_id, ranking_window, period_start)
  WHERE status = 'provisional' AND ranking_type = 'total_revenue';

CREATE UNIQUE INDEX monthly_ranking_snapshots_provisional_rank_uidx
  ON public.monthly_ranking_snapshots (organization_id, ranking_window, period_start, ranking_type, rank)
  WHERE status = 'provisional' AND ranking_type IN ('marketer', 'promotion');

CREATE UNIQUE INDEX monthly_ranking_snapshots_finalized_total_uidx
  ON public.monthly_ranking_snapshots (organization_id, ranking_window, period_start, snapshot_version)
  WHERE status = 'finalized' AND ranking_type = 'total_revenue';

CREATE UNIQUE INDEX monthly_ranking_snapshots_finalized_rank_uidx
  ON public.monthly_ranking_snapshots (organization_id, ranking_window, period_start, ranking_type, snapshot_version, rank)
  WHERE status = 'finalized' AND ranking_type IN ('marketer', 'promotion');

CREATE INDEX IF NOT EXISTS monthly_ranking_snapshots_org_window_idx
  ON public.monthly_ranking_snapshots (organization_id, ranking_window, status, period_start DESC);


  BEGIN;

-- 1) New columns (nullable → no table rewrite, existing rows stay valid)
ALTER TABLE public.monthly_ranking_snapshots
  ADD COLUMN IF NOT EXISTS asset_id uuid NULL,
  ADD COLUMN IF NOT EXISTS ranking_scope text NULL;

COMMENT ON COLUMN public.monthly_ranking_snapshots.asset_id IS
  'Set only when ranking_type = ''asset''. No FK on purpose (history, and Shared assets can belong to another org).';
COMMENT ON COLUMN public.monthly_ranking_snapshots.ranking_scope IS
  'Set only when ranking_type = ''asset''. Which asset list this row belongs to, e.g. campaign_element | all | my | shared | assigned. NULL for total_revenue / marketer / promotion.';

-- 2) Allow ranking_type = 'asset'.
--    The original CHECK was inline (auto-named); drop whichever CHECK only restricts ranking_type.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.monthly_ranking_snapshots'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%ranking_type%'
      AND pg_get_constraintdef(oid) NOT LIKE '%marketer_id%'
      AND conname <> 'monthly_ranking_type_ok'
  LOOP
    RAISE NOTICE 'dropping ranking_type check: %', c.conname;
    EXECUTE format('ALTER TABLE public.monthly_ranking_snapshots DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.monthly_ranking_snapshots DROP CONSTRAINT IF EXISTS monthly_ranking_type_ok;
ALTER TABLE public.monthly_ranking_snapshots
  ADD CONSTRAINT monthly_ranking_type_ok
  CHECK (ranking_type IN ('total_revenue', 'marketer', 'promotion', 'asset'));

-- 3) Shape rule per type (original three branches kept, plus asset)
ALTER TABLE public.monthly_ranking_snapshots DROP CONSTRAINT IF EXISTS monthly_ranking_type_ids_ok;
ALTER TABLE public.monthly_ranking_snapshots
  ADD CONSTRAINT monthly_ranking_type_ids_ok CHECK (
    (ranking_type = 'total_revenue' AND rank IS NULL AND marketer_id IS NULL AND promotion_id IS NULL
       AND asset_id IS NULL AND ranking_scope IS NULL)
    OR (ranking_type = 'marketer' AND rank IS NOT NULL AND marketer_id IS NOT NULL
       AND asset_id IS NULL AND ranking_scope IS NULL)
    OR (ranking_type = 'promotion' AND rank IS NOT NULL AND promotion_id IS NOT NULL
       AND asset_id IS NULL AND ranking_scope IS NULL)
    OR (ranking_type = 'asset' AND rank IS NOT NULL AND asset_id IS NOT NULL AND ranking_scope IS NOT NULL)
  );

-- 4) Asset-only unique indexes. Existing indexes are NOT touched: their predicates
--    (total_revenue / marketer,promotion) already exclude asset rows.
CREATE UNIQUE INDEX IF NOT EXISTS monthly_ranking_snapshots_provisional_asset_rank_uidx
  ON public.monthly_ranking_snapshots
  (organization_id, ranking_window, period_start, ranking_scope, rank)
  WHERE status = 'provisional' AND ranking_type = 'asset';

CREATE UNIQUE INDEX IF NOT EXISTS monthly_ranking_snapshots_finalized_asset_rank_uidx
  ON public.monthly_ranking_snapshots
  (organization_id, ranking_window, period_start, ranking_scope, snapshot_version, rank)
  WHERE status = 'finalized' AND ranking_type = 'asset';

COMMIT;

-- Campaign monthly snapshots for Tree.tsx (and shared Campaign metrics).
-- Separate from monthly_ranking_snapshots (rankings cannot hold five per-campaign metrics).
-- Lifecycle mirrors ranking snapshots: provisional replaceable; finalized not silently overwritten.
--
-- THIS FILE IS GENERATED SQL. It has NOT been executed against your database.

BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_monthly_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- Five metrics (All Assets / InDepth semantics)
  purchases integer NOT NULL DEFAULT 0,
  sales_calls integer NOT NULL DEFAULT 0,
  newsletter_optins integer NOT NULL DEFAULT 0,
  consultations integer NOT NULL DEFAULT 0,
  revenue numeric(18, 4) NOT NULL DEFAULT 0,
  -- Optional rollup of conversion rows that contributed to revenue (not a 6th UI metric)
  revenue_conversions integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'provisional'
    CHECK (status IN ('provisional', 'finalized')),
  snapshot_version integer NOT NULL DEFAULT 1,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One provisional row per org + campaign + month
CREATE UNIQUE INDEX IF NOT EXISTS campaign_monthly_snapshots_provisional_uidx
  ON public.campaign_monthly_snapshots (organization_id, campaign_id, period_start)
  WHERE status = 'provisional';

-- Finalized versions may coexist by snapshot_version
CREATE UNIQUE INDEX IF NOT EXISTS campaign_monthly_snapshots_finalized_uidx
  ON public.campaign_monthly_snapshots (organization_id, campaign_id, period_start, snapshot_version)
  WHERE status = 'finalized';

CREATE INDEX IF NOT EXISTS campaign_monthly_snapshots_org_period_idx
  ON public.campaign_monthly_snapshots (organization_id, period_start);

ALTER TABLE public.campaign_monthly_snapshots ENABLE ROW LEVEL SECURITY;

-- Align with org-scoped read/write patterns used elsewhere.
-- Adjust policy names if your project already defines equivalent helpers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_monthly_snapshots' AND policyname = 'campaign_monthly_snapshots_select_org'
  ) THEN
    CREATE POLICY campaign_monthly_snapshots_select_org
      ON public.campaign_monthly_snapshots
      FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_monthly_snapshots' AND policyname = 'campaign_monthly_snapshots_write_org'
  ) THEN
    CREATE POLICY campaign_monthly_snapshots_write_org
      ON public.campaign_monthly_snapshots
      FOR ALL
      USING (
        organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- organization_members may differ by project; table still created for manual policy attach
    RAISE NOTICE 'organization_members missing — attach RLS policies manually';
END $$;

COMMIT;


create or replace function public.get_sponsor_display_names(org_ids uuid[])
returns table (organization_id uuid, display_name text)
language sql
security definer
set search_path = public
as $$
  select o.id,
         coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), o.name)
  from organizations o
  left join profiles p on p.id = o.owner_id
  where o.id = any(org_ids);
$$;

grant execute on function public.get_sponsor_display_names(uuid[]) to authenticated;

