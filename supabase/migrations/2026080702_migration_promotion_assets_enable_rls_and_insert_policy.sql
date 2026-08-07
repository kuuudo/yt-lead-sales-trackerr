-- Bug fix, not new architecture. promotion_assets was created with an
-- UPDATE policy (allow_collaborator_domains PR) but RLS was never
-- actually enabled on the table — that policy has been a no-op since
-- deployment. Fixing that gap here, plus adding the INSERT policy this
-- PR's Add Asset feature needs, same authorization boundary.

alter table promotion_assets enable row level security;

-- Same boundary as promotion_assets_update_domain_policy_by_creator,
-- reused verbatim, not reinvented. Deliberately does NOT check
-- assignment_assets — ownership is proven via assets.organization_id
-- matching the promotion's own organization_id, which is true for BOTH
-- My Asset and Assigned Asset (Design Lock: an Assignment can only ever
-- reference its own organization's assets), and false for any Shared
-- Asset. This is the correct, minimal check — not a workaround.
create policy "promotion_assets_insert_by_creator"
  on promotion_assets
  for insert
  with check (
    exists (
      select 1
      from promotions p
      join assignments a on a.id = p.assignment_id
      where p.id = promotion_assets.promotion_id
        and a.created_by_user_id = auth.uid()
    )
    and exists (
      select 1
      from promotions p
      join assets ast on ast.organization_id = p.organization_id
      where p.id = promotion_assets.promotion_id
        and ast.id = promotion_assets.asset_id
    )
  );