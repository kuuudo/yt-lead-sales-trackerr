-- assignment_tracking_domains
-- Required for createAssignment.ts's new domainIds insert to succeed.
-- Not a new architectural decision — this is the table already locked
-- in the Design Phase discussion (assignment-level, no snapshot table,
-- deletion never touches redirect_links since redirect_links.tracking_domain_id
-- is its own independent, permanent snapshot).

create table if not exists assignment_tracking_domains (
  assignment_id               uuid not null references assignments(id) on delete cascade,
  branded_tracking_domain_id  uuid not null references branded_tracking_domains(id) on delete cascade,
  created_at                  timestamptz not null default now(),
  primary key (assignment_id, branded_tracking_domain_id)
);

alter table assignment_tracking_domains enable row level security;

-- Same authorization boundary as assignment_assets: only the Assignment's
-- creator may attach/detach Tracking Domains. No new permission concept.
create policy "assignment_tracking_domains_insert_by_creator"
  on assignment_tracking_domains
  for insert
  with check (
    exists (
      select 1 from assignments a
      where a.id = assignment_tracking_domains.assignment_id
        and a.created_by_user_id = auth.uid()
    )
  );

create policy "assignment_tracking_domains_select_by_creator"
  on assignment_tracking_domains
  for select
  using (
    exists (
      select 1 from assignments a
      where a.id = assignment_tracking_domains.assignment_id
        and a.created_by_user_id = auth.uid()
    )
  );

-- Delete policy included for completeness even though this PR (Create
-- Assignment only) never calls it — Promotion Detail's future
-- "Stop Sharing" action will need it, no reason to add it in a second
-- migration when the shape is already known.
create policy "assignment_tracking_domains_delete_by_creator"
  on assignment_tracking_domains
  for delete
  using (
    exists (
      select 1 from assignments a
      where a.id = assignment_tracking_domains.assignment_id
        and a.created_by_user_id = auth.uid()
    )
  );
