begin;

create or replace function public.admin_set_customer_status(
  p_customer_id uuid,
  p_status      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust public.customers%rowtype;
begin
  if not public.team_is_admin() then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  if p_status not in ('active', 'inactive') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  select * into v_cust
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'customer_not_found');
  end if;

  if v_cust.status = p_status then
    return jsonb_build_object(
      'success', true,
      'customer_id', p_customer_id,
      'status', p_status,
      'unchanged', true
    );
  end if;

  update public.customers
  set status = p_status
  where id = p_customer_id;

  -- No team_set_access. Team entitlement is live from customers.status + customer_members.

  return jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'status', p_status,
    'unchanged', false
  );
end;
$$;

revoke all on function public.admin_set_customer_status(uuid, text) from public;
revoke execute on function public.admin_set_customer_status(uuid, text) from anon;
grant execute on function public.admin_set_customer_status(uuid, text) to authenticated;

commit;


begin;

create or replace function public.team_has_active_membership()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customer_members cm
    join public.customers c on c.id = cm.customer_id
    where cm.user_id = auth.uid()
      and cm.status = 'active'
      and c.status = 'active'
  );
$$;

revoke all on function public.team_has_active_membership() from public;
grant execute on function public.team_has_active_membership() to authenticated;

commit;