ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS creative_creation_mode text NULL
    CHECK (
      creative_creation_mode IS NULL
      OR creative_creation_mode IN (
        'none',
        'campaign_asset_only',
        'campaign_links_and_assets'
      )
    );

    ALTER TABLE assignment_assets
  ADD COLUMN IF NOT EXISTS allow_marketer_domain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_sponsor_domain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_vstrk_domain boolean NOT NULL DEFAULT false;

  ALTER TABLE promotion_assets
  ADD COLUMN IF NOT EXISTS use_marketer_domain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selected_sponsor_domain_id uuid NULL,
  ADD COLUMN IF NOT EXISTS use_vstrk_domain boolean NOT NULL DEFAULT false;



  -- =============================================================================
-- Path B: create_promotion — per-asset actual usage (p_asset_usage jsonb)
-- =============================================================================
-- Live audit confirmed (2026-09-13):
--   * Single overload: create_promotion(uuid, uuid, uuid[], uuid)
--   * Owner: postgres, SECURITY DEFINER, search_path=public
--   * No pg_depend blockers
--   * EXECUTE: PUBLIC, postgres (WITH GRANT OPTION), anon, authenticated, service_role
--
-- Strategy: DROP exact 4-arg signature (NO CASCADE) → CREATE 5-arg with
-- p_asset_usage DEFAULT NULL → restore grants. No overload left behind.
--
-- DO NOT run until explicitly approved. Application files unchanged by this file.
-- =============================================================================

BEGIN;

-- Exact current production signature only. NO CASCADE.
DROP FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid);

CREATE FUNCTION public.create_promotion(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_asset_ids uuid[],
  p_assignment_collaborator_id uuid DEFAULT NULL::uuid,
  p_asset_usage jsonb DEFAULT NULL::jsonb
)
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
  v_usage_rec record;
  v_allow_marketer boolean;
  v_allow_sponsor boolean;
  v_allow_vstrk boolean;
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

  -- ── Validation: eligibility (Phase 2C — unchanged) ──────────────────
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

  -- ── Path B: validate p_asset_usage (collaborator path only) ─────────
  -- When p_asset_usage IS NULL: skip; insert uses table defaults.
  -- Org-owner path: ignore payload (same as NULL).
  if p_assignment_collaborator_id is not null
     and p_asset_usage is not null then

    -- Reject non-array or empty-object misuse is left to element parsing;
    -- require array elements with asset_id in p_asset_ids.
    if jsonb_typeof(p_asset_usage) is distinct from 'array' then
      raise exception 'p_asset_usage must be a JSON array';
    end if;

    -- Duplicate asset_id → exception (no LIMIT 1 masking)
    if exists (
      select 1
      from jsonb_array_elements(p_asset_usage) as elem
      group by (elem->>'asset_id')::uuid
      having count(*) > 1
    ) then
      raise exception 'p_asset_usage contains duplicate asset_id';
    end if;

    -- Every usage asset_id must be in p_asset_ids
    if exists (
      select 1
      from jsonb_array_elements(p_asset_usage) as elem
      where (elem->>'asset_id') is null
         or not ((elem->>'asset_id')::uuid = any (p_asset_ids))
    ) then
      raise exception 'p_asset_usage contains asset_id not in p_asset_ids';
    end if;

    for v_usage_rec in
      select
        (elem->>'asset_id')::uuid as asset_id,
        coalesce((elem->>'use_marketer_domain')::boolean, false) as use_marketer_domain,
        case
          when elem->>'selected_sponsor_domain_id' is null
            or elem->>'selected_sponsor_domain_id' = ''
            or elem->>'selected_sponsor_domain_id' = 'null'
          then null
          else (elem->>'selected_sponsor_domain_id')::uuid
        end as selected_sponsor_domain_id,
        coalesce((elem->>'use_vstrk_domain')::boolean, false) as use_vstrk_domain
      from jsonb_array_elements(p_asset_usage) as elem
    loop
      select
        aa.allow_marketer_domain,
        aa.allow_sponsor_domain,
        aa.allow_vstrk_domain
      into
        v_allow_marketer,
        v_allow_sponsor,
        v_allow_vstrk
      from assignment_assets aa
      where aa.assignment_id = v_assignment_id
        and aa.asset_id = v_usage_rec.asset_id;

      if not found then
        raise exception 'Usage asset % is not on assignment %', v_usage_rec.asset_id, v_assignment_id;
      end if;

      if v_usage_rec.use_marketer_domain and not coalesce(v_allow_marketer, false) then
        raise exception 'use_marketer_domain not allowed for asset % (assignment_assets.allow_marketer_domain=false)', v_usage_rec.asset_id;
      end if;

      if v_usage_rec.use_vstrk_domain and not coalesce(v_allow_vstrk, false) then
        raise exception 'use_vstrk_domain not allowed for asset % (assignment_assets.allow_vstrk_domain=false)', v_usage_rec.asset_id;
      end if;

      if v_usage_rec.selected_sponsor_domain_id is not null then
        if not coalesce(v_allow_sponsor, false) then
          raise exception 'selected_sponsor_domain_id not allowed for asset % (assignment_assets.allow_sponsor_domain=false)', v_usage_rec.asset_id;
        end if;

        if not exists (
          select 1 from assignment_tracking_domains atd
          where atd.assignment_id = v_assignment_id
            and atd.branded_tracking_domain_id = v_usage_rec.selected_sponsor_domain_id
        ) then
          raise exception 'selected_sponsor_domain_id % is not authorized on assignment %',
            v_usage_rec.selected_sponsor_domain_id, v_assignment_id;
        end if;

        if exists (
          select 1 from assignment_tracking_domain_access_states s
          where s.assignment_collaborator_id = p_assignment_collaborator_id
            and s.branded_tracking_domain_id = v_usage_rec.selected_sponsor_domain_id
            and s.revoked_at is not null
        ) then
          raise exception 'selected_sponsor_domain_id % is revoked for this collaborator',
            v_usage_rec.selected_sponsor_domain_id;
        end if;
      end if;
    end loop;
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

  -- ── Insert promotion_assets (single multi-row) ───────────────────────
  if p_assignment_collaborator_id is not null
     and p_asset_usage is not null then

    insert into promotion_assets (
      promotion_id,
      asset_id,
      use_marketer_domain,
      selected_sponsor_domain_id,
      use_vstrk_domain
    )
    select
      v_promotion_id,
      a,
      coalesce(u.use_marketer_domain, false),
      u.selected_sponsor_domain_id,
      coalesce(u.use_vstrk_domain, false)
    from unnest(p_asset_ids) as a
    left join lateral (
      select
        coalesce((elem->>'use_marketer_domain')::boolean, false) as use_marketer_domain,
        case
          when elem->>'selected_sponsor_domain_id' is null
            or elem->>'selected_sponsor_domain_id' = ''
            or elem->>'selected_sponsor_domain_id' = 'null'
          then null
          else (elem->>'selected_sponsor_domain_id')::uuid
        end as selected_sponsor_domain_id,
        coalesce((elem->>'use_vstrk_domain')::boolean, false) as use_vstrk_domain
      from jsonb_array_elements(p_asset_usage) as elem
      where (elem->>'asset_id')::uuid = a
    ) u on true;

  else
    -- p_asset_usage NULL or org-owner path: table defaults (false/null/false)
    insert into promotion_assets (promotion_id, asset_id)
    select v_promotion_id, a
    from unnest(p_asset_ids) as a;
  end if;

  return v_promotion_id;
end;
$function$;

-- Restore exact production EXECUTE grants (from live audit).
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO postgres WITH GRANT OPTION;
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO service_role;

COMMIT;

-- =============================================================================
-- AFTER the transaction succeeds, reload PostgREST schema (run separately):
--
--   NOTIFY pgrst, 'reload schema';
--
-- Or: Supabase Dashboard → Project Settings → API → Reload schema
-- =============================================================================

-- Path B correction: selected_sponsor_domain_id must belong to the
-- Assignment's Sponsor organization (verified branded_tracking_domains),
-- NOT assignment_tracking_domains (Create Assignment no longer writes those).
-- Same 5-argument signature → CREATE OR REPLACE (no DROP / no overload).

CREATE OR REPLACE FUNCTION public.create_promotion(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_asset_ids uuid[],
  p_assignment_collaborator_id uuid DEFAULT NULL::uuid,
  p_asset_usage jsonb DEFAULT NULL::jsonb
)
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
  v_usage_rec record;
  v_allow_marketer boolean;
  v_allow_sponsor boolean;
  v_allow_vstrk boolean;
  v_domain_org uuid;
  v_domain_status text;
begin
  if p_asset_ids is null or array_length(p_asset_ids, 1) is null then
    raise exception 'create_promotion requires at least one asset_id';
  end if;

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
    if not exists (
      select 1 from organization_members
      where user_id = auth.uid() and organization_id = p_organization_id
    ) then
      raise exception 'Not authorized: caller is not a member of organization %', p_organization_id;
    end if;
  end if;

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

  -- Path B usage validation (collaborator + payload)
  if p_assignment_collaborator_id is not null
     and p_asset_usage is not null then

    if jsonb_typeof(p_asset_usage) is distinct from 'array' then
      raise exception 'p_asset_usage must be a JSON array';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_asset_usage) as elem
      group by (elem->>'asset_id')::uuid
      having count(*) > 1
    ) then
      raise exception 'p_asset_usage contains duplicate asset_id';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_asset_usage) as elem
      where (elem->>'asset_id') is null
         or not ((elem->>'asset_id')::uuid = any (p_asset_ids))
    ) then
      raise exception 'p_asset_usage contains asset_id not in p_asset_ids';
    end if;

    for v_usage_rec in
      select
        (elem->>'asset_id')::uuid as asset_id,
        coalesce((elem->>'use_marketer_domain')::boolean, false) as use_marketer_domain,
        case
          when elem->>'selected_sponsor_domain_id' is null
            or elem->>'selected_sponsor_domain_id' = ''
            or elem->>'selected_sponsor_domain_id' = 'null'
          then null
          else (elem->>'selected_sponsor_domain_id')::uuid
        end as selected_sponsor_domain_id,
        coalesce((elem->>'use_vstrk_domain')::boolean, false) as use_vstrk_domain
      from jsonb_array_elements(p_asset_usage) as elem
    loop
      select
        aa.allow_marketer_domain,
        aa.allow_sponsor_domain,
        aa.allow_vstrk_domain
      into
        v_allow_marketer,
        v_allow_sponsor,
        v_allow_vstrk
      from assignment_assets aa
      where aa.assignment_id = v_assignment_id
        and aa.asset_id = v_usage_rec.asset_id;

      if not found then
        raise exception 'Usage asset % is not on assignment %', v_usage_rec.asset_id, v_assignment_id;
      end if;

      if v_usage_rec.use_marketer_domain and not coalesce(v_allow_marketer, false) then
        raise exception 'use_marketer_domain not allowed for asset % (assignment_assets.allow_marketer_domain=false)', v_usage_rec.asset_id;
      end if;

      if v_usage_rec.use_vstrk_domain and not coalesce(v_allow_vstrk, false) then
        raise exception 'use_vstrk_domain not allowed for asset % (assignment_assets.allow_vstrk_domain=false)', v_usage_rec.asset_id;
      end if;

      if v_usage_rec.selected_sponsor_domain_id is not null then
        if not coalesce(v_allow_sponsor, false) then
          raise exception 'selected_sponsor_domain_id not allowed for asset % (assignment_assets.allow_sponsor_domain=false)', v_usage_rec.asset_id;
        end if;

        -- Sponsor org ownership + verified (NOT assignment_tracking_domains)
        select btd.organization_id, btd.status
        into v_domain_org, v_domain_status
        from branded_tracking_domains btd
        where btd.id = v_usage_rec.selected_sponsor_domain_id;

        if not found then
          raise exception 'selected_sponsor_domain_id % does not exist', v_usage_rec.selected_sponsor_domain_id;
        end if;

        if v_domain_org is distinct from v_assignment_org then
          raise exception 'selected_sponsor_domain_id % does not belong to Sponsor organization %',
            v_usage_rec.selected_sponsor_domain_id, v_assignment_org;
        end if;

        if v_domain_status is distinct from 'verified' then
          raise exception 'selected_sponsor_domain_id % is not verified (status=%)',
            v_usage_rec.selected_sponsor_domain_id, v_domain_status;
        end if;
      end if;
    end loop;
  end if;

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

  if p_assignment_collaborator_id is not null
     and p_asset_usage is not null then

    insert into promotion_assets (
      promotion_id,
      asset_id,
      use_marketer_domain,
      selected_sponsor_domain_id,
      use_vstrk_domain
    )
    select
      v_promotion_id,
      a,
      coalesce(u.use_marketer_domain, false),
      u.selected_sponsor_domain_id,
      coalesce(u.use_vstrk_domain, false)
    from unnest(p_asset_ids) as a
    left join lateral (
      select
        coalesce((elem->>'use_marketer_domain')::boolean, false) as use_marketer_domain,
        case
          when elem->>'selected_sponsor_domain_id' is null
            or elem->>'selected_sponsor_domain_id' = ''
            or elem->>'selected_sponsor_domain_id' = 'null'
          then null
          else (elem->>'selected_sponsor_domain_id')::uuid
        end as selected_sponsor_domain_id,
        coalesce((elem->>'use_vstrk_domain')::boolean, false) as use_vstrk_domain
      from jsonb_array_elements(p_asset_usage) as elem
      where (elem->>'asset_id')::uuid = a
    ) u on true;

  else
    insert into promotion_assets (promotion_id, asset_id)
    select v_promotion_id, a
    from unnest(p_asset_ids) as a;
  end if;

  return v_promotion_id;
end;
$function$;

-- Grants unchanged (same signature) — re-assert for safety
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO postgres WITH GRANT OPTION;
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_promotion(uuid, uuid, uuid[], uuid, jsonb) TO service_role;


ALTER TABLE public.assignment_assets
  ADD COLUMN IF NOT EXISTS selected_sponsor_domain_id uuid NULL;

  ALTER TABLE public.assignment_assets
  ADD COLUMN IF NOT EXISTS selected_sponsor_domain_id uuid NULL;

  ALTER TABLE public.promotion_assets
  ADD COLUMN IF NOT EXISTS selected_marketer_domain_id uuid NULL;


  BEGIN;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS creative_campaign_id uuid NULL;

-- Optional FK: normal campaign must exist; ON DELETE SET NULL keeps assignment if campaign removed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assignments_creative_campaign_id_fkey'
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_creative_campaign_id_fkey
      FOREIGN KEY (creative_campaign_id)
      REFERENCES public.campaigns (id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.assignments.creative_campaign_id IS
  'Sponsor normal campaign allowed for Creative Content when creative_creation_mode = campaign_links_and_assets. NULL for none/asset_only. NEVER store ONLY PROMOTE ASSET here.';

COMMIT;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS asset_scope text NULL;

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_asset_scope_check;

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_asset_scope_check
  CHECK (
    asset_scope IS NULL
    OR asset_scope IN ('promotion_only', 'allow_additional')
  );

  ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS link_type_tracking_domains jsonb NULL;

  -- Per campaign-link-type tracking domain (uuid → branded_tracking_domains.id).
-- NULL = use default vstrk.com host at generate time.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS landing_page_tracking_domain_id uuid NULL,
  ADD COLUMN IF NOT EXISTS newsletter_tracking_domain_id uuid NULL,
  ADD COLUMN IF NOT EXISTS consultation_tracking_domain_id uuid NULL,
  ADD COLUMN IF NOT EXISTS sales_call_tracking_domain_id uuid NULL;

-- Optional FKs (skip if branded_tracking_domains not in public or name differs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'branded_tracking_domains'
  ) THEN
    ALTER TABLE public.campaigns
      DROP CONSTRAINT IF EXISTS campaigns_landing_page_tracking_domain_id_fkey,
      DROP CONSTRAINT IF EXISTS campaigns_newsletter_tracking_domain_id_fkey,
      DROP CONSTRAINT IF EXISTS campaigns_consultation_tracking_domain_id_fkey,
      DROP CONSTRAINT IF EXISTS campaigns_sales_call_tracking_domain_id_fkey;

    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_landing_page_tracking_domain_id_fkey
        FOREIGN KEY (landing_page_tracking_domain_id) REFERENCES public.branded_tracking_domains(id) ON DELETE SET NULL,
      ADD CONSTRAINT campaigns_newsletter_tracking_domain_id_fkey
        FOREIGN KEY (newsletter_tracking_domain_id) REFERENCES public.branded_tracking_domains(id) ON DELETE SET NULL,
      ADD CONSTRAINT campaigns_consultation_tracking_domain_id_fkey
        FOREIGN KEY (consultation_tracking_domain_id) REFERENCES public.branded_tracking_domains(id) ON DELETE SET NULL,
      ADD CONSTRAINT campaigns_sales_call_tracking_domain_id_fkey
        FOREIGN KEY (sales_call_tracking_domain_id) REFERENCES public.branded_tracking_domains(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.campaigns.landing_page_tracking_domain_id IS 'Tracking domain for landing_page / direct purchase redirects; NULL = vstrk default';
COMMENT ON COLUMN public.campaigns.newsletter_tracking_domain_id IS 'Tracking domain for newsletter redirects; NULL = vstrk default';
COMMENT ON COLUMN public.campaigns.consultation_tracking_domain_id IS 'Tracking domain for consultation redirects; NULL = vstrk default';
COMMENT ON COLUMN public.campaigns.sales_call_tracking_domain_id IS 'Tracking domain for sales_call redirects; NULL = vstrk default';