-- Phase 2C — create_promotion collaborator-path eligibility update.
--
-- ONLY CHANGE: the collaborator path's asset eligibility check now also
-- excludes assets currently revoked for THIS SPECIFIC
-- assignment_collaborator_id (assignment_asset_access_states,
-- revoked_at is not null). Without this, a collaborator could start a
-- brand-new Promotion of an asset the Sponsor just revoked — Layer 2
-- would then only ever apply retroactively (blocking reads) and never
-- prospectively (blocking new promotions), which defeats the point of
-- having it.
--
-- Everything else in this function is BYTE-FOR-BYTE UNCHANGED from the
-- Phase 2A version: guard clauses, org-owner path, campaign validation,
-- owner_user_id derivation, the insert statements, error messages for
-- every other case. Only the collaborator-path missing-assets query
-- gained one additional NOT EXISTS condition.

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
  --
  -- PHASE 2C ADDITION: an asset also fails eligibility if it's currently
  -- revoked for THIS collaborator specifically (assignment_asset_access_states,
  -- scoped by assignment_collaborator_id — never assignment-wide, matching
  -- the locked per-(collaborator, asset) grain). A different collaborator
  -- on the same Assignment with the same asset still active is unaffected.
  if p_assignment_collaborator_id is not null then

    select array_agg(a)
    into v_missing_assignment_assets
    from unnest(p_asset_ids) as a
    where not exists (
      select 1 from assignment_assets
      where assignment_id = v_assignment_id and asset_id = a
    )
    or exists (
      select 1 from assignment_asset_access_states
      where assignment_collaborator_id = p_assignment_collaborator_id
        and asset_id = a
        and revoked_at is not null
    );

    if v_missing_assignment_assets is not null
     and array_length(v_missing_assignment_assets, 1) > 0 then
      raise exception 'Asset(s) not authorized, or access has been revoked, for this Assignment: %', v_missing_assignment_assets;
    end if;

  else
    -- Org-owner path: unchanged scope pending a future product decision —
    -- minimum integrity floor only (asset must belong to this organization).
    -- Deliberately NOT a provenance/campaign_assets check. No access-state
    -- check either — Phase 2C access states are scoped to
    -- assignment_collaborator_id and have no meaning on this path.
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
