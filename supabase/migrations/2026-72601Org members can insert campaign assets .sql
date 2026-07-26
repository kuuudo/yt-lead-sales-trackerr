create policy "Org members can insert campaign_assets"
on public.campaign_assets
for insert
to public
with check (
  campaign_id in (
    select campaigns.id
    from campaigns
    where campaigns.organization_id in (
      select organization_members.organization_id
      from organization_members
      where organization_members.user_id = auth.uid()
    )
  )
);