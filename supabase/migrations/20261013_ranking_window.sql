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
