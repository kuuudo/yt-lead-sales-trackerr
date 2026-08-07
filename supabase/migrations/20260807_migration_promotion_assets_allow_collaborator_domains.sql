-- Promotion-level "Allow collaborator domains" policy — MVP, per
-- explicit decision NOT to place this on assignment_assets. Lives on
-- promotion_assets because that table is already keyed by
-- (promotion_id, asset_id), which is exactly the grain requested: one
-- boolean per promoted asset, scoped to THIS Promotion only. A future
-- Promotion under the same Assignment gets a fresh promotion_assets row
-- with this column defaulting back to true — no propagation logic
-- required, isolation is enforced by the schema choice itself.
--
-- Default true: existing rows must not silently start hiding
-- collaborator domains the moment this column appears. Same
-- backward-compatibility reasoning already applied to every other
-- additive column in this project.
--
-- Does NOT touch: assignment_assets, assignment_tracking_domains,
-- assignment_tracking_domain_access_states, any revoke/restore RPC,
-- any existing RLS policy on those tables. This is a single new column
-- on an existing table plus one new UPDATE policy — no new table, no
-- new RPC (explicit decision: a direct RLS-guarded UPDATE is
-- sufficient for a single boolean field with no asymmetric
-- revoke/restore semantics to encode).

alter table promotion_assets
  add column allow_collaborator_domains boolean not null default true;

-- SELECT is already covered by promotion_assets' existing RLS —
-- getPromotionDetail.ts already reads this table successfully today
-- for both Sponsor and Collaborator, so no new SELECT policy is added
-- here. Only UPDATE needs a new policy, restricted to the Assignment's
-- creator — same authorization boundary as every other write in this
-- feature set (assignments.created_by_user_id = auth.uid()).
create policy "promotion_assets_update_domain_policy_by_creator"
  on promotion_assets
  for update
  using (
    exists (
      select 1
      from promotions p
      join assignments a on a.id = p.assignment_id
      where p.id = promotion_assets.promotion_id
        and a.created_by_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from promotions p
      join assignments a on a.id = p.assignment_id
      where p.id = promotion_assets.promotion_id
        and a.created_by_user_id = auth.uid()
    )
  );
