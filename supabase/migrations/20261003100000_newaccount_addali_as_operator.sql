create or replace function public.add_foundation_operator_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id <> 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid then
    begin
      insert into public.organization_members (organization_id, user_id, role)
      values (new.id, 'cd180432-44c5-4a20-b778-66b7753191f0'::uuid, 'member')
      on conflict do nothing;
    exception when others then
      raise warning 'add_foundation_operator_member failed for org %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_add_foundation_operator_member on public.organizations;

create trigger trg_add_foundation_operator_member
after insert on public.organizations
for each row execute function public.add_foundation_operator_member();