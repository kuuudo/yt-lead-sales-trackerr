alter table assignment_assets enable row level security;

create policy "assignment_assets_select_by_creator"
  on assignment_assets
  for select
  using (
    exists (
      select 1 from assignments a
      where a.id = assignment_assets.assignment_id
        and a.created_by_user_id = auth.uid()
    )
  );

create policy "assignment_assets_insert_by_creator"
  on assignment_assets
  for insert
  with check (
    exists (
      select 1 from assignments a
      where a.id = assignment_assets.assignment_id
        and a.created_by_user_id = auth.uid()
    )
  );