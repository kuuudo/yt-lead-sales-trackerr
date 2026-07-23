CREATE OR REPLACE FUNCTION public.create_promotion(p_organization_id uuid, p_campaign_id uuid, p_asset_ids uuid[], p_assignment_collaborator_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_promotion_id uuid;
  v_assignment_id uuid;
  v_collaborator_user_id uuid;
  v_collaborator_status text;
  v_assignment_org uuid;
  v_campaign_org uuid;
  v_owner_user_id uuid;
  v_missing_assignment_assets uuid[];
  v_missing_org_assets uuid[];
begin
  -- ── Guard: asset list not empty ─────────────────────────────────────
  if p_asset_ids is null or array_length(p_asset_ids, 1) is null then
    raise exception 'create_promotion requires at least one asset_id';
  end if;

  -- ── Validation + derivation: assignment_collaborator path ───────────
  if p_assignment_collaborator_id is not null then

    if not exists (
      select 1 from assignment_collaborators
      where id = p_assignment_collaborator_id
    ) then
      raise exception 'assignment_collaborator_id % not found', p_assignment_collaborator_id;
    end if;

    select ac.user_id, ac.status, ac.assignment_id, a.organization_id
    into v_collaborator_user_id, v_collaborator_status, v_assignment_id, v_assignment_org
    from assignment_collaborators ac
    join assignments a on a.id = ac.assignment_id
    where ac.id = p_assignment_collaborator_id;

    if v_collaborator_user_id is distinct from auth.uid() then
      raise exception 'assignment_collaborator_id % does not belong to caller', p_assignment_collaborator_id;
    end if;

    if v_collaborator_status is distinct from 'active' then
      raise exception 'Collaborator status is ''%'', not active', v_collaborator_status;
    end if;

    if v_assignment_org is distinct from p_organization_id then
      raise exception 'Assignment % does not belong to organization %', v_assignment_id, p_organization_id;
    end if;

  else
    -- ── Validation: caller must be a member of the target organization ──
    if not exists (
      select 1 from organization_members
      where user_id = auth.uid() and organization_id = p_organization_id
    ) then
      raise exception 'Not authorized: caller is not a member of organization %', p_organization_id;
    end if;
  end if;

  -- ── Validation: campaign must belong to this organization ───────────
  select organization_id into v_campaign_org
  from campaigns where id = p_campaign_id;

  select owner_id
  into v_owner_user_id
  from organizations
  where id = p_organization_id;

  if v_owner_user_id is null then
  raise exception 'Organization % not found', p_organization_id;
  end if;

  if v_campaign_org is null then
    raise exception 'Campaign % not found', p_campaign_id;
  end if;

  if v_campaign_org is distinct from p_organization_id then
    raise exception 'Campaign % does not belong to organization %', p_campaign_id, p_organization_id;
  end if;

  -- ── Validation: eligibility ───────────────────────────────────────────
  -- Assignment-membership is now the sole eligibility rule for the
  -- collaborator path, per product decision: any Asset authorized into
  -- an Assignment is promotable, regardless of provenance.
  if p_assignment_collaborator_id is not null then

    select array_agg(a)
    into v_missing_assignment_assets
    from unnest(p_asset_ids) as a
    where not exists (
      select 1 from assignment_assets
      where assignment_id = v_assignment_id and asset_id = a
    );

    if v_missing_assignment_assets is not null
     and array_length(v_missing_assignment_assets, 1) > 0 then
      raise exception 'Asset(s) not authorized by this Assignment: %', v_missing_assignment_assets;
    end if;

  else
    -- Org-owner path: unchanged scope pending a future product decision —
    -- minimum integrity floor only (asset must belong to this organization).
    -- Deliberately NOT a provenance/campaign_assets check.
    select array_agg(a)
    into v_missing_org_assets
    from unnest(p_asset_ids) as a
    where not exists (
      select 1 from assets
      where id = a and organization_id = p_organization_id
    );

    if v_missing_org_assets is not null
     and array_length(v_missing_org_assets, 1) > 0 then
      raise exception 'Asset(s) do not belong to organization %: %', p_organization_id, v_missing_org_assets;
    end if;

  end if;

  -- ── Insert promotions row ────────────────────────────────────────────
  insert into promotions (
    organization_id,
    campaign_id,
    owner_user_id,
    assignment_id,
    assignment_collaborator_id,
    status
  )
  values (
    p_organization_id,
    p_campaign_id,
    v_owner_user_id,
    v_assignment_id,
    p_assignment_collaborator_id,
    'draft'
  )
  returning id into v_promotion_id;

  -- ── Insert promotion_assets rows — single multi-row insert ──────────
  insert into promotion_assets (promotion_id, asset_id)
  select v_promotion_id, a
  from unnest(p_asset_ids) as a;

  return v_promotion_id;
end;
$function$;
 