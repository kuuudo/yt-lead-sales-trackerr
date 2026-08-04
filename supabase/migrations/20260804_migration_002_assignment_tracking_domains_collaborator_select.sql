-- Additive migration for the Assignment Detail PR.
-- The base migration (migration_assignment_tracking_domains.sql) only
-- granted SELECT to the Assignment's creator. This PR's requirement is
-- for the accepted collaborator to read the same data on Assignment
-- Detail. Mirrors whatever existing policy already lets
-- assignment_collaborators read assignment_assets — same boundary,
-- no new permission concept, just extended to this table.

create policy "assignment_tracking_domains_select_by_collaborator"
  on assignment_tracking_domains
  for select
  using (
    exists (
      select 1 from assignment_collaborators c
      where c.assignment_id = assignment_tracking_domains.assignment_id
        and c.user_id = auth.uid()
        and c.status = 'active'
    )
  );
