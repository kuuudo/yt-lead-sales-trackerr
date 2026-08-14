begin;

drop policy if exists operator_read_branded_tracking_domains on public.branded_tracking_domains;

create policy operator_read_branded_tracking_domains
on public.branded_tracking_domains
for select
using (public.is_operator_for_org(organization_id));

commit;