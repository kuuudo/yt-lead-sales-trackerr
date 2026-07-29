create or replace function public.get_authorized_provenance_campaign(
  p_asset_id uuid,
  p_promotion_id uuid,
  p_campaign_id uuid
)
returns setof campaigns
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Gate 1: 這個 asset 必須真的屬於這個 promotion
  -- (跟 resolvePromotionContextForAsset.ts 的 Step 4 是同一個檢查)
  if not exists (
    select 1 from promotion_assets
    where asset_id = p_asset_id and promotion_id = p_promotion_id
  ) then
    return;
  end if;

  -- Gate 2: 呼叫者必須對這個 promotion 有合法關係——
  -- 要嘛是 Sponsor(owner_user_id),要嘛是啟動這個 promotion 的 Collaborator
  if not exists (
    select 1
    from promotions p
    left join assignment_collaborators ac on ac.id = p.assignment_collaborator_id
    where p.id = p_promotion_id
      and (p.owner_user_id = auth.uid() or ac.user_id = auth.uid())
  ) then
    return;
  end if;

  -- 兩關都過了，才回傳這個 asset 的 provenance campaign
  return query
    select * from campaigns where id = p_campaign_id;
end;
$$;

revoke all on function public.get_authorized_provenance_campaign(uuid, uuid, uuid) from public;
grant execute on function public.get_authorized_provenance_campaign(uuid, uuid, uuid) to authenticated;