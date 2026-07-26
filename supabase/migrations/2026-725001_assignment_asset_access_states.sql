-- Phase 2C — Asset-level Access Control
--
-- Grain: (assignment_collaborator_id, asset_id) — deliberately NOT
-- assignment-wide. Two collaborators on the same Assignment can have
-- independent access to the same asset (WebMood: Asset C revoked, John:
-- Asset C still active). This is the locked decision — do not collapse
-- to a single assignment_asset_id scope.
--
-- No assignment_id column: always derivable via
-- assignment_collaborator_id -> assignment_collaborators.assignment_id.
-- Adding it would be denormalized convenience only, not load-bearing —
-- omitted per the locked schema.
--
-- Semantics match every other *_user_states / access-state table built
-- so far: absence of a row = active (default). A row is only ever
-- created the first time someone revokes access — restoring just sets
-- revoked_at back to null, the row is never deleted.
--
-- Does NOT touch assignment_assets, promotion_assets, assets,
-- promotions, or assignment_collaborators. This table only ever records
-- "does this collaborator currently have access to this asset."

create table assignment_asset_access_states (
  id                          uuid primary key default gen_random_uuid(),

  assignment_collaborator_id  uuid not null
    references assignment_collaborators(id),

  asset_id                    uuid not null
    references assets(id),

  revoked_at                  timestamptz null,

  created_at                  timestamptz not null default now(),

  unique (assignment_collaborator_id, asset_id)
);

-- Enable Row Level Security
alter table assignment_asset_access_states
enable row level security;

-- The Sponsor (Assignment creator) can view access states for
-- collaborators on Assignments they created.
create policy "Sponsor can view access states on own assignments"
on assignment_asset_access_states
for select
using (
  exists (
    select 1
    from assignment_collaborators ac
    join assignments a on a.id = ac.assignment_id
    where ac.id = assignment_asset_access_states.assignment_collaborator_id
      and a.created_by_user_id = auth.uid()
  )
);

-- The affected collaborator can view their own access states — read
-- only, so they can eventually see why an asset is unavailable to them.
-- They cannot write (see below); this is a display convenience, not a
-- permission grant.
create policy "Collaborator can view own access states"
on assignment_asset_access_states
for select
using (
  exists (
    select 1
    from assignment_collaborators ac
    where ac.id = assignment_asset_access_states.assignment_collaborator_id
      and ac.user_id = auth.uid()
  )
);

-- No INSERT/UPDATE/DELETE policies are defined here on purpose.
-- Writes go exclusively through the two SECURITY DEFINER RPCs below
-- (revoke_assignment_asset_access / restore_assignment_asset_access),
-- which perform their own created_by_user_id authorization check and
-- bypass RLS by design — same pattern as remove_assignment_collaborator
-- / restore_assignment_collaborator. Leaving no client-writable policy
-- here is a deliberate defense-in-depth backstop, not an oversight.
