-- Migration: Close collaborator read-path RLS gap
--
-- Root cause: assignment_collaborators and assignment_assets have RLS
-- enabled but zero SELECT policies (confirmed via
-- `select * from pg_policies where tablename in (...)` returning no rows).
-- This breaks the EXISTS subquery inside the already-working
-- "Assignment collaborators can view assigned assets" policy on assets/
-- videos/campaign_element_assets — those policies reference
-- assignment_assets and assignment_collaborators, but a collaborator has
-- no RLS permission to read either table in the first place, so the
-- subquery silently evaluates to zero rows and the outer table's row is
-- invisible even though it exists.
--
-- asset_resources has no collaborator-aware policy at all yet — only
-- organization-membership policies — so Resource Assets (Type 3) would
-- fail the same way even after the two policies above are added.
--
-- All three policies below are additive (PERMISSIVE, OR'd with existing
-- policies) and scoped strictly to active assignment_collaborators rows.
-- They do not touch organization_members, createAssignment.ts,
-- acceptInvitation.ts, or any campaign logic.

-- 1. assignment_collaborators: a collaborator can see their own row.
-- Needed because every other collaborator-aware policy joins through
-- assignment_collaborators on ac.user_id = auth.uid() — without this,
-- that join can never resolve from the collaborator's own session.
create policy "Collaborators can view their own collaborator row"
on public.assignment_collaborators
for select
to public
using (
  user_id = auth.uid()
);

-- 2. assignment_assets: an active collaborator can see which assets
-- belong to their assignment. Needed for the same reason — the assets/
-- videos/campaign_element_assets policies all join through
-- assignment_assets, which currently has no SELECT policy at all.
create policy "Collaborators can view assigned assets"
on public.assignment_assets
for select
to public
using (
  exists (
    select 1
    from assignment_collaborators ac
    where ac.assignment_id = assignment_assets.assignment_id
      and ac.user_id = auth.uid()
      and ac.status = 'active'
  )
);

-- 3. asset_resources: an active collaborator can see resource metadata
-- (title, url, thumbnail, resource_type) for a Resource Asset that is
-- part of their assignment. Same pattern already proven on assets/videos/
-- campaign_element_assets — this is the missing fourth table for Type 3
-- assets specifically.
create policy "Assignment collaborators can view assigned asset resources"
on public.asset_resources
for select
to public
using (
  exists (
    select 1
    from assignment_assets aa
    join assignment_collaborators ac
      on ac.assignment_id = aa.assignment_id
    where aa.asset_id = asset_resources.asset_id
      and ac.user_id = auth.uid()
      and ac.status = 'active'
  )
);